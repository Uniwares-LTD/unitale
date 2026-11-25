import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { DifyConfig } from "@/lib/config/dify";
import { readSse } from "./sse";
import { nodeObservation } from "./node-observation";
import { workflowFailure } from "./provider-errors";
import type {
  ProviderEvent,
  ProviderExecution,
  ProviderFailure,
  ProviderOutcome,
  UsageObservation,
  WorkflowProvider,
} from "./types";

const id = z.string().uuid();
const count = z.number().int().nonnegative().safe();
const executionSchema = z.object({
  id,
  workflow_id: id,
  status: z.enum([
    "running",
    "paused",
    "succeeded",
    "partial-succeeded",
    "failed",
    "stopped",
  ]),
  outputs: z.record(z.string(), z.json()).nullable().optional(),
  error: z.unknown().optional(),
  total_tokens: count.nullable().optional(),
  elapsed_time: z.number().finite().nonnegative().nullable().optional(),
});
export function decimalAmount(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  const digits = match[1] + fraction;
  const point = match[1].length + Number(match[3] ?? 0);
  if (point < -18 || point > 36) return null;
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [whole, decimals = ""] = expanded.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedDecimals = decimals.replace(/0+$/, "");
  if (normalizedWhole.length > 18 || normalizedDecimals.length > 18)
    return null;
  return normalizedDecimals
    ? `${normalizedWhole}.${normalizedDecimals}`
    : normalizedWhole;
}

export function providerUser(uid: string): string {
  return `user-${createHash("sha256").update(uid).digest("hex")}`;
}

export function parseUsage(
  value: unknown,
  scope: UsageObservation["scope"],
  key: string,
): UsageObservation {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  const usage = parsed.success ? parsed.data : {};
  const amount = decimalAmount(usage.total_price);
  const currency = z
    .string()
    .regex(/^[A-Z]{3}$/)
    .safeParse(usage.currency);
  return {
    scope,
    id: key,
    inputTokens: count.safeParse(usage.prompt_tokens).data ?? null,
    outputTokens: count.safeParse(usage.completion_tokens).data ?? null,
    totalTokens: count.safeParse(usage.total_tokens).data ?? null,
    cost:
      amount !== null && currency.success
        ? { amount, currency: currency.data, source: "provider" }
        : null,
    elapsedMs: null,
  };
}

function execution(value: unknown): ProviderExecution {
  const data = executionSchema.parse(value);
  return {
    runId: data.id,
    workflowId: data.workflow_id,
    status: data.status,
    outputs: data.outputs ?? null,
    ...(["failed", "partial-succeeded"].includes(data.status)
      ? { failure: workflowFailure(data.error) }
      : {}),
    usage: {
      ...parseUsage(value, "execution", data.id),
      totalTokens: data.total_tokens ?? null,
      elapsedMs:
        data.elapsed_time == null ? null : Math.round(data.elapsed_time * 1000),
    },
  };
}

export function failure(error: unknown): ProviderFailure {
  return error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
    ? "timeout"
    : "transport";
}

export function httpFailure(
  response: Response,
  mutation: boolean,
): ProviderOutcome<never> {
  const status = response.status;
  const rejected = mutation && [400, 401, 403, 404, 422, 429].includes(status);
  const seconds = Number(response.headers.get("retry-after"));
  return {
    kind: rejected ? "rejected" : "unknown",
    failure:
      status === 401 || status === 403
        ? "authentication"
        : status === 429
          ? "rate-limit"
          : status >= 500
            ? "unavailable"
            : "invalid-request",
    ...(seconds > 0 && Number.isFinite(seconds)
      ? { retryAfterMs: Math.min(seconds * 1000, 300_000) }
      : {}),
  };
}

export async function readJson(
  response: Response,
  limit = 16 * 1024 * 1024,
): Promise<unknown> {
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readProviderBytes(response, limit),
    ),
  ) as unknown;
}

export async function readProviderBytes(
  response: Response,
  limit: number,
): Promise<Buffer> {
  if (!response.body) throw new Error("Missing AI response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("AI response size limit.");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type LiveConfig = Extract<DifyConfig, { mode: "live" }>;
export type Binding = LiveConfig["bindings"][number];

export function createDifyRequest(
  config: LiveConfig,
  binding: Binding,
  fetcher: typeof fetch = fetch,
) {
  return (path: string, body: unknown | undefined, signal?: AbortSignal) => {
    const deadline = AbortSignal.timeout(body === undefined ? 30_000 : 120_000);
    const multipart = body instanceof FormData;
    return fetcher(`${config.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${binding.apiKey}`,
        ...(body === undefined || multipart
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: multipart ? body : JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      redirect: "error",
      cache: "no-store",
    });
  };
}

// This adapter performs one HTTP attempt. The durable worker owns retry timing.
// Never serialize the config/binding or provider errors to a client or log.
export function createDifyWorkflow(
  config: LiveConfig,
  binding: Binding,
  fetcher: typeof fetch = fetch,
  reconnectRunId?: string,
  nodeObservations = false,
): WorkflowProvider {
  if (binding.kind !== "workflow")
    throw new Error("A workflow binding is required.");
  const request = createDifyRequest(config, binding, fetcher);
  function checked(value: unknown, expectedId?: string) {
    const result = execution(value);
    if (Buffer.byteLength(JSON.stringify(result.outputs)) > 12 * 1024 * 1024)
      throw new Error("Result size limit.");
    if (
      (expectedId && result.runId !== expectedId) ||
      (binding.workflowId && result.workflowId !== binding.workflowId)
    )
      throw new Error("AI execution identity mismatch.");
    return result;
  }
  return {
    async stream(runId, user, observe, signal) {
      id.parse(runId);
      const streamingFetch: typeof fetch = (_url, options) =>
        options?.method === "POST"
          ? fetcher(
              `${config.baseUrl}/workflow/${runId}/events?user=${encodeURIComponent(user)}&include_state_snapshot=true`,
              { ...options, method: "GET", body: undefined },
            )
          : fetcher(_url, options);
      return createDifyWorkflow(
        config,
        binding,
        streamingFetch,
        runId,
        nodeObservations,
      ).start({ user, inputs: {} }, observe, signal);
    },
    async form(token) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(token))
        throw new Error("Invalid form token.");
      const response = await request(`/form/human_input/${token}`, undefined);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Form unavailable.");
      }
      return readJson(response);
    },
    async submit(token, user, action, inputs) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(token))
        throw new Error("Invalid form token.");
      const response = await request(`/form/human_input/${token}`, {
        user,
        action,
        inputs,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Submission outcome requires reconciliation.");
      }
      await readJson(response);
    },
    async start(input, observe, signal) {
      let response: Response;
      try {
        response = await request(
          binding.workflowId
            ? `/workflows/${binding.workflowId}/run`
            : "/workflows/run",
          {
            inputs: input.inputs,
            user: input.user,
            response_mode: "streaming",
          },
          signal,
        );
      } catch (error) {
        return { kind: "unknown", failure: failure(error) };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return httpFailure(response, true);
      }
      if (
        !response.body ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        await response.body?.cancel().catch(() => undefined);
        return { kind: "unknown", failure: "invalid-response" };
      }
      let runId: string | undefined = reconnectRunId;
      let taskId: string | undefined;
      let persistenceFailed = false;
      let finished: ProviderExecution | undefined;
      async function emit(event: ProviderEvent) {
        try {
          await observe(event);
        } catch (error) {
          persistenceFailed = true;
          throw error;
        }
      }
      try {
        for await (const raw of readSse(response.body, {
          totalBytes: 32 * 1024 * 1024,
          frameBytes: 16 * 1024 * 1024,
        })) {
          const envelope = z
            .object({
              event: z.string(),
              workflow_run_id: id.optional(),
              task_id: id.optional(),
              data: z.unknown().optional(),
            })
            .parse(raw);
          if (envelope.workflow_run_id) {
            if (runId && runId !== envelope.workflow_run_id)
              throw new Error("Run changed.");
            if (taskId && envelope.task_id && taskId !== envelope.task_id)
              throw new Error("Task changed.");
            if (!runId && envelope.task_id) {
              runId = envelope.workflow_run_id;
              taskId = envelope.task_id;
              await emit({ type: "identity", runId, taskId });
            }
          }
          if (
            nodeObservations &&
            !reconnectRunId &&
            envelope.event === "workflow_started"
          ) {
            // Persist the actual publication before opt-in node observers run.
            // Legacy events may omit it; never substitute the configured identity.
            const started = z
              .object({ id, workflow_id: id })
              .safeParse(envelope.data);
            if (started.success) {
              await emit({
                type: "execution",
                execution: checked(
                  { ...started.data, status: "running", outputs: null },
                  runId,
                ),
              });
            }
          }
          if (envelope.event === "error")
            return { kind: "unknown", failure: "unavailable" };
          if (
            nodeObservations &&
            ["node_finished", "node_retry"].includes(envelope.event)
          ) {
            if (!runId) throw new Error("Missing observation identity.");
            await emit({
              type: "node-observation",
              node: nodeObservation(runId, envelope.data),
            });
          }
          if (["node_started", "node_finished"].includes(envelope.event)) {
            const node = z
              .object({
                id: z.string().max(128),
                node_id: z.string().max(128),
                title: z.string().max(200).default("Stage"),
                status: z.string().optional(),
                elapsed_time: z.number().nonnegative().optional(),
              })
              .safeParse(envelope.data);
            if (node.success)
              await emit({
                type: "stage",
                id: node.data.id,
                nodeId: node.data.node_id,
                title: node.data.title,
                status:
                  envelope.event === "node_started"
                    ? "running"
                    : ["failed", "exception"].includes(node.data.status ?? "")
                      ? "failed"
                      : "succeeded",
                elapsedMs:
                  node.data.elapsed_time === undefined
                    ? null
                    : Math.round(node.data.elapsed_time * 1000),
              });
          }
          if (envelope.event === "human_input_required") {
            const form = z
              .object({
                node_id: z.string().max(128),
                node_title: z.string().max(200).default("Decision"),
                form_token: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
              })
              .parse(envelope.data);
            await emit({
              type: "decision",
              nodeId: form.node_id,
              title: form.node_title,
              token: form.form_token,
            });
          }
          if (envelope.event === "human_input_form_timeout") {
            const form = z.object({ node_id: z.string() }).parse(envelope.data);
            await emit({ type: "decision-expired", nodeId: form.node_id });
            continue;
          }
          if (envelope.event === "human_input_form_filled") {
            const form = z
              .object({
                node_id: z.string().max(128),
                action_id: z.string().max(20),
                submitted_data: z
                  .record(z.string(), z.json())
                  .nullable()
                  .optional(),
              })
              .parse(envelope.data);
            await emit({
              type: "decision-filled",
              nodeId: form.node_id,
              action: form.action_id,
              inputs: form.submitted_data ?? {},
            });
          }
          if (envelope.event === "node_finished") {
            const node = z
              .object({
                id,
                node_type: z.string().nullish(),
                elapsed_time: z.unknown().optional(),
                execution_metadata: z
                  .record(z.string(), z.unknown())
                  .nullable()
                  .optional(),
                outputs: z
                  .object({ usage: z.unknown().optional() })
                  .nullable()
                  .optional(),
              })
              .safeParse(envelope.data);
            if (node.success) {
              // Container metadata repeats child usage, not another billable call.
              const container = ["loop", "iteration"].includes(
                node.data.node_type ?? "",
              );
              const reported = parseUsage(
                container
                  ? undefined
                  : (node.data.outputs?.usage ?? node.data.execution_metadata),
                "node",
                node.data.id,
              );
              const elapsed = z
                .number()
                .finite()
                .nonnegative()
                .safeParse(node.data.elapsed_time).data;
              reported.elapsedMs =
                elapsed === undefined ? null : Math.round(elapsed * 1000);
              await emit({ type: "usage", usage: reported });
            }
          }
          if (envelope.event === "workflow_finished") {
            if (!runId) throw new Error("Missing accepted execution identity.");
            const result = checked(envelope.data, runId);
            await emit({ type: "execution", execution: result });
            if (reconnectRunId) {
              finished = result;
              continue;
            }
            return { kind: "ok", value: result };
          }
          if (envelope.event === "workflow_paused") {
            if (!runId) throw new Error("Missing execution identity.");
            // Reconnect replays historical pauses before later resumed nodes.
            if (reconnectRunId) continue;
            const detail = await request(
              `/workflows/run/${runId}`,
              undefined,
              signal,
            );
            if (!detail.ok) return httpFailure(detail, false);
            return {
              kind: "ok",
              value: checked(await readJson(detail), runId),
            };
          }
        }
        if (finished) return { kind: "ok", value: finished };
        if (reconnectRunId && runId) {
          const detail = await request(
            `/workflows/run/${runId}`,
            undefined,
            signal,
          );
          if (!detail.ok) return httpFailure(detail, false);
          return { kind: "ok", value: checked(await readJson(detail), runId) };
        }
        return { kind: "unknown", failure: "transport" };
      } catch (error) {
        if (persistenceFailed) throw error;
        if (finished) return { kind: "ok", value: finished };
        return {
          kind: "unknown",
          failure:
            failure(error) === "timeout" ? "timeout" : "invalid-response",
        };
      }
    },
    async retrieve(runId, signal) {
      id.parse(runId);
      let response: Response;
      try {
        response = await request(`/workflows/run/${runId}`, undefined, signal);
      } catch (error) {
        return { kind: "unknown", failure: failure(error) };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return httpFailure(response, false);
      }
      try {
        return { kind: "ok", value: checked(await readJson(response), runId) };
      } catch {
        return { kind: "unknown", failure: "invalid-response" };
      }
    },
    async stop(taskId, user, signal) {
      id.parse(taskId);
      let response: Response;
      try {
        response = await request(
          `/workflows/tasks/${taskId}/stop`,
          { user },
          signal,
        );
      } catch (error) {
        return { kind: "unknown", failure: failure(error) };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return httpFailure(response, true);
      }
      try {
        z.object({ result: z.literal("success") }).parse(
          await readJson(response),
        );
        return { kind: "ok", value: undefined };
      } catch {
        return { kind: "unknown", failure: "invalid-response" };
      }
    },
  };
}
