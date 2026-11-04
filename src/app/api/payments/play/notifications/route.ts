import { z } from "zod";
import { endpoint, json, readText } from "@/lib/server/http";
import { database } from "@/lib/server/mongo";
import { verifyPlayPush } from "@/lib/server/commerce/google-auth";
import { enqueueBillingNotice } from "@/lib/server/commerce/billing-runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return endpoint(async () => {
    const audience = z
      .string()
      .url()
      .parse(process.env.PLAY_BILLING_PUBSUB_AUDIENCE);
    const email = z.email().parse(process.env.PLAY_BILLING_PUBSUB_EMAIL);
    const packageName = z
      .string()
      .min(1)
      .parse(process.env.ANDROID_PACKAGE_NAME);
    await verifyPlayPush(
      request.headers.get("authorization") ?? "",
      audience,
      email,
    );
    const envelope = z
      .object({
        message: z.object({
          messageId: z.string().min(1).max(512),
          data: z.string().max(32768),
        }),
      })
      .parse(JSON.parse(await readText(request, 65536)));
    const notice = z
      .object({
        packageName: z.literal(packageName),
        subscriptionNotification: z
          .object({ purchaseToken: z.string().min(1).max(4096) })
          .optional(),
        oneTimeProductNotification: z
          .object({ purchaseToken: z.string().min(1).max(4096) })
          .optional(),
        voidedPurchaseNotification: z
          .object({ purchaseToken: z.string().min(1).max(4096) })
          .optional(),
        testNotification: z.object({}).optional(),
      })
      .parse(
        JSON.parse(
          Buffer.from(envelope.message.data, "base64").toString("utf8"),
        ),
      );
    const token =
      notice.subscriptionNotification?.purchaseToken ??
      notice.oneTimeProductNotification?.purchaseToken ??
      notice.voidedPurchaseNotification?.purchaseToken;
    if (token)
      await enqueueBillingNotice(database(), {
        id: envelope.message.messageId,
        channel: "google-play",
        providerId: token,
        intentId: null,
      });
    return json({ received: true });
  });
}
