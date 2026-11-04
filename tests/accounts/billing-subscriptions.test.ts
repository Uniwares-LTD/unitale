import { StripeBillingProvider } from "../../src/lib/server/commerce/stripe-billing";
import { PlayBillingProvider } from "../../src/lib/server/commerce/play-billing";
import { fingerprint } from "../../src/lib/server/foundation/canonical";
import {
  prepareBillingAction,
  prepareProviderPublication,
  executeProviderAction,
} from "../../src/lib/server/commerce/provider-actions";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  beginBilling,
  createBillingIndexes,
  reconcileBilling,
  type BillingObservation,
  type BillingProvider,
} from "../../src/lib/server/commerce/billing";
import {
  createCreditIndexes,
  grantCredits,
  readWallet,
  reversePurchase,
  spendCredits,
  reserveCredits,
} from "../../src/lib/server/store/credits";
import {
  saveCatalogDraft,
  previewCatalog,
  publishCatalog,
} from "../../src/lib/server/commerce/catalogs";
const actor = { uid: "owner", authTime: 1 };
test("subscription payment accounting and ownership", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  let index = 0;
  const fixture = async () => {
    const db = client.db("billing_" + ++index);
    await createCreditIndexes(db);
    await createBillingIndexes(db);
    await db
      .collection<{
        _id: string;
        role: string;
        status: string;
        notBefore: number;
        revision: number;
      }>("accountAccess")
      .insertOne({
        _id: "admin",
        role: "admin",
        status: "active",
        notBefore: 0,
        revision: 0,
      });
    for (const channel of ["stripe", "google-play"] as const) {
      const admin = { uid: "admin", auth_time: 1 };
      const draft = await saveCatalogDraft(
        db,
        admin,
        {
          kind: "purchase",
          terms: {
            identity: { id: channel, revision: 1, schemaVersion: 1 },
            label: "Test monthly",
            credits: 100,
            price: { amountMinor: 500, currency: "USD" },
            channel,
            billing: {
              kind: "subscription",
              interval: "month",
              creditExpiryDays: 90,
            },
            provider: { productId: "product", priceId: "price", offerId: null },
          },
        },
        0,
        [],
      );
      const preview = await previewCatalog(db, admin, draft.id, []);
      await publishCatalog(db, admin, draft.id, 1, preview.hash, []);
    }
    const intent = await beginBilling(db, actor, {
      checkoutId: "checkout",
      offerId: "purchase:stripe",
      offerRevision: 1,
    });
    const now = Date.now();
    const observation: BillingObservation = {
      providerId: "provider",
      accountBinding: intent.accountBinding,
      state: "active",
      periodEnd: new Date(now + 30 * 86400000).toISOString(),
      cancelAtPeriodEnd: false,
      payments: [
        {
          id: "payment",
          productId: "product",
          priceId: "price",
          offerId: null,
          paidAt: new Date(now).toISOString(),
          periodStart: new Date(now).toISOString(),
          periodEnd: new Date(now + 30 * 86400000).toISOString(),
          listedMinor: 500,
          amountMinor: 500,
          currency: "USD",
          refundedMinor: 0,
          sequence: 1,
          providerPromotionId: null,
        },
      ],
    };
    const provider: BillingProvider = {
      channel: "stripe",
      inspect: async () => structuredClone(observation),
    };
    return { db, intent, observation, provider };
  };
  try {
    await t.test(
      "Play deferred plan change permits cancellation but not competing uncertain writes",
      async () => {
        const { db } = await fixture();
        const customer = { uid: "play-owner", authTime: 1 };
        const play = await beginBilling(db, customer, {
          checkoutId: "play",
          offerId: "purchase:google-play",
          offerRevision: 1,
        });
        await db.collection("billingIntents").updateOne(
          { _id: play._id as never },
          {
            $set: {
              state: "active",
              providerId: "token",
              periodEnd: new Date(Date.now() + 86400000).toISOString(),
            },
          },
        );
        const plan = await prepareBillingAction(
          db,
          customer,
          "play",
          "plan",
          "plan-change",
          { id: "purchase:google-play", revision: 1 },
        );
        const cancellation = await prepareBillingAction(
          db,
          customer,
          "play",
          "cancel",
          "cancel",
        );
        assert.equal(cancellation.kind, "cancel");
        let writes = 0;
        const adapter = new PlayBillingProvider(
          async (_path, method = "GET") => {
            if (method === "POST") {
              writes++;
              return {};
            }
            return {
              externalAccountIdentifiers: {
                obfuscatedExternalAccountId: play.accountBinding,
              },
              acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
              lineItems: [
                { autoRenewingPlan: { autoRenewEnabled: writes === 0 } },
              ],
            };
          },
          "com.example.app",
          true,
        );
        await executeProviderAction(
          db,
          cancellation._id,
          adapter.fulfillment(play, "token"),
        );
        assert.equal(writes, 1);
        assert.equal(
          (await prepareBillingAction(db, customer, "play", "cancel", "cancel"))
            ._id,
          cancellation._id,
        );
        await db
          .collection("billingProviderActions")
          .updateOne(
            { _id: plan._id as never },
            { $set: { state: "unknown" } },
          );
        await assert.rejects(
          prepareBillingAction(db, customer, "play", "second-cancel", "cancel"),
        );
        await assert.rejects(
          prepareBillingAction(
            db,
            { uid: "foreign", authTime: 1 },
            "play",
            "foreign",
            "cancel",
          ),
        );
      },
    );
    await t.test(
      "lost Stripe checkout response recovers the original action across pages without POST",
      async () => {
        const { db, intent } = await fixture();
        const action = await prepareBillingAction(
          db,
          actor,
          "checkout",
          "checkout-action",
          "checkout",
        );
        await db
          .collection("billingProviderActions")
          .updateOne(
            { _id: action._id as never },
            { $set: { state: "unknown" } },
          );
        let reads = 0;
        const provider = new StripeBillingProvider(
          async (path, method = "GET") => {
            assert.equal(method, "GET");
            reads++;
            if (!path.includes("starting_after"))
              return {
                has_more: true,
                data: Array.from({ length: 100 }, (_, i) => ({
                  id: "other-" + i,
                  livemode: false,
                  client_reference_id: null,
                  metadata: {},
                })),
              };
            return {
              has_more: false,
              data: [
                {
                  id: "recovered",
                  livemode: false,
                  client_reference_id: intent.accountBinding,
                  metadata: { billingIntent: intent._id },
                  status: "open",
                  payment_status: "unpaid",
                  subscription: null,
                  payment_intent: null,
                  currency: null,
                  amount_total: null,
                  url: "https://checkout.stripe.com/existing",
                },
              ],
            };
          },
          false,
        );
        const result = await executeProviderAction(
          db,
          action._id,
          provider.actions("https://example.test"),
        );
        assert.deepEqual(result, {
          id: "recovered",
          url: "https://checkout.stripe.com/existing",
        });
        assert.deepEqual(
          await executeProviderAction(
            db,
            action._id,
            provider.actions("https://example.test"),
          ),
          result,
        );
        assert.equal(reads, 2);
      },
    );
    await t.test(
      "bounded Stripe recovery resumes its durable cursor without replaying an unknown write",
      async () => {
        const { db, intent } = await fixture();
        const action = await prepareBillingAction(
          db,
          actor,
          "checkout",
          "large-recovery",
          "checkout",
        );
        await db
          .collection("billingProviderActions")
          .updateOne(
            { _id: action._id as never },
            { $set: { state: "unknown" } },
          );
        let calls = 0;
        const provider = new StripeBillingProvider(
          async (path, method = "GET") => {
            assert.equal(method, "GET");
            calls++;
            if (calls <= 100)
              return {
                has_more: true,
                data: [
                  {
                    id: "cursor-" + calls,
                    livemode: false,
                    client_reference_id: null,
                    metadata: {},
                  },
                ],
              };
            assert.match(path, /starting_after=cursor-100/);
            return {
              has_more: false,
              data: [
                {
                  id: "recovered",
                  livemode: false,
                  client_reference_id: intent.accountBinding,
                  metadata: { billingIntent: intent._id },
                  status: "open",
                  payment_status: "unpaid",
                  subscription: null,
                  payment_intent: null,
                  currency: null,
                  amount_total: null,
                  url: "https://checkout.stripe.com/existing",
                },
              ],
            };
          },
          false,
        );
        await assert.rejects(
          executeProviderAction(
            db,
            action._id,
            provider.actions("https://example.test"),
          ),
          /saved cursor/,
        );
        assert.equal(
          (
            await db
              .collection("billingProviderActions")
              .findOne({ _id: action._id as never })
          )?.recoveryCursor,
          "cursor-100",
        );
        assert.deepEqual(
          await executeProviderAction(
            db,
            action._id,
            provider.actions("https://example.test"),
          ),
          { id: "recovered", url: "https://checkout.stripe.com/existing" },
        );
        assert.equal(calls, 101);
      },
    );
    await t.test(
      "unpaid claims cannot erase prior payment or contradict a paid observation",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        observation.unpaidOutcome = "expired-unpaid";
        await assert.rejects(
          reconcileBilling(db, intent._id, "provider", provider),
        );
        delete observation.unpaidOutcome;
        await reconcileBilling(db, intent._id, "provider", provider);
        observation.state = "ended";
        observation.payments = [];
        observation.unpaidOutcome = "expired-unpaid";
        await assert.rejects(
          reconcileBilling(db, intent._id, "provider", provider),
          /previously paid/,
        );
        assert.equal(
          (
            await db
              .collection("billingIntents")
              .findOne({ _id: intent._id as never })
          )?.state,
          "active",
        );
      },
    );
    await t.test(
      "pending subscription excludes both stores and retries preserve snapshots",
      async () => {
        const { db, intent } = await fixture();
        assert.equal(
          (
            await beginBilling(db, actor, {
              checkoutId: "checkout",
              offerId: "purchase:stripe",
              offerRevision: 1,
            })
          )._id,
          intent._id,
        );
        await assert.rejects(
          beginBilling(db, actor, {
            checkoutId: "second",
            offerId: "purchase:google-play",
            offerRevision: 1,
          }),
          /subscription already exists/,
        );
      },
    );
    await t.test(
      "concurrent cross-store starts admit only one subscription",
      async () => {
        const { db } = await fixture();
        const customer = { uid: "racing-owner", authTime: 1 };
        const starts = await Promise.allSettled(
          ["stripe", "google-play"].map((channel) =>
            beginBilling(db, customer, {
              checkoutId: channel,
              offerId: "purchase:" + channel,
              offerRevision: 1,
            }),
          ),
        );
        assert.equal(starts.filter((v) => v.status === "fulfilled").length, 1);
        assert.equal(
          await db
            .collection<{ _id: string }>("billingSubscriptionSlots")
            .countDocuments({ _id: customer.uid }),
          1,
        );
      },
    );
    await t.test(
      "old payments cannot claim a new quote or poison its provider binding",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        observation.payments[0].paidAt = "2020-01-01T00:00:00Z";
        await assert.rejects(
          reconcileBilling(db, intent._id, "provider", provider),
          /timestamp/,
        );
        assert.equal(
          await db.collection("billingProviderBindings").countDocuments(),
          0,
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 0);
      },
    );
    await t.test(
      "duplicate canonical payments grant once with 90-day expiry",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        await reconcileBilling(db, intent._id, "provider", provider);
        await reconcileBilling(db, intent._id, "provider", provider);
        assert.equal((await readWallet(db, actor.uid)).balance, 100);
        const lot = await db
          .collection("creditLots")
          .findOne({ source: "subscription" });
        assert.equal(
          lot?.expiresAt.getTime(),
          Date.parse(observation.payments[0].paidAt) + 90 * 86400000,
        );
        assert.equal(await db.collection("billingGrants").countDocuments(), 1);
      },
    );
    await t.test(
      "foreign ownership and mismatched prices cannot grant credits",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        observation.accountBinding = "foreign";
        await assert.rejects(
          reconcileBilling(db, intent._id, "provider", provider),
          /ownership/,
        );
        observation.accountBinding = intent.accountBinding;
        observation.payments[0].listedMinor = 1;
        await assert.rejects(
          reconcileBilling(db, intent._id, "provider", provider),
          /price/,
        );
        assert.equal((await readWallet(db, actor.uid)).balance, 0);
      },
    );
    await t.test(
      "refunds reconcile cumulative targets without duplicate debt",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        await reconcileBilling(db, intent._id, "provider", provider);
        observation.payments[0].refundedMinor = 250;
        await reconcileBilling(db, intent._id, "provider", provider);
        await reconcileBilling(db, intent._id, "provider", provider);
        assert.equal((await readWallet(db, actor.uid)).balance, 50);
        observation.payments[0].refundedMinor = 500;
        await reconcileBilling(db, intent._id, "provider", provider);
        assert.equal((await readWallet(db, actor.uid)).balance, 0);
      },
    );
    await t.test(
      "provider publication requires a current administrator preview and durable audit",
      async () => {
        const { db } = await fixture();
        const catalog = await previewCatalog(
          db,
          { uid: "admin", auth_time: 1 },
          "purchase:stripe",
          [],
        );
        const preview = {
          catalogId: catalog.id,
          revision: catalog.revision,
          definitionHash: catalog.hash,
          providerDraft: {
            kind: "stripe-product",
            id: "product",
            name: "Test monthly",
          },
        };
        await assert.rejects(
          prepareProviderPublication(
            db,
            { uid: actor.uid, auth_time: 1 },
            "publish",
            preview,
            fingerprint(preview),
          ),
          /Administrator/,
        );
        const action = await prepareProviderPublication(
          db,
          { uid: "admin", auth_time: 1 },
          "publish",
          preview,
          fingerprint(preview),
        );
        assert.equal(
          (
            await prepareProviderPublication(
              db,
              { uid: "admin", auth_time: 1 },
              "publish",
              preview,
              fingerprint(preview),
            )
          )._id,
          action._id,
        );
        assert.equal(
          await db
            .collection("auditEvents")
            .countDocuments({ event: "billing-publication-prepared" }),
          1,
        );
        await assert.rejects(
          prepareProviderPublication(
            db,
            { uid: "admin", auth_time: 1 },
            "invalid",
            { ...preview, providerDraft: { kind: "arbitrary-url" } },
            "bad",
          ),
        );
      },
    );
    await t.test(
      "unknown provider writes are reconciled without a second mutation",
      async () => {
        const { db } = await fixture();
        const action = await prepareBillingAction(
          db,
          actor,
          "checkout",
          "start",
          "checkout",
        );
        let writes = 0;
        let verified = false;
        const adapter = {
          readback: async () =>
            verified
              ? { id: "provider", client_secret: "never-persist" }
              : null,
          execute: async () => {
            writes++;
            throw new Error("Lost response after provider accepted write");
          },
        };
        await assert.rejects(
          executeProviderAction(db, action._id, adapter),
          /Lost response/,
        );
        await assert.rejects(
          executeProviderAction(db, action._id, adapter),
          /reconciliation/,
        );
        assert.equal(writes, 1);
        verified = true;
        assert.deepEqual(await executeProviderAction(db, action._id, adapter), {
          id: "provider",
        });
        assert.equal(writes, 1);
        await db
          .collection<{
            checkoutId: string;
            providerId: string | null;
            periodEnd: string | null;
          }>("billingIntents")
          .updateOne(
            { checkoutId: "checkout" },
            {
              $set: {
                providerId: "provider",
                periodEnd: "2099-01-01T00:00:00Z",
              },
            },
          );
        assert.equal(
          (
            await prepareBillingAction(
              db,
              actor,
              "checkout",
              "start",
              "checkout",
            )
          )._id,
          action._id,
        );
        await assert.rejects(
          prepareBillingAction(db, actor, "checkout", "start", "cancel"),
          /changed/,
        );
      },
    );
    await t.test(
      "refund restoration and repeated reversal retain distinct ledger effects",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        await reconcileBilling(db, intent._id, "provider", provider);
        for (const amount of [250, 0, 250, 0, 500]) {
          observation.payments[0].refundedMinor = amount;
          await reconcileBilling(db, intent._id, "provider", provider);
          assert.equal(
            (await readWallet(db, actor.uid)).balance,
            100 - amount / 5,
          );
        }
      },
    );
    await t.test(
      "late expired renewals never issue fresh credits",
      async () => {
        const { db, intent, provider, observation } = await fixture();
        await db
          .collection<{ _id: string; createdAt: Date }>("billingIntents")
          .updateOne(
            { _id: intent._id },
            { $set: { createdAt: new Date("2020-01-01T00:00:00Z") } },
          );
        observation.payments[0].paidAt = "2020-01-01T00:00:00Z";
        observation.payments[0].periodStart = "2020-01-01T00:00:00Z";
        observation.payments[0].periodEnd = "2020-02-01T00:00:00Z";
        await reconcileBilling(db, intent._id, "provider", provider);
        assert.equal((await readWallet(db, actor.uid)).balance, 0);
        assert.equal(await db.collection("billingGrants").countDocuments(), 1);
      },
    );
    await t.test(
      "expired reserved credits are not deducted again when their hold is cancelled",
      async () => {
        const { db } = await fixture();
        const now = new Date("2026-01-01T00:00:00Z");
        await grantCredits(
          db,
          actor.uid,
          "held-grant",
          {
            amount: 100,
            source: "subscription",
            reference: "held-grant",
            expiresAt: new Date("2026-04-01T00:00:00Z"),
          },
          { now },
        );
        await reserveCredits(db, actor, "held", 100, { now });
        const wallet = await reversePurchase(
          db,
          actor.uid,
          "held-reversal",
          "held-grant",
          100,
          { now: new Date("2026-05-01T00:00:00Z") },
        );
        assert.equal(wallet.balance, 0);
        assert.equal(wallet.debt, 0);
      },
    );
    await t.test(
      "partial refund before expiry followed by full refund charges only spent credits",
      async () => {
        const { db } = await fixture();
        const now = new Date("2026-01-01T00:00:00Z");
        await grantCredits(
          db,
          actor.uid,
          "partial-expiry",
          {
            amount: 100,
            source: "subscription",
            reference: "partial-expiry",
            expiresAt: new Date("2026-04-01T00:00:00Z"),
          },
          { now },
        );
        await spendCredits(db, actor, "spend-before", 30, "fixture", {
          now,
          persist: async () => {},
        });
        await reversePurchase(
          db,
          actor.uid,
          "partial-before",
          "partial-expiry",
          50,
          { now },
        );
        const wallet = await reversePurchase(
          db,
          actor.uid,
          "full-after",
          "partial-expiry",
          100,
          { now: new Date("2026-05-01T00:00:00Z") },
        );
        assert.equal(wallet.debt, 30);
        assert.equal(wallet.balance, -30);
      },
    );
    await t.test(
      "partial refund can cancel an expired managed hold without consuming a negative amount",
      async () => {
        const { db } = await fixture();
        const now = new Date("2026-01-01T00:00:00Z");
        await grantCredits(
          db,
          actor.uid,
          "managed-expiry",
          {
            amount: 100,
            source: "subscription",
            reference: "managed-expiry",
            expiresAt: new Date("2026-04-01T00:00:00Z"),
          },
          { now },
        );
        await reversePurchase(
          db,
          actor.uid,
          "partial-managed",
          "managed-expiry",
          20,
          { now },
        );
        await reserveCredits(db, actor, "managed-reserve", 80, {
          now,
          managedJobId: "job",
          persist: async () => {},
        });
        const wallet = await reversePurchase(
          db,
          actor.uid,
          "partial-managed-after",
          "managed-expiry",
          30,
          { now: new Date("2026-05-01T00:00:00Z") },
        );
        assert.equal(wallet.balance, 0);
        assert.equal(wallet.debt, 0);
        assert.equal(wallet.reserved, 0);
      },
    );
    await t.test("confirmed end releases the cross-store slot", async () => {
      const { db, intent, provider, observation } = await fixture();
      observation.state = "ended";
      await reconcileBilling(db, intent._id, "provider", provider);
      assert.ok(
        await beginBilling(db, actor, {
          checkoutId: "replacement",
          offerId: "purchase:google-play",
          offerRevision: 1,
        }),
      );
    });
    await t.test(
      "refund of expired unused subscription credits creates no debt",
      async () => {
        const { db } = await fixture();
        const started = new Date("2026-01-01T00:00:00Z");
        await grantCredits(
          db,
          actor.uid,
          "expiring",
          {
            amount: 100,
            source: "subscription",
            reference: "expiring",
            expiresAt: new Date("2026-04-01T00:00:00Z"),
          },
          { now: started },
        );
        await spendCredits(db, actor, "spent", 30, "fixture", {
          now: started,
          persist: async () => {},
        });
        const wallet = await reversePurchase(
          db,
          actor.uid,
          "revoke",
          "expiring",
          100,
          { now: new Date("2026-05-01T00:00:00Z") },
        );
        assert.equal(wallet.debt, 30);
        assert.equal(wallet.balance, -30);
      },
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
