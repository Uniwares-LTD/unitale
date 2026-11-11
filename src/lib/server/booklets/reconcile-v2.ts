import "server-only";
import type { Db } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import type { AiJob } from "../ai/jobs";
import type {
  ProviderEvent,
  ProviderExecution,
  ProviderOutcome,
} from "../ai/types";
import { bookletRepositoryV2 } from "./repository-v2";
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
    executionLocator?: { runId: string; nodeId?: string; executionId?: string };
    execution?: (
      job: AiJob,
      signal: AbortSignal,
    ) => Promise<ProviderOutcome<ProviderExecution>>;
    trace?: (job: AiJob) => Promise<ProviderEvent[]>;
  } = {},
) {
  const repository = bookletRepositoryV2(db, actor);
  const before = await repository.getWork(productionId, callId);
  const reasoning =
    before.service === "manager" && before.operation === "reason";
  const nodeId = reasoning ? "decide" : `child-${before.service}`;
  const summary = (row: typeof before, reason?: string) => ({
    callId: row.callId,
    requestHash: row.requestHash,
    status: row.status,
    retryable: row.retryable,
    resultAvailable: row.resultPayload !== undefined,
    document: { kind: "work", id: row.callId },
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
  if (execution.kind !== "ok") return summary(before, "execution_unconfirmed");
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
      for (const event of nodes)
        if (event.type === "node-observation") {
          signal.throwIfAborted();
          await observeBookletNodeV2(
            db,
            { ...fresh, execution: execution.value },
            event.node,
            session,
          );
        }
    });
  } finally {
    await session.endSession();
  }
  return summary(await repository.getWork(productionId, callId));
}
