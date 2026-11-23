import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Db, Document, Filter } from "mongodb";
import { z } from "zod";
import { AppError } from "../auth-policy";
import {
  dataOperationSchema,
  operationHash,
} from "../contracts/data-operations";
import { project } from "../project";
import { getConfig } from "./config";
import { getDatabaseConfig } from "./database-config";
import { migrationStatus } from "./migration-report";

const manifestSchema = z.strictObject({
  version: z.literal(1),
  project: z.string(),
  enabledOwners: z.array(z.string()),
  runnerSha256: operationHash,
  migrations: z
    .array(
      z.strictObject({
        id: z.string(),
        description: z.string(),
        releasePhase: z.enum(["before-release", "after-release", "bespoke"]),
        checksum: operationHash,
        hasVerifier: z.boolean(),
      }),
    )
    .max(1000),
});
export const operationStatusInput = z.strictObject({
  planId: operationHash.optional(),
  offset: z.number().int().min(0).max(100000).default(0),
});
export function dataOperationScope() {
  const environment = getConfig().server.environment;
  return {
    project: project.slug,
    environment: environment === "production" ? "prod" : environment,
    database: getDatabaseConfig().database,
  };
}
export async function readMigrationManifest() {
  let bytes: string;
  try {
    bytes = await readFile(
      path.join(process.cwd(), "migration-manifest.json"),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      bytes = await readFile(
        path.join(process.cwd(), "dist", "migration-manifest.json"),
        "utf8",
      );
    } catch (fallback) {
      if ((fallback as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw fallback;
    }
  }
  return manifestSchema.parse(JSON.parse(bytes));
}

// Caller authenticates before this shared read. No settings, lease, index or report writes.
export async function readDataOperations(
  db: Db,
  scope: ReturnType<typeof dataOperationScope>,
  input: z.input<typeof operationStatusInput> = {},
  options: {
    timeoutMS?: number;
    manifest?: z.infer<typeof manifestSchema> | null;
  } = {},
) {
  const { planId, offset } = operationStatusInput.parse(input);
  if (db.databaseName !== scope.database)
    throw new AppError("DIAGNOSTIC_NOT_FOUND", "No matching record.", 404);
  const timeoutMS = options.timeoutMS ?? 5000;
  const filter: Filter<Document & { _id: string }> = {
    project: scope.project,
    environment: scope.environment,
    database: scope.database,
    ...(planId ? { _id: planId } : {}),
  };
  const [rows, manifest] = await Promise.all([
    db
      .collection<Document & { _id: string }>("deploymentOperations")
      .find(filter, { projection: { _id: 0 }, timeoutMS })
      .sort({ observedAt: -1, operationId: -1 })
      .limit(planId ? 1 : 20)
      .toArray(),
    options.manifest === undefined ? readMigrationManifest() : options.manifest,
  ]);
  const reports = rows.map((row) => dataOperationSchema.parse(row));
  if (
    reports.some(
      (row) =>
        row.project !== scope.project ||
        row.environment !== scope.environment ||
        row.database !== scope.database ||
        (planId && row.operationId !== planId),
    )
  )
    throw new AppError("DIAGNOSTIC_NOT_FOUND", "No matching record.", 404);
  if (manifest && manifest.project !== scope.project)
    throw new Error("Migration manifest project differs.");
  const status = manifest
    ? await migrationStatus(db, manifest, { timeoutMS })
    : null;
  const details = reports.map((report) => {
    const counts = {
      pending: report.pending.length,
      applied: report.applied.length,
      verification: report.verification.length,
    };
    return {
      ...report,
      pending: report.pending.slice(offset, offset + 100),
      applied: report.applied.slice(offset, offset + 100),
      verification: report.verification.slice(offset, offset + 100),
      paging: {
        offset,
        counts,
        nextOffset:
          Math.max(...Object.values(counts)) > offset + 100
            ? offset + 100
            : null,
      },
    };
  });
  return {
    version: 1 as const,
    reports: details,
    ledger: status
      ? {
          appliedCount: status.applied.length,
          pendingCount: status.pending.length,
          requiredCount: status.required.length,
          changedCount: status.changed.length,
          unknownCount: status.unknown.length,
          applied: status.applied.slice(offset, offset + 100),
          pending: status.pending.slice(offset, offset + 100),
          changed: status.changed.slice(offset, offset + 100),
          unknown: status.unknown.slice(offset, offset + 100),
          disabled: status.disabled.slice(offset, offset + 100),
          paging: {
            offset,
            nextOffset:
              Math.max(
                status.applied.length,
                status.pending.length,
                status.changed.length,
                status.unknown.length,
                status.disabled.length,
              ) >
              offset + 100
                ? offset + 100
                : null,
          },
        }
      : null,
    evidence:
      "Last recorded outcomes only. Ledger IDs alone do not establish verification. Use workflow/host status for active, unknown or missing outcomes.",
  };
}

export async function currentDataOperations() {
  const { database } = await import("./mongo");
  return readDataOperations(database(), dataOperationScope());
}
