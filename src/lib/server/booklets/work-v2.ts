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
  "story-planner": {
    concept: { book: ["concept"] },
    outline: { book: ["outline"] },
    cast: { book: ["roster"], character: ["description"] },
    locations: { book: ["roster"], location: ["description"] },
  },
  manuscript: {
    write: { book: ["manuscript"] },
    reconcile_characters: { character: ["description"] },
    reconcile_locations: { location: ["description"] },
  },
  "art-director": {
    style: { book: ["style"] },
    sample_spec: { "style-sample": ["image-spec"] },
    character_spec: { character: ["image-spec"] },
    location_spec: { location: ["image-spec"] },
  },
  "page-composer": {
    paginate: { book: ["book-layout"] },
    compose: { page: ["page-spec"] },
  },
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
  mutationSchema
    .extend({ fence: z.number().int().nonnegative().safe() })
    .parse(mutation);
  if (mutation.holderId !== jobId || containsPrivate(raw))
    throw bookletConflict(
      "Private bindings or a foreign Run cannot register child work.",
    );
  const value = registration.parse(raw);
  const request = value.childRequest;
  if (Buffer.byteLength(JSON.stringify(request)) > 256 * 1024)
    throw bookletConflict("Child request exceeds its accepted capacity.");
  const supported = operations[request.service] as Record<
    string,
    Readonly<Record<string, readonly string[]>>
  >;
  if (!Object.hasOwn(supported, request.operation))
    throw bookletConflict("Unsupported child operation.");
  const responsibilities = supported[request.operation];
  if (
    new Set(request.items.map((item) => item.itemId)).size !==
    request.items.length
  )
    throw bookletConflict("Duplicate child item identity.");
  for (const item of request.items) {
    const selected = item.targetIds ?? (item.targetId ? [item.targetId] : []);
    if (
      request.intent === "revise" &&
      (!selected.length || !item.baseline || !item.feedback)
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
  const repo = bookletRepositoryV2(db, actor, undefined, {
    atomicMutations: true,
  });
  const p = await repo.getProduction(productionId);
  if (p.lifecycleState !== "in-progress")
    throw bookletConflict("Creative work requires an admitted production.");
  const targetSubjects = new Set<string>();
  let allowLocalSubjects = false;
  for (const target of value.targets) {
    const subject = p.subjects.find((subject) =>
      subject.artifacts.some((artifact) => artifact.id === target),
    );
    const artifact = subject?.artifacts.find(
      (artifact) => artifact.id === target,
    );
    if (
      !subject ||
      !artifact ||
      !responsibilities[subject.kind]?.includes(artifact.kind)
    )
      throw bookletConflict(
        "Creative target must identify an artifact responsibility for the selected operation.",
      );
    targetSubjects.add(subject.id);
    if (request.intent === "create" && artifact.kind === "roster")
      allowLocalSubjects = true;
  }
  const existingIds = new Set(
    p.subjects.flatMap((subject) => [
      subject.id,
      ...subject.artifacts.map((artifact) => artifact.id),
    ]),
  );
  for (const item of request.items) {
    // Native pack nodes compare proposal.subjectId with these child selectors.
    // Accounting targets remain artifact IDs, never interchangeable aliases.
    const selected = item.targetIds ?? (item.targetId ? [item.targetId] : []);
    if (
      selected.some(
        (subjectId) =>
          !targetSubjects.has(subjectId) &&
          !(allowLocalSubjects && !existingIds.has(subjectId)),
      )
    )
      throw bookletConflict(
        "Child subject escapes the registered artifact scope.",
      );
  }
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
