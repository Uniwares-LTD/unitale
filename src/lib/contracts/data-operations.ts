import { z } from "zod";
export const operationHash = z.string().regex(/^[a-f0-9]{64}$/);
export const migrationEntrySchema = z.strictObject({
  id: z.string().regex(/^(core|[a-z][a-z0-9-]{1,39}):\d{4}-[a-z0-9-]+$/),
  checksum: operationHash,
});
const entries = z.array(migrationEntrySchema).max(1000);
export const dataOperationSchema = z
  .strictObject({
    version: z.literal(1),
    operationId: operationHash,
    planDigest: operationHash,
    project: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
    environment: z.enum(["local", "staging", "prod"]),
    database: z.string().regex(/^[A-Za-z0-9_]{1,64}$/),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    image: z
      .string()
      .regex(/^ghcr.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$/),
    configurationHash: operationHash,
    manifestDigest: operationHash,
    ledgerDigest: operationHash,
    observedAt: z.iso.datetime(),
    state: z.enum(["prepared", "running", "completed", "failed", "unknown"]),
    phase: z.enum(["backup", "migrate", "verify", "health"]).nullable(),
    deploymentOutcome: z.enum([
      "not-attempted",
      "blocked-migrations",
      "blocked-recovery",
      "succeeded",
      "failed",
      "unknown",
    ]),
    migrationOutcome: z.enum([
      "not-required",
      "pending",
      "running",
      "completed",
      "failed",
      "unknown",
    ]),
    backup: z
      .strictObject({
        backupId: operationHash,
        database: z.string(),
        sha256: operationHash,
        verified: z.boolean(),
      })
      .nullable(),
    pending: entries,
    applied: entries,
    verification: entries,
    writersRestored: z.boolean(),
    health: z.boolean(),
    warnings: z.array(z.string().max(2000)).max(1000),
    resolution: z
      .strictObject({
        disposition: z.enum(["safe-to-retry", "verified-complete"]),
        operator: z.string().min(1).max(200),
        reason: z.string().min(1).max(2000),
        observedAt: z.iso.datetime(),
      })
      .nullable(),
  })
  .superRefine((report, context) => {
    if (
      report.operationId !== report.planDigest ||
      (report.backup && report.backup.database !== report.database)
    )
      context.addIssue({
        code: "custom",
        message: "Operation identity differs.",
      });
    if (
      report.state === "completed" &&
      (!report.backup?.verified ||
        !report.writersRestored ||
        !report.health ||
        report.migrationOutcome !== "completed" ||
        JSON.stringify(report.pending) !== JSON.stringify(report.applied) ||
        JSON.stringify(report.pending) !== JSON.stringify(report.verification))
    )
      context.addIssue({
        code: "custom",
        message:
          "Completion requires backup, migration, verification and recovery evidence.",
      });
  });
export type DataOperation = z.infer<typeof dataOperationSchema>;
