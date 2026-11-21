import "server-only";

import type { ClientSession, Db } from "mongodb";
import { AppError } from "@/lib/auth-policy";
import { calculateAiCharge } from "@/lib/ai-pricing";
import { readWallet } from "../store/credits";
import type { Reservation } from "../store/credit-types";
import {
  aiJobs,
  claimAiJob,
  patchAiJob,
  persistAiEvent,
  settleAiJob,
  type AiJob,
} from "./jobs";
import { providerUser } from "./dify";
import type {
  ProviderExecution,
  ProviderOutcome,
  WorkflowProvider,
} from "./types";

export type AiWorkerDependencies = {
  provider: (job: AiJob) => WorkflowProvider | Promise<WorkflowProvider>;
  authorize: (uid: string, authTime: number) => Promise<boolean>;
  validateOutput: (
    job: AiJob,
    execution: ProviderExecution,
  ) => boolean | Promise<boolean>;
  prepareInput?: (
    job: AiJob,
  ) => Promise<Record<string, import("./types").Json>>;
  materialize?: (
    job: AiJob,
    result: ProviderExecution,
    session: ClientSession,
  ) => Promise<void>;
  observeNode?: (
    job: AiJob,
    node: import("./types").ProviderNodeObservation,
    session: ClientSession,
  ) => Promise<void>;
  resumePaused?: (job: AiJob) => Promise<Date | void>;
  now?: () => Date;
  trace?: (job: AiJob) => Promise<import("./types").ProviderEvent[]>;
  terminalOutput?: (
    job: AiJob,
    execution: ProviderExecution,
    progress: () => Promise<void>,
  ) => Promise<"succeeded" | "failed">;
};

// Lease exceeds the provider's bounded 120s stream attempt. An expired worker can
// neither publish a result nor charge credits. Recovery reads; it never replays POST.
export async function processOneAiJob(db: Db, deps: AiWorkerDependencies) {
  const now = deps.now ?? (() => new Date());
  let job = await claimAiJob(db, now());
  if (!job) return false;
  const observe = (event: import("./types").ProviderEvent) =>
    persistAiEvent(db, job!, event, now(), deps.observeNode);
  async function defer(failure: string, review = false, delay?: number) {
    const current = now();
    const needsReview = review || current >= job!.reviewAfter;
    await patchAiJob(
      db,
      job!,
      {
        status: needsReview
          ? "needs-review"
          : job!.execution?.status === "paused"
            ? "paused"
            : "unknown",
        failure,
        lease: null,
        leaseUntil: new Date(0),
        nextAttemptAt: new Date(
          current.getTime() +
            (delay ??
              (job!.runId && failure === "timeout"
                ? (job!.run?.pollSeconds ?? 5) * 1000
                : Math.min(
                    (job!.run?.retryMaxSeconds ?? 300) * 1000,
                    (job!.run?.retryBaseSeconds ?? 2) *
                      1000 *
                      2 ** Math.min(job!.attempts, 8),
                  ))),
        ),
      },
      current,
    );
  }
  async function finish(execution: ProviderExecution) {
    if (["running", "paused"].includes(execution.status)) {
      job = await patchAiJob(
        db,
        job!,
        {
          status: execution.status as "running" | "paused",
          execution,
        },
        now(),
      );
      let eligibleAt: Date | void = undefined;
      if (
        execution.status === "paused" &&
        job.run &&
        job.applicationWait &&
        !job.cancelRequested &&
        now() < job.reviewAfter &&
        (await deps.authorize(job.uid, job.authTime))
      )
        eligibleAt = await deps.resumePaused?.(job);
      if (eligibleAt && !Number.isFinite(eligibleAt.getTime()))
        throw new Error("Invalid application wait eligibility");
      await patchAiJob(
        db,
        job,
        {
          lease: null,
          leaseUntil: new Date(0),
          nextAttemptAt: new Date(
            Math.min(
              job.applicationWait ? job.reviewAfter.getTime() : Infinity,
              Math.max(
                now().getTime() + (job.run?.pollSeconds ?? 5) * 1000,
                eligibleAt?.getTime() ?? 0,
              ),
            ),
          ),
        },
        now(),
      );
      return;
    }
    if (job!.run && deps.terminalOutput) {
      // Trace transport failure cannot invalidate already verified termination.
      const trace = (await deps.trace?.(job!).catch(() => [])) ?? [];
      for (const event of trace) await observe(event);
      if (
        execution.status !== "stopped" &&
        (await db.collection("runDecisions").findOne({
          jobId: job!._id,
          status: { $in: ["unknown", "submitting"] },
        }))
      ) {
        await defer("decision-outcome-unconfirmed", true);
        return;
      }
      const status = await deps.terminalOutput(job!, execution, async () => {
        // Image retention can span several bounded downloads. Extend only a
        // still-owned lease; a superseded worker must stop before more I/O.
        const current = now();
        job = await patchAiJob(
          db,
          job!,
          {
            leaseUntil: new Date(current.getTime() + 180_000),
          },
          current,
        );
      });
      await settleAiJob(
        db,
        job!,
        execution.status === "stopped" ? "cancelled" : status,
        now(),
        deps.materialize
          ? (session) => deps.materialize!(job!, execution, session)
          : undefined,
      );
      return;
    }
    if (execution.status === "partial-succeeded") {
      await defer("partial-success", true);
      return;
    }
    if (execution.status === "succeeded") {
      if (!(await deps.validateOutput(job!, execution))) {
        if (job!.responder) {
          await settleAiJob(db, job!, "failed", now());
          return;
        }
        await defer("invalid-output", true);
        return;
      }
      if (job!.responder) {
        const parent = await aiJobs(db).findOne({
          _id: job!.responder.parentId,
        });
        if (
          !parent?.run?.answerer ||
          !calculateAiCharge(parent.run.answerer.pricing, execution.usage)
        ) {
          await defer("responder-usage-unavailable", true);
          return;
        }
      }
      await settleAiJob(
        db,
        job!,
        "succeeded",
        now(),
        deps.materialize
          ? (session) => deps.materialize!(job!, execution, session)
          : undefined,
      );
    } else
      await settleAiJob(
        db,
        job!,
        execution.status === "stopped" ? "cancelled" : "failed",
        now(),
      );
  }
  try {
    // A confirmed rejection may have persisted just before settlement failed.
    // Recover that evidence locally; never send a second POST to discover it.
    if (job.terminationEvidence === "provider-rejected" && !job.runId) {
      await settleAiJob(db, job, "failed", now());
      return true;
    }
    // Recover saved terminal evidence before contacting the provider again.
    if (
      job.execution &&
      !["running", "paused"].includes(job.execution.status)
    ) {
      if (
        job.run &&
        job.runId &&
        job.execution.status !== "stopped" &&
        (await db.collection("runDecisions").findOne({
          jobId: job._id,
          status: { $in: ["unknown", "submitting"] },
        }))
      ) {
        const provider = await deps.provider(job);
        if (provider.stream)
          await provider.stream(job.runId, providerUser(job.uid), observe);
      }
      await finish(job.execution);
      return true;
    }
    if (now() >= job.reviewAfter) {
      await defer("reconciliation-deadline", true);
      return true;
    }
    if (job.status === "queued" && job.cancelRequested) {
      await settleAiJob(db, job, "cancelled", now());
      return true;
    }
    const provider = await deps.provider(job);
    let outcome: ProviderOutcome<ProviderExecution>;
    const starting = job.status === "queued";
    if (job.responder && starting) {
      const parent = await aiJobs(db).findOne({ _id: job.responder.parentId });
      if (
        !parent ||
        parent.cancelRequested ||
        parent.run?.takenOver ||
        ["succeeded", "failed", "cancelled"].includes(parent.status)
      ) {
        await settleAiJob(db, job, "cancelled", now());
        return true;
      }
    }
    if (starting) {
      if (!(await deps.authorize(job.uid, job.authTime))) {
        await settleAiJob(db, job, "cancelled", now());
        return true;
      }
      const claimed = job;
      const inputs = deps.prepareInput
        ? await deps.prepareInput(job)
        : job.inputs;
      await readWallet(db, job.uid, {
        actor: { uid: job.uid, authTime: job.authTime },
        now: now(),
        persist: async (session) => {
          const current = await aiJobs(db).findOne(
            { _id: claimed._id },
            { session },
          );
          if (current?.cancelRequested)
            throw new AppError("AI_CANCELLED", "Execution cancelled.", 409);
          if (claimed.responder) {
            const parent = await aiJobs(db).findOneAndUpdate(
              {
                _id: claimed.responder.parentId,
                uid: claimed.uid,
                cancelRequested: false,
                "run.takenOver": { $ne: true },
                status: { $in: ["running", "paused"] },
                "execution.status": {
                  $nin: ["succeeded", "failed", "stopped", "partial-succeeded"],
                },
              },
              { $inc: { responderDispatchFence: 1 } },
              { session },
            );
            if (
              !parent ||
              !(await db
                .collection<import("../runs/service").Decision>("runDecisions")
                .findOneAndUpdate(
                  {
                    _id: claimed.responder.decisionId,
                    uid: claimed.uid,
                    jobId: parent._id,
                    status: "pending",
                    responderId: claimed._id,
                    intent: { $exists: false },
                  },
                  { $inc: { dispatchFence: 1 } },
                  { session },
                )) ||
              (parent.reservationId &&
                !(await db
                  .collection<Reservation>("creditReservations")
                  .findOne(
                    {
                      _id: parent.reservationId,
                      uid: claimed.uid,
                      managedJobId: parent._id,
                      status: "active",
                    },
                    { session },
                  )))
            )
              throw new AppError(
                "AI_CANCELLED",
                "Parent execution no longer authorizes responder spending.",
                409,
              );
          }
          if (claimed.reservationId) {
            const hold = await db
              .collection<Reservation>("creditReservations")
              .findOne(
                {
                  _id: claimed.reservationId,
                  uid: claimed.uid,
                  managedJobId: claimed._id,
                  status: "active",
                },
                { session },
              );
            if (!hold)
              throw new AppError(
                "AI_CANCELLED",
                "Execution credits are no longer reserved.",
                409,
              );
          }
          job = await patchAiJob(
            db,
            claimed,
            {
              status: "dispatching",
              leaseUntil: new Date(now().getTime() + 180000),
            },
            now(),
            session,
          );
        },
      });
      outcome = await provider.start(
        { user: providerUser(job.uid), inputs },
        observe,
      );
    } else if (job.runId) {
      if (job.cancelRequested && job.taskId)
        await provider.stop(job.taskId, providerUser(job.uid));
      const state = await provider.retrieve(job.runId);
      const terminal =
        state.kind === "ok" &&
        !["running", "paused"].includes(state.value.status);
      // Completed Runs need no live stream. Replay only when a decision still
      // needs confirmation; bounded terminal tracing is collected by finish().
      const needsReplay =
        !terminal ||
        (state.kind === "ok" &&
          state.value.status !== "stopped" &&
          !!(await db.collection("runDecisions").findOne({
            jobId: job._id,
            status: { $in: ["unknown", "submitting"] },
          })));
      outcome =
        job.run &&
        provider.stream &&
        state.kind === "ok" &&
        !job.cancelRequested &&
        needsReplay
          ? await provider.stream(job.runId, providerUser(job.uid), observe)
          : state;
      // Historical replay snapshots cannot replace confirmed termination.
      if (terminal) outcome = state;
    } else {
      await defer("acceptance-unknown", true);
      return true;
    }
    // Event writes may have supplied identity, outputs and new cancellation state.
    job = (await aiJobs(db).findOne({ _id: job._id, lease: job.lease })) ?? job;
    if (outcome.kind === "ok") {
      await persistAiEvent(
        db,
        job,
        { type: "execution", execution: outcome.value },
        now(),
      );
      job =
        (await aiJobs(db).findOne({ _id: job._id, lease: job.lease })) ?? job;
      await finish(outcome.value);
    } else if (starting && outcome.kind === "rejected" && !job.runId) {
      await patchAiJob(
        db,
        job,
        { failure: outcome.failure, terminationEvidence: "provider-rejected" },
        now(),
      );
      await settleAiJob(db, job, "failed", now());
    } else {
      if (outcome.evidence)
        await persistAiEvent(
          db,
          job,
          { type: "execution", execution: outcome.evidence },
          now(),
        );
      await defer(outcome.failure, !job.runId, outcome.retryAfterMs);
    }
  } catch (error) {
    if (
      error instanceof AppError &&
      job.status === "queued" &&
      error.code === "AI_REFERENCE_UNCERTAIN"
    ) {
      job = await patchAiJob(
        db,
        job,
        { terminationEvidence: "not-dispatched" },
        now(),
      );
      await defer("reference-upload-uncertain", true);
    } else if (
      error instanceof AppError &&
      job.status === "queued" &&
      ([
        "AI_REFERENCE_REJECTED",
        "AI_REFERENCE_INVALID",
        "AI_FILE_QUOTA",
        "CAPABILITY_CONFIGURATION",
      ].includes(error.code) ||
        (!!job.responder &&
          ["AI_CONFIGURATION", "PERSONA_UNAVAILABLE"].includes(error.code)))
    ) {
      job = await patchAiJob(
        db,
        job,
        {
          failure: job.responder
            ? "persona-completion-unavailable"
            : error.code === "CAPABILITY_CONFIGURATION"
              ? "private-context-unavailable"
              : error.code === "AI_FILE_QUOTA"
                ? "reference-upload-quota"
                : error.code === "AI_REFERENCE_REJECTED"
                  ? "reference-upload-rejected"
                  : "reference-unavailable",
          ...(!job.responder &&
          error.code === "CAPABILITY_CONFIGURATION" &&
          error.reason
            ? { failureDetail: { reason: error.reason, at: now() } }
            : {}),
        },
        now(),
      );
      await settleAiJob(db, job, "failed", now());
    } else if (error instanceof AppError && error.code === "AI_USAGE_MISSING")
      await defer("usage-unavailable", true);
    else if (
      error instanceof AppError &&
      ["FORBIDDEN", "AI_CANCELLED"].includes(error.code) &&
      job.status === "queued"
    )
      await settleAiJob(db, job, "cancelled", now());
    else if (error instanceof AppError && error.code === "RESERVATION_CLOSED")
      await patchAiJob(
        db,
        job,
        {
          status: "settlement-blocked",
          failure: "reservation-closed",
          lease: null,
          leaseUntil: new Date(0),
        },
        now(),
      );
    else if (
      error instanceof AppError &&
      error.code === "RESULT_MEDIA_UNAVAILABLE"
    )
      await defer("settlement-failed", true);
    else if (now() >= job.reviewAfter) {
      // Saved successful provider evidence can still fail product materialization.
      // Escalate that failure as well; otherwise the early recovery branch above
      // would retry a permanently stale source forever, keeping its credits held.
      await defer("settlement-failed", true);
    } else if (
      job.execution &&
      !["running", "paused"].includes(job.execution.status)
    ) {
      // Preserve terminal evidence and the hold, but show reconciliation rather
      // than leaving a completed provider execution labelled Running for hours.
      await defer("settlement-failed");
    } else {
      // Keep the original lease on DB failures. The next worker must recover from
      // persisted dispatch intent; a caught exception never authorizes re-dispatch.
      throw error;
    }
  }
  return true;
}
