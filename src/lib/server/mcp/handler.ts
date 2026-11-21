import "server-only";
import { mcpLimitsSchema, type McpLimits } from "../../contracts/mcp-limits";
import { authorizedRun } from "../runs/capabilities";
import { database } from "../mongo";
import { moduleEnabled, project } from "../../project";
import { limitRequest, RateLimitError } from "../rate-limit";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import type { McpConfig } from "../../config/mcp";
import { catalogVersion, tools, type RegisteredTool } from "./tools";

type Event = {
  event: "mcp-request" | "mcp-tool";
  started: number;
  status: number;
  requestId: string;
  clientId?: string;
  toolName?: string;
  outcome: string;
};
type Options = {
  config: McpConfig;
  appName: string;
  log: (event: Event) => void;
  registry?: readonly RegisteredTool[];
  timeoutMs?: number;
  limits?: McpLimits;
  loadLimits?: () => Promise<McpLimits>;
};
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function handleMcp(
  request: Request,
  options: Options,
): Promise<Response> {
  let limits = mcpLimitsSchema.parse(options.limits ?? {});
  const started = performance.now();
  const requestId = randomUUID();
  const log = (event: Event) => {
    try {
      options.log(event);
    } catch {
      /* Advisory only. */
    }
  };
  const respond = (status: number, clientId?: string) => {
    log({
      event: "mcp-request",
      started,
      status,
      requestId,
      clientId,
      outcome: status < 400 ? "succeeded" : "rejected",
    });
    return new Response(null, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
        ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="mcp"' } : {}),
        ...(status === 405 ? { Allow: "POST" } : {}),
      },
    });
  };
  const config = options.config;
  if (!moduleEnabled("mcp") || !config.enabled) return respond(404);
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const origin = request.headers.get("origin");
  if (
    !config.hosts.includes(host.toLowerCase()) ||
    (origin !== null && !config.origins.includes(origin))
  )
    return respond(403);
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 300 || !authorization.startsWith("Bearer "))
    return respond(401);
  const candidate = digest(authorization.slice(7));
  const client = config.clients.find((c) =>
    timingSafeEqual(candidate, digest(c.token)),
  );
  if (!client) return respond(401);
  if (request.method !== "POST") return respond(405, client.id);

  try {
    if (options.loadLimits)
      limits = mcpLimitsSchema.parse(await options.loadLimits());
    await limitRequest("mcp:" + client.id, "mcp");
  } catch (error) {
    const response = respond(
      error instanceof RateLimitError ? 429 : 503,
      client.id,
    );
    if (error instanceof RateLimitError)
      response.headers.set("Retry-After", String(error.retryAfter));
    return response;
  }
  const server = new McpServer({ name: project.slug, version: catalogVersion });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: limits.requestBytes,
  });
  for (const tool of options.registry ?? tools) {
    if (!client.permissions.includes(tool.permission)) continue;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        outputSchema: tool.output,
        annotations: {
          readOnlyHint: !tool.write,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        const callStarted = performance.now();
        const callId = randomUUID();
        const controller = new AbortController();
        const signal = AbortSignal.any([request.signal, controller.signal]);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let status = 200;
        let outcome = "succeeded";
        try {
          if (!client.permissions.includes(tool.permission)) throw new Error();
          const result = await Promise.race([
            Promise.resolve().then(async () => {
              signal.throwIfAborted();
              const parsed = tool.input.parse(input);
              const ownedRun = tool.runContext
                ? await authorizedRun(
                    database(),
                    String(parsed.runContext),
                    client.id,
                    tool.name,
                  )
                : undefined;
              signal.throwIfAborted();
              return tool.run(parsed, {
                ownedRun,
                clientId: client.id,
                appName: options.appName,
                requestId: callId,
                signal,
              });
            }),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => {
                outcome = "timeout";
                controller.abort();
                reject(new Error());
              }, options.timeoutMs ?? limits.timeoutMs);
            }),
          ]);
          signal.throwIfAborted();
          const output = tool.output.parse(result);
          const text = JSON.stringify(output);
          if (tool.runContext && text.includes(String(input.runContext)))
            throw new Error();
          if (Buffer.byteLength(text) > limits.toolResultBytes)
            throw new Error(); // Output appears in both result forms.
          let resultBytes = Buffer.byteLength(text);
          const images = (tool.images?.(result) ?? []).map((image) => {
            if (
              !(image.data instanceof Uint8Array) ||
              !image.data.byteLength ||
              !/^image\/(png|jpeg|webp|gif|avif)$/.test(image.mimeType) ||
              4 * Math.ceil(image.data.byteLength / 3) >
                limits.toolResultBytes - resultBytes
            )
              throw new Error();
            const bytes = Buffer.from(
              image.data.buffer,
              image.data.byteOffset,
              image.data.byteLength,
            );
            if (tool.runContext && bytes.includes(String(input.runContext)))
              throw new Error();
            const block = {
              type: "image" as const,
              data: bytes.toString("base64"),
              mimeType: image.mimeType,
            };
            resultBytes += Buffer.byteLength(JSON.stringify(block));
            if (resultBytes > limits.toolResultBytes) throw new Error();
            return block;
          });
          signal.throwIfAborted();
          return {
            structuredContent: output,
            content: [{ type: "text" as const, text }, ...images],
          };
        } catch {
          status = outcome === "timeout" ? 504 : 500;
          if (outcome !== "timeout") outcome = "failed";
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Tool execution ${outcome}. Request ID: ${callId}`,
              },
            ],
          };
        } finally {
          clearTimeout(timer);
          controller.abort();
          log({
            event: "mcp-tool",
            started: callStarted,
            status,
            requestId: callId,
            clientId: client.id,
            toolName: tool.name,
            outcome,
          });
        }
      },
    );
  }
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // JSON mode completes tool work before returning; consume before disposal.
    const body = await response.arrayBuffer();
    if (body.byteLength > limits.responseBytes) return respond(500, client.id);
    const envelope =
      body.byteLength &&
      response.headers.get("content-type")?.includes("application/json")
        ? (JSON.parse(Buffer.from(body).toString("utf8")) as {
            error?: unknown;
            result?: { isError?: boolean };
          })
        : undefined;
    const rejected =
      !response.ok ||
      Boolean(envelope?.error) ||
      envelope?.result?.isError === true;
    log({
      event: "mcp-request",
      started,
      status: response.status,
      requestId,
      clientId: client.id,
      outcome: rejected ? "rejected" : "succeeded",
    });
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Request-ID", requestId);
    return new Response(body.byteLength ? body : null, {
      status: response.status,
      headers,
    });
  } catch {
    return respond(500, client.id);
  } finally {
    await server.close().catch(() => undefined);
  }
}
