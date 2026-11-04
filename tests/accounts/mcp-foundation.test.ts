import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { mcpLimitsSchema } from "../../src/lib/contracts/mcp-limits";
import { handleMcp } from "../../src/lib/server/mcp/handler";
import { parseMcpConfig } from "../../src/lib/config/mcp";
import type { RegisteredTool } from "../../src/lib/server/mcp/tools";
const token = "a".repeat(43);
const config = parseMcpConfig(
  {
    MCP_ENABLED: "true",
    MCP_TOKEN_FIXTURE: token,
    MCP_CLIENTS_JSON: JSON.stringify([
      {
        id: "fixture",
        tokenEnv: "MCP_TOKEN_FIXTURE",
        permissions: ["run:read"],
      },
    ]),
  },
  "http://localhost:3000",
);
function request(name: string, argumentsValue = {}) {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: argumentsValue },
    }),
  });
}
const tool: RegisteredTool = {
  name: "fixture_v1",
  description: "Fixture",
  permission: "run:read",
  input: z.strictObject({}),
  output: z.strictObject({ value: z.string() }),
  async run() {
    return { value: '"'.repeat(300) };
  },
};
test("MCP preserves defaults and checks complete escaped responses without truncating", async () => {
  assert.deepEqual(mcpLimitsSchema.parse({}), {
    requestBytes: 65536,
    responseBytes: 65536,
    toolResultBytes: 31744,
    timeoutMs: 10000,
  });
  const options = { config, appName: "Fixture", registry: [tool], log() {} };
  assert.equal((await handleMcp(request(tool.name), options)).status, 200);
  assert.equal(
    (
      await handleMcp(request(tool.name), {
        ...options,
        limits: mcpLimitsSchema.parse({
          responseBytes: 1024,
          toolResultBytes: 900,
        }),
      })
    ).status,
    500,
  );
  const oversized = await handleMcp(
    request(tool.name, { data: "x".repeat(2000) }),
    { ...options, limits: mcpLimitsSchema.parse({ requestBytes: 1024 }) },
  );
  assert.equal(oversized.status, 413);
});
test("private extension tools cannot execute without an authorized owned Run", async () => {
  let executed = false;
  const privateTool = {
    ...tool,
    runContext: true,
    input: z.strictObject({ runContext: z.string() }),
    async run() {
      executed = true;
      return { value: "private" };
    },
  };
  const response = await handleMcp(
    request(tool.name, { runContext: "invalid" }),
    { config, appName: "Fixture", registry: [privateTool], log() {} },
  );
  assert.equal((await response.json()).result.isError, true);
  assert.equal(executed, false);
});
test("limits are loaded per authenticated request and unavailable settings fail closed", async () => {
  let loads = 0;
  const options = {
    config,
    appName: "Fixture",
    registry: [tool],
    log() {},
    async loadLimits() {
      loads++;
      return mcpLimitsSchema.parse({
        toolResultBytes: loads === 1 ? 1000 : 128,
      });
    },
  };
  assert.equal(
    (await (await handleMcp(request(tool.name), options)).json()).result
      .isError,
    undefined,
  );
  assert.equal(
    (await (await handleMcp(request(tool.name), options)).json()).result
      .isError,
    true,
  );
  assert.equal(loads, 2);
  assert.equal(
    (
      await handleMcp(request(tool.name), {
        ...options,
        async loadLimits() {
          throw new Error("unavailable");
        },
      })
    ).status,
    503,
  );
});

test("one service credential can cover extension read/write permissions without core permission edits", () => {
  const parsed = parseMcpConfig(
    {
      MCP_ENABLED: "true",
      MCP_TOKEN_FIXTURE: token,
      MCP_CLIENTS_JSON: JSON.stringify([
        {
          id: "fixture",
          tokenEnv: "MCP_TOKEN_FIXTURE",
          permissions: ["extension:booklets:read", "extension:booklets:write"],
        },
      ]),
    },
    "http://localhost:3000",
  );
  assert.ok(parsed.enabled);
  if (parsed.enabled) assert.equal(parsed.clients[0].permissions.length, 2);
  assert.throws(() =>
    parseMcpConfig(
      {
        MCP_ENABLED: "true",
        MCP_TOKEN_FIXTURE: token,
        MCP_CLIENTS_JSON: JSON.stringify([
          {
            id: "fixture",
            tokenEnv: "MCP_TOKEN_FIXTURE",
            permissions: ["extension:*:write"],
          },
        ]),
      },
      "http://localhost:3000",
    ),
  );
});
