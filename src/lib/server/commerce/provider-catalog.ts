import "server-only";
import { z } from "zod";
import { fingerprint } from "../foundation/canonical";
import {
  ProviderResponseError,
  pathPart,
  stripeForm,
  type ProviderRequest,
} from "./provider-transport";
import type { ProviderActionAdapter, ProviderAction } from "./provider-actions";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const price = z.number().int().nonnegative().safe();
const providerFields = z.record(z.string(), z.json());
function containsFields(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => containsFields(actual[i], v))
    );
  if (expected && typeof expected === "object")
    return (
      !!actual &&
      typeof actual === "object" &&
      Object.entries(expected).every(([k, v]) =>
        containsFields((actual as Record<string, unknown>)[k], v),
      )
    );
  return actual === expected;
}
export const providerCatalogDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("stripe-product"),
    id,
    name: z.string().min(1).max(160),
  }),
  z.strictObject({
    kind: z.literal("stripe-price"),
    lookupKey: id,
    productId: id,
    currency: z.string().regex(/^[a-z]{3}$/),
    amountMinor: price,
    monthly: z.boolean(),
  }),
  z
    .strictObject({
      kind: z.literal("stripe-coupon"),
      id,
      percentOff: z.number().positive().max(100),
      duration: z.enum(["once", "forever", "repeating"]),
      months: z.number().int().positive().nullable(),
    })
    .refine((v) => (v.duration === "repeating") === (v.months !== null)),
  z.strictObject({
    kind: z.literal("stripe-promotion-code"),
    code: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
    couponId: id,
    maxRedemptions: z.number().int().positive().safe().nullable(),
    expiresAt: z.number().int().positive().safe().nullable(),
  }),
  z
    .strictObject({
      kind: z.literal("play-product-patch"),
      packageName: id,
      productId: id,
      productType: z.enum(["subscriptions", "onetimeproducts"]),
      regionsVersion: id,
      listings: z.array(providerFields).min(1).max(100),
      plans: z.array(providerFields).min(1).max(100),
    })
    .refine(
      (v) => Buffer.byteLength(JSON.stringify(v), "utf8") <= 256000,
      "Provider draft exceeds the publication limit.",
    ),
  z.strictObject({
    kind: z.literal("play-base-plan-activation"),
    packageName: id,
    productId: id,
    basePlanId: id,
  }),
  z.strictObject({
    kind: z.literal("play-offer-activation"),
    packageName: id,
    productId: id,
    basePlanId: id,
    offerId: id,
  }),
]);
// A publication preview contains only the supported provider mutation. More
// complex provider creation is split into independently journalled steps.
export function previewProviderCatalog(raw: unknown) {
  const definition = providerCatalogDraftSchema.parse(raw);
  return { definition, hash: fingerprint(definition) };
}
export function providerCatalogAdapter(
  request: ProviderRequest,
): ProviderActionAdapter {
  const parsed = (action: ProviderAction) => {
    if (action.kind !== "publish")
      throw new Error("Catalog publication action required.");
    return providerCatalogDraftSchema.parse(action.input);
  };
  return {
    async execute(action) {
      const draft = parsed(action);
      if (draft.kind === "stripe-product")
        return request(
          "/v1/products",
          "POST",
          stripeForm({ id: draft.id, name: draft.name }),
          action._id,
        );
      if (draft.kind === "stripe-price")
        return request(
          "/v1/prices",
          "POST",
          stripeForm({
            lookup_key: draft.lookupKey,
            product: draft.productId,
            currency: draft.currency,
            unit_amount: draft.amountMinor,
            ...(draft.monthly ? { recurring: { interval: "month" } } : {}),
          }),
          action._id,
        );
      if (draft.kind === "stripe-coupon")
        return request(
          "/v1/coupons",
          "POST",
          stripeForm({
            id: draft.id,
            percent_off: draft.percentOff,
            duration: draft.duration,
            duration_in_months: draft.months ?? undefined,
          }),
          action._id,
        );
      if (draft.kind === "stripe-promotion-code")
        return request(
          "/v1/promotion_codes",
          "POST",
          stripeForm({
            code: draft.code,
            promotion: { type: "coupon", coupon: draft.couponId },
            max_redemptions: draft.maxRedemptions ?? undefined,
            expires_at: draft.expiresAt ?? undefined,
          }),
          action._id,
        );
      if (draft.kind === "play-product-patch") {
        const planField =
          draft.productType === "subscriptions"
            ? "basePlans"
            : "purchaseOptions";
        return request(
          "/androidpublisher/v3/applications/" +
            pathPart(draft.packageName) +
            "/" +
            draft.productType +
            "/" +
            pathPart(draft.productId) +
            "?allowMissing=true&updateMask=listings," +
            planField +
            "&regionsVersion.version=" +
            pathPart(draft.regionsVersion),
          "PATCH",
          {
            packageName: draft.packageName,
            productId: draft.productId,
            listings: draft.listings,
            [planField]: draft.plans,
          },
        );
      }
      const base =
        "/androidpublisher/v3/applications/" +
        pathPart(draft.packageName) +
        "/subscriptions/" +
        pathPart(draft.productId) +
        "/basePlans/" +
        pathPart(draft.basePlanId);
      return request(
        base +
          (draft.kind === "play-offer-activation"
            ? "/offers/" + pathPart(draft.offerId)
            : "") +
          ":activate",
        "POST",
        {},
      );
    },
    async readback(action) {
      const draft = parsed(action);
      if (draft.kind === "stripe-product") {
        const list = z
          .object({
            data: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                active: z.boolean(),
              }),
            ),
          })
          .parse(await request("/v1/products?ids[]=" + pathPart(draft.id)));
        return (
          list.data.find(
            (v) => v.id === draft.id && v.name === draft.name && v.active,
          ) ?? null
        );
      }
      if (draft.kind === "stripe-price") {
        const list = z
          .object({
            data: z.array(
              z.object({
                id: z.string(),
                product: z.string(),
                currency: z.string(),
                unit_amount: price.nullable(),
                active: z.boolean(),
                recurring: z
                  .object({ interval: z.string(), interval_count: z.number() })
                  .nullable(),
              }),
            ),
          })
          .parse(
            await request(
              "/v1/prices?lookup_keys[]=" + pathPart(draft.lookupKey),
            ),
          );
        return (
          list.data.find(
            (v) =>
              v.product === draft.productId &&
              v.currency === draft.currency &&
              v.unit_amount === draft.amountMinor &&
              v.active &&
              (draft.monthly
                ? v.recurring?.interval === "month" &&
                  v.recurring.interval_count === 1
                : v.recurring === null),
          ) ?? null
        );
      }
      if (draft.kind === "stripe-coupon") {
        // Coupon IDs are client-selected; list/readback avoids treating a 404
        // network error as permission to repeat an uncertain write.
        const list = z
          .object({
            has_more: z.literal(false),
            data: z.array(
              z.object({
                id: z.string(),
                percent_off: z.number().nullable(),
                duration: z.string(),
                duration_in_months: z.number().nullable(),
                valid: z.boolean(),
              }),
            ),
          })
          .parse(await request("/v1/coupons?limit=100"));
        return (
          list.data.find(
            (v) =>
              v.id === draft.id &&
              v.percent_off === draft.percentOff &&
              v.duration === draft.duration &&
              v.duration_in_months === draft.months &&
              v.valid,
          ) ?? null
        );
      }
      if (draft.kind === "stripe-promotion-code") {
        const list = z
          .object({
            has_more: z.literal(false),
            data: z.array(
              z.object({
                id: z.string(),
                code: z.string(),
                active: z.boolean(),
                promotion: z.object({
                  type: z.literal("coupon"),
                  coupon: z.string(),
                }),
                max_redemptions: z.number().nullable(),
                expires_at: z.number().nullable(),
              }),
            ),
          })
          .parse(
            await request(
              "/v1/promotion_codes?code=" + pathPart(draft.code) + "&limit=100",
            ),
          );
        return (
          list.data.find(
            (v) =>
              v.code.toLowerCase() === draft.code.toLowerCase() &&
              v.active &&
              v.promotion.coupon === draft.couponId &&
              v.max_redemptions === draft.maxRedemptions &&
              v.expires_at === draft.expiresAt,
          ) ?? null
        );
      }
      if (draft.kind === "play-product-patch") {
        let actual: unknown;
        try {
          actual = await request(
            "/androidpublisher/v3/applications/" +
              pathPart(draft.packageName) +
              "/" +
              draft.productType +
              "/" +
              pathPart(draft.productId),
          );
        } catch (error) {
          if (
            error instanceof ProviderResponseError &&
            error.providerStatus === 404
          )
            return null;
          throw error;
        }
        const expected = {
          packageName: draft.packageName,
          productId: draft.productId,
          listings: draft.listings,
          [draft.productType === "subscriptions"
            ? "basePlans"
            : "purchaseOptions"]: draft.plans,
        };
        return containsFields(actual, expected)
          ? {
              productId: draft.productId,
              definitionHash: fingerprint(expected),
            }
          : null;
      }
      const root =
        "/androidpublisher/v3/applications/" +
        pathPart(draft.packageName) +
        "/subscriptions/" +
        pathPart(draft.productId);
      if (draft.kind === "play-offer-activation") {
        const offer = z
          .object({
            packageName: z.literal(draft.packageName),
            productId: z.literal(draft.productId),
            basePlanId: z.literal(draft.basePlanId),
            offerId: z.literal(draft.offerId),
            state: z.string(),
          })
          .parse(
            await request(
              root +
                "/basePlans/" +
                pathPart(draft.basePlanId) +
                "/offers/" +
                pathPart(draft.offerId),
            ),
          );
        return offer.state === "ACTIVE" ? offer : null;
      }
      const product = z
        .object({
          packageName: z.literal(draft.packageName),
          productId: z.literal(draft.productId),
          basePlans: z.array(
            z.object({ basePlanId: z.string(), state: z.string() }),
          ),
        })
        .parse(await request(root));
      return (
        product.basePlans.find(
          (v) => v.basePlanId === draft.basePlanId && v.state === "ACTIVE",
        ) ?? null
      );
    },
  };
}
