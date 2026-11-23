import { z } from "zod";

// Content capabilities return stored user content and are never preselected.
export const diagnosticCapabilities = {
  "capabilities.list": "metadata",
  "runtime.status": "metadata",
  "data-operations.status": "metadata",
  "workers.status": "metadata",
  "configuration.check": "metadata",
  "reports.search": "metadata",
  "reports.get": "metadata",
  "run.search": "metadata",
  "run.get": "metadata",
  "run.diagnose": "metadata",
  "run.content": "content",
  "account.search": "metadata",
  "account.get": "metadata",
  "credits.get": "metadata",
  "credits.ledger": "metadata",
  "credits.holds": "metadata",
  "payments.search": "metadata",
  "payments.get": "metadata",
  "file.search": "metadata",
  "file.get": "metadata",
  "artifact.search": "metadata",
  "artifact.get": "metadata",
  "artifact.revisions": "metadata",
  "artifact.content": "content",
  "notifications.search": "metadata",
  "notifications.get": "metadata",
  "orchestrator.search": "metadata",
  "orchestrator.get": "metadata",
  "persona.search": "metadata",
  "persona.get": "metadata",
  "settings.get": "metadata",
} as const satisfies Record<string, "metadata" | "content">;
export type DiagnosticCapability = keyof typeof diagnosticCapabilities;
export const diagnosticCapabilityNames = Object.keys(
  diagnosticCapabilities,
) as DiagnosticCapability[];
export const diagnosticCapabilitySchema = z.enum(
  diagnosticCapabilityNames as [
    DiagnosticCapability,
    ...DiagnosticCapability[],
  ],
);

export const grantDurations = {
  "15m": 15 * 60,
  "1h": 3600,
  "4h": 4 * 3600,
  "24h": 24 * 3600,
  "7d": 7 * 24 * 3600,
  "30d": 30 * 24 * 3600,
} as const;
export const MAX_ACTIVE_GRANTS = 20;
export const PHRASE_MIN_BYTES = 24;
export const PHRASE_MAX_BYTES = 256;

export const grantCreateSchema = z.strictObject({
  duration: z.enum(["15m", "1h", "4h", "24h", "7d", "30d"]),
  capabilities: z
    .array(diagnosticCapabilitySchema)
    .min(1)
    .max(diagnosticCapabilityNames.length)
    .refine((values) => new Set(values).size === values.length),
});
export const grantRevokeSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});
export const grantViewSchema = z.strictObject({
  id: z.string(),
  capabilities: z.array(diagnosticCapabilitySchema),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export const grantCreatedSchema = grantViewSchema.extend({
  credential: z.string().regex(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
  endpoint: z.url(),
});
export type GrantCreated = z.infer<typeof grantCreatedSchema>;
export type GrantView = z.infer<typeof grantViewSchema>;
export const grantListSchema = z.strictObject({
  grants: z.array(grantViewSchema),
  limit: z.number().int(),
});
export const diagnosticRequestSchema = z.strictObject({
  capability: z.string().max(64),
  payload: z.record(z.string(), z.unknown()),
});
