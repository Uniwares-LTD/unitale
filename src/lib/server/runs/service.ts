import { domains, jobTarget, resolveTarget } from "../domains";
import type { Db, Document } from "mongodb";
import "server-only";
import { requireModule } from "../modules";
import { PAGE_SIZE, pageCursor, readCursor } from "../pagination";
import { parseInput } from "@/lib/input";
import { z } from "zod";
import { AppError } from "@/lib/auth-policy";
import {
  privateContextInputName,
  publicRunInputs,
  runStartSchema,
  runCommandSchema,
  runIdSchema,
  decisionSubmitSchema,
  rawDecisionSubmitSchema,
  rawResponseTextSchema,
  assertRawResponseForm,
  parseUiForm,
  validateAnswers,
  type OrchestratorDefinition,
  type RunStatus,
} from "@/lib/contracts/runs";
import { snapshotPersona, guardPersona, personaChoices } from "./personas";
import { maximumCredits } from "@/lib/config/ai-pricing";
import { cardRegistry } from "@/lib/runs/cards";
import { database } from "../mongo";
async function requireSession() {
  return (await import("../session")).requireSession();
}
import { accountAccess } from "../store/access";
async function requireAdmin() {
  return (await import("../admin")).requireAdmin();
}
import { readSettings } from "../settings";
import { readWallet } from "../store/credits";
import {
  aiJobs,
  createAiJob,
  canStartNewAttempt,
  fingerprint,
  type AiJob,
} from "../ai/jobs";
import { providerUser } from "../ai/dify";
import {
  createDifyFiles,
  uploadOwnedAiFile,
  resolveOwnedAiFile,
} from "../ai/files";
import { selectedOrchestrator, orchestrators } from "./orchestrators";
import { guardOrchestratorAdmission } from "./orchestrator-lifecycle";
import { executionBinding, providerForRun } from "./provider";

export type Decision = {
  responderId?: string;
  answerSource?:
    | {
        type: "user" | "persona";
        personaId?: string;
        personaRevision?: number;
      }
    | { type: "application"; adapterId: string; adapterVersion: string };
  applicationWait?: boolean;
  automaticError?: string;
  approval?: ReturnType<typeof parseUiForm>["approval"];
  _id: string;
  uid: string;
  logicalId: string;
  jobId: string;
  nodeId: string;
  title: string;
  token: string;
  status: string;
  createdAt: Date;
  form?: Form;
  intent?: {
    response?: z.infer<ReturnType<typeof z.json>>;
    key: string;
    hash: string;
    action: string;
    inputs: Record<string, z.infer<ReturnType<typeof z.json>>>;
  };
  confirmedAction?: string;
  confirmedInputs?: unknown;
  error?: string;
};
export const formSchema = z.object({
  form_content: z.string().max(100000),
  inputs: z
    .array(
      z.object({
        type: z.enum(["paragraph", "select", "file", "file-list"]),
        output_variable_name: z.string().max(64),
        options: z.array(z.string()).optional(),
        option_source: z.object({ value: z.array(z.string()) }).optional(),
        number_limits: z.number().int().nonnegative().optional(),
        allowed_file_types: z
          .array(z.enum(["image", "document", "audio", "video", "custom"]))
          .optional(),
        allowed_file_extensions: z.array(z.string().max(32)).optional(),
        allowed_file_upload_methods: z
          .array(z.enum(["local_file", "remote_url"]))
          .optional(),
      }),
    )
    .max(20),
  user_actions: z
    .array(z.object({ id: z.string().max(20), title: z.string().max(100) }))
    .max(20),
  expiration_time: z.number().nullable().optional(),
  resolved_default_values: z.record(z.string(), z.string()).default({}),
});
type Form = z.infer<typeof formSchema>;
export async function ownedAttempt(id: string, logicalId?: string) {
  const actor = await requireSession();
  const job = await aiJobs(database()).findOne({
    _id: parseInput(runIdSchema, id),
    uid: actor.uid,
    ...(logicalId
      ? { "run.logicalId": parseInput(runIdSchema, logicalId) }
      : {}),
  });
  if (!job?.run) throw new AppError("RUN_NOT_FOUND", "Run unavailable.", 404);
  return { actor, job };
}
async function checkedInputs(
  d: OrchestratorDefinition,
  inputs: Record<string, unknown>,
  uid: string,
  binding: AiJob["binding"],
) {
  if (
    Object.keys(inputs).some(
      (key) => !d.inputs.some((field) => field.name === key),
    )
  )
    throw new AppError("INVALID_INPUT", "Unknown orchestrator input.");
  const result: Record<string, z.infer<ReturnType<typeof z.json>>> = {};
  for (const field of d.inputs) {
    const value = inputs[field.name];
    if (value === undefined || value === "") {
      if (field.required)
        throw new AppError("INVALID_INPUT", `Complete ${field.label}.`);
      continue;
    }
    if (field.kind === "file") {
      const id = parseInput(runIdSchema, value);
      await resolveOwnedAiFile(database(), uid, binding, id, [
        "image",
        "document",
        "audio",
        "video",
      ]);
      result[field.name] = id;
    } else if (field.kind === "number")
      result[field.name] = parseInput(z.number().finite(), value);
    else {
      const parsedText = z
        .string()
        .max(field.maxLength ?? 4000)
        .safeParse(value);
      if (!parsedText.success)
        throw new AppError(
          "INVALID_INPUT",
          `Enter at most ${field.maxLength ?? 4000} text characters for ${field.label}.`,
        );
      const text = parsedText.data;
      if (field.kind === "select" && !field.options.includes(text))
        throw new AppError("INVALID_INPUT", "Choose an offered input.");
      result[field.name] = text;
    }
  }
  return result;
}
async function createAttempt(
  input: z.infer<typeof runStartSchema>,
  previous?: AiJob,
  recovery?: { stage: string; data: unknown; diagnostic: boolean },
) {
  const actor = await requireSession();
  const replay = await aiJobs(database()).findOne({
    _id: fingerprint([actor.uid, input.key]),
    uid: actor.uid,
  });
  if (replay?.run) {
    const saved = publicRunInputs(replay.inputs, replay.run.orchestrator);
    if (
      replay.run.orchestrator.id !== input.orchestratorId ||
      (replay.run.answerer?.id ?? null) !==
        (input.answerer?.type === "persona" ? input.answerer.id : null) ||
      (input.answerer?.type === "persona" &&
        (replay.run.answerer?.revision !== input.answerer.revision ||
          replay.run.answerer.configurationKey !==
            input.answerer.configurationKey)) ||
      fingerprint(jobTarget(replay) ?? null) !==
        fingerprint(
          resolveTarget(
            replay.run.orchestrator,
            input.target,
            input.artifactId,
          ) ?? null,
        ) ||
      fingerprint(saved) !== fingerprint(input.inputs) ||
      replay.run.predecessorId !== (previous?._id ?? null)
    )
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used for different inputs.",
        409,
      );
    return { id: replay.run.logicalId, attemptId: replay._id };
  }
  const { settings, revision: settingsRevision } = await readSettings();
  if (!settings.runs.enabled)
    throw new AppError("AI_DISABLED", "Runs are disabled.", 503);
  const selected = await selectedOrchestrator(input.orchestratorId);
  const d = selected.definition;
  if (
    input.configurationKey !==
    fingerprint([selected.revision, settingsRevision, d])
  )
    throw new AppError(
      "CONFIGURATION_CHANGED",
      "Configuration or pricing changed. Reload and review before starting.",
      409,
    );
  const bound = await executionBinding(d, selected.revision);
  const answerer = await snapshotPersona(input.answerer);
  const target = resolveTarget(d, input.target, input.artifactId);
  if (target)
    await domains
      .get(target.adapter, target.version)
      .own(database(), actor.uid, target.id);
  const pricing = d.pricing ?? settings.runs.pricing;
  const values = await checkedInputs(
    d,
    input.inputs,
    actor.uid,
    bound.snapshot,
  );
  const id = fingerprint([actor.uid, input.key]);
  const logicalId = previous?.run?.logicalId ?? id;
  const legacyInputs = d.legacyInputs ?? [
    "unibase_run_id",
    "unibase_attempt_id",
    "unibase_recovery",
  ];
  const job = await createAiJob(
    database(),
    { uid: actor.uid, authTime: actor.auth_time },
    input.key,
    {
      capability: "orchestrator",
      capabilityVersion: "1",
      binding: bound.snapshot,
      inputs: {
        ...values,
        ...(legacyInputs.includes("unibase_run_id")
          ? { unibase_run_id: logicalId }
          : {}),
        ...(legacyInputs.includes("unibase_attempt_id")
          ? { unibase_attempt_id: id }
          : {}),
        ...(recovery && legacyInputs.includes("unibase_recovery")
          ? {
              unibase_recovery: JSON.stringify({
                version: d.recovery!.version,
                stage: recovery.stage,
                data: recovery.data,
                diagnostic: recovery.diagnostic,
              }),
            }
          : {}),
      },
      source: { type: "run", id: logicalId, version: "1" },
      credits: maximumCredits(pricing) + (answerer?.maximum ?? 0),
      pricing,
      run: {
        answerer,
        artifactId: target?.kind === "artifact" ? target.id : undefined,
        target,
        logicalId,
        attempt: (previous?.run?.attempt ?? 0) + 1,
        predecessorId: previous?._id ?? null,
        orchestrator: d,
        configurationRevision: selected.revision,
        settingsRevision,
        ...settings.runs,
        failureCharging: d.failureCharging ?? settings.runs.failureCharging,
      },
    },
    new Date(),
    async (session) => {
      await guardOrchestratorAdmission(database(), selected, session);
      await guardPersona(database(), answerer, session);
      for (const field of d.inputs.filter((f) => f.kind === "file")) {
        const fileId = values[field.name];
        if (typeof fileId !== "string") continue;
        const file = await database()
          .collection<import("../ai/files").AiFile>("aiFiles")
          .findOne({ _id: fileId, uid: actor.uid }, { session });
        if (file?.managedFileId)
          await (
            await import("../private-files")
          ).referenceFile(
            database(),
            actor.uid,
            file.managedFileId,
            `run:${id}`,
            session,
          );
      }

      if (target)
        await domains
          .get(target.adapter, target.version)
          .admit(database(), actor.uid, target.id, session);
    },
  );
  return { id: logicalId, attemptId: job._id };
}
export async function startRun(input: unknown) {
  requireModule("runs");
  return createAttempt(parseInput(runStartSchema, input));
}
function status(job: AiJob, result?: unknown): RunStatus {
  if (job.status === "paused" && job.applicationWait) return "reconciling";
  if (job.status === "succeeded") return "succeeded";
  if (
    job.status === "failed" &&
    result &&
    typeof result === "object" &&
    "outcome" in result &&
    result.outcome === "partial"
  )
    return "partially completed";
  return (
    {
      queued: "queued",
      dispatching: "starting",
      running: "running",
      paused: "awaiting input",
      unknown: "reconciling",
      "needs-review": "needs-review",
      "settlement-blocked": "needs-review",
      failed: "failed",
      cancelled: "cancelled",
    } satisfies Record<Exclude<AiJob["status"], "succeeded">, RunStatus>
  )[job.status as Exclude<AiJob["status"], "succeeded">];
}
export async function listRuns(cursor?: string, filter?: string) {
  const actor = await requireSession();
  const query = { uid: actor.uid, "run.logicalId": { $exists: true } };
  const scope = ["runs", actor.uid, filter ?? ""];
  const cursorData = readCursor(cursor, scope);
  const after = cursorData
    ? {
        time: parseInput(z.iso.datetime(), cursorData.value),
        id: parseInput(runIdSchema, cursorData.id),
      }
    : null;
  if (filter)
    parseInput(
      z.enum([
        "queued",
        "running",
        "paused",
        "unknown",
        "needs-review",
        "succeeded",
        "failed",
        "partial",
        "cancelled",
      ]),
      filter,
    );
  const rows = await aiJobs(database())
    .aggregate<AiJob & { savedResults?: { result: unknown }[] }>([
      { $match: query },
      { $sort: { "run.attempt": -1 } },
      { $group: { _id: "$run.logicalId", job: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$job" } },
      ...(after
        ? [
            {
              $match: {
                $or: [
                  { createdAt: { $lt: new Date(after.time) } },
                  { createdAt: new Date(after.time), _id: { $lt: after.id } },
                ],
              },
            },
          ]
        : []),
      {
        $lookup: {
          from: "runResults",
          localField: "_id",
          foreignField: "_id",
          as: "savedResults",
        },
      },
      ...(filter
        ? [
            {
              $match: {
                ...(filter === "partial"
                  ? {
                      status: "failed",
                      "savedResults.result.outcome": "partial",
                    }
                  : {
                      status: z
                        .enum([
                          "queued",
                          "running",
                          "paused",
                          "unknown",
                          "needs-review",
                          "succeeded",
                          "failed",
                          "partial",
                          "cancelled",
                        ])
                        .parse(filter),
                    }),
              },
            },
          ]
        : []),
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 26 },
    ])
    .toArray();
  return {
    rows: rows.slice(0, 25).map((job) => ({
      id: job.run!.logicalId,
      name: job.run!.orchestrator.name,
      status: status(job, job.savedResults?.[0]?.result),
      attempts: job.run!.attempt,
      createdAt: job.createdAt.toISOString(),
    })),
    next:
      rows.length > 25
        ? pageCursor(scope, rows[24].createdAt.toISOString(), rows[24]._id)
        : null,
  };
}
export async function decisionView(
  decision: Decision,
  job: AiJob,
  db: Db = database(),
) {
  let form = decision.form;
  if (decision.status === "pending" && !form) {
    try {
      form = formSchema.parse(
        await (
          await providerForRun(job, db)
        ).form!(decision.token),
      );
      await db
        .collection<Decision>("runDecisions")
        .updateOne({ _id: decision._id }, { $set: { form } });
    } catch {
      return {
        id: decision._id,
        title: decision.title,
        status: "unavailable",
        error: "This decision requires reconciliation.",
        cards: [],
        actions: [],
        inputs: [],
      };
    }
  }
  if (!form)
    return {
      id: decision._id,
      title: decision.title,
      status: decision.status,
      cards: [],
      actions: [],
      inputs: [],
    };
  let cards: z.infer<ReturnType<typeof z.json>> = [];
  let approval: ReturnType<typeof parseUiForm>["approval"];
  try {
    if (job.run?.orchestrator.responseMode === "raw-v1")
      assertRawResponseForm(form);
    if (form.form_content.includes("```unibase-ui")) {
      if (
        form.inputs.length !== 1 ||
        form.inputs[0].type !== "paragraph" ||
        form.inputs[0].output_variable_name !== "response"
      )
        throw new Error("Invalid structured response input");
      const ui = parseUiForm(form.form_content);
      cards = ui.cards;
      if (ui.approval) {
        const target = jobTarget(job);
        const validate =
          target && domains.get(target.adapter, target.version).approval;
        if (!validate) throw new Error("Unsupported approval");
        await validate(db, job, ui.approval);
        approval = ui.approval;
        await db
          .collection<Decision>("runDecisions")
          .updateOne(
            { _id: decision._id },
            { $set: { approval: ui.approval } },
          );
      }
    }
    if (
      job.run?.orchestrator.responseMode === "raw-v1" &&
      !approval &&
      (form.user_actions.length !== 1 || form.user_actions[0].id !== "continue")
    )
      throw new Error("Ordinary raw questions need only a continue action.");
    for (const card of cards as ReturnType<typeof parseUiForm>["cards"])
      for (const id of cardRegistry
        .get(card.content.type, card.content.version)
        .assets(card.content.data))
        if (
          !(await db
            .collection<Document & { _id: string }>("runAssets")
            .findOne({
              _id: id,
              uid: job.uid,
              logicalId: job.run!.logicalId,
              status: "ready",
            }))
        )
          throw new Error("Unavailable image");
  } catch {
    return {
      id: decision._id,
      title: decision.title,
      status: "invalid",
      error: "Dify returned an unsupported UI definition.",
      cards: [],
      actions: [],
      inputs: [],
    };
  }
  return {
    id: decision._id,
    attemptId: decision.jobId,
    title: decision.title,
    status:
      decision.status === "pending" &&
      !["running", "paused"].includes(job.status)
        ? "closed"
        : decision.status === "pending" &&
            form.expiration_time &&
            form.expiration_time * 1000 < Date.now()
          ? "expired"
          : decision.status,
    cards,
    actions:
      job.run?.orchestrator.responseMode === "raw-v1" && approval
        ? form.user_actions.filter((action) => action.id !== "continue")
        : form.user_actions,
    responseMode: job.run?.orchestrator.responseMode,
    inputs: form.inputs,
    defaults: form.resolved_default_values,
    structured: form.form_content.includes("```unibase-ui"),
    description: form.form_content.includes("```unibase-ui")
      ? ""
      : form.form_content,
    answers: decision.intent?.inputs ?? decision.confirmedInputs ?? null,
    expiresAt: form.expiration_time ?? null,
    answerSource: decision.answerSource ?? null,
    automaticError: decision.automaticError ?? null,
  };
}
export type RunPages = {
  decisions?: string;
  actionable?: string;
  events?: string;
};
export async function runDetail(id: string, pages: RunPages = {}) {
  const actor = await requireSession();
  parseInput(runIdSchema, id);
  const attempts = await aiJobs(database())
    .find({ uid: actor.uid, "run.logicalId": id })
    .sort({ "run.attempt": -1 })
    .limit(100)
    .toArray();
  if (!attempts.length)
    throw new AppError("RUN_NOT_FOUND", "Run unavailable.", 404);
  attempts.reverse();
  const current = attempts[attempts.length - 1];
  const results = await database()
    .collection<Document & { _id: string }>("runResults")
    .find({
      uid: actor.uid,
      _id: {
        $in: attempts
          .filter((j) =>
            ["succeeded", "failed", "cancelled", "settlement-blocked"].includes(
              j.status,
            ),
          )
          .map((j) => j._id),
      },
    })
    .toArray();
  const actionableStates = ["pending", "submitting", "unknown"];
  async function decisionPage(actionable: boolean, cursor?: string) {
    const scope = ["decisions", actor.uid, id, actionable];
    const after = readCursor(cursor, scope);
    if (
      after &&
      (typeof after.value !== "string" ||
        !Number.isFinite(Date.parse(after.value)))
    )
      throw new AppError("INVALID_INPUT", "Invalid page cursor.");
    const records = await database()
      .collection<Decision>("runDecisions")
      .find({
        uid: actor.uid,
        logicalId: id,
        applicationWait: { $ne: true },
        status: actionable
          ? { $in: actionableStates }
          : { $nin: actionableStates },
        ...(after
          ? {
              $or: [
                { createdAt: { $lt: new Date(after.value) } },
                { createdAt: new Date(after.value), _id: { $lt: after.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(PAGE_SIZE + 1)
      .toArray();
    const shown = records.slice(0, PAGE_SIZE);
    const jobs = await aiJobs(database())
      .find({ uid: actor.uid, _id: { $in: shown.map((d) => d.jobId) } })
      .toArray();
    const rows = await Promise.all(
      shown.map(async (d) => ({
        ...(await decisionView(
          d,
          jobs.find((j) => j._id === d.jobId)!,
        )),
        attemptId: d.jobId,
      })),
    );
    const last = shown.at(-1);
    return {
      rows,
      next:
        records.length > PAGE_SIZE && last
          ? pageCursor(scope, last.createdAt.toISOString(), last._id)
          : null,
    };
  }
  const [actionable, decisionHistory] = await Promise.all([
    decisionPage(true, pages.actionable),
    decisionPage(false, pages.decisions),
  ]);
  const eventScope = ["events", actor.uid, id];
  const afterEvent = readCursor(pages.events, eventScope);
  if (
    afterEvent &&
    (typeof afterEvent.value !== "string" ||
      !Number.isFinite(Date.parse(afterEvent.value)))
  )
    throw new AppError("INVALID_INPUT", "Invalid page cursor.");
  const eventRows = await database()
    .collection<Document & { _id: string }>("runEvents")
    .find({
      uid: actor.uid,
      logicalId: id,
      ...(afterEvent
        ? {
            $or: [
              { timestamp: { $lt: new Date(afterEvent.value) } },
              {
                timestamp: new Date(afterEvent.value),
                _id: { $lt: afterEvent.id },
              },
            ],
          }
        : {}),
    })
    .sort({ timestamp: -1, _id: -1 })
    .limit(PAGE_SIZE + 1)
    .toArray();
  const events = eventRows.slice(0, PAGE_SIZE);
  const eventHistory = {
    rows: events.map((e) => ({
      id: e._id,
      attemptId: e.jobId,
      event: e.event,
      timestamp: e.timestamp.toISOString(),
    })),
    next:
      eventRows.length > PAGE_SIZE
        ? pageCursor(
            eventScope,
            events.at(-1)!.timestamp.toISOString(),
            events.at(-1)!._id,
          )
        : null,
  };
  const awaitApplications = await database()
    .collection("resultApplications")
    .find({ jobId: { $in: attempts.map((j) => j._id) }, uid: actor.uid })
    .toArray();
  const configs = await orchestrators();
  const responderExecutions = await aiJobs(database())
    .find({ uid: actor.uid, "responder.parentId": current._id })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  const choice = configs.find((d) => d.id === current.run!.orchestrator.id);
  const target = jobTarget(current);
  return {
    id,
    name: current.run!.orchestrator.name,
    target: target
      ? {
          adapter: target.adapter,
          version: target.version,
          kind: target.kind,
          id: target.id,
        }
      : null,
    status: status(current, results.find((r) => r._id === current._id)?.result),
    pollSeconds: current.run!.pollSeconds,
    isAdmin: (await accountAccess(database(), actor.uid)).role === "admin",
    attempts: attempts.map((job) => ({
      id: job._id,
      number: job.run!.attempt,
      status: status(job, results.find((r) => r._id === job._id)?.result),
      failure:
        job.failure ??
        job.execution?.failure ??
        (status(job, results.find((r) => r._id === job._id)?.result) ===
        "failed"
          ? "The workflow failed. No error details were saved for this attempt."
          : null),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      credits: job.credits,
      chargedCredits: job.charge?.credits ?? null,
      parentCharge: job.parentCharge ?? job.charge?.credits ?? null,
      responderCharge: job.responderCharge ?? 0,
      answerer: job.run?.answerer
        ? {
            id: job.run.answerer.id,
            name: job.run.answerer.name,
            revision: job.run.answerer.revision,
          }
        : null,
      takenOver: job.run?.takenOver ?? false,
      application:
        (awaitApplications.find((a) => a.jobId === job._id)?.status as
          string | undefined) ?? null,
      artifactId: job.run?.artifactId ?? null,
      cancelRequested: job.cancelRequested,
      elapsedSeconds: Math.max(
        0,
        Math.floor(
          ((["succeeded", "failed", "cancelled"].includes(job.status)
            ? job.updatedAt
            : new Date()
          ).getTime() -
            job.createdAt.getTime()) /
            1000,
        ),
      ),
      inputs: publicRunInputs(job.inputs, job.run!.orchestrator),
      result: results.find((r) => r._id === job._id)?.result ?? null,
    })),
    actionable,
    decisionHistory,
    eventHistory,
    events: eventHistory.rows,
    decisions: [
      ...actionable.rows,
      ...decisionHistory.rows.filter(
        (d) => !actionable.rows.some((a) => a.id === d.id),
      ),
    ],
    // Prepaid work must continue through its product admission, which preserves funding.
    canRestart:
      canStartNewAttempt(current) &&
      !current.runSuccessorId &&
      !current.consumption,
    configuration: choice ?? null,
    personas: await personaChoices(),
    responders: responderExecutions.map((j) => ({
      id: j._id,
      status: j.status,
      settledCredits: j.responderFee ?? null,
      totalTokens: j.execution?.usage.totalTokens ?? null,
      cost: j.execution?.usage.cost ?? null,
    })),
  };
}
export async function runCommand(id: string, input: unknown) {
  const command = parseInput(runCommandSchema, input);
  const { actor, job } = await ownedAttempt(command.attemptId, id);
  if (command.action === "retry-application") {
    await database()
      .collection("resultApplications")
      .updateOne(
        { jobId: job._id, uid: actor.uid, status: "failed" },
        { $set: { status: "pending", nextAttemptAt: new Date() } },
      );
    return { id };
  }
  if (command.action === "take-over") {
    await readWallet(database(), actor.uid, {
      actor: { uid: actor.uid, authTime: actor.auth_time },
      persist: async (session) => {
        await aiJobs(database()).updateOne(
          { _id: job._id, uid: actor.uid },
          { $set: { "run.takenOver": true } },
          { session },
        );
        await aiJobs(database()).updateMany(
          {
            "responder.parentId": job._id,
            status: { $nin: ["succeeded", "failed", "cancelled"] },
          },
          { $set: { cancelRequested: true, nextAttemptAt: new Date() } },
          { session },
        );
      },
    });
    return { id };
  }
  if (command.action === "cancel") {
    await readWallet(database(), actor.uid, {
      actor: { uid: actor.uid, authTime: actor.auth_time },
      persist: async (session) => {
        const result = await aiJobs(database()).updateOne(
          {
            _id: job._id,
            uid: actor.uid,
            status: {
              $in: ["queued", "dispatching", "running", "paused", "unknown"],
            },
          },
          { $set: { cancelRequested: true, nextAttemptAt: new Date() } },
          { session },
        );
        if (!result.matchedCount)
          throw new AppError(
            "RUN_CONFLICT",
            "Attempt cannot be cancelled.",
            409,
          );
      },
    });
    return { id };
  }
  const choices = await orchestrators();
  const choice = choices.find((d) => d.id === job.run!.orchestrator.id);
  if (!choice || !command.configurationKey)
    throw new AppError(
      "ORCHESTRATOR_UNAVAILABLE",
      "Reload the available configuration.",
      409,
    );
  let recovery;
  if (command.action !== "restart") {
    if (command.action === "test-stage") await requireAdmin();
    const saved = await database()
      .collection<Document & { _id: string }>("runResults")
      .findOne({ _id: job._id, uid: actor.uid });
    const checkpoint = saved?.result?.checkpoint;
    const config = await selectedOrchestrator(job.run!.orchestrator.id);
    const supported = config.definition.recovery;
    if (
      !supported ||
      !command.stage ||
      !supported.stages.includes(command.stage) ||
      (command.action === "test-stage" && !supported.diagnostic) ||
      (command.action === "recover" &&
        (!checkpoint ||
          checkpoint.version !== supported.version ||
          checkpoint.stage !== command.stage))
    )
      throw new AppError(
        "RECOVERY_UNAVAILABLE",
        "This stage has no compatible recovery entry point. Restart the run.",
        409,
      );
    recovery = {
      stage: command.stage,
      data: checkpoint?.data ?? {},
      diagnostic: command.action === "test-stage",
    };
  }
  return createAttempt(
    {
      key: command.key,
      orchestratorId: job.run!.orchestrator.id,
      configurationKey: command.configurationKey,
      answerer: command.answerer,
      target: jobTarget(job)
        ? { kind: jobTarget(job)!.kind, id: jobTarget(job)!.id }
        : undefined,
      inputs:
        command.inputs ?? publicRunInputs(job.inputs, job.run!.orchestrator),
    },
    job,
    recovery,
  );
}
export async function submitDecision(
  logicalId: string,
  id: string,
  input: unknown,
) {
  const actor = await requireSession();
  const decision = await database()
    .collection<Decision>("runDecisions")
    .findOne({
      _id: parseInput(runIdSchema, id),
      logicalId: parseInput(runIdSchema, logicalId),
      uid: actor.uid,
    });
  if (!decision)
    throw new AppError("DECISION_NOT_FOUND", "Decision unavailable.", 404);
  const { job } = await ownedAttempt(decision.jobId, logicalId);
  return submitAuthorizedDecision(database(), actor, job, decision, input, {
    type: "user",
  });
}
export async function submitAuthorizedDecision(
  db: Db,
  actor: { uid: string; auth_time: number },
  job: AiJob,
  decision: Decision,
  input: unknown,
  source: NonNullable<Decision["answerSource"]>,
) {
  const collection = db.collection<Decision>("runDecisions");
  const stored = await collection.findOne({
    _id: decision._id,
    uid: job.uid,
    jobId: job._id,
  });
  if (!stored || actor.uid !== job.uid)
    throw new AppError("DECISION_NOT_FOUND", "Decision unavailable.", 404);
  const target = jobTarget(job);
  if (source.type === "application") {
    if (
      !job.lease ||
      !stored.applicationWait ||
      !target ||
      target.adapter !== source.adapterId ||
      target.version !== source.adapterVersion ||
      !domains
        .get(target.adapter, target.version)
        .applicationWaitNodes?.includes(stored.nodeId)
    )
      throw new AppError(
        "DECISION_UNAVAILABLE",
        "This application wait is unavailable.",
        409,
      );
  } else if (stored.applicationWait)
    throw new AppError(
      "DECISION_UNAVAILABLE",
      "This wait is managed by the application.",
      409,
    );
  const parsed =
    job.run?.orchestrator.responseMode === "raw-v1"
      ? parseInput(rawDecisionSubmitSchema, input)
      : parseInput(decisionSubmitSchema, input);
  const id = decision._id;
  const view = await decisionView(stored, job, db);
  const refreshed = await collection.findOne({ _id: id });
  const form = refreshed?.form;
  if (!form || ["invalid", "expired", "unavailable"].includes(view.status))
    throw new AppError("DECISION_UNAVAILABLE", "Decision is unavailable.", 409);
  if (!form.user_actions.some((action) => action.id === parsed.action))
    throw new AppError("INVALID_ACTION", "Choose an offered action.");
  if (
    (source.type === "persona" && refreshed?.approval?.requireHuman) ||
    (source.type === "application" && refreshed?.approval)
  )
    throw new AppError(
      "APPROVAL_REQUIRED",
      "This approval requires a user.",
      409,
    );
  const managedFiles = new Set<string>();
  let inputs: Record<string, z.infer<ReturnType<typeof z.json>>> = {};
  if ("response" in parsed) {
    assertRawResponseForm(form);
    if (
      (source.type === "persona" && parsed.action !== "continue") ||
      (source.type === "user" &&
        refreshed?.approval &&
        parsed.action === "continue")
    )
      throw new AppError(
        "INVALID_ACTION",
        "Choose an explicit approval action.",
      );
    inputs = { response: parseInput(rawResponseTextSchema, parsed.response) };
  } else if (form.form_content.includes("```unibase-ui")) {
    try {
      inputs = {
        response: JSON.stringify(
          validateAnswers(parseUiForm(form.form_content), parsed.answers),
        ),
      };
    } catch {
      throw new AppError(
        "INVALID_INPUT",
        "Complete the offered fields with valid values.",
        400,
      );
    }
  } else {
    if (
      Object.keys(parsed.answers).some(
        (name) =>
          !form.inputs.some((field) => field.output_variable_name === name),
      )
    )
      throw new AppError("INVALID_INPUT", "Unknown form field.");
    for (const field of form.inputs) {
      const value =
        parsed.answers[field.output_variable_name] ??
        form.resolved_default_values[field.output_variable_name];
      if (field.type === "paragraph")
        inputs[field.output_variable_name] = parseInput(
          z.string().max(4000),
          value ?? "",
        );
      else if (field.type === "select") {
        const text = parseInput(z.string(), value);
        if (!(field.options ?? field.option_source?.value ?? []).includes(text))
          throw new AppError("INVALID_INPUT", "Choose an offered option.");
        inputs[field.output_variable_name] = text;
      } else {
        if (
          field.allowed_file_upload_methods?.length &&
          !field.allowed_file_upload_methods.includes("local_file")
        )
          throw new AppError(
            "INVALID_INPUT",
            "This form requires an unsupported file transfer method.",
          );
        const ids =
          field.type === "file-list"
            ? parseInput(
                z
                  .array(runIdSchema)
                  .min(1)
                  .max(Math.min(10, field.number_limits ?? 10)),
                value,
              )
            : [parseInput(runIdSchema, value)];
        inputs[field.output_variable_name] = await Promise.all(
          ids.map(async (fileId) => {
            const owned = await db
              .collection<import("../ai/files").AiFile>("aiFiles")
              .findOne({ _id: fileId, uid: actor.uid });
            if (owned?.managedFileId) managedFiles.add(owned.managedFileId);
            const file = await resolveOwnedAiFile(
              db,
              actor.uid,
              job.binding,
              fileId,
              field.allowed_file_types?.length &&
                !field.allowed_file_types.includes("custom")
                ? field.allowed_file_types.filter(
                    (t): t is "image" | "document" | "audio" | "video" =>
                      t !== "custom",
                  )
                : ["image", "document", "audio", "video"],
            );
            if (field.allowed_file_extensions?.length) {
              const saved = await db
                .collection<Document & { _id: string }>("aiFiles")
                .findOne({ _id: fileId, uid: actor.uid });
              const extension = saved?.name?.split(".").at(-1)?.toLowerCase();
              if (
                !extension ||
                !field.allowed_file_extensions.some(
                  (e) => e.replace(/^\./, "").toLowerCase() === extension,
                )
              )
                throw new AppError(
                  "INVALID_INPUT",
                  "This file extension is not allowed.",
                );
            }
            return {
              transfer_method: "local_file",
              upload_file_id: file.upload_file_id,
            };
          }),
        );
        if (field.type === "file")
          inputs[field.output_variable_name] = (
            inputs[field.output_variable_name] as z.infer<
              ReturnType<typeof z.json>
            >[]
          )[0];
      }
    }
  }
  const hash = fingerprint(
    "response" in parsed
      ? [parsed.action, inputs, parsed.response]
      : [parsed.action, inputs],
  );
  if (refreshed?.intent) {
    if (refreshed.intent.key === parsed.key && refreshed.intent.hash === hash)
      return { status: refreshed.status };
    throw new AppError(
      "DECISION_CONFLICT",
      "An answer is already pending or submitted.",
      409,
    );
  }
  await readWallet(db, actor.uid, {
    actor: { uid: actor.uid, authTime: actor.auth_time },
    persist: async (session) => {
      const active = await aiJobs(db).findOne(
        {
          _id: job._id,
          uid: actor.uid,
          status: { $in: ["running", "paused"] },
          cancelRequested: false,
          ...(source.type === "application"
            ? { lease: job.lease, leaseUntil: { $gt: new Date() } }
            : {}),
          ...(source.type === "persona"
            ? { "run.takenOver": { $ne: true } }
            : {}),
        },
        { session },
      );
      if (source.type === "persona" && active)
        await aiJobs(db).updateOne(
          { _id: active._id },
          { $inc: { decisionFence: 1 } },
          { session },
        );
      if (!active)
        throw new AppError(
          "DECISION_UNAVAILABLE",
          "This attempt no longer accepts answers.",
          409,
        );
      for (const fileId of managedFiles)
        await (
          await import("../private-files")
        ).referenceFile(db, actor.uid, fileId, `run:${job._id}`, session);
      const changed = await collection.updateOne(
        { _id: id, status: "pending", intent: { $exists: false } },
        {
          $set: {
            answerSource: source,
            status: "submitting",
            intent: {
              key: parsed.key,
              hash,
              action: parsed.action,
              inputs,
              ...("response" in parsed ? { response: parsed.response } : {}),
            },
          },
        },
        { session },
      );
      if (!changed.matchedCount)
        throw new AppError(
          "DECISION_CONFLICT",
          "Decision changed. Reload.",
          409,
        );
    },
  });
  try {
    await (
      await providerForRun(job, db)
    ).submit!(decision.token, providerUser(actor.uid), parsed.action, inputs);
    await collection.updateOne(
      { _id: id, "intent.hash": hash, status: "submitting" },
      { $set: { status: "submitted" } },
    );
  } catch {
    await collection.updateOne(
      { _id: id, status: "submitting" },
      { $set: { status: "unknown" } },
    );
  }
  await aiJobs(db).updateOne(
    { _id: job._id },
    { $set: { nextAttemptAt: new Date() } },
  );
  return { status: (await collection.findOne({ _id: id }))!.status };
}
export async function uploadRunFile(
  logicalId: string,
  attemptId: string,
  key: string,
  file: File,
) {
  const { actor, job } = await ownedAttempt(attemptId, logicalId);
  const d = job.run!.orchestrator;
  const bound = await executionBinding(d, job.run!.configurationRevision);
  const uploaded = await uploadOwnedAiFile(
    database(),
    { uid: actor.uid, authTime: actor.auth_time },
    key,
    job.binding,
    file,
    job.binding.mode === "fake"
      ? async () => ({ kind: "ok", value: { id: crypto.randomUUID() } })
      : createDifyFiles(bound.config, bound.binding).upload,
  );
  return { id: uploaded._id, status: uploaded.status };
}
export async function prepareRunInputs(job: AiJob, db: Db = database()) {
  const inputs = { ...job.inputs };
  const contextName = privateContextInputName(job.run!.orchestrator);
  if (contextName) {
    const { capabilityForRun } = await import("./capabilities");
    inputs[contextName] = await capabilityForRun(db, job);
  }
  for (const field of job.run!.orchestrator.inputs)
    if (field.kind === "file" && inputs[field.name]) {
      const file = await resolveOwnedAiFile(
        db,
        job.uid,
        job.binding,
        String(inputs[field.name]),
        ["image", "document", "audio", "video"],
      );
      inputs[field.name] = {
        transfer_method: "local_file",
        upload_file_id: file.upload_file_id,
      };
    }
  return inputs;
}
