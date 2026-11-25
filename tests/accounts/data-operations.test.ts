import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readDataOperations } from "../../src/lib/server/data-operations";
import { dataOperationSchema } from "../../src/lib/contracts/data-operations";

test("status reader is read-only, environment scoped, bounded and never infers completion from the ledger", async () => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-data-operations-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  const db = client.db("fixture_staging");
  const fixture = dataOperationSchema.parse(
    JSON.parse(
      readFileSync("tests/fixtures/data-operation-report.json", "utf8"),
    ),
  );
  const manifest = {
    version: 1 as const,
    project: "fixture",
    runnerSha256: "a".repeat(64),
    enabledOwners: ["core"],
    migrations: fixture.pending.map((row) => ({
      ...row,
      description: "fixture",
      releasePhase: "before-release" as const,
      hasVerifier: true,
    })),
  };
  const scope = {
    project: "fixture",
    environment: "staging",
    database: "fixture_staging",
  };
  try {
    await db.collection("migrations").insertOne({
      _id: fixture.pending[0].id as never,
      checksum: fixture.pending[0].checksum,
      appliedAt: new Date(0),
      durationMs: 1,
    });
    const before = await db.listCollections().toArray();
    const empty = await readDataOperations(db, scope, {}, { manifest });
    assert.equal(empty.reports.length, 0);
    assert.equal(empty.ledger?.appliedCount, 1);
    assert.match(empty.evidence, /alone do not establish verification/);
    assert.deepEqual(await db.listCollections().toArray(), before);
    for (let i = 0; i < 22; i++) {
      const id = i.toString(16).padStart(64, "0");
      await db.collection("deploymentOperations").insertOne({
        ...fixture,
        _id: id as never,
        operationId: id,
        planDigest: id,
      });
    }
    const entries = Array.from({ length: 123 }, (_, i) => ({
      id: `core:${String(i + 1).padStart(4, "0")}-test`,
      checksum: "a".repeat(64),
    }));
    await db.collection("deploymentOperations").insertOne({
      ...fixture,
      _id: fixture.operationId as never,
      pending: entries,
      applied: entries,
      verification: entries,
    });
    const list = await readDataOperations(db, scope, {}, { manifest });
    assert.equal(list.reports.length, 20);
    const first = await readDataOperations(
      db,
      scope,
      { planId: fixture.operationId },
      { manifest },
    );
    assert.equal(first.reports[0].pending.length, 100);
    assert.equal(first.reports[0].paging.nextOffset, 100);
    const last = await readDataOperations(
      db,
      scope,
      { planId: fixture.operationId, offset: 100 },
      { manifest },
    );
    assert.equal(last.reports[0].pending.length, 23);
    assert.equal(last.reports[0].paging.nextOffset, null);
    const foreign = await readDataOperations(
      db,
      { ...scope, environment: "prod" },
      {},
      { manifest },
    );
    assert.equal(foreign.reports.length, 0);
    await assert.rejects(
      readDataOperations(client.db("other"), scope, {}, { manifest }),
      /No matching record/,
    );
    await assert.rejects(
      readDataOperations(db, scope, { planId: "$ne" }, { manifest }),
    );
  } finally {
    await client.close();
    await repl.stop();
  }
});
