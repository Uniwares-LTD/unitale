import { z } from "zod";
import { playInstructionSchema } from "../contracts/purchase-client";
export const PLAY_METHOD = "https://play.google.com/billing";
export const playQuoteSchema = z.object({
  bridgeVersion: z.literal(1),
  kind: z.literal("quote"),
  sku: z.string(),
  priceId: z.string(),
  offerId: z.string().nullable(),
  title: z.string(),
  quoteId: z.string().regex(/^[a-f0-9]{64}$/),
  phases: z
    .array(
      z.object({
        formattedPrice: z.string(),
        currency: z.string(),
        micros: z.string().regex(/^\d+$/),
        period: z.string(),
        cycles: z.number().int().nonnegative(),
        recurrence: z.number().int(),
      }),
    )
    .min(1)
    .max(10),
});
export type PlayQuote = z.infer<typeof playQuoteSchema>;
export type PlayInstruction = z.infer<typeof playInstructionSchema>;
export interface DigitalGoods {
  listPurchases(): Promise<{ itemId: string; purchaseToken: string }[]>;
}
export type PaymentFactory = (
  methods: PaymentMethodData[],
  details: PaymentDetailsInit,
) => {
  show(): Promise<{
    details: unknown;
    complete(result: PaymentComplete): Promise<void>;
  }>;
};
export function playRequest(
  instruction: PlayInstruction,
  operation: "quote" | "purchase",
  factory: PaymentFactory,
  quote?: PlayQuote,
  oldPurchaseToken?: string,
) {
  const value = playInstructionSchema.parse(instruction);
  if (
    operation === "purchase" &&
    (!quote ||
      quote.sku !== value.product.productId ||
      quote.priceId !== value.product.priceId ||
      quote.offerId !== value.product.offerId ||
      !!value.oldProductId !== !!oldPurchaseToken)
  )
    throw new Error("Play quote or replacement identity changed.");
  const data = {
    bridgeVersion: 1,
    operation,
    sku: value.product.productId,
    productType: value.billing === "subscription" ? "subs" : "inapp",
    priceId: value.product.priceId,
    offerId: value.product.offerId,
    ...(operation === "purchase"
      ? { accountBinding: value.accountBinding, quoteId: quote!.quoteId }
      : {}),
    ...(oldPurchaseToken
      ? { oldPurchaseToken, replacementMode: "DEFERRED" }
      : {}),
  };
  // show() starts synchronously in the user's click handler, before any awaited work.
  const pending = factory([{ supportedMethods: PLAY_METHOD, data }], {
    total: { label: "Google Play", amount: { currency: "USD", value: "0" } },
  }).show();
  return pending.then(async (response) => {
    try {
      const result =
        operation === "quote"
          ? playQuoteSchema.parse(response.details)
          : z
              .object({
                bridgeVersion: z.literal(1),
                kind: z.literal("purchase"),
                purchaseToken: z.string().min(1).max(4096),
              })
              .parse(response.details);
      if (
        result.kind === "quote" &&
        (result.sku !== value.product.productId ||
          result.priceId !== value.product.priceId ||
          result.offerId !== value.product.offerId)
      )
        throw new Error("Store returned another product.");
      await response.complete("success");
      return result;
    } catch (error) {
      await response.complete("fail").catch(() => {});
      throw error;
    }
  });
}
export async function ownedPlayToken(
  goods: DigitalGoods,
  productId: string,
  fallbackProductId?: string,
) {
  const purchases = await goods.listPurchases();
  let matches = purchases.filter((p) => p.itemId === productId);
  if (matches.length === 0 && fallbackProductId)
    matches = purchases.filter((p) => p.itemId === fallbackProductId);
  if (matches.length !== 1)
    throw new Error("Select an unambiguous owned Play purchase.");
  return z.string().min(1).max(4096).parse(matches[0].purchaseToken);
}

export async function subscriptionActionKey(
  checkoutId: string,
  kind: string,
  offer?: { id: string; revision: number },
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([checkoutId, kind, offer ?? null])),
  );
  return Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
