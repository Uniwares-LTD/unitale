import "server-only";
import type { Db, Document } from "mongodb";
import { isDeepStrictEqual } from "node:util";

type Index = {
  collection: string;
  key: Record<string, 1 | -1>;
  name?: string;
  unique?: boolean;
  partialFilterExpression?: Document;
};
// Read actual index definitions, including uniqueness, predicates, and absence of TTL.
export const verifyIndexes = (definitions: Index[]) => async (db: Db) => {
  for (const expected of definitions) {
    const name =
      expected.name ??
      Object.entries(expected.key)
        .map(([key, value]) => `${key}_${value}`)
        .join("_");
    const indexes = await db
      .collection(expected.collection)
      .listIndexes()
      .toArray();
    const actual = indexes.find((index) => index.name === name);
    if (
      !actual ||
      !isDeepStrictEqual(
        Object.entries(actual.key),
        Object.entries(expected.key),
      ) ||
      !!actual.unique !== !!expected.unique ||
      !isDeepStrictEqual(
        actual.partialFilterExpression,
        expected.partialFilterExpression,
      ) ||
      actual.expireAfterSeconds !== undefined ||
      !!actual.sparse ||
      !!actual.hidden ||
      (actual.collation !== undefined && actual.collation.locale !== "simple")
    )
      throw new Error("Migration index verification failed.");
  }
};
export const verifyCommerceExecution = verifyIndexes([
  {
    collection: "commerceCatalogVersions",
    key: { catalogId: 1, revision: 1 },
    unique: true,
  },
  {
    collection: "executionMeasurements",
    key: { uid: 1, "value.operationId": 1 },
  },
  { collection: "executionEvidence", key: { expiresAt: 1 } },
  { collection: "executionEvidenceChunks", key: { evidenceId: 1 } },
]);
export const verifyConsumptionPromotions = verifyIndexes([
  {
    collection: "consumptionOrders",
    key: { "value.ownerId": 1, "value.targetId": 1 },
    unique: true,
  },
  {
    collection: "consumptionAllocations",
    key: { orderId: 1, category: 1, subjectId: 1 },
  },
  { collection: "consumptionCharges", key: { uid: 1, orderId: 1 } },
  {
    collection: "promotionReservations",
    key: { "promotion.terms.identity.id": 1, state: 1, uid: 1 },
  },
  { collection: "commerceVerifiedPayments", key: { uid: 1, checkoutId: 1 } },
  {
    collection: "commerceVerifiedPayments",
    key: { channel: 1, subscriptionId: 1, sequence: 1 },
    unique: true,
    partialFilterExpression: { subscriptionId: { $type: "string" } },
  },
  {
    collection: "promotionPaymentClaims",
    key: { reservationId: 1, sequence: 1 },
    unique: true,
  },
]);
export const verifyProviderBilling = verifyIndexes([
  {
    collection: "billingIntents",
    key: { "terms.channel": 1, providerId: 1 },
    unique: true,
    name: "unique_billing_provider_identity",
    partialFilterExpression: { providerId: { $type: "string" } },
  },
  {
    collection: "billingGrants",
    key: { intentId: 1, "payment.periodStart": 1 },
    unique: true,
    name: "unique_paid_subscription_period",
    partialFilterExpression: { "payment.periodStart": { $type: "string" } },
  },
  {
    collection: "creditLedger",
    key: { uid: 1, sequence: -1 },
    unique: true,
    name: "unique_credit_sequence",
  },
  {
    collection: "creditLots",
    key: { source: 1, reference: 1 },
    unique: true,
    name: "unique_credited_purchase",
    partialFilterExpression: { source: "purchase" },
  },
  {
    collection: "creditLots",
    key: { source: 1, reference: 1 },
    unique: true,
    name: "unique_subscription_grant",
    partialFilterExpression: { source: "subscription" },
  },
  { collection: "creditLots", key: { uid: 1, expiresAt: 1, createdAt: 1 } },
  {
    collection: "creditReservations",
    key: { uid: 1, status: 1, expiresAt: 1 },
  },
]);
export async function verifyDomainReferences(db: Db) {
  for (const [name, filter] of [
    [
      "aiJobs",
      {
        "run.artifactId": { $type: "string" },
        "run.target": { $exists: false },
      },
    ],
    [
      "resultApplications",
      { artifactId: { $type: "string" }, target: { $exists: false } },
    ],
  ] as const)
    if (await db.collection(name).findOne(filter))
      throw new Error("Domain metadata verification failed.");
}
export async function verifyAssetVariants(db: Db) {
  let missing = 0;
  for (const [name, filter] of [
    ["runAssets", { status: "ready" }],
    ["productAssets", { state: "ready", "references.0": { $exists: true } }],
  ] as const)
    missing += await db.collection(name).countDocuments({
      ...filter,
      $or: [{ variants: { $exists: false } }, { variants: {} }],
    });
  return {
    warnings: missing
      ? [`${missing} assets retain original images without generated variants.`]
      : [],
  };
}
