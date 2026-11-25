import assert from "node:assert/strict";
import { test } from "node:test";
import { checksum, type Migration } from "../../src/lib/server/migrations";
import {
  migrationManifest,
  migrationStatus,
} from "../../src/lib/server/migration-report";
import type { Db } from "mongodb";

const migration = (
  id: string,
  releasePhase: Migration["releasePhase"] = "before-release",
): Migration => ({
  id,
  description: id,
  releasePhase,
  async run() {
    throw new Error("must not run");
  },
  async verify() {
    throw new Error("must not verify");
  },
});
test("read-only status reports complete ledger, disabled owners, drift and unknown IDs without writes", async () => {
  const list = [
    migration("core:0001-a"),
    migration("core:0002-b"),
    migration("notes:0001-c"),
  ];
  const ledger = [
    {
      _id: list[0].id,
      checksum: "changed",
      appliedAt: new Date(0),
      durationMs: 2,
    },
    {
      _id: "removed:0001-a",
      checksum: "legacy",
      appliedAt: new Date(1),
      durationMs: 3,
    },
  ];
  const db = {
    collection(name: string) {
      assert.equal(name, "migrations");
      return {
        find() {
          return {
            async toArray() {
              return ledger;
            },
          };
        },
      };
    },
  } as unknown as Db;
  const result = await migrationStatus(
    db,
    migrationManifest("fixture", list, ["core"]),
  );
  assert.equal(result.ledger.length, 2);
  assert.deepEqual(result.changed, [list[0].id]);
  assert.deepEqual(result.unknown, ["removed:0001-a"]);
  assert.deepEqual(result.disabled, ["notes:0001-c"]);
  assert.deepEqual(
    result.pending.map((m) => m.id),
    [list[1].id],
  );
  assert.equal(result.activationDecision, "owner-action-required");
});
test("required, optional and unclassified pending declarations have distinct gates", async () => {
  const db = {
    collection() {
      return {
        find() {
          return {
            async toArray() {
              return [];
            },
          };
        },
      };
    },
  } as unknown as Db;
  for (const [phase, expected] of [
    ["before-release", "blocked-migrations"],
    ["after-release", "proceed"],
    ["bespoke", "owner-action-required"],
  ] as const) {
    const m = migration("core:0001-a", phase);
    const manifest = migrationManifest("fixture", [m], ["core"]);
    assert.equal(manifest.migrations[0].checksum, checksum(m));
    assert.equal(
      (await migrationStatus(db, manifest)).activationDecision,
      expected,
    );
  }
});
import { runApprovedMigrations } from "../../src/lib/server/approved-migrations";
import { fingerprint } from "../../src/lib/server/foundation/canonical";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { runMigrations } from "../../src/lib/server/migrations";
import { verifyCommerceExecution } from "../../src/lib/server/migration-verifiers";
import { coreMigrations } from "../../src/lib/server/core-migrations";

test("disposable database: reporting performs zero writes and protected batch holds one lease across backup and verification", async () => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-data-operations-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  try {
    const db = client.db("data_operations_catalog");
    await db.collection("sentinel").insertOne({ value: "retained" });
    const before = await db.listCollections().toArray();
    await migrationStatus(
      db,
      migrationManifest("fixture", coreMigrations, ["core", "runs"]),
    );
    assert.deepEqual(await db.listCollections().toArray(), before);
    let backedUp = false;
    const m: Migration = {
      id: "core:0001-test",
      description: "fixture",
      releasePhase: "before-release",
      async run(target) {
        assert.equal(backedUp, true);
        await target.collection("business").insertOne({ value: "once" });
      },
      async verify(target) {
        assert.equal(await target.collection("business").countDocuments(), 1);
      },
    };
    const batch = [{ id: m.id, checksum: checksum(m) }];
    const manifest = migrationManifest("fixture", [m], ["core"]);
    const approved = {
      database: db.databaseName,
      manifestDigest: fingerprint(manifest),
      ledgerDigest: (await migrationStatus(db, manifest)).ledgerDigest,
      pending: batch,
    };
    assert.throws(
      () =>
        runApprovedMigrations(
          db,
          [m],
          manifest,
          { ...approved, manifestDigest: "0".repeat(64) },
          async () => {
            throw new Error("must not back up");
          },
        ),
      /identity/,
    );
    await assert.rejects(
      runApprovedMigrations(
        db,
        [m],
        manifest,
        { ...approved, ledgerDigest: "0".repeat(64) },
        async () => {
          throw new Error("must not back up");
        },
      ),
      /ledger changed/,
    );
    await assert.rejects(
      runMigrations(db, [m], () => true, {
        approvedBatch: [],
        beforeApply: async () => {
          throw new Error("backup must not run");
        },
      }),
      /batch/,
    );
    await runMigrations(db, [m], () => true, {
      leaseMs: 600,
      approvedBatch: batch,
      beforeApply: async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await assert.rejects(
          runMigrations(db, [], () => true, { leaseMs: 600 }),
          /holds the lock/,
        );
        assert.equal(await db.collection("business").countDocuments(), 0);
        backedUp = true;
      },
    });
    assert.equal(await db.collection("control").countDocuments(), 0);
    assert.equal(await db.collection("migrations").countDocuments(), 1);
    const indexes = client.db("data_operations_indexes");
    await runMigrations(indexes, coreMigrations, (owner) => owner === "core", {
      approvedBatch: coreMigrations
        .filter((m) => m.id.startsWith("core:"))
        .map((m) => ({ id: m.id, checksum: checksum(m) })),
    });
    await verifyCommerceExecution(indexes);
    await indexes
      .collection("commerceCatalogVersions")
      .dropIndex("catalogId_1_revision_1");
    await indexes
      .collection("commerceCatalogVersions")
      .createIndex({ catalogId: 1, revision: 1 });
    await assert.rejects(verifyCommerceExecution(indexes), /verification/);
    await indexes
      .collection("commerceCatalogVersions")
      .dropIndex("catalogId_1_revision_1");
    await indexes
      .collection("commerceCatalogVersions")
      .createIndex(
        { revision: 1, catalogId: 1 },
        { unique: true, name: "catalogId_1_revision_1" },
      );
    await assert.rejects(verifyCommerceExecution(indexes), /verification/);
  } finally {
    await client.close();
    await repl.stop();
  }
});
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

test("packaged protected protocol waits for verified backup, applies exact source checksums and supports read-only original verifiers", async (t) => {
  // This suite must also work on a clean checkout, before any worker build.
  const build = spawnSync(process.execPath, ["scripts/build-migrations.mjs"], {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  assert.equal(build.status, 0, build.stderr || String(build.error));
  const manifest = JSON.parse(
    readFileSync("dist/migration-manifest.json", "utf8"),
  );
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-data-operations-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  // Register before any further setup can fail and leave MongoDB's pipes open.
  t.after(async () => {
    await client.close();
    await repl.stop();
  });
  const database = "data_operations_protocol";
  const db = client.db(database);
  // Project-owned bespoke migrations are outside this automatic-batch fixture.
  // Model them as already applied in this disposable database.
  const before = await migrationStatus(db, manifest);
  const prior = before.pending
    .filter((m) => before.bespoke.includes(m.id))
    .map((m) => ({
      _id: m.id,
      checksum: m.checksum,
      appliedAt: new Date(0),
      durationMs: 0,
    }));
  if (prior.length)
    await db.collection("migrations").insertMany(prior as never);
  const status = await migrationStatus(db, manifest);
  const pending = status.pending.map(({ id, checksum }) => ({ id, checksum }));
  const request = {
    version: 1,
    planId: "a".repeat(64),
    migrationRequest: {
      database,
      manifestDigest: fingerprint(manifest),
      ledgerDigest: status.ledgerDigest,
      pending,
    },
  };
  const children: ReturnType<typeof spawn>[] = [];
  const directory = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(resolve(tmpdir(), "migration-protocol-")),
  );
  function start(mode: string) {
    const child = spawn(
      process.execPath,
      [resolve("dist/migration-runner.cjs"), mode],
      {
        cwd: directory,
        env: {
          ...process.env,
          APP_ENV: "local",
          MONGODB_URI: repl.getUri(),
          MONGODB_DATABASE: database,
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    children.push(child);
    let stderr = "";
    child.stderr!.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    const lines = createInterface({ input: child.stdout! })[
      Symbol.asyncIterator
    ]();
    const exit = once(child, "exit");
    child.stdin!.write(JSON.stringify(request) + "\n");
    return {
      child,
      exit,
      async next() {
        const value = await lines.next();
        assert.equal(value.done, false, stderr);
        return JSON.parse(value.value);
      },
    };
  }
  try {
    await db.collection("notes").insertOne({ title: "legacy" });
    await db.collection("runAssets").insertOne({
      status: "ready",
      uid: "fixture",
      base64: "invalid-image",
      digest: "0".repeat(64),
    });
    const runner = start("--protected");
    assert.equal((await runner.next()).type, "ready");
    assert.equal(
      await db.collection("migrations").countDocuments(),
      prior.length,
    );
    assert.equal(await db.collection("control").countDocuments(), 1);
    runner.child.stdin!.write(
      JSON.stringify({
        type: "backup-verified",
        planId: request.planId,
        backupId: "b".repeat(64),
      }) + "\n",
    );
    assert.equal((await runner.next()).type, "migrate");
    assert.equal((await runner.next()).type, "verify");
    const result = await runner.next();
    assert.equal(result.type, "completed");
    assert.deepEqual(
      result.applied,
      pending.map((m: { id: string }) => m.id),
    );
    assert.equal(
      result.verification.find(
        (m: { id: string }) => m.id === "runs:0002-asset-variants",
      ).warnings.length,
      1,
    );
    assert.equal((await runner.exit)[0], 0);
    assert.deepEqual(
      (await db.collection("migrations").find().toArray()).map((row) => ({
        id: row._id,
        checksum: row.checksum,
      })),
      [
        ...prior.map((row) => ({ id: row._id, checksum: row.checksum })),
        ...pending,
      ],
    );
    const verifier = start("--verify");
    const inspected = await verifier.next();
    assert.equal(inspected.type, "inspection-ready");
    assert.equal(inspected.verification.length, pending.length);
    verifier.child.stdin!.write(
      JSON.stringify({ type: "release", planId: request.planId }) + "\n",
    );
    assert.equal((await verifier.exit)[0], 0);
    const replay = start("--protected");
    assert.equal((await replay.exit)[0], 1);
    assert.equal(
      await db.collection("migrations").countDocuments(),
      prior.length + pending.length,
    );
  } finally {
    for (const child of children)
      if (child.exitCode === null) {
        child.kill();
        await once(child, "exit");
      }
    await import("node:fs/promises").then((fs) =>
      fs.rm(directory, { recursive: true, force: true }),
    );
  }
});

test("partial write retains completed IDs and a fresh approved remaining batch is idempotent", async () => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-data-operations-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  const db = client.db("migration_partial_retry");
  let interrupted = true;
  const list: Migration[] = [1, 2].map((number) => ({
    id: `core:000${number}-fixture`,
    description: "idempotent fixture",
    releasePhase: "before-release",
    async run(target) {
      await target
        .collection("business")
        .updateOne(
          { key: number },
          { $setOnInsert: { value: "once" } },
          { upsert: true },
        );
      if (number === 2 && interrupted) throw new Error("partial write");
    },
    async verify(target) {
      assert.equal(
        await target.collection("business").countDocuments({ key: number }),
        1,
      );
    },
  }));
  const manifest = migrationManifest("fixture", list, ["core"]);
  try {
    const first = await migrationStatus(db, manifest);
    await assert.rejects(
      runApprovedMigrations(
        db,
        list,
        manifest,
        {
          database: db.databaseName,
          manifestDigest: fingerprint(manifest),
          ledgerDigest: first.ledgerDigest,
          pending: first.pending.map((row) => ({
            id: row.id,
            checksum: row.checksum,
          })),
        },
        async () => {},
      ),
      /partial write/,
    );
    assert.equal(await db.collection("migrations").countDocuments(), 1);
    assert.equal(await db.collection("business").countDocuments(), 2);
    await list[0].verify!(db); // Original recorded-ID readback; unrecorded partial work remains an operator responsibility.
    interrupted = false;
    const remaining = await migrationStatus(db, manifest);
    const result = await runApprovedMigrations(
      db,
      list,
      manifest,
      {
        database: db.databaseName,
        manifestDigest: fingerprint(manifest),
        ledgerDigest: remaining.ledgerDigest,
        pending: remaining.pending.map((row) => ({
          id: row.id,
          checksum: row.checksum,
        })),
      },
      async () => {},
    );
    assert.deepEqual(result.applied, [list[1].id]);
    assert.equal(await db.collection("business").countDocuments(), 2);
    assert.equal((await migrationStatus(db, manifest)).pending.length, 0);
  } finally {
    await client.close();
    await repl.stop();
  }
});
