import "server-only";
import { personaCompletionProvider } from "../ai/persona-completion";
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/auth-policy";
import { createDifyWorkflow, type LiveConfig, type Binding } from "../ai/dify";
import { fingerprint, type AiJob, aiJobs } from "../ai/jobs";
import type { WorkflowProvider, ProviderExecution } from "../ai/types";
import { database } from "../mongo";
import type { OrchestratorDefinition } from "@/lib/contracts/runs";
import { executionKey } from "./credentials";
import { difyJson } from "./dify-console-client";
import type { ProviderEvent } from "../ai/types";
import { domains, jobTarget } from "../domains";
import { nodeObservation } from "../ai/node-observation";
import { assertRunEnvironment } from "./environment-binding";

function observesNodes(job: AiJob) {
  const target = jobTarget(job);
  return !!(target && domains.get(target.adapter, target.version).observeNode);
}

// Terminal event snapshots can omit historical nodes. Fetch bounded node metadata
// only for the accepted app/Run. Opt-in outputs go solely to the private worker hook.
export async function tracingForRun(
  job: AiJob,
  request: typeof difyJson = difyJson,
  nodeObservations?: boolean,
): Promise<ProviderEvent[]> {
  const appId = job.run?.orchestrator.appId;
  if (
    job.binding.mode !== "live" ||
    !appId ||
    !job.runId ||
    !process.env.DIFY_MANAGEMENT_KEY
  )
    return [];
  const rows = z
    .object({
      data: z
        .array(
          z
            .object({
              id: z.string().max(128),
              node_id: z.string().max(128),
              title: z.string().max(200),
              status: z.string(),
              elapsed_time: z.number().nonnegative().nullish(),
            })
            .passthrough(),
        )
        .max(1000),
    })
    .parse(
      await request(
        `/apps/${z.string().uuid().parse(appId)}/workflow-runs/${z.string().uuid().parse(job.runId)}/node-executions`,
        { management: true },
      ),
    );
  const observations: ProviderEvent[] =
    (nodeObservations ?? observesNodes(job))
      ? rows.data.map((node) => ({
          type: "node-observation",
          node: nodeObservation(job.runId!, node),
        }))
      : [];
  return [
    ...observations,
    ...rows.data
      .filter((n) =>
        ["succeeded", "failed", "running", "exception"].includes(n.status),
      )
      .map((n) => ({
        type: "stage" as const,
        id: n.id,
        nodeId: n.node_id,
        title: n.title,
        status: (n.status === "exception" ? "failed" : n.status) as
          "succeeded" | "failed" | "running",
        elapsedMs:
          n.elapsed_time == null ? null : Math.round(n.elapsed_time * 1000),
      })),
  ];
}

export async function executionBinding(
  d: OrchestratorDefinition,
  revision: number,
  db: Db = database(),
) {
  assertRunEnvironment(d.environmentBinding);
  const mode = process.env.DIFY_MODE;
  if (mode !== "live" && mode !== "fake")
    throw new AppError("AI_DISABLED", "AI execution is disabled.", 503);
  const key = mode === "fake" ? "fake" : await executionKey(d, db);
  if (!key || (mode === "live" && !d.workflowId))
    throw new AppError(
      "AI_CONFIGURATION",
      "Orchestrator credentials or version are missing.",
      503,
    );
  const baseUrl = process.env.DIFY_BASE_URL || "https://dify.invalid/v1";
  const url = new URL(baseUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.APP_ENV === "local" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.protocol === "http:"
      ))
  )
    throw new AppError("AI_CONFIGURATION", "Invalid provider URL.", 503);
  const binding: Binding = {
    name: d.id,
    revision: String(revision),
    kind: "workflow",
    apiKeyEnv: d.keyEnv,
    apiKey: key,
    workflowId: d.workflowId,
  };
  const config: LiveConfig = {
    mode: "live",
    baseUrl: baseUrl.replace(/\/$/, ""),
    bindings: [binding],
  };
  return {
    snapshot: {
      name: d.id,
      revision: String(revision),
      kind: "workflow" as const,
      mode: mode as "live" | "fake",
      fingerprint: fingerprint([baseUrl, key, d.workflowId ?? null, revision]),
    },
    config,
    binding,
  };
}
export async function providerForRun(
  job: AiJob,
  db: Db = database(),
): Promise<WorkflowProvider> {
  if (!job.run && !job.responder)
    throw new AppError("RUN_REQUIRED", "Run configuration is missing.", 503);
  if (job.responder) return personaCompletionProvider(job);
  if (job.binding.mode === "fake") return fakeRun(job, db);
  const live = await executionBinding(
    job.run!.orchestrator,
    job.run!.configurationRevision,
    db,
  );
  if (live.snapshot.fingerprint !== job.binding.fingerprint)
    throw new AppError(
      "AI_CONFIGURATION",
      "Execution credentials changed. Restore the configured connection to reconcile this attempt.",
      409,
    );
  return createDifyWorkflow(
    live.config,
    live.binding,
    undefined,
    undefined,
    observesNodes(job),
  );
}
function fakeRun(job: AiJob, db: Db): WorkflowProvider {
  const sample =
    job.run?.orchestrator.privateTools?.includes("save_artifact_draft_v1") ??
    false;
  const needsDecision =
    sample || String(job.inputs.prompt).includes("decision");
  const runId = job.runId ?? randomUUID();
  const taskId = job.taskId ?? randomUUID();
  const result = () => ({
    version: 1,
    outcome: String(job.inputs.prompt).includes("partial")
      ? "partial"
      : "success",
    text: `Generated: ${String(job.inputs.prompt ?? "Your request")}`,
    cards: [],
    images: [] as { id: string; name: string; base64: string }[],
    failure: null,
    checkpoint: null,
  });
  async function state(): Promise<ProviderExecution> {
    const current = await aiJobs(db).findOne({ _id: job._id });
    const decision = await db
      .collection("runDecisions")
      .findOne({ jobId: job._id });
    const failed =
      String(job.inputs.prompt).includes("fail") &&
      !job.inputs.unibase_recovery;
    const output = result();
    if (sample) {
      const { sampleText, sampleImage, sampleApprove } =
        await import("./sample");
      output.text = sampleText;
      output.images = [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "Synthetic sample image",
          base64: sampleImage,
        },
      ];
      if (
        !current?.cancelRequested &&
        decision?.status === "submitted" &&
        (decision.confirmedAction ?? decision.intent?.action) === "approve"
      )
        await sampleApprove(db, job);
    }
    return {
      runId,
      workflowId:
        job.run!.orchestrator.workflowId ??
        "00000000-0000-4000-8000-000000000003",
      status: current?.cancelRequested
        ? "stopped"
        : failed
          ? "failed"
          : needsDecision &&
              decision?.status !== "submitted" &&
              !decision?.fakeProviderAnswer
            ? "paused"
            : "succeeded",
      outputs: failed
        ? {
            result: {
              ...result(),
              outcome: "failed",
              checkpoint: {
                version: "1",
                stage: "draft",
                data: { prompt: job.inputs.prompt },
              },
            },
          }
        : { result: output },
      usage: {
        scope: "execution",
        id: runId,
        inputTokens: String(job.inputs.prompt).includes("missing-usage")
          ? null
          : 5,
        outputTokens: String(job.inputs.prompt).includes("missing-usage")
          ? null
          : 5,
        totalTokens: String(job.inputs.prompt).includes("missing-usage")
          ? null
          : 10,
        cost: String(job.inputs.prompt).includes("priced-usage")
          ? { amount: "0.0025", currency: "USD", source: "provider" }
          : null,
        elapsedMs: 100,
      },
    };
  }
  return {
    async start(_input, observe) {
      await observe({ type: "identity", runId, taskId });
      await observe({
        type: "stage",
        id: "draft-1",
        nodeId: "draft",
        title: "Prepare draft",
        status: "running",
        elapsedMs: null,
      });
      if (sample) {
        const { sampleDraft } = await import("./sample");
        await sampleDraft(db, job);
      }
      if (needsDecision)
        await observe({
          type: "decision",
          nodeId: "choice",
          title: "Choose a direction",
          token: job._id,
        });
      const value = await state();
      await observe({ type: "execution", execution: value });
      return { kind: "ok", value };
    },
    retrieve: async () => ({ kind: "ok", value: await state() }),
    async stream(_id, _user, observe) {
      const value = await state();
      if (value.status === "succeeded") {
        const decision = await db.collection("runDecisions").findOne({
          jobId: job._id,
          status: { $in: ["unknown", "submitting"] },
        });
        if (decision?.intent)
          await observe({
            type: "decision-filled",
            nodeId: decision.nodeId,
            action: decision.intent.action,
            inputs: decision.intent.inputs,
          });
      }
      if (value.status === "succeeded")
        await observe({
          type: "stage",
          id: "draft-1",
          nodeId: "draft",
          title: "Prepare draft",
          status: "succeeded",
          elapsedMs: 100,
        });
      return { kind: "ok", value };
    },
    async stop() {
      return { kind: "ok", value: undefined };
    },
    async form() {
      if (sample) return (await import("./sample")).sampleForm(db, job);
      return {
        form_content:
          "```unibase-ui\n" +
          JSON.stringify({
            version: 1,
            cards: [
              {
                id: "direction",
                content: {
                  type: "question",
                  version: 1,
                  data: {
                    kind: "single",
                    title: "Choose a direction",
                    explanation: "Your selection continues this run.",
                    options: [
                      { id: "brief", label: "Brief" },
                      { id: "detailed", label: "Detailed" },
                    ],
                  },
                },
              },
            ],
          }) +
          "\n```\n{{#$output.response#}}",
        inputs: [{ type: "paragraph", output_variable_name: "response" }],
        user_actions: [{ id: "continue", title: "Continue" }],
        expiration_time: Math.floor(Date.now() / 1000) + 3600,
      };
    },
    async submit() {
      if (String(job.inputs.prompt).includes("lost")) {
        await db
          .collection("runDecisions")
          .updateOne(
            { jobId: job._id },
            { $set: { fakeProviderAnswer: true } },
          );
        throw new Error("Simulated dropped submission response");
      }
    },
  };
}
