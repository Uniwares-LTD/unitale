import "server-only";
import type { RevisionDocument } from "./documents";
import { randomUUID } from "node:crypto";
import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { fingerprint } from "../foundation/canonical";
import type { CreditActor } from "../store/credit-types";
import type { AiJob } from "../ai/jobs";
import type { Decision } from "../runs/service";
import { parseUiForm, uiPayloadSchema } from "../../contracts/runs";
import {
  qualityReviewSchema,
  type QualityReview,
} from "../../../project/booklets/contracts";
import { readEvidence } from "../execution/measurements";
import type { ExecutionMeasurement } from "../../contracts/execution-measurements";
import { bookletMedia } from "./media";
import { resolveReusedSource } from "./guards";
import {
  startConsumption,
  continueConsumption,
  quoteRevision,
  startRevision,
  finishConsumptionWorkflow,
} from "../commerce/orders";
import {
  id,
  mutationSchema,
  type Mutation,
  type ProductionDocument,
} from "./documents";
import { bookletContext, bookletConflict, bookletMissing } from "./context";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const targets = z
  .array(z.strictObject({ artifactId: id, revisionId: id, sha256: hash }))
  .min(1)
  .max(100)
  .refine((v) => new Set(v.map((t) => t.artifactId)).size === v.length);
export const reviewRequestSchema = z.strictObject({
  _id: z.string().uuid(),
  documentVersion: z.literal(1),
  ownerId: z.string(),
  productionId: id,
  runId: id,
  targets,
  contentHash: hash,
  presentationHash: hash,
  createdAt: z.date(),
  appliedDecisionId: id.nullable(),
  sourceProductionId: id.nullable(),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export const generationSchema = z.strictObject({
  _id: id,
  documentVersion: z.literal(1),
  ownerId: z.string(),
  productionId: id,
  runId: id,
  artifactId: id,
  sources: targets,
  state: z.enum(["authorized", "succeeded", "failed", "unknown"]),
  createdAt: z.date(),
  revisionId: id.nullable(),
  repairRoot: id.nullable(),
  revisionAllocationId: id.nullable().default(null),
});
export type Generation = z.infer<typeof generationSchema>;
export const revisionRequestSchema = z.strictObject({
  requestId: id,
  expectedVersion: z.number().int().positive(),
  category: z.enum(["story", "style", "reference", "page"]),
  subjects: z.array(id).max(100),
  inputHash: hash,
});
export type RevisionRequest = z.infer<typeof revisionRequestSchema>;

export async function createBookletServiceIndexes(db: Db) {
  await db
    .collection("bookletReuseAcceptances")
    .createIndex(
      { ownerId: 1, productionId: 1, revisionId: 1 },
      { unique: true },
    );
  await db
    .collection("bookletReviewRequests")
    .createIndex({ ownerId: 1, productionId: 1, runId: 1 });
  await db
    .collection("bookletGenerations")
    .createIndex({ ownerId: 1, productionId: 1, artifactId: 1 });
  await db
    .collection("bookletServiceWrites")
    .createIndex({ ownerId: 1, productionId: 1 });
  await db
    .collection("bookletQualityReviews")
    .createIndex(
      { ownerId: 1, productionId: 1, "value.target.revisionId": 1 },
      { unique: true },
    );
}

export function validateBookletRevisionScope(
  p: Pick<ProductionDocument, "version" | "stageLocks"> & {
    subjects: readonly { id: string; kind: string }[];
  },
  value: RevisionRequest,
) {
  if (p.version !== value.expectedVersion)
    throw bookletConflict("Production changed; refresh the revision quote.");
  const lock = value.category === "reference" ? "references" : value.category;
  if (lock !== "page" && p.stageLocks[lock])
    throw bookletConflict(
      "This revision stage is locked. Start a new paid production.",
    );
  if (value.category === "story") {
    if (value.subjects.length)
      throw bookletConflict("Story revisions consume one round.");
    return;
  }
  if (
    !value.subjects.length ||
    new Set(value.subjects).size !== value.subjects.length
  )
    throw bookletConflict("Select distinct revision subjects.");
  const allowed =
    value.category === "style"
      ? ["style-sample"]
      : value.category === "reference"
        ? ["character", "location"]
        : ["page"];
  for (const subjectId of value.subjects)
    if (!p.subjects.some((s) => s.id === subjectId && allowed.includes(s.kind)))
      throw bookletMissing();
  if (
    value.category === "style" &&
    fingerprint([...value.subjects].sort()) !==
      fingerprint(
        p.subjects
          .filter((s) => s.kind === "style-sample")
          .map((s) => s.id)
          .sort(),
      )
  )
    throw bookletConflict(
      "Shared style revisions must quote every affected style sample.",
    );
}

// This is the one admission route for booklet revision prices. The generic
// commerce library owns balances and allocations; these callbacks own book rules.
export function bookletLifecycle(
  db: Db,
  actor: CreditActor,
  now = () => new Date(),
) {
  const c = bookletContext(db, actor, now);
  const requests = db.collection<ReviewRequest>("bookletReviewRequests");
  const generations = db.collection<Generation>("bookletGenerations");
  async function run(
    p: ProductionDocument,
    runId: string,
    session: ClientSession,
  ) {
    const order = await c.entitled(p, session);
    const job = await db
      .collection<AiJob>("aiJobs")
      .findOne({ _id: runId, uid: actor.uid }, { session });
    if (
      !job ||
      job.consumption?.orderId !== p.orderId ||
      job.consumption.workflowId !== order.activeWorkflow ||
      job.run?.target?.adapter !== "booklet" ||
      job.run.target.id !== p._id ||
      job.run.answerer ||
      !["running", "paused"].includes(job.status)
    )
      throw bookletConflict(
        "An active owned booklet orchestrator Run is required.",
      );
    return job;
  }
  async function current(
    p: ProductionDocument,
    list: z.infer<typeof targets>,
    session: ClientSession,
    accepted: boolean,
  ) {
    const checked = new Set<string>();
    async function dependencies(row: Awaited<ReturnType<typeof c.revision>>) {
      if (checked.has(row._id)) return;
      if (checked.size >= 1000)
        throw bookletConflict(
          "Source dependency graph exceeds the validation bound.",
        );
      checked.add(row._id);
      for (const source of row.sources) {
        const local = await db
          .collection<RevisionDocument>("bookletRevisions")
          .findOne(
            {
              _id: source.revisionId,
              productionId: p._id,
              ownerId: actor.uid,
            },
            { session },
          );
        if (!local) {
          await resolveReusedSource(db, p, source.revisionId, session);
          continue;
        }
        if (source.artifactId === row.artifactId) continue;
        const dependency = await c.revision(p, source.revisionId, session);
        const entry = c.artifact(p, source.artifactId).artifact;
        if (
          dependency.contentHash !== source.sha256 ||
          entry.currentRevisionId !== dependency._id ||
          (accepted && entry.acceptedRevisionId !== dependency._id)
        )
          throw bookletConflict("Source dependency is stale or unaccepted.");
        await dependencies(dependency);
      }
    }
    for (const t of list) {
      const { artifact } = c.artifact(p, t.artifactId);
      const row = await c.revision(p, t.revisionId, session);
      if (
        row.artifactId !== artifact.id ||
        row.contentHash !== t.sha256 ||
        artifact.currentRevisionId !== row._id ||
        (accepted && artifact.acceptedRevisionId !== row._id)
      )
        throw bookletConflict("Source revision is stale or unaccepted.");
      await dependencies(row);
    }
  }
  async function quality(
    p: ProductionDocument,
    revisionId: string,
    session: ClientSession,
  ) {
    const revision = await c.revision(p, revisionId, session);
    if (!["reference", "page-image"].includes(revision.kind)) return;
    const review = await db
      .collection<{
        _id: string;
        ownerId: string;
        productionId: string;
        value: QualityReview;
      }>("bookletQualityReviews")
      .findOne(
        {
          ownerId: actor.uid,
          productionId: p._id,
          "value.target.revisionId": revisionId,
        },
        { session },
      );
    if (
      !review ||
      review.value.disposition !== "pass" ||
      review.value.target.sha256 !== revision.contentHash
    )
      throw bookletConflict("Required visual quality review has not passed.");
  }

  return {
    async inspectGeneration(productionId: string, operationId: string) {
      id.parse(operationId);
      return c.transaction(async (s) => {
        await c.owned(productionId, s);
        const operation = await generations.findOne(
          { _id: operationId, productionId, ownerId: actor.uid },
          { session: s },
        );
        if (!operation) throw bookletMissing();
        return {
          ...generationSchema.parse(operation),
          createdAt: operation.createdAt.toISOString(),
        };
      });
    },
    async complete(
      productionId: string,
      raw: Mutation & { runId: string; manifestRevisionId: string },
    ) {
      const value = mutationSchema
        .extend({ runId: id, manifestRevisionId: id })
        .parse(raw);
      // Verify complete original bytes before the short metadata transaction.
      const draft = await c.transaction(async (s) =>
        c.revision(await c.owned(productionId, s), value.manifestRevisionId, s),
      );
      if (draft.content.kind !== "book-manifest")
        throw bookletConflict("Completion requires a book manifest revision.");
      for (const page of draft.content.pages) {
        const original = await bookletMedia(db, actor).read(
          productionId,
          page.asset.assetId,
        );
        if (
          original.asset.sha256 !== page.asset.sha256 ||
          original.asset.originalAssetId
        )
          throw bookletConflict("Manifest must identify original page bytes.");
      }
      return c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        return c.write(
          p,
          value.key,
          { method: "complete", value },
          s,
          async () => {
            c.fence(p, value);
            await run(p, value.runId, s);
            await current(
              p,
              [
                {
                  artifactId: draft.artifactId,
                  revisionId: draft._id,
                  sha256: draft.contentHash,
                },
              ],
              s,
              true,
            );
            if (draft.content.kind !== "book-manifest")
              throw bookletConflict("Invalid manifest.");
            await current(p, draft.content.acceptedSources, s, true);
            if (
              await generations.countDocuments(
                { productionId, state: { $in: ["authorized", "unknown"] } },
                { session: s },
              )
            )
              throw bookletConflict(
                "Reconcile incomplete generation before completion.",
              );
            for (const page of draft.content.pages) {
              await current(p, [page.revision], s, true);
              await quality(p, page.revision.revisionId, s);
              const review = await db
                .collection("bookletQualityReviews")
                .findOne(
                  {
                    ownerId: actor.uid,
                    productionId,
                    "value.id": page.qualityReviewId,
                    "value.target.revisionId": page.revision.revisionId,
                    "value.disposition": "pass",
                  },
                  { session: s },
                );
              const decision = await requests.findOne(
                {
                  ownerId: actor.uid,
                  productionId,
                  appliedDecisionId: page.approvalDecisionId,
                  targets: {
                    $elemMatch: {
                      revisionId: page.revision.revisionId,
                      sha256: page.revision.sha256,
                    },
                  },
                },
                { session: s },
              );
              if (!review || !decision)
                throw bookletConflict(
                  "Manifest approval or quality evidence differs from the accepted page.",
                );
            }
            p.lifecycleState = "completed";
            p.currentManifestRevisionId = draft._id;
            await c.save(p, p.version, s, value);
            return { version: p.version, manifestRevisionId: draft._id };
          },
        );
      });
    },
    async start(productionId: string) {
      const p = await c.transaction((s) => c.owned(productionId, s));
      return startConsumption(
        db,
        actor,
        p.orderId,
        "booklet-initial",
        async (session, order) => {
          const live = await c.owned(productionId, session);
          if (live.lifecycleState !== "draft")
            throw bookletConflict("Production already started.");
          live.lifecycleState = "in-progress";
          live.expiresAt =
            order.value.terms.entitlementDays === null
              ? null
              : new Date(
                  now().getTime() +
                    order.value.terms.entitlementDays * 86400000,
                );
          await c.save(live, live.version, session);
        },
      );
    },
    async continue(productionId: string, requestId: string) {
      id.parse(requestId);
      const p = await c.transaction((s) => c.owned(productionId, s));
      return continueConsumption(
        db,
        actor,
        p.orderId,
        requestId,
        fingerprint([productionId, requestId]),
        async (session) => {
          const live = await c.owned(productionId, session);
          await c.entitled(live, session);
          if (live.lifecycleState !== "in-progress")
            throw bookletConflict("Only unfinished production can continue.");
          // A continuation may reconcile/attach prior work. Generation admission
          // still rejects an unresolved operation; continuing never replays it.
          await c.save(live, live.version, session);
        },
      );
    },
    async finishRun(productionId: string, workflowId: string) {
      const p = await c.transaction((s) => c.owned(productionId, s));
      return finishConsumptionWorkflow(db, actor, p.orderId, workflowId);
    },
    async quoteRevision(productionId: string, raw: RevisionRequest) {
      const value = revisionRequestSchema.parse(raw);
      const p = await c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        await c.entitled(p, s);
        validateBookletRevisionScope(p, value);
        return p;
      });
      const { expectedVersion, ...request } = value;
      return quoteRevision(db, actor, p.orderId, {
        ...request,
        inputHash: fingerprint([request.inputHash, expectedVersion]),
      });
    },
    async startRevision(
      productionId: string,
      raw: RevisionRequest,
      quoteHash: string,
      credits: number,
    ) {
      const value = revisionRequestSchema.parse(raw);
      const p = await c.transaction((s) => c.owned(productionId, s));
      const { expectedVersion, ...request } = value;
      return startRevision(
        db,
        actor,
        p.orderId,
        {
          ...request,
          inputHash: fingerprint([request.inputHash, expectedVersion]),
        },
        quoteHash,
        credits,
        async (session) => {
          const live = await c.owned(productionId, session);
          await c.entitled(live, session);
          validateBookletRevisionScope(live, value);
          // Persist the entitlement origin separately from the active Run's
          // workflow. Continuations retain it; only a new revision replaces it.
          live.revisionChargeId = fingerprint([
            live.orderId,
            "revision",
            request.requestId,
          ]);
          // Completed manifests remain immutable. A page revision reopens only
          // working state; existing shares continue to point to the old manifest.
          live.lifecycleState = "in-progress";
          await c.save(live, live.version, session);
        },
      );
    },
    async requestReview(
      productionId: string,
      raw: Mutation & {
        runId: string;
        targets: z.infer<typeof targets>;
        reuse?: boolean;
      },
    ) {
      const value = mutationSchema
        .extend({ runId: id, targets, reuse: z.boolean().default(false) })
        .parse(raw);
      return c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        return c.write(
          p,
          value.key,
          { method: "requestReview", value },
          s,
          async () => {
            c.fence(p, value);
            await run(p, value.runId, s);
            const source =
              value.reuse && p.sourceProductionId
                ? await c.owned(p.sourceProductionId, s)
                : p;
            if (value.reuse && source._id === p._id)
              throw bookletConflict(
                "This production has no source production.",
              );
            await current(source, value.targets, s, value.reuse);
            const requestId = randomUUID();
            const approval = {
              artifactId: requestId,
              revision: 1,
              contentHash: fingerprint(value.targets),
              action: "approve",
              requireHuman: true,
            };
            const cards = [];
            for (const target of value.targets) {
              const revision = await c.revision(source, target.revisionId, s);
              cards.push({
                id: `revision-${cards.length}`,
                content: {
                  type: "summary",
                  version: 1,
                  data: {
                    title: `${revision.kind}: ${revision.subjectId}`,
                    body: JSON.stringify({
                      revisionId: revision._id,
                      sha256: revision.contentHash,
                      content: revision.content,
                    }),
                  },
                },
              });
            }
            const ui = uiPayloadSchema.parse({ version: 1, approval, cards });
            const row = reviewRequestSchema.parse({
              _id: requestId,
              documentVersion: 1,
              ownerId: actor.uid,
              productionId,
              runId: value.runId,
              targets: value.targets,
              contentHash: fingerprint(value.targets),
              presentationHash: fingerprint(ui),
              createdAt: now(),
              appliedDecisionId: null,
              sourceProductionId: value.reuse ? source._id : null,
            });
            await requests.insertOne(row, { session: s });
            await c.save(p, p.version, s, value);
            return {
              id: row._id,
              version: p.version,
              approval,
              formContent:
                "```unibase-ui\n" +
                JSON.stringify(ui) +
                "\n```\n{{#$output.response#}}",
            };
          },
        );
      });
    },
    async applyDecision(
      productionId: string,
      raw: Mutation & { requestId: string; decisionId: string },
    ) {
      const value = mutationSchema
        .extend({ requestId: z.string().uuid(), decisionId: id })
        .parse(raw);
      return c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        return c.write(
          p,
          value.key,
          { method: "applyDecision", value },
          s,
          async () => {
            c.fence(p, value);
            const request = await requests.findOne(
              { _id: value.requestId, ownerId: actor.uid, productionId },
              { session: s },
            );
            if (!request) throw bookletMissing();
            await run(p, request.runId, s);
            const source = request.sourceProductionId
              ? await c.owned(request.sourceProductionId, s)
              : p;
            await current(
              source,
              request.targets,
              s,
              !!request.sourceProductionId,
            );
            const decision = await db
              .collection<Decision>("runDecisions")
              .findOne(
                {
                  _id: value.decisionId,
                  uid: actor.uid,
                  jobId: request.runId,
                  status: "submitted",
                  "answerSource.type": "user",
                },
                { session: s },
              );
            if (
              !decision?.approval ||
              decision.approval.artifactId !== request._id ||
              decision.approval.revision !== 1 ||
              decision.approval.contentHash !== request.contentHash ||
              !decision.approval.requireHuman ||
              decision.approval.action !== "approve" ||
              (decision.confirmedAction ?? decision.intent?.action) !==
                "approve"
            )
              throw bookletConflict(
                "A submitted human approval of these exact revisions is required.",
              );
            if (
              !decision.form ||
              fingerprint(parseUiForm(decision.form.form_content)) !==
                request.presentationHash
            )
              throw bookletConflict(
                "The presented content differs from the review request.",
              );
            if (
              request.appliedDecisionId &&
              request.appliedDecisionId !== decision._id
            )
              throw bookletConflict("Review request was already applied.");
            for (const t of request.targets) {
              await quality(source, t.revisionId, s);
              if (request.sourceProductionId) {
                await db
                  .collection<{
                    _id: string;
                    ownerId: string;
                    productionId: string;
                    sourceProductionId: string;
                    revisionId: string;
                    requestId: string;
                    runId: string;
                  }>("bookletReuseAcceptances")
                  .updateOne(
                    { _id: fingerprint([p._id, t.revisionId]) },
                    {
                      $setOnInsert: {
                        ownerId: actor.uid,
                        productionId: p._id,
                        sourceProductionId: source._id,
                        revisionId: t.revisionId,
                        requestId: request._id,
                        runId: request.runId,
                      },
                    },
                    { upsert: true, session: s },
                  );
              } else
                c.artifact(p, t.artifactId).artifact.acceptedRevisionId =
                  t.revisionId;
            }
            await requests.updateOne(
              { _id: request._id },
              { $set: { appliedDecisionId: decision._id } },
              { session: s },
            );
            await c.save(p, p.version, s, value);
            return { version: p.version, requestId: request._id };
          },
        );
      });
    },
    async authorizeGeneration(
      productionId: string,
      raw: Mutation & {
        operationId: string;
        runId: string;
        artifactId: string;
        sources: z.infer<typeof targets>;
        repairRevisionId?: string;
      },
    ) {
      const value = mutationSchema
        .extend({
          operationId: id,
          runId: id,
          artifactId: id,
          sources: targets,
          repairRevisionId: id.optional(),
        })
        .parse(raw);
      return c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        return c.write(
          p,
          value.key,
          { method: "authorizeGeneration", value },
          s,
          async () => {
            c.fence(p, value);
            await run(p, value.runId, s);
            await current(p, value.sources, s, true);
            const { subject, artifact } = c.artifact(p, value.artifactId);
            if (!["reference", "page-image"].includes(artifact.kind))
              throw bookletConflict(
                "Generation target must be an image responsibility.",
              );
            if (
              (subject.kind === "style-sample" && p.stageLocks.style) ||
              (["character", "location"].includes(subject.kind) &&
                p.stageLocks.references)
            )
              throw bookletConflict("This reference stage is locked.");
            await c.entitled(p, s);
            let repairRoot: string | null = null;
            let revisionAllocationId: string | null = null;
            if (value.repairRevisionId) {
              if (artifact.currentRevisionId !== value.repairRevisionId)
                throw bookletConflict("Repair target changed.");
              const failed = await db
                .collection("bookletQualityReviews")
                .findOne(
                  {
                    ownerId: actor.uid,
                    productionId,
                    "value.target.revisionId": value.repairRevisionId,
                    "value.disposition": { $in: ["repair", "blocked"] },
                  },
                  { session: s },
                );
              const previous = await generations.findOne(
                { productionId, revisionId: value.repairRevisionId },
                { session: s },
              );
              if (!failed || !previous)
                throw bookletConflict(
                  "Repair requires a failed quality review.",
                );
              repairRoot = previous.repairRoot ?? previous._id;
              if (
                (await generations.countDocuments(
                  { productionId, repairRoot },
                  { session: s },
                )) >= p.creativeConfigSnapshot.repairLimitPerOutput
              )
                throw bookletConflict(
                  "Automatic repair budget exhausted; administrative resolution is required.",
                );
            } else {
              const category =
                subject.kind === "style-sample"
                  ? "style"
                  : subject.kind === "page"
                    ? "page"
                    : "reference";
              const allocation = await db
                .collection<{ _id: string }>("consumptionAllocations")
                .findOne(
                  {
                    orderId: p.orderId,
                    chargeId: p.revisionChargeId,
                    category,
                    subjectId: subject.id,
                    revoked: false,
                  },
                  { session: s },
                );
              if (artifact.currentRevisionId && !allocation)
                throw bookletConflict(
                  "An allocated revision is required before regenerating this image.",
                );
              if (allocation) {
                revisionAllocationId = allocation._id;
                // Failed provider attempts may retry after reconciliation. Once
                // an output exists, replacements must use its bounded repairs.
                if (
                  await generations.findOne(
                    {
                      productionId,
                      artifactId: artifact.id,
                      revisionAllocationId,
                      state: { $ne: "failed" },
                    },
                    { session: s },
                  )
                )
                  throw bookletConflict(
                    "Revision allocation already has an output or unresolved generation; use its bounded repair path.",
                  );
              }
            }
            const sourceRows = [];
            for (const source of value.sources) {
              sourceRows.push(await c.revision(p, source.revisionId, s));
              await quality(p, source.revisionId, s);
            }
            if (!sourceRows.some((r) => r.kind === "manuscript"))
              throw bookletConflict("Approved manuscript is required.");
            const relevant = new Set([
              subject.id,
              ...p.subjects
                .filter((s) => s.kind === "book" || s.kind === "style-sample")
                .map((s) => s.id),
            ]);
            if (subject.kind === "page") {
              const plan = sourceRows.find(
                (r) =>
                  r.subjectId === subject.id && r.content.kind === "page-plan",
              );
              if (!plan || plan.content.kind !== "page-plan")
                throw bookletConflict("Approved page plan is required.");
              for (const panel of plan.content.panels)
                for (const subjectId of [
                  ...panel.characterIds,
                  ...panel.locationIds,
                ]) {
                  relevant.add(subjectId);
                  if (
                    !sourceRows.some(
                      (r) =>
                        r.kind === "reference" && r.subjectId === subjectId,
                    )
                  )
                    throw bookletConflict(
                      "Page plan is missing an approved subject reference.",
                    );
                }
            } else if (
              subject.kind !== "style-sample" &&
              !sourceRows.some(
                (r) => r.subjectId === subject.id && r.kind === "description",
              )
            )
              throw bookletConflict(
                "Approved subject description is required.",
              );
            if (sourceRows.some((r) => !relevant.has(r.subjectId)))
              throw bookletConflict(
                "Source is unrelated to this generation target.",
              );
            if (
              subject.kind === "style-sample" &&
              !sourceRows.some((r) => r.kind === "style")
            )
              throw bookletConflict("Approved style definition is required.");
            if (
              subject.kind !== "style-sample" &&
              !sourceRows.some(
                (r) =>
                  r.kind === "reference" &&
                  p.subjects.some(
                    (s) => s.id === r.subjectId && s.kind === "style-sample",
                  ),
              )
            )
              throw bookletConflict("Approved style reference is required.");
            if (
              (await generations.countDocuments(
                { productionId },
                { session: s },
              )) >= p.creativeConfigSnapshot.execution.maxImageCalls
            )
              throw bookletConflict(
                "Package image execution budget exhausted.",
              );
            if (
              await generations.findOne(
                {
                  productionId,
                  artifactId: artifact.id,
                  state: { $in: ["authorized", "unknown"] },
                },
                { session: s },
              )
            )
              throw bookletConflict(
                "Reconcile the existing generation; do not replay it.",
              );
            const locks: (keyof ProductionDocument["stageLocks"])[] =
              subject.kind === "style-sample"
                ? ["story"]
                : subject.kind === "page"
                  ? ["story", "style", "references"]
                  : ["story", "style"];
            for (const stage of locks)
              p.stageLocks[stage] ??= {
                operationId: value.operationId,
                lockedAt: now(),
                sourceRevisionIds: value.sources.map((t) => t.revisionId),
              };
            const row = generationSchema.parse({
              _id: value.operationId,
              documentVersion: 1,
              ownerId: actor.uid,
              productionId,
              runId: value.runId,
              artifactId: value.artifactId,
              sources: value.sources,
              state: "authorized",
              createdAt: now(),
              revisionId: null,
              repairRoot,
              revisionAllocationId,
            });
            await generations.insertOne(row, { session: s });
            await c.save(p, p.version, s, value);
            return { operationId: row._id, version: p.version };
          },
        );
      });
    },
    async reconcileGeneration(
      productionId: string,
      operationId: string,
      measurementId: string,
    ) {
      id.parse(operationId);
      id.parse(measurementId);
      return c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        const operation = await generations.findOne(
          { _id: operationId, productionId, ownerId: actor.uid },
          { session: s },
        );
        if (!operation) throw bookletMissing();
        const attempt = await db.collection<AiJob>("aiJobs").findOne(
          {
            _id: operation.runId,
            uid: actor.uid,
            "run.target.id": productionId,
            "consumption.orderId": p.orderId,
          },
          { session: s },
        );
        if (!attempt?.run) throw bookletMissing();
        const measurement = await db
          .collection<{
            _id: string;
            uid: string;
            value: ExecutionMeasurement;
          }>("executionMeasurements")
          .findOne(
            {
              uid: actor.uid,
              "value.id": measurementId,
              "value.operationId": operationId,
              "value.runId": attempt.run.logicalId,
              "value.scope": "call",
              "value.authority": { $in: ["adapter", "provider"] },
            },
            { session: s },
          );
        if (!measurement || measurement.value.outcome === "succeeded")
          throw bookletConflict(
            "Successful generation must retain and attach its original; a verified failure/unknown receipt is required here.",
          );
        if (
          measurement.value.outcome === "failed" &&
          !measurement.value.evidence.some((e) => e.kind === "provider-receipt")
        )
          throw bookletConflict(
            "Failure reconciliation needs a provider receipt.",
          );
        if (operation.state === "succeeded")
          throw bookletConflict(
            "An attached generation cannot be reclassified.",
          );
        if (
          operation.state === "failed" &&
          measurement.value.outcome === "unknown"
        )
          throw bookletConflict(
            "Resolved outcomes cannot become unknown again.",
          );
        await generations.updateOne(
          { _id: operationId },
          { $set: { state: measurement.value.outcome } },
          { session: s },
        );
        await c.save(p, p.version, s);
      });
    },
  };
}

// policy is trusted deployment configuration, never an orchestrator-supplied
// override. T19 supplies its published reviewer identity. Evidence/measurements
// are retained by provider adapters before this service records the disposition.
export async function recordBookletQuality(
  db: Db,
  actor: CreditActor,
  policy: QualityReview["policy"],
  evidenceId: string,
  measurementId: string,
) {
  const c = bookletContext(db, actor);
  await c.transaction(async () => undefined);
  const value = qualityReviewSchema.parse(
    await readEvidence(db, actor.uid, evidenceId),
  );
  const original = await bookletMedia(db, actor).read(
    value.productionId,
    value.asset.assetId,
  );
  if (
    original.asset.sha256 !== value.asset.sha256 ||
    original.asset.originalAssetId
  )
    throw bookletConflict("Quality review requires verified original bytes.");
  if (
    fingerprint(value.policy) !== fingerprint(policy) ||
    !value.evidenceIds.includes(evidenceId)
  )
    throw bookletConflict("Reviewer policy or evidence identity differs.");
  return c.transaction(async (s) => {
    const p = await c.owned(value.productionId, s);
    const revision = await c.revision(p, value.target.revisionId, s);
    if (
      revision.artifactId !== value.target.artifactId ||
      revision.contentHash !== value.target.sha256 ||
      fingerprint(revision.sources) !== fingerprint(value.sources) ||
      !revision.assets.some((a) => fingerprint(a) === fingerprint(value.asset))
    )
      throw bookletConflict(
        "Reviewer inputs do not identify the retained output and sources.",
      );
    const measurement = await db
      .collection<{ _id: string; uid: string; value: ExecutionMeasurement }>(
        "executionMeasurements",
      )
      .findOne(
        {
          uid: actor.uid,
          "value.id": measurementId,
          "value.operationId": value.operationId,
          "value.publicationId": policy.publicationId,
          "value.outcome": "succeeded",
          "value.scope": "call",
          "value.authority": { $in: ["adapter", "provider"] },
          "value.evidence.id": evidenceId,
        },
        { session: s },
      );
    if (!measurement)
      throw bookletConflict("A measured reviewer execution is required.");
    const reviewerRun = await db.collection<AiJob>("aiJobs").findOne(
      {
        uid: actor.uid,
        "run.logicalId": measurement.value.runId,
        "run.target.adapter": "booklet",
        "run.target.id": p._id,
        "consumption.orderId": p.orderId,
      },
      { session: s },
    );
    if (!reviewerRun?.run || reviewerRun.run.answerer)
      throw bookletConflict(
        "Reviewer evidence belongs to another production or a persona Run.",
      );
    let inputsMatch = false;
    for (const ref of measurement.value.evidence.filter(
      (e) => e.kind === "input",
    )) {
      if (
        fingerprint(await readEvidence(db, actor.uid, ref.id)) ===
        fingerprint({
          target: value.target,
          asset: value.asset,
          sources: value.sources,
        })
      )
        inputsMatch = true;
    }
    if (!inputsMatch)
      throw bookletConflict(
        "Reviewer input evidence must bind the original and approved sources.",
      );
    const records = db.collection<{
      _id: string;
      ownerId: string;
      productionId: string;
      value: QualityReview;
    }>("bookletQualityReviews");
    const old = await records.findOne(
      {
        ownerId: actor.uid,
        productionId: p._id,
        "value.target.revisionId": revision._id,
      },
      { session: s },
    );
    if (old) {
      if (fingerprint(old.value) !== fingerprint(value))
        throw bookletConflict(
          "Quality dispositions are immutable; repair produces a new revision.",
        );
      return old.value;
    }
    await records.insertOne(
      {
        _id: fingerprint([actor.uid, value.id]),
        ownerId: actor.uid,
        productionId: p._id,
        value,
      },
      { session: s },
    );
    await c.save(p, p.version, s);
    return value;
  });
}

// Domain validation is invoked again by the authenticated existing Run UI before
// accepting an answer. The synthetic approval identity is a review group, not a
// legacy Run artifact and never causes migration of sample artifacts.
export async function validateBookletApproval(
  db: Db,
  job: AiJob,
  raw: unknown,
) {
  const value = z
    .strictObject({
      artifactId: z.string().uuid(),
      revision: z.literal(1),
      contentHash: hash,
      action: z.literal("approve"),
      requireHuman: z.literal(true),
    })
    .parse(raw);
  const c = bookletContext(db, { uid: job.uid, authTime: job.authTime });
  await c.transaction(async (s) => {
    const p = await c.owned(job.run?.target?.id ?? "", s);
    await c.entitled(p, s);
    const request = await db
      .collection<ReviewRequest>("bookletReviewRequests")
      .findOne(
        {
          _id: value.artifactId,
          productionId: p._id,
          ownerId: job.uid,
          runId: job._id,
          contentHash: value.contentHash,
        },
        { session: s },
      );
    if (!request) throw bookletMissing();
    const source = request.sourceProductionId
      ? await c.owned(request.sourceProductionId, s)
      : p;
    for (const target of request.targets)
      if (
        c.artifact(source, target.artifactId).artifact.currentRevisionId !==
        target.revisionId
      )
        throw bookletConflict("Review target changed.");
  });
}
