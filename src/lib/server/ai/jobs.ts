import { enqueueNotification } from "../notifications";
import type { Document } from "mongodb";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ClientSession, Db } from "mongodb";
import { AppError } from "@/lib/auth-policy";
import {
  aiPricingSchema,
  maximumCredits,
  type AiPricing,
} from "@/lib/config/ai-pricing";
import { calculateAiCharge, type AiCharge } from "@/lib/ai-pricing";
import type { CreditActor } from "../store/credit-types";
import {
  accessPermitsSession,
  type AccountAccess,
  type AuditEntry,
} from "../store/access";
import {
  finishManagedReservation,
  readWallet,
  reserveCredits,
} from "../store/credits";
import type {
  Json,
  ProviderEvent,
  ProviderExecution,
  ProviderNodeObservation,
  UsageObservation,
} from "./types";

export type BindingSnapshot = {
  name: string;
  revision: string;
  kind: "workflow" | "completion";
  mode: "fake" | "live";
  // Hash of provider connection and accepted configuration. Never persist the key.
  fingerprint: string;
};
export type AiJob = {
  consumption?: { orderId: string; workflowId: string };
  runSuccessorId?: string;
  operatorResolved?: boolean;
  run?: {
    answerer?: import("../runs/personas").PersonaSnapshot;
    takenOver?: boolean;
    artifactId?: string;
    target?: import("../domains").OwnedTarget;
    logicalId: string;
    attempt: number;
    predecessorId: string | null;
    orchestrator: import("@/lib/contracts/runs").OrchestratorDefinition;
    configurationRevision: number;
    settingsRevision: number;
    failureCharging: "success-only" | "verified-usage";
    concurrentPerAccount: number;
    reconciliationHours: number;
    retryBaseSeconds: number;
    retryMaxSeconds: number;
    pollSeconds: number;
    imageBytes: number;
    imagePixels: number;
  };
  _id: string;
  uid: string;
  authTime: number;
  schemaVersion: 1;
  capability: string;
  capabilityVersion: string;
  binding: BindingSnapshot;
  fingerprint: string;
  inputs: Record<string, Json>;
  source: {
    type: string;
    id: string;
    version: string;
  } | null;
  credits: number;
  pricing?: AiPricing;
  charge?: AiCharge & { usage: UsageObservation | null };
  responder?: {
    parentId: string;
    decisionId: string;
    completion: import("../runs/persona-completion-settings").CompletionSnapshot;
  };
  responderCharge?: number;
  responderFee?: number;
  parentCharge?: number;
  reservationId: string | null;
  status:
    | "queued"
    | "dispatching"
    | "running"
    | "paused"
    | "unknown"
    | "needs-review"
    | "settlement-blocked"
    | "succeeded"
    | "failed"
    | "cancelled";
  runId: string | null;
  taskId: string | null;
  execution: ProviderExecution | null;
  lease: string | null;
  leaseUntil: Date;
  attempts: number;
  nextAttemptAt: Date;
  reviewAfter: Date;
  cancelRequested: boolean;
  applicationWait?: boolean;
  failure: string | null;
  // Operator-only cause behind a generic failure code; never user-facing.
  failureDetail?: { reason: string; at: Date };
  createdAt: Date;
  updatedAt: Date;
  cleanedAt?: Date;
  terminationEvidence?:
    | "not-dispatched"
    | "provider-rejected"
    | "provider-failed"
    | "provider-stopped"
    | "provider-completed"
    | "unverified";
};
export function canStartNewAttempt(
  job: Pick<AiJob, "status" | "terminationEvidence"> &
    Partial<Pick<AiJob, "execution" | "operatorResolved">>,
) {
  return (
    ["failed", "cancelled"].includes(job.status) &&
    Boolean(
      job.operatorResolved ||
      (job.terminationEvidence && job.terminationEvidence !== "unverified") ||
      ["failed", "stopped"].includes(job.execution?.status ?? ""),
    )
  );
}
export type AiUsage = UsageObservation & {
  _id: string;
  uid: string;
  jobId: string;
  runId: string;
  capability: string;
  provider: "dify" | "openai-compatible" | "fake";
  timestamp: Date;
};
export const aiJobs = (db: Db) => db.collection<AiJob>("aiJobs");
export const aiUsage = (db: Db) => db.collection<AiUsage>("aiUsage");
const terminal = ["succeeded", "failed", "cancelled"] as const;

function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}
export function fingerprint(value: Json): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function conflict() {
  return new AppError(
    "AI_CONFLICT",
    "The execution changed. Refresh and try again.",
    409,
  );
}

export async function createAiJob(
  db: Db,
  actor: CreditActor,
  key: string,
  request: Pick<
    AiJob,
    | "capability"
    | "capabilityVersion"
    | "binding"
    | "inputs"
    | "source"
    | "credits"
  > & {
    pricing?: AiPricing;
    consumption?: AiJob["consumption"];
    run?: AiJob["run"];
    responder?: AiJob["responder"];
  },
  now = new Date(),
  admission?: (session: ClientSession) => Promise<void>,
) {
  if (
    !/^[A-Za-z0-9_:-]{1,128}$/.test(key) ||
    !Number.isSafeInteger(request.credits) ||
    request.credits < 0
  )
    throw new AppError("AI_INVALID_REQUEST", "Invalid execution request.");
  if (
    request.consumption &&
    (request.credits !== 0 ||
      request.pricing ||
      request.responder ||
      request.run?.answerer)
  )
    throw new AppError(
      "AI_PREPAID_PRICE",
      "Consumption executions cannot reserve or settle additional credits.",
      409,
    );
  if (request.pricing) {
    const pricing = aiPricingSchema.parse(request.pricing);
    if (
      maximumCredits(pricing) + (request.run?.answerer?.maximum ?? 0) !==
      request.credits
    )
      throw new AppError(
        "AI_INVALID_PRICE",
        "Reservation must match the pricing maximum.",
      );
  }
  z.record(z.string(), z.json()).parse(request.inputs);
  if (Buffer.byteLength(JSON.stringify(request.inputs)) > 64 * 1024)
    throw new AppError(
      "AI_INPUT_TOO_LARGE",
      "Execution input is too large.",
      413,
    );
  const jobId = fingerprint([actor.uid, key]);
  const requestHash = fingerprint(request);
  let saved: AiJob | null = null;
  const persist = async (
    session: ClientSession,
    result: { reservationId?: string },
  ) => {
    const prior = await aiJobs(db).findOne({ _id: jobId }, { session });
    if (prior) {
      if (prior.fingerprint !== requestHash)
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "This request key was already used for different inputs.",
          409,
        );
      saved = prior;
      return;
    }
    if (request.run && request.run.attempt > 100)
      throw new AppError(
        "RUN_ATTEMPT_LIMIT",
        "This run reached its attempt limit. Start a new run.",
        409,
      );
    await admission?.(session);
    if (request.consumption) {
      const { bindConsumptionJob } = await import("../commerce/orders");
      await bindConsumptionJob(
        db,
        actor.uid,
        request.consumption.orderId,
        request.consumption.workflowId,
        jobId,
        request.run?.target?.id ?? request.source?.id,
        session,
      );
    }
    if (request.run?.predecessorId) {
      const predecessor = await aiJobs(db).findOne(
        { _id: request.run.predecessorId, uid: actor.uid },
        { session },
      );
      if (
        !predecessor ||
        !canStartNewAttempt(predecessor) ||
        predecessor.runSuccessorId ||
        predecessor.run?.logicalId !== request.run.logicalId
      )
        throw new AppError(
          "RUN_CONFLICT",
          "This attempt cannot be restarted. Reload its state.",
          409,
        );
      await aiJobs(db).updateOne(
        { _id: predecessor._id },
        { $set: { runSuccessorId: jobId } },
        { session },
      );
    }
    if (
      (await aiJobs(db).countDocuments(
        {
          uid: actor.uid,
          responder: { $exists: false },
          status: { $nin: terminal },
        },
        { session },
      )) >= (request.run?.concurrentPerAccount ?? 5) &&
      !request.responder
    )
      throw new AppError(
        "AI_CONCURRENCY_LIMIT",
        "Finish or resolve existing executions before starting another.",
        429,
      );
    saved = {
      ...request,
      _id: jobId,
      uid: actor.uid,
      authTime: actor.authTime,
      schemaVersion: 1,
      fingerprint: requestHash,
      reservationId: result.reservationId ?? null,
      status: "queued",
      runId: null,
      taskId: null,
      execution: null,
      lease: null,
      leaseUntil: new Date(0),
      attempts: 0,
      nextAttemptAt: now,
      reviewAfter: new Date(
        now.getTime() + (request.run?.reconciliationHours ?? 24) * 3600_000,
      ),
      cancelRequested: false,
      failure: null,
      createdAt: now,
      updatedAt: now,
    };
    await aiJobs(db).insertOne(saved, { session });
  };
  if (request.credits)
    await reserveCredits(db, actor, `ai:${jobId}`, request.credits, {
      now,
      managedJobId: jobId,
      persist,
    });
  else await readWallet(db, actor.uid, { actor, now, persist });
  if (!saved) throw conflict();
  return saved as AiJob;
}

export async function claimAiJob(db: Db, now = new Date()) {
  return aiJobs(db).findOneAndUpdate(
    {
      $or: [
        {
          status: {
            $in: ["queued", "dispatching", "running", "paused", "unknown"],
          },
        },
        // Recover runs previously blocked by an uncertain decision even though
        // the provider had already confirmed termination. Other reviews stay manual.
        {
          status: "needs-review",
          failure: "decision-outcome-unconfirmed",
          "execution.status": "stopped",
        },
      ],
      leaseUntil: { $lte: now },
      nextAttemptAt: { $lte: now },
    },
    {
      $set: {
        lease: randomUUID(),
        leaseUntil: new Date(now.getTime() + 180_000),
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1, _id: 1 }, returnDocument: "after" },
  );
}

function fence(job: AiJob, now: Date) {
  if (!job.lease) throw conflict();
  return {
    _id: job._id,
    lease: job.lease,
    leaseUntil: { $gt: now },
    status: { $nin: terminal },
  };
}
export async function patchAiJob(
  db: Db,
  job: AiJob,
  patch: Partial<
    Pick<
      AiJob,
      | "status"
      | "failure"
      | "failureDetail"
      | "terminationEvidence"
      | "runId"
      | "taskId"
      | "execution"
      | "lease"
      | "leaseUntil"
      | "nextAttemptAt"
      | "applicationWait"
      | "charge"
    >
  >,
  now = new Date(),
  session?: ClientSession,
) {
  const result = await aiJobs(db).findOneAndUpdate(
    fence(job, now),
    { $set: { ...patch, updatedAt: now } },
    { returnDocument: "after", session },
  );
  if (!result) throw conflict();
  return result;
}

export async function persistAiEvent(
  db: Db,
  job: AiJob,
  event: ProviderEvent,
  now = new Date(),
  observeNode?: (
    job: AiJob,
    node: ProviderNodeObservation,
    session: ClientSession,
  ) => Promise<void>,
) {
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      let current = await patchAiJob(db, job, {}, now, session);
      if (event.type === "identity") {
        if (
          current.runId &&
          (current.runId !== event.runId || current.taskId !== event.taskId)
        )
          throw conflict();
        await patchAiJob(
          db,
          job,
          {
            runId: event.runId,
            taskId: event.taskId,
            status: "running",
          },
          now,
          session,
        );
      } else {
        // A synchronous completion returns its identity with its terminal answer.
        // Persist both in this transaction, so restart recovery never needs a POST.
        if (
          !current.runId &&
          current.binding.kind === "completion" &&
          current.responder &&
          event.type === "execution"
        ) {
          current = await patchAiJob(
            db,
            job,
            { runId: event.execution.runId },
            now,
            session,
          );
        }
        if (!current.runId) throw conflict();
        if (event.type === "node-observation") {
          if (event.node.runId !== current.runId) throw conflict();
          await observeNode?.(current, event.node, session);
          return; // Never persist raw outputs/errors in public runEvents or usage.
        }
        if (
          event.type === "stage" ||
          event.type === "decision" ||
          event.type === "decision-filled" ||
          event.type === "decision-expired"
        ) {
          if (!current.run) return;
          // Project adapters can themselves import AI jobs during registration.
          // Resolve the registry only after module initialization, when handling an event.
          const { domains, jobTarget } = await import("../domains");
          const target = jobTarget(current);
          const applicationWait =
            event.type !== "stage" &&
            !!(
              target &&
              domains
                .get(target.adapter, target.version)
                .applicationWaitNodes?.includes(event.nodeId)
            );
          const eventId = fingerprint([
            job._id,
            event.type,
            event.type === "stage"
              ? [event.id, event.status]
              : event.type === "decision"
                ? [event.nodeId, event.token]
                : event.type === "decision-filled"
                  ? [event.nodeId, event.action, event.inputs]
                  : event.nodeId,
          ]);
          if (event.type === "decision") {
            await db
              .collection<Document & { _id: string }>("runDecisions")
              .updateOne(
                { _id: fingerprint([job._id, event.nodeId, event.token]) },
                {
                  $setOnInsert: {
                    uid: job.uid,
                    jobId: job._id,
                    logicalId: current.run.logicalId,
                    nodeId: event.nodeId,
                    title: event.title,
                    token: event.token,
                    status: "pending",
                    ...(applicationWait ? { applicationWait: true } : {}),
                    createdAt: now,
                  },
                },
                { upsert: true, session },
              );
          }
          if (
            event.type === "decision" &&
            !applicationWait &&
            (!current.run.answerer || current.run.takenOver)
          )
            await enqueueNotification(
              db,
              job.uid,
              `decision:${eventId}`,
              "run-decision",
              { runId: current.run.logicalId },
              session,
              now,
            );
          if (event.type === "decision-expired") {
            await db
              .collection<Document & { _id: string }>("runDecisions")
              .updateMany(
                { jobId: job._id, nodeId: event.nodeId, status: "pending" },
                { $set: { status: "expired", updatedAt: now } },
                { session },
              );
          }
          if (event.type === "decision-filled") {
            await db
              .collection<Document & { _id: string }>("runDecisions")
              .findOneAndUpdate(
                {
                  jobId: job._id,
                  nodeId: event.nodeId,
                  status: { $in: ["pending", "submitting", "unknown"] },
                },
                {
                  $set: {
                    status: "submitted",
                    confirmedAction: event.action,
                    confirmedInputs: event.inputs,
                    updatedAt: now,
                  },
                },
                { session, sort: { createdAt: -1 } },
              );
          }
          if (
            event.type !== "stage" &&
            target &&
            (current.applicationWait ||
              domains.get(target.adapter, target.version).applicationWaitNodes
                ?.length)
          ) {
            const pending = {
              jobId: current._id,
              status: { $in: ["pending", "submitting", "unknown"] },
            };
            const internal = await db
              .collection("runDecisions")
              .findOne({ ...pending, applicationWait: true }, { session });
            const human = await db
              .collection("runDecisions")
              .findOne(
                { ...pending, applicationWait: { $ne: true } },
                { session },
              );
            await patchAiJob(
              db,
              job,
              { applicationWait: !!internal && !human },
              now,
              session,
            );
          }
          if (applicationWait) return; // Internal waits are not creator questions/events.
          const safe =
            event.type === "decision"
              ? { type: event.type, nodeId: event.nodeId, title: event.title }
              : event;
          await db
            .collection<Document & { _id: string }>("runEvents")
            .updateOne(
              { _id: eventId },
              {
                $setOnInsert: {
                  uid: job.uid,
                  jobId: job._id,
                  logicalId: current.run.logicalId,
                  event: safe,
                  timestamp: now,
                },
              },
              { upsert: true, session },
            );
          return;
        }
        if (event.type === "execution") {
          if (event.execution.runId !== current.runId) throw conflict();
          await patchAiJob(
            db,
            job,
            {
              execution: event.execution,
              ...(["failed", "partial-succeeded"].includes(
                event.execution.status,
              )
                ? {
                    failure:
                      event.execution.failure ??
                      "The workflow failed. No error details were supplied by the provider.",
                  }
                : event.execution.status === "succeeded"
                  ? { failure: null }
                  : {}),
            },
            now,
            session,
          );
        }
        const usage =
          event.type === "execution" ? event.execution.usage : event.usage;
        const record: AiUsage = {
          ...usage,
          _id: fingerprint([job._id, usage.scope, usage.id]),
          uid: job.uid,
          jobId: job._id,
          runId: current.runId,
          capability: job.capability,
          provider:
            job.binding.mode === "fake"
              ? "fake"
              : job.binding.kind === "completion"
                ? "openai-compatible"
                : "dify",
          timestamp: now,
        };
        // An execution summary is a distinct scope, not an extra billable node.
        // Reconciliation cannot append the same observation twice.
        await aiUsage(db).updateOne(
          { _id: record._id },
          { $setOnInsert: record },
          { upsert: true, session },
        );
        const known = Object.fromEntries(
          Object.entries({
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost,
            elapsedMs: usage.elapsedMs,
          }).filter(([, value]) => value !== null),
        );
        if (Object.keys(known).length)
          await aiUsage(db).updateOne(
            { _id: record._id },
            { $set: known },
            { session },
          );
      }
    });
  } finally {
    await session.endSession();
  }
}

export async function settleAiJob(
  db: Db,
  job: AiJob,
  status: "succeeded" | "failed" | "cancelled",
  now = new Date(),
  onSettle?: (session: ClientSession) => Promise<void>,
) {
  const saved = await aiJobs(db).findOne({ _id: job._id, uid: job.uid });
  if (!saved) throw conflict();
  if (
    saved.consumption &&
    (saved.credits !== 0 ||
      saved.reservationId ||
      saved.pricing ||
      saved.run?.answerer)
  )
    throw new AppError(
      "AI_PREPAID_PRICE",
      "Consumption execution contains conflicting billing state.",
      409,
    );
  const pricing = saved.pricing ?? {
    mode: "fixed" as const,
    credits: saved.credits,
  };
  const usage = saved.execution?.usage ?? null;
  const usageCharging =
    status !== "succeeded" &&
    saved.run?.failureCharging === "verified-usage" &&
    Boolean(
      saved.execution &&
      !["running", "paused"].includes(saved.execution.status),
    );
  const failurePricing =
    pricing.mode === "fixed"
      ? { mode: "fixed" as const, credits: 0 }
      : pricing.mode === "hybrid"
        ? { ...pricing, baseCredits: 0 }
        : pricing;
  const calculated =
    status === "succeeded"
      ? calculateAiCharge(pricing, usage)
      : usageCharging
        ? calculateAiCharge(failurePricing, usage)
        : { credits: 0, calculatedCredits: "0", capped: false };
  if (!calculated)
    throw new AppError(
      "AI_USAGE_MISSING",
      "Required billing usage is unavailable or has a different currency.",
      409,
    );
  const { responderCharges } = await import("../runs/responder");
  const responderTotal = await responderCharges(db, saved);
  const charge = {
    ...calculated,
    credits: calculated.credits + responderTotal,
    usage: status === "succeeded" || usageCharging ? usage : null,
  };
  const persist = async (session: ClientSession) => {
    const prior = await aiJobs(db).findOne(
      { _id: job._id, uid: job.uid },
      { session },
    );
    if (prior?.status === status) return;
    if (
      !prior ||
      fingerprint(prior.execution?.usage ?? null) !== fingerprint(usage)
    )
      throw conflict();
    if (status === "succeeded" && prior?.execution?.status !== "succeeded")
      throw new AppError(
        "AI_RESULT_UNVERIFIED",
        "A saved successful execution is required before charging credits.",
        409,
      );
    if (
      saved.run?.answerer &&
      (await aiJobs(db).countDocuments(
        {
          "responder.parentId": saved._id,
          status: { $nin: ["succeeded", "failed", "cancelled"] },
        },
        { session },
      ))
    )
      throw new AppError(
        "RESPONDER_PENDING",
        "Responder execution is pending.",
        409,
      );
    await aiJobs(db).updateOne(
      { _id: saved._id },
      {
        $set: {
          parentCharge: calculated.credits,
          responderCharge: responderTotal,
        },
      },
      { session },
    );
    if (saved.run?.answerer) {
      const children = await aiJobs(db)
        .find({ "responder.parentId": saved._id }, { session })
        .limit(101)
        .toArray();
      let confirmedTotal = 0;
      for (const child of children) {
        const fee =
          child.status === "succeeded"
            ? calculateAiCharge(
                saved.run.answerer.pricing,
                child.execution?.usage ?? null,
              )?.credits
            : 0;
        if (fee === undefined)
          throw new AppError(
            "AI_USAGE_MISSING",
            "Responder billing usage is unavailable.",
            409,
          );
        confirmedTotal += fee;
        await aiJobs(db).updateOne(
          { _id: child._id },
          { $set: { responderFee: fee } },
          { session },
        );
      }
      if (confirmedTotal !== responderTotal) throw conflict();
    }
    await onSettle?.(session);
    if (saved.run && !saved.responder)
      await enqueueNotification(
        db,
        saved.uid,
        `run-final:${saved._id}`,
        "run-final",
        { runId: saved.run.logicalId, status },
        session,
        now,
      );

    await patchAiJob(
      db,
      job,
      {
        status,
        charge,
        lease: null,
        leaseUntil: new Date(0),
        terminationEvidence:
          prior.status === "queued"
            ? "not-dispatched"
            : prior.execution?.status === "failed"
              ? "provider-failed"
              : prior.execution?.status === "stopped"
                ? "provider-stopped"
                : (prior.run || prior.responder) &&
                    ["succeeded", "partial-succeeded"].includes(
                      prior.execution?.status ?? "",
                    )
                  ? "provider-completed"
                  : (prior.terminationEvidence ?? "unverified"),
      },
      now,
      session,
    );
  };
  if (job.reservationId) {
    await finishManagedReservation(
      db,
      job.uid,
      `ai-settle:${job._id}`,
      job.reservationId,
      status === "succeeded" || charge.credits > 0 ? "commit" : "release",
      {
        managedJobId: job._id,
        persist,
        now,
        ...(saved.pricing && (status === "succeeded" || charge.credits > 0)
          ? { chargeAmount: charge.credits }
          : {}),
      },
    );
  } else await readWallet(db, job.uid, { now, persist });
}

export async function resolveAiJob(
  db: Db,
  admin: CreditActor,
  id: string,
  decision: "accept" | "release",
  reason: string,
  validOutput: (job: AiJob) => boolean | Promise<boolean>,
  now = new Date(),
  onAccept?: (job: AiJob, session: ClientSession) => Promise<void>,
) {
  if (typeof reason !== "string" || reason.length > 500)
    throw new AppError(
      "AI_RESOLUTION_REASON",
      "Use at most 500 characters for the explanation.",
    );
  const job = await aiJobs(db).findOneAndUpdate(
    {
      _id: id,
      status: { $in: ["needs-review", "settlement-blocked"] },
      leaseUntil: { $lte: now },
    },
    {
      $set: {
        lease: randomUUID(),
        leaseUntil: new Date(now.getTime() + 180_000),
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!job) throw conflict();
  try {
    if (
      decision === "accept" &&
      (job.execution?.status !== "succeeded" || !(await validOutput(job)))
    )
      throw new AppError(
        "AI_RESULT_UNVERIFIED",
        "Only a saved, validated successful execution can be accepted.",
        409,
      );
    await settleAiJob(
      db,
      job,
      decision === "accept" ? "succeeded" : "cancelled",
      now,
      async (session) => {
        const access = await db
          .collection<AccountAccess>("accountAccess")
          .findOneAndUpdate(
            { _id: admin.uid },
            { $inc: { revision: 1 } },
            { returnDocument: "after", session },
          );
        if (
          !access ||
          access.role !== "admin" ||
          !accessPermitsSession(access, admin.authTime)
        )
          throw new AppError(
            "FORBIDDEN",
            "Administrator access is required.",
            403,
          );
        await db.collection<AuditEntry>("auditEvents").insertOne(
          {
            _id: randomUUID(),
            event: "ai-resolution",
            actorUid: admin.uid,
            targetUid: job.uid,
            reason: `${decision} ${job._id}: ${reason.trim()}`,
            timestamp: now,
          },
          { session },
        );
        if (decision === "release" && job.run)
          await aiJobs(db).updateOne(
            { _id: job._id, lease: job.lease },
            { $set: { operatorResolved: true } },
            { session },
          );
        if (decision === "accept") await onAccept?.(job, session);
      },
    );
  } catch (error) {
    await aiJobs(db).updateOne(
      { _id: job._id, lease: job.lease },
      { $set: { lease: null, leaseUntil: new Date(0) } },
    );
    throw error;
  }
}

export async function createAiIndexes(db: Db) {
  await aiJobs(db).createIndex({ uid: 1, createdAt: -1, _id: -1 });
  await aiJobs(db).createIndex({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
  await aiJobs(db).createIndex(
    { "binding.fingerprint": 1, runId: 1 },
    { unique: true, partialFilterExpression: { runId: { $type: "string" } } },
  );
  await aiUsage(db).createIndex({ uid: 1, timestamp: -1, _id: -1 });
  await aiUsage(db).createIndex({ jobId: 1, scope: 1 });
}
