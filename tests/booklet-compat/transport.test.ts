import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { parseDifyConfig } from "../../src/lib/config/dify";
import { createDifyWorkflow, providerUser } from "../../src/lib/server/ai/dify";
import type { ProviderEvent } from "../../src/lib/server/ai/types";
import { candidates } from "./candidates";

const parentId = "00000000-0000-4000-8000-000000000003";
const runId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const base = "https://offline.invalid/v1";
const config = parseDifyConfig({
  DIFY_MODE: "live",
  DIFY_BASE_URL: base,
  DIFY_ORCHESTRATORS_JSON: JSON.stringify([
    {
      id: "booklet-parent-candidate",
      name: "Offline parent",
      description: "",
      order: 0,
      enabled: true,
      keyEnv: "DIFY_KEY_OFFLINE",
      workflowId: parentId,
      inputs: [],
      pricing: null,
      recovery: null,
    },
  ]),
  DIFY_KEY_OFFLINE: "fake-service-canary",
});
if (config.mode !== "live") throw new Error("Invalid offline fixture");
const live = config;
const input = {
  user: providerUser("fixture-owner"),
  inputs: { unibase_context: "private-run-canary" },
};
const started = {
  event: "workflow_started",
  workflow_run_id: runId,
  task_id: taskId,
  data: {},
};
const detail = {
  id: runId,
  workflow_id: parentId,
  status: "succeeded",
  outputs: { result: { manifestRevisionId: "manifest-v1" } },
  total_tokens: 20,
  elapsed_time: 0.3,
};
function sse(...events: unknown[]) {
  return new Response(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const savedFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request");
  };
});
after(() => {
  globalThis.fetch = savedFetch;
});

test("application starts only parent, submits human answer and reconnects to the same production", async () => {
  const calls: string[] = [];
  const observed: ProviderEvent[] = [];
  let resumed = false;
  const parent = candidates().parent;
  const human = parent.nodes.find((n) => n.data.type === "human-input")!;
  const provider = createDifyWorkflow(
    live,
    live.bindings[0],
    async (url, options) => {
      const path = String(url).replace(base, "");
      calls.push(`${options?.method} ${path}`);
      assert.equal(
        new Headers(options?.headers).get("authorization"),
        "Bearer fake-service-canary",
      );
      if (path === `/workflows/${parentId}/run` && options?.method === "POST") {
        assert.deepEqual(JSON.parse(String(options.body)), {
          ...input,
          response_mode: "streaming",
        });
        return sse(
          started,
          {
            ...started,
            event: "human_input_required",
            data: {
              node_id: human.id,
              node_title: "Review",
              form_token: "offline-token",
            },
          },
          { ...started, event: "workflow_paused" },
        );
      }
      if (path === `/workflows/run/${runId}` && options?.method === "GET")
        return Response.json({
          ...detail,
          status: resumed ? "succeeded" : "paused",
        });
      if (path === "/form/human_input/offline-token") {
        if (options?.method === "GET")
          return Response.json({
            form_content: human.data.form_content,
            user_actions: human.data.user_actions,
          });
        assert.deepEqual(JSON.parse(String(options?.body)), {
          user: input.user,
          action: "continue",
          inputs: { response: "Approve revision-v1" },
        });
        resumed = true;
        return Response.json({});
      }
      if (
        path ===
          `/workflow/${runId}/events?user=${encodeURIComponent(input.user)}&include_state_snapshot=true` &&
        options?.method === "GET"
      ) {
        assert.ok(resumed);
        return sse(started, {
          ...started,
          event: "workflow_finished",
          data: detail,
        });
      }
      throw new Error(`Unexpected offline request: ${options?.method} ${path}`);
    },
  );
  const paused = await provider.start(input, async (e) => {
    observed.push(e);
  });
  assert.equal(paused.kind, "ok");
  if (paused.kind === "ok") assert.equal(paused.value.status, "paused");
  assert.ok(
    observed.some((e) => e.type === "decision" && e.nodeId === human.id),
  );
  await provider.form!("offline-token");
  await provider.submit!("offline-token", input.user, "continue", {
    response: "Approve revision-v1",
  });
  const continued = await provider.stream!(runId, input.user, async (e) => {
    observed.push(e);
  });
  assert.equal(continued.kind, "ok");
  if (continued.kind === "ok") {
    assert.equal(continued.value.runId, runId);
    assert.deepEqual(continued.value.outputs, detail.outputs);
  }
  assert.equal((await provider.retrieve(runId)).kind, "ok");
  assert.equal(calls.filter((c) => c.startsWith("POST /workflows/")).length, 1);
  assert.doesNotMatch(
    JSON.stringify(observed),
    /private-run-canary|fake-service-canary/,
  );
});

test("lost start response and interrupted stream never replay generation; observed identity allows retrieval", async () => {
  for (const interrupted of [false, true]) {
    let starts = 0;
    const events: ProviderEvent[] = [];
    const provider = createDifyWorkflow(
      live,
      live.bindings[0],
      async (url, options) => {
        if (
          String(url) === `${base}/workflows/${parentId}/run` &&
          options?.method === "POST"
        ) {
          starts++;
          if (!interrupted) throw new TypeError("Lost response");
          return sse(started); // Accepted execution, then stream ends without a terminal event.
        }
        assert.equal(String(url), `${base}/workflows/run/${runId}`);
        assert.equal(options?.method, "GET");
        return Response.json(detail);
      },
    );
    assert.equal(
      (
        await provider.start(input, async (e) => {
          events.push(e);
        })
      ).kind,
      "unknown",
    );
    assert.equal(starts, 1);
    if (interrupted) {
      assert.ok(events.some((e) => e.type === "identity" && e.runId === runId));
      assert.equal((await provider.retrieve(runId)).kind, "ok");
      assert.equal(starts, 1);
    }
  }
});

test("uncertain human submission is surfaced for reconciliation, never retried", async () => {
  let attempts = 0;
  const provider = createDifyWorkflow(
    live,
    live.bindings[0],
    async (url, options) => {
      assert.equal(String(url), `${base}/form/human_input/offline-token`);
      assert.equal(options?.method, "POST");
      attempts++;
      throw new TypeError("Lost submission response");
    },
  );
  await assert.rejects(
    provider.submit!("offline-token", input.user, "continue", {
      response: "Approved",
    }),
  );
  assert.equal(attempts, 1);
});
