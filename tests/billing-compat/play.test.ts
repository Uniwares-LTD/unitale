import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import {
  verifyOneTime,
  acknowledgeSubscription,
  createSubscriptionDraft,
  draft,
} from "./play-adapter";
const purchase = {
  purchaseState: 0,
  consumptionState: 0,
  acknowledgementState: 0,
  orderId: "GPA.once",
  obfuscatedExternalAccountId: "owner",
  productId: "credits",
  quantity: 1,
  refundableQuantity: 1,
};
test("Play consumables require verification and durable delivery before consumption; unknown consumption is not replayed", async () => {
  const calls: string[] = [];
  const fake: typeof fetch = async (url, init) => {
    calls.push(init?.method + " " + String(url));
    if (init?.method === "GET") return Response.json(purchase);
    assert.ok(
      String(url).endsWith("/purchases/products/credits/tokens/token:consume"),
    );
    assert.equal(init?.body, "{}");
    throw new TypeError("lost response");
  };
  assert.equal(
    (await verifyOneTime(fake, "owner", "token", false)).status,
    "verified",
  );
  assert.equal(calls.length, 1);
  assert.equal(
    (await verifyOneTime(fake, "owner", "token", true)).status,
    "unknown",
  );
  assert.equal(calls.filter((c) => c.startsWith("POST")).length, 1);
  await assert.rejects(verifyOneTime(fake, "foreign", "token", false), /Owner/);
  for (const state of [1, 2])
    assert.equal(
      (
        await verifyOneTime(
          async () => Response.json({ ...purchase, purchaseState: state }),
          "owner",
          "token",
          false,
        )
      ).status,
      "no-grant",
    );
  assert.equal(
    (
      await verifyOneTime(
        async () => Response.json({ ...purchase, refundableQuantity: 0 }),
        "owner",
        "token",
        false,
      )
    ).status,
    "no-grant",
  );
});
test("Play subscription acknowledgement uses the subscription endpoint and no consumable call", async () => {
  let calls = 0;
  await acknowledgeSubscription(async (url, init) => {
    calls++;
    assert.ok(
      String(url).endsWith(
        "/purchases/subscriptions/monthly/tokens/token:acknowledge",
      ),
    );
    assert.equal(init?.method, "POST");
    return new Response(null, { status: 204 });
  }, "token");
  assert.equal(calls, 1);
});
test("Play catalog candidate verifies draft readback and preserves uncertain publication", async () => {
  const calls: string[] = [];
  assert.equal(
    (
      await createSubscriptionDraft(async (url, init) => {
        calls.push(String(url));
        if (init?.method === "POST") {
          assert.deepEqual(JSON.parse(String(init.body)), draft);
          assert.ok(String(url).includes("regionsVersion.version="));
        } else assert.ok(String(url).endsWith("/subscriptions/monthly"));
        return Response.json(draft);
      })
    ).status,
    "verified-draft",
  );
  assert.equal(calls.length, 2);
  let attempts = 0;
  assert.equal(
    (
      await createSubscriptionDraft(async () => {
        attempts++;
        throw new TypeError("unknown");
      })
    ).status,
    "unknown",
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    createSubscriptionDraft(async (_url, init) =>
      Response.json(
        init?.method === "POST" ? draft : { ...draft, productId: "wrong" },
      ),
    ),
    /readback/,
  );
});

const networkFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request");
  };
});
after(() => {
  globalThis.fetch = networkFetch;
});
