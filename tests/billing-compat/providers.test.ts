import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  providerTransport,
  stripeForm,
} from "../../src/lib/server/commerce/provider-transport";
import { StripeBillingProvider } from "../../src/lib/server/commerce/stripe-billing";
import {
  PlayBillingProvider,
  playMinorUnits,
} from "../../src/lib/server/commerce/play-billing";
import { verifyPlayPush } from "../../src/lib/server/commerce/google-auth";
import {
  previewProviderCatalog,
  providerCatalogAdapter,
} from "../../src/lib/server/commerce/provider-catalog";
import type { BillingIntent } from "../../src/lib/server/commerce/billing";
const intent: BillingIntent = {
  _id: "a".repeat(64),
  uid: "owner",
  checkoutId: "checkout",
  hash: "hash",
  offerId: "purchase:monthly",
  offerRevision: 1,
  state: "pending",
  providerId: null,
  accountBinding: "binding",
  nextTerms: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date(),
  terms: {
    identity: { id: "monthly", revision: 1, schemaVersion: 1 },
    label: "Monthly",
    credits: 100,
    price: { amountMinor: 500, currency: "USD" },
    channel: "stripe",
    billing: { kind: "subscription", interval: "month", creditExpiryDays: 90 },
    provider: { productId: "product", priceId: "price", offerId: null },
  },
};
function fixtureRequest(fixtures: Record<string, unknown>) {
  const calls: string[] = [];
  const request = async (path: string, method = "GET") => {
    calls.push(method + " " + path);
    if (!(path in fixtures) || method !== "GET")
      throw new Error("Unexpected network request: " + path);
    return structuredClone(fixtures[path]);
  };
  return { request, calls };
}
test("Stripe canonical recurring invoice identity and structured price data", async () => {
  const fixtures = {
    "/v1/checkout/sessions/session": {
      id: "session",
      livemode: false,
      client_reference_id: "binding",
      status: "complete",
      payment_status: "paid",
      subscription: "sub",
      payment_intent: null,
      currency: "usd",
      amount_total: 500,
      metadata: { billingIntent: intent._id },
    },
    "/v1/subscriptions/sub": {
      id: "sub",
      livemode: false,
      status: "active",
      cancel_at_period_end: false,
      start_date: 100,
      metadata: { billingIntent: intent._id, accountBinding: "binding" },
      items: {
        data: [
          {
            current_period_start: 100,
            current_period_end: 200,
            price: {
              id: "price",
              product: "product",
              recurring: { interval: "month", interval_count: 1 },
            },
            quantity: 1,
          },
        ],
      },
    },
    "/v1/invoices?subscription=sub&limit=100&expand[]=data.discounts": {
      has_more: false,
      data: [
        {
          id: "invoice",
          livemode: false,
          status: "paid",
          amount_paid: 500,
          amount_remaining: 0,
          currency: "usd",
          created: 100,
          status_transitions: { paid_at: 110 },
          lines: {
            has_more: false,
            data: [
              {
                id: "line",
                quantity: 1,
                amount: 500,
                period: { start: 100, end: 200 },
                parent: { subscription_item_details: { proration: false } },
                pricing: {
                  price_details: { price: "price", product: "product" },
                },
              },
            ],
          },
        },
      ],
    },
    "/v1/invoice_payments?invoice=invoice&status=paid&limit=100": {
      has_more: false,
      data: [
        {
          status: "paid",
          payment: { type: "payment_intent", payment_intent: "pi" },
        },
      ],
    },
    "/v1/payment_intents/pi": { status: "succeeded", latest_charge: "charge" },
    "/v1/refunds?payment_intent=pi&limit=100": {
      has_more: false,
      data: [
        { status: "succeeded", amount: 250 },
        { status: "pending", amount: 100 },
      ],
    },
    "/v1/disputes?payment_intent=pi&limit=100": {
      has_more: false,
      data: [{ status: "won" }],
    },
    "/v1/charges/charge": {
      amount: 500,
      amount_refunded: 250,
      disputed: false,
    },
  };
  const fake = fixtureRequest(fixtures);
  const provider = new StripeBillingProvider(fake.request, false);
  const result = await provider.inspect(intent, "session");
  assert.equal(result.payments[0].id, "invoice");
  assert.equal(result.payments[0].refundedMinor, 250);
  assert.equal(result.payments[0].listedMinor, 500);
  assert.equal(result.state, "active");
  await assert.rejects(
    new StripeBillingProvider(fake.request, true).inspect(intent, "session"),
    /accepted terms/,
  );
  assert.ok(fake.calls.every((v) => v.startsWith("GET ")));
});
test("Play canonical order, account binding and exact money conversion", async () => {
  const root = "/androidpublisher/v3/applications/com.example.app";
  const fake = fixtureRequest({
    [root + "/subscriptions/product"]: {
      basePlans: [
        {
          basePlanId: "price",
          autoRenewingBasePlanType: { billingPeriodDuration: "P1M" },
        },
      ],
    },
    [root + "/purchases/subscriptionsv2/tokens/token"]: {
      subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
      externalAccountIdentifiers: { obfuscatedExternalAccountId: "binding" },
      lineItems: [
        {
          productId: "product",
          expiryTime: "2099-01-01T00:00:00Z",
          latestSuccessfulOrderId: "GPA.test..0",
          offerDetails: { basePlanId: "price" },
          autoRenewingPlan: { autoRenewEnabled: false },
        },
      ],
    },
    [root + "/orders/GPA.test..0"]: {
      orderId: "GPA.test..0",
      purchaseToken: "token",
      state: "PROCESSED",
      total: { currencyCode: "USD", units: "5" },
      lineItems: [
        {
          productId: "product",
          listingPrice: { currencyCode: "USD", units: "5" },
          subscriptionDetails: {
            basePlanId: "price",
            servicePeriodStartTime: "2026-01-01T00:00:00Z",
            servicePeriodEndTime: "2026-02-01T00:00:00Z",
          },
        },
      ],
      orderHistory: { processedEvent: { eventTime: "2026-01-01T00:00:00Z" } },
    },
  });
  const recoveredRequest = async (path: string) => {
    if (path === root + "/orders/GPA.test") {
      const order = (await fake.request(root + "/orders/GPA.test..0")) as {
        orderId: string;
      };
      return { ...order, orderId: "GPA.test" };
    }
    return fake.request(path);
  };
  const provider = new PlayBillingProvider(
    recoveredRequest,
    "com.example.app",
    false,
  );
  const result = await provider.inspect(
    { ...intent, terms: { ...intent.terms, channel: "google-play" } },
    "token",
  );
  assert.equal(result.state, "active");
  assert.equal(result.cancelAtPeriodEnd, true);
  assert.equal(result.payments[0].sequence, 2);
  assert.equal(result.payments[0].amountMinor, 500);
  await assert.rejects(
    provider.inspect({ ...intent, accountBinding: "foreign" }, "token"),
  );
  assert.deepEqual(playMinorUnits({ currencyCode: "JPY", units: "500" }), {
    amountMinor: 500,
    currency: "JPY",
  });
  assert.throws(() => playMinorUnits({ currencyCode: "USD", nanos: 1 }));
});
test("provider transport rejects oversized and unexpected network responses", async () => {
  const request = providerTransport(
    "https://api.stripe.com",
    async () => "Bearer fixture",
    async (_url, options) => {
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      return new Response("x".repeat(1024 * 1024 + 1));
    },
  );
  await assert.rejects(request("/v1/prices"), /limit/);
  await assert.rejects(request("//attacker.example"), /path/);
  assert.throws(() =>
    providerTransport("https://attacker.example", async () => "secret"),
  );
  assert.equal(
    stripeForm({ items: [{ price: "p", quantity: 1 }] }),
    "items%5B0%5D%5Bprice%5D=p&items%5B0%5D%5Bquantity%5D=1",
  );
});
test("Play push authentication checks signature, audience, sender and expiry", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture",
    alg: "RS256",
    use: "sig",
  };
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned =
    encode({ alg: "RS256", kid: "fixture" }) +
    "." +
    encode({
      iss: "https://accounts.google.com",
      aud: "https://app.example/api/payments/play/notifications",
      email: "push@example.iam.gserviceaccount.com",
      email_verified: true,
      iat: now,
      exp: now + 300,
      sub: "subject",
    });
  const token =
    unsigned +
    "." +
    sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  const fetcher: typeof fetch = async (url) => {
    assert.equal(url, "https://www.googleapis.com/oauth2/v3/certs");
    return Response.json({ keys: [jwk] });
  };
  await verifyPlayPush(
    "Bearer " + token,
    "https://app.example/api/payments/play/notifications",
    "push@example.iam.gserviceaccount.com",
    fetcher,
  );
  await assert.rejects(
    verifyPlayPush(
      "Bearer " + token,
      "https://other.example",
      "push@example.iam.gserviceaccount.com",
      fetcher,
    ),
  );
  await assert.rejects(
    verifyPlayPush(
      "Bearer " + token.slice(0, -10) + "AAAAAAAAAA",
      "https://app.example/api/payments/play/notifications",
      "push@example.iam.gserviceaccount.com",
      fetcher,
    ),
  );
});
test("provider catalog supports explicit bounded drafts and exact readback", async () => {
  assert.throws(() =>
    previewProviderCatalog({
      kind: "arbitrary-url",
      url: "https://example.com",
    }),
  );
  const draft = previewProviderCatalog({
    kind: "stripe-price",
    lookupKey: "monthly",
    productId: "product",
    currency: "usd",
    amountMinor: 500,
    monthly: true,
  });
  const adapter = providerCatalogAdapter(async () => ({
    data: [
      {
        id: "price",
        product: "product",
        currency: "usd",
        unit_amount: 501,
        active: true,
        recurring: { interval: "month", interval_count: 1 },
      },
    ],
  }));
  assert.equal(
    await adapter.readback({
      _id: "action",
      uid: "admin",
      kind: "publish",
      subjectId: "catalog",
      input: draft.definition,
      hash: draft.hash,
      state: "partial",
      createdAt: new Date(),
      verifiedAt: null,
      result: null,
    }),
    null,
  );
});

test("Stripe cancellation and plan changes retain period-end semantics without proration", async () => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const provider = new StripeBillingProvider(
    async (path, method = "GET", body) => {
      calls.push({ path, method, body });
      if (path === "/v1/subscriptions/sub" && method === "GET")
        return {
          id: "sub",
          livemode: false,
          status: "active",
          cancel_at_period_end: false,
          start_date: 100,
          metadata: {
            billingIntent: intent._id,
            accountBinding: intent.accountBinding,
          },
          items: {
            data: [
              {
                current_period_start: 100,
                current_period_end: 200,
                price: {
                  id: "old",
                  product: "product",
                  recurring: { interval: "month", interval_count: 1 },
                },
                quantity: 1,
              },
            ],
          },
        };
      if (path === "/v1/subscription_schedules" && method === "POST")
        return { id: "schedule" };
      if (path === "/v1/subscription_schedules/schedule" && method === "POST")
        return { id: "schedule" };
      if (path === "/v1/subscriptions/sub" && method === "POST")
        return { id: "sub", cancel_at_period_end: true };
      throw new Error("Unexpected provider request");
    },
    false,
  );
  await provider.deferPlan("sub", intent.terms, "change");
  const phases = new URLSearchParams(
    String(calls.find((v) => v.path.endsWith("/schedule"))?.body),
  );
  assert.equal(phases.get("phases[0][end_date]"), "200");
  assert.equal(phases.get("phases[1][items][0][price]"), "price");
  assert.equal(phases.get("proration_behavior"), "none");
  assert.equal(phases.get("phases[1][proration_behavior]"), "none");
  await provider.cancelAtRenewal("sub", "cancel");
  assert.equal(
    new URLSearchParams(String(calls.at(-1)?.body)).get("cancel_at_period_end"),
    "true",
  );
});
test("Play fulfillment acknowledges subscriptions and verifies the returned state", async () => {
  let acknowledged = false;
  let writes = 0;
  const root = "/androidpublisher/v3/applications/com.example.app";
  const provider = new PlayBillingProvider(
    async (path, method = "GET") => {
      if (
        path === root + "/purchases/subscriptionsv2/tokens/token" &&
        method === "GET"
      )
        return {
          externalAccountIdentifiers: {
            obfuscatedExternalAccountId: "binding",
          },
          acknowledgementState: acknowledged
            ? "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
            : "ACKNOWLEDGEMENT_STATE_PENDING",
          lineItems: [{ autoRenewingPlan: { autoRenewEnabled: true } }],
        };
      if (
        path ===
          root + "/purchases/subscriptions/product/tokens/token:acknowledge" &&
        method === "POST"
      ) {
        acknowledged = true;
        writes++;
        return {};
      }
      throw new Error("Unexpected provider request");
    },
    "com.example.app",
    false,
  );
  const adapter = provider.fulfillment(intent, "token");
  const action = {
    _id: "action",
    uid: "owner",
    subjectId: intent._id,
    kind: "acknowledge" as const,
    input: {},
    hash: "hash",
    state: "prepared" as const,
    createdAt: new Date(),
    verifiedAt: null,
    result: null,
  };
  assert.equal(await adapter.readback(action), null);
  await adapter.execute(action);
  assert.deepEqual(await adapter.readback(action), { acknowledged: true });
  assert.equal(writes, 1);
});

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session",
    livemode: false,
    client_reference_id: "binding",
    status: "open",
    payment_status: "unpaid",
    subscription: null,
    payment_intent: null,
    currency: null,
    amount_total: null,
    metadata: { billingIntent: intent._id },
    url: "https://checkout.stripe.com/example",
    ...overrides,
  };
}
function checkoutAction(): import("../../src/lib/server/commerce/provider-actions").ProviderAction {
  return {
    _id: "action",
    uid: intent.uid,
    kind: "checkout",
    subjectId: intent._id,
    input: {
      intentId: intent._id,
      providerId: null,
      accountBinding: intent.accountBinding,
      terms: intent.terms,
      nextTerms: null,
      effectiveAt: null,
      providerPromotionId: null,
    },
    hash: "hash",
    state: "unknown",
    createdAt: new Date(100000),
    verifiedAt: null,
    result: null,
  };
}
test("Stripe checkout redirects target the existing credit page", async () => {
  const provider = new StripeBillingProvider(async (_path, method, body) => {
    assert.equal(method, "POST");
    assert.ok(typeof body === "string");
    const form = new URLSearchParams(body);
    assert.equal(form.get("success_url"), "https://example.test/credits");
    assert.equal(form.get("cancel_url"), "https://example.test/credits");
    return checkoutSession();
  }, false);
  await provider.checkout(intent, "https://example.test");
});
test("Stripe recovery traverses more than 100 unrelated sessions without creating another checkout", async () => {
  const calls: string[] = [];
  const provider = new StripeBillingProvider(async (path, method = "GET") => {
    assert.equal(method, "GET");
    calls.push(path);
    if (calls.length === 1)
      return {
        has_more: true,
        data: Array.from({ length: 100 }, (_, i) => ({
          id: "other-" + i,
          livemode: false,
          client_reference_id: null,
          metadata: null,
        })),
      };
    assert.match(path, /starting_after=other-99/);
    return { has_more: false, data: [checkoutSession()] };
  }, false);
  assert.deepEqual(
    await provider.actions("https://example.test").readback(checkoutAction()),
    { id: "session", url: "https://checkout.stripe.com/example" },
  );
  assert.equal(calls.length, 2);
});
test("Stripe recovery fails explicitly on empty or repeating continuation pages", async () => {
  for (const data of [
    [],
    [{ id: "same", livemode: false, client_reference_id: null, metadata: {} }],
  ]) {
    const provider = new StripeBillingProvider(
      async () => ({ has_more: true, data }),
      false,
    );
    await assert.rejects(
      provider.actions("https://example.test").readback(checkoutAction()),
    );
  }
});
test("Stripe distinguishes canonical unpaid expiry from an open checkout", async () => {
  for (const status of ["open", "expired"]) {
    const provider = new StripeBillingProvider(
      async () => checkoutSession({ status }),
      false,
    );
    const observed = await provider.inspect(intent, "session");
    assert.equal(
      observed.unpaidOutcome,
      status === "expired" ? "expired-unpaid" : undefined,
    );
  }
});
test("Play pending subscription cancellation without a service period proves unpaid termination", async () => {
  const provider = new PlayBillingProvider(
    async () => ({
      subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
      externalAccountIdentifiers: { obfuscatedExternalAccountId: "binding" },
      lineItems: [
        { productId: "product", offerDetails: { basePlanId: "price" } },
      ],
    }),
    "com.example.app",
    true,
  );
  const observed = await provider.inspect(
    { ...intent, terms: { ...intent.terms, channel: "google-play" } },
    "token",
  );
  assert.equal(observed.unpaidOutcome, "cancelled-unpaid");
  assert.deepEqual(observed.payments, []);
});

test("Play cancelled one-time orders release capacity only after canonical unpaid confirmation", async () => {
  for (const orderState of ["CANCELED", "PENDING", "PROCESSED"]) {
    const provider = new PlayBillingProvider(
      async (path) =>
        path.includes("/orders/")
          ? {
              orderId: "GPA-order",
              purchaseToken: "token",
              state: orderState,
              total: { currencyCode: "USD", units: "5" },
              lineItems: [
                {
                  productId: "product",
                  listingPrice: { currencyCode: "USD", units: "5" },
                  oneTimePurchaseDetails: {
                    quantity: 1,
                    purchaseOptionId: "price",
                  },
                },
              ],
              orderHistory:
                orderState === "PROCESSED"
                  ? { processedEvent: { eventTime: new Date().toISOString() } }
                  : {},
            }
          : {
              orderId: "GPA-order",
              productLineItem: [{ productId: "product" }],
              obfuscatedExternalAccountId: "binding",
              purchaseStateContext: { purchaseState: "CANCELLED" },
            },
      "com.example.app",
      true,
    );
    const observed = await provider.inspect(
      {
        ...intent,
        terms: {
          ...intent.terms,
          channel: "google-play",
          billing: { kind: "one-time", creditExpiryDays: null },
        },
      },
      "token",
    );
    assert.equal(
      observed.unpaidOutcome,
      orderState === "CANCELED" ? "cancelled-unpaid" : undefined,
    );
  }
});
