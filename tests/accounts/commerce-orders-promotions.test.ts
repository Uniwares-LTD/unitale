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
  createCatalogIndexes,
  publishedCatalog,
} from "../../src/lib/server/commerce/catalogs";
import {
  queueConsumption,
  startConsumption,
  continueConsumption,
  quoteRevision,
  startRevision,
  lockRevisionCategories,
  abandonUnboundWorkflow,
  finishConsumptionWorkflow,
  resolveConsumptionWorkflow,
  closeConsumption,
  refundConsumption,
  getConsumptionOrder,
  createConsumptionIndexes,
} from "../../src/lib/server/commerce/orders";
import {
  reservePromotion,
  resolvePromotionCode,
  recordVerifiedPayment,
  finalizePromotion,
  releasePromotion,
  createPromotionIndexes,
} from "../../src/lib/server/commerce/promotions";
import {
  createCreditIndexes,
  grantCredits,
  readWallet,
} from "../../src/lib/server/store/credits";
import {
  createAiJob,
  settleAiJob,
  aiJobs,
  claimAiJob,
} from "../../src/lib/server/ai/jobs";
import { retainEvidence } from "../../src/lib/server/execution/measurements";

const admin = { uid: "admin", authTime: 1 };
const actor = { uid: "owner", authTime: 1 };
const types = [
  {
    id: "booklet",
    schemaVersion: 1,
    fields: z.strictObject({ pages: z.number().int().min(1).max(10) }),
  },
];
const admission = async () => {};
const inputHash = "a".repeat(64);
test("consumption and promotion transactions", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  let seq = 0;
  async function fixture() {
    const db = client.db("commerce_" + ++seq);
    await createCreditIndexes(db);
    await createCatalogIndexes(db);
    await createConsumptionIndexes(db);
    await createPromotionIndexes(db);
    const migration = coreMigrations.find(
      (entry) => entry.id === "core:0002-consumption-promotions",
    );
    assert.ok(migration);
    await migration.run(db);
    await migration.run(db);
    await db
      .collection<{
        _id: string;
        role?: string;
        status: string;
        notBefore?: number;
        revision?: number;
      }>("accountAccess")
      .insertOne({
        _id: admin.uid,
        role: "admin",
        status: "active",
        notBefore: 0,
        revision: 0,
      });
    await grantCredits(db, actor.uid, "initial", {
      amount: 500,
      source: "purchase",
      reference: "initial",
    });
    return db;
  }
  async function publish(
    db: ReturnType<typeof client.db>,
    definition: unknown,
  ) {
    const saved = await saveCatalogDraft(
      db,
      { uid: admin.uid, auth_time: 1 },
      definition,
      0,
      types,
    );
    const preview = await previewCatalog(
      db,
      { uid: admin.uid, auth_time: 1 },
      saved.id,
      types,
    );
    return publishCatalog(
      db,
      { uid: admin.uid, auth_time: 1 },
      saved.id,
      1,
      preview.hash,
      types,
    );
  }
  async function product(db: ReturnType<typeof client.db>) {
    return publish(db, {
      kind: "consumption",
      terms: {
        identity: { id: "book", revision: 1, schemaVersion: 1 },
        productType: "booklet",
        productSchemaVersion: 1,
        credits: 50,
        entitlementDays: null,
        allowances: [
          { category: "story", unit: "request", included: 1, extraCredits: 5 },
          { category: "page", unit: "subject", included: 1, extraCredits: 15 },
        ],
      },
      fields: { pages: 3 },
    });
  }
  async function queued(db: ReturnType<typeof client.db>) {
    const pub = await product(db);
    const request = {
      key: "purchase",
      targetId: "production",
      catalogId: pub.id,
      revision: 1,
      quoteHash: pub.hash,
      inputHash,
    };
    const order = await queueConsumption(db, actor, request, types, admission);
    return { order, request };
  }
  async function started(db: ReturnType<typeof client.db>) {
    const { order } = await queued(db);
    const start = await startConsumption(
      db,
      actor,
      order._id,
      "initial",
      admission,
    );
    await abandonUnboundWorkflow(db, actor, order._id, start.workflowId);
    return order._id;
  }
  async function revise(
    db: ReturnType<typeof client.db>,
    catalogId: string,
    change: (definition: Record<string, unknown>) => unknown,
  ) {
    const old = await publishedCatalog(db, catalogId);
    assert.ok(old);
    const definition = change(
      structuredClone(old.definition) as unknown as Record<string, unknown>,
    );
    await saveCatalogDraft(
      db,
      { uid: admin.uid, auth_time: 1 },
      definition,
      old.revision,
      types,
    );
    const preview = await previewCatalog(
      db,
      { uid: admin.uid, auth_time: 1 },
      catalogId,
      types,
    );
    return publishCatalog(
      db,
      { uid: admin.uid, auth_time: 1 },
      catalogId,
      old.revision + 1,
      preview.hash,
      types,
    );
  }
  const jobRequest = {
    capability: "fixture",
    capabilityVersion: "1",
    binding: {
      name: "fixture",
      revision: "1",
      kind: "workflow" as const,
      mode: "fake" as const,
      fingerprint: "fixture",
    },
    inputs: {},
    source: { type: "booklet", id: "production", version: "1" },
    credits: 0,
  };
  try {
    await t.test(
      "queue cancellation is free; retries freeze terms and reject changed payloads",
      async () => {
        const db = await fixture();
        const { order, request } = await queued(db);
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
        assert.equal(
          (await queueConsumption(db, actor, request, types, admission))._id,
          order._id,
        );
        await assert.rejects(
          queueConsumption(
            db,
            actor,
            { ...request, inputHash: "b".repeat(64) },
            types,
            admission,
          ),
        );
        await assert.rejects(
          queueConsumption(
            db,
            actor,
            { ...request, key: "different" },
            types,
            admission,
          ),
        );
        await closeConsumption(db, actor, order._id);
        await assert.rejects(
          startConsumption(db, actor, order._id, "start", admission),
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
      },
    );
    await t.test(
      "admission failure rolls back debit; concurrent starts charge only once",
      async () => {
        const db = await fixture();
        const { order } = await queued(db);
        await assert.rejects(
          startConsumption(db, actor, order._id, "start", async () => {
            throw Error("capacity");
          }),
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
        const results = await Promise.all([
          startConsumption(db, actor, order._id, "start", admission),
          startConsumption(db, actor, order._id, "start", admission),
        ]);
        assert.equal(results[0].workflowId, results[1].workflowId);
        assert.equal((await readWallet(db, actor.uid)).balance, 450);
        assert.equal(
          await db
            .collection("creditLedger")
            .countDocuments({ kind: "deduction" }),
          1,
        );
        await assert.rejects(
          startConsumption(db, actor, order._id, "other", admission),
        );
        await assert.rejects(
          getConsumptionOrder(db, { uid: "foreign", authTime: 1 }, order._id),
        );
        await assert.rejects(
          continueConsumption(
            db,
            actor,
            order._id,
            "busy",
            inputHash,
            admission,
          ),
        );
      },
    );
    await t.test(
      "prepaid job never reserves or settles another charge; unknown outcomes remain locked",
      async () => {
        const db = await fixture();
        const { order } = await queued(db);
        const start = await startConsumption(
          db,
          actor,
          order._id,
          "start",
          admission,
        );
        const consumption = {
          orderId: order._id,
          workflowId: start.workflowId,
        };
        await assert.rejects(
          createAiJob(db, actor, "charged-job", {
            ...jobRequest,
            credits: 5,
            consumption,
          }),
        );
        await assert.rejects(
          createAiJob(db, actor, "foreign-target", {
            ...jobRequest,
            source: null,
            consumption,
          }),
        );
        const job = await createAiJob(db, actor, "job", {
          ...jobRequest,
          consumption,
        });
        assert.equal(job.reservationId, null);
        await assert.rejects(
          createAiJob(db, actor, "duplicate-job", {
            ...jobRequest,
            consumption,
          }),
        );
        await aiJobs(db).updateOne(
          { _id: job._id },
          { $set: { status: "unknown" } },
        );
        await assert.rejects(
          finishConsumptionWorkflow(db, actor, order._id, start.workflowId),
        );
        await assert.rejects(
          abandonUnboundWorkflow(db, actor, order._id, start.workflowId),
        );
        await aiJobs(db).updateOne(
          { _id: job._id },
          { $set: { status: "queued" } },
        );
        const claimed = await claimAiJob(db);
        assert.ok(claimed);
        await settleAiJob(db, claimed, "cancelled");
        await finishConsumptionWorkflow(db, actor, order._id, start.workflowId);
        const continuation = await continueConsumption(
          db,
          actor,
          order._id,
          "next",
          inputHash,
          admission,
        );
        assert.ok(continuation);
        assert.equal((await readWallet(db, actor.uid)).balance, 450);
        assert.equal(
          (await getConsumptionOrder(db, actor, order._id)).value
            .chargedCredits,
          50,
        );
      },
    );
    await t.test(
      "revision retries allocate once; per-subject allowances and quoted paid extras are exact",
      async () => {
        const db = await fixture();
        const orderId = await started(db);
        const input = {
          requestId: "revision-1",
          category: "page",
          subjects: ["p1", "p2"],
          inputHash,
        };
        const quote = await quoteRevision(db, actor, orderId, input);
        assert.equal(quote.credits, 0);
        const flow = await startRevision(
          db,
          actor,
          orderId,
          input,
          quote.hash,
          quote.credits,
          admission,
        );
        assert.equal(
          await startRevision(
            db,
            actor,
            orderId,
            input,
            quote.hash,
            0,
            admission,
          ),
          flow,
        );
        assert.equal(
          await db.collection("consumptionAllocations").countDocuments({}),
          2,
        );
        await abandonUnboundWorkflow(db, actor, orderId, flow);
        const next = {
          ...input,
          requestId: "revision-2",
          subjects: ["p1", "p3"],
        };
        const extra = await quoteRevision(db, actor, orderId, next);
        assert.equal(extra.credits, 15);
        await assert.rejects(
          startRevision(db, actor, orderId, next, extra.hash, 0, admission),
        );
        const paid = await startRevision(
          db,
          actor,
          orderId,
          next,
          extra.hash,
          extra.credits,
          admission,
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 435);
        await abandonUnboundWorkflow(db, actor, orderId, paid);
        await refundConsumption(
          db,
          admin,
          actor.uid,
          paid,
          "revision-refund",
          15,
          "Failed output",
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 450);
        assert.equal(
          await db
            .collection("consumptionAllocations")
            .countDocuments({ chargeId: paid, revoked: true }),
          2,
        );
      },
    );
    await t.test(
      "stage locks block even paid revisions; concurrent quotes cannot double allocate",
      async () => {
        const db = await fixture();
        const orderId = await started(db);
        const input = {
          requestId: "one",
          category: "story",
          subjects: [],
          inputHash,
        };
        const quote = await quoteRevision(db, actor, orderId, input);
        const attempts = await Promise.allSettled([
          startRevision(db, actor, orderId, input, quote.hash, 0, admission),
          startRevision(
            db,
            actor,
            orderId,
            { ...input, requestId: "two" },
            quote.hash,
            0,
            admission,
          ),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === "fulfilled").length,
          1,
        );
        const flow = (await getConsumptionOrder(db, actor, orderId))
          .activeWorkflow!;
        await lockRevisionCategories(db, actor, orderId, flow, ["story"]);
        await abandonUnboundWorkflow(db, actor, orderId, flow);
        await assert.rejects(
          quoteRevision(db, actor, orderId, { ...input, requestId: "paid" }),
        );
      },
    );
    await t.test(
      "refunds require admin, are idempotent, bounded and close fully refunded entitlements",
      async () => {
        const db = await fixture();
        const orderId = await started(db);
        await assert.rejects(
          refundConsumption(db, actor, actor.uid, orderId, "bad", 50, "refund"),
        );
        await refundConsumption(
          db,
          admin,
          actor.uid,
          orderId,
          "partial",
          20,
          "Partial refund",
        );
        await refundConsumption(
          db,
          admin,
          actor.uid,
          orderId,
          "partial",
          20,
          "Partial refund",
        );
        await assert.rejects(
          refundConsumption(
            db,
            admin,
            actor.uid,
            orderId,
            "too-much",
            31,
            "Invalid",
          ),
        );
        await refundConsumption(
          db,
          admin,
          actor.uid,
          orderId,
          "remaining",
          30,
          "Remaining refund",
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
        assert.equal(
          (await getConsumptionOrder(db, actor, orderId)).value.state,
          "refunded",
        );
        await assert.rejects(
          continueConsumption(db, actor, orderId, "next", inputHash, admission),
        );
      },
    );
    await t.test(
      "insufficient funds leave a queued order uncharged, and concurrent refunds cannot exceed it",
      async () => {
        const db = await fixture();
        const { order } = await queued(db);
        await db
          .collection<{ _id: string; balance: number }>("creditWallets")
          .updateOne({ _id: actor.uid }, { $set: { balance: 10 } });
        await assert.rejects(
          startConsumption(db, actor, order._id, "low-funds", admission),
        );
        assert.equal(
          (await getConsumptionOrder(db, actor, order._id)).value.state,
          "queued",
        );
        assert.equal(
          await db.collection("consumptionCharges").countDocuments({}),
          0,
        );
        await db
          .collection<{ _id: string; balance: number }>("creditWallets")
          .updateOne({ _id: actor.uid }, { $set: { balance: 500 } });
        const start = await startConsumption(
          db,
          actor,
          order._id,
          "start",
          admission,
        );
        await assert.rejects(
          refundConsumption(
            db,
            admin,
            actor.uid,
            order._id,
            "active",
            50,
            "Busy",
          ),
        );
        await abandonUnboundWorkflow(db, actor, order._id, start.workflowId);
        const attempts = await Promise.allSettled([
          refundConsumption(
            db,
            admin,
            actor.uid,
            order._id,
            "refund-a",
            30,
            "First",
          ),
          refundConsumption(
            db,
            admin,
            actor.uid,
            order._id,
            "refund-b",
            30,
            "Second",
          ),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 480);
      },
    );
    await t.test(
      "admin can resolve an unbound workflow for a suspended owner without refunding automatically",
      async () => {
        const db = await fixture();
        const { order } = await queued(db);
        const start = await startConsumption(
          db,
          actor,
          order._id,
          "start",
          admission,
        );
        await db
          .collection<{ _id: string; status: string }>("accountAccess")
          .updateOne({ _id: actor.uid }, { $set: { status: "suspended" } });
        await assert.rejects(
          resolveConsumptionWorkflow(
            db,
            actor,
            actor.uid,
            order._id,
            start.workflowId,
            "Resolve",
          ),
        );
        await resolveConsumptionWorkflow(
          db,
          admin,
          actor.uid,
          order._id,
          start.workflowId,
          "No provider dispatch",
        );
        await resolveConsumptionWorkflow(
          db,
          admin,
          actor.uid,
          order._id,
          start.workflowId,
          "No provider dispatch",
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 450);
        assert.equal(
          await db
            .collection("auditEvents")
            .countDocuments({ event: "consumption-workflow-release" }),
          1,
        );
        await refundConsumption(
          db,
          admin,
          actor.uid,
          order._id,
          "refund",
          50,
          "Failed admission",
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
      },
    );
    await t.test(
      "expired entitlements and suspended accounts cannot mutate paid production",
      async () => {
        const db = await fixture();
        const orderId = await started(db);
        await db
          .collection<{ _id: string; value: { expiresAt: string } }>(
            "consumptionOrders",
          )
          .updateOne(
            { _id: orderId },
            { $set: { "value.expiresAt": "2000-01-01T00:00:00Z" } },
          );
        await assert.rejects(
          continueConsumption(
            db,
            actor,
            orderId,
            "expired",
            inputHash,
            admission,
          ),
        );
        await db
          .collection<{
            _id: string;
            role?: string;
            status: string;
            notBefore?: number;
            revision?: number;
          }>("accountAccess")
          .updateOne({ _id: actor.uid }, { $set: { status: "suspended" } });
        await assert.rejects(getConsumptionOrder(db, actor, orderId));
      },
    );
    await t.test(
      "accepted orders survive catalog edits while new orders require the current quote",
      async () => {
        const db = await fixture();
        const { order, request } = await queued(db);
        await revise(db, "consumption:book", (definition) => ({
          ...definition,
          terms: {
            ...order.value.terms,
            identity: { ...order.value.terms.identity, revision: 2 },
            credits: 80,
          },
        }));
        await assert.rejects(
          queueConsumption(
            db,
            actor,
            { ...request, key: "new", targetId: "new" },
            types,
            admission,
          ),
        );
        await startConsumption(db, actor, order._id, "start", admission);
        assert.equal((await readWallet(db, actor.uid)).balance, 450);
      },
    );
    async function promotionFixture(
      overrides: Record<string, unknown> = {},
      channel = "stripe",
      subscription = false,
    ) {
      const db = await fixture();
      await publish(db, {
        kind: "purchase",
        terms: {
          identity: { id: "offer", revision: 1, schemaVersion: 1 },
          label: "Fixture",
          credits: 100,
          price: { amountMinor: 500, currency: "USD" },
          channel,
          billing: subscription
            ? { kind: "subscription", interval: "month", creditExpiryDays: 90 }
            : { kind: "one-time", creditExpiryDays: null },
          provider: { productId: "prod", priceId: "price", offerId: null },
        },
      });
      await publish(db, {
        kind: "promotion",
        terms: {
          identity: { id: "bonus", revision: 1, schemaVersion: 1 },
          code: "BONUS",
          startsAt: new Date(Date.now() - 60000).toISOString(),
          endsAt: new Date(Date.now() + 3600000).toISOString(),
          offerIds: ["offer"],
          channels: [channel],
          maxRedemptions: 1,
          maxPerAccount: 1,
          benefit: {
            kind: "bonus-credits",
            credits: 10,
            creditExpiryDays: null,
          },
          duration: { kind: "first-payment" },
          stacking: false,
          ...overrides,
        },
      });
      const request = {
        checkoutId: "checkout",
        promotionId: "promotion:bonus",
        promotionRevision: 1,
        offerId: "purchase:offer",
        offerRevision: 1,
        code: "BONUS",
      };
      return { db, request };
    }
    async function receipt(
      db: ReturnType<typeof client.db>,
      uid: string,
      evidenceId: string,
    ) {
      await retainEvidence(db, uid, {
        id: evidenceId,
        runId: "payment-verification",
        operationId: evidenceId,
        kind: "provider-receipt",
        payload: { verified: "offline-adapter" },
        retentionDays: 90,
      });
    }
    async function payment(db: ReturnType<typeof client.db>, extra = {}) {
      await receipt(db, actor.uid, "receipt");
      return recordVerifiedPayment(db, {
        channel: "stripe",
        providerPaymentId: "pay-1",
        uid: actor.uid,
        checkoutId: "checkout",
        offerId: "purchase:offer",
        offerRevision: 1,
        subscriptionId: null,
        sequence: 1,
        paidAt: new Date().toISOString(),
        providerPromotionId: null,
        evidenceId: "receipt",
        ...extra,
      });
    }
    await t.test(
      "concurrent global reservations obey limits across accounts; one promotion per checkout",
      async () => {
        const { db, request } = await promotionFixture();
        const results = await Promise.allSettled([
          reservePromotion(db, actor, request),
          reservePromotion(db, { uid: "other", authTime: 1 }, request),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const row = await db.collection("promotionReservations").findOne({});
        const winner = { uid: row!.uid as string, authTime: 1 };
        await reservePromotion(db, winner, request);
        await assert.rejects(
          reservePromotion(db, winner, { ...request, code: null }),
        );
        await assert.rejects(
          reservePromotion(db, winner, { ...request, checkoutId: "second" }),
        );
      },
    );
    await t.test(
      "verified payments grant once on either channel; foreign and fabricated receipts cannot grant",
      async () => {
        for (const channel of ["stripe", "google-play"] as const) {
          const { db, request } = await promotionFixture({}, channel);
          await reservePromotion(db, actor, request);
          await assert.rejects(
            finalizePromotion(db, actor.uid, "checkout", "missing"),
          );
          const key = await payment(db, { channel });
          await Promise.all([
            finalizePromotion(db, actor.uid, "checkout", key),
            finalizePromotion(db, actor.uid, "checkout", key),
          ]);
          assert.equal((await readWallet(db, actor.uid)).balance, 510);
          await assert.rejects(
            finalizePromotion(db, "foreign", "checkout", key),
          );
          assert.equal(
            await db.collection("promotionPaymentClaims").countDocuments({}),
            1,
          );
        }
      },
    );
    await t.test(
      "expired, wrong-code and ineligible offers reject before reservation",
      async () => {
        const { db, request } = await promotionFixture({
          endsAt: new Date(Date.now() - 1000).toISOString(),
        });
        await assert.rejects(reservePromotion(db, actor, request));
        const valid = await promotionFixture();
        await assert.rejects(
          reservePromotion(valid.db, actor, {
            ...valid.request,
            code: "WRONG",
          }),
        );
        await assert.rejects(
          reservePromotion(valid.db, actor, {
            ...valid.request,
            offerId: "purchase:missing",
          }),
        );
      },
    );
    await t.test(
      "quota is released only with retained unpaid terminal evidence; late paid callbacks retain original slots",
      async () => {
        const { db, request } = await promotionFixture();
        await reservePromotion(db, actor, request);
        await assert.rejects(
          releasePromotion(db, actor.uid, "checkout", {
            channel: "stripe",
            providerCheckoutId: "checkout-provider",
            evidenceId: "unpaid",
            outcome: "expired-unpaid",
          }),
        );
        await receipt(db, actor.uid, "unpaid");
        await releasePromotion(db, actor.uid, "checkout", {
          channel: "stripe",
          providerCheckoutId: "checkout-provider",
          evidenceId: "unpaid",
          outcome: "expired-unpaid",
        });
        await reservePromotion(db, { uid: "other", authTime: 1 }, request);
        const key = await payment(db);
        await assert.rejects(finalizePromotion(db, actor.uid, "checkout", key));
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
      },
    );
    await t.test(
      "subscription bonuses use accepted duration and unique renewal sequences",
      async () => {
        const { db, request } = await promotionFixture(
          { duration: { kind: "payments", count: 2 } },
          "stripe",
          true,
        );
        const accepted = await publishedCatalog(db, "promotion:bonus");
        assert.ok(accepted && accepted.definition.kind === "promotion");
        const definition = accepted.definition;
        await revise(db, "promotion:bonus", () => ({
          ...definition,
          terms: {
            ...definition.terms,
            identity: { ...definition.terms.identity, revision: 2 },
          },
          eligibility: { accountIds: null, firstPurchaseOnly: true },
        }));
        request.promotionRevision = 2;
        await reservePromotion(db, actor, request);
        const first = await payment(db, { subscriptionId: "sub" });
        await finalizePromotion(db, actor.uid, "checkout", first);
        const second = await payment(db, {
          subscriptionId: "sub",
          providerPaymentId: "pay-2",
          sequence: 2,
        });
        await finalizePromotion(db, actor.uid, "checkout", second);
        await finalizePromotion(db, actor.uid, "checkout", second);
        const third = await payment(db, {
          subscriptionId: "sub",
          providerPaymentId: "pay-3",
          sequence: 3,
        });
        await assert.rejects(
          finalizePromotion(db, actor.uid, "checkout", third),
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 520);
        await assert.rejects(
          payment(db, {
            subscriptionId: "sub",
            providerPaymentId: "duplicate-sequence",
            sequence: 2,
          }),
        );
      },
    );
    await t.test(
      "monetary discounts require provider-observed promotion identity and grant no bonus",
      async () => {
        const { db, request } = await promotionFixture({
          benefit: {
            kind: "monetary-discount",
            providerPromotionId: "provider-offer",
          },
        });
        await reservePromotion(db, actor, request);
        const wrong = await payment(db);
        await assert.rejects(
          finalizePromotion(db, actor.uid, "checkout", wrong),
        );
        const right = await payment(db, {
          providerPaymentId: "correct",
          providerPromotionId: "provider-offer",
        });
        await finalizePromotion(db, actor.uid, "checkout", right);
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
      },
    );
    await t.test(
      "scheduled eligibility and coupon publication are validated independently",
      async () => {
        const { db, request } = await promotionFixture({
          code: null,
          maxRedemptions: 3,
        });
        const current = await publishedCatalog(db, "promotion:bonus");
        assert.ok(current && current.definition.kind === "promotion");
        const promotion = current.definition;
        await revise(db, "promotion:bonus", () => ({
          ...promotion,
          terms: {
            ...promotion.terms,
            identity: { ...promotion.terms.identity, revision: 2 },
          },
          eligibility: { accountIds: [actor.uid], firstPurchaseOnly: true },
        }));
        const updated = { ...request, promotionRevision: 2, code: null };
        await assert.rejects(
          reservePromotion(db, { uid: "ineligible", authTime: 1 }, updated),
        );
        await db
          .collection("purchaseOrders")
          .insertOne({ uid: actor.uid, granted: true, status: "refunded" });
        await assert.rejects(reservePromotion(db, actor, updated));
        await db.collection("purchaseOrders").deleteMany({ uid: actor.uid });
        await reservePromotion(db, actor, updated);
        // A verified unrelated purchase makes a first-purchase-only offer unavailable.
        await payment(db, { checkoutId: "another" });
        await assert.rejects(
          reservePromotion(db, actor, { ...updated, checkoutId: "later" }),
        );
        const coded = await promotionFixture();
        assert.deepEqual(await resolvePromotionCode(coded.db, "BONUS"), {
          id: "promotion:bonus",
          revision: 1,
        });
        assert.equal(await resolvePromotionCode(coded.db, "UNKNOWN"), null);
        const source = await publishedCatalog(coded.db, "promotion:bonus");
        assert.ok(source && source.definition.kind === "promotion");
        await assert.rejects(
          publish(coded.db, {
            ...source.definition,
            terms: {
              ...source.definition.terms,
              identity: { id: "duplicate-code", revision: 1, schemaVersion: 1 },
            },
          }),
        );
      },
    );
    await t.test(
      "delayed payment preserves the reserved quota and does not extend expired bonus credits",
      async () => {
        const { db, request } = await promotionFixture({
          benefit: { kind: "bonus-credits", credits: 10, creditExpiryDays: 1 },
        });
        const reserved = await reservePromotion(db, actor, request);
        assert.ok(reserved);
        const paidAt = new Date(Date.now() - 2 * 86400000);
        await db
          .collection<{ _id: string; createdAt: Date; expiresAt: Date }>(
            "promotionReservations",
          )
          .updateOne(
            { _id: reserved._id },
            {
              $set: {
                createdAt: new Date(paidAt.getTime() - 1000),
                expiresAt: new Date(paidAt.getTime() + 1000),
              },
            },
          );
        await assert.rejects(reservePromotion(db, actor, request));
        await assert.rejects(
          reservePromotion(db, { uid: "other", authTime: 1 }, request),
        );
        const verified = await payment(db, { paidAt: paidAt.toISOString() });
        const claim = await finalizePromotion(
          db,
          actor.uid,
          "checkout",
          verified,
        );
        assert.equal(claim?.credited, 0);
        await finalizePromotion(db, actor.uid, "checkout", verified);
        assert.equal((await readWallet(db, actor.uid)).balance, 500);
      },
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
