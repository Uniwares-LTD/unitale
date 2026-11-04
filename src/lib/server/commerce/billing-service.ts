import { publishedCatalog } from "./catalogs";
import { PlayBillingProvider } from "./play-billing";
import { prepareFulfillment } from "./provider-actions";
import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import { readWallet } from "../store/credits";
import {
  beginBilling,
  ownedBilling,
  reconcileBilling,
  type BillingIntent,
} from "./billing";
import { billingProviders } from "./billing-runtime";
import {
  prepareBillingAction,
  executeProviderAction,
} from "./provider-actions";
import { StripeBillingProvider } from "./stripe-billing";
import { AppError } from "../../auth-policy";
const missing = () =>
  new AppError(
    "BILLING_UNAVAILABLE",
    "This billing provider is not configured.",
    503,
  );
export async function startCatalogPurchase(
  db: Db,
  actor: CreditActor,
  input: {
    checkoutId: string;
    offerId: string;
    offerRevision: number;
  },
  origin: string,
) {
  const offer = await publishedCatalog(db, input.offerId, input.offerRevision);
  const configured = billingProviders(db);
  if (!offer || offer.definition.kind !== "purchase") throw missing();
  const channel = offer.definition.terms.channel;
  if (!configured.some((v) => v.channel === channel)) throw missing();
  const intent = await beginBilling(db, actor, input);
  const provider = billingProviders(db).find(
    (v) => v.channel === intent.terms.channel,
  );
  if (!provider) throw missing();
  if (intent.terms.channel === "google-play")
    return {
      checkoutId: intent.checkoutId,
      channel: intent.terms.channel,
      accountBinding: intent.accountBinding,
      product: intent.terms.provider,
    };
  if (!(provider instanceof StripeBillingProvider)) throw missing();
  const action = await prepareBillingAction(
    db,
    actor,
    intent.checkoutId,
    "checkout:" + intent._id,
    "checkout",
  );
  const result = z
    .object({ id: z.string(), url: z.string().url().nullable() })
    .parse(
      await executeProviderAction(db, action._id, provider.actions(origin)),
    );
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      await db
        .collection<BillingIntent>("billingIntents")
        .updateOne(
          { _id: intent._id, providerId: null },
          { $set: { providerId: result.id } },
          { session },
        );
    },
  });
  return {
    checkoutId: intent.checkoutId,
    channel: intent.terms.channel,
    url: result.url,
  };
}
export async function restoreCatalogPurchase(
  db: Db,
  actor: CreditActor,
  checkoutId: string,
  providerId: string,
) {
  const intent = await ownedBilling(db, actor, checkoutId);
  const provider = billingProviders(db).find(
    (v) => v.channel === intent.terms.channel,
  );
  if (!provider) throw missing();
  const result = await reconcileBilling(
    db,
    intent._id,
    z.string().min(1).max(4096).parse(providerId),
    provider,
  );
  if (provider instanceof PlayBillingProvider) {
    const action = await prepareFulfillment(db, { ...intent, providerId });
    if (action)
      await executeProviderAction(
        db,
        action._id,
        provider.fulfillment(intent, providerId),
      );
  }
  return result;
}
export async function changeCatalogSubscription(
  db: Db,
  actor: CreditActor,
  input: {
    checkoutId: string;
    key: string;
    kind: "cancel" | "plan-change";
    nextOffer?: { id: string; revision: number };
  },
  origin: string,
) {
  const intent = await ownedBilling(db, actor, input.checkoutId);
  const provider = billingProviders(db).find(
    (v) => v.channel === intent.terms.channel,
  );
  if (!provider) throw missing();
  const action = await prepareBillingAction(
    db,
    actor,
    input.checkoutId,
    input.key,
    input.kind,
    input.nextOffer,
  );
  if (
    provider instanceof PlayBillingProvider &&
    input.kind === "cancel" &&
    intent.providerId
  )
    return {
      actionId: action._id,
      channel: "google-play",
      result: await executeProviderAction(
        db,
        action._id,
        provider.fulfillment(intent, intent.providerId),
      ),
    };
  if (!(provider instanceof StripeBillingProvider))
    return {
      actionId: action._id,
      channel: "google-play",
      instruction:
        input.kind === "cancel"
          ? "manage-subscription"
          : "deferred-replacement",
      replacementMode: "DEFERRED",
    };
  const result = await executeProviderAction(
    db,
    action._id,
    provider.actions(origin),
  );
  return { actionId: action._id, channel: "stripe", result };
}
