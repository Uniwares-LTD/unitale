import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumptionTermsSchema,
  consumptionOrderSchema,
  purchaseTermsSchema,
  promotionTermsSchema,
  subscriptionSchema,
  publicationAttemptSchema,
} from "../src/lib/contracts/commerce";
import {
  executionMeasurementSchema,
  expenditureCoverage,
} from "../src/lib/contracts/execution-measurements";

const identity = { id: "fixture", revision: 1, schemaVersion: 1 };
const terms = {
  identity,
  productType: "fixture",
  productSchemaVersion: 1,
  credits: 50,
  allowances: [
    { category: "revision", unit: "subject", included: 1, extraCredits: 5 },
  ],
};
test("accepted terms reject duplicate allowances and invalid credits", () => {
  assert.equal(consumptionTermsSchema.parse(terms).entitlementDays, null);
  assert.ok(Object.isFrozen(consumptionTermsSchema.parse(terms)));
  assert.throws(() =>
    consumptionTermsSchema.parse({
      ...terms,
      allowances: [...terms.allowances, ...terms.allowances],
    }),
  );
  assert.throws(() => consumptionTermsSchema.parse({ ...terms, credits: -1 }));
});
test("purchase terms encode different expiry policies", () => {
  const value = {
    identity,
    label: "Fixture",
    credits: 100,
    price: { amountMinor: 500, currency: "USD" },
    channel: "stripe",
    billing: { kind: "one-time", creditExpiryDays: null },
    provider: {
      productId: "prod_fixture",
      priceId: "price_fixture",
      offerId: null,
    },
  };
  assert.ok(purchaseTermsSchema.safeParse(value).success);
  assert.ok(
    purchaseTermsSchema.safeParse({
      ...value,
      billing: {
        kind: "subscription",
        interval: "month",
        creditExpiryDays: 90,
      },
    }).success,
  );
  assert.equal(
    purchaseTermsSchema.safeParse({
      ...value,
      billing: {
        kind: "subscription",
        interval: "month",
        creditExpiryDays: null,
      },
    }).success,
    false,
  );
});
test("order state cannot grant a fully refunded entitlement or charge queued work", () => {
  const value = {
    schemaVersion: 1,
    id: "order",
    ownerId: "user",
    targetId: "target",
    idempotencyKey: "key",
    inputHash: "a".repeat(64),
    terms,
    state: "queued",
    chargedCredits: 0,
    refundedCredits: 0,
    chargeLedgerId: null,
    startedAt: null,
    expiresAt: null,
    createdAt: "2026-11-03T00:00:00Z",
  };
  assert.ok(consumptionOrderSchema.safeParse(value).success);
  assert.equal(
    consumptionOrderSchema.safeParse({ ...value, state: "started" }).success,
    false,
  );
  const charged = {
    ...value,
    state: "started",
    chargedCredits: 50,
    chargeLedgerId: "ledger",
    startedAt: value.createdAt,
  };
  assert.ok(consumptionOrderSchema.safeParse(charged).success);
  assert.equal(
    consumptionOrderSchema.safeParse({ ...charged, state: "queued" }).success,
    false,
  );
  assert.equal(
    consumptionOrderSchema.safeParse({ ...charged, refundedCredits: 50 })
      .success,
    false,
  );
  assert.ok(
    consumptionOrderSchema.safeParse({
      ...charged,
      refundedCredits: 50,
      state: "refunded",
    }).success,
  );
  assert.equal(
    consumptionOrderSchema.safeParse({
      ...charged,
      refundedCredits: 51,
      state: "refunded",
    }).success,
    false,
  );
});
test("unknown usage stays unknown and parent summaries do not count as calls", () => {
  const value = executionMeasurementSchema.parse({
    schemaVersion: 1,
    id: "call",
    operationId: "op",
    runId: "run",
    provider: "fake",
    model: null,
    requestId: null,
    workflowRunId: "workflow",
    publicationId: "publication",
    parentMeasurementId: "summary",
    scope: "call",
    authority: "adapter",
    usage: { inputTokens: null, outputTokens: null, additional: [] },
    reportedCost: null,
    estimatedCost: null,
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    elapsedMs: null,
    providerDurationMs: null,
    outcome: "unknown",
    evidence: [],
  });
  assert.deepEqual(
    expenditureCoverage([
      value,
      { ...value, id: "summary", parentMeasurementId: null, scope: "summary" },
    ]),
    { calls: 1, reported: 0, estimatedOnly: 0, unknown: 1 },
  );
  assert.throws(() => expenditureCoverage([value, value]));
  assert.throws(() =>
    executionMeasurementSchema.parse({
      ...value,
      reportedCost: { amount: "0.00123", currency: "USD" },
    }),
  );
  assert.throws(() =>
    executionMeasurementSchema.parse({
      ...value,
      startedAt: "2026-11-03T01:00:00Z",
      completedAt: "2026-11-03T00:00:00Z",
    }),
  );
});
test("promotion snapshots reject stacking, duplicate offers, and invalid limits", () => {
  const value = {
    identity,
    code: "BONUS",
    startsAt: "2026-11-03T00:00:00Z",
    endsAt: "2026-12-03T00:00:00Z",
    offerIds: ["offer"],
    channels: ["stripe", "google-play"],
    maxRedemptions: 10,
    maxPerAccount: 1,
    benefit: { kind: "bonus-credits", credits: 5, creditExpiryDays: null },
    duration: { kind: "first-payment" },
    stacking: false,
  };
  assert.ok(promotionTermsSchema.safeParse(value).success);
  for (const change of [
    { stacking: true },
    { offerIds: ["offer", "offer"] },
    { endsAt: value.startsAt },
    { maxPerAccount: 11 },
  ])
    assert.equal(
      promotionTermsSchema.safeParse({ ...value, ...change }).success,
      false,
    );
});
test("subscription cannot be active without verified payment or switch stores in place", () => {
  const terms = {
    identity,
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
  };
  const value = {
    schemaVersion: 1,
    id: "sub",
    ownerId: "user",
    channel: "stripe",
    providerSubscriptionId: "sub_fixture",
    acceptedTerms: terms,
    state: "active",
    periodStart: "2026-11-03T00:00:00Z",
    periodEnd: "2026-12-03T00:00:00Z",
    cancelAtPeriodEnd: false,
    nextTerms: null,
    lastVerifiedPaymentId: "payment",
  };
  assert.ok(subscriptionSchema.safeParse(value).success);
  assert.equal(
    subscriptionSchema.safeParse({ ...value, lastVerifiedPaymentId: null })
      .success,
    false,
  );
  assert.equal(
    subscriptionSchema.safeParse({
      ...value,
      nextTerms: { ...terms, channel: "google-play" },
    }).success,
    false,
  );
});

test("publication audit accepts the same account UIDs as ownership records", () => {
  const record = {
    schemaVersion: 1,
    id: "publication",
    catalog: identity,
    channel: "stripe",
    expectedProviderRevision: null,
    previewHash: "a".repeat(64),
    state: "prepared",
    providerIds: [],
    evidenceIds: [],
    requestedBy: "admin@example.test",
    requestedAt: "2026-11-03T00:00:00Z",
  };
  assert.equal(
    publicationAttemptSchema.parse(record).requestedBy,
    record.requestedBy,
  );
  assert.equal(
    publicationAttemptSchema.safeParse({ ...record, requestedBy: "" }).success,
    false,
  );
  assert.equal(
    publicationAttemptSchema.safeParse({
      ...record,
      requestedBy: "x".repeat(129),
    }).success,
    false,
  );
});
