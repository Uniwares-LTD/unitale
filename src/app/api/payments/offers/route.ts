import { endpoint, json } from "@/lib/server/http";
import { database } from "@/lib/server/mongo";
import { billingProviders } from "@/lib/server/commerce/billing-runtime";
import { purchaseOffers } from "@/lib/server/commerce/purchase-offers";
export async function GET(request: Request) {
  return endpoint(request, async () => {
    const db = database();
    const providers = billingProviders(db);
    return json({
      ...(await purchaseOffers(
        db,
        providers.map((p) => p.channel),
        new URL(request.url).searchParams.get("after") ?? undefined,
      )),
      playPackage: providers.some((p) => p.channel === "google-play")
        ? process.env.ANDROID_PACKAGE_NAME
        : null,
    });
  });
}
