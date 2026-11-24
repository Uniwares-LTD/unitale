import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { z } from "zod";
import type { AiJob } from "../ai/jobs";
import { fingerprint } from "../foundation/canonical";
import type { Decision } from "../runs/service";
import { bookletContext } from "./context";
import { id } from "./documents";
import { workV2Schema } from "./documents-v2";

/** Resume only an owned native technical wait. This does not authorize or
 * dispatch an action, answer a creator question, or create another execution. */
export async function resumeBookletRetryV2(
  db: Db,
  job: AiJob,
  now = new Date(),
) {
  const target = job.run?.target;
  if (
    target?.adapter !== "booklet" ||
    target.version !== "2" ||
    job.cancelRequested ||
    !job.applicationWait ||
    now >= job.reviewAfter
  )
    return;
  const c = bookletContext(
    db,
    { uid: job.uid, authTime: job.authTime },
    () => now,
  );
  const selected = await c.transaction(async (session) => {
    const p = await c.owned(target.id, session, 2);
    await c.entitled(p, session);
    const pending = z
      .object({ pending: z.object({ action: z.literal("wait"), callId: id }) })
      .safeParse(p.checkpoint);
    if (!pending.success || p.lifecycleState !== "in-progress") return null;
    const row = await db.collection("bookletWork").findOne(
      {
        ownerId: job.uid,
        productionId: p._id,
        callId: pending.data.pending.callId,
        documentVersion: 2,
      },
      { session },
    );
    if (!row) return null;
    const work = workV2Schema.parse(row);
    return work.status === "registered" && work.retryNotBefore ? work : null;
  });
  if (!selected) return;
  const blocked = async (code: string) => {
    await db
      .collection("auditEvents")
      .updateOne(
        {
          _id: fingerprint([
            job._id,
            selected.callId,
            "retry-wait",
            code,
          ]) as never,
        },
        {
          $setOnInsert: {
            event: "booklet-retry-wait-blocked",
            code,
            actorUid: job.uid,
            jobId: job._id,
            productionId: target.id,
            callId: selected.callId,
            timestamp: now,
          },
        },
        { upsert: true },
      );
    return job.reviewAfter;
  };
  const formContent =
    "Booklet retry wait " +
    fingerprint(["booklet-retry-wait", selected.callId]) +
    "\n{{#$output.response#}}";
  const decisions = await db
    .collection<Decision>("runDecisions")
    .find({
      uid: job.uid,
      jobId: job._id,
      nodeId: "retry-wait",
      applicationWait: true,
      status: { $in: ["pending", "unknown", "submitting"] },
    })
    .limit(2)
    .toArray();
  if (!decisions.length) return;
  if (decisions.length !== 1) return blocked("ambiguous_decision");
  const { decisionView, submitAuthorizedDecision } =
    await import("../runs/service");
  let decision = decisions[0];
  if (!decision.form) {
    const view = await decisionView(decision, job, db);
    if (view.status === "unavailable") return blocked("form_unavailable");
    const refreshed = await db
      .collection<Decision>("runDecisions")
      .findOne({ _id: decision._id });
    if (!refreshed) return;
    decision = refreshed;
  }
  if (decision.form?.form_content !== formContent)
    return blocked("presentation_mismatch");
  if (selected.retryNotBefore! > now) return selected.retryNotBefore;
  await submitAuthorizedDecision(
    db,
    { uid: job.uid, auth_time: job.authTime },
    job,
    decision,
    {
      key: decision.intent?.key ?? randomUUID(),
      action: "continue",
      response: "eligible",
    },
    { type: "application", adapterId: "booklet", adapterVersion: "2" },
  );
}
