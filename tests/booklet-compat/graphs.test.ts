import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import sharp from "sharp";
import {
  specialistInputSchema,
  verifySpecialistResult,
} from "../../src/project/booklets/workflow-contracts";
import {
  candidates,
  childInput,
  executeCode,
  fakeAdapter,
  files,
  hash,
  identity,
  parameters,
  png,
  runChild,
  select,
  verifyReview,
  type Values,
} from "./candidates";

const originalFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
});
const values = (): Values => ({
  start: { invocation: JSON.stringify(childInput()), reference_files: files() },
  sys: { workflow_run_id: "observed-child" },
});
function prepared() {
  const v = values();
  v.prepare = executeCode(candidates().text.nodes[1], v);
  return v;
}

test("generated graphs resolve selectors and execute code with matching adapter parameters", () => {
  for (const role of ["text", "image", "reviewer"] as const) {
    const v = values();
    const result = runChild(role, v);
    assert.equal(typeof result.consumed.result, "object");
    assert.deepEqual(result.outputs.result, result.structured_output);
    assert.equal(result.consumed.nextStep, 1);
    assert.deepEqual(result.usage, {
      provider: "offline",
      model: `fake-${role}-v1`,
      inputTokens: 12,
      outputTokens: 8,
      providerCost: null,
      elapsedMs: 3,
      requestId: "fake-request-1",
    });
    const graph = candidates()[role];
    v.consume = result.consumed;
    assert.deepEqual(
      select(v, ["consume", "result"]),
      result.structured_output,
    );
    assert.equal(graph.nodes.at(-1)?.data.type, "end");
    if (role === "image") assert.equal(hash(result.image!), hash(png));
    if (role === "reviewer") {
      assert.deepEqual(result.review?.asset, childInput().references[0].asset);
      assert.deepEqual(
        result.review?.sources,
        childInput().sources.map((s) => s.revision),
      );
    }
  }
});

test("parent-generated child arguments execute through all candidate adapters without private context", () => {
  const parent = candidates().parent;
  for (const role of ["text", "image", "reviewer"] as const) {
    const v = values();
    const supplied = parameters(
      parent.nodes.find((n) => n.id === role)!,
      {
        context: {
          invocation: v.start.invocation,
          reference_files: v.start.reference_files,
        },
        start: {
          unibase_context: "private-canary",
          credential: "secret-canary",
        },
      },
    );
    assert.deepEqual(Object.keys(supplied).sort(), [
      "invocation",
      "reference_files",
    ]);
    assert.doesNotMatch(
      JSON.stringify(supplied),
      /private-canary|secret-canary/,
    );
    assert.equal(runChild(role, { ...v, start: supplied }).kind, "ok");
  }
});

test("image fixture decodes completely and reviewer rejects different originals or approved sources", async () => {
  const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 1);
  assert.equal(decoded.info.height, 1);
  const result = runChild("reviewer", values());
  for (const patch of [
    { asset: { ...result.review!.asset, assetId: "foreign" } },
    { target: { ...result.review!.target, revisionId: "foreign" } },
    { sources: [] },
    {
      disposition: "pass",
      findings: [
        {
          code: "lettering",
          blocking: true,
          description: "Missing",
          action: "Repair",
        },
      ],
    },
  ]) {
    assert.throws(() =>
      verifyReview(
        childInput(),
        {
          ...(result.structured_output as object),
          review: { ...result.review, ...patch },
        },
        "observed-child",
      ),
    );
  }
});

test("only parent has MCP and Human Input; child schemas reject private fields", () => {
  const { parent, ...children } = candidates();
  assert.ok(parent.nodes.some((n) => n.data.provider_type === "mcp"));
  assert.ok(parent.nodes.some((n) => n.data.type === "human-input"));
  for (const graph of Object.values(children)) {
    for (const n of graph.nodes.filter((n) => n.data.type === "tool"))
      assert.deepEqual(n.data.retry_config, {
        retry_enabled: false,
        max_retries: 0,
        retry_interval: 0,
      });
    assert.ok(
      graph.nodes.every(
        (n) => n.data.provider_type !== "mcp" && n.data.type !== "human-input",
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(graph),
      /unibase_context|apiKey|credential/,
    );
  }
  for (const key of ["unibase_context", "runContext", "credential", "apiKey"])
    assert.throws(() =>
      specialistInputSchema.parse({ ...childInput(), [key]: "private-canary" }),
    );
  assert.throws(() =>
    specialistInputSchema.parse({
      ...childInput(),
      references: [
        { ...childInput().references[0], url: "https://unexpected.test" },
      ],
    }),
  );
});

test("binding rejects changed invocation, publication, input fingerprint and provider identity", () => {
  const v = prepared();
  const result = fakeAdapter("text", parameters(candidates().text.nodes[2], v));
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  const output = result.structured_output as Record<string, unknown>;
  for (const key of [
    "operationId",
    "invocationId",
    "publicationId",
    "inputFingerprint",
    "workflowRunId",
  ]) {
    const changed = {
      ...output,
      [key]: key === "inputFingerprint" ? "f".repeat(64) : "wrong",
    };
    assert.throws(() =>
      verifySpecialistResult(childInput(), changed, "observed-child"),
    );
    assert.throws(() =>
      executeCode(candidates().text.nodes[3], {
        ...v,
        provider: { structured_output: changed },
      }),
    );
  }
});

test("native references preserve order, IDs and hashes and reject absent, oversized or altered bytes", () => {
  const v = prepared();
  const args = parameters(candidates().image.nodes[2], v);
  for (const badFiles of [
    [],
    [null],
    [{ ...files()[0], id: "wrong" }],
    [{ ...files()[0], bytes: Uint8Array.of(1) }],
    [{ ...files()[0], mime_type: "text/plain" }],
    [{ ...files()[0], bytes: new Uint8Array(8193) }],
  ])
    assert.throws(() => fakeAdapter("image", { ...args, files: badFiles }));
  const invocation = childInput();
  invocation.references.push({
    ...invocation.references[0],
    nativeFileId: "file-2",
  });
  const pair = [files()[0], { ...files()[0], id: "file-2" }];
  assert.equal(
    fakeAdapter("image", { ...args, invocation, files: pair }).kind,
    "ok",
  );
  assert.throws(() =>
    fakeAdapter("image", { ...args, invocation, files: pair.toReversed() }),
  );
  assert.throws(() =>
    fakeAdapter("reviewer", {
      ...args,
      invocation: { ...childInput(), sources: [] },
    }),
  );
});

test("adapter bounds, required parameters, malformed outputs and loop exhaustion fail explicitly", () => {
  const v = prepared();
  const args = parameters(candidates().text.nodes[2], v);
  for (const key of Object.keys(args)) {
    const missing = { ...args };
    delete missing[key];
    assert.throws(() => fakeAdapter("text", missing));
  }
  for (const patch of [
    { timeoutMs: 0 },
    { timeoutMs: 1001 },
    { maxBytes: 8193 },
    { maxBytes: 1 },
    { adapterIdentity: identity + "-wrong" },
  ])
    assert.throws(() => fakeAdapter("text", { ...args, ...patch }));
  const output = fakeAdapter("text", args, "malformed");
  assert.equal(output.kind, "ok");
  if (output.kind !== "ok") return;
  assert.throws(
    () =>
      executeCode(candidates().text.nodes[3], {
        ...v,
        provider: { structured_output: output.structured_output },
      }),
    /Structured object/,
  );
  const ok = runChild("text", values());
  const invalidProposal = {
    ...(ok.structured_output as object),
    proposal: { kind: "concept" },
  };
  assert.throws(() =>
    verifySpecialistResult(childInput(), invalidProposal, "observed-child"),
  );
  assert.throws(
    () =>
      executeCode(candidates().text.nodes[3], {
        ...v,
        provider: {
          structured_output: {
            ...(ok.structured_output as object),
            oversized: "x".repeat(8193),
          },
        },
      }),
    /limit/,
  );
  assert.throws(
    () => fakeAdapter("text", { ...args, maxBytes: 100 }),
    /Output byte limit/,
  );
  for (const step of [-1, 8, Infinity])
    assert.throws(
      () =>
        executeCode(candidates().text.nodes[3], {
          ...v,
          provider: { structured_output: ok.structured_output },
          prepare: { ...v.prepare, step },
        }),
      /exhausted/,
    );
  assert.throws(
    () =>
      executeCode(candidates().text.nodes[1], {
        ...v,
        start: { invocation: "x".repeat(8193) },
      }),
    /limit/,
  );
  assert.throws(() =>
    executeCode(candidates().text.nodes[1], {
      ...v,
      start: { invocation: "{" },
    }),
  );
  assert.throws(
    () => parameters(candidates().text.nodes[2], { ...v, sys: {} }),
    /Missing selector/,
  );
  assert.deepEqual(fakeAdapter("image", args, "unknown"), { kind: "unknown" });
});

test("network guard rejects unexpected requests", async () => {
  await assert.rejects(fetch("https://unexpected.test"), /Unexpected network/);
});
