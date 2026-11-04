import { providerCatalogDraftSchema } from "./provider-catalog";
import "server-only";
import type { Db } from "mongodb";
import { z } from "zod";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";
import { accessTransaction } from "../store/access";
import {
  ownedBilling,
  type BillingIntent,
  type PurchaseTerms,
} from "./billing";
import { readWallet } from "../store/credits";
import type { CreditActor } from "../store/credit-types";
import { publishedCatalog } from "./catalogs";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const conflict = () =>
  new AppError(
    "BILLING_ACTION_CONFLICT",
    "Billing action changed or requires provider reconciliation.",
    409,
  );
export type ProviderAction = {
  _id: string;
  uid: string;
  kind:
    | "checkout"
    | "cancel"
    | "plan-change"
    | "acknowledge"
    | "consume"
    | "publish";
  subjectId: string;
  input: unknown;
  hash: string;
  requestHash?: string;
  state: "prepared" | "publishing" | "verified" | "partial" | "unknown";
  createdAt: Date;
  verifiedAt: Date | null;
  result: unknown;
  recoveryCursor?: string | null;
};
const actions = (db: Db) =>
  db.collection<ProviderAction>("billingProviderActions");
export interface ProviderActionAdapter {
  // Read-only. Returns the verified intended result, or null when not established.
  readback(
    action: ProviderAction,
    checkpoint?: (cursor: string | null) => Promise<void>,
  ): Promise<unknown | null>;
  execute(action: ProviderAction): Promise<unknown>;
}
export async function prepareBillingAction(
  db: Db,
  actor: CreditActor,
  checkoutId: string,
  key: string,
  kind: "checkout" | "cancel" | "plan-change",
  nextOffer?: { id: string; revision: number },
) {
  id.parse(key);
  id.parse(checkoutId);
  const keyId = fingerprint([actor.uid, key]);
  const requestHash = fingerprint([checkoutId, kind, nextOffer ?? null]);
  let prior: ProviderAction | null = null;
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      prior = await actions(db).findOne(
        { _id: keyId, uid: actor.uid },
        { session },
      );
      if (prior && prior.requestHash !== requestHash) throw conflict();
    },
  });
  if (prior) return prior as ProviderAction;
  const intent = await ownedBilling(db, actor, checkoutId);
  let nextTerms: PurchaseTerms | null = null;
  if (kind === "plan-change") {
    if (
      !nextOffer ||
      !intent.providerId ||
      intent.state !== "active" ||
      !intent.periodEnd
    )
      throw conflict();
    const next = await publishedCatalog(db, nextOffer.id, nextOffer.revision);
    const current = await publishedCatalog(db, nextOffer.id);
    if (
      !next ||
      !current ||
      next.definition.kind !== "purchase" ||
      current.revision !== nextOffer.revision ||
      next.definition.terms.billing.kind !== "subscription" ||
      next.definition.terms.channel !== intent.terms.channel
    )
      throw conflict();
    nextTerms = next.definition.terms;
  } else if (nextOffer) throw conflict();
  if (
    kind === "cancel" &&
    (!intent.providerId ||
      intent.terms.billing.kind !== "subscription" ||
      ["ended", "revoked"].includes(intent.state))
  )
    throw conflict();
  const promotion =
    kind === "checkout"
      ? await db
          .collection("promotionReservations")
          .findOne({ uid: actor.uid, checkoutId })
      : null;
  const providerPromotionId =
    promotion?.promotion?.terms?.benefit?.kind === "monetary-discount"
      ? promotion.promotion.terms.benefit.providerPromotionId
      : null;
  const input = {
    intentId: intent._id,
    providerId: kind === "checkout" ? null : intent.providerId,
    providerPromotionId,
    terms: intent.terms,
    accountBinding: intent.accountBinding,
    effectiveAt: kind === "plan-change" ? intent.periodEnd : null,
    nextTerms,
  };
  const hash = fingerprint([kind, input]);
  let result!: ProviderAction;
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const old = await actions(db).findOne({ _id: keyId }, { session });
      if (old) {
        if (old.requestHash !== requestHash) throw conflict();
        result = old;
        return;
      }
      const currentIntent = await db
        .collection<BillingIntent>("billingIntents")
        .findOne({ _id: intent._id }, { session });
      if (
        !currentIntent ||
        currentIntent.providerId !== intent.providerId ||
        fingerprint(currentIntent.terms) !== fingerprint(intent.terms)
      )
        throw conflict();
      if (
        kind === "plan-change" &&
        (currentIntent.nextTerms ||
          currentIntent.periodEnd !== intent.periodEnd ||
          currentIntent.state !== "active")
      )
        throw conflict();
      if (
        kind === "cancel" &&
        ["ended", "revoked"].includes(currentIntent.state)
      )
        throw conflict();
      const unfinished = await actions(db).findOne(
        {
          subjectId: intent._id,
          state: { $ne: "verified" },
          // A Play plan change is a client instruction awaiting renewal, not an
          // in-flight backend write. It must not prevent stopping auto-renewal.
          ...(kind === "cancel" && intent.terms.channel === "google-play"
            ? { $nor: [{ kind: "plan-change", state: "prepared" }] }
            : {}),
        },
        { session },
      );
      if (unfinished || (kind === "plan-change" && intent.nextTerms))
        throw conflict();
      result = {
        _id: keyId,
        uid: actor.uid,
        kind,
        subjectId: intent._id,
        input,
        hash,
        requestHash,
        state: "prepared",
        createdAt: new Date(),
        verifiedAt: null,
        result: null,
      };
      await actions(db).insertOne(result, { session });
      if (nextTerms)
        await db
          .collection<BillingIntent>("billingIntents")
          .updateOne(
            { _id: intent._id },
            { $set: { nextTerms, nextEffectiveAt: intent.periodEnd } },
            { session },
          );
    },
  });
  return result;
}

// Customer/admin authorization belongs to preparation. The worker executes only
// durable server-created actions. Unknown writes are read back, never replayed.
function actionReceipt(value: unknown) {
  const fields = new Set([
    "id",
    "url",
    "productId",
    "product",
    "currency",
    "unit_amount",
    "active",
    "name",
    "percent_off",
    "duration",
    "duration_in_months",
    "valid",
    "max_redemptions",
    "expires_at",
    "code",
    "basePlanId",
    "offerId",
    "state",
    "packageName",
    "definitionHash",
    "scheduleId",
    "subscriptionId",
    "effectiveAt",
    "priceId",
    "acknowledged",
    "consumed",
    "cancellationRequested",
    "cancelledAtRenewal",
    "cancelAtPeriodEnd",
  ]);
  const result: Record<string, string | number | boolean | null> = {};
  if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      if (!fields.has(key)) continue;
      if (
        item === null ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item)) ||
        (typeof item === "string" && item.length <= 4096)
      )
        result[key] = item;
    }
  return result;
}
export async function executeProviderAction(
  db: Db,
  actionId: string,
  adapter: ProviderActionAdapter,
) {
  let action = await actions(db).findOne({ _id: actionId });
  if (!action) throw conflict();
  if (action.state === "verified") return action.result;
  const checkpoint = async (cursor: string | null) => {
    await actions(db).updateOne(
      { _id: actionId, state: { $ne: "verified" } },
      { $set: { recoveryCursor: cursor } },
    );
  };
  const existing = await adapter.readback(action, checkpoint);
  if (existing !== null) {
    await actions(db).updateOne(
      { _id: actionId },
      {
        $set: {
          state: "verified",
          result: actionReceipt(existing),
          verifiedAt: new Date(),
        },
      },
    );
    return actionReceipt(existing);
  }
  if (action.state !== "prepared") throw conflict();
  action = await actions(db).findOneAndUpdate(
    { _id: actionId, state: "prepared" },
    { $set: { state: "publishing" } },
    { returnDocument: "after" },
  );
  if (!action) throw conflict();
  try {
    const receipt = actionReceipt(await adapter.execute(action));
    await actions(db).updateOne(
      { _id: actionId, state: "publishing" },
      { $set: { result: receipt, state: "partial" } },
    );
    const verified = await adapter.readback(
      { ...action, result: receipt },
      checkpoint,
    );
    if (verified === null) throw conflict();
    await actions(db).updateOne(
      { _id: actionId },
      {
        $set: {
          state: "verified",
          result: actionReceipt(verified),
          verifiedAt: new Date(),
        },
      },
    );
    return actionReceipt(verified);
  } catch (error) {
    await actions(db).updateOne(
      { _id: actionId, state: "publishing" },
      { $set: { state: "unknown" } },
    );
    throw error;
  }
}

export async function prepareProviderPublication(
  db: Db,
  admin: { uid: string; auth_time: number },
  key: string,
  preview: {
    catalogId: string;
    revision: number;
    definitionHash: string;
    providerDraft: unknown;
  },
  expectedPreviewHash: string,
) {
  id.parse(key);
  const providerDraft = providerCatalogDraftSchema.parse(preview.providerDraft);
  const hash = fingerprint(preview);
  if (hash !== expectedPreviewHash) throw conflict();
  return accessTransaction(
    db,
    admin.uid,
    async (session) => {
      const actionId = fingerprint([admin.uid, key]);
      const old = await actions(db).findOne({ _id: actionId }, { session });
      if (old) {
        if (old.hash !== hash) throw conflict();
        return old;
      }
      const catalog = await db
        .collection<{ _id: string; revision: number; draft: unknown }>(
          "commerceCatalogs",
        )
        .findOne(
          { _id: preview.catalogId, revision: preview.revision },
          { session },
        );
      if (!catalog || fingerprint(catalog.draft) !== preview.definitionHash)
        throw conflict();
      const action: ProviderAction = {
        _id: actionId,
        uid: admin.uid,
        kind: "publish",
        subjectId: preview.catalogId,
        input: providerDraft,
        hash,
        state: "prepared",
        createdAt: new Date(),
        verifiedAt: null,
        result: null,
      };
      await actions(db).insertOne(action, { session });
      await db
        .collection<{
          _id: string;
          event: string;
          actorUid: string;
          target: string;
          timestamp: Date;
          previewHash: string;
        }>("auditEvents")
        .insertOne(
          {
            actorUid: admin.uid,
            _id: crypto.randomUUID(),
            event: "billing-publication-prepared",
            target: actionId,
            timestamp: new Date(),
            previewHash: hash,
          },
          { session },
        );
      return action;
    },
    admin.auth_time,
  );
}

// Called after canonical payment reconciliation, never from a client payload.
export async function prepareFulfillment(db: Db, intent: BillingIntent) {
  if (!intent.providerId || intent.terms.channel !== "google-play")
    throw conflict();
  const grant = await db
    .collection("billingGrants")
    .findOne({ intentId: intent._id, uid: intent.uid });
  if (!grant) return null;
  const kind =
    intent.terms.billing.kind === "subscription" ? "acknowledge" : "consume";
  const key = fingerprint([intent._id, kind, intent.providerId]);
  const action: ProviderAction = {
    _id: key,
    uid: intent.uid,
    subjectId: intent._id,
    kind,
    input: { providerId: intent.providerId },
    hash: fingerprint([intent._id, kind, intent.providerId]),
    state: "prepared",
    createdAt: new Date(),
    verifiedAt: null,
    result: null,
  };
  await actions(db).updateOne(
    { _id: key },
    { $setOnInsert: action },
    { upsert: true },
  );
  return actions(db).findOne({ _id: key });
}
