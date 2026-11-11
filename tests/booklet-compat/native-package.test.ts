/* eslint-disable @typescript-eslint/no-explicit-any -- Mutable JSON fixtures and parsed Dify DSL deliberately do not duplicate schemas as TypeScript contracts. */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fingerprint as hash } from "../../src/lib/server/foundation/canonical";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "yaml";
import { parseResult } from "../../src/lib/contracts/runs";
import { inspectDifyWorkflow } from "../../src/lib/server/runs/dify-capabilities";

// Inspect actual DSL and execute isolated pure Code functions. This is not a Dify engine.
const root = resolve("docs/features/booklet-generation/workflow-package");
const roles = [
  "manager",
  "story-planner",
  "manuscript",
  "art-director",
  "page-composer",
  "image-executor",
  "quality-reviewer",
];
const apps = Object.fromEntries(
  roles.map((role) => [
    role,
    parse(readFileSync(resolve(root, role, "workflow.yaml"), "utf8")),
  ]),
);
const python =
  process.env.BOOKLET_PYTHON ??
  (existsSync("output/tooling/python312/python.exe")
    ? resolve("output/tooling/python312/python.exe")
    : "python3");
function code(role: string, id: string) {
  return apps[role].workflow.graph.nodes.find((n: any) => n.id === id).data
    .code as string;
}
function run(role: string, id: string, args: Record<string, unknown>) {
  const result = spawnSync(
    python,
    [
      "-c",
      "import json,sys; v=json.load(sys.stdin); s={}; exec(compile(v['code'],'<actual-dsl-code>','exec'),s); print(json.dumps(s['main'](**v['args']),ensure_ascii=False))",
    ],
    {
      input: JSON.stringify({ code: code(role, id), args }),
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, PYTHONUTF8: "1" },
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}
const fixture = JSON.parse(
  readFileSync(resolve(root, "fixtures/behavior-cases.json"), "utf8"),
);
function request(service = "story-planner", operation = "concept"): any {
  return {
    contractVersion: 2,
    invocationId: "invocation-1",
    callId: "call-1",
    service,
    operation,
    intent: "create",
    items: [{ itemId: "item-1", input: {} }],
    sources: [],
    references: [],
    constraints: {},
  };
}
function context(): any {
  return {
    checkpointVersion: 4,
    fence: 7,
    sources: [],
    work: [],
    assessments: [],
    corrections: [],
    usage: { canDispatch: true },
    policyBinding: "policy-1",
    reviewerBinding: "reviewer-1",
  };
}
function guard(action: string, args: any, c = context()) {
  return run("manager", "guard", {
    context: JSON.stringify(c),
    decision: { action, request_json: JSON.stringify(args), reason: "fixture" },
  });
}
function register(r: any, c = context(), correction?: any) {
  c.sources = r.sources;
  const meaningful = {
    ...r,
    references: r.references.map((ref: any) =>
      Object.fromEntries(
        Object.entries(ref).filter(
          ([key]) => !["nativeFileId", "url"].includes(key),
        ),
      ),
    ),
  };
  c.work.push({
    callId: r.callId,
    requestHash: hash(meaningful),
    status: "registered",
    ...(correction ? { correction } : {}),
  });
  return c;
}
function retained(r: any, c = context()) {
  register(r, c);
  c.checkpoint = JSON.parse(guard(r.service, r, c).checkpoint).state;
  Object.assign(c.work.at(-1), {
    service: r.service, operation: r.operation,
    status: "partial", resultAvailable: true,
  });
  return c;
}
test("Manager context preserves a complete large checkpoint within its separate context budget", () => {
  const c = context();
  c.checkpoint = { keep: "x".repeat(64000) };
  c.work = [{ note: "w".repeat(6000) }];
  assert.ok(Buffer.byteLength(JSON.stringify(c)) > 65536);
  const facts = run("manager", "facts", { raw: JSON.stringify({ result: c }), execution_ready: "false" });
  assert.deepEqual(JSON.parse(facts.context).checkpoint, c.checkpoint);
  const checkpoint = JSON.parse(guard("read_document", { kind: "work", id: "known-call" }, c).checkpoint);
  assert.deepEqual(checkpoint.state.keep, c.checkpoint.keep);
  c.work = [{ note: "w".repeat(131072) }];
  assert.throws(() => run("manager", "facts", { raw: JSON.stringify({ result: c }), execution_ready: "false" }), /Context capacity/);
});
test("Manager terminal view uses the Run contract without exposing domain evidence", () => {
  for (const [status, outcome] of [
    ["complete", "success"],
    ["invalid_input", "failed"],
    ["failed", "failed"],
    ["partial", "partial"],
    ["unknown", "partial"],
    ["unexpected", "partial"],
  ]) {
    const domain = {
      status,
      reason: "private provider detail",
      evidence: "private receipt",
    };
    const output = run("manager", "finish", {
      result: JSON.stringify(domain),
      done: true,
    });
    assert.deepEqual(JSON.parse(output.booklet_result), domain);
    const view = parseResult(output);
    assert.equal(view.outcome, outcome);
    assert.deepEqual(view.cards, []);
    assert.deepEqual(view.images, []);
    assert.equal(view.checkpoint, null);
    assert(!JSON.stringify(view).includes("private"));
  }
  const unfinished = run("manager", "finish", {
    result: JSON.stringify({ status: "complete" }),
    done: false,
  });
  assert.equal(parseResult(unfinished).outcome, "partial");
  assert.deepEqual(JSON.parse(unfinished.booklet_result), {
    status: "partial",
    reason: "action_bound_reached",
  });
  const confirmed = run("manager", "consume", {
    raw: [{ result: { status: "complete" } }],
    action: "complete", request: "{}",
    context: JSON.stringify(context()), version: 4,
  });
  assert.equal(parseResult(run("manager", "finish", {
    result: confirmed.result, done: confirmed.done,
  })).outcome, "success");
  assert.throws(
    () => run("manager", "finish", { result: "[]", done: true }),
    /outcome object/,
  );
  const end = apps.manager.workflow.graph.nodes.find(
    (node: any) => node.id === "end",
  );
  assert.deepEqual(
    end.data.outputs.map((output: any) => [
      output.variable,
      output.value_selector,
    ]),
    [
      ["result", ["finish", "result"]],
      ["booklet_result", ["finish", "booklet_result"]],
    ],
  );
});
test("Manager resumes committed completion without reasoning or trusting stale checkpoint intent", () => {
  const c = context();
  c.checkpoint = { pending: { action: "complete" }, lastResult: { status: "complete" } };
  c.usage.canDispatch = false;
  const gate = (state: string, enabled: string) => {
    const facts = run("manager", "facts", { raw: { result: { ...c, state } }, execution_ready: enabled });
    assert.equal(facts.route, "pause");
    const gated = run("manager", "gated", { reason: facts.result });
    return parseResult(run("manager", "finish", { result: gated.result, done: gated.done }));
  };
  assert.equal(gate("in-progress", "true").outcome, "partial");
  assert.equal(gate("completed", "true").outcome, "success");
  assert.equal(gate("completed", "false").outcome, "success");
  assert.throws(() => run("manager", "gated", { reason: '{"status":"invented"}' }), /gate outcome/);
});

test("Manager registers the complete hash-bound child payload rather than a claimed identity", () => {
  const childRequest = request();
  const registration = { action: "register", childRequest, requestHash: hash(childRequest), targets: ["target-1"], fence: 7 };
  const planned = guard("begin_work", registration);
  assert.deepEqual(JSON.parse(planned.request), registration);
  const pending = JSON.parse(planned.checkpoint).state.pending;
  assert.equal(pending.callId, childRequest.callId);
  assert.equal(pending.invocationId, childRequest.invocationId);
  assert.deepEqual(pending.itemIds, ["item-1"]);
  assert.throws(() => guard("begin_work", { ...registration, childRequest: undefined }), /Complete child request/);
  assert.throws(() => guard("begin_work", { ...registration, requestHash: "0".repeat(64) }), /actual child request/);
  assert.throws(() => guard("begin_work", { ...registration, childRequest: { ...childRequest, constraints: { credentials: "private" } } }), /private bindings/);
});
test("Manager action branches use the fence confirmed by the pre-action checkpoint", () => {
  const c = context();
  const planned = guard("index", { subjects: [], artifacts: [], fence: c.fence }, c);
  const args = { raw: [{ result: { checkpointVersion: 5, fence: 8 } }], context: JSON.stringify(c), request: planned.request, dispatch: planned.dispatch, action: "index" };
  const saved = run("manager", "saved", args);
  const bound = JSON.parse(saved.request);
  assert.equal(bound.fence, 8);
  assert.equal(JSON.parse(saved.dispatch).fence, 8);
  assert.equal(JSON.parse(planned.checkpoint).state.pending.requestHash, hash({ subjects: [], artifacts: [] }));
  assert.equal(saved.version, 5);
  for (const fence of [undefined, true, 6, 8.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => run("manager", "saved", { ...args, raw: [{ result: { checkpointVersion: 5, fence } }] }), /fence was not confirmed/);
  const read = run("manager", "saved", { ...args, request: JSON.stringify({ kind: "history" }) });
  assert.deepEqual(JSON.parse(read.request), { kind: "history" });
  const lease = run("manager", "saved", { ...args, action: "lease", request: JSON.stringify({ action: "acquire" }) });
  assert.deepEqual(JSON.parse(lease.request), { action: "acquire", fence: 8 });
  assert.throws(() => run("manager", "saved", { ...args, context: JSON.stringify({ ...c, checkpointVersion: 0 }), raw: [{ result: { checkpointVersion: true, fence: 8 } }] }), /not durably/);
  const nodes = apps.manager.workflow.graph.nodes;
  const branches = nodes.filter((node: any) => node.id.startsWith("app-"));
  assert.equal(branches.length, 14);
  for (const node of branches)
    assert.deepEqual(node.data.tool_parameters.request.value, ["saved", "request"]);
  assert.deepEqual(nodes.find((node: any) => node.id === "dispatch").data.tool_parameters.request.value, ["saved", "dispatch"]);
  assert.deepEqual(nodes.find((node: any) => node.id === "before").data.tool_parameters.request.value, ["guard", "checkpoint"]);
});
test("Manager private Start is recognized by existing Run capability inspection", () => {
  const nodes = apps.manager.workflow.graph.nodes;
  // Isolate actual exported nodes: other planned tools are not registered yet.
  // This proves private-input compatibility, not full candidate registration.
  const graph = { nodes: ["start", "app-save_revision", "end"].map(id => nodes.find((node: any) => node.id === id)) };
  const inspected = inspectDifyWorkflow(graph, "raw-v1");
  assert.equal(inspected.contextInputName, "context");
  assert.equal(inspected.contextInput, true);
  assert.deepEqual(inspected.inputs.map(field => field.name), ["request"]);
  assert.deepEqual(inspected.privateTools, ["booklet_save_revision_v2"]);
});

test("seven readable native candidates preserve private bindings and disable node retries", () => {
  assert.equal(
    readdirSync(root).filter((x) =>
      existsSync(resolve(root, x, "workflow.yaml")),
    ).length,
    7,
  );
  assert.ok(
    !existsSync(resolve(root, "authoring")) &&
      !existsSync(resolve(root, "contracts")),
  );
  assert.ok(!existsSync("dify/plugins/provider-execution"));
  for (const role of roles) {
    const source = readFileSync(resolve(root, role, "workflow.yaml"), "utf8");
    // PyYAML resolves these words as booleans, while our local YAML 1.2 parser does not.
    assert.doesNotMatch(source, /:\s*(?:yes|no|on|off)\s*$/gim, `${role}: quote ambiguous Dify YAML scalars`);
    const { graph, environment_variables } = apps[role].workflow;
    assert.equal(
      environment_variables.find((v: any) => v.name === "execution_ready")
        .value,
      "false",
    );
    const ids = new Set(graph.nodes.map((n: any) => n.id));
    assert.equal(ids.size, graph.nodes.length);
    for (const edge of graph.edges)
      assert.ok(
        ids.has(edge.source) && ids.has(edge.target),
        `${role}: dangling edge`,
      );
    for (const node of graph.nodes) {
      if (node.parentId) assert.ok(ids.has(node.parentId));
      if (["tool", "llm"].includes(node.data.type))
        assert.equal(node.data.retry_config.retry_enabled, false);
      if (role === "image-executor" && node.data.type === "tool") {
        // Shared installed tools do not expose SDK transport controls. Node retries
        // stay disabled above; SDK retries/default timeouts are accepted separately.
        assert.equal(node.data.tool_configurations.max_retries, undefined);
        assert.equal(node.data.tool_configurations.request_timeout, undefined);
      }
      if (node.data.type === "llm") {
        assert.equal(node.data.model.completion_params.service_tier, "default");
        assert.equal(node.data.structured_output_switch_on, true);
        // Older target DTOs require this wire alias even when switch_on is present.
        assert.equal(node.data.structured_output_enabled, true);
        const checkStrictSchema = (schema: any): void => {
          if (!schema || typeof schema !== "object") return;
          if (schema.type === "object") {
            assert.equal(schema.additionalProperties, false);
            assert.deepEqual(
              [...schema.required].sort(),
              Object.keys(schema.properties).sort(),
            );
          }
          for (const value of Object.values(schema)) checkStrictSchema(value);
        };
        checkStrictSchema(node.data.structured_output.schema);
      }
      if (node.data.type === "code") {
        assert.doesNotMatch(
          node.data.code,
          /BookletNode|Zod|__webpack_require__/,
          `${role}/${node.id}: bundled runtime`,
        );
        assert.doesNotMatch(
          node.data.code,
          /\b(import (?:os|sys|socket|requests)|require\(|fetch\(|open\()/,
        );
        for (const v of node.data.variables)
          assert.notDeepEqual(v.value_selector, ["start", "context"]);
      }
      if (node.data.provider_type === "mcp") {
        assert.equal(role, "manager");
        assert.deepEqual(node.data.tool_parameters.runContext, {
          type: "variable",
          value: ["start", "context"],
        });
      }
      if (role !== "manager")
        assert.ok(!["human-input", "http-request"].includes(node.data.type));
      function selectors(value: any) {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (
            [
              "value_selector",
              "variable_selector",
              "iterator_selector",
              "output_selector",
            ].includes(key) &&
            Array.isArray(child) &&
            child.length
          ) {
            assert.ok(
              ids.has(child[0]) || ["env", "sys"].includes(child[0]),
              `${role}/${node.id}: missing selector ${child.join(".")}`,
            );
            const selected = graph.nodes.find((n: any) => n.id === child[0]);
            if (selected?.data.type === "code")
              assert.ok(
                child[1] in selected.data.outputs,
                `${role}/${node.id}: missing Code output`,
              );
          }
          selectors(child);
        }
      }
      selectors(node.data);
      if (node.data.type === "if-else")
        for (const handle of [
          ...node.data.cases.map((c: any) => c.case_id),
          "false",
        ]) {
          assert.ok(
            graph.edges.some(
              (e: any) => e.source === node.id && e.sourceHandle === handle,
            ),
            `${role}/${node.id}: unmapped branch ${handle}`,
          );
        }
    }
  }
  assert.equal(
    apps.manager.workflow.graph.nodes.find((n: any) => n.data.type === "loop")
      .data.loop_count,
    64,
  );
});

test("every inline Python node compiles without running a workflow", () => {
  const source = roles.flatMap((role) =>
    apps[role].workflow.graph.nodes
      .filter((n: any) => n.data.type === "code")
      .map((n: any) => n.data.code),
  );
  const result = spawnSync(
    python,
    [
      "-c",
      "import json,sys; [compile(s,'<dsl>','exec') for s in json.load(sys.stdin)]",
    ],
    { input: JSON.stringify(source), encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("child validation rejects private fields, changed reference order and unscoped revision", () => {
  const r = request();
  assert.equal(
    run("story-planner", "validate", {
      request: JSON.stringify(r),
      execution_ready: "true",
    }).request,
    JSON.stringify(r),
  );
  assert.throws(
    () =>
      run("story-planner", "validate", {
        request: JSON.stringify({ ...r, runContext: "canary" }),
        execution_ready: "true",
      }),
    /private/,
  );
  r.intent = "revise";
  assert.throws(
    () =>
      run("story-planner", "validate", {
        request: JSON.stringify(r),
        execution_ready: "true",
      }),
    /baseline/,
  );
  r.intent = "create";
  r.references = [
    { assetId: "a", sha256: "hash-a", nativeFileId: "file-a", bytes: 100 },
  ];
  assert.throws(
    () =>
      run("story-planner", "validate", {
        request: JSON.stringify(r),
        references: [{ id: "file-b" }],
        execution_ready: "true",
      }),
    /identity\/order/,
  );
  assert.throws(
    () =>
      run("story-planner", "validate", { request: JSON.stringify(request()) }),
    /Activation pending/,
  );
});

test("missing/duplicate creative items cannot become success; partial siblings survive", () => {
  const r = request();
  r.items.push({ itemId: "item-2", input: {} });
  const proposal = {
    kind: "concept",
    subjectId: "book",
    content: {
      title: "Moon",
      premise: "A trip",
      audience: "family",
      tone: "warm",
      constraints: [],
    },
  };
  const first = {
    itemId: "item-1",
    status: "succeeded",
    proposals: [proposal],
    limitations: [],
  };
  assert.throws(
    () =>
      run("story-planner", "pack", {
        request: JSON.stringify(r),
        response: { items: [first] },
      }),
    /Missing/,
  );
  assert.throws(
    () =>
      run("story-planner", "pack", {
        request: JSON.stringify(r),
        response: { items: [first, first] },
      }),
    /duplicate/,
  );
  const result = JSON.parse(
    run("story-planner", "pack", {
      request: JSON.stringify(r),
      response: {
        items: [
          first,
          {
            itemId: "item-2",
            status: "needs_input",
            proposals: [],
            limitations: ["Missing fact"],
          },
        ],
      },
    }).result,
  );
  assert.equal(result.status, "partial");
  assert.deepEqual(result.items[0].proposals[0].content, {
    ...proposal.content,
    kind: "concept",
  });
});

test("strict model content carrier decodes before existing content validation", () => {
  const r = request();
  const content = {
    title: fixture.exactText,
    premise: "A quiet story",
    audience: "age 6",
    tone: "gentle",
    constraints: [],
  };
  const proposal = { kind: "concept", subjectId: "concept-1", content: JSON.stringify(content) };
  const response = { items: [{ itemId: "item-1", status: "succeeded", proposals: [proposal], limitations: [] }] };
  const result = JSON.parse(run("story-planner", "pack", { request: JSON.stringify(r), response }).result);
  assert.deepEqual(result.items[0].proposals[0].content, { ...content, kind: "concept" });
  proposal.content = "not JSON";
  assert.throws(() => run("story-planner", "pack", { request: JSON.stringify(r), response }));
  proposal.content = "[]";
  assert.throws(() => run("story-planner", "pack", { request: JSON.stringify(r), response }), /Typed identified content/);
});

test("pagination preserves exact Unicode/code-point spans and rejects omissions and duplication", () => {
  const r = request("page-composer", "paginate");
  r.sources = [
    {
      artifactId: "manuscript",
      revisionId: "m1",
      contentHash: "bound-by-manager",
      content: {
        kind: "manuscript",
        units: [
          {
            id: "unit-1",
            texts: [
              {
                id: "text-1",
                kind: "dialogue",
                speaker: "character-1",
                text: fixture.exactText,
              },
            ],
          },
        ],
      },
    },
  ];
  r.constraints = {
    storyPages: 1,
    includeCover: false,
    maxPanelsPerPage: 2,
    canvas: { width: 1024, height: 1536 },
    direction: "rtl",
  };
  const span = {
    textId: "text-1",
    kind: "dialogue",
    speaker: "character-1",
    start: 0,
    end: [...fixture.exactText].length,
    text: fixture.exactText,
  };
  const content = {
    pages: [
      {
        id: "page-1",
        role: "story",
        panels: [{ id: "panel-1", noText: false, lettering: [span] }],
      },
    ],
    canvas: r.constraints.canvas,
    direction: "rtl",
  };
  const response = {
    items: [
      {
        itemId: "item-1",
        status: "succeeded",
        proposals: [{ kind: "book-layout", subjectId: "book", content }],
        limitations: [],
      },
    ],
  };
  assert.equal(
    JSON.parse(
      run("page-composer", "pack", { request: JSON.stringify(r), response })
        .result,
    ).status,
    "succeeded",
  );
  span.text = fixture.exactText.trim();
  assert.throws(
    () =>
      run("page-composer", "pack", { request: JSON.stringify(r), response }),
    /lettering/,
  );
  span.text = fixture.exactText;
  const extraLayout = structuredClone(response);
  const invalidLayout = structuredClone(extraLayout.items[0].proposals[0]);
  invalidLayout.content.pages[0].panels[0].lettering[0].text = "changed";
  extraLayout.items[0].proposals.push(invalidLayout);
  assert.throws(
    () => run("page-composer", "pack", { request: JSON.stringify(r), response: extraLayout }),
    /lettering/,
  );
  const invalidRole = structuredClone(response);
  invalidRole.items[0].proposals[0].content.pages.push({
    ...structuredClone(content.pages[0]), id: "extra", role: "unrecognized",
  });
  assert.throws(
    () => run("page-composer", "pack", { request: JSON.stringify(r), response: invalidRole }),
    /page role/,
  );
  const duplicatePanel = structuredClone(response);
  duplicatePanel.items[0].proposals[0].content.pages[0].panels.push(structuredClone(content.pages[0].panels[0]));
  assert.throws(
    () => run("page-composer", "pack", { request: JSON.stringify(r), response: duplicatePanel }),
    /Duplicate panel/,
  );
  content.pages[0].panels[0].lettering.push(span);
  assert.throws(
    () =>
      run("page-composer", "pack", { request: JSON.stringify(r), response }),
    /duplicated/,
  );
});

test("Reviewer rejects unseen coverage, uncertain pass and advisory-only repair", () => {
  const r = request("quality-reviewer", "image");
  r.items[0].input = {
    targetIds: ["page-1"],
    targetHash: "page-content-hash",
    referencePositions: [0],
  };
  r.references = [{ assetId: "original-page-1" }];
  const content: any = {
    coverage: { targetIds: ["page-1"], referencePositions: [] },
    disposition: "pass",
    findings: [],
    limitations: [],
  };
  const response = {
    items: [
      {
        itemId: "item-1",
        status: "succeeded",
        proposals: [{ kind: "assessment", subjectId: "page-1", content }],
        limitations: [],
      },
    ],
  };
  assert.throws(
    () =>
      run("quality-reviewer", "pack", { request: JSON.stringify(r), response }),
    /coverage/,
  );
  content.coverage.referencePositions = [0];
  content.findings = [
    {
      id: "finding-1",
      criterion: "lettering",
      classification: "uncertain",
      targetId: "page-1",
      expected: "Readable",
      observed: "Ambiguous",
    },
  ];
  assert.throws(
    () =>
      run("quality-reviewer", "pack", { request: JSON.stringify(r), response }),
    /uncertain/,
  );
  content.findings[0].classification = "advisory";
  content.disposition = "repair";
  assert.throws(
    () =>
      run("quality-reviewer", "pack", { request: JSON.stringify(r), response }),
    /confirmed/,
  );
});

function imageRequest(): any {
  const r = request("image-executor", "prepare");
  const lettering = [
    {
      textId: "text-1",
      kind: "dialogue",
      speaker: "character-1",
      start: 0,
      end: [...fixture.exactText].length,
      text: fixture.exactText,
    },
  ];
  const panels = [{ id: "panel-1", lettering, noText: false }];
  const specification = { kind: "page-spec", pageId: "page-1", panels };
  const style = { kind: "style", direction: "warm watercolor" };
  const layout = {
    kind: "book-layout",
    pages: [{ id: "page-1", panels }],
    canvas: { width: 1024, height: 1536 },
  };
  r.sources = [specification, style, layout].map((content, i) => ({
    artifactId: "source-" + i,
    revisionId: "revision-" + i,
    contentHash: hash(content),
    content,
  }));
  r.items[0].input = {
    imageKind: "page",
    specification,
    style,
    lettering,
    settings: {
      mode: "generate",
      model: "gpt-image-2.5-sunburst",
      count: 2,
      canvas: layout.canvas,
      quality: "high",
      background: "opaque",
      format: "png",
    },
  };
  return r;
}
test("deterministic Prepare preserves text and meaningful hash while Generate refuses changed/unverified requests", () => {
  const r = imageRequest();
  const prepared = JSON.parse(
    run("image-executor", "validate", { request: JSON.stringify(r) }).result,
  ).items[0].prepared;
  assert.ok(prepared.prompt.includes(fixture.exactText));
  const { requestHash, ...body } = prepared;
  assert.equal(requestHash, hash(body));
  r.operation = "generate";
  r.items[0].input = { prepared };
  assert.throws(
    () => run("image-executor", "validate", {
      request: JSON.stringify(r), execution_ready: "true",
    }),
    /distinct callId/,
  );
  r.callId = "generate-1";
  assert.throws(
    () => run("image-executor", "validate", { request: JSON.stringify(r) }),
    /Activation blocked/,
  );
  assert.equal(run("image-executor", "validate", {
    request: JSON.stringify(r), execution_ready: "true",
  }).model, "gpt-image-2.5-sunburst");
  assert.equal(prepared.callId, "call-1");
  const changedSources = structuredClone(r);
  changedSources.sources[0].revisionId = "different-revision";
  assert.throws(() => run("image-executor", "validate", {
    request: JSON.stringify(changedSources), execution_ready: "true",
  }), /source\/original identity changed/);
  prepared.prompt += "changed";
  assert.throws(
    () => run("image-executor", "validate", { request: JSON.stringify(r) }),
    /request changed/,
  );
});

test("unpaid Prepare requires durable registration and checkpoints a retained work reference", () => {
  const r = imageRequest();
  assert.throws(() => guard(r.service, r), /Unregistered/);
  const c = register(r);
  c.usage.canDispatch = false;
  const planned = guard(r.service, r, c);
  assert.equal(planned.paid, "no");
  assert.equal(planned.dispatchChild, "yes");
  assert.equal(JSON.parse(planned.dispatch).callId, r.callId);
  c.checkpoint = JSON.parse(planned.checkpoint).state;
  const result = JSON.parse(run("image-executor", "validate", { request: JSON.stringify(r) }).result);
  const consume = () => run("manager", "consume", { raw: { result }, action: r.service,
    request: JSON.stringify(r), context: { result: c }, version: c.checkpointVersion });
  assert.throws(consume, /not confirmed in retained work/);
  Object.assign(c.work[0], { service: r.service, operation: r.operation, status: "succeeded", resultAvailable: true });
  assert.deepEqual(JSON.parse(consume().checkpoint).state.lastResult, {
    document: { kind: "work", id: r.callId }, requestHash: hash(r), status: "succeeded",
  });
  assert.throws(() => guard(r.service, r, c), /already dispatched/);
});

test("partial image outputs retain individual identities; lost results remain unknown", () => {
  const r = imageRequest();
  const prepared = JSON.parse(
    run("image-executor", "validate", { request: JSON.stringify(r) }).result,
  ).items[0].prepared;
  r.operation = "generate";
  r.callId = "generate-1";
  r.items[0].input = { prepared };
  const result = JSON.parse(
    run("image-executor", "generate-result", {
      request: JSON.stringify(r),
      files: [{ id: "original-1" }],
    }).result,
  );
  assert.equal(result.status, "partial");
  assert.equal(result.items[0].outputs[0].outputKey, "generate-1:0");
  assert.equal(
    JSON.parse(
      run("image-executor", "generate-result", { request: JSON.stringify(r) })
        .result,
    ).status,
    "unknown",
  );
  assert.equal(
    JSON.parse(
      run("image-executor", "generate-unknown", { request: JSON.stringify(r) })
        .result,
    ).status,
    "unknown",
  );
});

test("Prepare rejects unselected specification, altered lettering and wrong original canvas", () => {
  const r = imageRequest();
  r.items[0].input.specification = {
    ...r.items[0].input.specification,
    pageId: "invented",
  };
  assert.throws(
    () => run("image-executor", "validate", { request: JSON.stringify(r) }),
    /exact selected/,
  );
  const lettering = imageRequest();
  lettering.items[0].input.lettering = [{ text: "rewritten" }];
  assert.throws(
    () =>
      run("image-executor", "validate", { request: JSON.stringify(lettering) }),
    /lettering\/canvas/,
  );
  const canvas = imageRequest();
  canvas.items[0].input.settings.canvas = { width: 1024, height: 1024 };
  assert.throws(
    () =>
      run("image-executor", "validate", { request: JSON.stringify(canvas) }),
    /lettering\/canvas/,
  );
});

test("Manager preserves native original order; transport-handle renewal does not alter dispatch hash", () => {
  const r = request();
  r.references = [
    {
      assetId: "asset-a",
      sha256: "hash-a",
      bytes: 100,
      nativeFileId: "expired",
    },
  ];
  const c = register(r);
  const before = guard(r.service, r, c);
  const bound = JSON.parse(
    run("manager", "bind-originals", {
      request: JSON.stringify(r),
      raw: [{ result: { references: r.references } }],
      files: [{ related_id: "renewed" }],
    }).request,
  );
  assert.equal(bound.references[0].nativeFileId, "renewed");
  assert.equal(guard(r.service, bound, c).dispatch, before.dispatch);
  assert.throws(
    () =>
      run("manager", "bind-originals", {
        request: JSON.stringify(r),
        raw: [
          { result: { references: [{ ...r.references[0], sha256: "wrong" }] } },
        ],
        files: [{ id: "renewed" }],
      }),
    /changed\/order/,
  );
});

test("Manager never replays unknown/completed work or dispatches modified source content", () => {
  const many = request();
  many.sources = Array.from({ length: 20 }, (_, i) => ({ artifactId: "source-" + i,
    revisionId: "revision-" + i, contentHash: hash({ title: "owned source" }), content: { title: "owned source" } }));
  const registered = register(many);
  registered.sources = [];
  registered.sourcesComplete = false;
  assert.equal(guard(many.service, many, registered).paid, "yes");
  many.sources[0].revisionId = "changed-after-registration";
  assert.throws(() => guard(many.service, many, registered), /Unregistered\/changed/);
  const r = request();
  const c = register(r);
  assert.equal(guard(r.service, r, c).paid, "yes");
  c.work[0].status = "unknown";
  assert.throws(() => guard(r.service, r, c), /reconcile/);
  c.work[0].status = "succeeded";
  assert.throws(() => guard(r.service, r, c), /reconcile/);
  r.sources = [
    {
      artifactId: "a",
      revisionId: "r1",
      contentHash: hash({ title: "original" }),
      content: { title: "changed" },
    },
  ];
  c.sources = r.sources;
  assert.throws(() => guard(r.service, r, c), /[Mm]odified source/);
});

test("Manager enforces durable correction limits without treating assessment previews as finding authority", () => {
  const r = request();
  const correction = {
    rootId: "task-root",
    family: "text",
    findingIds: ["defect-1"],
  };
  const c = register(r, context(), correction);
  c.corrections = [
    {
      rootId: "task-root",
      family: "text",
      used: 3,
      limit: 3,
      targetIds: ["target-1"],
    },
  ];
  assert.throws(() => guard(r.service, r, c), /exhausted/);
  c.corrections[0].used = 2;
  // The app verified finding lineage when it registered this exact request.
  // Older findings need not appear in the bounded recent preview.
  assert.equal(guard(r.service, r, c).paid, "yes");
  c.assessments = [
    {
      findings: [
        { id: "defect-1", targetId: "target-1", classification: "confirmed" },
      ],
    },
  ];
  assert.equal(guard(r.service, r, c).paid, "yes");
});

test("Manager requires exact preflight and whole-book actual-pixel coverage", () => {
  const r = imageRequest();
  const prepared = JSON.parse(
    run("image-executor", "validate", { request: JSON.stringify(r) }).result,
  ).items[0].prepared;
  r.operation = "generate";
  r.callId = "generate-1";
  r.items[0].input = { prepared };
  const c = register(r);
  assert.throws(() => guard(r.service, r, c), /preflight/);
  c.assessments = [
    {
      mode: "image_request",
      targetHash: prepared.requestHash,
      disposition: "pass",
      complete: true,
      policyBinding: c.policyBinding,
      reviewerBinding: c.reviewerBinding,
    },
  ];
  c.work[0].preflight = c.assessments[0];
  c.assessments = [];
  assert.equal(guard(r.service, r, c).paid, "yes");
  c.work[0].preflight = { ...c.work[0].preflight, policyBinding: "wrong-policy" };
  assert.throws(() => guard(r.service, r, c), /preflight/);
  c.work[0].preflight.policyBinding = c.policyBinding;
  c.usage.canDispatchImage = false;
  assert.throws(() => guard(r.service, r, c), /dispatch currently blocked/);
  c.usage.canDispatchImage = true;
  c.usage.canDispatch = false;
  assert.equal(guard(r.service, r, c).paid, "yes");
  assert.throws(
    () => guard("complete", { manifestRevisionId: "selected-manifest" }, c),
    /coverage incomplete/,
  );
  c.manifestReview = { manifestRevisionId: "selected-manifest", manifestHash: "exact-hash",
    policyBinding: c.policyBinding, reviewerBinding: c.reviewerBinding,
    required: { pages: 2, originals: 2, comparisons: 1 }, covered: { pages: 2, originals: 2, comparisons: 0 } };
  assert.throws(() => guard("complete", { manifestRevisionId: "selected-manifest" }, c), /coverage incomplete/);
  c.manifestReview.covered.comparisons = 1;
  c.assessments = [];
  assert.equal(guard("complete", { manifestRevisionId: "selected-manifest" }, c).action, "complete");
  assert.throws(() => guard("complete", { manifestRevisionId: "another-same-hash-revision" }, c), /coverage incomplete/);
});

test("durable checkpoint confirmation is required; version races and fabricated completion fail", () => {
  const c = context();
  assert.throws(
    () =>
      run("manager", "saved", {
        raw: [{ result: { checkpointVersion: 4 } }],
        context: JSON.stringify(c),
        request: "{}", dispatch: "{}", action: "index",
      }),
    /not durably/,
  );
  assert.equal(
    run("manager", "saved", {
      raw: [{ result: { checkpointVersion: 5, fence: 8 } }],
      context: JSON.stringify(c),
      request: "{}", dispatch: "{}", action: "index",
    }).version,
    5,
  );
  assert.throws(
    () =>
      run("manager", "consume", {
        raw: [{ result: { status: "partial" } }],
        action: "complete",
        request: "{}",
        context: JSON.stringify(c),
        version: 5,
      }),
    /did not confirm/,
  );
  assert.throws(
    () =>
      run("manager", "facts", {
        raw: [{ result: { ...c, usage: undefined } }],
        execution_ready: "true",
      }),
    /incomplete/,
  );
  assert.equal(
    run("manager", "facts", { raw: [{ result: c }] }).route,
    "pause",
  );
});

test("fresh post-call context supplies the new fence; checkpoint races stop result application", () => {
  const r = request();
  const c = retained(r, { ...context(), checkpointVersion: 5, fence: 11 });
  const result = {
    contractVersion: 2,
    invocationId: r.invocationId,
    callId: r.callId,
    service: r.service,
    operation: r.operation,
    status: "partial",
    items: [],
  };
  const args = {
    raw: [{ result }],
    action: r.service,
    request: JSON.stringify(r),
    context: [{ result: c }],
    version: 5,
  };
  const consumed = run("manager", "consume", args);
  assert.equal(JSON.parse(consumed.checkpoint).fence, 11);
  assert.deepEqual(JSON.parse(consumed.checkpoint).state.lastResult.document, { kind: "work", id: r.callId });
  assert.equal(consumed.done, false);
  c.checkpointVersion = 6;
  assert.throws(
    () => run("manager", "consume", args),
    /changed during external work/,
  );
});

test("Human Input uses the actual correlated presentation and cannot fabricate one", () => {
  const c = { ...context(), checkpointVersion: 5 };
  const args = {
    raw: [
      {
        result: {
          requestId: "human-1",
          presentationHash: "presentation-1",
          formContent: "Which direction?",
        },
      },
    ],
    action: "request_human",
    request: "{}",
    context: JSON.stringify(c),
    version: 5,
  };
  assert.equal(run("manager", "consume", args).form, "Which direction?");
  args.raw[0].result.formContent = "Exact large presentation. ".repeat(3900);
  const retained = run("manager", "consume", args);
  assert.equal(retained.form, args.raw[0].result.formContent);
  assert.ok(Buffer.byteLength(retained.checkpoint) < 1024);
  assert.deepEqual(JSON.parse(retained.checkpoint).state.lastResult.document,
    { kind: "human_response", id: "human-1" });
  const human = apps.manager.workflow.graph.nodes.find(
    (n: any) => n.id === "human",
  );
  assert.ok(human.data.form_content.includes("{{#consume.form#}}"));
  for (const method of human.data.delivery_methods)
    assert.match(method.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  delete (args.raw[0].result as any).presentationHash;
  assert.throws(() => run("manager", "consume", args), /presentation missing/);
});

test("Planner supports zero optional subjects and rejects invented roster capacity", () => {
  const r = request("story-planner", "cast");
  r.constraints = { maxCharacters: 0 };
  const response = {
    items: [
      {
        itemId: "item-1",
        status: "succeeded",
        proposals: [
          {
            kind: "roster",
            subjectId: "book",
            content: { subjectIds: [] as string[] },
          },
        ],
        limitations: [],
      },
    ],
  };
  assert.equal(
    JSON.parse(
      run("story-planner", "pack", { request: JSON.stringify(r), response })
        .result,
    ).status,
    "succeeded",
  );
  response.items[0].proposals[0].content.subjectIds.push("invented");
  assert.throws(
    () =>
      run("story-planner", "pack", { request: JSON.stringify(r), response }),
    /capacity mismatch/,
  );
});

test("Planner targeted description revisions do not require unrelated roster changes", () => {
  for (const [operation, subjectKind, target, limit] of [
    ["cast", "character", "character-1", "maxCharacters"],
    ["locations", "location", "location-1", "maxLocations"],
  ]) {
    const r = request("story-planner", operation);
    r.intent = "revise";
    r.constraints = { [limit]: 1 };
    r.items[0] = {
      ...r.items[0],
      targetId: target,
      baseline: { name: "Existing subject" },
      feedback: { instruction: "Fix the confirmed detail." },
    };
    const proposal = {
      kind: "description",
      subjectId: target,
      content: {
        name: "Existing subject",
        subjectKind,
        description: "Corrected detail",
        establishedFacts: [],
        continuityConstraints: [],
      },
    };
    const response = {
      items: [
        {
          itemId: "item-1",
          status: "succeeded",
          proposals: [proposal],
          limitations: [],
        },
      ],
    };
    const packed = JSON.parse(
      run("story-planner", "pack", { request: JSON.stringify(r), response })
        .result,
    );
    assert.equal(packed.status, "succeeded");
    assert.equal(packed.items[0].proposals.length, 1);
    const withUnrequestedRoster = structuredClone(response);
    withUnrequestedRoster.items[0].proposals.push({
      kind: "roster",
      subjectId: "book",
      content: { subjectIds: [target] },
    } as any);
    assert.throws(
      () =>
        run("story-planner", "pack", {
          request: JSON.stringify(r),
          response: withUnrequestedRoster,
        }),
      /Revision escaped target/,
    );
    const duplicate = structuredClone(response);
    duplicate.items[0].proposals.push(structuredClone(proposal));
    assert.throws(
      () =>
        run("story-planner", "pack", {
          request: JSON.stringify(r),
          response: duplicate,
        }),
      /Subject description/,
    );
    r.constraints[limit] = 0;
    assert.throws(
      () =>
        run("story-planner", "pack", { request: JSON.stringify(r), response }),
      /capacity|Subject description/,
    );
    r.constraints[limit] = 1;
    r.intent = "create";
    assert.throws(
      () =>
        run("story-planner", "pack", { request: JSON.stringify(r), response }),
      /Explicit roster/,
    );
  }
});

test("Art Director preserves immutable facts while allowing open design choices", () => {
  const r = request("art-director", "character_spec");
  r.items[0].input = { descriptionRevisionId: "character-revision" };
  r.sources = [
    {
      artifactId: "character",
      revisionId: "character-revision",
      contentHash: "selected",
      content: {
        kind: "description",
        establishedFacts: ["Wears a yellow coat."],
        continuityConstraints: ["Left sleeve has a red patch."],
      },
    },
  ];
  const content = {
    purpose: "Character reference",
    requiredFeatures: [
      "Wears a yellow coat.",
      "Left sleeve has a red patch.",
      "Proposed blue shoes.",
    ],
    style: "selected-style",
  };
  const response = {
    items: [
      {
        itemId: "item-1",
        status: "succeeded",
        proposals: [{ kind: "image-spec", subjectId: "character", content }],
        limitations: [],
      },
    ],
  };
  assert.equal(
    JSON.parse(
      run("art-director", "pack", { request: JSON.stringify(r), response })
        .result,
    ).status,
    "succeeded",
  );
  content.requiredFeatures.shift();
  assert.throws(
    () => run("art-director", "pack", { request: JSON.stringify(r), response }),
    /facts\/continuity omitted/,
  );
});

test("request identities match existing JavaScript canonical JSON for fractional regions and Unicode", () => {
  const r = request();
  const content = {
    kind: "outline",
    summary: fixture.exactText,
    regions: [1e-7, 1e-6, 0.1, -0, 333333333.3333333, 1e20],
    numericKeys: { "10": "ten", "2": "two" },
    labels: { "😀": "one", "\ue000": "two" },
  };
  r.sources = [
    { artifactId: "a", revisionId: "r1", contentHash: hash(content), content },
  ];
  assert.equal(guard(r.service, r, register(r)).paid, "yes");
  const image = imageRequest();
  image.items[0].input.style.optionalRegions = content.regions;
  image.sources[1].contentHash = hash(image.items[0].input.style);
  const prepared = JSON.parse(
    run("image-executor", "validate", { request: JSON.stringify(image) })
      .result,
  ).items[0].prepared;
  const { requestHash, ...meaningful } = prepared;
  assert.equal(requestHash, hash(meaningful));
});

test("Manager capacity measures UTF-8 bytes without overcounting escaped RTL text", () => {
  const r = request();
  const c = retained(r, { ...context(), checkpointVersion: 5, note: "ا".repeat(20000) });
  const facts = run("manager", "facts", {
    raw: [{ result: c }],
    execution_ready: "true",
  });
  assert.equal(facts.route, "reason");
  const result = {
    invocationId: r.invocationId,
    callId: r.callId,
    service: r.service,
    operation: r.operation,
    status: "partial",
    note: c.note,
  };
  const output = run("manager", "consume", {
    raw: [{ result }],
    action: r.service,
    request: JSON.stringify(r),
    context: JSON.stringify(c),
    version: 5,
  });
  assert.ok(Buffer.byteLength(output.checkpoint, "utf8") < 65536);
});

test("paid child results checkpoint retained references, including oversized partial text", () => {
  const r = request("manuscript", "write");
  const c = retained(r, { ...context(), checkpointVersion: 5 });
  const result = { ...r, status: "partial", items: [{ itemId: "item-1", status: "succeeded",
    proposals: [{ kind: "manuscript", content: { exactText: "ا🙂".repeat(30000) } }] }] };
  assert.ok(Buffer.byteLength(JSON.stringify(result)) > 65536);
  const args = { raw: [{ result }], action: r.service, request: JSON.stringify(r), context: c, version: 5 };
  const consumed = run("manager", "consume", args);
  assert.ok(Buffer.byteLength(consumed.checkpoint) < 1024);
  const state = JSON.parse(consumed.checkpoint).state;
  assert.equal(state.pending, null);
  assert.deepEqual(state.lastResult, { document: { kind: "work", id: r.callId }, requestHash: hash(r), status: "partial" });
  for (const change of [
    { resultAvailable: false }, { requestHash: "changed" }, { service: "story-planner" },
    { operation: "other" }, { status: "dispatching" }, { status: "unknown" },
  ]) {
    const changed = structuredClone(c);
    Object.assign(changed.work[0], change);
    assert.throws(() => run("manager", "consume", { ...args, context: changed }), /reconcile before advancing/);
    assert.equal(changed.checkpoint.pending.callId, r.callId);
  }
  assert.throws(() => run("manager", "consume", { ...args, context: { ...c, work: [] } }), /reconcile before advancing/);
});

test("post-action checkpoint preserves intent and uses only the authoritative fence", () => {
  const c = { ...context(), checkpointVersion: 5, checkpoint: {
    intent: { selectedCandidate: "candidate-2", remainingPages: ["page-3"] },
    pending: { action: "read_document" },
  } };
  const result = run("manager", "consume", {
    raw: [{ result: { content: "artifact data", fence: 999 } }],
    action: "read_document", request: "{}", context: JSON.stringify(c), version: 5,
  });
  const saved = JSON.parse(result.checkpoint);
  assert.deepEqual(saved.state.intent, c.checkpoint.intent);
  assert.equal(saved.state.pending, null);
  assert.equal(saved.fence, c.fence);
});

test("image originals require a real handle and preflight binds the prepared target", () => {
  const image = imageRequest();
  image.references = [{ assetId: "a", sha256: "hash", bytes: 100 }];
  image.items[0].input.settings.mode = "edit";
  assert.throws(() => run("image-executor", "validate", {
    request: JSON.stringify(image), references: [{}],
  }), /wrong ordered original/);
  const review = request("quality-reviewer", "image_request");
  review.items[0].input = { targetIds: ["request"], targetHash: "other-request", prepared: { requestHash: "actual-request" } };
  assert.throws(() => run("quality-reviewer", "validate", {
    request: JSON.stringify(review), execution_ready: "true",
  }), /Exact prepared request/);
  review.items[0].input.targetHash = "actual-request";
  assert.equal(run("quality-reviewer", "validate", {
    request: JSON.stringify(review), execution_ready: "true",
  }).request, JSON.stringify(review));
});
