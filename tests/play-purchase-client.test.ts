import assert from "node:assert/strict";
import { test } from "node:test";
import {
  playRequest,
  ownedPlayToken,
  subscriptionActionKey,
  type PaymentFactory,
  type PlayInstruction,
  type PlayQuote,
} from "../src/lib/client/play-billing";
import { paymentContext } from "../src/lib/payment-context";
const instruction: PlayInstruction = {
  channel: "google-play",
  checkoutId: "checkout",
  accountBinding: "a".repeat(64),
  product: { productId: "book", priceId: "monthly", offerId: "discount" },
  billing: "subscription",
};
const quote: PlayQuote = {
  bridgeVersion: 1,
  kind: "quote",
  sku: "book",
  priceId: "monthly",
  offerId: "discount",
  title: "Book",
  quoteId: "b".repeat(64),
  phases: [
    {
      formattedPrice: "$5",
      currency: "USD",
      micros: "5000000",
      period: "P1M",
      cycles: 0,
      recurrence: 1,
    },
  ],
};
test("Play purchase selects the accepted plan and binding, synchronously from the gesture", async () => {
  let shown = 0;
  const calls: unknown[] = [];
  const factory: PaymentFactory = (methods) => {
    calls.push(methods[0].data);
    return {
      show: () => {
        shown++;
        return Promise.resolve({
          details: {
            bridgeVersion: 1,
            kind: "purchase",
            purchaseToken: "token",
          },
          complete: async (result) => {
            assert.equal(result, "success");
          },
        });
      },
    };
  };
  const result = playRequest(
    { ...instruction, oldProductId: "previous" },
    "purchase",
    factory,
    quote,
    "old-token",
  );
  assert.equal(shown, 1);
  assert.deepEqual(calls, [
    {
      bridgeVersion: 1,
      operation: "purchase",
      sku: "book",
      productType: "subs",
      priceId: "monthly",
      offerId: "discount",
      accountBinding: instruction.accountBinding,
      quoteId: quote.quoteId,
      oldPurchaseToken: "old-token",
      replacementMode: "DEFERRED",
    },
  ]);
  assert.equal((await result).kind, "purchase");
});
test("wrong quotes and ambiguous restores fail without invoking payment", async () => {
  const noCall: PaymentFactory = () => {
    throw new Error("Must not call");
  };
  assert.throws(
    () =>
      playRequest(instruction, "purchase", noCall, {
        ...quote,
        priceId: "other",
      }),
    /identity changed/,
  );
  assert.throws(
    () =>
      playRequest(
        { ...instruction, oldProductId: "old" },
        "purchase",
        noCall,
        quote,
      ),
    /identity changed/,
  );
  await assert.rejects(
    ownedPlayToken(
      {
        listPurchases: async () => [
          { itemId: "book", purchaseToken: "one" },
          { itemId: "book", purchaseToken: "two" },
        ],
      },
      "book",
    ),
    /unambiguous/,
  );
  await assert.rejects(
    ownedPlayToken({ listPurchases: async () => [] }, "book"),
    /unambiguous/,
  );
});
test("unknown Payment Request outcome never replays and malformed output fails completion", async () => {
  let calls = 0;
  await assert.rejects(
    playRequest(
      instruction,
      "purchase",
      () => ({
        show: async () => {
          calls++;
          throw new Error("Disconnected");
        },
      }),
      quote,
    ),
    /Disconnected/,
  );
  assert.equal(calls, 1);
  let completed = "";
  await assert.rejects(
    playRequest(instruction, "quote", () => ({
      show: async () => ({
        details: { ...quote, sku: "foreign" },
        complete: async (result) => {
          completed = result;
        },
      }),
    })),
    /another product/,
  );
  assert.equal(completed, "fail");
});
test("known Play contexts fail closed even if Digital Goods is unavailable", async () => {
  for (const input of [
    { markedPlay: true, referrer: "", search: "" },
    { markedPlay: false, referrer: "android-app://app", search: "" },
    { markedPlay: false, referrer: "", search: "?client=play" },
  ]) {
    assert.equal(
      await paymentContext({
        ...input,
        digitalGoods: async () => {
          throw new Error("Unavailable");
        },
      }),
      "play",
    );
  }
});

test("subscription action identity survives reload and changes with accepted terms", async () => {
  assert.equal(
    await subscriptionActionKey("checkout", "cancel"),
    await subscriptionActionKey("checkout", "cancel"),
  );
  assert.notEqual(
    await subscriptionActionKey("checkout", "plan-change", {
      id: "offer",
      revision: 1,
    }),
    await subscriptionActionKey("checkout", "plan-change", {
      id: "offer",
      revision: 2,
    }),
  );
  assert.equal(
    await ownedPlayToken(
      {
        listPurchases: async () => [{ itemId: "old", purchaseToken: "token" }],
      },
      "new",
      "old",
    ),
    "token",
  );
});
