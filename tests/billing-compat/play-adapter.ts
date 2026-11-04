// Offline HTTP contract candidate for T10; never registered in production.
import { z } from "zod";
const root =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/test.app";
const productPurchase = z.object({
  purchaseState: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  consumptionState: z.union([z.literal(0), z.literal(1)]),
  acknowledgementState: z.union([z.literal(0), z.literal(1)]),
  orderId: z.string().min(1),
  obfuscatedExternalAccountId: z.string().min(1),
  productId: z.literal("credits"),
  quantity: z.literal(1),
  refundableQuantity: z.number().int().min(0).max(1),
});
export async function verifyOneTime(
  fetcher: typeof fetch,
  owner: string,
  token: string,
  granted: boolean,
) {
  const path =
    root + "/purchases/products/credits/tokens/" + encodeURIComponent(token);
  const response = await fetcher(path, { method: "GET" });
  if (!response.ok) throw new Error("Verification unavailable");
  const purchase = productPurchase.parse(await response.json());
  if (purchase.obfuscatedExternalAccountId !== owner)
    throw new Error("Owner mismatch");
  if (purchase.purchaseState !== 0 || purchase.refundableQuantity === 0)
    return { status: "no-grant" as const, orderId: purchase.orderId };
  if (!granted)
    return { status: "verified" as const, orderId: purchase.orderId };
  if (purchase.consumptionState === 0) {
    // Consumption acknowledges a consumable purchase. Credit delivery must commit first.
    try {
      const consumed = await fetcher(path + ":consume", {
        method: "POST",
        body: "{}",
      });
      if (!consumed.ok)
        return { status: "unknown" as const, orderId: purchase.orderId };
    } catch {
      return { status: "unknown" as const, orderId: purchase.orderId };
    }
  }
  return { status: "consumed" as const, orderId: purchase.orderId };
}
export async function acknowledgeSubscription(
  fetcher: typeof fetch,
  token: string,
) {
  const response = await fetcher(
    root +
      "/purchases/subscriptions/monthly/tokens/" +
      encodeURIComponent(token) +
      ":acknowledge",
    { method: "POST", body: "{}" },
  );
  if (!response.ok) throw new Error("Acknowledgement requires reconciliation");
}
export const draft = {
  packageName: "test.app",
  productId: "monthly",
  basePlans: [
    {
      basePlanId: "monthly-base",
      state: "DRAFT",
      autoRenewingBasePlanType: { billingPeriodDuration: "P1M" },
      regionalConfigs: [
        {
          regionCode: "US",
          newSubscriberAvailability: true,
          price: { currencyCode: "USD", units: "5", nanos: 0 },
        },
      ],
    },
  ],
  listings: [
    {
      languageCode: "en-US",
      title: "Offline fixture",
      benefits: ["Fixture credits"],
    },
  ],
};
export async function createSubscriptionDraft(fetcher: typeof fetch) {
  try {
    const response = await fetcher(
      root +
        "/subscriptions?productId=monthly&regionsVersion.version=2022%2F02",
      {
        method: "POST",
        body: JSON.stringify(draft),
        headers: { "content-type": "application/json" },
      },
    );
    if (!response.ok) return { status: "unknown" as const };
  } catch {
    return { status: "unknown" as const };
  }
  const readback = await fetcher(root + "/subscriptions/monthly", {
    method: "GET",
  });
  if (!readback.ok) return { status: "unknown" as const };
  const value = z
    .object({
      packageName: z.string(),
      productId: z.string(),
      basePlans: z.array(
        z.object({
          basePlanId: z.string(),
          state: z.string(),
          autoRenewingBasePlanType: z.object({
            billingPeriodDuration: z.string(),
          }),
          regionalConfigs: z.array(
            z.object({
              regionCode: z.string(),
              newSubscriberAvailability: z.boolean(),
              price: z.object({
                currencyCode: z.string(),
                units: z.string(),
                nanos: z.number(),
              }),
            }),
          ),
        }),
      ),
      listings: z.array(
        z.object({
          languageCode: z.string(),
          title: z.string(),
          benefits: z.array(z.string()),
        }),
      ),
    })
    .parse(await readback.json());
  if (JSON.stringify(value) !== JSON.stringify(draft))
    throw new Error("Catalog readback mismatch");
  return { status: "verified-draft" as const };
}
