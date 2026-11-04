import { consumptionTermsSchema } from "../../src/lib/contracts/commerce";
import { coreMigrations } from "../../src/lib/server/core-migrations";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { z } from "zod";
import {
  saveCatalogDraft,
  previewCatalog,
  publishCatalog,
  publishedCatalog,
  createCatalogIndexes,
} from "../../src/lib/server/commerce/catalogs";
import {
  retainEvidence,
  readEvidence,
  recordMeasurement,
  measurementsForOperation,
  releaseOperationEvidence,
  cleanupEvidence,
  createMeasurementIndexes,
} from "../../src/lib/server/execution/measurements";
test("catalogs and execution evidence enforce immutable snapshots, ownership, retries and cleanup fences", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  const db = client.db("foundation_fixture");
  const actor = { uid: "admin-fixture", auth_time: 1 };
  try {
    await db
      .collection<{
        _id: string;
        role: string;
        status: string;
        notBefore: number;
        revision: number;
        updatedAt: Date;
      }>("accountAccess")
      .insertOne({
        _id: actor.uid,
        role: "admin",
        status: "active",
        notBefore: 0,
        revision: 1,
        updatedAt: new Date(),
      });
    const migration = coreMigrations.find(
      (m) => m.id === "core:0001-commerce-execution-indexes",
    )!;
    await db.collection("legacyFixture").insertOne({ retained: true });
    await migration.run(db);
    await migration.run(db);
    assert.equal(
      await db.collection("legacyFixture").countDocuments({ retained: true }),
      1,
    );
    await createCatalogIndexes(db);
    await createMeasurementIndexes(db);
    await t.test(
      "catalog publication requires a matching preview and preserves previously accepted terms",
      async () => {
        const types = [
          {
            id: "booklet",
            schemaVersion: 1,
            fields: z.strictObject({ pages: z.number().int().min(1).max(20) }),
          },
        ];
        const definition = {
          kind: "consumption",
          terms: {
            identity: { id: "book", revision: 1, schemaVersion: 1 },
            productType: "booklet",
            productSchemaVersion: 1,
            credits: 50,
            allowances: [],
            entitlementDays: null,
          },
          fields: { pages: 3 },
        };
        await assert.rejects(
          saveCatalogDraft(
            db,
            { uid: "member", auth_time: 1 },
            definition,
            0,
            types,
          ),
        );
        await assert.rejects(
          saveCatalogDraft(
            db,
            actor,
            { ...definition, fields: { pages: 21 } },
            0,
            types,
          ),
        );
        await assert.rejects(saveCatalogDraft(db, actor, definition, 0, []));
        const saved = await saveCatalogDraft(db, actor, definition, 0, types);
        assert.equal(await publishedCatalog(db, saved.id), null);
        const preview = await previewCatalog(db, actor, saved.id, types);
        await assert.rejects(
          publishCatalog(db, actor, saved.id, 1, "wrong-hash", types),
        );
        const published = await publishCatalog(
          db,
          actor,
          saved.id,
          1,
          preview.hash,
          types,
        );
        assert.deepEqual(
          await publishCatalog(db, actor, saved.id, 1, preview.hash, types),
          published,
        );
        const next = {
          ...definition,
          terms: {
            ...definition.terms,
            identity: { ...definition.terms.identity, revision: 2 },
            credits: 80,
          },
        };
        const attempts = await Promise.allSettled([
          saveCatalogDraft(db, actor, next, 1, types),
          saveCatalogDraft(db, actor, next, 1, types),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal(
          consumptionTermsSchema.parse(
            (await publishedCatalog(db, saved.id, 1))?.definition.terms,
          ).credits,
          50,
        );
        await assert.rejects(
          publishCatalog(db, actor, saved.id, 1, preview.hash, types),
        );
        const revised = await previewCatalog(db, actor, saved.id, types);
        await publishCatalog(db, actor, saved.id, 2, revised.hash, types);
        assert.equal(
          consumptionTermsSchema.parse(
            (await publishedCatalog(db, saved.id))?.definition.terms,
          ).credits,
          80,
        );
        assert.equal(
          consumptionTermsSchema.parse(
            (await publishedCatalog(db, saved.id, 1))?.definition.terms,
          ).credits,
          50,
        );
      },
    );
    await t.test(
      "purchase catalogs reject duplicate provider mappings and preserve channel terms",
      async () => {
        const purchase = {
          kind: "purchase",
          terms: {
            identity: { id: "purchase-one", revision: 1, schemaVersion: 1 },
            label: "Fixture",
            credits: 100,
            price: { amountMinor: 500, currency: "USD" },
            channel: "stripe",
            billing: { kind: "one-time", creditExpiryDays: null },
            provider: {
              productId: "prod-fixture",
              priceId: "price-fixture",
              offerId: null,
            },
          },
        };
        const first = await saveCatalogDraft(db, actor, purchase, 0, []);
        const preview = await previewCatalog(db, actor, first.id, []);
        await publishCatalog(db, actor, first.id, 1, preview.hash, []);
        const second = await saveCatalogDraft(
          db,
          actor,
          {
            ...purchase,
            terms: {
              ...purchase.terms,
              identity: { ...purchase.terms.identity, id: "purchase-two" },
            },
          },
          0,
          [],
        );
        const duplicate = await previewCatalog(db, actor, second.id, []);
        await assert.rejects(
          publishCatalog(db, actor, second.id, 1, duplicate.hash, []),
          /already assigned/,
        );
        assert.equal(await publishedCatalog(db, second.id), null);
      },
    );
    await t.test(
      "evidence is redacted, private, idempotent and retained while unresolved",
      async () => {
        const input = {
          id: "ev-1",
          runId: "run-1",
          operationId: "op-1",
          kind: "output" as const,
          retentionDays: 90,
          payload: {
            authorization: "Bearer credential",
            prompt: "known-secret",
            access_token: "token-secret",
            data: "large".repeat(20000),
          },
          secrets: ["known-secret"],
        };
        const ref = await retainEvidence(db, "owner", input);
        assert.deepEqual(await retainEvidence(db, "owner", input), ref);
        const stored = await readEvidence(db, "owner", "ev-1");
        assert.doesNotMatch(
          JSON.stringify(stored),
          /known-secret|Bearer credential|token-secret/,
        );
        await assert.rejects(readEvidence(db, "foreign", "ev-1"));
        await assert.rejects(
          retainEvidence(db, "owner", { ...input, payload: "changed" }),
        );
        const measurement = {
          schemaVersion: 1,
          id: "call-1",
          operationId: "op-1",
          runId: "run-1",
          provider: "fake",
          model: "fake-model",
          requestId: "request-1",
          workflowRunId: "workflow-1",
          publicationId: "publication-1",
          parentMeasurementId: null,
          scope: "call",
          authority: "provider",
          usage: { inputTokens: 10, outputTokens: null, additional: [] },
          reportedCost: null,
          estimatedCost: null,
          queuedAt: null,
          startedAt: null,
          completedAt: null,
          elapsedMs: null,
          providerDurationMs: null,
          outcome: "unknown",
          evidence: [ref],
        };
        await recordMeasurement(db, "owner", measurement);
        await recordMeasurement(db, "owner", measurement);
        await assert.rejects(
          recordMeasurement(db, "owner", { ...measurement, model: "changed" }),
        );
        await assert.rejects(recordMeasurement(db, "foreign", measurement));
        await recordMeasurement(db, "owner", {
          ...measurement,
          id: "summary",
          scope: "summary",
        });
        assert.deepEqual(
          (await measurementsForOperation(db, "owner", "op-1")).coverage,
          { calls: 1, reported: 0, estimatedOnly: 0, unknown: 1 },
        );
        assert.equal(
          (await measurementsForOperation(db, "foreign", "op-1")).measurements
            .length,
          0,
        );
        assert.equal(await cleanupEvidence(db, new Date("2040-01-01")), 0);
        await assert.rejects(releaseOperationEvidence(db, "owner", "op-1"));
        await db.collection("aiJobs").insertOne({
          uid: "owner",
          run: { logicalId: "run-1" },
          status: "running",
        });
        await assert.rejects(
          releaseOperationEvidence(db, "owner", "op-1", {
            evidenceId: "receipt",
            reason: "Verified provider outcome",
          }),
          /Active Runs/,
        );
        await db.collection("aiJobs").deleteMany({ uid: "owner" });
        await assert.rejects(
          releaseOperationEvidence(db, "owner", "op-1", {
            evidenceId: "receipt",
            reason: "Verified provider outcome",
          }),
        );
        await retainEvidence(db, "owner", {
          ...input,
          id: "receipt",
          kind: "provider-receipt",
          payload: { requestId: "request-1", status: "failed" },
        });
        await releaseOperationEvidence(db, "owner", "op-1", {
          evidenceId: "receipt",
          reason: "Verified provider outcome",
        });
        await assert.rejects(
          recordMeasurement(db, "owner", { ...measurement, id: "late-call" }),
        );
        assert.equal(await cleanupEvidence(db, new Date("2040-01-01")), 2);
        await assert.rejects(readEvidence(db, "owner", "ev-1"));
        assert.equal(
          (await measurementsForOperation(db, "owner", "op-1")).measurements
            .length,
          2,
        );
      },
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
