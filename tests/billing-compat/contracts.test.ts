import { PlayBillingFeature } from "@bubblewrap/core/dist/lib/features/PlayBillingFeature";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import Stripe from "stripe";
import { z } from "zod";
import { purchaseTermsSchema } from "../../src/lib/contracts/commerce";

const terms = purchaseTermsSchema.parse({
  identity: { schemaVersion: 1, id: "monthly", revision: 1 },
  label: "Fixture",
  credits: 100,
  price: { amountMinor: 500, currency: "USD" },
  channel: "stripe",
  billing: { kind: "subscription", interval: "month", creditExpiryDays: 90 },
  provider: {
    productId: "prod_fixture",
    priceId: "price_fixture",
    offerId: null,
  },
});
function stripeFixture(fetcher: typeof fetch) {
  return new Stripe("sk_test_offline", {
    httpClient: Stripe.createFetchHttpClient(fetcher),
    maxNetworkRetries: 0,
  });
}
const headers = {
  "content-type": "application/json",
  "request-id": "req_offline",
};
test("Stripe SDK creates monthly catalog terms with stable idempotency identity and verifies readback", async () => {
  const calls: string[] = [];
  const stripe = stripeFixture(async (url, init) => {
    calls.push(String(url));
    if (init?.method === "POST") {
      assert.equal(
        new Headers(init?.headers).get("Idempotency-Key"),
        "catalog-monthly-v1",
      );
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("product"), terms.provider.productId);
      assert.equal(
        body.get("recurring[interval]"),
        terms.billing.kind === "subscription" ? terms.billing.interval : "",
      );
      assert.equal(body.get("unit_amount"), String(terms.price.amountMinor));
      assert.ok(String(url).endsWith("/v1/prices"));
    } else assert.ok(String(url).endsWith("/v1/prices/price_fixture"));
    return Response.json(
      {
        id: "price_fixture",
        object: "price",
        product: "prod_fixture",
        active: true,
        unit_amount: 500,
        currency: "usd",
        type: "recurring",
        recurring: { interval: "month" },
      },
      { headers },
    );
  });
  const price = await stripe.prices.create(
    {
      product: "prod_fixture",
      unit_amount: 500,
      currency: "usd",
      recurring: { interval: "month" },
    },
    { idempotencyKey: "catalog-monthly-v1" },
  );
  assert.equal(price.id, terms.provider.priceId);
  assert.equal(price.unit_amount, terms.price.amountMinor);
  const readback = await stripe.prices.retrieve(price.id);
  assert.equal(readback.unit_amount, price.unit_amount);
  assert.equal(readback.product, terms.provider.productId);
  assert.equal(calls.length, 2);
});
test("Stripe webhook signatures authenticate notices; payment comes from invoice retrieval, not event ID", async () => {
  const stripe = stripeFixture(async (url) => {
    assert.ok(String(url).endsWith("/v1/invoices/in_fixture"));
    return Response.json(
      {
        id: "in_fixture",
        object: "invoice",
        status: "paid",
        amount_paid: 500,
        currency: "usd",
        customer: "cus_fixture",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_fixture" },
        },
      },
      { headers },
    );
  });
  const payload = JSON.stringify({
    id: "evt_notice",
    type: "invoice.paid",
    data: { object: { id: "in_fixture" } },
  });
  const secret = "whsec_offline_fixture";
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  assert.equal(
    stripe.webhooks.constructEvent(payload, signature, secret).type,
    "invoice.paid",
  );
  assert.throws(() =>
    stripe.webhooks.constructEvent(payload + " ", signature, secret),
  );
  const invoice = await stripe.invoices.retrieve("in_fixture");
  assert.equal(invoice.status, "paid");
  assert.equal(invoice.amount_paid, terms.price.amountMinor);
  assert.equal(
    invoice.parent?.subscription_details?.subscription,
    "sub_fixture",
  );
  assert.equal(invoice.id, "in_fixture"); // Renewal grant key; event delivery IDs are not grant keys.
});
test("Stripe uncertain catalog writes are not automatically replayed by the SDK", async () => {
  let calls = 0;
  const stripe = stripeFixture(async () => {
    calls++;
    throw new TypeError("offline dropped response");
  });
  await assert.rejects(
    stripe.products.create(
      { name: "Fixture" },
      { idempotencyKey: "publication-1" },
    ),
  );
  assert.equal(calls, 1);
});
const subscription = z.object({
  subscriptionState: z.enum([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_PENDING",
    "SUBSCRIPTION_STATE_CANCELED",
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
  ]),
  acknowledgementState: z.enum([
    "ACKNOWLEDGEMENT_STATE_PENDING",
    "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  ]),
  externalAccountIdentifiers: z.object({
    obfuscatedExternalAccountId: z.string(),
  }),
  lineItems: z
    .array(
      z.object({
        productId: z.string(),
        expiryTime: z.iso.datetime(),
        latestSuccessfulOrderId: z.string().min(1).optional(),
        autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean() }),
      }),
    )
    .length(1),
});
async function restorePlay(
  fetcher: typeof fetch,
  token: string,
  owner: string,
) {
  const response = await fetcher(
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/test.app/purchases/subscriptionsv2/tokens/" +
      encodeURIComponent(token),
    { method: "GET" },
  );
  if (!response.ok) throw new Error("Verification unavailable; no grant.");
  const value = subscription.parse(await response.json());
  if (
    value.externalAccountIdentifiers.obfuscatedExternalAccountId !== owner ||
    value.lineItems[0].productId !== "monthly"
  )
    throw new Error("Purchase ownership or product mismatch.");
  return {
    value,
    grantKey:
      [
        "SUBSCRIPTION_STATE_ACTIVE",
        "SUBSCRIPTION_STATE_CANCELED",
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
      ].includes(value.subscriptionState) &&
      Date.parse(value.lineItems[0].expiryTime) >
        Date.parse("2026-11-04T00:00:00Z")
        ? (value.lineItems[0].latestSuccessfulOrderId ?? null)
        : null,
    acknowledge:
      value.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE" &&
      value.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
  };
}
const playPurchase = {
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  externalAccountIdentifiers: { obfuscatedExternalAccountId: "owner-hash" },
  lineItems: [
    {
      productId: "monthly",
      expiryTime: "2026-12-04T00:00:00Z",
      latestSuccessfulOrderId: "GPA.fixture..0",
      autoRenewingPlan: { autoRenewEnabled: true },
    },
  ],
};
test("Play restoration and RTDN re-query current server state and use order identity for renewal", async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.equal(init?.method, "GET");
    assert.ok(String(url).endsWith("/subscriptionsv2/tokens/token-fixture"));
    return Response.json(playPurchase);
  };
  const first = await restorePlay(fake, "token-fixture", "owner-hash");
  const restored = await restorePlay(fake, "token-fixture", "owner-hash");
  assert.equal(first.grantKey, restored.grantKey);
  assert.equal(first.acknowledge, true);
  await assert.rejects(
    restorePlay(fake, "token-fixture", "foreign"),
    /ownership/,
  );
  for (const state of [
    "SUBSCRIPTION_STATE_PENDING",
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
  ]) {
    const result = await restorePlay(
      async () => Response.json({ ...playPurchase, subscriptionState: state }),
      "token-fixture",
      "owner-hash",
    );
    assert.equal(result.grantKey, null);
    assert.equal(result.acknowledge, false);
  }
  for (const state of [
    "SUBSCRIPTION_STATE_CANCELED",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  ]) {
    const restoredPaid = await restorePlay(
      async () => Response.json({ ...playPurchase, subscriptionState: state }),
      "token-fixture",
      "owner-hash",
    );
    assert.equal(restoredPaid.grantKey, first.grantKey);
    assert.equal(restoredPaid.acknowledge, false);
  }
  const renewal = await restorePlay(
    async () =>
      Response.json({
        ...playPurchase,
        lineItems: [
          {
            ...playPurchase.lineItems[0],
            latestSuccessfulOrderId: "GPA.fixture..1",
          },
        ],
      }),
    "token-fixture",
    "owner-hash",
  );
  assert.notEqual(first.grantKey, renewal.grantKey);
  await assert.rejects(
    restorePlay(
      async () => new Response(null, { status: 503 }),
      "token-fixture",
      "owner-hash",
    ),
  );
});
test("TWA bridge contract uses store prices, restores tokens and fails closed in Play context", async () => {
  const calls: string[] = [];
  const bridge = {
    async getDetails(ids: string[]) {
      calls.push("details");
      assert.deepEqual(ids, ["monthly"]);
      return [{ itemId: "monthly", price: { currency: "USD", value: "5.00" } }];
    },
    async listPurchases() {
      calls.push("restore");
      return [{ itemId: "monthly", purchaseToken: "token-fixture" }];
    },
  };
  const details = await bridge.getDetails(["monthly"]);
  assert.equal(details[0].price.value, "5.00");
  assert.equal(
    (await bridge.listPurchases())[0].purchaseToken,
    "token-fixture",
  );
  assert.deepEqual(calls, ["details", "restore"]);
  const channel = (playContext: boolean, available: boolean) =>
    playContext ? (available ? "google-play" : "unavailable") : "stripe";
  assert.equal(channel(true, false), "unavailable");
  assert.equal(channel(true, true), "google-play");
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

test("installed Bubblewrap billing feature supplies the Android bridge and delegation service", () => {
  const feature = new PlayBillingFeature();
  assert.ok(
    feature.buildGradle.dependencies.includes(
      "com.google.androidbrowserhelper:billing:1.2.0",
    ),
  );
  assert.match(feature.androidManifest.components.join(""), /PaymentActivity/);
  assert.match(feature.androidManifest.components.join(""), /PaymentService/);
  assert.match(
    feature.delegationService.onCreate ?? "",
    /DigitalGoodsRequestHandler/,
  );
});
