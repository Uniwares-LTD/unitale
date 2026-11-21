import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Db, Document } from "mongodb";
import { project } from "../../../src/lib/project";
import { tools } from "../../../src/lib/server/mcp/tools";
import {
  environmentMcpConfiguration,
  recordAppOwnership,
} from "../../../src/lib/server/runs/environment-binding";
import type { difyJson } from "../../../src/lib/server/runs/dify-console-client";
import {
  orchestratorTemplates,
  orchestratorTemplate,
} from "../../../src/lib/server/runs/templates";

type Env = Record<string, string | undefined>;
export const bindingTestEnvironment = {
  APP_ENV: "staging",
  APP_ORIGIN: "https://app.example.test",
  MCP_ENABLED: "true",
  MCP_TOKEN_FIXTURE: "fixture_".repeat(8),
  MCP_CLIENTS_JSON: JSON.stringify([
    {
      id: "dify",
      tokenEnv: "MCP_TOKEN_FIXTURE",
      permissions: [
        "server:read",
        "reference:read",
        "demo:read",
        "run:read",
        "artifact:read",
        "artifact:write",
      ],
    },
  ]),
};
export function mockBindingProbe(t: TestContext, env: Env) {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result:
          body.method === "tools/list"
            ? { tools: tools.map((tool) => ({ name: tool.name })) }
            : {
                structuredContent: {
                  project: project.slug,
                  environment: env.APP_ENV,
                  origin: env.APP_ORIGIN,
                },
              },
      });
    },
  );
}
const states = new WeakMap<Db, { uuid: string; created: boolean }>();
export function environmentRequest(
  db: Db,
  env: Env,
  original: typeof difyJson,
): typeof difyJson {
  const state = states.get(db) ?? { uuid: randomUUID(), created: false };
  states.set(db, state);
  const { binding } = environmentMcpConfiguration(env);
  return async (path, options = {}) => {
    const templates = orchestratorTemplates().flatMap(
      (t) => orchestratorTemplate(t.id).dsl.workflow.graph.nodes,
    );
    if (path === "/workspaces/current/models/model-types/llm") {
      const models = [
        { provider: "fixture", name: "existing-model" },
        ...templates
          .filter((n) => n.data.type === "llm")
          .map((n) => n.data.model as { provider: string; name: string }),
      ];
      return {
        data: models.filter(Boolean).map((m) => ({
          provider: m.provider,
          status: "active",
          models: [{ model: m.name, status: "active" }],
        })),
      };
    }
    if (path === "/workspaces/current/tool-providers?type=builtin")
      return templates
        .filter((n) => n.data.provider_type === "builtin")
        .map((n) => ({ id: n.data.provider_id, is_team_authorization: true }));
    if (path === "/workspaces/current/tool-providers?type=mcp")
      return state.created
        ? [
            {
              id: state.uuid,
              server_identifier: binding.providerId,
              name: "Managed MCP",
            },
          ]
        : [];
    if (path === "/workspaces/current/tool-provider/mcp") {
      state.created = true;
      return { id: state.uuid };
    }
    if (path === `/workspaces/current/tool-provider/mcp/update/${state.uuid}`) {
      const catalog = (await original("/workspaces/current/tools/mcp", {
        management: true,
      })) as { tools: { name: string }[]; is_team_authorization: boolean }[];
      return {
        server_identifier: binding.providerId,
        is_team_authorization: catalog[0]?.is_team_authorization ?? false,
        tools: catalog[0]?.tools ?? [],
      };
    }
    if (path === "/tags?type=app")
      return [{ id: state.uuid, name: `app:${project.slug}-${env.APP_ENV}` }];
    if (path === "/tag-bindings") return { result: "success" };
    const result = await original(path, options);
    if (/^\/apps\/[a-f0-9-]+$/.test(path)) {
      const app = result as { name?: string };
      return {
        ...app,
        name: `${app.name?.replace(/\s*\[staging\]$/, "")} [${env.APP_ENV}]`,
        tags: [{ name: `app:${project.slug}-${env.APP_ENV}` }],
      };
    }
    if (path === "/workspaces/current/tools/mcp") {
      const rows = result as { id: string }[];
      return rows.map((row) => ({ ...row, id: binding.providerId }));
    }
    return result;
  };
}
export async function ownFixtureApp(appId: string, db: Db, env: Env) {
  const operationId = randomUUID();
  await db
    .collection<Document & { _id: string }>("orchestratorCreations")
    .insertOne({ _id: operationId, appId, started: true });
  await recordAppOwnership(
    appId,
    operationId,
    environmentMcpConfiguration(env).binding,
    db,
    env,
  );
}
