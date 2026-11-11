import "server-only";
import type { Db, ClientSession } from "mongodb";
import { fingerprint } from "../foundation/canonical";
import { bookletConflict } from "./context";
import {
  revisionDocumentSchema,
  type ProductionDocument,
  type AppendInput,
  type RevisionDocument,
} from "./documents";
import type { AiJob } from "../ai/jobs";
import type { Generation } from "./lifecycle";
import type { BookletAsset } from "./media";
import type { ProductionV2, AssessmentV2, RevisionV2 } from "./documents-v2";

/** A finding ID alone is not lineage: bind it to an explicitly selected immutable
 * target source. Subject-scoped findings may cover their selected artifacts. */
export async function requireCorrectionFindingV2(
  db: Db,
  p: ProductionV2,
  findingId: string,
  targetIds: string[],
  sources: AssessmentV2["assessment"]["sources"],
  session?: ClientSession,
) {
  const baselines = sources.flatMap((source) => {
    const parent = p.subjects.find((subject) => subject.artifacts.some((artifact) => artifact.id === source.artifactId));
    const targets = targetIds.filter((target) => target === source.artifactId || target === parent?.id);
    return targets.length ? [{ source, targets, aliases: [source.artifactId, ...(parent ? [parent.id] : [])] }] : [];
  });
  if (baselines.length) for await (const assessment of db.collection<AssessmentV2>("bookletAssessments").find({
    ownerId: p.ownerId, productionId: p._id,
    $or: baselines.map(({ source, aliases }) => ({
      "assessment.sources": { $elemMatch: source },
      "assessment.findings": { $elemMatch: { id: findingId, classification: "confirmed", targetId: { $in: aliases } } },
    })),
  }, { session }).batchSize(1)) {
    const finding = assessment.assessment.findings.find((finding) => finding.id === findingId && finding.classification === "confirmed")!;
    const reviewedTargets = assessment.assessment.sources.filter((source) =>
      assessment.assessment.coverage.targetIds.includes(source.artifactId) || p.subjects.some((subject) =>
        assessment.assessment.coverage.targetIds.includes(subject.id) && subject.artifacts.some((artifact) => artifact.id === source.artifactId)));
    const groupMatches = fingerprint(reviewedTargets) === assessment.assessment.targetHash;
    const targets: string[] = [];
    for (const baseline of baselines) {
      if (!baseline.aliases.includes(finding.targetId) || !assessment.assessment.sources.some((observed) =>
        fingerprint(observed) === fingerprint(baseline.source))) continue;
      let reviewed = baseline.source.contentHash === assessment.assessment.targetHash || groupMatches;
      if (assessment.assessment.mode === "whole_book") {
        const row = await db.collection<RevisionV2>("bookletRevisions").findOne({
          _id: baseline.source.revisionId, ownerId: p.ownerId, productionId: p._id,
          artifactId: baseline.source.artifactId, contentHash: baseline.source.contentHash,
        }, { session });
        reviewed = row?.content.kind === "page-image" &&
          (assessment.assessment.coverage.assetIds ?? []).includes(row.content.asset.assetId);
      }
      if (reviewed) targets.push(...baseline.targets);
    }
    if (targets.length) return { finding, targetIds: [...new Set(targets)] };
  }
  throw bookletConflict("Correction requires a confirmed finding on its exact selected baseline source.");
}

export async function resolveReusedSource(
  db: Db,
  p: ProductionDocument,
  revisionId: string,
  session: ClientSession,
) {
  if (!p.sourceProductionId)
    throw bookletConflict(
      "Cross-production reuse requires explicit human acceptance.",
    );
  const acceptance = await db.collection("bookletReuseAcceptances").findOne(
    {
      ownerId: p.ownerId,
      productionId: p._id,
      sourceProductionId: p.sourceProductionId,
      revisionId,
    },
    { session },
  );
  const source = await db
    .collection<ProductionDocument>("bookletProductions")
    .findOne(
      { _id: p.sourceProductionId, ownerId: p.ownerId, bookletId: p.bookletId },
      { session },
    );
  const row = await db.collection<RevisionDocument>("bookletRevisions").findOne(
    {
      _id: revisionId,
      ownerId: p.ownerId,
      productionId: p.sourceProductionId,
    },
    { session },
  );
  if (!acceptance || !source || !row)
    throw bookletConflict(
      "Cross-production reuse requires explicit human acceptance.",
    );
  return revisionDocumentSchema.parse(row);
}

async function reusedRevision(
  db: Db,
  p: ProductionDocument,
  value: AppendInput,
  session: ClientSession,
) {
  const acceptance = await db.collection("bookletReuseAcceptances").findOne(
    {
      ownerId: p.ownerId,
      productionId: p._id,
      requestId: value.provenance.operationId,
      revisionId: { $in: value.sources.map((s) => s.revisionId) },
    },
    { session },
  );
  if (!acceptance) return null;
  // Find the selected content within a grouped acceptance, not an arbitrary
  // first item whose content might belong to another artifact responsibility.
  for (const source of value.sources) {
    const accepted = await db.collection("bookletReuseAcceptances").findOne(
      {
        ownerId: p.ownerId,
        productionId: p._id,
        requestId: value.provenance.operationId,
        revisionId: source.revisionId,
      },
      { session },
    );
    if (!accepted) continue;
    const row = await resolveReusedSource(db, p, source.revisionId, session);
    if (
      fingerprint(row.content) === fingerprint(value.content) &&
      fingerprint(row.assets) === fingerprint(value.assets)
    )
      return row;
  }
  throw bookletConflict(
    "Reused content must exactly match the accepted source revision.",
  );
}

export async function guardBookletAppend(
  db: Db,
  p: ProductionDocument,
  value: AppendInput,
  session: ClientSession,
) {
  // T14 drafts remain usable for repository construction. Once admitted, every
  // content write passes lifecycle gates, even through a direct repository call.
  if (p.lifecycleState === "draft") return;
  const order = await db.collection("consumptionOrders").findOne(
    {
      "value.id": p.orderId,
      "value.ownerId": p.ownerId,
      "value.state": "started",
    },
    { session },
  );
  if (
    !order ||
    !order.activeWorkflow ||
    (order.value.expiresAt && new Date(order.value.expiresAt) <= new Date())
  )
    throw bookletConflict("An active paid workflow is required.");
  const job = await db.collection<AiJob>("aiJobs").findOne(
    {
      _id: value.provenance.runId,
      uid: p.ownerId,
      "consumption.orderId": p.orderId,
      "consumption.workflowId": order.activeWorkflow,
      status: { $in: ["running", "paused"] },
    },
    { session },
  );
  if (
    !job ||
    job.run?.target?.adapter !== "booklet" ||
    job.run.target.id !== p._id ||
    job.run.answerer
  )
    throw bookletConflict("Revision Run is not the active booklet workflow.");
  const subject = p.subjects.find((s) =>
    s.artifacts.some((a) => a.id === value.artifactId),
  )!;
  const artifact = subject.artifacts.find((a) => a.id === value.artifactId)!;
  const story = [
    "concept",
    "outline",
    "manuscript",
    "roster",
    "description",
  ].includes(value.content.kind);
  if (
    (story && p.stageLocks.story) ||
    (value.content.kind === "style" && p.stageLocks.style)
  )
    throw bookletConflict("Creative stage is locked.");
  const reused = await reusedRevision(db, p, value, session);
  if (reused) {
    if (
      artifact.currentRevisionId ||
      reused.kind !== artifact.kind ||
      reused.subjectId !== subject.id
    )
      throw bookletConflict(
        "Reuse requires an empty matching responsibility and stable subject identity.",
      );
    if (
      value.content.kind === "reference" &&
      (subject.kind === "style-sample"
        ? p.stageLocks.style
        : p.stageLocks.references)
    )
      throw bookletConflict("Reference stage is locked.");
    for (const asset of value.assets) {
      if (
        !(await db.collection<BookletAsset>("bookletAssets").findOne(
          {
            _id: asset.assetId,
            ownerId: p.ownerId,
            state: "ready",
            originalAssetId: null,
            sha256: asset.sha256,
            attachments: reused._id,
            width: p.creativeConfigSnapshot.canvas.width,
            height: p.creativeConfigSnapshot.canvas.height,
            mime: p.creativeConfigSnapshot.canvas.mime,
          },
          { session },
        ))
      )
        throw bookletConflict("Accepted source original is unavailable.");
    }
    return;
  }
  if (!["reference", "page-image"].includes(value.content.kind)) {
    if (
      artifact.currentRevisionId &&
      (story || value.content.kind === "style")
    ) {
      const category = story ? "story" : "style";
      if (
        !(await db.collection("consumptionAllocations").findOne(
          {
            orderId: p.orderId,
            chargeId: p.revisionChargeId,
            category,
            revoked: false,
          },
          { session },
        ))
      )
        throw bookletConflict(
          "A revision allocation is required for changed creative content.",
        );
    }
    return;
  }
  const op = await db.collection<Generation>("bookletGenerations").findOne(
    {
      _id: value.provenance.operationId,
      productionId: p._id,
      ownerId: p.ownerId,
      artifactId: value.artifactId,
      state: { $in: ["authorized", "unknown"] },
    },
    { session },
  );
  if (!op || fingerprint(op.sources) !== fingerprint(value.sources))
    throw bookletConflict(
      "Image result must match the authorized generation and exact sources.",
    );
  if (op.runId !== value.provenance.runId) {
    // Keep the generation's original Run immutable. A later active Run may
    // attach its retained bytes only after the old paid workflow was released
    // through verified termination, never while that writer could still run.
    const origin = await db.collection<AiJob>("aiJobs").findOne(
      {
        _id: op.runId,
        uid: p.ownerId,
        "consumption.orderId": p.orderId,
        "run.target.adapter": "booklet",
        "run.target.id": p._id,
      },
      { session },
    );
    if (
      !origin?.consumption ||
      !(await db.collection("consumptionWorkflows").findOne(
        {
          _id: origin.consumption.workflowId as never,
          uid: p.ownerId,
          orderId: p.orderId,
          jobId: origin._id,
          state: "finished",
        },
        { session },
      ))
    )
      throw bookletConflict(
        "Original generation Run must have verified termination before recovery.",
      );
  }
  if (value.assets.length !== 1)
    throw bookletConflict(
      "Image revisions require exactly one retained original.",
    );
  for (const asset of value.assets) {
    const retained = await db.collection<BookletAsset>("bookletAssets").findOne(
      {
        _id: asset.assetId,
        productionId: p._id,
        ownerId: p.ownerId,
        operationId: op._id,
        state: "ready",
        originalAssetId: null,
        sha256: asset.sha256,
      },
      { session },
    );
    if (!retained)
      throw bookletConflict(
        "Retain the complete original before attaching the revision.",
      );
    if (
      retained.width !== p.creativeConfigSnapshot.canvas.width ||
      retained.height !== p.creativeConfigSnapshot.canvas.height ||
      retained.mime !== p.creativeConfigSnapshot.canvas.mime
    )
      throw bookletConflict("Original does not match the purchased canvas.");
  }
}

export async function attachBookletAssets(
  db: Db,
  p: ProductionDocument,
  value: AppendInput,
  revisionId: string,
  session: ClientSession,
) {
  if (
    p.lifecycleState === "draft" ||
    !["reference", "page-image"].includes(value.content.kind)
  )
    return;
  const reused = await reusedRevision(db, p, value, session);
  for (const asset of value.assets)
    await db
      .collection<BookletAsset>("bookletAssets")
      .updateOne(
        { _id: asset.assetId, ownerId: p.ownerId, state: "ready" },
        { $addToSet: { attachments: revisionId }, $inc: { fence: 1 } },
        { session },
      );
  if (!reused)
    await db.collection<Generation>("bookletGenerations").updateOne(
      {
        _id: value.provenance.operationId,
        ownerId: p.ownerId,
        productionId: p._id,
      },
      { $set: { state: "succeeded", revisionId } },
      { session },
    );
}
