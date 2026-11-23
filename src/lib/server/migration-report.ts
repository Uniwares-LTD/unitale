import "server-only";
import { fingerprint } from "./foundation/canonical";
import type { Db } from "mongodb";
import {
  checksum,
  migrationOwner,
  validateMigrations,
  type Migration,
  type MigrationRecord,
} from "./migrations";

export function migrationManifest(
  project: string,
  migrations: readonly Migration[],
  enabledOwners: string[],
) {
  validateMigrations(migrations);
  return {
    version: 1 as const,
    project,
    enabledOwners,
    migrations: migrations.map((m) => ({
      id: m.id,
      description: m.description,
      releasePhase: m.releasePhase ?? "bespoke",
      checksum: checksum(m),
      hasVerifier: !!m.verify,
    })),
  };
}

// No lease, index creation, migration/verifier execution, or metadata writes.
export async function migrationStatus(
  db: Db,
  manifest: ReturnType<typeof migrationManifest>,
  { timeoutMS = 5000 }: { timeoutMS?: number } = {},
) {
  const ledger = (
    await db
      .collection<MigrationRecord>("migrations")
      .find({}, { timeoutMS })
      .toArray()
  )
    .map((row) => ({
      id: row._id,
      checksum: row.checksum,
      appliedAt: row.appliedAt.toISOString(),
      durationMs: row.durationMs,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const recorded = new Map(ledger.map((row) => [row.id, row]));
  const known = new Set(manifest.migrations.map((m) => m.id));
  const changed = manifest.migrations
    .filter(
      (m) => recorded.has(m.id) && recorded.get(m.id)!.checksum !== m.checksum,
    )
    .map((m) => m.id);
  const unknown = ledger
    .filter((row) => !known.has(row.id))
    .map((row) => row.id);
  const disabled = manifest.migrations
    .filter((m) => !manifest.enabledOwners.includes(migrationOwner(m.id)))
    .map((m) => m.id);
  const pending = manifest.migrations.filter(
    (m) => !recorded.has(m.id) && !disabled.includes(m.id),
  );
  const bespoke = pending
    .filter((m) => m.releasePhase === "bespoke" || !m.hasVerifier)
    .map((m) => m.id);
  const required = pending
    .filter((m) => m.releasePhase === "before-release")
    .map((m) => m.id);
  return {
    version: 1,
    project: manifest.project,
    ledger,
    ledgerDigest: fingerprint(ledger),
    applied: ledger.map((row) => row.id),
    disabled,
    pending,
    changed,
    unknown,
    required,
    bespoke,
    activationDecision:
      changed.length || unknown.length || bespoke.length
        ? "owner-action-required"
        : required.length
          ? "blocked-migrations"
          : "proceed",
    nextAction:
      changed.length || unknown.length || bespoke.length
        ? "Review candidate/ledger compatibility with the data owner."
        : required.length
          ? "Prepare and approve backup and migration before activation."
          : pending.length
            ? "Compatible backfills may be prepared separately."
            : "No pending migrations.",
  };
}
