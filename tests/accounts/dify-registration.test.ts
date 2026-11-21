import assert from "node:assert/strict";
import {
  bindingTestEnvironment,
  mockBindingProbe,
  environmentRequest,
  ownFixtureApp,
} from "./fixtures/environment-binding";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoClient, type Document } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AppError } from "../../src/lib/auth-policy";
import { environmentMcpConfiguration } from "../../src/lib/server/runs/environment-binding";
import {
  inspectDifyWorkflow,
  verifyMcpTools,
} from "../../src/lib/server/runs/dify-capabilities";
import {
  registerDifyOrchestrator as registerOriginal,
  discoverDifyOrchestrators,
  registrationStatus,
} from "../../src/lib/server/runs/registration";
import type { difyJson } from "../../src/lib/server/runs/dify-console-client";
import { difyWorkflowVersions } from "../../src/lib/server/runs/workflow-versions";

const registerDifyOrchestrator: typeof registerOriginal = async (
  appId,
  actor,
  db,
  request,
  env,
  selection,
) => {
  await ownFixtureApp(appId, db!, env!);
  return registerOriginal(appId, actor, db, request, env, selection);
};

const graph = () => ({
  nodes: [
    {
      id: "start",
      data: {
        type: "start",
        variables: [
          {
            variable: "prompt",
            label: "Your prompt",
            type: "paragraph",
            required: true,
            max_length: 4000,
          },
        ],
      },
    },
    {
      id: "generate",
      data: {
        type: "llm",
        model: { name: "existing-model", provider: "fixture" },
        prompt_template: [{ text: "Existing instructions" }],
      },
    },
    {
      id: "end",
      position: { x: 900, y: 100 },
      data: {
        type: "end",
        outputs: [{ variable: "text", value_selector: ["generate", "text"] }],
      },
    },
  ],
  edges: [
    { id: "first", source: "start", target: "generate" },
    {
      id: "last",
      source: "generate",
      target: "end",
      data: { custom: "retained" },
    },
  ],
});
test("Capability inspection preserves the graph, permits no inputs and respects optional prompts", () => {
  const source = graph();
  const original = structuredClone(source);
  assert.deepEqual(
    inspectDifyWorkflow(source).inputs.map((field) => field.name),
    ["prompt"],
  );
  assert.deepEqual(source, original);
  source.nodes[0].data.variables = [];
  assert.deepEqual(inspectDifyWorkflow(source).inputs, []);
  assert.deepEqual(inspectDifyWorkflow(source).legacyInputs, []);
  source.nodes[0].data.variables = [
    {
      variable: "prompt",
      label: "Prompt",
      type: "paragraph",
      required: false,
      max_length: 4000,
    },
  ];
  assert.equal(inspectDifyWorkflow(source).inputs[0].required, false);
  source.nodes[0].data.variables![0].type = "file-list";
  assert.throws(() => inspectDifyWorkflow(source), /Start controls/);
});

test("Human Input requires WebApp delivery and a supported Generative UI contract", () => {
  const source: { nodes: { id: string; data: Record<string, unknown> }[] } =
    graph();
  const human = {
    type: "human-input",
    delivery_methods: [{ type: "webapp", enabled: true }],
    form_content: "Choose a direction",
    inputs: [{ type: "paragraph", output_variable_name: "response" }],
    user_actions: [{ id: "continue", title: "Continue" }],
  };
  source.nodes.push({ id: "human", data: human });
  assert.doesNotThrow(() => inspectDifyWorkflow(source));
  human.delivery_methods[0].enabled = false;
  assert.throws(() => inspectDifyWorkflow(source), /WebApp delivery/);
  human.delivery_methods[0].enabled = true;
  human.form_content = "```unibase-ui\n{}\n```\n{{#$output.response#}}";
  assert.throws(() => inspectDifyWorkflow(source), /Generative UI/);
});

test("MCP checks read the authorized tool catalog without executing read or write tools", async () => {
  const selected = [
    { providerId: "workspace_mcp", toolName: "fetch" },
    { providerId: "workspace_mcp", toolName: "save" },
  ];
  let calls = 0;
  const request: typeof difyJson = async (path, options) => {
    calls++;
    assert.equal(path, "/workspaces/current/tools/mcp");
    assert.equal(options?.body, undefined);
    return [
      {
        id: "workspace_mcp",
        is_team_authorization: true,
        tools: [{ name: "fetch" }, { name: "save" }],
      },
    ];
  };
  await verifyMcpTools(selected, request);
  assert.equal(calls, 1);
  await assert.rejects(
    verifyMcpTools(selected, async () => [
      {
        id: "workspace_mcp",
        is_team_authorization: true,
        tools: [{ name: "fetch" }],
      },
    ]),
    /synchronize/,
  );
});

test("Formless registration: draft validation, publication, retries, authorization and no partial enablement", async (t) => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  const db = client.db("dify_registration");
  const actor = { uid: "admin", auth_time: Math.floor(Date.now() / 1000) };
  const access = db.collection<Document & { _id: string }>("accountAccess");
  await access.insertOne({
    _id: actor.uid,
    role: "admin",
    status: "active",
    notBefore: 0,
    revision: 0,
  });
  const env = {
    ...bindingTestEnvironment,
    DIFY_MODE: "live",
    DIFY_CONSOLE_URL: "https://dify.example.test/console/api",
    DIFY_BASE_URL: "https://dify.example.test/v1",
    DIFY_MANAGEMENT_KEY: "private-management",
    DIFY_WORKSPACE_ID: randomUUID(),
  };
  mockBindingProbe(t, env);
  function fixture(
    options: {
      existing?: boolean;
      rejectKey?: boolean;
      unpublished?: boolean;
      draftEdited?: boolean;
      rejectPublish?: boolean;
      draftChanged?: boolean;
      rejectMcp?: boolean;
      rejectParameters?: boolean;
      onPublishRead?: () => Promise<void>;
      onVersionRead?: () => void;
      privateContextName?: "context" | "unibase_context";
    } = {},
  ) {
    const appId = randomUUID();
    const published = {
      id: randomUUID(),
      graph: graph(),
      hash: "before",
      features: { retained: true },
      conversation_variables: [
        {
          name: "existing",
          value: "private-conversation",
          id: randomUUID(),
          value_type: "string",
        },
      ],
      environment_variables: [{ name: "secret", value: "private-secret" }],
    };
    if (options.privateContextName) {
      published.graph.nodes[0].data.variables!.push({
        variable: options.privateContextName,
        label: "Private context",
        type: "text-input",
        required: true,
        max_length: 256,
      });
      published.graph.nodes.push({
        id: "private-tool",
        data: {
          type: "tool",
          provider_type: "mcp",
          provider_id: environmentMcpConfiguration(env).binding.providerId,
          tool_name: "get_run_context_v1",
          tool_parameters: {
            runContext: {
              type: "variable",
              value: ["start", options.privateContextName],
            },
          },
        },
      } as never);
    }
    let keys = options.existing
      ? [{ id: randomUUID(), token: "app-existing-private-canary" }]
      : [];
    const counts = {
      keys: 0,
      reads: 0,
      publishes: 0,
      drafts: 0,
      parameters: 0,
      versions: 0,
    };
    const historical = {
      ...structuredClone(published),
      id: randomUUID(),
      version: "2026-10-01 12:00:00",
      version_number: 1,
      marked_name: "Original",
      created_at: 1759310400,
    };
    historical.graph.nodes[0].data.variables![0].variable = "old_prompt";
    const history = [
      historical,
      {
        ...structuredClone(published),
        version: "2026-10-14 12:00:00",
        version_number: 2,
        marked_name: "Current",
        created_at: 1760443200,
      },
    ];
    if (options.rejectMcp)
      published.graph.nodes.push({
        id: "mcp",
        data: {
          type: "tool",
          provider_type: "mcp",
          provider_id: "unibase",
          tool_name: "fetch",
        },
      } as never);
    const draft = structuredClone(published);
    if (options.draftEdited || options.draftChanged)
      draft.graph.nodes[1].data.prompt_template![0].text = "Edited draft";
    const request: typeof difyJson = async (path, config = {}) => {
      assert.ok((config.timeoutMs ?? 30000) <= 30000);
      if (path.startsWith("/apps?"))
        return {
          data: [{ id: appId, name: "Example", mode: "workflow" }],
          has_more: false,
        };
      if (path === `/apps/${appId}`)
        return {
          mode: "workflow",
          name: "Example",
          description: "Original description",
        };
      if (path.startsWith(`/apps/${appId}/workflows?`)) {
        assert.equal(
          config.body,
          undefined,
          "Version selection must never publish",
        );
        counts.versions++;
        options.onVersionRead?.();
        const page = Number(
          new URL(path, "https://fixture.test").searchParams.get("page"),
        );
        return {
          items: page === 1 ? structuredClone(history) : [],
          page,
          has_more: false,
        };
      }
      if (path.endsWith("/api-keys")) {
        if (config.body !== undefined) {
          counts.keys++;
          if (options.rejectKey)
            throw new AppError(
              "DIFY_KEY_CREATION_REJECTED",
              "Key creation rejected",
              409,
            );
          keys = [{ id: randomUUID(), token: "app-created-private-canary" }];
          return keys[0];
        }
        return { data: keys };
      }
      if (path.endsWith("/draft")) {
        assert.equal(
          config.body,
          undefined,
          "Registration must not edit the draft",
        );
        counts.drafts++;
        const value = structuredClone(draft);
        if (options.draftChanged && counts.drafts > 1)
          value.hash = "concurrent-change";
        return value;
      }
      if (path.endsWith("/publish")) {
        if (config.body !== undefined) {
          counts.publishes++;
          if (options.rejectPublish)
            throw new AppError("DIFY_REJECTED", "Publication denied", 409);
          Object.assign(published, structuredClone(draft), {
            id: randomUUID(),
          });
          options.unpublished = false;
          return { result: "success" };
        }
        counts.reads++;
        await options.onPublishRead?.();
        return options.unpublished ? null : structuredClone(published);
      }
      if (path === "/workspaces/current/tools/mcp")
        return [
          {
            id: "unibase",
            is_team_authorization: !options.rejectMcp,
            tools: [{ name: "fetch" }, { name: "get_run_context_v1" }],
          },
        ];
      if (path === "/info") return { mode: "workflow" };
      if (path === "/parameters") {
        counts.parameters++;
        if (options.rejectParameters)
          throw new AppError("DIFY_REJECTED", "Parameters unavailable", 502);
        const variables = published.graph.nodes[0].data.variables ?? [];
        return {
          user_input_form: variables.map((field) => ({ [field.type]: field })),
        };
      }
      throw new Error(`Unexpected fixture path ${path}`);
    };
    return {
      appId,
      options,
      request: environmentRequest(db, env, request),
      counts,
      history,
    };
  }
  try {
    await t.test(
      "one app ID enables a complete definition without configuration fields",
      async () => {
        const f = fixture({ existing: true });
        const result = await registerDifyOrchestrator(
          f.appId,
          actor,
          db,
          f.request,
          env,
        );
        assert.equal(result.status, "ready");
        assert.equal(f.counts.keys, 0);
        const record = await db
          .collection<Document & { _id: string }>("orchestrators")
          .findOne({ _id: result.orchestratorId });
        assert.equal(record!.validated, true);
        assert.equal(record!.definition.enabled, true);
        assert.equal(record!.definition.responseMode, "raw-v1");
        assert.deepEqual(
          record!.definition.inputs.map(
            (field: { name: string }) => field.name,
          ),
          ["prompt"],
        );
        assert.equal(record!.definition.pricing, null);
        assert.equal(record!.definition.recovery, null);
        assert.equal(
          (await discoverDifyOrchestrators(db, f.request, env)).apps[0].status,
          "ready",
        );
        await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
        assert.equal(f.counts.keys, 0);
        assert.equal(
          (await db
            .collection<Document & { _id: string }>("orchestrators")
            .findOne({ _id: result.orchestratorId }))!.revision,
          record!.revision,
        );
        await db
          .collection("difyCredentials")
          .updateOne({ appId: f.appId }, { $set: { ciphertext: "tampered" } });
        assert.equal(
          (await registrationStatus(f.appId, db, env)).status,
          "failed",
        );
        assert.equal(
          (await discoverDifyOrchestrators(db, f.request, env)).apps[0].status,
          "failed",
        );
        assert.equal(
          (await registerDifyOrchestrator(f.appId, actor, db, f.request, env))
            .status,
          "ready",
        );
        const stored =
          JSON.stringify(
            await db.collection("difyCredentials").find().toArray(),
          ) +
          JSON.stringify(
            await db.collection("orchestratorRegistrations").find().toArray(),
          ) +
          JSON.stringify(await db.collection("auditEvents").find().toArray());
        assert.ok(
          !stored.includes("private-canary") &&
            !stored.includes("private-conversation") &&
            !stored.includes("private-secret"),
        );
      },
    );
    await t.test(
      "creates only a missing key and never changes the workflow",
      async () => {
        const f = fixture();
        await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
        await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
        assert.equal(f.counts.keys, 1);
      },
    );
    await t.test(
      "re-registration preserves legacy response behavior",
      async () => {
        const f = fixture();
        const result = await registerDifyOrchestrator(
          f.appId,
          actor,
          db,
          f.request,
          env,
        );
        await db
          .collection("orchestrators")
          .updateOne({ _id: result.orchestratorId } as never, {
            $unset: { "definition.responseMode": "" },
          });
        await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
        const saved = await db
          .collection("orchestrators")
          .findOne({ _id: result.orchestratorId } as never);
        assert.equal(saved!.definition.responseMode, undefined);
      },
    );
    await t.test(
      "failed credentials, capability and input verification never enable a partial registration",
      async () => {
        for (const options of [
          { rejectKey: true },
          { unpublished: true, rejectPublish: true },
          { rejectMcp: true },
          { rejectParameters: true },
        ]) {
          const f = fixture(options);
          await assert.rejects(
            registerDifyOrchestrator(f.appId, actor, db, f.request, env),
          );
          assert.equal(
            await db
              .collection<Document & { _id: string }>("orchestrators")
              .countDocuments({ "definition.appId": f.appId }),
            0,
          );
          assert.equal(
            (await registrationStatus(f.appId, db, env)).status,
            "failed",
          );
        }
      },
    );
    await t.test(
      "Register publishes a new or edited draft once and reuses an unchanged publication",
      async () => {
        for (const options of [{ unpublished: true }, { draftEdited: true }]) {
          const f = fixture(options);
          await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
          assert.equal(f.counts.publishes, 1);
          await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
          assert.equal(f.counts.publishes, 1);
        }
      },
    );
    await t.test("Concurrent draft changes stop publication", async () => {
      const f = fixture({ draftChanged: true });
      await assert.rejects(
        registerDifyOrchestrator(f.appId, actor, db, f.request, env),
        /draft changed/,
      );
      assert.equal(f.counts.publishes, 0);
      assert.equal(f.counts.keys, 0);
    });
    await t.test(
      "registration snapshots the exact private context name and hides it from public controls",
      async () => {
        for (const privateContextName of [
          "context",
          "unibase_context",
        ] as const) {
          const f = fixture({ privateContextName });
          const result = await registerDifyOrchestrator(
            f.appId,
            actor,
            db,
            f.request,
            env,
          );
          const row = await db
            .collection<Document & { _id: string }>("orchestrators")
            .findOne({ _id: result.orchestratorId });
          assert.equal(row!.definition.contextInput, true);
          assert.equal(row!.definition.contextInputName, privateContextName);
          assert.deepEqual(
            row!.definition.inputs.map((field: { name: string }) => field.name),
            ["prompt"],
          );
        }
      },
    );
    await t.test(
      "Re-register selects historical inputs without publishing or changing accepted snapshots",
      async () => {
        const f = fixture({ existing: true, draftEdited: true });
        await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
        const id = `dify-${f.appId}`;
        const prior = await db
          .collection<Document & { _id: string }>("orchestrators")
          .findOne({ _id: id });
        await db.collection("aiJobs").insertOne({
          _id: "accepted-version-fixture",
          run: { orchestrator: prior!.definition },
        } as never);
        const before = { ...f.counts };
        const selection = { workflowId: f.history[0].id, page: 1 };
        const result = await registerDifyOrchestrator(
          f.appId,
          actor,
          db,
          f.request,
          env,
          selection,
        );
        const current = await db
          .collection<Document & { _id: string }>("orchestrators")
          .findOne({ _id: id });
        assert.equal(result.workflowId, selection.workflowId);
        assert.equal(current!.definition.workflowId, selection.workflowId);
        assert.equal(current!.definition.inputs[0].name, "old_prompt");
        assert.equal(current!.revision, prior!.revision + 1);
        assert.equal(f.counts.publishes, before.publishes);
        assert.equal(f.counts.drafts, before.drafts);
        assert.equal(f.counts.parameters, before.parameters);
        assert.equal(f.counts.keys, 0);
        const accepted = await db
          .collection("aiJobs")
          .findOne({ _id: "accepted-version-fixture" } as never);
        assert.deepEqual(accepted!.run.orchestrator, prior!.definition);
        const versionPage = await difyWorkflowVersions(f.appId, 1, f.request);
        const serialized = JSON.stringify(versionPage);
        assert(
          !serialized.includes("private-secret") &&
            !serialized.includes("private-conversation") &&
            !serialized.includes("graph"),
        );
        assert.equal(
          (await discoverDifyOrchestrators(db, f.request, env)).apps.find(
            (a) => a.id === f.appId,
          )!.workflowId,
          selection.workflowId,
        );
        await registerDifyOrchestrator(
          f.appId,
          actor,
          db,
          f.request,
          env,
          selection,
        );
        assert.equal(
          (await db.collection("orchestrators").findOne({ _id: id } as never))!
            .revision,
          current!.revision,
        );
        assert(
          await db
            .collection("auditEvents")
            .findOne({ appId: f.appId, workflowId: selection.workflowId }),
        );
      },
    );
    await t.test(
      "Missing, draft, cross-app and concurrently deleted versions preserve the prior registration",
      async () => {
        const f = fixture({ existing: true });
        await registerDifyOrchestrator(f.appId, actor, db, f.request, env);
        const id = `dify-${f.appId}`;
        const prior = await db
          .collection("orchestrators")
          .findOne({ _id: id } as never);
        const foreign = fixture().history[0].id;
        f.history.push({ ...f.history[0], id: randomUUID(), version: "draft" });
        for (const workflowId of [
          randomUUID(),
          foreign,
          f.history.at(-1)!.id,
        ]) {
          await assert.rejects(
            registerDifyOrchestrator(f.appId, actor, db, f.request, env, {
              workflowId,
              page: 1,
            }),
            /Reload versions/,
          );
          assert.deepEqual(
            await db.collection("orchestrators").findOne({ _id: id } as never),
            prior,
          );
        }
        f.options.onVersionRead = () => {
          if (f.counts.versions === 5) f.history.splice(0, 1);
        };
        await assert.rejects(
          registerDifyOrchestrator(f.appId, actor, db, f.request, env, {
            workflowId: f.history[0].id,
            page: 1,
          }),
          /Reload versions/,
        );
        assert.deepEqual(
          await db.collection("orchestrators").findOne({ _id: id } as never),
          prior,
        );
        assert.equal(f.counts.publishes, 0);
      },
    );
    await t.test("concurrent registration is serialized", async () => {
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const f = fixture({
        onPublishRead: async () => {
          entered();
          await blocked;
        },
      });
      const first = registerDifyOrchestrator(
        f.appId,
        actor,
        db,
        f.request,
        env,
      );
      await started;
      try {
        await assert.rejects(
          registerDifyOrchestrator(f.appId, actor, db, f.request, env),
          /already being registered/,
        );
      } finally {
        release();
      }
      await first;
      assert.equal(f.counts.keys, 1);
    });
    await t.test(
      "revoked administrator cannot contact the provider",
      async () => {
        await access.updateOne(
          { _id: actor.uid },
          { $set: { role: "member" } },
        );
        await assert.rejects(
          registerDifyOrchestrator(
            randomUUID(),
            actor,
            db,
            async () => {
              throw new Error("Unexpected provider call");
            },
            env,
          ),
          /Administrator/,
        );
      },
    );
  } finally {
    await client.close();
    await repl.stop();
  }
});
