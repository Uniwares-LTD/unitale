import fs from "node:fs";
import nextEnv from "@next/env";

// Private env files/process values override tracked local defaults. Live runtime
// host bindings are rendered by provisioning. Release images separately preload
// their small allowlisted application flag map.
export function loadLocalEnvironment(development = false) {
  nextEnv.loadEnvConfig(process.cwd(), development);
  if ((process.env.APP_ENV ?? "local") !== "local") return;
  const config = JSON.parse(
    fs.readFileSync(
      new URL("../deploy/environments/local.json", import.meta.url),
      "utf8",
    ),
  );
  const catalog = JSON.parse(
    fs.readFileSync(
      new URL("./deploy/environment-catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const allowed = new Set([...catalog.runtime, ...catalog.localOnly]);
  const privateKeys = new Set([
    "REDIS_URL",
    "STRIPE_SECRET_KEY",
    "PLAY_BILLING_SERVICE_ACCOUNT_JSON",
    "STRIPE_WEBHOOK_SECRET",
    "DIFY_MANAGEMENT_KEY",
    "DIFY_CREDENTIAL_ENCRYPTION_KEY",
    "PERSONA_COMPLETION_API_KEY",
    "ASSET_S3_ACCESS_KEY_ID",
    "ASSET_S3_SECRET_ACCESS_KEY",
  ]);
  if (config.environment !== "local" || config.runtime.APP_ENV !== "local")
    throw new Error("Tracked local environment mismatch.");
  for (const [key, value] of Object.entries(config.runtime))
    if (
      !allowed.has(key) ||
      privateKeys.has(key) ||
      (value !== null && (typeof value !== "string" || /[\r\n\0]/.test(value)))
    )
      throw new Error("Invalid tracked local runtime setting.");
    else if (process.env[key] === undefined && value !== null)
      process.env[key] = value;
  if (config.runtime.MONGODB_URI) {
    const uri = new URL(config.runtime.MONGODB_URI);
    if (
      uri.protocol !== "mongodb:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname) ||
      uri.username ||
      uri.password
    )
      throw new Error(
        "Tracked local MongoDB must be credential-free and loopback-only.",
      );
  }
}
