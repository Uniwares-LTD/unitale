import "server-only";
import { BSON, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import type { AiJob } from "../ai/jobs";
import type { ProviderNodeObservation } from "../ai/types";
import { fingerprint } from "../foundation/canonical";
import { retainEvidence } from "../execution/measurements";
import { bootstrapSettings } from "../settings";
import { baseSettingsSchema } from "../../contracts/settings";
import { workV2Schema, type WorkV2 } from "./documents-v2";
import { bookletConflict } from "./context";

const services = [
  "story-planner",
  "manuscript",
  "art-director",
  "page-composer",
  "image-executor",
  "quality-reviewer",
] as const;
const resultSchema = z
  .object({
    contractVersion: z.literal(2),
    invocationId: z.string(),
    callId: z.string(),
    service: z.enum(services),
    operation: z.string(),
    status: z.enum([
      "succeeded",
      "partial",
      "failed",
      "needs_input",
      "unknown",
    ]),
    items: z
      .array(
        z
          .object({
            itemId: z.string(),
            status: z.enum([
              "succeeded",
              "partial",
              "failed",
              "needs_input",
              "unknown",
            ]),
          })
          .catchall(z.json()),
      )
      .min(1),
  })
  .catchall(z.json());

function unpack(outputs: ProviderNodeObservation["outputs"]) {
  let value: unknown = outputs?.json ?? outputs?.result;
  if (Array.isArray(value)) {
    if (value.length !== 1) return null;
    value = value[0];
  }
  if (typeof value === "object" && value !== null && "result" in value)
    value = value.result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return resultSchema.safeParse(value);
}

/** Called only by the native worker observation hook, in its fenced transaction.
 * Retention is independent of current dispatch/entitlement, so late bytes can survive
 * cancellation. It cannot publish revisions, grant retries, or invoke a provider. */
export async function observeBookletNodeV2(
  db: Db,
  job: AiJob,
  node: ProviderNodeObservation,
  session: ClientSession,
) {
  if (!session.inTransaction())
    throw new Error("Observation requires the worker transaction.");
  const target = job.run?.target;
  if (
    target?.adapter !== "booklet" ||
    target.version !== "2" ||
    !job.run?.orchestrator.workflowId ||
    node.runId !== job.runId ||
    job.execution?.workflowId !== job.run.orchestrator.workflowId ||
    node.nodeType !== "tool"
  )
    return;
  const service = services.find(
    (service) => node.nodeId === `child-${service}`,
  );
  if (!service) return;
  // A truncated/missing output is never evidence that an action failed safely.
  if (node.outputsTruncated !== false || node.status !== "succeeded") return;
  const parsed = unpack(node.outputs);
  if (!parsed?.success || parsed.data.service !== service) return;
  const result = parsed.data;
  const records = db.collection<WorkV2>("bookletWork");
  const raw = await records.findOne(
    {
      ownerId: job.uid,
      productionId: target.id,
      runId: job._id,
      callId: result.callId,
      service,
      operation: result.operation,
    },
    { session },
  );
  if (!raw) return;
  const row = workV2Schema.parse(raw);
  const request = z
    .object({
      invocationId: z.string(),
      items: z.array(z.object({ itemId: z.string() })),
    })
    .safeParse(row.requestPayload);
  if (
    !request.success ||
    request.data.invocationId !== result.invocationId ||
    result.items.length !== request.data.items.length ||
    new Set(result.items.map((item) => item.itemId)).size !==
      result.items.length ||
    result.items.some(
      (item) =>
        !request.data.items.some((expected) => expected.itemId === item.itemId),
    )
  )
    return;
  const states = result.items.map((item) => item.status);
  const status = states.every((s) => s === "succeeded")
    ? "succeeded"
    : states.includes("succeeded") || states.includes("partial")
      ? "partial"
      : states.every((s) => s === "failed")
        ? "failed"
        : states.includes("unknown")
          ? "unknown"
          : "needs_input";
  if (result.status !== status) return;
  if (
    row.resultPayload !== undefined &&
    fingerprint(row.resultPayload) === fingerprint(result)
  )
    return;
  if (!["dispatching", "unknown"].includes(row.status))
    throw bookletConflict(
      "A different outcome is already retained for this work.",
    );
  const identity = {
    runId: node.runId,
    nodeId: node.nodeId,
    executionId: node.id,
    retryIndex: node.retryIndex,
    iterationId: node.iterationId,
    loopId: node.loopId,
  };
  const evidenceId = fingerprint([job._id, identity, result]);
  // Validate size before any writes. Raw creative bodies do not pass through the
  // diagnostic redactor; the separate trace is deliberately redacted.
  const outcome = workV2Schema.parse({
    ...row,
    resultPayload: result,
    resultObservation: identity,
    status: status === "needs_input" ? "partial" : status,
    retryable: false,
    evidenceIds: [...new Set([...row.evidenceIds, evidenceId])],
    updatedAt: new Date(),
  });
  if (BSON.calculateObjectSize(outcome) > 4 * 1024 * 1024)
    throw bookletConflict("Retained work exceeds its storage limit.");
  // readSettings may seed outside the caller's transaction. Read the configuration
  // in this session instead, with the same local bootstrap default and no side write.
  const settings = await db
    .collection<{ _id: string; settings: unknown }>("baseSettings")
    .findOne({ _id: "base" }, { session });
  const retentionDays = baseSettingsSchema.parse(
    settings?.settings ?? bootstrapSettings(),
  ).execution.rawLogRetentionDays;
  await retainEvidence(
    db,
    job.uid,
    {
      id: evidenceId,
      runId: job._id,
      operationId: row.callId,
      kind: "trace",
      retentionDays,
      payload: {
        ...identity,
        status: node.status,
        error: node.error,
        executionMetadata: node.executionMetadata,
      },
    },
    session,
  );
  await records.replaceOne(
    {
      _id: row._id,
      ownerId: job.uid,
      productionId: target.id,
      status: row.status,
    },
    outcome,
    { session },
  );
}
