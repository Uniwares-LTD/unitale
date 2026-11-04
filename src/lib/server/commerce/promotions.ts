import "server-only";
import { z } from "zod";
import type { Db, ClientSession } from "mongodb";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";
import { readWallet, grantCredits } from "../store/credits";
import type { CreditActor } from "../store/credit-types";
import { catalogDefinitionSchema, publishedCatalog } from "./catalogs";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
type Promotion = Extract<
  z.infer<typeof catalogDefinitionSchema>,
  { kind: "promotion" }
>;
type Reservation = {
  _id: string;
  uid: string;
  checkoutId: string;
  hash: string;
  promotion: Promotion;
  offerId: string;
  offerRevision: number;
  channel: "stripe" | "google-play";
  state: "reserved" | "redeemed" | "released";
  expiresAt: Date;
  subscriptionId: string | null;
  createdAt: Date;
  releaseHash?: string;
};
const reservations = (db: Db) =>
  db.collection<Reservation>("promotionReservations");
const conflict = (message: string) =>
  new AppError("PROMOTION_CONFLICT", message, 409);
export const verifiedPaymentSchema = z
  .strictObject({
    channel: z.enum(["stripe", "google-play"]),
    providerPaymentId: z.string().min(1).max(512),
    uid: z.string().min(1).max(128),
    checkoutId: id,
    offerId: id,
    offerRevision: z.number().int().positive(),
    subscriptionId: z.string().min(1).max(512).nullable(),
    sequence: z.number().int().positive().safe(),
    paidAt: z.iso.datetime(),
    providerPromotionId: id.nullable(),
    evidenceId: id,
  })
  .refine(
    (v) => v.subscriptionId !== null || v.sequence === 1,
    "One-time payments have one benefit.",
  );
type Payment = z.infer<typeof verifiedPaymentSchema> & {
  _id: string;
  hash: string;
  firstForAccount: boolean;
};
const payments = (db: Db) => db.collection<Payment>("commerceVerifiedPayments");
async function hasVerifiedPurchase(
  db: Db,
  uid: string,
  session: ClientSession,
) {
  return Boolean(
    (await payments(db).findOne({ uid }, { session })) ||
    (await db
      .collection("purchaseOrders")
      .findOne({ uid, granted: true }, { session })),
  );
}
// Server-only provider adapter boundary. Call only after server-side canonical payment
// verification, never from notification payloads, model output, or browser assertions.
export async function recordVerifiedPayment(
  db: Db,
  raw: z.infer<typeof verifiedPaymentSchema>,
) {
  const value = verifiedPaymentSchema.parse(raw);
  if (Date.parse(value.paidAt) > Date.now())
    throw conflict("Payment timestamp is in the future.");
  const key = fingerprint([value.channel, value.providerPaymentId]);
  const hash = fingerprint(value);
  await readWallet(db, value.uid, {
    persist: async (session) => {
      const old = await payments(db).findOne({ _id: key }, { session });
      if (old) {
        if (old.hash !== hash)
          throw conflict("Verified payment identity changed.");
        return;
      }
      const offer = await publishedCatalog(
        db,
        value.offerId,
        value.offerRevision,
      );
      if (
        !offer ||
        offer.definition.kind !== "purchase" ||
        offer.definition.terms.channel !== value.channel ||
        (offer.definition.terms.billing.kind === "subscription") !==
          (value.subscriptionId !== null)
      )
        throw conflict(
          "Payment offer does not match its accepted channel and billing terms.",
        );
      if (
        !(await db
          .collection<{ _id: string; uid: string; kind: string }>(
            "executionEvidence",
          )
          .findOne(
            {
              _id: fingerprint([value.uid, value.evidenceId]),
              uid: value.uid,
              kind: "provider-receipt",
            },
            { session },
          ))
      )
        throw conflict("Retain provider verification evidence first.");
      const firstForAccount = !(await hasVerifiedPurchase(
        db,
        value.uid,
        session,
      ));
      await payments(db).insertOne(
        { ...value, _id: key, hash, firstForAccount },
        { session },
      );
    },
  });
  return key;
}
async function fence(db: Db, promotionId: string, session: ClientSession) {
  // A single persisted write serializes global quota decisions across account wallets.
  const row = await db
    .collection<{ _id: string; tick?: number }>("commerceCatalogs")
    .findOneAndUpdate(
      { _id: "promotion:" + promotionId },
      { $inc: { tick: 1 } },
      { session, returnDocument: "after" },
    );
  if (!row) throw conflict("Promotion unavailable.");
}
export async function resolvePromotionCode(db: Db, code: string) {
  z.string()
    .regex(/^[A-Z0-9-]{1,64}$/)
    .parse(code);
  const mapping = await db
    .collection<{ _id: string; catalogId: string }>("commercePromotionCodes")
    .findOne({ _id: code });
  if (!mapping) return null;
  const published = await publishedCatalog(db, mapping.catalogId);
  if (
    !published ||
    published.definition.kind !== "promotion" ||
    published.definition.terms.code !== code
  )
    return null;
  return { id: published.id, revision: published.revision };
}

export async function reservePromotion(
  db: Db,
  actor: CreditActor,
  raw: {
    checkoutId: string;
    promotionId: string;
    promotionRevision: number;
    offerId: string;
    offerRevision: number;
    code: string | null;
  },
) {
  const input = z
    .strictObject({
      checkoutId: id,
      promotionId: id,
      promotionRevision: z.number().int().positive(),
      offerId: id,
      offerRevision: z.number().int().positive(),
      code: z.string().max(64).nullable(),
    })
    .parse(raw);
  const key = fingerprint([actor.uid, input.checkoutId]);
  const hash = fingerprint(input);
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const old = await reservations(db).findOne({ _id: key }, { session });
      if (old) {
        if (old.hash !== hash)
          throw conflict("A purchase cannot stack or change promotions.");
        if (old.state === "reserved" && old.expiresAt <= new Date())
          throw conflict(
            "Reconcile the expired checkout before starting another.",
          );
        if (old.state === "released")
          throw conflict("This checkout reservation was released.");
        return;
      }
      const published = await publishedCatalog(db, input.promotionId);
      const offer = await publishedCatalog(db, input.offerId);
      if (
        !published ||
        published.revision !== input.promotionRevision ||
        published.definition.kind !== "promotion" ||
        !offer ||
        offer.revision !== input.offerRevision ||
        offer.definition.kind !== "purchase"
      )
        throw conflict("Published offer and promotion required.");
      const promotion = published.definition,
        terms = promotion.terms;
      const now = new Date();
      if (
        Date.parse(terms.startsAt) > now.getTime() ||
        Date.parse(terms.endsAt) <= now.getTime() ||
        terms.code !== input.code ||
        !terms.offerIds.includes(offer.definition.terms.identity.id) ||
        !terms.channels.includes(offer.definition.terms.channel)
      )
        throw conflict("Promotion is not applicable.");
      if (
        promotion.eligibility.accountIds &&
        !promotion.eligibility.accountIds.includes(actor.uid)
      )
        throw conflict("Account is not eligible.");
      if (
        promotion.eligibility.firstPurchaseOnly &&
        (await hasVerifiedPurchase(db, actor.uid, session))
      )
        throw conflict("Promotion requires a first purchase.");
      await fence(db, terms.identity.id, session);
      const filter = {
        "promotion.terms.identity.id": terms.identity.id,
        state: { $ne: "released" as const },
      };
      if (
        (await reservations(db).countDocuments(filter, { session })) >=
          terms.maxRedemptions ||
        (await reservations(db).countDocuments(
          { ...filter, uid: actor.uid },
          { session },
        )) >= terms.maxPerAccount
      )
        throw conflict("Promotion redemption limit reached.");
      await reservations(db).insertOne(
        {
          _id: key,
          uid: actor.uid,
          checkoutId: input.checkoutId,
          hash,
          promotion,
          offerId: input.offerId,
          offerRevision: input.offerRevision,
          channel: offer.definition.terms.channel,
          state: "reserved",
          subscriptionId: null,
          expiresAt: new Date(
            Math.min(now.getTime() + 30 * 60000, Date.parse(terms.endsAt)),
          ),
          createdAt: now,
        },
        { session },
      );
    },
  });
  return reservations(db).findOne({ _id: key, uid: actor.uid });
}
// Provider adapter records a canonical unpaid terminal checkout observation.
// A missing webhook, elapsed local timeout or client cancellation is not sufficient.
export async function releasePromotion(
  db: Db,
  uid: string,
  checkoutId: string,
  verification: {
    channel: "stripe" | "google-play";
    providerCheckoutId: string;
    evidenceId: string;
    outcome: "expired-unpaid" | "cancelled-unpaid";
  },
  options: { beforePersist?: (session?: ClientSession) => Promise<void> } = {},
) {
  z.string().min(1).max(128).parse(uid);
  id.parse(checkoutId);
  const verified = z
    .strictObject({
      channel: z.enum(["stripe", "google-play"]),
      providerCheckoutId: z.string().min(1).max(4096),
      evidenceId: id,
      outcome: z.enum(["expired-unpaid", "cancelled-unpaid"]),
    })
    .parse(verification);
  await readWallet(db, uid, {
    persist: async (session) => {
      await options.beforePersist?.(session);
      const row = await reservations(db).findOne(
        { _id: fingerprint([uid, checkoutId]), uid },
        { session },
      );
      if (!row) throw conflict("Reservation not found.");
      if (row.state === "released") {
        if (row.releaseHash !== fingerprint(verified))
          throw conflict("Changed release evidence.");
        return;
      }
      if (
        row.channel !== verified.channel ||
        row.state === "redeemed" ||
        (await payments(db).findOne(
          { uid, checkoutId, channel: row.channel },
          { session },
        ))
      )
        throw conflict(
          "Paid or mismatched checkout cannot release its reservation.",
        );
      if (
        !(await db
          .collection<{ _id: string; uid: string; kind: string }>(
            "executionEvidence",
          )
          .findOne(
            {
              _id: fingerprint([uid, verified.evidenceId]),
              uid,
              kind: "provider-receipt",
            },
            { session },
          ))
      )
        throw conflict("Retain checkout verification evidence first.");
      await fence(db, row.promotion.terms.identity.id, session);
      await reservations(db).updateOne(
        { _id: row._id },
        { $set: { state: "released", releaseHash: fingerprint(verified) } },
        { session },
      );
      await db
        .collection("promotionReleaseEvidence")
        .insertOne(
          { reservationId: row._id, uid, ...verified, recordedAt: new Date() },
          { session },
        );
    },
  });
}
export async function finalizePromotion(
  db: Db,
  uid: string,
  checkoutId: string,
  paymentId: string,
  options: { beforePersist?: (session: ClientSession) => Promise<void> } = {},
) {
  id.parse(checkoutId);
  id.parse(paymentId);
  const row = await reservations(db).findOne({
    _id: fingerprint([uid, checkoutId]),
    uid,
  });
  const payment = await payments(db).findOne({ _id: paymentId, uid });
  if (!row || !payment)
    throw conflict("Verified payment and owned reservation required.");
  const benefit = row.promotion.terms.benefit;
  const expiresAt =
    benefit.kind === "bonus-credits" && benefit.creditExpiryDays !== null
      ? new Date(
          Date.parse(payment.paidAt) + benefit.creditExpiryDays * 86400000,
        )
      : null;
  const claimId = fingerprint([payment.channel, payment.providerPaymentId]);
  const claims = db.collection<{
    _id: string;
    reservationId: string;
    uid: string;
    sequence: number;
    paymentId: string;
    credited: number;
    lotId: string | null;
  }>("promotionPaymentClaims");
  const persist = async (
    session: ClientSession,
    result: { lotId?: string },
  ) => {
    await options.beforePersist?.(session);
    const current = await reservations(db).findOne(
      { _id: row._id, uid },
      { session },
    );
    if (!current || current.state === "released")
      throw conflict("Reservation was released.");
    const old = await claims.findOne({ _id: claimId }, { session });
    if (old) {
      if (old.reservationId !== current._id || old.paymentId !== paymentId)
        throw conflict("Payment already used.");
      return;
    }
    if (
      current.state === "reserved" &&
      current.promotion.eligibility.firstPurchaseOnly &&
      !payment.firstForAccount
    )
      throw conflict("Promotion requires the first verified purchase.");
    const terms = current.promotion.terms;
    const maximum =
      terms.duration.kind === "first-payment" ? 1 : terms.duration.count;
    if (
      payment.channel !== current.channel ||
      payment.offerId !== current.offerId ||
      payment.offerRevision !== current.offerRevision ||
      payment.sequence > maximum ||
      payment.sequence < 1
    )
      throw conflict("Payment is outside accepted promotion terms.");
    if (current.state === "reserved") {
      if (
        payment.sequence !== 1 ||
        payment.checkoutId !== checkoutId ||
        Date.parse(payment.paidAt) <
          Math.floor(current.createdAt.getTime() / 1000) * 1000 ||
        Date.parse(payment.paidAt) > current.expiresAt.getTime()
      )
        throw conflict(
          "First payment must match the reserved checkout window.",
        );
    } else if (
      !current.subscriptionId ||
      payment.subscriptionId !== current.subscriptionId
    )
      throw conflict("Renewal belongs to another subscription.");
    if (
      terms.benefit.kind === "monetary-discount" &&
      payment.providerPromotionId !== terms.benefit.providerPromotionId
    )
      throw conflict("Provider discount was not applied.");
    if (
      await claims.findOne(
        { reservationId: current._id, sequence: payment.sequence },
        { session },
      )
    )
      throw conflict("Payment sequence already redeemed.");
    await fence(db, terms.identity.id, session);
    await claims.insertOne(
      {
        _id: claimId,
        reservationId: current._id,
        uid,
        sequence: payment.sequence,
        paymentId,
        credited:
          result.lotId && benefit.kind === "bonus-credits"
            ? benefit.credits
            : 0,
        lotId: result.lotId ?? null,
      },
      { session },
    );
    await reservations(db).updateOne(
      { _id: current._id },
      { $set: { state: "redeemed", subscriptionId: payment.subscriptionId } },
      { session },
    );
  };
  // Delayed notices never turn an already expired bonus into fresh credits.
  if (
    benefit.kind === "bonus-credits" &&
    (!expiresAt || expiresAt > new Date())
  )
    await grantCredits(
      db,
      uid,
      "promotion:" + claimId,
      {
        amount: benefit.credits,
        source: "promotion",
        reference: claimId,
        expiresAt,
      },
      { persist },
    );
  else await readWallet(db, uid, { persist });
  return claims.findOne({ _id: claimId, uid });
}
export async function createPromotionIndexes(db: Db) {
  await reservations(db).createIndex({
    "promotion.terms.identity.id": 1,
    state: 1,
    uid: 1,
  });
  await payments(db).createIndex({ uid: 1, checkoutId: 1 });
  await payments(db).createIndex(
    { channel: 1, subscriptionId: 1, sequence: 1 },
    {
      unique: true,
      partialFilterExpression: { subscriptionId: { $type: "string" } },
    },
  );
  await db
    .collection("promotionPaymentClaims")
    .createIndex({ reservationId: 1, sequence: 1 }, { unique: true });
}
