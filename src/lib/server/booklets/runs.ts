import "server-only";
import { z } from "zod";
import type { ClientSession, Db } from "mongodb";
import { createAiJob, aiJobs } from "../ai/jobs";
import { fingerprint } from "../foundation/canonical";
import { executionBinding } from "../runs/provider";
import type { OrchestratorRecord } from "../runs/orchestrators";
import { guardOrchestratorAdmission } from "../runs/orchestrator-lifecycle";
import { readSettings } from "../settings";
import type { CreditActor } from "../store/credit-types";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import { id } from "./documents";

const inputSchema = z.strictObject({
  key: z.string().regex(/^[A-Za-z0-9_:-]{1,128}$/),
  workflowId: id,
  orchestratorId: id,
  configurationRevision: z.number().int().positive(),
  inputs: z.record(z.string(), z.union([z.string(), z.number().finite()])),
  predecessorId: id.nullable().default(null),
});
/** Product admission into the existing dispatcher/Run UI. No new dispatcher,
 * provider invocation or persona; the consumption binding suppresses Run billing. */
export async function enqueueBookletRun(
  db: Db,
  actor: CreditActor,
  productionId: string,
  raw: z.input<typeof inputSchema>,
) {
  const input = inputSchema.parse(raw);
  const c = bookletContext(db, actor);
  async function owned(session: ClientSession) {
    const row = await db
      .collection("bookletProductions")
      .findOne(
        { _id: id.parse(productionId) as never, ownerId: actor.uid },
        { projection: { documentVersion: 1 }, session },
      );
    if (!row) throw bookletMissing();
    return row.documentVersion === 2
      ? c.owned(productionId, session, 2)
      : c.owned(productionId, session);
  }
  const p = await c.transaction(owned);
  const domainVersion = String(p.documentVersion);
  const jobId = fingerprint([actor.uid, input.key]);
  const previous = await aiJobs(db).findOne({ _id: jobId, uid: actor.uid });
  if (previous) {
    if (
      previous.run?.target?.id !== productionId ||
      previous.run.target.adapter !== "booklet" ||
      previous.run.target.version !== domainVersion ||
      previous.consumption?.orderId !== p.orderId ||
      previous.consumption.workflowId !== input.workflowId ||
      previous.run.orchestrator.id !== input.orchestratorId ||
      previous.run.configurationRevision !== input.configurationRevision ||
      previous.run.predecessorId !== input.predecessorId ||
      fingerprint(previous.inputs) !== fingerprint(input.inputs)
    )
      throw bookletConflict("Run request key was reused with changed inputs.");
    return { id: previous.run.logicalId, attemptId: previous._id };
  }
  const record = await db
    .collection<OrchestratorRecord>("orchestrators")
    .findOne({
      _id: input.orchestratorId,
      revision: input.configurationRevision,
      validated: true,
      "definition.enabled": true,
    });
  if (
    !record ||
    record.definition.domainAdapter?.id !== "booklet" ||
    record.definition.domainAdapter.version !== domainVersion ||
    record.definition.responseMode !== "raw-v1" ||
    (record.definition.legacyInputs?.length ?? 0)
  )
    throw bookletConflict(
      "Select a validated booklet orchestrator with native inputs.",
    );
  const definition = record.definition;
  if (
    Object.keys(input.inputs).some(
      (key) => !definition.inputs.some((field) => field.name === key),
    )
  )
    throw bookletConflict("Unknown workflow input.");
  for (const field of definition.inputs) {
    const value = input.inputs[field.name];
    if (value === undefined && !field.required) continue;
    if (
      field.kind === "file" ||
      (field.kind === "number"
        ? typeof value !== "number"
        : typeof value !== "string" ||
          value.length > (field.maxLength ?? 4000) ||
          (field.required && !value.trim()) ||
          (field.kind === "select" && !field.options.includes(value)))
    )
      throw bookletConflict(
        "Workflow input does not match its published definition.",
      );
  }
  const { settings, revision } = await readSettings(db);
  if (!settings.runs.enabled) throw bookletConflict("Runs are disabled.");
  const binding = await executionBinding(definition, record.revision, db);
  const predecessor = input.predecessorId
    ? await aiJobs(db).findOne({
        _id: input.predecessorId,
        uid: actor.uid,
        "run.target.adapter": "booklet",
        "run.target.version": domainVersion,
        "run.target.id": productionId,
        "consumption.orderId": p.orderId,
      })
    : null;
  if (input.predecessorId && !predecessor?.run) throw bookletMissing();
  const logicalId = predecessor?.run?.logicalId ?? jobId;
  const job = await createAiJob(
    db,
    actor,
    input.key,
    {
      capability: "orchestrator",
      capabilityVersion: "1",
      binding: binding.snapshot,
      inputs: input.inputs,
      source: { type: "run", id: logicalId, version: "1" },
      credits: 0,
      consumption: { orderId: p.orderId, workflowId: input.workflowId },
      run: {
        logicalId,
        attempt: (predecessor?.run?.attempt ?? 0) + 1,
        predecessorId: input.predecessorId,
        target: {
          adapter: "booklet",
          version: domainVersion,
          kind: "booklet-production",
          id: productionId,
        },
        orchestrator: definition,
        configurationRevision: record.revision,
        settingsRevision: revision,
        ...settings.runs,
        failureCharging:
          definition.failureCharging ?? settings.runs.failureCharging,
      },
    },
    new Date(),
    async (session) => {
      await guardOrchestratorAdmission(db, record, session);
      const live = await owned(session);
      const order = await c.entitled(live, session);
      if (
        order.activeWorkflow !== input.workflowId ||
        live.lifecycleState !== "in-progress" ||
        live.documentVersion !== p.documentVersion ||
        (live.expiresAt && live.expiresAt <= new Date())
      )
        throw bookletConflict("Paid workflow admission changed.");
      if (live.documentVersion === 1) await c.save(live, live.version, session);
      else {
        // Fence admission against concurrent production writes without converting
        // the record or changing its durable work/checkpoint/retry snapshots.
        const changed = await db
          .collection("bookletProductions")
          .updateOne(
            {
              _id: live._id as never,
              ownerId: actor.uid,
              documentVersion: 2,
              version: live.version,
            },
            { $inc: { version: 1 }, $set: { updatedAt: new Date() } },
            { session },
          );
        if (changed.modifiedCount !== 1)
          throw bookletConflict("Paid workflow admission changed.");
      }
    },
  );
  return { id: logicalId, attemptId: job._id };
}
