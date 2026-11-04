import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Stripe from "stripe";
import { namespace } from "../../src/lib/project";
import {
  createCreditIndexes,
  readWallet,
  reserveCredits,
  finishReservation,
} from "../../src/lib/server/store/credits";
import {
  createPaymentIndexes,
  createPaymentOrder,
  leasePaymentOrder,
  releasePaymentOrder,
  paymentOrders,
  reconcilePayment,
  enqueuePaymentNotice,
  leasePaymentNotice,
  finishPaymentNotice,
  paymentNotices,
} from "../../src/lib/server/store/payments";
import {
  stripeNotice,
  verifiedStripeState,
  ensureCheckout,
} from "../../src/lib/server/stripe-provider";
import { processOnePaymentNotice } from "../../src/lib/server/payment-worker";

test("Stripe durable orders reconcile duplicates, proportional refunds, disputes, leases and crash recovery", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  const db = client.db("owned_stripe_fixture");
  const actor = {
    uid: "stripe-fixture-member",
    authTime: Math.floor(Date.now() / 1000),
  };
  const pack = {
    id: "fixture",
    label: "Fixture 100",
    credits: 100,
    stripePriceId: "price_fixture",
    amountMinor: 300,
    currency: "usd",
  };
  const paid = {
    paid: true,
    expired: false,
    paymentIntentId: "pi_fixture",
    refundedMinor: 0,
    disputed: false,
  };
  try {
    await createCreditIndexes(db);
    await createPaymentIndexes(db);
    let order = await createPaymentOrder(
      db,
      actor,
      "owned-key",
      pack,
      "http://localhost:3000",
    );
    const same = await createPaymentOrder(
      db,
      actor,
      "owned-key",
      { ...pack, credits: 500 },
      "http://localhost:3000",
    );
    assert.equal(same.credits, 100);
    const other = await createPaymentOrder(
      db,
      { ...actor, uid: "other-member" },
      "owned-key",
      pack,
      "http://localhost:3000",
    );
    assert.notEqual(other._id, order._id);
    await t.test(
      "Checkout uses snapshotted server terms and a stable provider idempotency key",
      async () => {
        let created: unknown, options: unknown;
        const price = {
          active: true,
          type: "one_time",
          unit_amount: 300,
          currency: "usd",
          billing_scheme: "per_unit",
        };
        const fake = {
          prices: { retrieve: async () => price },
          checkout: {
            sessions: {
              create: async (params: unknown, request: unknown) => {
                created = params;
                options = request;
                return {
                  id: "cs_fixture",
                  url: "https://checkout.stripe.com/fixture",
                };
              },
            },
          },
        } as unknown as Stripe;
        await ensureCheckout(fake, order);
        assert.deepEqual((created as { line_items: unknown }).line_items, [
          { price: "price_fixture", quantity: 1 },
        ]);
        assert.deepEqual(options, {
          idempotencyKey: `${namespace("checkout")}-${order._id}`,
        });
        assert.equal(
          (created as { metadata: { unibaseOrder: string } }).metadata
            .unibaseOrder,
          order._id,
        );
        assert.equal(
          (created as { success_url: string }).success_url,
          "http://localhost:3000/credits?checkout=returned",
        );
        price.unit_amount = 301;
        await assert.rejects(ensureCheckout(fake, order), {
          code: "PAYMENT_TERMS_MISMATCH",
        });
        await assert.rejects(
          ensureCheckout(fake, {
            ...order,
            createdAt: new Date(Date.now() - 24 * 3600000),
          }),
          { code: "CHECKOUT_CLOSED" },
        );
      },
    );
    await t.test(
      "lease fences competing processors and stale workers",
      async () => {
        const winners = await Promise.all([
          leasePaymentOrder(db, order._id),
          leasePaymentOrder(db, order._id),
        ]);
        assert.equal(winners.filter(Boolean).length, 1);
        const old = winners.find(Boolean)!;
        await paymentOrders(db).updateOne(
          { _id: order._id },
          { $set: { leaseUntil: new Date(0) } },
        );
        const newLease = await leasePaymentOrder(db, order._id);
        await assert.rejects(reconcilePayment(db, old, paid), {
          code: "PAYMENT_RETRY",
        });
        assert.equal((await readWallet(db, actor.uid)).balance, 0);
        await releasePaymentOrder(db, newLease!);
      },
    );
    const apply = async (state: typeof paid) => {
      const leased = await leasePaymentOrder(db, order._id);
      assert.ok(leased);
      try {
        await reconcilePayment(db, leased, state);
      } finally {
        await releasePaymentOrder(db, leased);
      }
      return readWallet(db, actor.uid);
    };
    await t.test(
      "paid replay grants once; cumulative refunds floor without per-event rounding",
      async () => {
        assert.equal((await apply(paid)).balance, 100);
        assert.equal((await apply(paid)).balance, 100);
        assert.equal((await apply({ ...paid, refundedMinor: 1 })).balance, 100);
        assert.equal(
          (await apply({ ...paid, refundedMinor: 100 })).balance,
          67,
        );
        assert.equal(
          (await apply({ ...paid, refundedMinor: 200 })).balance,
          34,
        );
        assert.equal(
          (await apply({ ...paid, refundedMinor: 200 })).balance,
          34,
        );
      },
    );
    await t.test(
      "dispute cancels holds and win restores only remaining entitlement",
      async () => {
        await reserveCredits(db, actor, "owned-hold", 10);
        const debited = await apply({
          ...paid,
          refundedMinor: 200,
          disputed: true,
        });
        assert.equal(debited.balance, 0);
        assert.equal(debited.reserved, 0);
        assert.equal(
          (await apply({ ...paid, refundedMinor: 200, disputed: false }))
            .balance,
          34,
        );
        const hold = await reserveCredits(db, actor, "owned-spend", 30);
        await finishReservation(
          db,
          actor,
          "owned-commit",
          hold.reservationId!,
          "commit",
        );
        assert.equal((await apply({ ...paid, refundedMinor: 300 })).debt, 30);
        assert.equal((await apply({ ...paid, refundedMinor: 300 })).debt, 30);
      },
    );
    await t.test("required order failure rolls back accounting", async () => {
      const fresh = await leasePaymentOrder(db, other._id);
      assert.ok(fresh);
      await paymentOrders(db).updateOne(
        { _id: other._id },
        { $inc: { revision: 1 } },
      );
      await assert.rejects(
        reconcilePayment(db, fresh, { ...paid, paymentIntentId: "pi_other" }),
        { code: "PAYMENT_RETRY" },
      );
      assert.equal((await readWallet(db, other.uid)).balance, 0);
      assert.equal(
        await db.collection("creditLedger").countDocuments({ uid: other.uid }),
        0,
      );
      await releasePaymentOrder(db, fresh);
    });
    await t.test(
      "signed raw notifications retain only identifiers; durable lease retry survives restart",
      async () => {
        const sdk = new Stripe("sk_test_fixture");
        const payload = JSON.stringify({
          id: "evt_fixture",
          type: "charge.refunded",
          livemode: false,
          data: { object: { id: "ch_fixture", private: "do-not-store" } },
        });
        const secret = "whsec_fixture";
        const header = sdk.webhooks.generateTestHeaderString({
          payload,
          secret,
        });
        const event = sdk.webhooks.constructEvent(payload, header, secret);
        assert.throws(() =>
          sdk.webhooks.constructEvent(`${payload} `, header, secret),
        );
        const notice = stripeNotice(event, false)!;
        await Promise.all(
          Array.from({ length: 8 }, () => enqueuePaymentNotice(db, notice)),
        );
        assert.equal(await paymentNotices(db).countDocuments({}), 1);
        assert.equal(
          JSON.stringify(
            await paymentNotices(db).findOne({ _id: notice._id }),
          ).includes("do-not-store"),
          false,
        );
        const crashed = await leasePaymentNotice(db);
        assert.ok(crashed);
        assert.equal(await leasePaymentNotice(db), null);
        await paymentNotices(db).updateOne(
          { _id: notice._id },
          { $set: { leaseUntil: new Date(0) } },
        );
        const retry = await leasePaymentNotice(db);
        assert.ok(retry);
        assert.equal(retry.attempts, 2);
        await finishPaymentNotice(db, crashed, true);
        assert.equal(
          (await paymentNotices(db).findOne({ _id: notice._id }))?.status,
          "pending",
        );
        await finishPaymentNotice(db, retry, true);
        assert.equal(
          (await paymentNotices(db).findOne({ _id: notice._id }))?.status,
          "done",
        );
      },
    );
    await t.test(
      "canonical provider retrieval handles reversed event order and validates order price/account terms",
      async () => {
        order = (await paymentOrders(db).findOne({ _id: order._id }))!;
        await paymentOrders(db).updateOne(
          { _id: order._id },
          { $set: { sessionId: "cs_fixture" } },
        );
        order.sessionId = "cs_fixture";
        const checkout = {
          id: "cs_fixture",
          mode: "payment",
          payment_status: "paid",
          client_reference_id: order._id,
          metadata: { unibaseOrder: order._id },
          amount_total: 300,
          currency: "usd",
          payment_intent: "pi_fixture",
        };
        const charge = {
          id: "ch_fixture",
          paid: true,
          captured: true,
          amount: 300,
          currency: "usd",
          payment_intent: "pi_fixture",
          amount_refunded: 300,
        };
        const fake = {
          checkout: {
            sessions: {
              retrieve: async () => checkout,
              listLineItems: async () => ({
                has_more: false,
                data: [{ quantity: 1, price: { id: "price_fixture" } }],
              }),
            },
          },
          paymentIntents: {
            retrieve: async () => ({
              id: "pi_fixture",
              metadata: { unibaseOrder: order._id },
              status: "succeeded",
              amount_received: 300,
              currency: "usd",
              latest_charge: "ch_fixture",
            }),
          },
          charges: { retrieve: async () => charge },
          refunds: {
            list: async () => ({
              has_more: false,
              data: [
                { status: "succeeded", amount: 300, currency: "usd" },
                { status: "pending", amount: 50, currency: "usd" },
              ],
            }),
          },
          disputes: { list: async () => ({ has_more: false, data: [] }) },
        } as unknown as Stripe;
        assert.equal(
          (await verifiedStripeState(fake, order)).refundedMinor,
          300,
        );
        await enqueuePaymentNotice(db, {
          _id: `stripe:${randomUUID()}`,
          type: "checkout.session.completed",
          objectId: "cs_fixture",
        });
        assert.equal(await processOnePaymentNotice(db, fake), true);
        assert.equal((await readWallet(db, actor.uid)).debt, 30); // old success cannot undo canonical refund
        checkout.amount_total = 301;
        await assert.rejects(verifiedStripeState(fake, order), {
          code: "PAYMENT_TERMS_MISMATCH",
        });
      },
    );
    assert.equal(
      (
        await db
          .collection("creditLedger")
          .aggregate([
            { $match: { uid: actor.uid } },
            { $group: { _id: null, sum: { $sum: "$delta" } } },
          ])
          .toArray()
      )[0].sum,
      -30,
    );
    assert.equal(
      (await paymentNotices(db).indexes()).some(
        (index) => "expireAfterSeconds" in index,
      ),
      false,
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
