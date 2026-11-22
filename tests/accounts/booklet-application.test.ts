import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  createCatalogIndexes,
  previewCatalog,
  publishCatalog,
  saveCatalogDraft,
} from "../../src/lib/server/commerce/catalogs";
import {
  createConsumptionIndexes,
  queueConsumption,
} from "../../src/lib/server/commerce/orders";
import {
  createCreditIndexes,
  grantCredits,
} from "../../src/lib/server/store/credits";
import { readSettings } from "../../src/lib/server/settings";
import { orchestratorSchema } from "../../src/lib/contracts/runs";
import { fingerprint } from "../../src/lib/server/foundation/canonical";
import { creativeFieldsSchema } from "../../src/lib/server/booklets/documents";
import { bookletApplication } from "../../src/lib/server/booklets/application";
import { bookletRepositoryV2 } from "../../src/lib/server/booklets/repository-v2";
import { bookletLifecycleV2 } from "../../src/lib/server/booklets/lifecycle-v2";
import { bookletsServerExtension } from "../../src/project/booklets/server";

const admin = { uid: "admin", auth_time: 1 };
const owner = { uid: "owner", authTime: 1 };
const stranger = { uid: "stranger", authTime: 1 };
const types = [
  { id: "booklet", schemaVersion: 1, fields: creativeFieldsSchema },
];
const language = { tag: "en", direction: "ltr" as const };
const canvas = { width: 1024, height: 1024, mime: "image/png" as const };
const profile = { id: "profile", revision: 1 };
const fields = {
  executionProfileId: profile.id,
  executionProfileRevision: profile.revision,
  storyPages: 4,
  includeCover: true,
  maxCharacters: 2,
  maxLocations: 2,
  maxPanelsPerPage: 3,
  styleSamples: 1,
  canvas,
  languages: [language],
  repairLimitPerOutput: 1,
  execution: {
    maxTextCalls: 50,
    maxImageCalls: 10,
    maxWorkflowSteps: 100,
    maxElapsedSeconds: 3600,
    spendingCeiling: { amountMinor: 100, currency: "USD" },
  },
};
const capacity = {
  ...profile,
  maxStoryPages: 8,
  coverSupported: true,
  maxCharacters: 4,
  maxLocations: 4,
  maxPanelsPerPage: 4,
  maxStyleSamples: 2,
  canvases: [canvas],
  languages: [language],
};
const retryDefaults = { paidLlm: 1, paidImage: 0, nonPaid: 2 };
const brief = {
  idea: "A lantern learns to glow.",
  audience: "Children",
  language,
  characters: ["Lantern"],
  locations: ["Harbour"],
  visualPreferences: "Soft watercolour",
};

function terms(revision: number, credits: number) {
  return {
    kind: "consumption",
    terms: {
      identity: { id: "booklet-small", revision, schemaVersion: 1 },
      productType: "booklet",
      productSchemaVersion: 1,
      credits,
      allowances: [
        { category: "story", unit: "request", included: 1, extraCredits: 5 },
        { category: "style", unit: "subject", included: 1, extraCredits: 3 },
        {
          category: "reference",
          unit: "subject",
          included: 1,
          extraCredits: 3,
        },
        { category: "page", unit: "subject", included: 0, extraCredits: 3 },
      ],
      entitlementDays: null,
    },
    fields,
  };
}

test("booklet application facade", async (t) => {
  const previous = {
    mode: process.env.DIFY_MODE,
    key: process.env.DIFY_KEY_FIXTURE,
  };
  process.env.DIFY_MODE = "fake";
  process.env.DIFY_KEY_FIXTURE = "fixture-not-a-key";
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  let serial = 0;

  async function publish(db: Db, revision: number, credits: number) {
    const saved = await saveCatalogDraft(
      db,
      admin,
      terms(revision, credits),
      revision - 1,
      types,
    );
    const preview = await previewCatalog(db, admin, saved.id, types);
    return publishCatalog(db, admin, saved.id, revision, preview.hash, types);
  }
  async function orchestrator(db: Db, id: string, revision = 1) {
    const definition = orchestratorSchema.parse({
      id,
      name: "Booklet",
      description: "Fixture",
      order: 0,
      keyEnv: "DIFY_KEY_FIXTURE",
      workflowId: "00000000-0000-4000-8000-000000000001",
      enabled: true,
      domainAdapter: { id: "booklet", version: "2" },
      responseMode: "raw-v1",
      legacyInputs: [],
      inputs: [],
      pricing: null,
      recovery: null,
    });
    await db.collection("orchestrators").insertOne({
      _id: id as never,
      revision,
      definition,
      validated: true,
      updatedAt: new Date(),
    });
  }
  async function policy(db: Db, orchestratorId: string, extra: object = {}) {
    await db.collection("bookletWorkflowPolicies").insertOne({
      profileId: profile.id,
      profileRevision: profile.revision,
      orchestratorId,
      configurationRevision: 1,
      capacity,
      retryDefaults,
      ...extra,
    });
  }
  async function fixture(credits = 500) {
    const db = client.db("booklet_application_" + ++serial);
    await createCreditIndexes(db);
    await createCatalogIndexes(db);
    await createConsumptionIndexes(db);
    await bookletsServerExtension.indexes!(db);
    await db.collection("accountAccess").insertOne({
      _id: admin.uid as never,
      role: "admin",
      status: "active",
      notBefore: 0,
      revision: 0,
    });
    if (credits)
      await grantCredits(db, owner.uid, "initial", {
        amount: credits,
        source: "purchase",
        reference: "fixture",
      });
    await readSettings(db);
    await db
      .collection("baseSettings")
      .updateOne(
        { _id: "base" as never },
        { $set: { "settings.runs.enabled": true } },
      );
    const catalog = await publish(db, 1, 20);
    await orchestrator(db, "booklet-v2");
    await policy(db, "booklet-v2");
    return { db, catalog, app: bookletApplication(db, owner, { types }) };
  }
  const start = (
    catalog: { id: string; revision: number; hash: string },
    key = randomUUID(),
    overrides: object = {},
  ) => ({
    action: "start",
    key,
    catalogId: catalog.id,
    revision: catalog.revision,
    quoteHash: catalog.hash,
    acceptedCredits: 20,
    title: "The lantern",
    brief,
    ...overrides,
  });
  const charges = (db: Db) =>
    db.collection("consumptionCharges").countDocuments();
  const jobs = (db: Db) => db.collection("aiJobs").countDocuments();
  async function settle(db: Db, runId: string, status: "succeeded" | "failed") {
    const job = await db
      .collection("aiJobs")
      .findOne({ "run.logicalId": runId }, { sort: { createdAt: -1 } });
    await db
      .collection("consumptionWorkflows")
      .updateOne(
        { _id: job!.consumption.workflowId },
        { $set: { jobId: job!._id } },
      );
    await db.collection("aiJobs").updateOne(
      { _id: job!._id },
      {
        $set: {
          status,
          terminationEvidence:
            status === "succeeded" ? "provider-completed" : "provider-failed",
        },
      },
    );
    return job!;
  }

  try {
    await t.test(
      "lists allowlisted packages with owner-bound cursors",
      async () => {
        const { db, app } = await fixture();
        const page = await app.packages();
        assert.equal(page.rows.length, 1);
        const [row] = page.rows;
        assert.equal(row.available, true);
        assert.equal(row.credits, 20);
        for (const hidden of [
          "executionProfileId",
          "execution",
          "canvas",
          "fields",
          "terms",
        ])
          assert.equal(hidden in row, false);
        assert.deepEqual(
          await app.quote({ action: "quote", catalogId: row.catalogId }),
          row,
        );
        const foreign = Buffer.from(
          JSON.stringify({ scope: "other", after: "x" }),
        ).toString("base64url");
        await assert.rejects(
          app.packages({ cursor: foreign }),
          /Invalid pagination cursor/,
        );
        await assert.rejects(
          bookletApplication(db, stranger, { types }).packages({
            cursor: page.next ?? foreign,
          }),
          /Invalid pagination cursor/,
        );
      },
    );

    await t.test(
      "start charges once, snapshots defaults and replays exactly",
      async () => {
        const { db, catalog, app } = await fixture();
        const command = start(catalog);
        const result = await app.start(command);
        assert.deepEqual(await app.start(command), result);
        assert.equal(await charges(db), 1);
        assert.equal(await jobs(db), 1);
        const production = await bookletRepositoryV2(db, owner).getProduction(
          result.productionId,
        );
        assert.deepEqual(production.retryPolicy, retryDefaults);
        assert.equal(production.lifecycleState, "in-progress");
        const job = await db
          .collection("aiJobs")
          .findOne({ "run.logicalId": result.runId });
        assert.equal(job!.credits, 0);
        assert.equal(job!.run.configurationRevision, 1);
        // Later retry-default edits cannot change an in-progress purchase.
        await db.collection("bookletWorkflowPolicies").updateOne(
          {},
          {
            $set: { retryDefaults: { paidLlm: 5, paidImage: 5, nonPaid: 5 } },
          },
        );
        assert.deepEqual(await app.start(command), result);
        assert.deepEqual(
          (
            await bookletRepositoryV2(db, owner).getProduction(
              result.productionId,
            )
          ).retryPolicy,
          retryDefaults,
        );
        await assert.rejects(
          app.start({ ...command, brief: { ...brief, idea: "Changed" } }),
          /Changed order retry/,
        );
        await assert.rejects(
          app.start({ ...command, title: "Changed" }),
          /different input/,
        );
        assert.equal(await charges(db), 1);
      },
    );

    await t.test(
      "explicit consent, changed catalog and brief bounds",
      async () => {
        const { db, catalog, app } = await fixture();
        await assert.rejects(
          app.start(start(catalog, randomUUID(), { acceptedCredits: 19 })),
          /price changed/,
        );
        await assert.rejects(
          app.start(
            start(catalog, randomUUID(), {
              brief: { ...brief, characters: ["a", "b", "c"] },
            }),
          ),
          /exceeds the selected package/,
        );
        const next = await publish(db, 2, 25);
        await assert.rejects(app.start(start(catalog)), /package changed/);
        // Refusals before consent leave no empty owned booklet behind.
        assert.equal(await db.collection("bookletBooks").countDocuments(), 0);
        const fresh = await app.quote({
          action: "quote",
          catalogId: catalog.id,
        });
        assert.equal(fresh.revision, 2);
        assert.equal(fresh.quoteHash, next.hash);
        assert.ok(
          await app.start(start(next, randomUUID(), { acceptedCredits: 25 })),
        );
        assert.equal(
          await db.collection("consumptionOrders").countDocuments(),
          1,
        );
      },
    );

    await t.test(
      "resumes after each committed effect without a second charge",
      async () => {
        // After the queued order only (simulated interruption before production creation).
        {
          const { db, catalog, app } = await fixture();
          const command = start(catalog);
          const bookletId = fingerprint([
            owner.uid,
            "booklet-start-book",
            command.key,
          ]);
          const productionId = fingerprint([
            owner.uid,
            "booklet-start-production",
            command.key,
          ]);
          const base = (
            await import("../../src/lib/server/booklets/repository")
          ).bookletRepository(db, owner);
          await base.createBook({
            id: bookletId,
            title: command.title,
            key: command.key,
          });
          await queueConsumption(
            db,
            owner,
            {
              key: command.key,
              targetId: productionId,
              catalogId: catalog.id,
              revision: catalog.revision,
              quoteHash: catalog.hash,
              inputHash: fingerprint({
                title: command.title,
                brief,
                acceptedCredits: 20,
              }),
            },
            types,
            async () => {},
          );
          // A republish after the order was queued cannot change its frozen terms.
          await publish(db, 2, 99);
          const result = await app.start(command);
          assert.equal(result.productionId, productionId);
          assert.equal(await charges(db), 1);
        }
        // After production creation: the paid start fails for lack of credits, then resumes.
        {
          const { db, catalog, app } = await fixture(0);
          const command = start(catalog);
          await assert.rejects(app.start(command));
          assert.equal(
            await db.collection("bookletProductions").countDocuments(),
            1,
          );
          assert.equal(await charges(db), 0);
          await grantCredits(db, owner.uid, "late", {
            amount: 50,
            source: "purchase",
            reference: "late",
          });
          assert.ok(await app.start(command));
          assert.equal(await charges(db), 1);
        }
        // Disabled Runs refuse before the paid start, so nothing is charged.
        // Then a simulated interruption after the paid start resumes to one Run.
        {
          const { db, catalog, app } = await fixture();
          const command = start(catalog);
          await db
            .collection("baseSettings")
            .updateOne(
              { _id: "base" as never },
              { $set: { "settings.runs.enabled": false } },
            );
          await assert.rejects(app.start(command), /Runs are disabled/);
          assert.equal(await charges(db), 0);
          await db
            .collection("baseSettings")
            .updateOne(
              { _id: "base" as never },
              { $set: { "settings.runs.enabled": true } },
            );
          const productionId = fingerprint([
            owner.uid,
            "booklet-start-production",
            command.key,
          ]);
          await bookletLifecycleV2(db, owner).start(productionId);
          assert.equal(await charges(db), 1);
          assert.equal(await jobs(db), 0);
          const result = await app.start(command);
          assert.equal(await charges(db), 1);
          assert.equal(await jobs(db), 1);
          // An orchestrator upgrade after admission does not break exact replay.
          await db
            .collection("orchestrators")
            .updateOne(
              { _id: "booklet-v2" as never },
              { $set: { revision: 2 } },
            );
          assert.deepEqual(await app.start(command), result);
        }
      },
    );

    await t.test(
      "rejects absent, duplicate and mismatched policy bindings",
      async () => {
        const cases: [string, (db: Db) => Promise<void>][] = [
          [
            "orchestrator requires browser inputs",
            (db) =>
              db
                .collection("orchestrators")
                .updateOne(
                  {},
                  {
                    $set: {
                      "definition.inputs": [
                        { name: "topic", kind: "text", required: true },
                      ],
                    },
                  },
                )
                .then(() => {}),
          ],
          [
            "absent",
            (db) =>
              db
                .collection("bookletWorkflowPolicies")
                .deleteMany({})
                .then(() => {}),
          ],
          [
            "duplicate",
            async (db) => {
              await orchestrator(db, "booklet-v2-b");
              await policy(db, "booklet-v2-b");
            },
          ],
          [
            "capacity mismatch",
            (db) =>
              db
                .collection("bookletWorkflowPolicies")
                .updateOne({}, { $set: { "capacity.revision": 2 } })
                .then(() => {}),
          ],
          [
            "missing retry defaults",
            (db) =>
              db
                .collection("bookletWorkflowPolicies")
                .updateOne({}, { $unset: { retryDefaults: "" } })
                .then(() => {}),
          ],
          [
            "stale configuration",
            (db) =>
              db
                .collection("orchestrators")
                .updateOne({}, { $set: { revision: 2 } })
                .then(() => {}),
          ],
          [
            "oversized package",
            (db) =>
              db
                .collection("bookletWorkflowPolicies")
                .updateOne({}, { $set: { "capacity.maxStoryPages": 2 } })
                .then(() => {}),
          ],
        ];
        for (const [name, change] of cases) {
          const { db, catalog, app } = await fixture();
          await change(db);
          assert.equal((await app.packages()).rows[0].available, false, name);
          await assert.rejects(
            app.quote({ action: "quote", catalogId: catalog.id }),
            /unavailable/,
            name,
          );
          await assert.rejects(
            app.start(start(catalog)),
            /unavailable|exceeds/,
            name,
          );
          assert.equal(
            await db.collection("consumptionOrders").countDocuments(),
            0,
            name,
          );
          assert.equal(await charges(db), 0, name);
        }
      },
    );

    await t.test(
      "owned continuation, retry and revision commands",
      async () => {
        const { db, catalog, app } = await fixture();
        const started = await app.start(start(catalog));
        const id = started.productionId;
        const foreign = bookletApplication(db, stranger, { types });
        await assert.rejects(
          foreign.command(id, { action: "continue", key: randomUUID() }),
          /not found/,
        );
        await assert.rejects(
          foreign.command(id, {
            action: "quote-revision",
            requestId: randomUUID(),
            expectedVersion: 1,
            category: "story",
            subjects: [],
          }),
          /not found/,
        );
        const busy = randomUUID();
        await assert.rejects(
          app.command(id, { action: "continue", key: busy }),
          /still running/,
        );
        assert.equal(await jobs(db), 1);

        // Failed with verified termination: predecessor chaining keeps the logical Run.
        await settle(db, started.runId, "failed");
        const key = randomUUID();
        const chained = await app.command(id, { action: "continue", key });
        assert.deepEqual(chained, { productionId: id, runId: started.runId });
        assert.deepEqual(
          await app.command(id, { action: "continue", key }),
          chained,
        );
        assert.equal(await jobs(db), 2);
        assert.equal(await charges(db), 1);

        // Verified success: a fresh logical Run against the same production.
        await settle(db, started.runId, "succeeded");
        const fresh = (await app.command(id, {
          action: "continue",
          key: randomUUID(),
        })) as { runId: string };
        assert.notEqual(fresh.runId, started.runId);
        assert.equal(await charges(db), 1);

        // Retry needs a confirmed retriable failure after automatic allowance.
        await assert.rejects(
          app.command(id, {
            action: "retry",
            key: randomUUID(),
            callId: "missing",
          }),
          /not found/,
        );

        // Revision: quote binds scope; consent must match; exact replay.
        await settle(db, fresh.runId, "succeeded");
        const version = (await bookletRepositoryV2(db, owner).getProduction(id))
          .version;
        const scope = {
          requestId: randomUUID(),
          expectedVersion: version,
          category: "story" as const,
          subjects: [],
        };
        const quote = (await app.command(id, {
          action: "quote-revision",
          ...scope,
        })) as { quoteHash: string; credits: number };
        assert.equal(quote.credits, 0);
        await assert.rejects(
          app.command(id, {
            action: "start-revision",
            ...scope,
            quoteHash: quote.quoteHash,
            acceptedCredits: 1,
          }),
          /Refresh the revision quote/,
        );
        const revision = await app.command(id, {
          action: "start-revision",
          ...scope,
          quoteHash: quote.quoteHash,
          acceptedCredits: 0,
        });
        assert.deepEqual(
          await app.command(id, {
            action: "start-revision",
            ...scope,
            quoteHash: quote.quoteHash,
            acceptedCredits: 0,
          }),
          revision,
        );
        await assert.rejects(
          app.command(id, { action: "continue", key: "not-a-uuid" }),
        );
      },
    );
  } finally {
    await client.close();
    await mongo.stop({ doCleanup: true, force: true });
    if (previous.mode === undefined) delete process.env.DIFY_MODE;
    else process.env.DIFY_MODE = previous.mode;
    if (previous.key === undefined) delete process.env.DIFY_KEY_FIXTURE;
    else process.env.DIFY_KEY_FIXTURE = previous.key;
  }
});
