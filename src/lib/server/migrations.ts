import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";

// Forward-only data migrations. IDs are `<owner>:<NNNN>-<name>`, where owner is
// "core" or the module that owns the data, so a record stays valid when a
// module moves between core, samples and projects. Migrations must be
// idempotent: a failure records nothing and the next run retries.
export type Migration = {
  id: string;
  description: string;
  releasePhase?: "before-release" | "after-release" | "bespoke";
  verify?: (db: Db) => Promise<{ warnings?: string[] } | void>;
  run: (db: Db) => Promise<unknown>;
};
export type MigrationRecord = {
  _id: string;
  description: string;
  checksum: string;
  appliedAt: Date;
  durationMs: number;
};
type Lock = { _id: string; owner: string; expiresAt: Date };

const idPattern = /^(core|[a-z][a-z0-9-]{1,39}):(\d{4})-[a-z0-9-]+$/;
const lockId = "migrations-lock";
const defaultLeaseMs = 10 * 60_000;

export function checksum(migration: Migration) {
  // Substituted only by the build from source/tsx checksums, never from CLI input.
  if (typeof MIGRATION_SOURCE_CHECKSUMS !== "undefined") {
    const value = MIGRATION_SOURCE_CHECKSUMS[migration.id];
    if (!value)
      throw new Error("Migration missing from packaged checksum catalog.");
    return value;
  }
  return createHash("sha256")
    .update(migration.run.toString().replace(/\s+/g, " "))
    .digest("hex");
}

declare const MIGRATION_SOURCE_CHECKSUMS: Record<string, string> | undefined;

// Rejects malformed, duplicate or out-of-order IDs, and owners outside the
// known set when one is given, before anything runs.
export function validateMigrations(
  migrations: readonly Migration[],
  owners?: readonly string[],
) {
  const ids = new Set<string>(),
    last = new Map<string, number>();
  for (const { id } of migrations) {
    const match = idPattern.exec(id);
    if (!match) throw new Error(`Invalid migration id ${id}.`);
    if (ids.has(id)) throw new Error(`Duplicate migration id ${id}.`);
    const [, owner, number] = match;
    if (owners && !owners.includes(owner))
      throw new Error(`Migration ${id} has an unknown owner.`);
    if (Number(number) <= (last.get(owner) ?? 0))
      throw new Error(`Migration ${id} is out of order.`);
    ids.add(id);
    last.set(owner, Number(number));
  }
}

export const migrationOwner = (id: string) => id.slice(0, id.indexOf(":"));

export type MigrationReport = {
  applied: string[];
  skipped: string[];
  changed: string[];
  verification?: { id: string; warnings: string[] }[];
};

// Applies pending migrations in list order under a leased lock in `control`.
// `enabled` decides per owner; disabled owners are skipped, not recorded, so
// their migrations run once the module is enabled.
export async function withMigrationLease<T>(
  db: Db,
  work: (lease: () => Promise<void>) => Promise<T>,
  {
    now = () => new Date(),
    leaseMs = defaultLeaseMs,
    onLeaseLost = () => {},
  } = {},
): Promise<T> {
  const control = db.collection<Lock>("control"),
    owner = randomUUID(),
    held = () => new Error("Another migration run holds the lock.");
  let lost: unknown;
  const lease = async () => {
    if (lost) throw lost;
    const at = now();
    let lock: Lock | null;
    try {
      lock = await control.findOneAndUpdate(
        {
          _id: lockId,
          $or: [{ owner }, { expiresAt: { $lte: at } }],
        },
        { $set: { owner, expiresAt: new Date(at.getTime() + leaseMs) } },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      // A duplicate key on upsert means another runner holds the lease;
      // connection and permission failures surface unchanged.
      if ((error as { code?: number }).code === 11000) throw held();
      throw error;
    }
    if (lock?.owner !== owner) throw held();
  };
  // Renews the lease while a migration runs so a long migration is never
  // taken over; a lost lease fails the run before its record is written.
  const guarded = async (run: () => Promise<unknown>) => {
    let pending: Promise<void> | undefined;
    // One renewal at a time; the last one is awaited so a late renewal can
    // neither outlive the run nor recreate a released lock.
    const timer = setInterval(() => {
      pending ??= lease()
        .catch((error) => {
          lost ??= error;
          onLeaseLost();
        })
        .finally(() => (pending = undefined));
    }, leaseMs / 3);
    try {
      await run();
    } finally {
      clearInterval(timer);
      await pending;
    }
    if (lost) throw lost;
    await lease();
  };
  await lease();
  try {
    let result!: T;
    await guarded(async () => {
      result = await work(lease);
    });
    return result;
  } finally {
    await control.deleteOne({ _id: lockId, owner });
  }
}

export async function runMigrations(
  db: Db,
  migrations: readonly Migration[],
  enabled: (owner: string) => boolean,
  {
    now = () => new Date(),
    leaseMs = defaultLeaseMs,
    approvedBatch,
    beforeApply,
    beforeVerify,
    onLeaseLost,
  }: {
    now?: () => Date;
    leaseMs?: number;
    approvedBatch?: readonly { id: string; checksum: string }[];
    beforeApply?: () => Promise<void>;
    beforeVerify?: () => void;
    onLeaseLost?: () => void;
  } = {},
): Promise<MigrationReport> {
  validateMigrations(migrations);
  return withMigrationLease(
    db,
    async (lease) => {
      const records = db.collection<MigrationRecord>("migrations");
      const report: MigrationReport = { applied: [], skipped: [], changed: [] };
      const done = new Map(
        (await records.find().toArray()).map((row) => [row._id, row]),
      );
      if (approvedBatch) {
        const pending = migrations.filter(
          (m) => !done.has(m.id) && enabled(migrationOwner(m.id)),
        );
        if (
          JSON.stringify(
            pending.map((m) => ({ id: m.id, checksum: checksum(m) })),
          ) !== JSON.stringify(approvedBatch) ||
          pending.some(
            (m) => !m.verify || !m.releasePhase || m.releasePhase === "bespoke",
          ) ||
          [...done.values()].some(
            (row) =>
              !migrations.some(
                (m) => m.id === row._id && checksum(m) === row.checksum,
              ),
          )
        )
          throw new Error(
            "Approved migration batch does not match current state.",
          );
      }
      await lease();
      await beforeApply?.();
      await lease();
      for (const migration of migrations) {
        const sum = checksum(migration),
          previous = done.get(migration.id);
        if (previous) {
          // Applied migrations never rerun; a changed body is reported only,
          // because formatting or toolchain changes also alter the checksum.
          if (previous.checksum !== sum) report.changed.push(migration.id);
          continue;
        }
        if (!enabled(migrationOwner(migration.id))) {
          report.skipped.push(migration.id);
          continue;
        }
        await lease();
        const started = Date.now();
        await migration.run(db);
        await lease();
        await records.insertOne({
          _id: migration.id,
          description: migration.description,
          checksum: sum,
          appliedAt: now(),
          durationMs: Date.now() - started,
        });
        report.applied.push(migration.id);
      }
      if (approvedBatch) {
        beforeVerify?.();
        report.verification = [];
        for (const entry of approvedBatch) {
          const result = await migrations.find((m) => m.id === entry.id)!
            .verify!(db);
          report.verification.push({
            id: entry.id,
            warnings: result?.warnings ?? [],
          });
          await lease();
        }
      }
      return report;
    },
    { now, leaseMs, onLeaseLost },
  );
}
