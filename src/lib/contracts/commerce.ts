import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const count = z.number().int().nonnegative().safe();
const positive = z.number().int().positive().safe();
const currency = z.string().regex(/^[A-Z]{3}$/);
const timestamp = z.iso.datetime();
const version = z.literal(1);
export const catalogIdentitySchema = z.strictObject({
  id,
  revision: positive,
  schemaVersion: version,
});
export const moneySchema = z.strictObject({ amountMinor: count, currency });
export const revisionAllowanceSchema = z.strictObject({
  category: id,
  unit: z.enum(["request", "subject"]),
  included: count,
  extraCredits: count.nullable(), // null means additional purchases are unavailable
});
export const consumptionTermsSchema = z
  .strictObject({
    identity: catalogIdentitySchema,
    productType: id,
    productSchemaVersion: positive,
    credits: positive,
    allowances: z
      .array(revisionAllowanceSchema)
      .refine(
        (items) =>
          new Set(items.map((item) => item.category)).size === items.length,
        "Allowance categories must be unique.",
      ),
    entitlementDays: positive.nullable().default(null),
  })
  .readonly();

export const purchaseTermsSchema = z
  .strictObject({
    identity: catalogIdentitySchema,
    label: z.string().trim().min(1).max(160),
    credits: positive,
    price: moneySchema,
    channel: z.enum(["stripe", "google-play"]),
    billing: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("one-time"),
        creditExpiryDays: z.null(),
      }),
      z.strictObject({
        kind: z.literal("subscription"),
        interval: z.literal("month"),
        creditExpiryDays: z.literal(90),
      }),
    ]),
    provider: z.strictObject({
      productId: id,
      priceId: id,
      offerId: id.nullable(),
    }),
  })
  .readonly();

export const consumptionOrderSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    ownerId: z.string().min(1).max(128),
    targetId: id,
    idempotencyKey: id,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    terms: consumptionTermsSchema,
    state: z.enum(["queued", "started", "closed", "cancelled", "refunded"]),
    chargedCredits: count,
    refundedCredits: count,
    chargeLedgerId: id.nullable(),
    startedAt: timestamp.nullable(),
    expiresAt: timestamp.nullable(),
    createdAt: timestamp,
  })
  .superRefine((value, ctx) => {
    if (value.refundedCredits > value.chargedCredits)
      ctx.addIssue({ code: "custom", message: "Refund exceeds charge." });
    if (
      value.chargedCredits !== 0 &&
      value.chargedCredits !== value.terms.credits
    )
      ctx.addIssue({
        code: "custom",
        message: "Charge must match accepted terms.",
      });
    if (
      value.chargedCredits > 0 !==
      (value.chargeLedgerId !== null && value.startedAt !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Charge requires ledger and start evidence.",
      });
    if (
      value.chargedCredits === 0 &&
      (value.chargeLedgerId !== null || value.startedAt !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Uncharged orders cannot contain charge evidence.",
      });
    if (
      value.state === "queued" &&
      (value.chargedCredits !== 0 || value.startedAt !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Queued orders cannot be charged.",
      });
    if (
      ["started", "closed", "refunded"].includes(value.state) &&
      value.chargedCredits === 0
    )
      ctx.addIssue({
        code: "custom",
        message: "Started orders require a charge.",
      });
    if (
      value.state === "refunded" &&
      value.refundedCredits !== value.chargedCredits
    )
      ctx.addIssue({
        code: "custom",
        message: "Refunded orders must be fully refunded.",
      });
    if (
      value.chargedCredits > 0 &&
      value.refundedCredits === value.chargedCredits &&
      value.state !== "refunded"
    )
      ctx.addIssue({
        code: "custom",
        message: "Fully refunded entitlements must be closed.",
      });
  });

export const entitlementAllocationSchema = z.strictObject({
  schemaVersion: version,
  id,
  orderId: id,
  ownerId: z.string().min(1).max(128),
  requestId: id,
  category: id,
  subjectId: id.nullable(),
  funding: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("included"), ordinal: positive }),
    z.strictObject({ kind: z.literal("paid"), orderId: id }),
  ]),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: timestamp,
});

export const publicationAttemptSchema = z.strictObject({
  schemaVersion: version,
  id,
  catalog: catalogIdentitySchema,
  channel: z.enum(["stripe", "google-play"]),
  expectedProviderRevision: z.string().max(256).nullable(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum([
    "prepared",
    "publishing",
    "verified",
    "partial",
    "unknown",
    "failed",
  ]),
  providerIds: z.array(id),
  evidenceIds: z.array(id),
  requestedBy: z.string().min(1).max(128),
  requestedAt: timestamp,
});
export const promotionTermsSchema = z
  .strictObject({
    identity: catalogIdentitySchema,
    code: z
      .string()
      .regex(/^[A-Z0-9-]{1,64}$/)
      .nullable(),
    startsAt: timestamp,
    endsAt: timestamp,
    offerIds: z.array(id).min(1),
    channels: z.array(z.enum(["stripe", "google-play"])).min(1),
    maxRedemptions: positive,
    maxPerAccount: positive,
    benefit: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("bonus-credits"),
        credits: positive,
        creditExpiryDays: positive.nullable(),
      }),
      z.strictObject({
        kind: z.literal("monetary-discount"),
        providerPromotionId: id,
      }),
    ]),
    duration: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("first-payment") }),
      z.strictObject({ kind: z.literal("payments"), count: positive }),
    ]),
    stacking: z.literal(false),
  })
  .superRefine((v, ctx) => {
    if (Date.parse(v.endsAt) <= Date.parse(v.startsAt))
      ctx.addIssue({
        code: "custom",
        message: "Promotion must end after it starts.",
      });
    if (v.maxPerAccount > v.maxRedemptions)
      ctx.addIssue({
        code: "custom",
        message: "Account limit exceeds global limit.",
      });
    if (
      new Set(v.offerIds).size !== v.offerIds.length ||
      new Set(v.channels).size !== v.channels.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate promotion applicability.",
      });
  });
export const subscriptionSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    ownerId: z.string().min(1).max(128),
    channel: z.enum(["stripe", "google-play"]),
    providerSubscriptionId: z.string().min(1).max(4096),
    acceptedTerms: purchaseTermsSchema,
    state: z.enum(["pending", "active", "past-due", "ended", "revoked"]),
    periodStart: timestamp.nullable(),
    periodEnd: timestamp.nullable(),
    cancelAtPeriodEnd: z.boolean(),
    nextTerms: purchaseTermsSchema.nullable(),
    lastVerifiedPaymentId: id.nullable(),
  })
  .superRefine((v, ctx) => {
    if (
      v.acceptedTerms.billing.kind !== "subscription" ||
      v.acceptedTerms.channel !== v.channel
    )
      ctx.addIssue({
        code: "custom",
        message: "Subscription requires same-channel recurring terms.",
      });
    if (
      v.nextTerms &&
      (v.nextTerms.billing.kind !== "subscription" ||
        v.nextTerms.channel !== v.channel)
    )
      ctx.addIssue({
        code: "custom",
        message: "Cross-store changes require the old subscription to end.",
      });
    if (
      v.state === "active" &&
      (!v.periodStart || !v.periodEnd || !v.lastVerifiedPaymentId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Active subscription requires verified payment and period.",
      });
    if (
      v.periodStart &&
      v.periodEnd &&
      Date.parse(v.periodEnd) <= Date.parse(v.periodStart)
    )
      ctx.addIssue({ code: "custom", message: "Invalid subscription period." });
  });
export type ConsumptionTerms = z.infer<typeof consumptionTermsSchema>;
export type PurchaseTerms = z.infer<typeof purchaseTermsSchema>;
export type ConsumptionOrder = z.infer<typeof consumptionOrderSchema>;
export type EntitlementAllocation = z.infer<typeof entitlementAllocationSchema>;
