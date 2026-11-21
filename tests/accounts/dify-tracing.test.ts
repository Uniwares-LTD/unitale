import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { tracingForRun } from "../../src/lib/server/runs/provider";
import { nodeObservation } from "../../src/lib/server/ai/node-observation";
import type { AiJob } from "../../src/lib/server/ai/jobs";

test("terminal tracing reads only the accepted app/Run and discards provider inputs and outputs", async () => {
  const previous = process.env.DIFY_MANAGEMENT_KEY;
  process.env.DIFY_MANAGEMENT_KEY = "fixture-management";
  try {
    const appId = randomUUID(),
      runId = randomUUID();
    const job = {
      binding: { mode: "live" },
      runId,
      run: { orchestrator: { appId } },
    } as AiJob;
    const result = await tracingForRun(job, async (path, options) => {
      assert.equal(
        path,
        `/apps/${appId}/workflow-runs/${runId}/node-executions`,
      );
      assert.equal(options?.management, true);
      assert.equal(options?.body, undefined);
      return {
        data: [
          {
            id: "node-execution",
            node_id: "compose",
            title: "Compose result",
            status: "succeeded",
            elapsed_time: 0.1,
            inputs: { credential: "private-input" },
            outputs: { secret: "private-output" },
          },
        ],
      };
    });
    assert.deepEqual(result, [
      {
        type: "stage",
        id: "node-execution",
        nodeId: "compose",
        title: "Compose result",
        status: "succeeded",
        elapsedMs: 100,
      },
    ]);
    assert.ok(!JSON.stringify(result).includes("private"));
    let contacted = false;
    assert.deepEqual(
      await tracingForRun(
        { ...job, binding: { mode: "fake" } } as AiJob,
        async () => {
          contacted = true;
          return {};
        },
      ),
      [],
    );
    assert.equal(contacted, false);
  } finally {
    if (previous === undefined) delete process.env.DIFY_MANAGEMENT_KEY;
    else process.env.DIFY_MANAGEMENT_KEY = previous;
  }
});

test("private terminal observations retain retry/exception rows and reject oversized payloads", async () => {
  const previous = process.env.DIFY_MANAGEMENT_KEY;
  process.env.DIFY_MANAGEMENT_KEY = "fixture-management";
  try {
    const runId = randomUUID();
    const job = {
      binding: { mode: "live" },
      runId,
      run: { orchestrator: { appId: randomUUID() } },
    } as AiJob;
    const rows = ["retry", "exception"].map((status, i) => ({
      id: `execution-${i}`,
      node_id: "child",
      title: "Child",
      status,
      retry_index: i + 1,
      outputs: { result: "private" },
      outputs_truncated: i === 1,
      inputs: { credential: "must-not-observe" },
      error: "private failure",
    }));
    const events = await tracingForRun(job, async () => ({ data: rows }), true);
    assert.equal(events.length, 3);
    assert.equal(
      events.filter((event) => event.type === "node-observation").length,
      2,
    );
    assert.equal(
      events.find((event) => event.type === "stage")?.status,
      "failed",
    );
    const second = events[1];
    assert.equal(second.type, "node-observation");
    if (second.type !== "node-observation")
      throw new Error("Expected private observation");
    assert.equal(second.node.retryIndex, 2);
    assert.equal(second.node.outputsTruncated, true);
    assert(!JSON.stringify(events).includes("must-not-observe"));
    const partial = nodeObservation(runId, {
      id: "one",
      node_id: "child",
      status: "succeeded",
    });
    assert.equal(partial.outputs, null);
    assert.equal(partial.outputsTruncated, null);
    assert.throws(
      () =>
        nodeObservation(runId, {
          ...rows[0],
          outputs: { result: "x".repeat(1024 * 1024) },
        }),
      /size limit/,
    );
    assert.throws(() =>
      nodeObservation(runId, { ...rows[0], retry_index: -1 }),
    );
  } finally {
    if (previous === undefined) delete process.env.DIFY_MANAGEMENT_KEY;
    else process.env.DIFY_MANAGEMENT_KEY = previous;
  }
});
