import { z } from "zod";
import { purchaseTermsSchema } from "./commerce";
export const purchaseOfferSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  terms: purchaseTermsSchema,
});
export const purchaseOffersSchema = z.object({
  offers: z.array(purchaseOfferSchema),
  next: z.string().nullable(),
  playPackage: z.string().nullable(),
});
export const purchaseHistorySchema = z.object({
  purchases: z.array(
    z.object({
      checkoutId: z.string(),
      state: z.enum(["pending", "active", "past-due", "ended", "revoked"]),
      terms: purchaseTermsSchema.unwrap().pick({
        label: true,
        channel: true,
        billing: true,
        provider: true,
        credits: true,
      }),
      periodEnd: z.string().nullable().optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
      nextTerms: purchaseTermsSchema.nullable().optional(),
    }),
  ),
  cursor: z.string().nullable(),
});
export const playInstructionSchema = z.object({
  channel: z.literal("google-play"),
  checkoutId: z.string(),
  accountBinding: z.string().regex(/^[a-f0-9]{64}$/),
  product: purchaseTermsSchema.unwrap().shape.provider,
  billing: z.enum(["one-time", "subscription"]),
  oldProductId: z.string().optional(),
});
export type PurchaseOffer = z.infer<typeof purchaseOfferSchema>;
