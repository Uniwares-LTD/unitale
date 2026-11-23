import "server-only";
import type { Db } from "mongodb";
import { fingerprint } from "./foundation/canonical";
import { migrationStatus, type migrationManifest } from "./migration-report";
import { runMigrations, type Migration } from "./migrations";

type Manifest = ReturnType<typeof migrationManifest> & {
  runnerSha256?: string;
};
export type ApprovedMigration = {
  database: string;
  manifestDigest: string;
  ledgerDigest: string;
  pending: { id: string; checksum: string }[];
};

// The host already approved the immutable plan. Recheck its database, static
// catalog and complete ledger while the existing lease spans backup and apply.
export function runApprovedMigrations(
  db: Db,
  migrations: readonly Migration[],
  manifest: Manifest,
  approved: ApprovedMigration,
  backupVerified: () => Promise<void>,
  beforeVerify?: () => void,
  onLeaseLost?: () => void,
) {
  if (
    approved.database !== db.databaseName ||
    fingerprint(manifest) !== approved.manifestDigest
  )
    throw new Error("Approved migration identity mismatch.");
  return runMigrations(
    db,
    migrations,
    (owner) => manifest.enabledOwners.includes(owner),
    {
      approvedBatch: approved.pending,
      beforeVerify,
      onLeaseLost,
      async beforeApply() {
        const status = await migrationStatus(db, manifest);
        if (
          status.ledgerDigest !== approved.ledgerDigest ||
          status.changed.length ||
          status.unknown.length ||
          status.bespoke.length
        )
          throw new Error("Approved migration ledger changed.");
        await backupVerified();
      },
    },
  );
}
