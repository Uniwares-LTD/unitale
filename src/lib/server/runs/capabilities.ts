import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import type { Db, ClientSession } from "mongodb";
import { AppError } from "@/lib/auth-policy";
import { parseMcpConfig } from "@/lib/config/mcp";
import { aiJobs, type AiJob } from "../ai/jobs";
import { authorizeWorkerAccount } from "../worker-authorization";
import { accountAccess, accessPermitsSession } from "../store/access";

type Capability = {
  _id: string;
  jobId: string;
  uid: string;
  clientId: string;
  operations: string[];
  expiresAt: Date;
  ciphertext: string;
  iv: string;
  tag: string;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Typed causes behind the public `private-context-unavailable` failure. */
export const privateContextReasons = [
  "mcp-configuration-invalid",
  "mcp-disabled",
  "mcp-client-missing",
  "private-tools-missing",
  "mcp-permissions-missing",
  "encryption-key-missing",
  "encryption-key-invalid",
  "decryption-failed",
] as const;
export type PrivateContextReason = (typeof privateContextReasons)[number];
const reasonMessages: Record<PrivateContextReason, string> = {
  "mcp-configuration-invalid": "Invalid MCP configuration.",
  "mcp-disabled": "Configure the Run MCP client and private tools.",
  "mcp-client-missing": "Configure the Run MCP client and private tools.",
  "private-tools-missing": "Configure the Run MCP client and private tools.",
  "mcp-permissions-missing": "Grant the Run MCP client's required permissions.",
  "encryption-key-missing": "Configure private capability encryption.",
  "encryption-key-invalid": "Invalid encryption configuration.",
  "decryption-failed":
    "The saved Run context cannot be decrypted. Restore its encryption configuration.",
};
const configurationError = (reason: PrivateContextReason) =>
  new AppError("CAPABILITY_CONFIGURATION", reasonMessages[reason], 503, reason);

export type KeySource =
  "explicit" | "management-fallback" | "missing" | "invalid";
/** Report which secret derives the key without exposing it or a fingerprint. */
export function capabilityKeySource(
  env: Record<string, string | undefined> = process.env,
): KeySource {
  const explicit = env.DIFY_CREDENTIAL_ENCRYPTION_KEY;
  if (explicit)
    return /^[a-fA-F0-9]{64}$/.test(explicit) ? "explicit" : "invalid";
  return env.DIFY_MANAGEMENT_KEY ? "management-fallback" : "missing";
}
function key() {
  const source = capabilityKeySource();
  if (source === "invalid") throw configurationError("encryption-key-invalid");
  if (source === "missing") throw configurationError("encryption-key-missing");
  const secret =
    source === "explicit"
      ? Buffer.from(process.env.DIFY_CREDENTIAL_ENCRYPTION_KEY!, "hex")
      : process.env.DIFY_MANAGEMENT_KEY!;
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      process.env.APP_ORIGIN ?? "local",
      "unibase:run-capabilities:v1",
      32,
    ),
  );
}
function decrypt(record: Capability) {
  const derived = key();
  try {
    const d = createDecipheriv(
      "aes-256-gcm",
      derived,
      Buffer.from(record.iv, "base64"),
    );
    d.setAAD(Buffer.from(record.jobId));
    d.setAuthTag(Buffer.from(record.tag, "base64"));
    return Buffer.concat([
      d.update(Buffer.from(record.ciphertext, "base64")),
      d.final(),
    ]).toString("utf8");
  } catch {
    throw configurationError("decryption-failed");
  }
}

export type PrivateContextConfiguration = {
  mcp: "enabled" | "disabled" | "invalid";
  clientId: string;
  clientConfigured: boolean;
  operations: string[];
  missingPermissions: string[];
  keySource: KeySource;
  /** First cause capability creation would report, in creation order. */
  reason: PrivateContextReason | null;
};
/**
 * Non-mutating checks shared by capability creation and diagnostics. Reads
 * only the supplied process configuration; never creates a capability.
 */
export async function inspectPrivateContextConfiguration(
  operations: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<PrivateContextConfiguration> {
  const clientId = env.RUN_MCP_CLIENT_ID ?? "dify";
  const keySource = capabilityKeySource(env);
  let config;
  try {
    config = parseMcpConfig(env, env.APP_ORIGIN ?? "http://localhost:3000");
  } catch {
    return {
      mcp: "invalid",
      clientId,
      clientConfigured: false,
      operations: [...operations],
      missingPermissions: [],
      keySource,
      reason: "mcp-configuration-invalid",
    };
  }
  const client = config.enabled
    ? config.clients.find((c) => c.id === clientId)
    : undefined;
  const { privateToolPermissions } = await import("../mcp/private-catalog");
  const missingPermissions = client
    ? [
        ...new Set(
          operations
            .map((op) => privateToolPermissions[op] ?? `unknown:${op}`)
            .filter((permission) => !client.permissions.includes(permission)),
        ),
      ]
    : [];
  const reason: PrivateContextReason | null = !config.enabled
    ? "mcp-disabled"
    : !client
      ? "mcp-client-missing"
      : !operations.length
        ? "private-tools-missing"
        : missingPermissions.length
          ? "mcp-permissions-missing"
          : keySource === "invalid"
            ? "encryption-key-invalid"
            : keySource === "missing"
              ? "encryption-key-missing"
              : null;
  return {
    mcp: config.enabled ? "enabled" : "disabled",
    clientId,
    clientConfigured: !!client,
    operations: [...operations],
    missingPermissions,
    keySource,
    reason,
  };
}

export type StoredCapabilityCheck =
  | { present: false }
  | {
      present: true;
      clientId: string;
      operations: string[];
      expiresAt: string;
      decryption: "ok" | PrivateContextReason;
    };
/**
 * Verify a saved capability decrypts in memory. Returns only the outcome;
 * plaintext, ciphertext and key material never leave this function.
 */
export async function inspectStoredCapability(
  db: Db,
  jobId: string,
  options: { maxTimeMS?: number } = {},
): Promise<StoredCapabilityCheck> {
  const record = await db
    .collection<Capability>("runCapabilities")
    .findOne({ jobId }, { maxTimeMS: options.maxTimeMS });
  if (!record) return { present: false };
  let decryption: "ok" | PrivateContextReason = "ok";
  try {
    decrypt(record);
  } catch (error) {
    decryption =
      error instanceof AppError && error.reason
        ? (error.reason as PrivateContextReason)
        : "decryption-failed";
  }
  return {
    present: true,
    clientId: record.clientId,
    operations: [...record.operations],
    expiresAt: record.expiresAt.toISOString(),
    decryption,
  };
}

export async function capabilityForRun(db: Db, job: AiJob) {
  const records = db.collection<Capability>("runCapabilities");
  const existing = await records.findOne({ jobId: job._id });
  if (existing) return decrypt(existing);
  const operations = job.run?.orchestrator.privateTools ?? [];
  const check = await inspectPrivateContextConfiguration(operations);
  // Invalid MCP configuration keeps its original non-AppError behavior.
  if (check.reason === "mcp-configuration-invalid")
    throw new Error(reasonMessages[check.reason]);
  if (check.reason) throw configurationError(check.reason);
  const token = randomBytes(32).toString("base64url");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(job._id));
  const ciphertext = Buffer.concat([
    c.update(token, "utf8"),
    c.final(),
  ]).toString("base64");
  await records.updateOne(
    { jobId: job._id },
    {
      $setOnInsert: {
        _id: hash(token),
        jobId: job._id,
        uid: job.uid,
        clientId: check.clientId,
        operations,
        expiresAt: job.reviewAfter,
        ciphertext,
        iv: iv.toString("base64"),
        tag: c.getAuthTag().toString("base64"),
      },
    },
    { upsert: true },
  );
  return decrypt((await records.findOne({ jobId: job._id }))!);
}
export async function authorizedRun(
  db: Db,
  token: string,
  clientId: string,
  operation: string,
  session?: ClientSession,
  authorize = authorizeWorkerAccount,
) {
  const capability = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await db.collection<Capability>("runCapabilities").findOne(
        {
          _id: hash(token),
          clientId,
          operations: operation,
          expiresAt: { $gt: new Date() },
        },
        { session },
      )
    : null;
  const job = capability
    ? await aiJobs(db).findOne(
        {
          _id: capability.jobId,
          uid: capability.uid,
          cancelRequested: false,
          status: { $in: ["dispatching", "running", "paused", "unknown"] },
        },
        { session },
      )
    : null;
  if (
    !job ||
    (job.execution && !["running", "paused"].includes(job.execution.status)) ||
    !(await authorize(job.uid, job.authTime)) ||
    !accessPermitsSession(
      await accountAccess(db, job.uid, session),
      job.authTime,
    )
  )
    throw new AppError(
      "RUN_ACCESS_DENIED",
      "Run operation is unavailable.",
      403,
    );
  return job;
}
