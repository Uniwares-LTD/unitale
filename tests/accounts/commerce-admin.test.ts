import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { z } from "zod";
import {
  commerceAdminView,
  commerceAdminAction,
} from "../../src/lib/server/commerce/admin";
import {
  createCreditIndexes,
  grantCredits,
  readWallet,
} from "../../src/lib/server/store/credits";
import {
  createCatalogIndexes,
  publishedCatalog,
} from "../../src/lib/server/commerce/catalogs";
import {
  queueConsumption,
  startConsumption,
  abandonUnboundWorkflow,
  createConsumptionIndexes,
} from "../../src/lib/server/commerce/orders";
import { purchaseOffers } from "../../src/lib/server/commerce/purchase-offers";
const admin = { uid: "admin", auth_time: 1 };
const types = [
  {
    id: "book",
    schemaVersion: 1,
    fields: z.strictObject({ pages: z.number().int().min(1).max(5) }),
  },
];
test("commerce admin service authorization, publication and refund paths", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  const db = client.db("commerce_admin");
  const noProvider = () => {
    throw new Error("No provider call authorized");
  };
  const action = (input: unknown) =>
    commerceAdminAction(db, admin, input, types, noProvider);
  try {
    await createCreditIndexes(db);
    await createCatalogIndexes(db);
    await createConsumptionIndexes(db);
    await db
      .collection("accountAccess")
      .insertOne({
        _id: "admin" as never,
        role: "admin",
        status: "active",
        notBefore: 0,
        revision: 0,
      });
    const product = {
      kind: "consumption",
      terms: {
        identity: { id: "book", revision: 1, schemaVersion: 1 },
        productType: "book",
        productSchemaVersion: 1,
        credits: 50,
        allowances: [],
        entitlementDays: null,
      },
      fields: { pages: 3 },
    };
    await t.test(
      "all read/write commands require current admin access",
      async () => {
        await assert.rejects(
          commerceAdminView(db, { uid: "customer", auth_time: 1 }, types),
        );
        await assert.rejects(
          commerceAdminAction(
            db,
            { uid: "customer", auth_time: 1 },
            { action: "save", definition: product, expectedRevision: 0 },
            types,
            noProvider,
          ),
        );
        assert.equal(
          await db.collection("commerceCatalogs").countDocuments(),
          0,
        );
      },
    );
    await t.test(
      "registered fields validate and stale previews cannot publish",
      async () => {
        await assert.rejects(
          action({
            action: "save",
            definition: { ...product, fields: { pages: 6 } },
            expectedRevision: 0,
          }),
          /pages/,
        );
        await action({
          action: "save",
          definition: product,
          expectedRevision: 0,
        });
        const preview = (await action({
          action: "preview",
          id: "consumption:book",
        })) as { hash: string };
        const next = structuredClone(product);
        next.terms.identity.revision = 2;
        await action({ action: "save", definition: next, expectedRevision: 1 });
        await assert.rejects(
          action({
            action: "publish",
            id: "consumption:book",
            revision: 1,
            hash: preview.hash,
          }),
        );
        const current = (await action({
          action: "preview",
          id: "consumption:book",
        })) as { hash: string };
        await action({
          action: "publish",
          id: "consumption:book",
          revision: 2,
          hash: current.hash,
        });
        const view = await commerceAdminView(db, admin, types);
        assert.equal(view.productTypes[0].fields.type, "object");
        assert.equal(view.rows[0].publishedRevision, 2);
      },
    );
    await t.test(
      "unknown provider write is reconciled with readback only",
      async () => {
        const preview = (await action({
          action: "provider-preview",
          id: "consumption:book",
          draft: { kind: "stripe-product", id: "prod_book", name: "Book" },
        })) as { preview: unknown; hash: string };
        let writes = 0;
        let receipt: unknown = null;
        const provider = () => ({
          readback: async () => receipt,
          execute: async () => {
            writes++;
            throw new Error("Connection lost after write");
          },
        });
        const command = {
          action: "provider-publish",
          key: "publish",
          ...preview,
        };
        await assert.rejects(
          commerceAdminAction(db, admin, command, types, provider),
        );
        await assert.rejects(
          commerceAdminAction(db, admin, command, types, provider),
        );
        const row = await db
          .collection("billingProviderActions")
          .findOne({ kind: "publish" });
        assert.ok(row);
        assert.equal(writes, 1);
        await assert.rejects(
          commerceAdminAction(
            db,
            admin,
            { action: "provider-reconcile", id: row._id },
            types,
            provider,
          ),
        );
        receipt = { id: "prod_book", name: "Book" };
        await commerceAdminAction(
          db,
          admin,
          { action: "provider-reconcile", id: row._id },
          types,
          provider,
        );
        assert.equal(writes, 1);
        assert.equal(
          (
            await db
              .collection("billingProviderActions")
              .findOne({ _id: row._id })
          )?.state,
          "verified",
        );
      },
    );
    await t.test(
      "credit refunds use original charges and exact idempotency",
      async () => {
        const actor = { uid: "owner", authTime: 1 };
        await grantCredits(db, actor.uid, "grant", {
          amount: 100,
          source: "purchase",
          reference: "fixture",
        });
        const publication = await publishedCatalog(db, "consumption:book");
        assert.ok(publication);
        const order = await queueConsumption(
          db,
          actor,
          {
            key: "order",
            targetId: "production",
            catalogId: publication.id,
            revision: 2,
            quoteHash: publication.hash,
            inputHash: "a".repeat(64),
          },
          types,
          async () => {},
        );
        const started = await startConsumption(
          db,
          actor,
          order._id,
          "start",
          async () => {},
        );
        const charge = await db
          .collection("consumptionCharges")
          .findOne({ orderId: order._id });
        assert.ok(charge);
        const refund = {
          action: "refund",
          uid: actor.uid,
          chargeId: charge._id,
          key: "refund",
          amount: 50,
          reason: "Failed production",
        };
        await assert.rejects(action(refund), /active work/);
        await abandonUnboundWorkflow(db, actor, order._id, started.workflowId);
        await action(refund);
        await action(refund);
        await assert.rejects(action({ ...refund, amount: 49 }));
        assert.equal(
          await db.collection("consumptionRefunds").countDocuments(),
          1,
        );
        assert.ok(await readWallet(db, actor.uid));
      },
    );
    await t.test(
      "published offer listing excludes drafts and other channels",
      async () => {
        const offer = {
          kind: "purchase",
          terms: {
            identity: { id: "web", revision: 1, schemaVersion: 1 },
            label: "Web",
            credits: 10,
            channel: "stripe",
            price: { currency: "USD", amountMinor: 100 },
            billing: { kind: "one-time", creditExpiryDays: null },
            provider: {
              productId: "prod_web",
              priceId: "price_web",
              offerId: null,
            },
          },
        };
        await action({
          action: "save",
          definition: offer,
          expectedRevision: 0,
        });
        assert.equal((await purchaseOffers(db, ["stripe"])).offers.length, 0);
        const preview = (await action({
          action: "preview",
          id: "purchase:web",
        })) as { hash: string };
        await action({
          action: "publish",
          id: "purchase:web",
          revision: 1,
          hash: preview.hash,
        });
        assert.equal((await purchaseOffers(db, ["stripe"])).offers.length, 1);
        assert.equal(
          (await purchaseOffers(db, ["google-play"])).offers.length,
          0,
        );
      },
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
