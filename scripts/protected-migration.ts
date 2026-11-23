import { z } from "zod";
import { createInterface } from "node:readline";
import type { Db } from "mongodb";
import { manifest, migrations } from "./migration-catalog";
import { checkedManifest } from "../src/lib/server/migration-package";
import { runApprovedMigrations } from "../src/lib/server/approved-migrations";
import { withMigrationLease, checksum } from "../src/lib/server/migrations";
import { migrationStatus } from "../src/lib/server/migration-report";
import { fingerprint } from "../src/lib/server/foundation/canonical";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const entry = z.strictObject({
  id: z.string().regex(/^(core|[a-z][a-z0-9-]{1,39}):\d{4}-[a-z0-9-]+$/),
  checksum: hash,
});
const initial = z.strictObject({
  version: z.literal(1),
  planId: hash,
  migrationRequest: z.strictObject({
    database: z.string(),
    manifestDigest: hash,
    ledgerDigest: hash,
    pending: z.array(entry).max(1000),
  }),
});
export async function protectedMigration(db: Db, inspect: boolean) {
  const lifetime = setTimeout(() => process.exit(1), 60 * 60_000);
  lifetime.unref();
  const packaged = checkedManifest(manifest);
  if (!("runnerSha256" in packaged))
    throw new Error("Packaged runner required.");
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  const send = (value: unknown) => console.log(JSON.stringify(value));
  const read = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        iterator.next(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Protocol timeout.")),
            30 * 60_000,
          );
        }),
      ]);
      if (result.done || Buffer.byteLength(result.value) > 65536)
        throw new Error("Protocol closed.");
      return JSON.parse(result.value);
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    const request = initial.parse(await read());
    const approved = request.migrationRequest;
    if (
      db.databaseName !== approved.database ||
      fingerprint(packaged) !== approved.manifestDigest
    )
      throw new Error("Identity mismatch.");
    if (inspect) {
      await withMigrationLease(
        db,
        async (lease) => {
          const inspect = async () => {
            const status = await migrationStatus(db, packaged);
            if (status.changed.length || status.unknown.length)
              throw new Error("Incompatible ledger.");
            const verification: { id: string; warnings: string[] }[] = [];
            const recorded = new Map(status.ledger.map((row) => [row.id, row]));
            for (const entry of approved.pending) {
              const m = migrations.find((m) => m.id === entry.id);
              if (!m?.verify || checksum(m) !== entry.checksum)
                throw new Error("Original verifier unavailable.");
              if (!recorded.has(entry.id)) continue;
              const result = await m.verify(db);
              verification.push({
                id: entry.id,
                warnings: result?.warnings ?? [],
              });
              await lease();
            }
            await lease();
            return {
              type: "inspection-ready",
              ledger: status.ledger,
              verification,
            };
          };
          send(await inspect());
          while (true) {
            const message = z
              .strictObject({
                type: z.enum(["validate", "release"]),
                planId: hash,
              })
              .parse(await read());
            if (message.planId !== request.planId)
              throw new Error("Identity mismatch.");
            if (message.type === "release") break;
            send(await inspect());
          }
        },
        {
          onLeaseLost: () => {
            process.exit(1);
          },
        },
      );
    } else {
      const result = await runApprovedMigrations(
        db,
        migrations,
        packaged,
        approved,
        async () => {
          send({ type: "ready", planId: request.planId });
          const acknowledgment = z
            .strictObject({
              type: z.literal("backup-verified"),
              planId: hash,
              backupId: hash,
            })
            .parse(await read());
          if (acknowledgment.planId !== request.planId)
            throw new Error("Identity mismatch.");
          send({ type: "migrate" });
        },
        () => send({ type: "verify" }),
        () => {
          process.exit(1);
        },
      );
      send({ type: "completed", ...result });
    }
  } finally {
    lines.close();
    clearTimeout(lifetime);
  }
}
