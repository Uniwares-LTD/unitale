import "server-only";
import { z } from "zod";
import { AppError } from "../../auth-policy";
import type {
  BillingIntent,
  BillingObservation,
  BillingProvider,
} from "./billing";
import type { ProviderActionAdapter } from "./provider-actions";
import { pathPart, type ProviderRequest } from "./provider-transport";
const id = z.string().min(1);
const time = z.iso.datetime({ offset: true });
const moneySchema = z.object({
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  units: z.string().regex(/^\d+$/).default("0"),
  nanos: z.number().int().min(0).max(999999999).default(0),
});
export function playMinorUnits(raw: unknown) {
  const value = moneySchema.parse(raw);
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency: value.currencyCode,
  }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined || digits > 9)
    throw new Error("Unsupported currency precision.");
  const nanoUnits =
    BigInt(value.units) * BigInt(1000000000) + BigInt(value.nanos);
  const divisor = BigInt(10) ** BigInt(9 - digits);
  if (
    nanoUnits % divisor !== BigInt(0) ||
    nanoUnits / divisor > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Unrepresentable provider price.");
  return {
    amountMinor: Number(nanoUnits / divisor),
    currency: value.currencyCode,
  };
}
const orderSchema = z.object({
  orderId: id,
  purchaseToken: id,
  state: z.string(),
  total: moneySchema,
  lineItems: z
    .array(
      z.object({
        productId: id,
        listingPrice: moneySchema,
        subscriptionDetails: z
          .object({
            basePlanId: id,
            offerId: id.optional(),
            servicePeriodStartTime: time,
            servicePeriodEndTime: time,
          })
          .optional(),
        oneTimePurchaseDetails: z
          .object({
            quantity: z.literal(1),
            purchaseOptionId: id,
            offerId: id.optional(),
          })
          .optional(),
      }),
    )
    .length(1),
  orderHistory: z.object({
    processedEvent: z.object({ eventTime: time }).optional(),
    refundEvent: z
      .object({ refundDetails: z.object({ total: moneySchema }) })
      .optional(),
    partialRefundEvents: z
      .array(
        z.object({
          state: z.enum(["PENDING", "PROCESSED_SUCCESSFULLY"]),
          refundDetails: z.object({ total: moneySchema }),
        }),
      )
      .default([]),
  }),
});
const fail = () =>
  new AppError(
    "PLAY_VERIFICATION_FAILED",
    "Play purchase does not match the application and accepted account.",
    409,
  );
export class PlayBillingProvider implements BillingProvider {
  readonly channel = "google-play" as const;
  private root: string;
  constructor(
    private request: ProviderRequest,
    packageName: string,
    private allowTest: boolean,
    private knownOrders: (
      intentId: string,
    ) => Promise<string[]> = async () => [],
    private knownTokens: (
      intentId: string,
    ) => Promise<string[]> = async () => [],
  ) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName))
      throw fail();
    this.root = "/androidpublisher/v3/applications/" + pathPart(packageName);
  }
  async replaces(intent: BillingIntent, token: string) {
    if (!intent.providerId || intent.terms.billing.kind !== "subscription")
      return false;
    const purchase = z
      .object({
        linkedPurchaseToken: z.string().optional(),
        externalAccountIdentifiers: z.object({
          obfuscatedExternalAccountId: z.literal(intent.accountBinding),
        }),
      })
      .parse(
        await this.request(
          this.root + "/purchases/subscriptionsv2/tokens/" + pathPart(token),
        ),
      );
    return purchase.linkedPurchaseToken === intent.providerId;
  }
  async inspect(
    intent: BillingIntent,
    token: string,
  ): Promise<BillingObservation> {
    const acceptedTokens = new Set([
      token,
      ...(await this.knownTokens(intent._id)),
    ]);
    let unpaidOutcome: BillingObservation["unpaidOutcome"];
    let cancelledOneTime = false;
    let latest: string | undefined;
    let state: BillingObservation["state"] = "pending";
    let accountBinding: string;
    let periodEnd: string | null = null;
    let cancelAtPeriodEnd = false;
    const recurring = intent.terms.billing.kind === "subscription";
    if (recurring) {
      const purchase = z
        .object({
          linkedPurchaseToken: id.optional(),
          subscriptionState: id,
          testPurchase: z.unknown().optional(),
          externalAccountIdentifiers: z.object({
            obfuscatedExternalAccountId: id,
          }),
          lineItems: z
            .array(
              z.object({
                productId: id,
                expiryTime: time.optional(),
                latestSuccessfulOrderId: id.optional(),
                offerDetails: z.object({
                  basePlanId: id,
                  offerId: id.optional(),
                }),
                autoRenewingPlan: z
                  .object({ autoRenewEnabled: z.boolean() })
                  .optional(),
              }),
            )
            .min(1)
            .max(2),
        })
        .parse(
          await this.request(
            this.root + "/purchases/subscriptionsv2/tokens/" + pathPart(token),
          ),
        );
      if (purchase.testPurchase !== undefined && !this.allowTest) throw fail();
      if (purchase.linkedPurchaseToken)
        acceptedTokens.add(purchase.linkedPurchaseToken);
      accountBinding =
        purchase.externalAccountIdentifiers.obfuscatedExternalAccountId;
      // Deferred replacements can contain two line items. Only the currently
      // funded item has a successful order; future items cannot grant credits.
      const funded = purchase.lineItems.filter(
        (v) => v.latestSuccessfulOrderId,
      );
      if (funded.length > 1) throw fail();
      const line = funded[0] ?? purchase.lineItems[0];
      if (
        ![intent.terms, intent.nextTerms].some(
          (v) =>
            v &&
            v.provider.productId === line.productId &&
            v.provider.priceId === line.offerDetails.basePlanId &&
            v.provider.offerId === (line.offerDetails.offerId ?? null),
        )
      )
        throw fail();
      if (
        purchase.subscriptionState ===
          "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED" &&
        !purchase.linkedPurchaseToken &&
        funded.length === 0
      ) {
        if (accountBinding !== intent.accountBinding) throw fail();
        return {
          providerId: token,
          accountBinding,
          state: "ended",
          periodEnd: null,
          cancelAtPeriodEnd: false,
          payments: [],
          unpaidOutcome: "cancelled-unpaid",
        };
      }
      if (!line.expiryTime) throw fail();
      const catalog = z
        .object({
          basePlans: z.array(
            z.object({
              basePlanId: id,
              autoRenewingBasePlanType: z
                .object({ billingPeriodDuration: z.string() })
                .optional(),
            }),
          ),
        })
        .parse(
          await this.request(
            this.root + "/subscriptions/" + pathPart(line.productId),
          ),
        );
      if (
        !catalog.basePlans.some(
          (v) =>
            v.basePlanId === line.offerDetails.basePlanId &&
            v.autoRenewingBasePlanType?.billingPeriodDuration === "P1M",
        )
      )
        throw fail();
      latest = line.latestSuccessfulOrderId;
      periodEnd = new Date(line.expiryTime).toISOString();
      cancelAtPeriodEnd = line.autoRenewingPlan?.autoRenewEnabled === false;
      const states: Record<string, BillingObservation["state"]> = {
        SUBSCRIPTION_STATE_PENDING: "pending",
        SUBSCRIPTION_STATE_ACTIVE: "active",
        SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "past-due",
        SUBSCRIPTION_STATE_ON_HOLD: "past-due",
        SUBSCRIPTION_STATE_PAUSED: "past-due",
        SUBSCRIPTION_STATE_EXPIRED: "ended",
        SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: "ended",
        SUBSCRIPTION_STATE_CANCELED:
          Date.parse(periodEnd) > Date.now() ? "active" : "ended",
      };
      state = states[purchase.subscriptionState];
      if (!state) throw fail();
    } else {
      const purchase = z
        .object({
          orderId: id.optional(),
          productLineItem: z
            .array(
              z.object({
                productId: z.literal(intent.terms.provider.productId),
              }),
            )
            .length(1),
          obfuscatedExternalAccountId: id,
          testPurchaseContext: z.unknown().optional(),
          purchaseStateContext: z.object({ purchaseState: id }),
        })
        .parse(
          await this.request(
            this.root + "/purchases/productsv2/tokens/" + pathPart(token),
          ),
        );
      if (purchase.testPurchaseContext !== undefined && !this.allowTest)
        throw fail();
      accountBinding = purchase.obfuscatedExternalAccountId;
      latest = purchase.orderId;
      const states: Record<string, BillingObservation["state"]> = {
        PENDING: "pending",
        PURCHASED: "ended",
        CANCELLED: "ended",
      };
      state = states[purchase.purchaseStateContext.purchaseState];
      cancelledOneTime =
        purchase.purchaseStateContext.purchaseState === "CANCELLED";
      if (!state) throw fail();
    }
    if (accountBinding !== intent.accountBinding) throw fail();
    const orderIds = new Set(await this.knownOrders(intent._id));
    if (latest) {
      orderIds.add(latest);
      // Enumerate candidate renewal identities only to recover missed notices.
      // Every candidate must still pass a canonical Orders API verification.
      const renewal = latest.match(/^(.*)\.\.(\d+)$/);
      if (recurring && renewal) {
        const last = Number(renewal[2]);
        if (!Number.isSafeInteger(last) || last > 97)
          throw new AppError(
            "PLAY_RECONCILIATION_LIMIT",
            "Order history requires a bounded administrative reconciliation batch.",
            409,
          );
        orderIds.add(renewal[1]);
        for (let n = 0; n <= last; n++) orderIds.add(renewal[1] + ".." + n);
      }
    }
    if (orderIds.size > 100)
      throw new AppError(
        "PLAY_RECONCILIATION_LIMIT",
        "Reconcile order history in bounded batches.",
        409,
      );
    const payments: BillingObservation["payments"] = [];
    let allOrdersCancelled = true;
    for (const orderId of orderIds) {
      const order = orderSchema.parse(
        await this.request(this.root + "/orders/" + pathPart(orderId)),
      );
      if (!acceptedTokens.has(order.purchaseToken) || order.orderId !== orderId)
        throw fail();
      if (order.state === "CANCELED" && !order.orderHistory.processedEvent)
        continue;
      allOrdersCancelled = false;
      if (order.state === "PENDING") continue;
      if (
        ![
          "PROCESSED",
          "PENDING_REFUND",
          "PARTIALLY_REFUNDED",
          "REFUNDED",
        ].includes(order.state) ||
        !order.orderHistory.processedEvent
      )
        throw fail();
      const line = order.lineItems[0];
      const details = recurring
        ? line.subscriptionDetails
        : line.oneTimePurchaseDetails;
      if (!details) throw fail();
      const paid = playMinorUnits(order.total);
      let refundedMinor = 0;
      if (order.state === "REFUNDED") refundedMinor = paid.amountMinor;
      else
        for (const refund of order.orderHistory.partialRefundEvents) {
          if (refund.state !== "PROCESSED_SUCCESSFULLY") continue;
          const amount = playMinorUnits(refund.refundDetails.total);
          if (amount.currency !== paid.currency) throw fail();
          refundedMinor += amount.amountMinor;
        }
      const suffix = orderId.match(/\.\.(\d+)$/);
      payments.push({
        id: orderId,
        productId: line.productId,
        priceId:
          line.subscriptionDetails?.basePlanId ??
          line.oneTimePurchaseDetails!.purchaseOptionId,
        offerId: details.offerId ?? null,
        paidAt: new Date(
          order.orderHistory.processedEvent.eventTime,
        ).toISOString(),
        periodStart: line.subscriptionDetails
          ? new Date(
              line.subscriptionDetails.servicePeriodStartTime,
            ).toISOString()
          : null,
        periodEnd: line.subscriptionDetails
          ? new Date(
              line.subscriptionDetails.servicePeriodEndTime,
            ).toISOString()
          : null,
        listedMinor: playMinorUnits(line.listingPrice).amountMinor,
        amountMinor: paid.amountMinor,
        currency: paid.currency,
        refundedMinor,
        sequence: suffix ? Number(suffix[1]) + 2 : 1,
        providerPromotionId: null,
      });
    }
    if (cancelledOneTime && allOrdersCancelled && payments.length === 0)
      unpaidOutcome = "cancelled-unpaid";
    return {
      providerId: token,
      accountBinding,
      state,
      periodEnd,
      cancelAtPeriodEnd,
      payments,
      ...(unpaidOutcome ? { unpaidOutcome } : {}),
    };
  }
  fulfillment(intent: BillingIntent, token: string): ProviderActionAdapter {
    return {
      execute: async (action) => {
        if (action.kind === "acknowledge") {
          await this.acknowledge(intent, token);
          return { acknowledged: true };
        }
        if (action.kind === "consume") {
          await this.consume(intent, token);
          return { consumed: true };
        }
        if (action.kind === "cancel") {
          await this.cancelAtRenewal(token);
          return { cancellationRequested: true };
        }
        throw fail();
      },
      readback: async (action) => {
        if (intent.terms.billing.kind === "subscription") {
          const value = z
            .object({
              externalAccountIdentifiers: z.object({
                obfuscatedExternalAccountId: z.literal(intent.accountBinding),
              }),
              acknowledgementState: z.string(),
              lineItems: z.array(
                z.object({
                  autoRenewingPlan: z
                    .object({ autoRenewEnabled: z.boolean() })
                    .optional(),
                }),
              ),
            })
            .parse(
              await this.request(
                this.root +
                  "/purchases/subscriptionsv2/tokens/" +
                  pathPart(token),
              ),
            );
          if (action.kind === "cancel")
            return value.lineItems.every(
              (v) => v.autoRenewingPlan?.autoRenewEnabled === false,
            )
              ? { cancelledAtRenewal: true }
              : null;
          return value.acknowledgementState ===
            "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
            ? { acknowledged: true }
            : null;
        }
        const value = z
          .object({
            obfuscatedExternalAccountId: z.literal(intent.accountBinding),
            productLineItem: z
              .array(
                z.object({
                  productId: z.literal(intent.terms.provider.productId),
                  productOfferDetails: z.object({
                    consumptionState: z.string(),
                  }),
                }),
              )
              .length(1),
          })
          .parse(
            await this.request(
              this.root + "/purchases/productsv2/tokens/" + pathPart(token),
            ),
          );
        return value.productLineItem[0].productOfferDetails.consumptionState ===
          "CONSUMPTION_STATE_CONSUMED"
          ? { consumed: true }
          : null;
      },
    };
  }
  async acknowledge(intent: BillingIntent, token: string) {
    const kind =
      intent.terms.billing.kind === "subscription"
        ? "subscriptions"
        : "products";
    return this.request(
      this.root +
        "/purchases/" +
        kind +
        "/" +
        pathPart(intent.terms.provider.productId) +
        "/tokens/" +
        pathPart(token) +
        ":acknowledge",
      "POST",
      {},
    );
  }
  async consume(intent: BillingIntent, token: string) {
    if (intent.terms.billing.kind !== "one-time") throw fail();
    return this.request(
      this.root +
        "/purchases/products/" +
        pathPart(intent.terms.provider.productId) +
        "/tokens/" +
        pathPart(token) +
        ":consume",
      "POST",
    );
  }
  async cancelAtRenewal(token: string) {
    return this.request(
      this.root +
        "/purchases/subscriptionsv2/tokens/" +
        pathPart(token) +
        ":cancel",
      "POST",
      {
        cancellationContext: {
          cancellationType: "USER_REQUESTED_STOP_RENEWALS",
        },
      },
    );
  }
}
