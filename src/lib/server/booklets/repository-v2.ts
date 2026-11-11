import "server-only";
import { BSON, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { uiPayloadSchema } from "../../contracts/runs";
import {
  bookletContentV2Schema,
  bookletRetryPolicySchema,
  bookletSourceV2Schema,
  bookletAssessmentV2Schema,
} from "../../../project/booklets/contracts-v2";
import { assetIdentitySchema } from "../../../project/booklets/contracts";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import { bookletRepository } from "./repository";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import {
  id,
  mutationSchema,
  type Mutation,
  type ProductionDocument,
  subjectInputSchema,
  revisionDocumentSchema,
} from "./documents";
import {
  artifactKindV2Schema,
  productionV2Schema,
  revisionV2Schema,
  storedProductionSchema,
  type ProductionV2,
  type RevisionV2,
  workRegistrationV2Schema,
  workV2Schema,
  assessmentDocumentV2Schema,
  acceptanceDocumentV2Schema,
  reviewInputV2Schema,
  type WorkV2,
  type AssessmentV2,
  type AcceptanceV2,
  humanRequestInputV2Schema,
  humanRequestV2Schema,
} from "./documents-v2";
import { bookletMedia, type BookletAsset } from "./media";
import type { AiJob } from "../ai/jobs";
import { bookletWorkUsageV2, bookletNativeCostsV2, bookletRunBoundsV2 } from "./usage-v2";
import { requireCorrectionFindingV2 } from "./guards";

type CreateInput = Parameters<
  ReturnType<typeof bookletRepository>["createProduction"]
>[0];
type Receipt = {
  _id: string;
  ownerId: string;
  productionId: string;
  scope: string;
  key: string;
  inputHash: string;
  result: {
    id: string;
    version: number;
    checkpointVersion?: number;
    fence?: number;
    revisionId?: string;
    ordinal?: number;
    assessmentId?: string;
    acceptanceId?: string;
    humanRequest?: z.infer<typeof humanRequestV2Schema>;
  };
  createdAt: Date;
};
type Details = Pick<
  Receipt["result"],
  "revisionId" | "ordinal" | "assessmentId" | "acceptanceId" | "humanRequest"
>;

export async function createBookletV2Indexes(db: Db) {
  await db
    .collection("bookletWork")
    .createIndex({ ownerId: 1, productionId: 1, callId: 1 }, { unique: true });
  await db
    .collection("bookletWork")
    .createIndex(
      { ownerId: 1, productionId: 1, actionKey: 1, retryOrdinal: 1 },
      { unique: true },
    );
  await db.collection("bookletWork").createIndex({
    ownerId: 1,
    productionId: 1,
    correctionRootId: 1,
    status: 1,
  });
  await db.collection("bookletWork").createIndex({ status: 1, "reconciliation.nextAt": 1, "reconciliation.leaseUntil": 1 });
  await db.collection("bookletAssessments").createIndex({
    ownerId: 1,
    productionId: 1,
    "assessment.targetHash": 1,
    createdAt: 1,
  });
  await db
    .collection("bookletAssessments")
    .createIndex({ ownerId: 1, productionId: 1, "assessment.findings.id": 1 });
  await db
    .collection("bookletAcceptances")
    .createIndex({ ownerId: 1, productionId: 1, revisionId: 1, createdAt: 1 });
}

// Explicit v2 entry point. Reuse v1 admission validation for newly created records
// inside the same transaction; no existing record is converted or exposed as v1.
export function bookletRepositoryV2(
  db: Db,
  actor: CreditActor,
  now = () => new Date(),
  options: { atomicMutations?: boolean } = {},
) {
  const base = bookletRepository(db, actor, { now });
  const context = bookletContext(db, actor, now);
  const productions = db.collection<ProductionV2>("bookletProductions");
  const mixedProductions = db.collection<ProductionV2 | ProductionDocument>(
    "bookletProductions",
  );
  const receipts = db.collection<Receipt>("bookletRepositoryWrites");
  const revisions = db.collection<RevisionV2>("bookletRevisions");
  const work = db.collection<WorkV2>("bookletWork");
  const assessments = db.collection<AssessmentV2>("bookletAssessments");
  const acceptances = db.collection<AcceptanceV2>("bookletAcceptances");
  const mutationInput = options.atomicMutations
    ? mutationSchema.extend({ fence: z.number().int().nonnegative().safe() })
    : mutationSchema;
  const ids = z.array(id).refine((v) => new Set(v).size === v.length);
  async function guardEvidence(p: ProductionV2, evidenceIds: string[], session: ClientSession) {
    for (const evidenceId of evidenceIds) {
      const observed = await work.findOne({ ownerId: actor.uid, productionId: p._id,
        evidenceIds: evidenceId }, { session, projection: { _id: 1 } });
      const assessment = observed ? null : await assessments.findOne({ _id: evidenceId,
        ownerId: actor.uid, productionId: p._id }, { session, projection: { _id: 1 } });
      if (!observed && !assessment)
        throw bookletConflict("Evidence does not belong to this production.");
    }
  }
  function boundState(row: object) {
    if (BSON.calculateObjectSize(row) > 4 * 1024 * 1024)
      throw bookletConflict(
        "Manager state exceeds its storage limit; retain large bodies in evidence storage.",
      );
  }
  async function retryTime(row: Pick<WorkV2, "runId" | "productionId" | "retryOrdinal" | "updatedAt">,
    session: ClientSession, retryAfterMs = 0) {
    const job = await db.collection<AiJob>("aiJobs").findOne({ _id: row.runId, uid: actor.uid,
      "run.target.adapter": "booklet", "run.target.version": "2", "run.target.id": row.productionId },
    { session, projection: { "run.retryBaseSeconds": 1, "run.retryMaxSeconds": 1 } });
    const maximum = (job?.run?.retryMaxSeconds ?? 60) * 1000;
    const delay = Math.min(maximum, (job?.run?.retryBaseSeconds ?? 2) * 1000 * 2 ** Math.min(row.retryOrdinal, 30));
    return new Date(row.updatedAt.getTime() + Math.max(delay, Math.min(retryAfterMs, maximum)));
  }
  const correctionLimit = (p: ProductionV2, family: "llm" | "image") =>
    family === "image"
      ? Math.min(1, p.creativeConfigSnapshot.repairLimitPerOutput)
      : 3;
  function correctionRoot(
    p: ProductionV2,
    row: Pick<WorkV2, "service" | "operation" | "targetIds">,
    funding: string,
  ) {
    return fingerprint([
      p._id,
      row.service,
      row.operation,
      [...row.targetIds].sort(),
      funding,
    ]);
  }
  async function correctionFunding(
    p: ProductionV2,
    row: WorkV2,
    session: ClientSession,
  ) {
    for (const funding of new Set([
      p.revisionChargeId ?? "platform",
      "platform",
    ]))
      if (correctionRoot(p, row, funding) === row.correctionRootId)
        return funding;
    // Historical scopes remain readable after another customer-paid revision.
    // Resolve their existing immutable commerce receipt; no parallel budget ledger.
    for await (const charge of db
      .collection<{ _id: string }>("consumptionCharges")
      .find(
        { uid: actor.uid, orderId: p.orderId, kind: "revision" },
        { projection: { _id: 1 }, session },
      ))
      if (correctionRoot(p, row, charge._id) === row.correctionRootId)
        return charge._id;
    throw bookletConflict("Correction funding identity is unavailable.");
  }
  async function correctionHistory(
    p: ProductionV2,
    row: WorkV2,
    funding: string,
    session: ClientSession,
  ) {
    const history: WorkV2[] = [];
    for await (const previous of work.find(
      {
        ownerId: actor.uid,
        productionId: p._id,
        service: row.service,
        operation: row.operation,
        category: row.category,
        targetIds: { $in: row.targetIds },
        status: { $ne: "registered" },
      },
      { session },
    )) {
      if (previous.correctionRootId === correctionRoot(p, previous, funding))
        history.push(previous);
    }
    return history;
  }
  function correctionActions(history: WorkV2[], targetId: string) {
    return new Set(
      history
        .filter((row) => row.correction && row.targetIds.includes(targetId))
        .map((row) => row.actionKey),
    );
  }
  async function activeManager(
    p: ProductionV2,
    runId: string,
    holderId: string,
    session: ClientSession,
  ) {
    if (p.lifecycleState === "in-progress") {
      const order = await context.entitled(p, session);
      const job = await db.collection<AiJob>("aiJobs").findOne(
        {
          _id: runId,
          uid: actor.uid,
          status: { $in: ["running", "paused"] },
          cancelRequested: false,
          "run.target.adapter": "booklet",
          "run.target.version": "2",
          "run.target.id": p._id,
          "consumption.orderId": p.orderId,
          "consumption.workflowId": order.activeWorkflow,
        },
        { session },
      );
      const flow = await db.collection("consumptionWorkflows").findOne(
        {
          _id: order.activeWorkflow as never,
          uid: actor.uid,
          orderId: p.orderId,
          state: "active",
          jobId: runId,
        },
        { session },
      );
      if (
        !job?.runId ||
        (job.execution &&
          !["running", "paused"].includes(job.execution.status)) ||
        !flow ||
        holderId !== job._id ||
        job.run?.answerer
      )
        throw bookletConflict(
          "An active owned prepaid Manager Run is required.",
        );
    }
  }
  async function guardCreativeTargets(
    p: ProductionV2,
    targetIds: string[],
    session: ClientSession,
  ) {
    for (const targetId of targetIds) {
      const subject = p.subjects.find((s) => s.artifacts.some((a) => a.id === targetId));
      const artifact = subject?.artifacts.find((a) => a.id === targetId);
      if (!subject || !artifact)
        throw bookletConflict("Creative target is unavailable.");
      const story = [
        "concept",
        "outline",
        "manuscript",
        "roster",
        "description",
      ].includes(artifact.kind);
      const style =
        artifact.kind === "style" || subject.kind === "style-sample";
      const reference =
        ["character", "location"].includes(subject.kind) &&
        artifact.kind === "image-spec";
      if (
        (story && p.stageLocks.story) ||
        (style && p.stageLocks.style) ||
        (reference && p.stageLocks.references)
      )
        throw bookletConflict("This revision stage is locked.");
      if (p.revisionChargeId) {
        const category = style
          ? "style"
          : reference
            ? "reference"
            : subject.kind === "page"
              ? "page"
              : "story";
        const allocated = await db
          .collection("consumptionAllocations")
          .find(
            {
              orderId: p.orderId,
              ownerId: actor.uid,
              chargeId: p.revisionChargeId,
              category,
              revoked: false,
            },
            { session },
          )
          .toArray();
        if (
          !allocated.some(
            (allocation) =>
              category === "story" ||
              allocation.subjectId === subject.id ||
              (artifact.kind === "style" &&
                p.subjects
                  .filter((s) => s.kind === "style-sample")
                  .every((s) =>
                    allocated.some((a) => a.subjectId === s.id),
                  )),
          )
        )
          throw bookletConflict(
            "Revision is outside the current financial consent.",
          );
      }
    }
  }
  const indexArtifact = z.strictObject({
    subjectId: id,
    artifactId: id,
    kind: artifactKindV2Schema,
  });
  function insertSubject(
    p: ProductionV2,
    subject: z.infer<typeof subjectInputSchema>,
  ) {
    const limits = {
      book: 1,
      character: p.creativeConfigSnapshot.maxCharacters,
      location: p.creativeConfigSnapshot.maxLocations,
      "style-sample": p.creativeConfigSnapshot.styleSamples,
      page:
        p.creativeConfigSnapshot.storyPages +
        Number(p.creativeConfigSnapshot.includeCover),
    };
    if (
      p.subjects.filter((s) => s.kind === subject.kind).length >=
      limits[subject.kind]
    )
      throw bookletConflict("Subject capacity exceeded.");
    if (
      subject.pageRole === "cover" &&
      (!p.creativeConfigSnapshot.includeCover ||
        p.subjects.some((s) => s.pageRole === "cover"))
    )
      throw bookletConflict("Cover capacity exceeded.");
    if (
      subject.pageRole === "story" &&
      p.subjects.filter((s) => s.pageRole === "story").length >=
        p.creativeConfigSnapshot.storyPages
    )
      throw bookletConflict("Story page capacity exceeded.");
    p.subjects.push({ ...subject, artifacts: [] });
  }
  function insertArtifact(
    p: ProductionV2,
    entry: z.infer<typeof indexArtifact>,
  ) {
    const subject = p.subjects.find((s) => s.id === entry.subjectId);
    if (!subject) throw bookletMissing();
    const kinds: Record<typeof subject.kind, readonly string[]> = {
      book: [
        "concept",
        "outline",
        "manuscript",
        "roster",
        "style",
        "book-layout",
        "book-manifest",
      ],
      character: ["description", "image-spec", "reference"],
      location: ["description", "image-spec", "reference"],
      "style-sample": ["image-spec", "reference"],
      page: ["page-spec", "page-image"],
    };
    if (!kinds[subject.kind].includes(entry.kind))
      throw bookletConflict("Artifact responsibility mismatch.");
    if (subject.artifacts.some((artifact) => artifact.kind === entry.kind))
      throw bookletConflict("Duplicate responsibility for subject.");
    subject.artifacts.push({
      id: entry.artifactId,
      kind: entry.kind,
      currentRevisionId: null,
      acceptedRevisionId: null,
    });
  }
  async function owned(productionId: string, session: ClientSession) {
    return context.owned(id.parse(productionId), session, 2);
  }
  function mutable(
    p: ProductionV2,
    expectedVersion: number,
    terminalMetadata = false,
  ) {
    if (
      p.version !== expectedVersion ||
      p.lifecycleState === "closed" ||
      (p.lifecycleState === "completed" && !terminalMetadata) ||
      (p.expiresAt && p.expiresAt <= now())
    )
      throw bookletConflict("Production changed or is not mutable.");
  }
  function fenced(p: ProductionV2, value: Mutation, terminalMetadata = false) {
    mutable(p, value.expectedVersion, terminalMetadata);
    if (
      !p.mutationLease ||
      p.mutationLease.holderId !== value.holderId ||
      p.mutationLease.fence !== value.fence ||
      p.mutationLease.expiresAt <= now()
    )
      throw bookletConflict("Production mutation lease expired or changed.");
  }
  async function save(
    p: ProductionV2,
    previousVersion: number,
    session: ClientSession,
  ) {
    p.version = previousVersion + 1;
    p.updatedAt = now();
    productionV2Schema.parse(p);
    if (BSON.calculateObjectSize(p) > 1024 * 1024)
      throw bookletConflict("Production exceeds its storage limit.");
    const result = await productions.replaceOne(
      { _id: p._id, ownerId: actor.uid, version: previousVersion },
      p,
      { session },
    );
    if (result.modifiedCount !== 1)
      throw bookletConflict("Production changed.");
  }
  async function mutate(
    productionId: string,
    value: Mutation,
    method: string,
    input: unknown,
    effect: (
      p: ProductionV2,
      session: ClientSession,
    ) => void | Promise<void | Details>,
  ) {
    return context.transaction(async (session) => {
      const p = await owned(productionId, session);
      const identity = fingerprint([
        actor.uid,
        "production-v2",
        p._id,
        value.key,
      ]);
      const inputHash = fingerprint({ method, input });
      const prior = await receipts.findOne({ _id: identity }, { session });
      if (prior) {
        if (prior.inputHash !== inputHash)
          throw bookletConflict("Changed idempotency payload.");
        return prior.result;
      }
      const terminalMetadata =
        method === "checkpoint" || method === "releaseLease";
      if (options.atomicMutations) {
        // Gateway mutations contain local database work only. Check and advance
        // the existing fence in this transaction, leaving no lease across calls.
        mutable(p, value.expectedVersion, terminalMetadata);
        if (
          p.fenceCounter !== value.fence ||
          (p.mutationLease && p.mutationLease.expiresAt > now())
        )
          throw bookletConflict(
            "Mutation fence changed or production is leased.",
          );
        p.fenceCounter++;
        p.mutationLease = null;
      } else {
        fenced(p, value, terminalMetadata);
      }
      const details = await effect(p, session);
      await save(p, value.expectedVersion, session);
      const result = {
        ...details,
        id: p._id,
        version: p.version,
        checkpointVersion: p.checkpointVersion,
        ...(options.atomicMutations || method === "checkpoint"
          ? { fence: options.atomicMutations ? p.fenceCounter : value.fence }
          : {}),
      };
      await receipts.insertOne(
        {
          _id: identity,
          ownerId: actor.uid,
          productionId: p._id,
          scope: "production-v2:" + p._id,
          key: value.key,
          inputHash,
          result,
          createdAt: now(),
        },
        { session },
      );
      return result;
    });
  }
  return {
    async createProduction(
      input: CreateInput,
      rawRetryPolicy: z.input<typeof bookletRetryPolicySchema> = {},
    ) {
      const retryPolicy = bookletRetryPolicySchema.parse(rawRetryPolicy);
      const creationHash = fingerprint(
        JSON.parse(JSON.stringify({ input, retryPolicy })),
      );
      return context.transaction(async (session) => {
        const existing = await productions.findOne(
          { _id: id.parse(input.id) },
          { session },
        );
        if (existing) {
          const p = await owned(input.id, session);
          if (p.creationHash !== creationHash)
            throw bookletConflict("Changed production creation payload.");
          return { id: p._id, version: p.version };
        }
        if (input.sourceProductionId) {
          const source = await mixedProductions.findOne(
            { _id: input.sourceProductionId, ownerId: actor.uid },
            { session },
          );
          if (
            !source ||
            source.bookletId !== input.bookletId ||
            source._id === input.id
          )
            throw bookletMissing();
          storedProductionSchema.parse(source);
          await base.getBook(source.bookletId);
        }
        // Source ownership was checked with the mixed reader above. V1 validation
        // supplies order/package/brief checks without interpreting a v2 predecessor.
        const { sourceProductionId, ...creation } = input;
        await base.createProduction(creation, session);
        const created = await productions.findOne(
          { _id: input.id, ownerId: actor.uid },
          { session },
        );
        if (!created) throw bookletMissing();
        const p = productionV2Schema.parse({
          ...created,
          documentVersion: 2,
          sourceProductionId: sourceProductionId ?? null,
          creationHash,
          retryPolicy,
          checkpointVersion: 0,
          checkpoint: null,
        });
        const result = await mixedProductions.replaceOne(
          { _id: p._id, ownerId: actor.uid, documentVersion: 1 },
          p,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw bookletConflict("Production creation changed.");
        return { id: p._id, version: p.version };
      });
    },
    getProduction(productionId: string) {
      return context.transaction((session) => owned(productionId, session));
    },
    getWork(productionId: string, callId: string) {
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const row = await work.findOne(
          { ownerId: actor.uid, productionId: p._id, callId: id.parse(callId) },
          { session },
        );
        if (!row) throw bookletMissing();
        return workV2Schema.parse(row);
      });
    },
    // Authenticated application control only; never exposed to Manager as an MCP
    // action. One user click permits one additional attempt after automatic limits.
    authorizeRetry(productionId: string, raw: { callId: string; key: string }) {
      const value = z.strictObject({ callId: id, key: id }).parse(raw);
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const identity = fingerprint([actor.uid, "retry-authorization-v2", p._id, value.key]);
        const inputHash = fingerprint(value);
        const prior = await receipts.findOne({ _id: identity }, { session });
        if (prior) {
          if (prior.inputHash !== inputHash) throw bookletConflict("Changed retry authorization.");
          return prior.result;
        }
        if (p.lifecycleState !== "in-progress" || (p.expiresAt && p.expiresAt <= now()))
          throw bookletConflict("Only unfinished entitled work can be retried.");
        await context.entitled(p, session);
        const rawWork = await work.findOne({ ownerId: actor.uid, productionId: p._id, callId: value.callId }, { session });
        if (!rawWork) throw bookletMissing();
        const row = workV2Schema.parse(rawWork);
        const latest = await work.findOne({ ownerId: actor.uid, productionId: p._id, actionKey: row.actionKey },
          { session, sort: { retryOrdinal: -1 } });
        if (latest?.callId !== row.callId || row.status !== "failed" || !row.retryable || row.requestPayload === undefined ||
          row.retryOrdinal < p.retryPolicy[row.category] || row.retryAuthorization ||
          row.correctionRootId !== correctionRoot(p, row, p.revisionChargeId ?? "platform"))
          throw bookletConflict("Retry requires the latest confirmed retriable failure after automatic allowance exhaustion.");
        const result = { id: row.callId, version: p.version };
        const timestamp = now();
        const updated = await work.updateOne({ _id: row._id, ownerId: actor.uid, productionId: p._id, status: "failed", retryable: true,
          retryAuthorization: { $exists: false } }, { $set: { retryAuthorization: {
            key: value.key, authorizedAt: timestamp, consumedByCallId: null,
          } } }, { session });
        if (!updated.modifiedCount) throw bookletConflict("Retry authorization changed.");
        await receipts.insertOne({ _id: identity, ownerId: actor.uid, productionId: p._id,
          scope: "production-v2-retry:" + p._id, key: value.key, inputHash, result, createdAt: timestamp }, { session });
        await db.collection("auditEvents").insertOne({ _id: identity as never, event: "booklet-action-retry-authorized",
          actorUid: actor.uid, productionId: p._id, callId: row.callId, runId: row.runId,
          category: row.category, retryOrdinal: row.retryOrdinal, timestamp }, { session });
        return result;
      });
    },
    getCorrection(productionId: string, rootId: string) {
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const row = await work.findOne(
          {
            ownerId: actor.uid,
            productionId: p._id,
            correctionRootId: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(rootId),
          },
          { session },
        );
        if (!row) throw bookletMissing();
        const family = row.category === "paidImage" ? "image" : "llm";
        const funding = await correctionFunding(p, row, session);
        const history = await correctionHistory(p, row, funding, session);
        return {
          rootId,
          family,
          targetIds: row.targetIds,
          used: Math.max(
            0,
            ...row.targetIds.map(
              (targetId) => correctionActions(history, targetId).size,
            ),
          ),
          limit: correctionLimit(p, family),
        };
      });
    },
    registerWork(
      productionId: string,
      input: Mutation & z.input<typeof workRegistrationV2Schema>,
    ) {
      const value = mutationInput
        .extend(workRegistrationV2Schema.shape)
        .parse(input);
      return mutate(
        productionId,
        value,
        "registerWork",
        value,
        async (p, session) => {
          await activeManager(p, value.runId, value.holderId, session);
          if (
            value.requestPayload !== undefined &&
            fingerprint(value.requestPayload) !== value.requestHash
          )
            throw bookletConflict("Stored request differs from its hash.");
          const expectedCategory =
            value.service === "image-executor"
              ? value.operation === "prepare"
                ? "nonPaid"
                : "paidImage"
              : value.service === "manager" && value.operation !== "reason"
                ? "nonPaid"
                : "paidLlm";
          if (value.category !== expectedCategory)
            throw bookletConflict(
              "Work category differs from its bound service.",
            );
          if (
            value.service === "quality-reviewer" &&
            (!value.reviewScope || !value.targetIds.length)
          )
            throw bookletConflict(
              "Review work requires explicit target scope.",
            );
          const registration = {
            callId: value.callId,
            runId: value.runId,
            actionKey: value.actionKey,
            requestHash: value.requestHash,
            ...(value.requestPayload === undefined
              ? {}
              : { requestPayload: value.requestPayload }),
            service: value.service,
            operation: value.operation,
            targetIds: value.targetIds,
            sources: value.sources,
            category: value.category,
            retryOf: value.retryOf,
            reviewScope: value.reviewScope,
            correction: value.correction,
          };
          const correctionRootId = correctionRoot(
            p,
            value,
            p.revisionChargeId ?? "platform",
          );
          const targets = new Set(
            p.subjects.flatMap((s) => [s.id, ...s.artifacts.map((a) => a.id)]),
          );
          if (value.targetIds.some((target) => !targets.has(target)))
            throw bookletConflict("Work target is not registered.");
          for (const source of value.sources) {
            const row = await revisions.findOne(
              {
                ownerId: actor.uid,
                productionId: p._id,
                _id: source.revisionId,
                artifactId: source.artifactId,
                contentHash: source.contentHash,
              },
              { session },
            );
            if (!row) throw bookletConflict("Work source identity mismatch.");
          }
          const previousRaw = await work
            .find(
              {
                ownerId: actor.uid,
                productionId: p._id,
                actionKey: value.actionKey,
              },
              { session },
            )
            .sort({ retryOrdinal: -1 })
            .limit(1)
            .next();
          const previous = previousRaw ? workV2Schema.parse(previousRaw) : null;
          if (previous) {
            if (
              previous.callId !== value.retryOf ||
              previous.status !== "failed" ||
              !previous.retryable
            )
              throw bookletConflict(
                "Reuse or reconcile existing work before retry.",
              );
            if (previous.retryOrdinal >= p.retryPolicy[previous.category] &&
              (!previous.retryAuthorization || previous.retryAuthorization.consumedByCallId !== null))
              throw bookletConflict("Action retry allowance exhausted.");
            if (
              fingerprint([
                previous.service,
                previous.operation,
                previous.category,
                previous.targetIds,
                previous.sources,
                previous.reviewScope,
                previous.correction,
              ]) !==
              fingerprint([
                value.service,
                value.operation,
                value.category,
                value.targetIds,
                value.sources,
                value.reviewScope,
                value.correction,
              ])
            )
              throw bookletConflict("Retry scope changed.");
          } else if (value.retryOf)
            throw bookletConflict("Retry predecessor is unavailable.");
          if (value.correction) {
            const family = value.category === "paidImage" ? "image" : "llm";
            if (
              value.service === "quality-reviewer" ||
              !value.targetIds.length ||
              value.correction.rootId !== correctionRootId ||
              value.correction.family !== family
            )
              throw bookletConflict(
                "Correction task, target or funding identity changed.",
              );
            const coveredTargets = new Set<string>();
            for (const findingId of value.correction.findingIds) {
              if (value.requestPayload !== undefined) {
                const confirmed = await requireCorrectionFindingV2(db, p, findingId, value.targetIds, value.sources, session);
                confirmed.targetIds.forEach((target) => coveredTargets.add(target));
                continue;
              }
              const finding = await assessments.findOne(
                {
                  ownerId: actor.uid,
                  productionId: p._id,
                  "assessment.findings": {
                    $elemMatch: {
                      id: findingId,
                      classification: "confirmed",
                      targetId: { $in: value.targetIds },
                    },
                  },
                },
                { projection: { "assessment.findings": 1 }, session },
              );
              if (!finding)
                throw bookletConflict(
                  "Correction requires scoped confirmed findings.",
                );
              for (const item of finding.assessment.findings)
                if (
                  item.id === findingId &&
                  item.classification === "confirmed"
                )
                  coveredTargets.add(item.targetId);
            }
            if (value.targetIds.some((target) => !coveredTargets.has(target)))
              throw bookletConflict(
                "Correction requires confirmed findings for every target.",
              );
          }
          if (previous?.retryAuthorization?.consumedByCallId === null) {
            const consumed = await work.updateOne({ _id: previous._id, ownerId: actor.uid, productionId: p._id, "retryAuthorization.consumedByCallId": null },
              { $set: { "retryAuthorization.consumedByCallId": value.callId } }, { session });
            if (!consumed.modifiedCount) throw bookletConflict("Retry authorization already consumed.");
          }
          const row = workV2Schema.parse({
            ...registration,
            _id: fingerprint([actor.uid, p._id, value.callId]),
            documentVersion: 2,
            ownerId: actor.uid,
            productionId: p._id,
            status: "registered",
            retryOrdinal: previous ? previous.retryOrdinal + 1 : 0,
            ...(previous ? { retryNotBefore: previous.retryNotBefore ?? await retryTime(previous, session) } : {}),
            correctionRootId,
            retryable: false,
            evidenceIds: [],
            createdAt: now(),
            updatedAt: now(),
          });
          boundState(row);
          await work.insertOne(row, { session });
        },
      );
    },
    dispatchWork(
      productionId: string,
      input: Mutation & { callId: string; requestHash: string },
    ) {
      const value = mutationInput
        .extend({ callId: id, requestHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(input);
      return mutate(
        productionId,
        value,
        "dispatchWork",
        value,
        async (p, session) => {
          const row = await work.findOne(
            {
              ownerId: actor.uid,
              productionId: p._id,
              callId: value.callId,
              requestHash: value.requestHash,
              status: "registered",
            },
            { session },
          );
          if (!row)
            throw bookletConflict(
              "Work already dispatched, changed or unresolved.",
            );
          await activeManager(p, value.holderId, value.holderId, session);
          const usage = await bookletWorkUsageV2(db, p, session);
          const costs = await bookletNativeCostsV2(db, p, session);
          const bounds = await bookletRunBoundsV2(db, p, session);
          const limits = p.creativeConfigSnapshot.execution;
          if (
            (row.category === "paidLlm" &&
              usage.paidLlm >= limits.maxTextCalls) ||
            (row.category === "paidImage" &&
              usage.paidImage >= limits.maxImageCalls) ||
            (row.category !== "nonPaid" && (costs.overCeiling || bounds.overLimit))
          )
            throw bookletConflict(
              "Production call or reported spending ceiling reached, or native execution bound exhausted.",
            );
          if (
            p.lifecycleState === "in-progress" &&
            row.category !== "nonPaid" &&
            row.service !== "manager" &&
            row.service !== "quality-reviewer"
          )
            await guardCreativeTargets(p, row.targetIds, session);
          const funding = p.revisionChargeId ?? "platform";
          if (row.correctionRootId !== correctionRoot(p, row, funding))
            throw bookletConflict("Work funding identity changed.");
          if (
            row.category !== "nonPaid" &&
            row.service !== "manager" &&
            row.service !== "quality-reviewer"
          ) {
            const history = await correctionHistory(p, row, funding, session);
            if (
              !row.correction &&
              history.some((previous) => previous.actionKey !== row.actionKey)
            )
              throw bookletConflict(
                "Correction metadata required for an already attempted creative target.",
              );
            if (
              history.some(
                (previous) =>
                  previous.actionKey !== row.actionKey &&
                  ["dispatching", "unknown"].includes(previous.status),
              )
            )
              throw bookletConflict(
                "Reconcile unresolved creative work before another attempt.",
              );
            if (row.correction) {
              for (const targetId of row.targetIds) {
                const used = correctionActions(history, targetId);
                if (
                  !used.has(row.actionKey) &&
                  used.size >= correctionLimit(p, row.correction.family)
                )
                  throw bookletConflict("Correction allowance exhausted.");
              }
            }
          }
          if (row.retryNotBefore && row.retryNotBefore > now())
            throw bookletConflict("Retry backoff is still pending.");
          const result = await work.updateOne(
            {
              ownerId: actor.uid,
              productionId: p._id,
              callId: value.callId,
              requestHash: value.requestHash,
              status: "registered",
            },
            {
              $set: {
                status: "dispatching",
                ...(p.lifecycleState === "in-progress"
                  ? { runId: value.holderId }
                  : {}),
                updatedAt: now(),
              },
            },
            { session },
          );
          if (result.modifiedCount !== 1)
            throw bookletConflict(
              "Work already dispatched, changed or unresolved.",
            );
        },
      );
    },
    // Server observer only. The 09 gateway must verify execution/evidence origin;
    // a model result alone never authorizes this transition or a retry.
    recordWorkOutcome(
      productionId: string,
      input: Mutation & {
        callId: string;
        status: "succeeded" | "partial" | "failed" | "unknown";
        retryable: boolean;
        retryAfterMs?: number;
        evidenceIds: string[];
      },
    ) {
      const value = mutationInput
        .extend({
          callId: id,
          status: z.enum(["succeeded", "partial", "failed", "unknown"]),
          retryable: z.boolean(),
          retryAfterMs: z.number().int().nonnegative().safe().optional(),
          evidenceIds: ids.min(1),
        })
        .refine(
          (v) => !v.retryable || v.status === "failed",
          "Only confirmed failures may be retryable.",
        )
        .parse(input);
      return mutate(
        productionId,
        value,
        "recordWorkOutcome",
        value,
        async (p, session) => {
          const timestamp = now();
          const previous = value.retryable ? await work.findOne({ ownerId: actor.uid, productionId: p._id,
            callId: value.callId, status: { $in: ["dispatching", "unknown"] } }, { session }) : null;
          const retryNotBefore = previous ? await retryTime({ ...previous, updatedAt: timestamp }, session, value.retryAfterMs) : null;
          const result = await work.updateOne(
            {
              ownerId: actor.uid,
              productionId: p._id,
              callId: value.callId,
              status: { $in: ["dispatching", "unknown"] },
            },
            {
              $set: {
                status: value.status,
                retryable: value.retryable,
                ...(retryNotBefore ? { retryNotBefore } : {}),
                updatedAt: timestamp,
              },
              $addToSet: { evidenceIds: { $each: value.evidenceIds } },
            },
            { session },
          );
          if (result.modifiedCount !== 1)
            throw bookletConflict(
              "Work outcome is terminal or was never dispatched.",
            );
        },
      );
    },
    recordAssessment(
      productionId: string,
      input: Mutation & {
        callId: string;
        policyBinding: string;
        reviewerBinding: string;
        assessment: z.input<typeof bookletAssessmentV2Schema>;
        evidenceIds: string[];
      },
    ) {
      const value = mutationInput
        .extend({
          callId: id,
          policyBinding: id,
          reviewerBinding: id,
          assessment: bookletAssessmentV2Schema,
          evidenceIds: ids.min(1),
        })
        .parse(input);
      return mutate(
        productionId,
        value,
        "recordAssessment",
        value,
        async (p, session) => {
          const observedRaw = await work.findOne(
            {
              ownerId: actor.uid,
              productionId: p._id,
              callId: value.callId,
              service: "quality-reviewer",
              status: { $in: ["succeeded", "partial"] },
            },
            { session },
          );
          const observed = observedRaw ? workV2Schema.parse(observedRaw) : null;
          // Current registrations retain every item scope. The legacy metadata-only
          // representation remains readable, without treating a batch as one target.
          const request =
            observed?.requestPayload === undefined
              ? null
              : z
                  .object({
                    items: z.array(
                      z.object({ itemId: id, input: reviewInputV2Schema }),
                    ),
                    references: z.array(z.object({ assetId: id })),
                  })
                  .parse(observed.requestPayload);
          const retained = request
            ? z
                .object({
                  items: z.array(
                    z.object({
                      itemId: id,
                      status: z.string(),
                      proposals: z
                        .array(z.object({ content: bookletAssessmentV2Schema }))
                        .default([]),
                    }),
                  ),
                })
                .parse(observed!.resultPayload)
            : null;
          const item = request?.items.find(
            (item) =>
              item.input.targetHash === value.assessment.targetHash &&
              fingerprint(item.input.targetIds) ===
                fingerprint(value.assessment.coverage.targetIds) &&
              fingerprint(item.input.referencePositions) ===
                fingerprint(value.assessment.coverage.referencePositions) &&
              retained?.items.some(
                (result) =>
                  result.itemId === item.itemId &&
                  result.status === "succeeded" &&
                  result.proposals.some(
                    (proposal) =>
                      fingerprint(proposal.content) ===
                      fingerprint(value.assessment),
                  ),
              ),
          );
          const scope = request
            ? item
              ? {
                  ...item.input,
                  assetIds: item.input.referencePositions.map(
                    (position) => request.references[position].assetId,
                  ),
                }
              : null
            : observed?.reviewScope
              ? { ...observed.reviewScope, targetIds: observed.targetIds }
              : null;
          if (
            !observed ||
            !scope ||
            observed.operation !== value.assessment.mode ||
            scope.targetHash !== value.assessment.targetHash ||
            fingerprint(observed.sources) !==
              fingerprint(value.assessment.sources)
          )
            throw bookletConflict(
              "Assessment is not bound to observed review work.",
            );
          if (request) {
            const matches = retained!.items
              .filter(
                (result) =>
                  result.itemId === item?.itemId &&
                  result.status === "succeeded",
              )
              .flatMap((result) => result.proposals);
            if (
              !observed.resultObservation ||
              matches.length !== 1 ||
              fingerprint(matches[0].content) !== fingerprint(value.assessment)
            )
              throw bookletConflict(
                "Assessment differs from its retained native proposal.",
              );
          }
          if (
            value.evidenceIds.some(
              (evidence) => !observed.evidenceIds.includes(evidence),
            )
          )
            throw bookletConflict(
              "Assessment evidence differs from observed review work.",
            );
          if (
            value.assessment.coverage.targetIds.some(
              (target) => !scope.targetIds.includes(target),
            ) ||
            value.assessment.coverage.referencePositions.some(
              (position) => !scope.referencePositions.includes(position),
            ) ||
            (value.assessment.coverage.assetIds ?? []).some(
              (asset) => !scope.assetIds.includes(asset),
            ) ||
            (value.assessment.coverage.continuityPairs ?? []).some(
              (pair) =>
                !scope.continuityPairs.some(
                  (expected) => fingerprint(expected) === fingerprint(pair),
                ),
            )
          )
            throw bookletConflict("Assessment invented unobserved coverage.");
          const complete =
            fingerprint(scope.targetIds) ===
              fingerprint(value.assessment.coverage.targetIds) &&
            fingerprint(scope.referencePositions) ===
              fingerprint(value.assessment.coverage.referencePositions) &&
            fingerprint(scope.assetIds) ===
              fingerprint(value.assessment.coverage.assetIds ?? []) &&
            fingerprint(scope.continuityPairs) ===
              fingerprint(value.assessment.coverage.continuityPairs ?? []);
          if (value.assessment.disposition === "pass" && !complete)
            throw bookletConflict("Assessment pass omitted inspected scope.");
          const row = assessmentDocumentV2Schema.parse({
            _id: fingerprint([actor.uid, p._id, "assessment", value.key]),
            documentVersion: 2,
            ownerId: actor.uid,
            productionId: p._id,
            callId: value.callId,
            policyBinding: value.policyBinding,
            reviewerBinding: value.reviewerBinding,
            assessment: value.assessment,
            complete,
            evidenceIds: value.evidenceIds,
            createdAt: now(),
          });
          boundState(row);
          await assessments.insertOne(row, { session });
          return { assessmentId: row._id };
        },
      );
    },
    requestHuman(
      productionId: string,
      input: Mutation & z.input<typeof humanRequestInputV2Schema> & { runId: string },
    ) {
      const value = humanRequestInputV2Schema.extend({ ...mutationInput.shape, runId: id }).parse(input);
      return mutate(productionId, value, "requestHuman", value, async (p, session) => {
        if (p.lifecycleState !== "in-progress") throw bookletConflict("Human requests require an admitted production.");
        await activeManager(p, value.runId, value.holderId, session);
        if (new Set(value.targets.map((target) => fingerprint(target))).size !== value.targets.length)
          throw bookletConflict("Duplicate human request target.");
        for (const target of value.targets) {
          const artifact = p.subjects.flatMap((subject) => subject.artifacts).find((artifact) => artifact.id === target.artifactId);
          if (artifact?.currentRevisionId !== target.revisionId || !await revisions.findOne({
            ownerId: actor.uid, productionId: p._id, _id: target.revisionId,
            artifactId: target.artifactId, contentHash: target.contentHash,
          }, { session, projection: { _id: 1 } })) throw bookletConflict("Human request targets must match current owned revisions.");
        }
        const requestId = randomUUID();
        const presentation = uiPayloadSchema.parse({ version: 1, cards: [{
          id: "request-" + requestId, content: { type: "summary", version: 1,
            data: { title: value.question.slice(0, 500), body: value.question.length > 500 ? value.question : "" } },
        }, ...value.presentation.cards] });
        // The native Human Input node appends the response placeholder once.
        const formContent = "```unibase-ui\n" + JSON.stringify(presentation) + "\n```";
        const humanRequest = humanRequestV2Schema.parse({ requestId, runId: value.runId,
          targets: value.targets, responseContract: value.responseContract, formContent,
          presentationHash: fingerprint(formContent + "\n{{#$output.response#}}"),
        });
        boundState(humanRequest);
        return { humanRequest };
      });
    },
    recordAcceptance(
      productionId: string,
      input: Mutation & {
        runId: string;
        revisionId: string;
        contentHash: string;
        targetIds: string[];
        assetIds: string[];
        evidenceIds: string[];
      },
    ) {
      const value = mutationInput
        .extend({
          runId: id,
          revisionId: id,
          contentHash: z.string().regex(/^[a-f0-9]{64}$/),
          targetIds: ids.min(1),
          assetIds: ids,
          evidenceIds: ids,
        })
        .parse(input);
      return mutate(
        productionId,
        value,
        "recordAcceptance",
        value,
        async (p, session) => {
          const revision = await revisions.findOne(
            {
              ownerId: actor.uid,
              productionId: p._id,
              _id: value.revisionId,
              contentHash: value.contentHash,
            },
            { session },
          );
          const subject = p.subjects.find((s) => s.id === revision?.subjectId);
          const artifact = subject?.artifacts.find(
            (a) => a.id === revision?.artifactId,
          );
          if (
            !revision ||
            !subject ||
            !artifact ||
            artifact.kind !== revision.kind ||
            value.targetIds.some(
              (target) => target !== subject.id && target !== artifact.id,
            ) ||
            fingerprint([...value.assetIds].sort()) !==
              fingerprint(revision.assets.map((a) => a.assetId).sort())
          )
            throw bookletConflict("Acceptance identity mismatch.");
          if (p.lifecycleState === "in-progress") {
            await activeManager(p, value.runId, value.holderId, session);
            if (revision.kind !== "book-manifest") await guardCreativeTargets(p, [revision.artifactId], session);
            await guardEvidence(p, value.evidenceIds, session);
          }
          const row = acceptanceDocumentV2Schema.parse({
            runId: value.runId,
            revisionId: value.revisionId,
            contentHash: value.contentHash,
            targetIds: value.targetIds,
            assetIds: value.assetIds,
            evidenceIds: value.evidenceIds,
            _id: fingerprint([actor.uid, p._id, "acceptance", value.key]),
            documentVersion: 2,
            ownerId: actor.uid,
            productionId: p._id,
            createdAt: now(),
          });
          boundState(row);
          await acceptances.insertOne(row, { session });
          artifact.acceptedRevisionId = revision._id;
          return { acceptanceId: row._id };
        },
      );
    },
    async complete(productionId: string, input: Mutation & { runId: string; manifestRevisionId: string }) {
      const value = mutationInput.extend({ runId: id, manifestRevisionId: id }).parse(input);
      // Replay precedes byte I/O; an already committed result needs no storage retry.
      const snapshot = await context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const prior = await receipts.findOne({ _id: fingerprint([actor.uid, "production-v2", p._id, value.key]) }, { session });
        if (prior) {
          if (prior.inputHash !== fingerprint({ method: "complete", input: value })) throw bookletConflict("Changed idempotency payload.");
          return { replay: prior.result };
        }
        const draft = await revisions.findOne({ ownerId: actor.uid, productionId: p._id, _id: value.manifestRevisionId }, { session });
        const artifact = p.subjects.flatMap((subject) => subject.artifacts).find((artifact) => artifact.id === draft?.artifactId);
        if (p.lifecycleState !== "in-progress" || draft?.content.kind !== "book-manifest" || artifact?.acceptedRevisionId !== draft._id)
          throw bookletConflict("Completion requires the Manager-selected immutable manifest.");
        if (draft.content.pages.length !== p.creativeConfigSnapshot.storyPages + Number(p.creativeConfigSnapshot.includeCover))
          throw bookletConflict("Manifest does not contain the purchased pages.");
        return { draft, config: p.creativeConfigSnapshot };
      });
      if ("replay" in snapshot) return snapshot.replay!;
      const { draft, config } = snapshot;
      if (draft.content.kind !== "book-manifest") throw bookletConflict("Invalid manifest.");
      // Verify unchanged original bytes outside the short metadata transaction.
      for (const page of draft.content.pages) {
        const original = (await bookletMedia(db, actor, { documentVersion: 2 }).read(productionId, page.assetId)).asset;
        if (original.originalAssetId || !draft.assets.some((asset) => asset.assetId === page.assetId && asset.sha256 === original.sha256) ||
          original.width !== config.canvas.width || original.height !== config.canvas.height || original.mime !== config.canvas.mime)
          throw bookletConflict("Manifest requires exact original bytes with the purchased canvas and format.");
      }
      return mutate(productionId, value, "complete", value, async (p, session) => {
        await activeManager(p, value.runId, value.holderId, session);
        const entries = new Map(p.subjects.flatMap((subject) => subject.artifacts.map((artifact) => [artifact.id, { subject, artifact }] as const)));
        if (entries.get(draft.artifactId)?.artifact.acceptedRevisionId !== draft._id)
          throw bookletConflict("Selected manifest changed before completion.");
        const selected = new Map<string, RevisionV2>();
        const pending = draft.sources.filter((source) => source.artifactId !== draft.artifactId);
        while (pending.length) {
          const source = pending.pop()!;
          const entry = entries.get(source.artifactId);
          if (entry?.artifact.acceptedRevisionId !== source.revisionId)
            throw bookletConflict("Manifest dependencies must identify exact Manager-selected revisions.");
          const row = selected.get(source.revisionId) ?? await revisions.findOne({ ownerId: actor.uid, productionId: p._id,
            _id: source.revisionId, artifactId: source.artifactId, contentHash: source.contentHash,
          }, { session });
          if (!row || row.contentHash !== source.contentHash || row.artifactId !== source.artifactId ||
            row.kind !== entry.artifact.kind || row.subjectId !== entry.subject.id)
            throw bookletConflict("Manifest dependency identity differs from its owned revision.");
          if (selected.has(row._id)) continue;
          selected.set(row._id, row);
          // Same-artifact predecessor sources are historical lineage, not current dependencies.
          pending.push(...row.sources.filter((dependency) => dependency.artifactId !== row.artifactId));
        }
        const layout = [...selected.values()].find((row) => row.content.kind === "book-layout");
        const manifest = draft.content;
        if (manifest.kind !== "book-manifest" || layout?.content.kind !== "book-layout" ||
          layout.content.canvas.width !== config.canvas.width || layout.content.canvas.height !== config.canvas.height ||
          layout.content.direction !== p.brief.language.direction ||
          fingerprint(layout.content.pages.map((page) => page.id)) !== fingerprint(manifest.pages.map((page) => page.pageId)) ||
          layout.content.pages.filter((page) => page.role === "story").length !== config.storyPages ||
          layout.content.pages.filter((page) => page.role === "cover").length !== Number(config.includeCover) ||
          layout.content.pages.some((page) => page.panels.length > config.maxPanelsPerPage ||
            !p.subjects.some((subject) => subject.id === page.id && subject.kind === "page" && subject.pageRole === page.role)))
          throw bookletConflict("Manifest order, layout, roles, canvas or panel capacity differs from the purchased structure.");
        for (const page of manifest.pages) {
          const image = [...selected.values()].find((row) => row.subjectId === page.pageId && row.content.kind === "page-image");
          if (image?.content.kind !== "page-image") throw bookletConflict("Manifest page has no selected original revision.");
          const original = image.content.asset;
          if (original.assetId !== page.assetId ||
            !draft.assets.some((asset) => asset.assetId === page.assetId && asset.sha256 === original.sha256))
            throw bookletConflict("Manifest page differs from its selected original revision.");
        }
        if (await work.findOne({ ownerId: actor.uid, productionId: p._id, category: { $in: ["paidLlm", "paidImage"] },
          status: { $in: ["dispatching", "unknown"] } }, { session, projection: { _id: 1 } }))
          throw bookletConflict("Reconcile unresolved paid work before completion.");
        p.lifecycleState = "completed";
        p.currentManifestRevisionId = draft._id;
        return { revisionId: draft._id };
      });
    },
    getRevision(productionId: string, revisionId: string) {
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const row = await revisions.findOne(
          {
            _id: id.parse(revisionId),
            ownerId: actor.uid,
            productionId: p._id,
          },
          { session },
        );
        if (!row) throw bookletMissing();
        const subject = p.subjects.find((s) => s.id === row.subjectId);
        if (
          !subject?.artifacts.some(
            (a) => a.id === row.artifactId && a.kind === row.kind,
          )
        )
          throw bookletConflict(
            "Revision identity differs from embedded index.",
          );
        return revisionV2Schema.parse(row);
      });
    },
    indexEntries(
      productionId: string,
      input: Mutation & {
        subjects: z.input<typeof subjectInputSchema>[];
        artifacts: z.input<typeof indexArtifact>[];
      },
    ) {
      const value = mutationInput
        .extend({
          subjects: z.array(subjectInputSchema),
          artifacts: z.array(indexArtifact),
        })
        .refine(
          (v) => v.subjects.length + v.artifacts.length > 0,
          "Index entries are required.",
        )
        .refine(
          (v) =>
            new Set(v.subjects.map((s) => s.id)).size === v.subjects.length &&
            new Set(v.artifacts.map((a) => a.artifactId)).size ===
              v.artifacts.length,
          "Duplicate index identity.",
        )
        .parse(input);
      return mutate(productionId, value, "indexEntries", value, (p) => {
        for (const subject of value.subjects) {
          const existing = p.subjects.find((row) => row.id === subject.id);
          if (existing) {
            if (
              existing.kind !== subject.kind ||
              existing.label !== subject.label ||
              existing.pageRole !== subject.pageRole
            )
              throw bookletConflict("Existing subject identity changed.");
          } else insertSubject(p, subject);
        }
        for (const entry of value.artifacts) {
          const parent = p.subjects.find((row) =>
            row.artifacts.some((artifact) => artifact.id === entry.artifactId),
          );
          const existing = parent?.artifacts.find(
            (artifact) => artifact.id === entry.artifactId,
          );
          if (existing) {
            if (parent?.id !== entry.subjectId || existing.kind !== entry.kind)
              throw bookletConflict("Existing artifact identity changed.");
          } else insertArtifact(p, entry);
        }
      });
    },
    addSubject(
      productionId: string,
      input: Mutation & { subject: z.input<typeof subjectInputSchema> },
    ) {
      const value = mutationInput
        .extend({ subject: subjectInputSchema })
        .parse(input);
      return mutate(productionId, value, "addSubject", value, (p) => {
        insertSubject(p, value.subject);
      });
    },
    addArtifact(
      productionId: string,
      input: Mutation & {
        subjectId: string;
        artifactId: string;
        kind: z.infer<typeof artifactKindV2Schema>;
      },
    ) {
      const value = mutationInput
        .extend({ subjectId: id, artifactId: id, kind: artifactKindV2Schema })
        .parse(input);
      return mutate(productionId, value, "addArtifact", value, (p) => {
        insertArtifact(p, value);
      });
    },
    appendRevision(
      productionId: string,
      input: Mutation & {
        artifactId: string;
        content: z.input<typeof bookletContentV2Schema>;
        sources: z.input<typeof bookletSourceV2Schema>[];
        assets: z.input<typeof assetIdentitySchema>[];
        provenance: z.input<typeof revisionDocumentSchema.shape.provenance>;
        revalidatedFrom?: string;
      },
    ) {
      const value = mutationInput
        .extend({
          artifactId: id,
          content: bookletContentV2Schema,
          sources: z.array(bookletSourceV2Schema),
          assets: z.array(assetIdentitySchema),
          provenance: revisionDocumentSchema.shape.provenance,
          revalidatedFrom: id.optional(),
        })
        .parse(input);
      return mutate(
        productionId,
        value,
        "appendRevision",
        value,
        async (p, session) => {
          const subject = p.subjects.find((s) =>
            s.artifacts.some((a) => a.id === value.artifactId),
          );
          const artifact = subject?.artifacts.find(
            (a) => a.id === value.artifactId,
          );
          if (!subject || !artifact) throw bookletMissing();
          if (artifact.kind !== value.content.kind)
            throw bookletConflict("Revision kind mismatch.");
          let content = value.content;
          let sources = value.sources;
          const image = content.kind === "reference" || content.kind === "page-image";
          const manifest = content.kind === "book-manifest";
          if (content.kind === "book-manifest" && p.lifecycleState === "in-progress") {
            await activeManager(p, value.provenance.runId, value.holderId, session);
            await guardEvidence(p, value.provenance.evidenceIds, session);
            const pageAssets = new Map<string, string>();
            for (const page of content.pages) {
              const parent = p.subjects.find((subject) => subject.kind === "page" && subject.id === page.pageId);
              const artifact = parent?.artifacts.find((artifact) => artifact.kind === "page-image");
              const source = sources.find((source) => source.artifactId === artifact?.id);
              const selected = source && await revisions.findOne({ ownerId: actor.uid, productionId: p._id,
                _id: source.revisionId, artifactId: source.artifactId, contentHash: source.contentHash, kind: "page-image",
              }, { session });
              if (selected?.content.kind !== "page-image" || selected.content.asset.assetId !== page.assetId)
                throw bookletConflict("Manifest pages must identify their owned immutable page-image sources.");
              pageAssets.set(page.assetId, selected.content.asset.sha256);
            }
            if (pageAssets.size !== value.assets.length || value.assets.some((asset) => pageAssets.get(asset.assetId) !== asset.sha256))
              throw bookletConflict("Manifest attachments must match its selected page originals.");
            if (!value.revalidatedFrom) {
              const prior = await revisions.findOne({ ownerId: actor.uid, productionId: p._id, artifactId: artifact.id,
                contentHash: fingerprint(content), sources, assets: value.assets,
              }, { session });
              if (prior) return { revisionId: prior._id, ordinal: prior.ordinal };
            }
          }
          if (value.revalidatedFrom) {
            await activeManager(p, value.provenance.runId, value.holderId, session);
            if (!manifest) await guardCreativeTargets(p, [artifact.id], session);
            const previous = await revisions.findOne({ _id: value.revalidatedFrom, ownerId: actor.uid,
              productionId: p._id, artifactId: artifact.id }, { session });
            if (!previous || fingerprint(previous.content) !== fingerprint(content) ||
              fingerprint(previous.assets) !== fingerprint(value.assets) ||
              value.sources.some((source) => source.artifactId === artifact.id))
              throw bookletConflict("Revalidation must preserve exact content/assets and select replacement dependency sources.");
            const expectedSources = [{ artifactId: previous.artifactId, revisionId: previous._id, contentHash: previous.contentHash }, ...value.sources];
            const retainedProducer = value.provenance.operationId === previous.provenance.operationId &&
              value.provenance.evidenceIds.every((evidence) => previous.provenance.evidenceIds.includes(evidence));
            const assessed = manifest ? null : await assessments.findOne({ ownerId: actor.uid, productionId: p._id,
              callId: value.provenance.operationId, complete: true, "assessment.targetHash": previous.contentHash,
              evidenceIds: { $all: value.provenance.evidenceIds },
            }, { session });
            if (!manifest && (!value.provenance.evidenceIds.length || (!retainedProducer && (!assessed ||
              fingerprint(assessed.assessment.sources) !== fingerprint(expectedSources) ||
              !assessed.assessment.coverage.targetIds.some((target) => target === artifact.id || target === subject.id)))))
              throw bookletConflict("Revalidation requires retained producer evidence or recorded review of the exact replacement context.");
            if (!retainedProducer && image && (!['image', 'correction'].includes(assessed!.assessment.mode) || previous.assets.some((asset) =>
              !(assessed!.assessment.coverage.assetIds ?? []).includes(asset.assetId))))
              throw bookletConflict("Image revalidation requires inspection of its retained original pixels.");
            const prior = await revisions.findOne({ ownerId: actor.uid, productionId: p._id, artifactId: artifact.id,
              revalidatedFrom: previous._id, sources: value.sources }, { session });
            if (prior) return { revisionId: prior._id, ordinal: prior.ordinal };
          } else if (p.lifecycleState !== "draft" && !manifest) {
            await activeManager(
              p,
              value.provenance.runId,
              value.holderId,
              session,
            );
            const raw = await work.findOne(
              {
                ownerId: actor.uid,
                productionId: p._id,
                callId: value.provenance.operationId,
                status: { $in: ["succeeded", "partial"] },
              },
              { session },
            );
            const observed = raw ? workV2Schema.parse(raw) : null;
            if (
              !observed?.resultObservation ||
              (image
                ? observed.category !== "paidImage" || observed.service !== "image-executor" || observed.operation !== "generate"
                : observed.category !== "paidLlm" || ![
                    "story-planner",
                    "manuscript",
                    "art-director",
                    "page-composer",
                  ].includes(observed.service)) ||
              observed.correctionRootId !==
                correctionRoot(p, observed, p.revisionChargeId ?? "platform") ||
              !value.provenance.evidenceIds.length ||
              value.provenance.evidenceIds.some(
                (id) => !observed.evidenceIds.includes(id),
              ) ||
              fingerprint(value.sources) !== fingerprint(observed.sources) ||
              (!image && value.assets.length)
            )
              throw bookletConflict(
                "Revision requires matching retained creative work and funding.",
              );
            let proposals: {
              subjectId: string;
              kind: z.infer<typeof artifactKindV2Schema>;
              content: z.infer<typeof bookletContentV2Schema>;
            }[];
            if (content.kind === "reference" || content.kind === "page-image") {
              if (value.assets.length !== 1 || fingerprint(content) !== fingerprint({ kind: content.kind, asset: value.assets[0] }))
                throw bookletConflict("Image revision requires exactly its selected original identity.");
              const original = await db.collection<BookletAsset>("bookletAssets").findOne({
                _id: content.asset.assetId, ownerId: actor.uid, productionId: p._id, operationId: observed.callId,
                sha256: content.asset.sha256, originalAssetId: null, state: "ready",
              }, { session });
              const result = z.object({ items: z.array(z.object({ outputs: z.array(z.object({ outputKey: id })) })).length(1) })
                .safeParse(observed.resultPayload);
              if (!original || !result.success || result.data.items[0].outputs.filter((output) => output.outputKey === original.outputKey).length !== 1)
                throw bookletConflict("Image revision requires a retained original from the observed Generate output.");
              // The image identity comes from the verified output receipt; the
              // Image Executor returns files, not a model-authored text proposal.
              proposals = [{ subjectId: subject.id, kind: content.kind, content }];
            } else {
              const envelope = z
                .object({
                  items: z.array(
                    z.object({
                      status: z.string(),
                      proposals: z
                        .array(
                          z.object({
                            subjectId: id,
                            kind: artifactKindV2Schema,
                            content: bookletContentV2Schema,
                          }),
                        )
                        .default([]),
                    }),
                  ),
                })
                .parse(observed.resultPayload);
              proposals = envelope.items
                .filter((item) => item.status === "succeeded")
                .flatMap((item) => item.proposals);
            }
            const matching = proposals.filter(
              (proposal) =>
                proposal.subjectId === subject.id &&
                proposal.kind === artifact.kind,
            );
            if (
              matching.length !== 1 ||
              fingerprint(matching[0].content) !== fingerprint(content)
            )
              throw bookletConflict(
                "Revision content differs from the observed proposal.",
              );
            if (
              content.kind === "page-spec" &&
              content.panels.length > p.creativeConfigSnapshot.maxPanelsPerPage
            )
              throw bookletConflict(
                "Page exceeds its purchased panel capacity.",
              );
            if (content.kind === "book-layout") {
              const config = p.creativeConfigSnapshot;
              if (
                content.pages.length !==
                  config.storyPages + Number(config.includeCover) ||
                content.canvas.width !== config.canvas.width ||
                content.canvas.height !== config.canvas.height ||
                content.pages.some(
                  (page) =>
                    page.panels.length > config.maxPanelsPerPage ||
                    !p.subjects.some(
                      (s) =>
                        s.id === page.id &&
                        s.kind === "page" &&
                        s.pageRole === page.role,
                    ),
                )
              )
                throw bookletConflict(
                  "Layout differs from purchased pages, canvas or panel capacity.",
                );
            }
            const rosterKind =
              // Planner outputs are roster deltas; book storage keeps both kinds.
              observed.operation === "cast"
                ? "character"
                : observed.operation === "locations"
                  ? "location"
                  : null;
            const initialRoster =
              observed.service === "story-planner" &&
              rosterKind &&
              z.object({ intent: z.string() }).parse(observed.requestPayload)
                .intent === "create";
            const rosterTarget =
              initialRoster &&
              observed.targetIds.some((target) =>
                p.subjects.some(
                  (parent) =>
                    parent.kind === "book" &&
                    parent.artifacts.some(
                      (a) => a.id === target && a.kind === "roster",
                    ),
                ),
              );
            if (
              !observed.targetIds.includes(artifact.id) &&
              !(
                rosterTarget &&
                subject.kind === rosterKind &&
                artifact.kind === "description" &&
                proposals.some(
                  (proposal) =>
                    proposal.content.kind === "roster" &&
                    proposal.content.subjectIds.includes(subject.id),
                )
              )
            )
              throw bookletConflict(
                "Revision escaped the registered artifact scope.",
              );
            await guardCreativeTargets(p, [artifact.id], session);
            const priorWrite = await revisions.findOne(
              {
                ownerId: actor.uid,
                productionId: p._id,
                artifactId: artifact.id,
                "provenance.operationId": observed.callId,
                ...(content.kind === "reference" || content.kind === "page-image" ? { "assets.assetId": content.asset.assetId } : {}),
              },
              { session },
            );
            if (priorWrite)
              return {
                revisionId: priorWrite._id,
                ordinal: priorWrite.ordinal,
              };
            if (content.kind === "roster") {
              if (
                !rosterKind ||
                observed.service !== "story-planner" ||
                content.subjectIds.some(
                  (subjectId) =>
                    !p.subjects.some(
                      (s) => s.id === subjectId && s.kind === rosterKind,
                    ),
                )
              )
                throw bookletConflict(
                  "Roster delta has unregistered or wrong-kind subjects.",
                );
              const previous = artifact.currentRevisionId
                ? await revisions.findOne(
                    {
                      _id: artifact.currentRevisionId,
                      ownerId: actor.uid,
                      productionId: p._id,
                      artifactId: artifact.id,
                    },
                    { session },
                  )
                : null;
              const retained =
                previous?.content.kind === "roster"
                  ? previous.content.subjectIds.filter((subjectId) =>
                      p.subjects.some(
                        (s) => s.id === subjectId && s.kind !== rosterKind,
                      ),
                    )
                  : [];
              if (previous) {
                const selected = sources.find(
                  (source) => source.artifactId === artifact.id,
                );
                if (
                  selected &&
                  (selected.revisionId !== previous._id ||
                    selected.contentHash !== previous.contentHash)
                )
                  throw bookletConflict(
                    "Roster source changed before applying its delta.",
                  );
                if (!selected)
                  sources = [
                    ...sources,
                    {
                      artifactId: artifact.id,
                      revisionId: previous._id,
                      contentHash: previous.contentHash,
                    },
                  ];
              }
              content = {
                ...content,
                subjectIds: [...retained, ...content.subjectIds],
              };
            }
          }
          if (
            new Set(value.sources.map((s) => s.artifactId)).size !==
              value.sources.length ||
            new Set(value.assets.map((a) => a.assetId)).size !==
              value.assets.length
          )
            throw bookletConflict("Duplicate source or asset identity.");
          for (const source of sources) {
            const row = await revisions.findOne(
              {
                _id: source.revisionId,
                ownerId: actor.uid,
                productionId: p._id,
              },
              { session },
            );
            if (
              !row ||
              row.artifactId !== source.artifactId ||
              row.contentHash !== source.contentHash
            )
              throw bookletConflict("Source identity or hash mismatch.");
          }
          for (const asset of value.assets) {
            const row = await db
              .collection<BookletAsset>("bookletAssets")
              .findOne(
                {
                  _id: asset.assetId,
                  ownerId: actor.uid,
                  productionId: p._id,
                  sha256: asset.sha256,
                  state: "ready",
                  originalAssetId: null,
                },
                { session },
              );
            if (!row)
              throw bookletConflict("Original asset identity mismatch.");
          }
          if (
            value.content.kind === "reference" ||
            value.content.kind === "page-image"
          ) {
            const original = value.content.asset;
            if (
              !value.assets.some(
                (a) =>
                  a.assetId === original.assetId &&
                  a.sha256 === original.sha256,
              )
            )
              throw bookletConflict("Content original is not attached.");
          }
          if (
            (value.content.kind === "description" &&
              value.content.subjectKind !== subject.kind) ||
            (value.content.kind === "page-spec" &&
              value.content.pageId !== subject.id)
          )
            throw bookletConflict("Content subject identity mismatch.");
          const prior = await revisions
            .find(
              {
                ownerId: actor.uid,
                productionId: p._id,
                artifactId: artifact.id,
              },
              { session },
            )
            .sort({ ordinal: -1 })
            .limit(1)
            .next();
          const row = revisionV2Schema.parse({
            _id: randomUUID(),
            documentVersion: 2,
            ownerId: actor.uid,
            productionId: p._id,
            artifactId: artifact.id,
            subjectId: subject.id,
            kind: artifact.kind,
            ordinal: (prior?.ordinal ?? 0) + 1,
            content,
            sources,
            assets: value.assets,
            provenance: value.provenance,
            ...(value.revalidatedFrom ? { revalidatedFrom: value.revalidatedFrom } : {}),
            contentHash: fingerprint(content),
            createdAt: now(),
          });
          if (BSON.calculateObjectSize(row) > 4 * 1024 * 1024)
            throw bookletConflict("Revision exceeds its storage limit.");
          await revisions.insertOne(row, { session });
          for (const asset of value.assets)
            await db
              .collection<BookletAsset>("bookletAssets")
              .updateOne(
                { _id: asset.assetId, ownerId: actor.uid, productionId: p._id },
                { $addToSet: { attachments: row._id } },
                { session },
              );
          artifact.currentRevisionId = row._id;
          return { revisionId: row._id, ordinal: row.ordinal };
        },
      );
    },
    refreshFence(productionId: string, input: Mutation) {
      if (!options.atomicMutations)
        throw bookletConflict("Fence refresh requires atomic gateway writes.");
      const value = mutationInput.parse(input);
      return mutate(
        productionId,
        value,
        "refreshFence",
        value,
        async (p, session) => {
          await activeManager(p, value.holderId, value.holderId, session);
        },
      );
    },
    async acquireLease(
      productionId: string,
      input: {
        key: string;
        holderId: string;
        expectedVersion: number;
        durationMs: number;
      },
    ) {
      const value = z
        .strictObject({
          key: id,
          holderId: id,
          expectedVersion: z.number().int().positive().safe(),
          durationMs: z.number().int().min(1000).max(300000),
        })
        .parse(input);
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const identity = fingerprint([
          actor.uid,
          "production-v2",
          p._id,
          value.key,
        ]);
        const inputHash = fingerprint({ method: "acquireLease", input: value });
        const prior = await receipts.findOne({ _id: identity }, { session });
        if (prior) {
          if (prior.inputHash !== inputHash)
            throw bookletConflict("Changed idempotency payload.");
          return prior.result;
        }
        // A completed Manager still checkpoints and releases its short lease.
        // Every creative mutation keeps the normal closed-state guard.
        mutable(p, value.expectedVersion, true);
        if (p.mutationLease && p.mutationLease.expiresAt > now())
          throw bookletConflict("Production already leased.");
        p.fenceCounter++;
        p.mutationLease = {
          holderId: value.holderId,
          fence: p.fenceCounter,
          expiresAt: new Date(now().getTime() + value.durationMs),
        };
        await save(p, value.expectedVersion, session);
        const result = { id: p._id, version: p.version, fence: p.fenceCounter };
        await receipts.insertOne(
          {
            _id: identity,
            ownerId: actor.uid,
            productionId: p._id,
            scope: "production-v2:" + p._id,
            key: value.key,
            inputHash,
            result,
            createdAt: now(),
          },
          { session },
        );
        return result;
      });
    },
    checkpoint(
      productionId: string,
      input: Mutation & { expectedCheckpointVersion: number; state: unknown },
    ) {
      const value = mutationInput
        .extend({
          expectedCheckpointVersion: z.number().int().nonnegative().safe(),
          state: z.json(),
        })
        .parse(input);
      return mutate(productionId, value, "checkpoint", value, (p) => {
        if (p.checkpointVersion !== value.expectedCheckpointVersion)
          throw bookletConflict("Checkpoint changed.");
        p.checkpoint = value.state;
        p.checkpointVersion++;
      });
    },
    releaseLease(productionId: string, input: Mutation) {
      const value = mutationInput.parse(input);
      return mutate(productionId, value, "releaseLease", value, (p) => {
        p.mutationLease = null;
      });
    },
  };
}
