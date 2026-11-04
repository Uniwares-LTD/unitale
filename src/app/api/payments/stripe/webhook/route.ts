import { enqueueBillingNotice } from "@/lib/server/commerce/billing-runtime";
import { AppError } from "@/lib/auth-policy";
import { endpoint, json, readText } from "@/lib/server/http";
import { stripeClient, stripeSettings } from "@/lib/server/stripe";
import { stripeNotice } from "@/lib/server/stripe-provider";
import { database } from "@/lib/server/mongo";
import { enqueuePaymentNotice } from "@/lib/server/store/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return endpoint(async () => {
    const settings = stripeSettings();
    const raw = await readText(request, 256000);
    let event;
    try {
      event = stripeClient().webhooks.constructEvent(
        raw,
        request.headers.get("stripe-signature") ?? "",
        settings.webhookSecret,
      );
    } catch {
      throw new AppError(
        "INVALID_WEBHOOK",
        "Payment notification signature is invalid.",
      );
    }
    if (event.livemode !== settings.key.startsWith("sk_live_"))
      throw new AppError("INVALID_WEBHOOK", "Payment mode does not match.");
    const object = event.data.object as unknown as {
      id: string;
      metadata?: Record<string, string>;
      parent?: { subscription_details?: { metadata?: Record<string, string> } };
    };
    const intentId =
      object.metadata?.billingIntent ??
      object.parent?.subscription_details?.metadata?.billingIntent;
    if (intentId)
      await enqueueBillingNotice(database(), {
        id: event.id,
        channel: "stripe",
        providerId: object.id,
        intentId,
      });
    const notice = stripeNotice(event, settings.key.startsWith("sk_live_"));
    if (notice) await enqueuePaymentNotice(database(), notice);
    // Acknowledge only after durable inbox storage. No financial writes here.
    return json({ received: true });
  });
}
