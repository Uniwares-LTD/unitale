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
import {
  workRegistrationV2Schema,
  reviewInputV2Schema,
  type WorkV2,
} from "./documents-v2";
import { bookletConflict } from "./context";
import { id, mutationSchema, type Mutation } from "./documents";
import { requireCorrectionFindingV2 } from "./guards";
import { bookletAssessmentV2Schema } from "../../../project/booklets/contracts-v2";

const imageTargets = {
  "style-sample": ["reference"],
  character: ["reference"],
  location: ["reference"],
  page: ["page-image"],
} as const;
// Creative responsibilities; Reviewer operations use explicit immutable scopes below.
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
  "image-executor": {
    prepare: imageTargets,
    generate: imageTargets,
  },
} as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z
  .array(id)
  .refine((values) => new Set(values).size === values.length);
// Actual child/source-tool boundary. Bound the whole native-image transfer, not
// product size; Manager must repartition requests that exceed this carrier.
export const bookletReferencesV2Schema = z.array(z.strictObject({
  assetId: id,
  sha256: hash,
  bytes: z.number().int().positive().max(8 * 1024 * 1024),
  nativeFileId: id.optional(),
  url: z.string().max(4096).optional(),
})).max(16).refine((refs) => refs.reduce((sum, ref) => sum + ref.bytes, 0) <= 8 * 1024 * 1024,
  "Original transfer exceeds 8 MiB; repartition without resizing.");
const childRequest = z.strictObject({
  contractVersion: z.literal(2),
  invocationId: id,
  callId: id,
  service: z.enum([
    "story-planner",
    "manuscript",
    "art-director",
    "page-composer",
    "quality-reviewer",
    "image-executor",
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
  references: bookletReferencesV2Schema,
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
export async function registerBookletWorkV2(
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
  const review = request.service === "quality-reviewer";
  const prepare = request.service === "image-executor" && request.operation === "prepare";
  const generate = request.service === "image-executor" && request.operation === "generate";
  const supported = (
    review ? {} : operations[request.service as keyof typeof operations]
  ) as Record<string, Readonly<Record<string, readonly string[]>>>;
  if (
    review
      ? ![
          "text",
          "specification",
          "image_request",
          "image",
          "whole_book",
          "correction",
        ].includes(request.operation)
      : !Object.hasOwn(supported, request.operation)
  )
    throw bookletConflict("Unsupported child operation.");
  const responsibilities = supported[request.operation];
  if (prepare) {
    if (request.items.length !== 1 || value.targets.length !== 1)
      throw bookletConflict("Prepare requires one image target.");
    const data = request.items[0].input;
    const specification = bookletContentV2Schema.parse(data.specification);
    const style = bookletContentV2Schema.parse(data.style);
    if (style.kind !== "style" ||
      (specification.kind !== "image-spec" && specification.kind !== "page-spec") ||
      ![specification, style].every((content) => request.sources.some((source) =>
        source.contentHash === fingerprint(content))))
      throw bookletConflict("Prepare requires exact selected image specification and style sources.");
  }
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
  const sourceKeys = request.sources.map((source) =>
    review
      ? fingerprint([source.artifactId, source.revisionId, source.contentHash])
      : source.artifactId,
  );
  if (new Set(sourceKeys).size !== request.sources.length)
    throw bookletConflict(
      review
        ? "Duplicate immutable review source."
        : "Select one immutable revision per source artifact.",
    );
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
    throw bookletConflict("Child work requires an admitted production.");
  async function requirePreparation(raw: unknown, targets: string[]) {
    const prepared = z.object({ callId: id, requestHash: hash }).catchall(z.json()).parse(raw);
    const { requestHash, ...body } = prepared;
    const preparation = await db.collection<WorkV2>("bookletWork").findOne({
      ownerId: actor.uid, productionId: p._id, callId: prepared.callId,
      service: "image-executor", operation: "prepare", category: "nonPaid", status: "succeeded",
    });
    const retained = z.object({ items: z.array(z.object({ prepared: z.json() })).length(1) })
      .safeParse(preparation?.resultPayload);
    if (fingerprint(body) !== requestHash || !preparation?.resultObservation || !retained.success ||
      fingerprint(retained.data.items[0].prepared) !== fingerprint(prepared) ||
      fingerprint([...preparation.targetIds].sort()) !== fingerprint([...targets].sort()) ||
      fingerprint(prepared.sources) !== fingerprint(request.sources.map(({ artifactId, revisionId, contentHash }) =>
        ({ artifactId, revisionId, contentHash }))) ||
      fingerprint(prepared.references) !== fingerprint(meaningful.references))
      throw bookletConflict("Use the exact retained preparation, target, sources and ordered originals.");
    return prepared;
  }
  if (generate) {
    if (request.items.length !== 1 || value.targets.length !== 1)
      throw bookletConflict("Generate requires one image target.");
    const prepared = await requirePreparation(request.items[0].input.prepared, value.targets);
    if (prepared.callId === request.callId)
      throw bookletConflict("Generate requires a distinct call identity from Prepare.");
  }
  const targetSubjects = new Set<string>();
  let allowLocalSubjects = false;
  const reviewScopes = review
    ? request.items.map((item) => reviewInputV2Schema.parse(item.input))
    : [];
  for (const ref of request.references) {
    const original = await db.collection("bookletAssets").findOne({
      _id: ref.assetId as never,
      ownerId: actor.uid,
      productionId: p._id,
      state: "ready",
      originalAssetId: null,
      sha256: ref.sha256,
      bytes: ref.bytes,
    });
    if (!original)
      throw bookletConflict(
        "Original identity differs from owned bytes.",
      );
  }
  if (review) {
    const requested = [
      ...new Set(reviewScopes.flatMap((scope) => scope.targetIds)),
    ].sort();
    if (fingerprint(requested) !== fingerprint([...value.targets].sort()))
      throw bookletConflict("Review scope differs from registered targets.");
    for (const scope of reviewScopes) {
      if (
        scope.referencePositions.some(
          (position) => position >= request.references.length,
        )
      )
        throw bookletConflict("Review reference position is unavailable.");
      if (
        ["image", "whole_book"].includes(request.operation) &&
        !scope.referencePositions.length
      )
        throw bookletConflict(
          "Actual original pixels are required for this review.",
        );
      if (request.operation === "image_request") {
        const prepared = await requirePreparation(scope.prepared, scope.targetIds);
        if (prepared.requestHash !== scope.targetHash)
          throw bookletConflict("Review requires the exact prepared request.");
      } else if (request.operation === "whole_book") {
        const manifest = await db.collection("bookletRevisions").findOne({
          ownerId: actor.uid,
          productionId: p._id,
          kind: "book-manifest",
          contentHash: scope.targetHash,
        });
        const pages = z
          .object({ pages: z.array(z.object({ pageId: id, assetId: id })) })
          .parse(manifest?.content).pages;
        if (
          !scope.pageIds?.length ||
          scope.pageIds.length > 4 ||
          fingerprint(scope.pageIds) !== fingerprint(scope.targetIds) ||
          scope.pageIds.some(
            (pageId) => !pages.some((page) => page.pageId === pageId),
          ) ||
          scope.pageIds.some(
            (pageId) =>
              !scope.referencePositions.some(
                (position) =>
                  request.references[position].assetId ===
                  pages.find((page) => page.pageId === pageId)!.assetId,
              ),
          )
        )
          throw bookletConflict(
            "Review window must identify its actual manifest pages and originals.",
          );
      } else {
        const selected = request.sources.filter(
          (source) =>
            scope.targetIds.includes(source.artifactId) ||
            p.subjects.some(
              (subject) =>
                scope.targetIds.includes(subject.id) &&
                subject.artifacts.some(
                  (artifact) => artifact.id === source.artifactId,
                ),
            ),
        );
        const exact = selected.filter(
          (source) => source.contentHash === scope.targetHash,
        );
        const covers = (sources: typeof selected) =>
          scope.targetIds.every((target) =>
            sources.some(
              (source) =>
                source.artifactId === target ||
                p.subjects.some(
                  (subject) =>
                    subject.id === target &&
                    subject.artifacts.some(
                      (artifact) => artifact.id === source.artifactId,
                    ),
                ),
            ),
          );
        const identities = selected.map(
          ({ artifactId, revisionId, contentHash }) => ({
            artifactId,
            revisionId,
            contentHash,
          }),
        );
        if (
          !selected.length ||
          !covers(selected) ||
          (!(exact.length === 1 && covers(exact)) &&
            fingerprint(identities) !== scope.targetHash)
        )
          throw bookletConflict(
            "Review hash must identify its selected immutable target or ordered target group.",
          );
        if (
          request.operation === "image" &&
          selected.some((source) => {
            if (
              source.content.kind !== "reference" &&
              source.content.kind !== "page-image"
            )
              return true;
            const assetId = source.content.asset.assetId;
            return !scope.referencePositions.some(
              (position) => request.references[position].assetId === assetId,
            );
          })
        )
          throw bookletConflict("Review omitted its target original.");
        if (
          request.operation === "correction" &&
          (!scope.before ||
            !scope.after ||
            !scope.findings?.length ||
            !request.sources.some(
              (source) => fingerprint(scope.before) === source.contentHash,
            ) ||
            !selected.some(
              (source) => fingerprint(scope.after) === source.contentHash,
            ) ||
            (scope.visual && scope.referencePositions.length < 2))
        )
          throw bookletConflict(
            "Correction review needs exact before/after sources and original findings.",
          );
        if (request.operation === "correction") {
          const before = request.sources.filter((source) => source.contentHash === fingerprint(scope.before));
          for (const finding of bookletAssessmentV2Schema.shape.findings.parse(scope.findings)) {
            const original = await requireCorrectionFindingV2(db, p, finding.id, scope.targetIds, before.map(
              ({ artifactId, revisionId, contentHash }) => ({ artifactId, revisionId, contentHash }),
            ));
            if (fingerprint(finding) !== fingerprint(original.finding))
              throw bookletConflict("Correction review changed its original confirmed finding.");
          }
        }
      }
    }
  }
  for (const target of review ? [] : value.targets) {
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
    if (prepare && request.items[0].input.imageKind !== subject.kind)
      throw bookletConflict("Prepared image kind differs from its registered target.");
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
      !review &&
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
    requestPayload: meaningful,
    actionKey,
    category: prepare ? "nonPaid" : generate ? "paidImage" : "paidLlm",
    targetIds: value.targets,
    sources: request.sources.map(({ artifactId, revisionId, contentHash }) => ({
      artifactId,
      revisionId,
      contentHash,
    })),
    retryOf: value.retryOf,
    correction: value.correction,
    reviewScope: review
      ? {
          targetHash: reviewScopes[0].targetHash,
          referencePositions: reviewScopes[0].referencePositions,
          assetIds: reviewScopes[0].referencePositions.map(
            (position) => request.references[position].assetId,
          ),
          continuityPairs: reviewScopes[0].continuityPairs,
        }
      : null,
  });
}
