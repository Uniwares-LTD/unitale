import { migrations, ownerEnabled, manifest } from "./migration-catalog";
import { runMigrations } from "../src/lib/server/migrations";
import { migrationStatus } from "../src/lib/server/migration-report";

import { checkedManifest } from "../src/lib/server/migration-package";

async function main() {
  const checked = checkedManifest(manifest);
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--manifest") {
    console.log(JSON.stringify(checked));
    return;
  }
  if (
    args.length &&
    !["--status --json", "--protected", "--verify"].includes(args.join(" "))
  )
    throw new Error("Invalid migration arguments.");
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const { parseConfig } = await import("../src/lib/config/schema");
  const { parseDatabaseConfig } = await import("../src/lib/config/database");
  const { MongoClient } = await import("mongodb");
  const base = parseConfig(process.env);
  const config = parseDatabaseConfig(process.env, base.server.environment);
  const client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    if (args[0] === "--protected" || args[0] === "--verify") {
      const { protectedMigration } = await import("./protected-migration");
      await protectedMigration(
        client.db(config.database),
        args[0] === "--verify",
      );
    } else if (args.length)
      console.log(
        JSON.stringify(
          await migrationStatus(client.db(config.database), manifest),
        ),
      );
    else {
      const report = await runMigrations(
        client.db(config.database),
        migrations,
        ownerEnabled,
      );
      console.log(
        `Migrations applied: ${report.applied.length}; skipped for disabled modules: ${report.skipped.length}.`,
      );
      for (const id of report.applied) console.log(`  applied ${id}`);
      for (const id of report.changed)
        console.warn(
          `  ${id} changed after it was applied; it was not rerun. Add a new migration for further data changes.`,
        );
    }
  } finally {
    await client.close();
  }
}
void main().catch(() => {
  console.error(
    "Migration failed. Check arguments, connectivity and migration evidence; no credentials were printed.",
  );
  process.exitCode = 1;
});
