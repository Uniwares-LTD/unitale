import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Binary, MongoClient, type Db } from "mongodb";
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
import { enqueueBookletRun } from "../../src/lib/server/booklets/runs";
import {
  bookletAdminView,
  updateBookletRetryDefaults,
} from "../../src/lib/server/booklets/admin";
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
        // Domain picker: owned live books with a current production only.
        assert.deepEqual(await app.picker(), {
          rows: [{ id: result.productionId, title: "The lantern" }],
          next: null,
        });
        assert.deepEqual((await app.picker({ search: "lant" })).rows.length, 1);
        assert.deepEqual((await app.picker({ search: "(.*" })).rows, []);
        assert.deepEqual(
          (await bookletApplication(db, stranger, { types }).picker()).rows,
          [],
        );
        await assert.rejects(
          app.picker({ cursor: "bm90LWEtY3Vyc29y" }),
          /Invalid pagination cursor/,
        );
      },
    );

    await t.test(
      "owned view shows only selected results and media never leaks",
      async () => {
        const { db, catalog, app } = await fixture();
        const { productionId } = await app.start(start(catalog));
        const other = await app.start(start(catalog));
        // Synthetic saved state (Manager writes are covered by MCP suites).
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          "base64",
        );
        const sha256 = createHash("sha256").update(png).digest("hex");
        const art = (
          id: string,
          kind: string,
          current: string | null,
          accepted: string | null,
        ) => ({
          id,
          kind,
          currentRevisionId: current,
          acceptedRevisionId: accepted,
        });
        await db.collection("bookletProductions").updateOne(
          { _id: productionId as never },
          {
            $set: {
              subjects: [
                {
                  id: "cover",
                  kind: "page",
                  label: "Cover",
                  pageRole: "cover",
                  artifacts: [
                    art("cover-image", "page-image", "rev-cover", "rev-cover"),
                  ],
                },
                {
                  id: "page-1",
                  kind: "page",
                  label: "Page 1",
                  pageRole: "story",
                  artifacts: [
                    art("page-1-image", "page-image", "rev-draft", null),
                  ],
                },
              ],
            },
          },
        );
        await db.collection("bookletRevisions").insertMany([
          {
            _id: "rev-cover" as never,
            ownerId: owner.uid,
            productionId,
            artifactId: "cover-image",
            documentVersion: 2,
            assets: [{ assetId: "asset-cover", sha256 }],
          },
          {
            _id: "rev-draft" as never,
            ownerId: owner.uid,
            productionId,
            artifactId: "page-1-image",
            documentVersion: 2,
            assets: [{ assetId: "asset-draft", sha256 }],
          },
        ]);
        const asset = (
          id: string,
          state: string,
          production = productionId,
        ) => ({
          _id: id as never,
          documentVersion: 1,
          ownerId: owner.uid,
          productionId: production,
          operationId: "op",
          outputKey: id,
          inputHash: sha256,
          sha256,
          bytes: png.length,
          mime: "image/png",
          width: 1,
          height: 1,
          state,
          storage: { kind: "mongo" },
          sourceRevisions: [],
          originalAssetId: null,
          attachments: [],
          fence: 1,
          createdAt: new Date(),
        });
        await db
          .collection("bookletAssets")
          .insertMany([
            asset("asset-cover", "ready"),
            asset("asset-draft", "ready"),
            asset("asset-staging", "staging"),
          ]);
        await db.collection("bookletAssetBytes").insertMany(
          ["asset-cover", "asset-draft", "asset-staging"].map((assetId) => ({
            _id: (assetId + ":0") as never,
            assetId,
            index: 0,
            sha256,
            bytes: new Binary(png),
          })),
        );

        const view = await app.view(productionId);
        assert.deepEqual(Object.keys(view).sort(), [
          "actions",
          "bookletId",
          "completed",
          "expiresAt",
          "pages",
          "predecessorId",
          "productionId",
          "stages",
          "state",
          "subjects",
          "title",
          "version",
        ]);
        assert.equal(JSON.stringify(view).includes("lantern learns"), false);
        assert.deepEqual(view.pages, { accepted: 1, total: 5 });
        assert.equal(view.state, "in-progress");
        const [cover, page] = view.subjects;
        assert.equal(cover.artifacts[0].status, "selected");
        assert.deepEqual(cover.artifacts[0].images, [
          {
            assetId: "asset-cover",
            url: `/api/booklets/${productionId}/assets/asset-cover`,
          },
        ]);
        // A current draft is in progress, never presented as a selected result.
        assert.equal(page.artifacts[0].status, "in-progress");
        assert.deepEqual(page.artifacts[0].images, []);

        const original = await app.original(productionId, "asset-cover");
        assert.equal(original.mime, "image/png");
        assert.ok(original.bytes.equals(png));
        const strangerApp = bookletApplication(db, stranger, { types });
        await assert.rejects(strangerApp.view(productionId), /not found/);
        await assert.rejects(
          strangerApp.original(productionId, "asset-cover"),
          /not found/,
        );
        // Another owned production cannot read this production's media.
        await assert.rejects(
          app.original(other.productionId, "asset-cover"),
          /not found/,
        );
        await assert.rejects(
          app.original(productionId, "asset-staging"),
          /not found/,
        );
        await assert.rejects(
          app.original(productionId, "missing"),
          /not found/,
        );
      },
    );

    await t.test(
      "recovery and revision actions never replay or double charge",
      async () => {
        const { db, catalog, app } = await fixture();
        const started = await app.start(start(catalog));
        const id = started.productionId;
        // Active Run: Manager keeps control; no continue or revision offered.
        let actions = (await app.view(id)).actions;
        assert.deepEqual(
          {
            running: actions.running,
            continue: actions.continue,
            revisions: actions.revisions,
          },
          { running: true, continue: false, revisions: [] },
        );
        assert.equal(actions.retry, null);
        // A confirmed retriable failure after its automatic allowance is offered.
        await db.collection("bookletWork").insertOne({
          ownerId: owner.uid,
          productionId: id,
          callId: "failed-call",
          actionKey: "a1",
          status: "failed",
          retryable: true,
          category: "paidLlm",
          retryOrdinal: 1,
          updatedAt: new Date(),
        });
        assert.deepEqual((await app.view(id)).actions.retry, {
          callId: "failed-call",
        });

        // Verified failure: two concurrent Continue clicks (different keys)
        // admit exactly one new attempt.
        await settle(db, started.runId, "failed");
        actions = (await app.view(id)).actions;
        assert.equal(actions.continue, true);
        assert.ok(actions.revisions.some((r) => r.category === "story"));
        const before = await jobs(db);
        const clicks = await Promise.allSettled([
          app.command(id, { action: "continue", key: randomUUID() }),
          app.command(id, { action: "continue", key: randomUUID() }),
        ]);
        assert.equal(clicks.filter((c) => c.status === "fulfilled").length, 1);
        assert.equal(await jobs(db), before + 1);
        assert.equal(await charges(db), 1);

        // Revision: exact replay returns the same Run; a second request while
        // that Run is active is refused without another charge.
        await settle(db, started.runId, "succeeded");
        const version = (await app.view(id)).version;
        const scope = {
          requestId: randomUUID(),
          expectedVersion: version,
          category: "page" as const,
          subjects: [],
        };
        await assert.rejects(
          app.command(id, { action: "quote-revision", ...scope }),
        );
        const story = { ...scope, category: "story" as const };
        const quote = (await app.command(id, {
          action: "quote-revision",
          ...story,
        })) as { quoteHash: string; credits: number };
        const command = {
          action: "start-revision" as const,
          ...story,
          quoteHash: quote.quoteHash,
          acceptedCredits: quote.credits,
        };
        const revision = await app.command(id, command);
        assert.deepEqual(await app.command(id, command), revision);
        const chargesAfter = await charges(db);
        await assert.rejects(
          app.command(id, {
            ...command,
            requestId: randomUUID(),
          }),
        );
        assert.equal(await charges(db), chargesAfter);
        assert.equal((await app.view(id)).actions.running, true);

        // A completed booklet cannot be continued (no successful-work replay).
        await db
          .collection("bookletProductions")
          .updateOne(
            { _id: id as never },
            { $set: { lifecycleState: "completed" } },
          );
        await settle(db, (revision as { runId: string }).runId, "succeeded");
        actions = (await app.view(id)).actions;
        assert.equal(actions.continue, false);
        await assert.rejects(
          app.command(id, { action: "continue", key: randomUUID() }),
          /Only unfinished production can continue/,
        );
      },
    );

    await t.test(
      "owned history pages beyond one page and rejects foreign cursors",
      async () => {
        const { db, catalog, app } = await fixture();
        const { productionId } = await app.start(start(catalog));
        const other = await app.start(start(catalog));
        const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i));
        await db.collection("aiJobs").insertMany(
          Array.from({ length: 21 }, (_, i) => ({
            _id: `job-${String(i).padStart(2, "0")}` as never,
            uid: owner.uid,
            runId: "native-secret",
            status: i === 0 ? "unknown" : "failed",
            createdAt: at(i),
            run: {
              logicalId: `run-${i}`,
              target: { adapter: "booklet", version: "2", id: productionId },
            },
          })),
        );
        const first = await app.history(productionId, { kind: "runs" });
        assert.equal(first.kind, "runs");
        assert.equal(first.items.length, 20);
        assert.ok(first.next);
        assert.equal(JSON.stringify(first).includes("native-secret"), false);
        assert.ok(first.items.some((item) => item.status === "confirming"));
        const second = await app.history(productionId, {
          kind: "runs",
          cursor: first.next,
        });
        assert.equal(second.items.length, 2);
        assert.equal(second.next, null);
        // Cursors are owner/production/query scoped; malformed text is input.
        await assert.rejects(
          app.history(other.productionId, { kind: "runs", cursor: first.next }),
          /cursor belongs to another query/,
        );
        await assert.rejects(
          app.history(productionId, { kind: "runs", cursor: "%%%" }),
          (error: unknown) => (error as { status?: number }).status === 400,
        );
        await assert.rejects(
          app.history(productionId, { kind: "secrets" }),
          (error: unknown) => (error as { status?: number }).status === 400,
        );
        await assert.rejects(
          bookletApplication(db, stranger, { types }).history(productionId, {
            kind: "runs",
          }),
          /not found/,
        );
        await assert.rejects(app.view("../bad id"), /not found/);

        // Artifact revisions: selected and current versus historical.
        await db.collection("bookletProductions").updateOne(
          { _id: productionId as never },
          {
            $set: {
              subjects: [
                {
                  id: "book",
                  kind: "book",
                  label: "Book",
                  pageRole: null,
                  artifacts: [
                    {
                      id: "outline",
                      kind: "outline",
                      currentRevisionId: "rev-21",
                      acceptedRevisionId: "rev-20",
                    },
                  ],
                },
              ],
            },
          },
        );
        await db.collection("bookletRevisions").insertMany(
          Array.from({ length: 21 }, (_, i) => ({
            _id: `rev-${i + 1}` as never,
            ownerId: owner.uid,
            productionId,
            artifactId: "outline",
            documentVersion: 2,
            ordinal: i + 1,
            kind: "outline",
            contentHash: "a".repeat(64),
            createdAt: at(i),
          })),
        );
        const revisions = await app.history(productionId, {
          kind: "revisions",
          artifactId: "outline",
        });
        assert.equal(revisions.items.length, 20);
        assert.ok(revisions.next);
        const rest = await app.history(productionId, {
          kind: "revisions",
          artifactId: "outline",
          cursor: revisions.next,
        });
        assert.deepEqual(
          rest.kind === "revisions" &&
            rest.items.map((item) => [
              item.revisionId,
              item.selected,
              item.current,
            ]),
          [["rev-21", false, true]],
        );
        assert.equal(
          revisions.kind === "revisions" &&
            revisions.items.find((item) => item.revisionId === "rev-20")
              ?.selected,
          true,
        );
        await assert.rejects(
          app.history(productionId, {
            kind: "revisions",
            artifactId: "missing",
          }),
          /not found/,
        );
        const versions = await app.history(productionId, { kind: "versions" });
        assert.deepEqual(
          versions.items.map((item) => (item as { current: boolean }).current),
          [true],
        );
      },
    );

    await t.test(
      "administration edits only retry defaults for new productions",
      async () => {
        const { db, catalog, app } = await fixture();
        const before = await app.start(start(catalog));
        await db.collection("bookletWorkflowPolicies").updateOne(
          {},
          {
            $set: {
              suite: { managerWorkflowId: "provider-secret-suite" },
              reviewer: {
                id: "reviewer",
                revision: 2,
                publicationId: "11111111-1111-4111-8111-111111111111",
              },
            },
          },
        );
        const adminActor = { uid: admin.uid, auth_time: 1 };
        await assert.rejects(
          bookletAdminView(db, { uid: owner.uid, auth_time: 1 }),
          /Administrator access is required/,
        );
        const view = await bookletAdminView(db, adminActor);
        assert.equal(view.policies.length, 1);
        const [row] = view.policies;
        assert.deepEqual(row.retryDefaults, retryDefaults);
        assert.equal(row.current, true);
        assert.deepEqual(row.reviewer, { id: "reviewer", revision: 2 });
        for (const secret of ["provider-secret-suite", "11111111-1111"])
          assert.equal(JSON.stringify(view).includes(secret), false);
        const next = { paidLlm: 4, paidImage: 1, nonPaid: 5 };
        await assert.rejects(
          updateBookletRetryDefaults(db, adminActor, {
            policyId: row.id,
            expectedVersion: row.retryDefaultsVersion,
            next: { ...next, paidLlm: 11 },
          }),
          (error: unknown) => (error as { status?: number }).status === 400,
        );
        await assert.rejects(
          updateBookletRetryDefaults(
            db,
            { uid: owner.uid, auth_time: 1 },
            {
              policyId: row.id,
              expectedVersion: row.retryDefaultsVersion,
              next,
            },
          ),
          /Administrator access is required/,
        );
        assert.equal(row.retryDefaultsState, "valid");
        await updateBookletRetryDefaults(db, adminActor, {
          policyId: row.id,
          expectedVersion: row.retryDefaultsVersion,
          next,
        });
        // A stale second edit (based on the old values) conflicts.
        await assert.rejects(
          updateBookletRetryDefaults(db, adminActor, {
            policyId: row.id,
            expectedVersion: row.retryDefaultsVersion,
            next: { paidLlm: 0, paidImage: 0, nonPaid: 0 },
          }),
          (error: unknown) => (error as { status?: number }).status === 409,
        );
        const stored = await db
          .collection("bookletWorkflowPolicies")
          .findOne({});
        assert.deepEqual(stored!.retryDefaults, next);
        assert.equal(stored!.suite.managerWorkflowId, "provider-secret-suite");
        assert.deepEqual(stored!.capacity, capacity);
        assert.equal(
          await db
            .collection("auditEvents")
            .countDocuments({ event: "booklet-retry-defaults-updated" }),
          1,
        );
        // Existing productions keep their snapshot; new ones take the new defaults.
        const repo = bookletRepositoryV2(db, owner);
        assert.deepEqual(
          (await repo.getProduction(before.productionId)).retryPolicy,
          retryDefaults,
        );
        const after = await app.start(start(catalog));
        assert.deepEqual(
          (await repo.getProduction(after.productionId)).retryPolicy,
          next,
        );

        // A malformed stored value is shown as invalid and can be repaired.
        await db
          .collection("bookletWorkflowPolicies")
          .updateOne({}, { $set: { retryDefaults: { paidLlm: "two" } } });
        const broken = (await bookletAdminView(db, adminActor)).policies[0];
        assert.equal(broken.retryDefaultsState, "invalid");
        assert.equal(broken.retryDefaults, null);
        await updateBookletRetryDefaults(db, adminActor, {
          policyId: broken.id,
          expectedVersion: broken.retryDefaultsVersion,
          next: retryDefaults,
        });
        assert.equal(
          (await bookletAdminView(db, adminActor)).policies[0]
            .retryDefaultsState,
          "valid",
        );
        // String row identities work as well as ObjectIds.
        await db.collection("bookletWorkflowPolicies").insertOne({
          _id: "binding-string-id" as never,
          profileId: "other",
          profileRevision: 1,
          orchestratorId: "other",
          configurationRevision: 1,
        });
        const stringRow = (
          await bookletAdminView(db, adminActor)
        ).policies.find((p) => p.id === "binding-string-id")!;
        assert.equal(stringRow.retryDefaultsState, "missing");
        await updateBookletRetryDefaults(db, adminActor, {
          policyId: stringRow.id,
          expectedVersion: stringRow.retryDefaultsVersion,
          next: retryDefaults,
        });
        assert.deepEqual(
          (await db
            .collection("bookletWorkflowPolicies")
            .findOne({ _id: "binding-string-id" as never }))!.retryDefaults,
          retryDefaults,
        );
        await assert.rejects(
          updateBookletRetryDefaults(db, adminActor, {
            policyId: "missing-binding",
            expectedVersion: stringRow.retryDefaultsVersion,
            next: retryDefaults,
          }),
          (error: unknown) => (error as { status?: number }).status === 404,
        );
      },
    );

    await t.test(
      "a committed continuation refused at Run admission resumes by key or Resume, never a new key",
      async () => {
        const { db, catalog, app } = await fixture();
        const started = await app.start(start(catalog));
        await settle(db, started.runId, "failed");
        const runs = (enabled: boolean) =>
          db
            .collection("baseSettings")
            .updateOne(
              { _id: "base" as never },
              { $set: { "settings.runs.enabled": enabled } },
            );
        await runs(false);
        const key = randomUUID();
        await assert.rejects(
          app.command(started.productionId, { action: "continue", key }),
          (error: unknown) =>
            (error as { code?: string }).code === "BOOKLET_START_PENDING",
        );
        await runs(true);
        // A different key is refused while the committed flow is unbound.
        await assert.rejects(
          app.command(started.productionId, {
            action: "continue",
            key: randomUUID(),
          }),
        );
        // After a reload the browser has lost the key: the view offers Resume
        // (not Continue or revisions), which needs no key.
        const actions = (await app.view(started.productionId)).actions;
        assert.equal(actions.resume, true);
        assert.equal(actions.continue, false);
        assert.deepEqual(actions.revisions, []);
        const before = await jobs(db);
        const resumed = await app.command(started.productionId, {
          action: "resume",
        });
        assert.deepEqual(resumed, {
          productionId: started.productionId,
          runId: started.runId,
        });
        // Resume and the original key converge on the same single Run.
        assert.deepEqual(
          await app.command(started.productionId, { action: "resume" }),
          resumed,
        );
        assert.deepEqual(
          await app.command(started.productionId, { action: "continue", key }),
          resumed,
        );
        assert.equal(await jobs(db), before + 1);
        assert.equal(await charges(db), 1);
        assert.equal(
          (await app.view(started.productionId)).actions.resume,
          false,
        );
      },
    );

    await t.test(
      "resume finds a Run admitted under any key and never duplicates it",
      async () => {
        const { db, catalog, app } = await fixture();
        const started = await app.start(start(catalog));
        await settle(db, started.runId, "failed");
        // A continuation flow admitted directly under an unrelated key.
        const flow = await bookletLifecycleV2(db, owner).continue(
          started.productionId,
          randomUUID(),
        );
        const job = await db
          .collection("aiJobs")
          .findOne({ "run.logicalId": started.runId });
        await enqueueBookletRun(db, owner, started.productionId, {
          key: "other-key",
          workflowId: flow,
          orchestratorId: "booklet-v2",
          configurationRevision: 1,
          inputs: {},
          predecessorId: String(job!._id),
        });
        assert.equal(
          (await app.view(started.productionId)).actions.resume,
          false,
        );
        const before = await jobs(db);
        assert.deepEqual(
          await app.command(started.productionId, { action: "resume" }),
          { productionId: started.productionId, runId: started.runId },
        );
        assert.equal(await jobs(db), before);
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
        // Simulated interruption after the book and queued order were committed.
        async function queueOnly(
          db: Db,
          catalog: { id: string; revision: number; hash: string },
          command: ReturnType<typeof start>,
        ) {
          const base = (
            await import("../../src/lib/server/booklets/repository")
          ).bookletRepository(db, owner);
          await base.createBook({
            id: fingerprint([owner.uid, "booklet-start-book", command.key]),
            title: command.title,
            key: command.key,
          });
          await queueConsumption(
            db,
            owner,
            {
              key: command.key,
              targetId: fingerprint([
                owner.uid,
                "booklet-start-production",
                command.key,
              ]),
              catalogId: catalog.id,
              revision: catalog.revision,
              quoteHash: catalog.hash,
              inputHash: fingerprint({
                title: command.title,
                brief,
                acceptedCredits: command.acceptedCredits,
              }),
            },
            types,
            async () => {},
          );
        }
        const runsSetting = (db: Db) => (enabled: boolean) =>
          db
            .collection("baseSettings")
            .updateOne(
              { _id: "base" as never },
              { $set: { "settings.runs.enabled": enabled } },
            );
        // After the queued order only: a republish cannot change frozen terms.
        {
          const { db, catalog, app } = await fixture();
          const command = start(catalog);
          await queueOnly(db, catalog, command);
          await publish(db, 2, 99);
          const result = await app.start(command);
          assert.equal(
            result.productionId,
            fingerprint([owner.uid, "booklet-start-production", command.key]),
          );
          assert.equal(await charges(db), 1);
        }
        // First attempts refuse before anything exists (credits or Runs).
        {
          const { db, catalog, app } = await fixture(0);
          const command = start(catalog);
          await assert.rejects(app.start(command), /not enough available/);
          await grantCredits(db, owner.uid, "late", {
            amount: 50,
            source: "purchase",
            reference: "late",
          });
          await runsSetting(db)(false);
          await assert.rejects(
            app.start(command),
            (error: unknown) =>
              (error as { code?: string }).code === "BOOKLET_CONFLICT" &&
              /Runs are disabled/.test((error as Error).message),
          );
          assert.equal(await db.collection("bookletBooks").countDocuments(), 0);
          assert.equal(await charges(db), 0);
          await runsSetting(db)(true);
          assert.ok(await app.start(command));
          assert.equal(await charges(db), 1);
        }
        // Once the draft exists, refusals keep the request (never editable);
        // the unpaid draft is hidden; after the paid start, Resume needs no key.
        {
          const { db, catalog, app } = await fixture();
          const command = start(catalog);
          const runs = runsSetting(db);
          await queueOnly(db, catalog, command);
          await runs(false);
          await assert.rejects(
            app.start(command),
            (error: unknown) =>
              (error as { code?: string }).code === "BOOKLET_START_PENDING" &&
              /Runs are disabled/.test((error as Error).message),
          );
          assert.equal(
            await db.collection("bookletProductions").countDocuments(),
            1,
          );
          assert.equal(await charges(db), 0);
          assert.deepEqual((await app.picker()).rows, []);
          await runs(true);
          const productionId = fingerprint([
            owner.uid,
            "booklet-start-production",
            command.key,
          ]);
          await bookletLifecycleV2(db, owner).start(productionId);
          assert.equal(await charges(db), 1);
          assert.equal(await jobs(db), 0);
          await runs(false);
          await assert.rejects(
            app.start(command),
            (error: unknown) =>
              (error as { code?: string }).code === "BOOKLET_START_PENDING",
          );
          await runs(true);
          assert.equal((await app.view(productionId)).actions.resume, true);
          const result = await app.command(productionId, { action: "resume" });
          assert.deepEqual(await app.start(command), result);
          assert.deepEqual(
            await app.command(productionId, { action: "resume" }),
            result,
          );
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
        // Balance race after the draft exists: the paid start's refusal keeps
        // the request; topping up starts it once; nothing is orphaned.
        {
          const { db, catalog, app } = await fixture(20);
          const first = start(catalog);
          await queueOnly(db, catalog, first);
          await app.start(start(catalog)); // spends the whole balance
          await assert.rejects(
            app.start(first),
            (error: unknown) =>
              (error as { code?: string }).code === "BOOKLET_START_PENDING" &&
              /not enough/i.test((error as Error).message),
          );
          assert.equal(await charges(db), 1);
          assert.equal((await app.picker()).rows.length, 1);
          await grantCredits(db, owner.uid, "top-up", {
            amount: 20,
            source: "purchase",
            reference: "top-up",
          });
          assert.ok(await app.start(first));
          assert.equal(await charges(db), 2);
          assert.equal((await app.picker()).rows.length, 2);
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
