import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoClient, type Document } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AppError } from "../../src/lib/auth-policy";
import { project } from "../../src/lib/project";
import {
  environmentMcpConfiguration,
  probeEnvironmentMcp,
  ensureEnvironmentMcp,
  verifyAppOwnership,
  recordAppOwnership,
  bindEnvironmentGraph,
  assertRunEnvironment,
  verifyDestinationResources,
} from "../../src/lib/server/runs/environment-binding";
import { createDifyOrchestrator } from "../../src/lib/server/runs/creation";
import { registerDifyOrchestrator } from "../../src/lib/server/runs/registration";
import { bootstrapSettings } from "../../src/lib/server/settings";
import { orchestratorTemplate } from "../../src/lib/server/runs/templates";
import type { difyJson } from "../../src/lib/server/runs/dify-console-client";
import {
  bindingTestEnvironment,
  mockBindingProbe,
  environmentRequest,
} from "./fixtures/environment-binding";

const env = {
  ...bindingTestEnvironment,
  DIFY_MODE: "live",
  DIFY_CONSOLE_URL: "https://dify.example.test/console/api",
  DIFY_BASE_URL: "https://dify.example.test/v1",
  DIFY_WORKSPACE_ID: randomUUID(),
  DIFY_MANAGEMENT_KEY: "fixture-only-management",
};
const binding = environmentMcpConfiguration(env).binding;
const failure = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;

test("MCP endpoint selection and Run admission isolate all environments", () => {
  for (const environment of ["local", "staging", "production"] as const) {
    const values = {
      ...env,
      APP_ENV: environment,
      APP_ORIGIN: `https://${environment}.example.test`,
      ...(environment === "local"
        ? { MCP_PUBLIC_URL: "https://tunnel.example.test/api/mcp" }
        : {}),
    };
    const config = environmentMcpConfiguration(values);
    assert.equal(config.binding.environment, environment);
    assert.equal(
      config.binding.endpoint,
      environment === "local"
        ? values.MCP_PUBLIC_URL
        : values.APP_ORIGIN + "/api/mcp",
    );
    assertRunEnvironment(config.binding, values);
    assert.throws(
      () =>
        assertRunEnvironment(
          {
            ...config.binding,
            environment: environment === "local" ? "staging" : "local",
          },
          values,
        ),
      failure("DIFY_ENVIRONMENT_OWNERSHIP"),
    );
  }
  assert.throws(
    () => environmentMcpConfiguration({ ...env, APP_ENV: "local" }),
    failure("DIFY_MCP_TUNNEL_REQUIRED"),
  );
  assert.throws(
    () =>
      environmentMcpConfiguration({
        ...env,
        MCP_PUBLIC_URL: "https://tunnel.test/api/mcp",
      }),
    failure("DIFY_MCP_ENDPOINT_INVALID"),
  );
  for (const endpoint of [
    "http://tunnel.test/api/mcp",
    "https://u:p@tunnel.test/api/mcp",
    "https://tunnel.test/api/mcp?token=secret",
    "https://tunnel.test/other",
  ])
    assert.throws(() =>
      environmentMcpConfiguration({
        ...env,
        APP_ENV: "local",
        MCP_PUBLIC_URL: endpoint,
      }),
    );
  assert.throws(
    () => assertRunEnvironment(undefined, env),
    failure("DIFY_ENVIRONMENT_OWNERSHIP"),
  );
});

test("Read-only MCP probes authenticate, reject foreign identity, redirects and stale tools", async () => {
  const calls: { method: string; options: RequestInit }[] = [];
  let identity = {
    project: project.slug,
    environment: "staging",
    origin: env.APP_ORIGIN,
  };
  let names = ["get_run_context_v1"];
  const fetcher: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push({ method: body.method, options: options! });
    return Response.json({
      result:
        body.method === "tools/list"
          ? { tools: names.map((name) => ({ name })) }
          : { structuredContent: identity },
    });
  };
  assert.deepEqual(await probeEnvironmentMcp(env, names, fetcher), binding);
  assert.deepEqual(
    calls.map((c) => c.method),
    ["tools/call", "tools/list"],
  );
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(
    (calls[0].options.headers as Record<string, string>).Authorization,
    `Bearer ${env.MCP_TOKEN_FIXTURE}`,
  );
  identity = { ...identity, environment: "local" };
  await assert.rejects(
    probeEnvironmentMcp(env, names, fetcher),
    failure("DIFY_MCP_IDENTITY"),
  );
  identity.environment = "staging";
  names = [];
  await assert.rejects(
    probeEnvironmentMcp(env, ["get_run_context_v1"], fetcher),
    failure("DIFY_MCP_PERMISSIONS"),
  );
  await assert.rejects(
    probeEnvironmentMcp(
      env,
      [],
      async () => new Response(null, { status: 503 }),
    ),
    failure("DIFY_MCP_UNREACHABLE"),
  );
  await assert.rejects(
    probeEnvironmentMcp(env, [], async () => {
      throw Error("redirect refused");
    }),
    failure("DIFY_MCP_UNREACHABLE"),
  );
});

test("Environment ownership, resumable provider setup, copying and registration boundaries", async (t) => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  mockBindingProbe(t, env);
  try {
    await t.test(
      "tags and names cannot adopt an app or bypass foreign ownership",
      async () => {
        const db = client.db("ownership"),
          appId = randomUUID();
        const request: typeof difyJson = async () => ({
          name: "Example [staging]",
          tags: [{ name: `app:${project.slug}-staging` }],
        });
        await assert.rejects(
          verifyAppOwnership(appId, db, request, env),
          failure("DIFY_ENVIRONMENT_OWNERSHIP"),
        );
        await recordAppOwnership(
          appId,
          randomUUID(),
          { ...binding, environment: "local" },
          db,
          env,
        );
        await assert.rejects(
          verifyAppOwnership(appId, db, request, env),
          failure("DIFY_ENVIRONMENT_OWNERSHIP"),
        );
        await db.collection("difyAppOwnership").deleteMany({});
        const operationId = randomUUID();
        await recordAppOwnership(appId, operationId, binding, db, env);
        await assert.rejects(
          verifyAppOwnership(appId, db, request, env),
          failure("DIFY_ENVIRONMENT_OWNERSHIP"),
        );
        await db
          .collection<Document & { _id: string }>("orchestratorCreations")
          .insertOne({ _id: operationId, appId, started: true });
        assert.equal(
          (await verifyAppOwnership(appId, db, request, env)).binding
            .environment,
          "staging",
        );
        await assert.rejects(
          verifyAppOwnership(
            appId,
            db,
            async () => ({ name: "Example [staging]", tags: [] }),
            env,
          ),
          failure("DIFY_ENVIRONMENT_OWNERSHIP"),
        );
        let mutations = 0;
        const actor = {
          uid: "admin",
          auth_time: Math.floor(Date.now() / 1000),
        };
        await db
          .collection<Document & { _id: string }>("accountAccess")
          .insertOne({
            _id: actor.uid,
            role: "admin",
            status: "active",
            notBefore: 0,
          });
        await assert.rejects(
          registerDifyOrchestrator(
            randomUUID(),
            actor,
            db,
            async (_path, options) => {
              if (options?.body) mutations++;
              return {};
            },
            env,
          ),
          failure("DIFY_ENVIRONMENT_OWNERSHIP"),
        );
        assert.equal(mutations, 0);
      },
    );
    await t.test(
      "managed setup coexists with an existing manual connection to the same MCP endpoint",
      async () => {
        const db = client.db("same_endpoint");
        const manual = {
          id: randomUUID(),
          name: "Manual staging",
          server_identifier: "unibase_staging",
          server_url: binding.endpoint,
        };
        const original = structuredClone(manual);
        const providers = [manual];
        let creates = 0;
        const request: typeof difyJson = async (path, options = {}) => {
          if (path === "/workspaces/current/tool-providers?type=mcp")
            return providers;
          if (path === "/workspaces/current/tool-provider/mcp") {
            const body = options.body as typeof manual;
            // Dify 1.17.1 enforces URL uniqueness, independently of the server identifier.
            if (
              providers.some(
                (p) =>
                  p.server_url === body.server_url &&
                  p.id !== body.id &&
                  p.id !==
                    (options.body as { provider_id?: string }).provider_id,
              )
            )
              throw new AppError(
                "DIFY_REJECTED",
                "Server URL already exists",
                502,
              );
            if (options.method === "PUT") return {};
            creates++;
            providers.push({ ...body, id: randomUUID() });
            return {};
          }
          return {
            server_identifier: binding.providerId,
            is_team_authorization: true,
            tools: [{ name: "get_run_context_v1" }],
          };
        };
        const result = await ensureEnvironmentMcp(
          ["get_run_context_v1"],
          db,
          request,
          env,
          async () => {},
        );
        assert.deepEqual(result, binding);
        assert.equal(creates, 1);
        assert.deepEqual(manual, original);
        const url = new URL(providers[1].server_url);
        assert.equal(url.searchParams.get("connection"), binding.providerId);
        url.search = "";
        assert.equal(url.href, binding.endpoint);
        await ensureEnvironmentMcp(
          ["get_run_context_v1"],
          db,
          request,
          env,
          async () => {},
        );
        assert.equal(creates, 1);
      },
    );
    await t.test(
      "unknown provider creation reconciles once; collisions and stale discovery fail closed",
      async () => {
        const db = client.db("provider"),
          uuid = randomUUID();
        let exists = false,
          creates = 0,
          lose = true,
          available = true;
        const request: typeof difyJson = async (path, options) => {
          if (path.includes("tool-providers?"))
            return exists
              ? [
                  {
                    id: uuid,
                    name: `${project.displayName.slice(0, 24)} [staging] MCP`,
                    server_identifier: binding.providerId,
                  },
                ]
              : [];
          if (path.endsWith("/mcp")) {
            if (options?.method !== "PUT") {
              creates++;
              exists = true;
              if (lose) {
                lose = false;
                throw Error("transport outcome unknown");
              }
            }
            assert.equal(
              (options?.body as { headers: { Authorization: string } }).headers
                .Authorization,
              `Bearer ${env.MCP_TOKEN_FIXTURE}`,
            );
            return {};
          }
          return {
            server_identifier: binding.providerId,
            is_team_authorization: true,
            tools: available ? [{ name: "get_run_context_v1" }] : [],
          };
        };
        const guard = async () => {};
        await assert.rejects(
          ensureEnvironmentMcp(["get_run_context_v1"], db, request, env, guard),
        );
        assert.deepEqual(
          await ensureEnvironmentMcp(
            ["get_run_context_v1"],
            db,
            request,
            env,
            guard,
          ),
          binding,
        );
        assert.equal(creates, 1);
        available = false;
        await assert.rejects(
          ensureEnvironmentMcp(["get_run_context_v1"], db, request, env, guard),
          failure("DIFY_MCP_PERMISSIONS"),
        );
        await assert.rejects(
          ensureEnvironmentMcp(
            [],
            client.db("foreign_provider"),
            request,
            env,
            guard,
          ),
          failure("DIFY_MCP_COLLISION"),
        );
        const control = client.db("provider_concurrency");
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        const first = ensureEnvironmentMcp(
          [],
          control,
          async () => {
            entered();
            await pending;
            return [];
          },
          env,
          guard,
        );
        await started;
        await assert.rejects(
          ensureEnvironmentMcp([], control, request, env, guard),
          failure("DIFY_MCP_BUSY"),
        );
        release();
        await assert.rejects(first);
      },
    );
    await t.test(
      "known tools remap only in drafts; external tools require typed explicit mappings",
      async () => {
        const db = client.db("mapping");
        const graph = {
          nodes: [
            {
              id: "context",
              data: {
                type: "tool",
                provider_type: "mcp",
                provider_id: "local_tunnel",
                tool_name: "get_run_context_v1",
              },
            },
          ],
        };
        const before = structuredClone(graph);
        assert.equal(
          (await bindEnvironmentGraph(graph, binding, db, true)).nodes[0].data
            .provider_id,
          binding.providerId,
        );
        assert.deepEqual(graph, before);
        await assert.rejects(
          bindEnvironmentGraph(graph, binding, db, false),
          failure("DIFY_MCP_BINDING_MISMATCH"),
        );
        graph.nodes[0].data.tool_name = "external_read";
        await assert.rejects(
          bindEnvironmentGraph(graph, binding, db, true),
          failure("DIFY_MCP_MAPPING_REQUIRED"),
        );
        const settings = bootstrapSettings();
        settings.runs.externalMcpMappings = [
          { source: "local_tunnel", destination: "external_staging" },
        ];
        await db
          .collection<Document & { _id: string }>("baseSettings")
          .insertOne({ _id: "base", settings });
        const mapped = await bindEnvironmentGraph(graph, binding, db, true);
        assert.equal(mapped.nodes[0].data.provider_id, "external_staging");
        await bindEnvironmentGraph(mapped, binding, db, false);
      },
    );
    await t.test(
      "missing destination secrets, models and datasets block before execution",
      async () => {
        await assert.rejects(
          verifyDestinationResources(
            {
              graph: { nodes: [] },
              environment_variables: [{ value_type: "secret", value: "" }],
            },
            async () => ({}),
          ),
          failure("DIFY_RESOURCE_REQUIRED"),
        );
        await assert.rejects(
          verifyDestinationResources(
            {
              graph: {
                nodes: [
                  {
                    id: "llm",
                    data: {
                      type: "llm",
                      model: { provider: "unconfigured", name: "missing" },
                    },
                  },
                ],
              },
            },
            async () => ({ data: [] }),
          ),
          failure("DIFY_RESOURCE_REQUIRED"),
        );
        await assert.rejects(
          verifyDestinationResources(
            {
              graph: {
                nodes: [
                  {
                    id: "knowledge",
                    data: { type: "knowledge-retrieval", dataset_ids: [] },
                  },
                ],
              },
            },
            async () => ({}),
          ),
          failure("DIFY_RESOURCE_REQUIRED"),
        );
      },
    );
    await t.test(
      "copy exact publication, preserve source, strip secrets, journal ownership and resume import",
      async () => {
        const db = client.db("copy"),
          appId = randomUUID(),
          workflowId = randomUUID(),
          destination = randomUUID();
        const actor = {
          uid: "admin",
          auth_time: Math.floor(Date.now() / 1000),
        };
        await db
          .collection<Document & { _id: string }>("accountAccess")
          .insertOne({
            _id: actor.uid,
            role: "admin",
            status: "active",
            notBefore: 0,
          });
        const source = structuredClone(
          orchestratorTemplate("document-summary").build("local_only"),
        );
        source.workflow.environment_variables.push({
          id: randomUUID(),
          name: "provider_secret",
          value_type: "secret",
          value: "SOURCE_SECRET_CANARY",
          selector: ["env", "provider_secret"],
        });
        const original = structuredClone(source);
        let imports = 0,
          imported: typeof source | undefined;
        const request = environmentRequest(
          db,
          env,
          async (path, options = {}) => {
            if (path === `/apps/${appId}/workflows?page=1&limit=10`)
              return {
                items: [
                  {
                    id: workflowId,
                    version: "publication",
                    graph: source.workflow.graph,
                    created_at: 1,
                  },
                ],
                page: 1,
                has_more: false,
              };
            if (
              path ===
              `/apps/${appId}/export?include_secret=false&workflow_id=${workflowId}`
            )
              return { data: JSON.stringify(source) };
            if (path === "/workspaces/current/tools/mcp")
              return [
                {
                  id: "local_only",
                  is_team_authorization: true,
                  tools: [{ name: "get_reference_document_v1" }],
                },
              ];
            if (path === "/apps/imports") {
              imports++;
              imported = JSON.parse(
                (options.body as { yaml_content: string }).yaml_content,
              );
              return { app_id: destination, status: "completed" };
            }
            if (path === `/apps/${destination}`)
              return {
                name: imported!.app.name,
                mode: "workflow",
                enable_site: false,
              };
            if (path === `/apps/${destination}/site-enable`) return {};
            throw Error("Unexpected or source-mutating request: " + path);
          },
        );
        const key = randomUUID();
        const result = await createDifyOrchestrator(
          key,
          actor,
          db,
          request,
          env,
          "document-summary",
          { appId, selection: { workflowId, page: 1 } },
        );
        assert.equal(result.status, "setup-required");
        assert.equal(imported!.app.name.endsWith("[staging]"), true);
        assert.equal(
          JSON.stringify(imported).includes("SOURCE_SECRET_CANARY"),
          false,
        );
        assert.equal(
          JSON.stringify(imported!.workflow.graph).includes("local_only"),
          false,
        );
        assert.deepEqual(source, original);
        const owned = await verifyAppOwnership(destination, db, request, env);
        assert.deepEqual(owned.source, { appId, workflowId });
        await createDifyOrchestrator(
          key,
          actor,
          db,
          request,
          env,
          "document-summary",
          { appId, selection: { workflowId, page: 1 } },
        );
        assert.equal(imports, 1);
        assert.equal(
          await db.collection("difyCredentials").countDocuments(),
          0,
        );
      },
    );
  } finally {
    await client.close();
    await repl.stop();
  }
});
