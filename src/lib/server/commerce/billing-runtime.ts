import { readWallet } from "../store/credits";
import { prepareFulfillment, executeProviderAction } from "./provider-actions";
import "server-only";
import type { Db } from "mongodb";
import { z } from "zod";
import { fingerprint } from "../foundation/canonical";
import { AppError } from "../../auth-policy";
import { providerTransport } from "./provider-transport";
import { googlePublisherAuthorization } from "./google-auth";
import { StripeBillingProvider } from "./stripe-billing";
import { PlayBillingProvider } from "./play-billing";
import {
  reconcileBilling,
  type BillingIntent,
  type BillingProvider,
} from "./billing";
export function billingProviders(db: Db): BillingProvider[] {
  const providers: BillingProvider[] = [];
  if (process.env.PAYMENTS_MODE === "stripe" && process.env.STRIPE_SECRET_KEY)
    providers.push(
      new StripeBillingProvider(
        providerTransport(
          "https://api.stripe.com",
          async () => "Bearer " + process.env.STRIPE_SECRET_KEY,
        ),
        process.env.STRIPE_SECRET_KEY.startsWith("sk_live_"),
      ),
    );
  if (process.env.PLAY_BILLING_SERVICE_ACCOUNT_JSON) {
    const account = JSON.parse(process.env.PLAY_BILLING_SERVICE_ACCOUNT_JSON);
    const packageName = z
      .string()
      .min(1)
      .parse(process.env.ANDROID_PACKAGE_NAME);
    providers.push(
      new PlayBillingProvider(
        providerTransport(
          "https://androidpublisher.googleapis.com",
          googlePublisherAuthorization(account),
        ),
        packageName,
        process.env.APP_ENV !== "production",
        async (intentId) => {
          const grants = await db
            .collection("billingGrants")
            .find({ intentId }, { projection: { "payment.id": 1 } })
            .limit(100)
            .toArray();
          return grants.map((v) => String(v.payment.id));
        },
        async (intentId) => {
          const bindings = await db
            .collection("billingProviderBindings")
            .find({ intentId }, { projection: { providerId: 1 } })
            .limit(100)
            .toArray();
          return bindings.map((v) => String(v.providerId));
        },
      ),
    );
  }
  return providers;
}
type Notice = {
  _id: string;
  channel: "stripe" | "google-play";
  providerId: string;
  intentId: string | null;
  state: "queued" | "done";
  nextAttempt: Date;
  attempts: number;
};
// Call only after signature/OIDC verification. Retain routing identities, not
// webhook payloads or browser assertions, and acknowledge after durable storage.
export async function enqueueBillingNotice(
  db: Db,
  raw: {
    id: string;
    channel: "stripe" | "google-play";
    providerId: string;
    intentId: string | null;
  },
) {
  const value = z
    .strictObject({
      id: z.string().min(1).max(512),
      channel: z.enum(["stripe", "google-play"]),
      providerId: z.string().min(1).max(4096),
      intentId: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    })
    .parse(raw);
  const key = fingerprint([value.channel, value.id]);
  const rows = db.collection<Notice>("billingNotices");
  const old = await rows.findOne({ _id: key });
  if (
    old &&
    (old.providerId !== value.providerId || old.intentId !== value.intentId)
  )
    throw new AppError(
      "BILLING_NOTICE_CONFLICT",
      "Notification identity changed.",
      409,
    );
  await rows.updateOne(
    {
      _id: key,
      channel: value.channel,
      providerId: value.providerId,
      intentId: value.intentId,
    },
    {
      $setOnInsert: {
        _id: key,
        channel: value.channel,
        providerId: value.providerId,
        intentId: value.intentId,
        state: "queued",
        nextAttempt: new Date(),
        attempts: 0,
      },
    },
    { upsert: true },
  );
}
export async function processBilling(
  db: Db,
  providers: readonly BillingProvider[],
) {
  const notices = db.collection<Notice>("billingNotices");
  const intents = db.collection<BillingIntent & { nextPoll?: Date }>(
    "billingIntents",
  );
  const notice = await notices.findOneAndUpdate(
    {
      state: "queued",
      nextAttempt: { $lte: new Date() },
      channel: { $in: providers.map((v) => v.channel) },
    },
    {
      $set: { nextAttempt: new Date(Date.now() + 60000) },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttempt: 1 }, returnDocument: "after" },
  );
  const binding = notice
    ? await db
        .collection<{ _id: string; intentId: string }>(
          "billingProviderBindings",
        )
        .findOne({ _id: fingerprint([notice.channel, notice.providerId]) })
    : null;
  const intent = notice
    ? await intents.findOne(
        (notice.intentId ?? binding?.intentId)
          ? { _id: notice.intentId ?? binding!.intentId }
          : { "terms.channel": notice.channel, providerId: notice.providerId },
      )
    : await intents.findOneAndUpdate(
        {
          providerId: { $type: "string" },
          "terms.channel": { $in: providers.map((v) => v.channel) },
          $or: [
            { nextPoll: { $exists: false } },
            { nextPoll: { $lte: new Date() } },
          ],
        },
        { $set: { nextPoll: new Date(Date.now() + 3600000) } },
        { sort: { nextPoll: 1 }, returnDocument: "after" },
      );
  if (!intent) return false;
  const provider = providers.find((v) => v.channel === intent.terms.channel);
  if (!provider) return false;
  let providerId = intent.providerId ?? notice?.providerId;
  if (!intent.providerId && provider instanceof StripeBillingProvider) {
    const action = await db
      .collection<{ _id: string }>("billingProviderActions")
      .findOne({ subjectId: intent._id, kind: "checkout" });
    if (!action) return false;
    const result = z
      .object({ id: z.string() })
      .parse(
        await executeProviderAction(
          db,
          action._id,
          provider.actions(z.string().url().parse(process.env.APP_ORIGIN)),
        ),
      );
    providerId = result.id;
    await readWallet(db, intent.uid, {
      persist: async (session) => {
        await intents.updateOne(
          { _id: intent._id, providerId: null },
          { $set: { providerId: result.id } },
          { session },
        );
      },
    });
  }
  if (!providerId) return false;
  await reconcileBilling(db, intent._id, providerId, provider);
  if (provider instanceof PlayBillingProvider) {
    const action = await prepareFulfillment(db, { ...intent, providerId });
    if (action)
      await executeProviderAction(
        db,
        action._id,
        provider.fulfillment(intent, providerId),
      );
  }
  if (notice)
    await notices.updateOne({ _id: notice._id }, { $set: { state: "done" } });
  return true;
}
