import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import {
  bookletContentV2Schema,
  bookletSourceV2Schema,
} from "../../../project/booklets/contracts-v2";
import { bookletRepositoryV2 } from "./repository-v2";
import { workRegistrationV2Schema } from "./documents-v2";
import { bookletConflict } from "./context";
import { id, mutationSchema, type Mutation } from "./documents";

// Only the currently consumed creative-text boundary. Image preparation/generation
// and independently observed review scopes have their own registration checks.
const operations = {
  "story-planner": ["concept", "outline", "cast", "locations"],
  manuscript: ["write", "reconcile_characters", "reconcile_locations"],
  "art-director": ["style", "sample_spec", "character_spec", "location_spec"],
  "page-composer": ["paginate", "compose"],
} as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z
  .array(id)
  .refine((values) => new Set(values).size === values.length);
const childRequest = z.strictObject({
  contractVersion: z.literal(2),
  invocationId: id,
  callId: id,
  service: z.enum([
    "story-planner",
    "manuscript",
    "art-director",
    "page-composer",
  ]),
  operation: id,
  intent: z.enum(["create", "revise"]),
  items: z
    .array(
      z.strictObject({
        itemId: id,
        input: z.record(z.string(), z.json()),
        targetId: id.optional(),
        targetIds: ids.optional(),
        baseline: z.json().optional(),
        feedback: z.json().optional(),
      }),
    )
    .min(1)
    .max(16),
  sources: z.array(
    bookletSourceV2Schema.extend({ content: bookletContentV2Schema }),
  ),
  references: z.array(
    z.strictObject({
      assetId: id,
      sha256: hash,
      bytes: z
        .number()
        .int()
        .positive()
        .max(8 * 1024 * 1024),
      nativeFileId: id.optional(),
      url: z.string().max(4096).optional(),
    }),
  ),
  constraints: z.record(z.string(), z.json()),
});
const registration = z.strictObject({
  childRequest,
  requestHash: hash,
  targets: ids.min(1),
  retryOf: id.nullable().default(null),
  correction: workRegistrationV2Schema.shape.correction,
});
function containsPrivate(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivate);
  return (
    value !== null &&
    typeof value === "object" &&
    Object.entries(value).some(
      ([key, value]) =>
        ["runContext", "credentials", "authorization"].includes(key) ||
        containsPrivate(value),
    )
  );
}

/** Validate the actual child payload; caller supplies authenticated actor, Run and
 * mutation fence. This registers an intent only, never dispatch authority. */
export async function registerBookletCreativeWorkV2(
  db: Db,
  actor: CreditActor,
  productionId: string,
  jobId: string,
  mutation: Mutation,
  raw: unknown,
) {
  mutationSchema.parse(mutation);
  if (mutation.holderId !== jobId || containsPrivate(raw))
    throw bookletConflict(
      "Private bindings or a foreign Run cannot register child work.",
    );
  const value = registration.parse(raw);
  const request = value.childRequest;
  if (Buffer.byteLength(JSON.stringify(request)) > 256 * 1024)
    throw bookletConflict("Child request exceeds its accepted capacity.");
  if (
    !(operations[request.service] as readonly string[]).includes(
      request.operation,
    )
  )
    throw bookletConflict("Unsupported child operation.");
  if (
    new Set(request.items.map((item) => item.itemId)).size !==
    request.items.length
  )
    throw bookletConflict("Duplicate child item identity.");
  for (const item of request.items) {
    const selected = [
      ...(item.targetIds ?? []),
      ...(item.targetId ? [item.targetId] : []),
    ];
    if (selected.some((target) => !value.targets.includes(target)))
      throw bookletConflict("Child target escapes registered work scope.");
    if (
      request.intent === "revise" &&
      (!item.targetId || !item.baseline || !item.feedback)
    )
      throw bookletConflict(
        "Revision requires its selected target, baseline and feedback.",
      );
  }
  for (const source of request.sources)
    if (fingerprint(source.content) !== source.contentHash)
      throw bookletConflict("Child source content changed.");
  const meaningful = {
    ...request,
    references: request.references.map(({ assetId, sha256, bytes }) => ({
      assetId,
      sha256,
      bytes,
    })),
  };
  if (fingerprint(meaningful) !== value.requestHash)
    throw bookletConflict(
      "Child request hash differs from its actual payload.",
    );
  const repo = bookletRepositoryV2(db, actor);
  const p = await repo.getProduction(productionId);
  if (p.lifecycleState !== "in-progress")
    throw bookletConflict("Creative work requires an admitted production.");
  const actionKey = fingerprint({
    productionId,
    funding: p.revisionChargeId ?? "platform",
    targets: [...value.targets].sort(),
    request: {
      contractVersion: request.contractVersion,
      service: request.service,
      operation: request.operation,
      intent: request.intent,
      items: request.items.map((item) =>
        Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== "itemId"),
        ),
      ),
      sources: meaningful.sources,
      references: meaningful.references,
      constraints: meaningful.constraints,
    },
  });
  return repo.registerWork(productionId, {
    ...mutation,
    runId: jobId,
    callId: request.callId,
    service: request.service,
    operation: request.operation,
    requestHash: value.requestHash,
    actionKey,
    category: "paidLlm",
    targetIds: value.targets,
    sources: request.sources.map(({ artifactId, revisionId, contentHash }) => ({
      artifactId,
      revisionId,
      contentHash,
    })),
    retryOf: value.retryOf,
    correction: value.correction,
  });
}
