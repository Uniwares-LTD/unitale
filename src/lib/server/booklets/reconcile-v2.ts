import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, Filter } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import type { AiJob } from "../ai/jobs";
import type {
  ProviderEvent,
  ProviderExecution,
  ProviderOutcome,
  ProviderFailure,
} from "../ai/types";
import { productionV2Schema, workV2Schema, type WorkV2 } from "./documents-v2";
import { fingerprint } from "../foundation/canonical";
import { retainEvidence } from "../execution/measurements";
import { bootstrapSettings } from "../settings";
import { baseSettingsSchema } from "../../contracts/settings";
import { observeBookletNodeV2 } from "./observations-v2";
import { bookletConflict, bookletMissing } from "./context";

/** Read existing native execution only. The caller cannot select a provider/app,
 * start work, replace an execution identity, or turn absence into safe retry. */
export async function reconcileBookletWorkV2(
  db: Db,
  actor: CreditActor,
  productionId: string,
  callId: string,
  signal: AbortSignal,
  readback: {
    // Internal worker claim only; not exposed by the MCP request schema.
    leaseId?: string;
    executionLocator?: { runId: string; nodeId?: string; executionId?: string };
    execution?: (
      job: AiJob,
      signal: AbortSignal,
    ) => Promise<ProviderOutcome<ProviderExecution>>;
    trace?: (job: AiJob) => Promise<ProviderEvent[]>;
  } = {},
) {
  // Accepted-work retention must survive account/entitlement revocation. The MCP
  // wrapper still authenticates current access; this internal read grants no writes.
  const readWork = async () => {
    const row = await db
      .collection<WorkV2>("bookletWork")
      .findOne({ ownerId: actor.uid, productionId, callId });
    if (!row) throw bookletMissing();
    return workV2Schema.parse(row);
  };
  const before = await readWork();
  const reasoning =
    before.service === "manager" && before.operation === "reason";
  const nodeId = reasoning ? "decide" : `child-${before.service}`;
  const summary = (
    row: typeof before,
    reason?: string,
    readFailure?: ProviderFailure,
    retryAfterMs?: number,
  ) => ({
    callId: row.callId,
    requestHash: row.requestHash,
    status: row.status,
    retryable: row.retryable,
    resultAvailable: row.resultPayload !== undefined,
    document: { kind: "work", id: row.callId },
    readFailure: readFailure ?? null,
    retryAfterMs: retryAfterMs ?? null,
    ...(reason ? { reconciliation: reason } : {}),
  });
  const known =
    before.status === "registered" ||
    (before.resultPayload !== undefined &&
      ["succeeded", "failed"].includes(before.status));
  if (known && !readback.executionLocator) return summary(before);
  const jobs = db.collection<AiJob>("aiJobs");
  const parent = await jobs.findOne({
    _id: before.runId,
    uid: actor.uid,
    "run.target.adapter": "booklet",
    "run.target.version": "2",
    "run.target.id": productionId,
  });
  if (!parent) throw bookletMissing();
  const locator = readback.executionLocator;
  if (
    locator &&
    (locator.runId !== parent.runId ||
      (locator.nodeId && locator.nodeId !== nodeId))
  )
    throw bookletConflict(
      "Locator differs from the registered native execution.",
    );
  if (known) return summary(before);
  if (!parent.runId || !parent.run?.orchestrator.workflowId)
    return summary(before, "native_identity_pending");
  signal.throwIfAborted();
  const execution = await (
    readback.execution ??
    (async (job, signal) => {
      const { providerForRun } = await import("../runs/provider");
      return (await providerForRun(job, db)).retrieve(job.runId!, signal);
    })
  )(parent, signal);
  if (execution.kind !== "ok")
    return summary(
      before,
      "execution_unconfirmed",
      execution.failure,
      execution.retryAfterMs,
    );
  if (
    execution.value.runId !== parent.runId ||
    execution.value.workflowId !== parent.run.orchestrator.workflowId
  )
    return summary(before, "execution_identity_mismatch");
  const observedParent = { ...parent, execution: execution.value };
  const events = await (
    readback.trace ??
    (async (job) => {
      const { tracingForRun } = await import("../runs/provider");
      return tracingForRun(job);
    })
  )(observedParent);
  signal.throwIfAborted();
  const nodes = events.filter(
    (event) =>
      event.type === "node-observation" &&
      event.node.nodeId === nodeId &&
      (!reasoning ||
        (event.node.id === before.resultObservation?.executionId &&
          (event.node.retryIndex ?? 0) ===
            (before.resultObservation?.retryIndex ?? 0))) &&
      (!locator?.executionId || event.node.id === locator.executionId),
  );
  if (!nodes.length) return summary(before, "child_result_pending");
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      signal.throwIfAborted();
      // Ownership and accepted native identity are rechecked after network I/O.
      // This does not acquire or rewrite the AI worker's job lease or status.
      const fresh = await jobs.findOne(
        {
          _id: parent._id,
          uid: actor.uid,
          runId: parent.runId,
          "run.target.adapter": "booklet",
          "run.target.version": "2",
          "run.target.id": productionId,
          "run.orchestrator.workflowId": parent.run!.orchestrator.workflowId,
        },
        { session },
      );
      if (!fresh) throw bookletMissing();
      if (
        readback.leaseId &&
        !(await db.collection<WorkV2>("bookletWork").findOne(
          {
            _id: before._id,
            ownerId: actor.uid,
            productionId,
            "reconciliation.leaseId": readback.leaseId,
            "reconciliation.leaseUntil": { $gt: new Date() },
          },
          { session },
        ))
      )
        throw bookletConflict("Readback claim expired or changed.");
      for (const event of nodes)
        if (event.type === "node-observation") {
          signal.throwIfAborted();
          await observeBookletNodeV2(
            db,
            { ...fresh, execution: execution.value },
            event.node,
            session,
            before.callId,
          );
        }
    });
  } finally {
    await session.endSession();
  }
  return summary(await readWork());
}

/** One non-paid readback per existing AI-worker cycle. Never dispatches or resumes
 * a workflow, changes a production fence, or acquires an AI-job lease. */
export async function reconcileOneBookletWorkV2(
  db: Db,
  now = new Date(),
  readback: Pick<
    NonNullable<Parameters<typeof reconcileBookletWorkV2>[5]>,
    "execution" | "trace"
  > = {},
) {
  const records = db.collection<WorkV2>("bookletWork");
  const due: Filter<WorkV2> = {
    documentVersion: 2 as const,
    $and: [
      {
        $or: [
          { status: { $in: ["dispatching", "unknown"] } },
          { status: "succeeded", resultPayload: { $exists: false } },
        ],
      },
      {
        $or: [
          { reconciliation: { $exists: false } },
          { "reconciliation.nextAt": { $lte: now, $ne: null } },
        ],
      },
      {
        $or: [
          { "reconciliation.leaseUntil": { $exists: false } },
          { "reconciliation.leaseUntil": { $lte: now } },
        ],
      },
    ],
  };
  const candidate = await records.findOne(due, {
    sort: { "reconciliation.nextAt": 1, createdAt: 1, _id: 1 },
  });
  if (!candidate) return false;
  const leaseId = randomUUID();
  const state = {
    failedReads: 0,
    nextAt: now,
    reason: null,
    ...candidate.reconciliation,
    leaseId,
    leaseUntil: new Date(now.getTime() + 180000),
  };
  const claimed = await records.findOneAndUpdate(
    { ...due, _id: candidate._id },
    { $set: { reconciliation: state } },
    { returnDocument: "after" },
  );
  if (!claimed) return false;
  const row = workV2Schema.parse(claimed);
  const job = await db
    .collection<AiJob>("aiJobs")
    .findOne({
      _id: row.runId,
      uid: row.ownerId,
      "run.target.adapter": "booklet",
      "run.target.version": "2",
      "run.target.id": row.productionId,
    });
  const stored = await db
    .collection("bookletProductions")
    .findOne({
      _id: row.productionId as never,
      ownerId: row.ownerId,
      documentVersion: 2,
    });
  const production = stored ? productionV2Schema.parse(stored) : null;
  const deadline =
    job?.reviewAfter ??
    new Date(
      row.createdAt.getTime() + (job?.run?.reconciliationHours ?? 24) * 3600000,
    );
  let reason = "native_identity_pending",
    failedRead = false,
    resolved = false;
  let readFailure: string | null = null,
    retryAfterMs = 0;
  if (now >= deadline) reason = "reconciliation_deadline";
  else if (state.failedReads > (production?.retryPolicy.nonPaid ?? 0))
    reason = "read_retries_exhausted";
  else if (production && job?.runId && job.run?.orchestrator.workflowId) {
    try {
      const result = await reconcileBookletWorkV2(
        db,
        { uid: row.ownerId, authTime: 0 },
        row.productionId,
        row.callId,
        AbortSignal.timeout(60000),
        { ...readback, leaseId },
      );
      resolved =
        result.resultAvailable &&
        ["succeeded", "partial", "failed"].includes(result.status);
      reason =
        result.reconciliation ??
        (resolved ? "result_retained" : "child_result_pending");
      readFailure = result.readFailure;
      if (
        typeof result.retryAfterMs === "number" &&
        Number.isFinite(result.retryAfterMs) &&
        result.retryAfterMs > 0
      )
        retryAfterMs = Math.min(
          result.retryAfterMs,
          (job.run.retryMaxSeconds ?? 60) * 1000,
        );
      failedRead = [
        "execution_unconfirmed",
        "execution_identity_mismatch",
      ].includes(reason);
      if (["authentication", "invalid-request"].includes(readFailure ?? ""))
        reason = "read_non_retriable";
    } catch {
      // Fixed code only; provider errors may contain credentials or signed URLs.
      reason = "readback_failed";
      failedRead = true;
    }
  }
  const finished = new Date(Math.max(now.getTime(), Date.now()));
  const failedReads = state.failedReads + Number(failedRead);
  if (failedReads > (production?.retryPolicy.nonPaid ?? 0))
    reason = "read_retries_exhausted";
  if (finished >= deadline) reason = "reconciliation_deadline";
  const stopped =
    resolved ||
    [
      "native_identity_pending",
      "read_retries_exhausted",
      "reconciliation_deadline",
      "read_non_retriable",
      "execution_identity_mismatch",
    ].includes(reason);
  const seconds = failedRead
    ? Math.min(
        job?.run?.retryMaxSeconds ?? 60,
        (job?.run?.retryBaseSeconds ?? 2) * 2 ** Math.min(failedReads - 1, 30),
      )
    : (job?.run?.pollSeconds ?? 5);
  const nextAt = stopped
    ? null
    : new Date(
        Math.min(
          deadline.getTime(),
          finished.getTime() + Math.max(seconds * 1000, retryAfterMs),
        ),
      );
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const updated = await records.updateOne(
        {
          _id: row._id,
          ownerId: row.ownerId,
          productionId: row.productionId,
          "reconciliation.leaseId": leaseId,
          "reconciliation.leaseUntil": { $gt: finished },
        },
        {
          $set: {
            reconciliation: {
              nextAt,
              failedReads,
              leaseId: null,
              leaseUntil: new Date(0),
              reason,
            },
          },
        },
        { session },
      );
      if (!updated.modifiedCount) return;
      const settings = await db
        .collection<{ _id: string; settings: unknown }>("baseSettings")
        .findOne({ _id: "base" }, { session });
      await retainEvidence(
        db,
        row.ownerId,
        {
          id: fingerprint([row._id, "reconcile", leaseId]),
          runId: row.runId,
          operationId: row.callId,
          kind: "trace",
          retentionDays: baseSettingsSchema.parse(
            settings?.settings ?? bootstrapSettings(),
          ).execution.rawLogRetentionDays,
          payload: {
            category: "nonPaid",
            code: reason,
            callId: row.callId,
            runId: row.runId,
            timestamp: finished.toISOString(),
            readFailure,
            failedReads,
            nextAt: nextAt?.toISOString() ?? null,
            resultAvailable: resolved,
          },
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  return true;
}
