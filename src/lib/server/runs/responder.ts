import { enqueueNotification } from "../notifications";
import "server-only";
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicRunInputs, rawResponseText } from "@/lib/contracts/runs";
import { AppError } from "@/lib/auth-policy";
import { calculateAiCharge } from "@/lib/ai-pricing";
import { aiJobs, createAiJob, type AiJob } from "../ai/jobs";
import { authorizeWorkerAccount } from "../worker-authorization";
import { completionBinding } from "./persona-completion-settings";
import {
  decisionView,
  submitAuthorizedDecision,
  type Decision,
} from "./service";

type Json = z.infer<ReturnType<typeof z.json>>;
export function responderAnswer(
  _job: Pick<AiJob, "inputs">,
  outputs: Record<string, unknown> | null,
): { action: string; response: Json } {
  if (!outputs || typeof outputs.answer !== "string" || !outputs.answer.trim())
    throw new Error("Missing completion output");
  rawResponseText(outputs.answer);
  return { action: "continue", response: outputs.answer };
}
export async function responderCharges(db: Db, job: AiJob) {
  if (!job.run?.answerer) return 0;
  const children = await aiJobs(db)
    .find({ "responder.parentId": job._id })
    .limit(101)
    .toArray();
  if (
    children.some(
      (c) => !["succeeded", "failed", "cancelled"].includes(c.status),
    )
  )
    throw new AppError(
      "RESPONDER_PENDING",
      "Responder execution needs reconciliation.",
      409,
    );
  let total = 0;
  for (const c of children)
    if (c.status === "succeeded") {
      const charge = calculateAiCharge(
        job.run.answerer.pricing,
        c.execution?.usage ?? null,
      );
      if (!charge)
        throw new AppError(
          "AI_USAGE_MISSING",
          "Responder billing usage is unavailable.",
          409,
        );
      total += charge.credits;
    }
  return total;
}
// Existing worker loop calls this between execution cycles. No browser session is used.
export async function processOneAutomaticDecision(
  db: Db,
  authorize = authorizeWorkerAccount,
) {
  const parents = await aiJobs(db)
    .find({
      "run.answerer.id": { $exists: true },
      status: { $nin: ["succeeded", "failed", "cancelled"] },
    })
    .limit(100)
    .toArray();
  for (const parent of parents) {
    const stop =
      parent.cancelRequested ||
      parent.run?.takenOver ||
      !(await authorize(parent.uid, parent.authTime));
    if (stop)
      await aiJobs(db).updateMany(
        {
          "responder.parentId": parent._id,
          status: { $nin: ["succeeded", "failed", "cancelled"] },
        },
        { $set: { cancelRequested: true, nextAttemptAt: new Date() } },
      );
    if (stop || !["running", "paused"].includes(parent.status)) continue;
    const decision = await db
      .collection<Decision & { responderId?: string }>("runDecisions")
      .findOne(
        {
          jobId: parent._id,
          status: "pending",
          automaticError: { $exists: false },
          applicationWait: { $ne: true },
        },
        { sort: { createdAt: 1 } },
      );
    if (!decision) continue;
    try {
      const view = await decisionView(decision, parent, db);
      if (view.status !== "pending") {
        if (["invalid", "expired", "unavailable"].includes(view.status))
          throw new AppError(
            "PERSONA_FALLBACK",
            "This question could not be prepared for automatic answering. Please answer or take over.",
          );
        continue;
      }
      const refreshed = await db
        .collection<Decision>("runDecisions")
        .findOne({ _id: decision._id });
      const form = refreshed?.form;
      if (!form) continue;
      if (
        form.inputs.some((f) => ["file", "file-list"].includes(f.type)) ||
        refreshed.approval?.requireHuman
      )
        throw new AppError(
          "PERSONA_FALLBACK",
          "This question requires a user answer or a file. Please answer or take over.",
        );
      const persona = parent.run!.answerer!;
      let child = decision.responderId
        ? await aiJobs(db).findOne({ _id: decision.responderId })
        : null;
      if (!child) {
        const previous = await db
          .collection<Decision>("runDecisions")
          .find({ jobId: parent._id, status: "submitted" })
          .limit(100)
          .toArray();
        if (parent.run!.orchestrator.responseMode !== "raw-v1")
          throw new AppError(
            "PERSONA_FALLBACK",
            "This workflow needs raw-response registration. Please answer or take over.",
          );
        const question = form.form_content;
        const context = JSON.stringify({
          inputs: publicRunInputs(parent.inputs, parent.run!.orchestrator),
          decisions: previous.map((d) => ({
            title: d.title,
            response:
              d.intent && Object.hasOwn(d.intent, "response")
                ? d.intent.response
                : d.confirmedInputs,
          })),
        });
        const instructions = JSON.stringify({
          name: persona.name,
          instructions: persona.instructions,
        });
        if ([question, context, instructions].some((s) => s.length > 4000))
          throw new AppError(
            "PERSONA_FALLBACK",
            "The question or context exceeds the responder's supported size. Please answer or take over.",
          );
        const binding = completionBinding(
          persona.completion.settings,
          persona.completion.revision,
        );
        if (binding.fingerprint !== persona.completion.binding.fingerprint)
          throw new AppError(
            "PERSONA_FALLBACK",
            "The completion connection changed. Please answer or take over.",
          );
        child = await createAiJob(
          db,
          { uid: parent.uid, authTime: parent.authTime },
          `responder:${decision._id}`,
          {
            capability: "persona-completion",
            capabilityVersion: "1",
            binding,
            inputs: { persona: instructions, question, context },
            source: { type: "decision", id: decision._id, version: "1" },
            credits: 0,
            responder: {
              parentId: parent._id,
              decisionId: decision._id,
              completion: persona.completion,
            },
          },
          new Date(),
          async (session) => {
            const active = await aiJobs(db).findOneAndUpdate(
              {
                _id: parent._id,
                status: { $in: ["running", "paused"] },
                cancelRequested: false,
                "run.takenOver": { $ne: true },
              },
              { $inc: { responderFence: 1 } },
              { session },
            );
            if (
              !active ||
              (await aiJobs(db).countDocuments(
                { "responder.parentId": parent._id },
                { session },
              )) >= persona.maxCalls
            )
              throw new AppError(
                "PERSONA_FALLBACK",
                "Automatic answering stopped or reached this attempt's answer limit. Please answer or take over.",
              );
            const changed = await db
              .collection<Decision>("runDecisions")
              .updateOne(
                {
                  _id: decision._id,
                  status: "pending",
                  responderId: { $exists: false },
                },
                {
                  $set: {
                    responderId: (await import("../ai/jobs")).fingerprint([
                      parent.uid,
                      `responder:${decision._id}`,
                    ]),
                  },
                },
                { session },
              );
            if (!changed.matchedCount) throw new Error("Decision changed.");
          },
        );
        return true;
      }
      if (child.status === "succeeded") {
        const answer = responderAnswer(child, child.execution!.outputs);
        await submitAuthorizedDecision(
          db,
          { uid: parent.uid, auth_time: parent.authTime },
          parent,
          decision,
          { key: randomUUID(), ...answer },
          {
            type: "persona",
            personaId: persona.id,
            personaRevision: persona.revision,
          },
        );
        return true;
      }
      if (
        [
          "failed",
          "cancelled",
          "unknown",
          "needs-review",
          "settlement-blocked",
        ].includes(child.status)
      )
        throw new AppError(
          "PERSONA_FALLBACK",
          "The responder could not provide a valid answer. Please answer or take over.",
        );
    } catch (error) {
      const session = db.client.startSession();
      try {
        await session.withTransaction(async () => {
          const changed = await db
            .collection<Decision>("runDecisions")
            .updateOne(
              { _id: decision._id, status: "pending" },
              {
                $set: {
                  automaticError:
                    error instanceof AppError &&
                    error.code === "PERSONA_FALLBACK"
                      ? error.message
                      : "Automatic answering is unavailable. Please answer or take over.",
                },
              },
              { session },
            );
          if (changed.modifiedCount && parent.run)
            await enqueueNotification(
              db,
              parent.uid,
              `decision-fallback:${decision._id}`,
              "run-decision",
              { runId: parent.run.logicalId },
              session,
            );
        });
      } finally {
        await session.endSession();
      }
      return true;
    }
  }
  return false;
}
