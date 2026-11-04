import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import { purchaseTermsSchema } from "../../contracts/commerce";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";
import { grantCredits, readWallet, reversePurchase } from "../store/credits";
import type { CreditActor } from "../store/credit-types";
import { publishedCatalog } from "./catalogs";
import {
  retainEvidence,
  releaseOperationEvidence,
} from "../execution/measurements";
import {
  recordVerifiedPayment,
  finalizePromotion,
  releasePromotion,
} from "./promotions";

export type PurchaseTerms = z.infer<typeof purchaseTermsSchema>;
export type BillingChannel = PurchaseTerms["channel"];
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const conflict = (message: string) =>
  new AppError("BILLING_CONFLICT", message, 409);
export type BillingIntent = {
  _id: string;
  uid: string;
  checkoutId: string;
  hash: string;
  offerId: string;
  offerRevision: number;
  terms: PurchaseTerms;
  state: "pending" | "active" | "past-due" | "ended" | "revoked";
  providerId: string | null;
  accountBinding: string;
  nextTerms: PurchaseTerms | null;
  nextEffectiveAt?: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
};
const intents = (db: Db) => db.collection<BillingIntent>("billingIntents");
type Slot = { _id: string; intentId: string };
const slots = (db: Db) => db.collection<Slot>("billingSubscriptionSlots");

// Only a canonical server-side provider read may construct this observation.
// Notification bodies and browser purchase assertions are never payment evidence.
export const billingObservationSchema = z
  .strictObject({
    providerId: z.string().min(1).max(4096),
    accountBinding: z.string().min(1).max(128),
    state: z.enum(["pending", "active", "past-due", "ended", "revoked"]),
    periodEnd: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    unpaidOutcome: z.enum(["expired-unpaid", "cancelled-unpaid"]).optional(),
    payments: z
      .array(
        z
          .strictObject({
            id: z.string().min(1).max(512),
            productId: identity,
            priceId: identity,
            offerId: identity.nullable(),
            paidAt: z.iso.datetime(),
            periodStart: z.iso.datetime().nullable(),
            periodEnd: z.iso.datetime().nullable(),
            listedMinor: z.number().int().nonnegative().safe(),
            amountMinor: z.number().int().nonnegative().safe(),
            currency: z.string().regex(/^[A-Z]{3}$/),
            refundedMinor: z.number().int().nonnegative().safe(),
            sequence: z.number().int().positive().safe(),
            providerPromotionId: identity.nullable(),
          })
          .refine(
            (v) => v.refundedMinor <= v.amountMinor,
            "Refund exceeds paid amount.",
          ),
      )
      .max(100),
  })
  .refine(
    (v) => !v.unpaidOutcome || (v.state === "ended" && v.payments.length === 0),
    "Unpaid checkout evidence must be terminal and contain no payments.",
  );
export type BillingObservation = z.infer<typeof billingObservationSchema>;
export interface BillingProvider {
  channel: BillingChannel;
  // Must check configured store/application, live/test mode and canonical account binding.
  inspect(
    intent: BillingIntent,
    providerId: string,
  ): Promise<BillingObservation>;
  replaces?(intent: BillingIntent, providerId: string): Promise<boolean>;
}

export async function beginBilling(
  db: Db,
  actor: CreditActor,
  raw: {
    checkoutId: string;
    offerId: string;
    offerRevision: number;
  },
) {
  const input = z
    .strictObject({
      checkoutId: identity,
      offerId: identity,
      offerRevision: z.number().int().positive().safe(),
    })
    .parse(raw);
  const key = fingerprint([actor.uid, input.checkoutId]);
  const hash = fingerprint(input);
  let result!: BillingIntent;
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const old = await intents(db).findOne({ _id: key }, { session });
      if (old) {
        if (old.hash !== hash) throw conflict("Checkout identity changed.");
        result = old;
        return;
      }
      const published = await publishedCatalog(
        db,
        input.offerId,
        input.offerRevision,
      );
      const current = await publishedCatalog(db, input.offerId);
      if (
        !published ||
        !current ||
        published.definition.kind !== "purchase" ||
        current.revision !== input.offerRevision
      )
        throw conflict("Select a currently published purchase offer.");
      const terms = published.definition.terms;
      if (terms.billing.kind === "subscription") {
        const slot = await slots(db).findOne({ _id: actor.uid }, { session });
        if (slot)
          throw conflict(
            "An active or pending subscription already exists. End it before changing stores.",
          );
        await slots(db).insertOne(
          { _id: actor.uid, intentId: key },
          { session },
        );
      }
      result = {
        _id: key,
        uid: actor.uid,
        ...input,
        hash,
        terms,
        state: "pending",
        providerId: null,
        accountBinding: fingerprint(["billing-account", actor.uid]),
        nextTerms: null,
        periodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
      };
      await intents(db).insertOne(result, { session });
    },
  });
  return result;
}

export async function ownedBilling(
  db: Db,
  actor: CreditActor,
  checkoutId: string,
) {
  let result: BillingIntent | null = null;
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      result = await intents(db).findOne(
        { _id: fingerprint([actor.uid, identity.parse(checkoutId)]) },
        { session },
      );
    },
  });
  if (!result)
    throw new AppError("BILLING_NOT_FOUND", "Purchase was not found.", 404);
  return result as BillingIntent;
}

type GrantRecord = {
  _id: string;
  uid: string;
  intentId: string;
  hash: string;
  terms: PurchaseTerms;
  payment: BillingObservation["payments"][number];
  reference: string;
  expired: boolean;
  refundedMinor: number;
  refundRevision?: number;
};

// Caller holds the durable reconciliation lease. Reads are safe to retry; grants
// and reversals each retain immutable idempotency identities across crashes.
export async function reconcileBilling(
  db: Db,
  intentId: string,
  providerId: string,
  provider: BillingProvider,
) {
  const rows = db.collection<{
    _id: string;
    until: Date;
    token: string;
    revision?: number;
  }>("billingLeases");
  const token = crypto.randomUUID();
  const acquired = await rows.findOneAndUpdate(
    {
      _id: intentId,
      $or: [{ until: { $lte: new Date() } }, { until: { $exists: false } }],
    },
    { $set: { until: new Date(Date.now() + 120000), token } },
    { returnDocument: "after" },
  );
  if (!acquired) {
    try {
      await rows.insertOne({
        _id: intentId,
        until: new Date(Date.now() + 120000),
        token,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw conflict("Purchase reconciliation is already running.");
      throw error;
    }
  }
  try {
    const intent = await intents(db).findOne({ _id: intentId });
    if (!intent || intent.terms.channel !== provider.channel)
      throw conflict("Purchase provider does not match.");
    if (
      intent.providerId &&
      intent.providerId !== providerId &&
      !(
        intent.nextTerms &&
        provider.replaces &&
        (await provider.replaces(intent, providerId))
      )
    )
      throw conflict("Purchase is already bound to another provider identity.");
    const observed = billingObservationSchema.parse(
      await provider.inspect(intent, providerId),
    );
    if (
      observed.providerId !== providerId ||
      observed.accountBinding !== intent.accountBinding
    )
      throw conflict("Provider purchase ownership does not match.");
    if (
      observed.unpaidOutcome &&
      (await db.collection("billingGrants").findOne({ intentId }))
    )
      throw conflict("A previously paid checkout cannot release a promotion.");
    // Validate the complete observed batch before claiming a provider identity.
    // A mismatched restore must not poison the valid checkout's token binding.
    for (const payment of observed.payments) {
      if (
        Date.parse(payment.paidAt) > Date.now() ||
        Date.parse(payment.paidAt) <
          Math.floor(intent.createdAt.getTime() / 1000) * 1000
      )
        throw conflict(
          "Payment timestamp does not match the accepted checkout.",
        );
      const previous = await db
        .collection<GrantRecord>("billingGrants")
        .findOne({ _id: fingerprint([provider.channel, payment.id]) });
      if (
        previous &&
        (previous.uid !== intent.uid || previous.intentId !== intentId)
      )
        throw conflict("Payment belongs to another checkout.");
      const next =
        intent.nextTerms &&
        intent.nextEffectiveAt &&
        payment.periodStart &&
        payment.periodStart >= intent.nextEffectiveAt
          ? intent.nextTerms
          : null;
      const terms = [previous?.terms, next, intent.terms].find(
        (v) =>
          v &&
          v.provider.productId === payment.productId &&
          v.provider.priceId === payment.priceId &&
          v.provider.offerId === payment.offerId,
      );
      if (
        !terms ||
        payment.currency !== terms.price.currency ||
        payment.listedMinor !== terms.price.amountMinor
      )
        throw conflict("Verified payment price differs from accepted terms.");
      if (
        terms.billing.kind === "subscription" &&
        (!payment.periodStart ||
          !payment.periodEnd ||
          payment.periodEnd <= payment.periodStart)
      )
        throw conflict("Subscription payment requires a valid service period.");
    }
    const evidenceId = crypto.randomUUID();
    await retainEvidence(db, intent.uid, {
      id: evidenceId,
      runId: "billing",
      operationId: evidenceId,
      kind: "provider-receipt",
      payload: observed,
      secrets: [providerId],
    });
    const fence = async (session?: import("mongodb").ClientSession) => {
      const held = await rows.updateOne(
        { _id: intentId, token, until: { $gt: new Date() } },
        { $inc: { revision: 1 } },
        { session },
      );
      if (held.matchedCount !== 1)
        throw conflict(
          "Reconciliation lease expired; retrieve provider state again.",
        );
    };
    await fence();
    await readWallet(db, intent.uid, {
      persist: async (session) => {
        await fence(session);
        if (
          intent.terms.billing.kind === "subscription" &&
          !["ended", "revoked"].includes(observed.state)
        ) {
          const slot = await slots(db).findOne(
            { _id: intent.uid },
            { session },
          );
          if (slot && slot.intentId !== intentId)
            throw conflict("Another subscription owns this account.");
          if (!slot)
            await slots(db).insertOne(
              { _id: intent.uid, intentId },
              { session },
            );
        }
        const other = await intents(db).findOne(
          {
            "terms.channel": provider.channel,
            providerId,
            _id: { $ne: intentId },
          },
          { session },
        );
        if (other)
          throw conflict("Provider purchase belongs to another checkout.");
        const bindingId = fingerprint([provider.channel, providerId]);
        const bindings = db.collection<{
          _id: string;
          intentId: string;
          providerId: string;
          sequenceOffset: number;
        }>("billingProviderBindings");
        const binding = await bindings.findOne({ _id: bindingId }, { session });
        if (binding && binding.intentId !== intentId)
          throw conflict(
            "Provider purchase already belongs to another production.",
          );
        const lastGrant =
          !binding && intent.providerId && intent.providerId !== providerId
            ? await db
                .collection("billingGrants")
                .findOne(
                  { intentId },
                  { sort: { "payment.sequence": -1 }, session },
                )
            : null;
        await bindings.updateOne(
          { _id: bindingId },
          {
            $setOnInsert: {
              intentId,
              providerId,
              sequenceOffset: lastGrant?.payment.sequence ?? 0,
            },
          },
          { upsert: true, session },
        );
        await intents(db).updateOne(
          { _id: intentId },
          { $set: { providerId } },
          { session },
        );
      },
    });
    const grants = db.collection<GrantRecord>("billingGrants");
    const activeBinding = await db
      .collection<{ _id: string; sequenceOffset: number }>(
        "billingProviderBindings",
      )
      .findOne({ _id: fingerprint([provider.channel, providerId]) });
    for (const originalPayment of [...observed.payments].sort(
      (a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id),
    )) {
      const payment = { ...originalPayment };
      await fence();
      if (Date.parse(payment.paidAt) > Date.now())
        throw conflict("Payment timestamp is in the future.");
      if (
        Date.parse(payment.paidAt) <
        Math.floor(intent.createdAt.getTime() / 1000) * 1000
      )
        throw conflict("Payment predates the accepted checkout terms.");
      const grantId = fingerprint([provider.channel, payment.id]);
      const old = await grants.findOne({ _id: grantId });
      payment.sequence =
        old?.payment.sequence ??
        payment.sequence + (activeBinding?.sequenceOffset ?? 0);
      const eligibleNext =
        intent.nextTerms &&
        intent.nextEffectiveAt &&
        payment.periodStart &&
        payment.periodStart >= intent.nextEffectiveAt
          ? intent.nextTerms
          : null;
      const candidates = [old?.terms, eligibleNext, intent.terms].filter(
        (v): v is PurchaseTerms => !!v,
      );
      const terms = candidates.find(
        (v) =>
          v.provider.productId === payment.productId &&
          v.provider.priceId === payment.priceId &&
          v.provider.offerId === payment.offerId,
      );
      if (!terms)
        throw conflict("Payment does not match accepted purchase terms.");
      if (
        payment.currency !== terms.price.currency ||
        payment.listedMinor !== terms.price.amountMinor
      )
        throw conflict("Verified payment amount differs from accepted price.");
      const recurring = terms.billing.kind === "subscription";
      if (
        recurring &&
        (!payment.periodStart ||
          !payment.periodEnd ||
          payment.periodEnd <= payment.periodStart)
      )
        throw conflict("Subscription payment requires its service period.");
      if (
        !recurring &&
        (payment.sequence !== 1 || observed.payments.length !== 1)
      )
        throw conflict("One-time purchase cannot grant renewals.");
      const { refundedMinor: _refund, ...immutablePayment } = payment;
      void _refund;
      const hash = fingerprint([intentId, immutablePayment, terms]);
      if (old && (old.hash !== hash || old.uid !== intent.uid))
        throw conflict("Payment identity changed.");
      const expiry = recurring
        ? new Date(Date.parse(payment.paidAt) + 90 * 86400000)
        : null;
      const expired = expiry !== null && expiry <= new Date();
      const reference = "billing:" + grantId;
      const persist = async (session: import("mongodb").ClientSession) => {
        await fence(session);
        const existing = await grants.findOne({ _id: grantId }, { session });
        if (existing) {
          if (existing.hash !== hash)
            throw conflict("Payment identity changed.");
          return;
        }
        await grants.insertOne(
          {
            _id: grantId,
            uid: intent.uid,
            intentId,
            hash,
            terms,
            payment,
            reference,
            expired,
            refundedMinor: 0,
          },
          { session },
        );
      };
      if (!old) {
        if (expired) await readWallet(db, intent.uid, { persist });
        else
          await grantCredits(
            db,
            intent.uid,
            "billing:" + grantId,
            {
              amount: terms.credits,
              source: recurring ? "subscription" : "purchase",
              reference,
              expiresAt: expiry,
            },
            { persist },
          );
      }
      // Use the original evidence identity on retries so changing refund state
      // does not change the immutable promotion-payment identity.
      const paymentEvidenceId = fingerprint([grantId, immutablePayment]);
      if (
        !(await db
          .collection<{ _id: string }>("commerceVerifiedPayments")
          .findOne({ _id: grantId }))
      )
        await retainEvidence(db, intent.uid, {
          id: paymentEvidenceId,
          runId: "billing",
          operationId: paymentEvidenceId,
          kind: "provider-receipt",
          payload: immutablePayment,
        });
      await recordVerifiedPayment(db, {
        channel: provider.channel,
        providerPaymentId: payment.id,
        uid: intent.uid,
        checkoutId: intent.checkoutId,
        offerId: "purchase:" + terms.identity.id,
        offerRevision: terms.identity.revision,
        subscriptionId: recurring ? intent._id : null,
        sequence: payment.sequence,
        paidAt: payment.paidAt,
        providerPromotionId: payment.providerPromotionId,
        evidenceId: paymentEvidenceId,
      });
      const reservation = await db
        .collection("promotionReservations")
        .findOne({ uid: intent.uid, checkoutId: intent.checkoutId });
      if (reservation && reservation.state !== "released") {
        const maximum =
          reservation.promotion.terms.duration.kind === "first-payment"
            ? 1
            : reservation.promotion.terms.duration.count;
        if (
          payment.sequence <= maximum &&
          reservation.offerId === "purchase:" + terms.identity.id &&
          reservation.offerRevision === terms.identity.revision
        )
          await finalizePromotion(
            db,
            intent.uid,
            intent.checkoutId,
            fingerprint([provider.channel, payment.id]),
            { beforePersist: fence },
          );
      }
      const grantBeforeRefund = await grants.findOne({ _id: grantId });
      const refundRevision = grantBeforeRefund?.refundRevision ?? 0;
      const bonus = await db
        .collection("promotionPaymentClaims")
        .findOne({ paymentId: grantId, uid: intent.uid });
      if (bonus?.lotId && payment.amountMinor > 0) {
        const bonusTarget = Number(
          (BigInt(bonus.credited) * BigInt(payment.refundedMinor)) /
            BigInt(payment.amountMinor),
        );
        const bonusLot = await db
          .collection("creditLots")
          .findOne({ _id: bonus.lotId, uid: intent.uid });
        if (bonusLot && bonusLot.reversedCredits !== bonusTarget)
          await reversePurchase(
            db,
            intent.uid,
            "bonus-refund:" +
              fingerprint([grantId, refundRevision, bonusTarget]),
            grantId,
            bonusTarget,
            {
              source: "promotion",
              persist: async (session) => {
                await fence(session);
              },
            },
          );
      }
      const current = await grants.findOne({ _id: grantId });
      if (!current) throw conflict("Payment grant was not retained.");
      if (current.refundedMinor !== payment.refundedMinor) {
        if (!current.expired) {
          const target =
            payment.amountMinor === 0
              ? 0
              : Number(
                  (BigInt(terms.credits) * BigInt(payment.refundedMinor)) /
                    BigInt(payment.amountMinor),
                );
          await reversePurchase(
            db,
            intent.uid,
            "refund:" +
              fingerprint([grantId, refundRevision, payment.refundedMinor]),
            reference,
            target,
            {
              persist: async (session) => {
                await fence(session);
                await grants.updateOne(
                  { _id: grantId },
                  {
                    $set: { refundedMinor: payment.refundedMinor },
                    $inc: { refundRevision: 1 },
                  },
                  { session },
                );
              },
            },
          );
        } else
          await readWallet(db, intent.uid, {
            persist: async (session) => {
              await fence(session);
              await grants.updateOne(
                { _id: grantId },
                {
                  $set: { refundedMinor: payment.refundedMinor },
                  $inc: { refundRevision: 1 },
                },
                { session },
              );
            },
          });
      }
      await releaseOperationEvidence(db, intent.uid, paymentEvidenceId);
    }
    await fence();
    await readWallet(db, intent.uid, {
      persist: async (session) => {
        await fence(session);
        await intents(db).updateOne(
          { _id: intentId },
          {
            $set: {
              state: observed.state,
              periodEnd: observed.periodEnd,
              cancelAtPeriodEnd: observed.cancelAtPeriodEnd,
              ...(intent.nextTerms &&
              intent.nextEffectiveAt &&
              observed.payments.some(
                (p) =>
                  p.periodStart &&
                  p.periodStart >= intent.nextEffectiveAt! &&
                  p.priceId === intent.nextTerms!.provider.priceId,
              )
                ? {
                    terms: intent.nextTerms,
                    nextTerms: null,
                    nextEffectiveAt: null,
                  }
                : {}),
            },
          },
          { session },
        );
        if (
          intent.terms.channel === "google-play" &&
          intent.nextTerms &&
          intent.nextEffectiveAt &&
          observed.payments.some(
            (p) =>
              p.periodStart &&
              p.periodStart >= intent.nextEffectiveAt! &&
              p.priceId === intent.nextTerms!.provider.priceId,
          )
        ) {
          await db.collection("billingProviderActions").updateMany(
            {
              subjectId: intentId,
              kind: "plan-change",
              "input.nextTerms.identity.id": intent.nextTerms.identity.id,
              "input.nextTerms.identity.revision":
                intent.nextTerms.identity.revision,
            },
            {
              $set: {
                state: "verified",
                verifiedAt: new Date(),
                result: {
                  effectiveAt: intent.nextEffectiveAt,
                  verifiedBy: "canonical-payment",
                },
              },
            },
            { session },
          );
        }
        if (observed.state === "ended" || observed.state === "revoked")
          await slots(db).deleteOne({ _id: intent.uid, intentId }, { session });
      },
    });
    if (observed.unpaidOutcome) {
      const reservation = await db.collection("promotionReservations").findOne({
        uid: intent.uid,
        checkoutId: intent.checkoutId,
      });
      if (reservation) {
        if (await db.collection("billingGrants").findOne({ intentId }))
          throw conflict(
            "A previously paid checkout cannot release a promotion.",
          );
        const releaseId = fingerprint([
          "unpaid-checkout",
          intentId,
          providerId,
          observed.unpaidOutcome,
        ]);
        // Stable evidence makes retries after a lost response return the same effect.
        await retainEvidence(db, intent.uid, {
          id: releaseId,
          runId: "billing",
          operationId: releaseId,
          kind: "provider-receipt",
          payload: {
            channel: provider.channel,
            providerId,
            accountBinding: observed.accountBinding,
            outcome: observed.unpaidOutcome,
          },
          secrets: [providerId],
        });
        await releasePromotion(
          db,
          intent.uid,
          intent.checkoutId,
          {
            channel: provider.channel,
            providerCheckoutId: providerId,
            evidenceId: releaseId,
            outcome: observed.unpaidOutcome,
          },
          { beforePersist: fence },
        );
        await releaseOperationEvidence(db, intent.uid, releaseId);
      }
    }
    await releaseOperationEvidence(db, intent.uid, evidenceId);
    return { state: observed.state, payments: observed.payments.length };
  } finally {
    await rows.deleteOne({ _id: intentId, token });
  }
}

export async function createBillingIndexes(db: Db) {
  await intents(db).createIndex(
    { "terms.channel": 1, providerId: 1 },
    {
      unique: true,
      partialFilterExpression: { providerId: { $type: "string" } },
      name: "unique_billing_provider_identity",
    },
  );
  await db.collection("billingGrants").createIndex(
    { intentId: 1, "payment.periodStart": 1 },
    {
      unique: true,
      partialFilterExpression: { "payment.periodStart": { $type: "string" } },
      name: "unique_paid_subscription_period",
    },
  );
}
