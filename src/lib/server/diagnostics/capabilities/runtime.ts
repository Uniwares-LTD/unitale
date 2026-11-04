import "server-only";
import { z } from "zod";
import {
  moduleEnabled,
  moduleIds,
  project,
  requiredModuleConfigurations,
  requiredWorkers,
  type ModuleConfiguration,
} from "../../../project";
import { validateEnvironmentNames } from "../../../config/environment";
import { getConfig } from "../../config";
import { rateConfig } from "../../../config/rate-limits";
import { parseAuthConfig } from "../../../config/auth";
import { parseDatabaseConfig } from "../../../config/database";
import { parseCreditConfig } from "../../../config/credits";
import { parseStripeConfig } from "../../../config/payments";
import { parseDifyConfig } from "../../../config/dify";
import { parsePersonaCompletionConfig } from "../../../config/persona-completion";
import { parseAssetConfig } from "../../../config/assets";
import { parseMcpConfig } from "../../../config/mcp";
import { parseDiagnosticsConfig } from "../../../config/diagnostics";
import { orchestratorSchema } from "../../../contracts/runs";
import { releaseCommit } from "../../health";
import {
  healthyHeartbeat,
  WORKER_MAX_AGE_MS,
  type WorkerHeartbeat,
} from "../../worker-heartbeat";
import { privateToolPermissions } from "../../mcp/private-catalog";
import { inspectPrivateContextConfiguration } from "../../runs/capabilities";
import { define, iso, type DiagnosticContext } from "../context";

const empty = z.strictObject({});
const env = () => process.env as Record<string, string | undefined>;
const source = () => ({ source: "web", observedAt: new Date().toISOString() });

async function timed(check: () => Promise<unknown>) {
  const started = performance.now();
  try {
    await check();
    return {
      state: "ok" as const,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    return {
      state: "unavailable" as const,
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

export const runtimeStatus = define({
  description:
    "Deployed identity of this web process and its dependency reachability.",
  inputs: {},
  input: empty,
  async run(context: DiagnosticContext) {
    const config = getConfig();
    return {
      ...source(),
      environment: config.server.environment,
      origin: config.server.origin,
      release: releaseCommit() ?? null,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      modules: moduleIds.map((id) => ({ id, enabled: moduleEnabled(id) })),
      dependencies: {
        mongodb: await timed(() =>
          context.db.command(
            { ping: 1 },
            { timeoutMS: Math.min(4000, context.timeoutMS()) },
          ),
        ),
        redis: await timed(() => context.redisPing()),
      },
    };
  },
});

export const workersStatus = define({
  description:
    "Recent worker heartbeats: state, heartbeat age, release and reported configuration checks.",
  inputs: {},
  input: empty,
  async run(context: DiagnosticContext) {
    const web = releaseCommit() ?? "local";
    const rows = await context.db
      .collection<WorkerHeartbeat>("workerHeartbeats")
      .find({}, { timeoutMS: context.timeoutMS() })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    const now = context.now.getTime();
    return {
      ...source(),
      webRelease: web,
      requiredWorkers,
      maxAgeMs: WORKER_MAX_AGE_MS,
      workers: rows.map((row) => ({
        instance: row._id,
        kind: row.kind,
        state: row.state,
        release: row.commit,
        releaseMismatch: row.commit !== web,
        updatedAt: iso(row.updatedAt),
        ageMs: now - new Date(row.updatedAt).getTime(),
        healthy: healthyHeartbeat(row, now),
        checks: row.checks
          ? {
              source: `worker:${row.kind}`,
              observedAt: iso(row.checks.observedAt),
              privateContext: row.checks.privateContext ?? null,
            }
          : null,
      })),
      missingKinds: requiredWorkers.filter(
        (kind) =>
          !rows.some((row) => row.kind === kind && healthyHeartbeat(row, now)),
      ),
    };
  },
});

const presence = (name: string) => (env()[name] ? "present" : "absent");
function validity(check: () => unknown) {
  try {
    check();
    return "valid" as const;
  } catch {
    // Parser messages are not forwarded; they may describe configuration.
    return "invalid" as const;
  }
}
export const configurationCheck = define({
  description:
    "Configuration validation, module availability, credential presence and provider bindings for this web process.",
  inputs: {},
  input: empty,
  async run() {
    const values = env();
    let environment: "local" | "staging" | "production" = "local";
    let origin = "http://localhost:3000";
    const base = validity(() => {
      const config = getConfig();
      environment = config.server.environment;
      origin = config.server.origin;
    });
    const required = (id: ModuleConfiguration) =>
      requiredModuleConfigurations.has(id);
    let authMode: string | null = null;
    const checks = {
      base,
      environmentNames: validity(() => validateEnvironmentNames(values)),
      rateLimits: validity(() => rateConfig(values)),
      database: validity(() => parseDatabaseConfig(values, environment)),
      auth: validity(() => {
        authMode = parseAuthConfig(values, environment, origin).server.mode;
      }),
      credits: required("credits")
        ? validity(() =>
            parseCreditConfig(
              values,
              environment,
              parseAuthConfig(values, environment, origin).server.mode,
            ),
          )
        : "not-required",
      payments: required("payments")
        ? validity(() =>
            parseStripeConfig(values, values.PAYMENTS_MODE === "stripe"),
          )
        : "not-required",
      dify: required("runs")
        ? validity(() => parseDifyConfig(values))
        : "not-required",
      personaCompletion: required("runs")
        ? validity(() => parsePersonaCompletionConfig(values))
        : "not-required",
      assets:
        required("assets") || required("runs")
          ? validity(() => parseAssetConfig(values))
          : "not-required",
      mcp: required("mcp")
        ? validity(() => parseMcpConfig(values, origin))
        : "not-required",
      diagnostics: validity(() => parseDiagnosticsConfig(values)),
    };
    let bindings:
      | {
          id: string;
          enabled: boolean;
          keyEnv: string;
          key: string;
          privateTools: number;
          contextInput: boolean;
        }[]
      | "invalid" = [];
    try {
      bindings = z
        .array(orchestratorSchema)
        .max(100)
        .parse(JSON.parse(values.DIFY_ORCHESTRATORS_JSON || "[]"))
        .map((item) => ({
          id: item.id,
          enabled: item.enabled,
          keyEnv: item.keyEnv,
          key: presence(item.keyEnv),
          privateTools: item.privateTools?.length ?? 0,
          contextInput: !!item.contextInput,
        }));
    } catch {
      bindings = "invalid";
    }
    const privateContext = await inspectPrivateContextConfiguration(
      Object.keys(privateToolPermissions),
      values,
    );
    return {
      ...source(),
      project: project.slug,
      environment,
      authMode,
      modes: {
        dify: values.DIFY_MODE ?? "disabled",
        payments: values.PAYMENTS_MODE ?? null,
        personaCompletion: values.PERSONA_COMPLETION_MODE ?? "disabled",
        assets: values.ASSET_STORE ?? null,
      },
      checks,
      credentials: Object.fromEntries(
        [
          "MONGODB_URI",
          "REDIS_URL",
          "GOOGLE_APPLICATION_CREDENTIALS",
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "DIFY_MANAGEMENT_KEY",
          "DIFY_CREDENTIAL_ENCRYPTION_KEY",
          "PERSONA_COMPLETION_API_KEY",
          "ASSET_S3_SECRET_ACCESS_KEY",
        ].map((name) => [name, presence(name)]),
      ),
      orchestratorBindings: bindings,
      privateContext: {
        mcp: privateContext.mcp,
        clientId: privateContext.clientId,
        clientConfigured: privateContext.clientConfigured,
        missingPermissions: privateContext.missingPermissions,
        keySource: privateContext.keySource,
        keyDerivation:
          "HKDF over the selected key with APP_ORIGIN as salt; changing either invalidates saved Run context.",
        originConfigured: !!values.APP_ORIGIN,
      },
    };
  },
});
