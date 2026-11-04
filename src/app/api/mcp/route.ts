import { publicSettings, readSettings } from "@/lib/server/settings";
import { getConfig } from "@/lib/server/config";
import { parseMcpConfig } from "@/lib/config/mcp";
import { handleMcp } from "@/lib/server/mcp/handler";
import { logOperation } from "@/lib/server/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const base = getConfig();
  return handleMcp(request, {
    config: parseMcpConfig(process.env, base.server.origin),
    appName: (await publicSettings()).appName,
    // Durable settings are read per request; replicas do not retain stale limits.
    loadLimits: async () => (await readSettings()).settings.mcp,
    log: ({ event, started, status, requestId, ...metadata }) => {
      logOperation(event, started, status, requestId, metadata);
    },
  });
}
export {
  handle as POST,
  handle as GET,
  handle as DELETE,
  handle as PUT,
  handle as PATCH,
  handle as HEAD,
  handle as OPTIONS,
};
