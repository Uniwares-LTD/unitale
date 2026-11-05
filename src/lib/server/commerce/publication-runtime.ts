import "server-only";
import { z } from "zod";
import { AppError } from "../../auth-policy";
import {
  providerCatalogAdapter,
  providerCatalogDraftSchema,
} from "./provider-catalog";
import { providerTransport } from "./provider-transport";
import { googlePublisherAuthorization } from "./google-auth";
export function catalogPublicationAdapter(raw: unknown) {
  const draft = providerCatalogDraftSchema.parse(raw);
  if (draft.kind.startsWith("stripe-")) {
    if (
      process.env.PAYMENTS_MODE !== "stripe" ||
      !process.env.STRIPE_SECRET_KEY
    )
      throw new AppError(
        "BILLING_UNAVAILABLE",
        "Stripe publishing is not configured.",
        409,
      );
    return providerCatalogAdapter(
      providerTransport(
        "https://api.stripe.com",
        async () => "Bearer " + process.env.STRIPE_SECRET_KEY,
      ),
    );
  }
  if (
    !("packageName" in draft) ||
    draft.packageName !== process.env.ANDROID_PACKAGE_NAME ||
    !process.env.PLAY_BILLING_SERVICE_ACCOUNT_JSON
  )
    throw new AppError(
      "BILLING_UNAVAILABLE",
      "Play publishing is not configured for this package.",
      409,
    );
  const account = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(process.env.PLAY_BILLING_SERVICE_ACCOUNT_JSON));
  return providerCatalogAdapter(
    providerTransport(
      "https://androidpublisher.googleapis.com",
      googlePublisherAuthorization(account),
    ),
  );
}
