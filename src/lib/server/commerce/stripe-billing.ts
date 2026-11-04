import "server-only";
import { z } from "zod";
import { AppError } from "../../auth-policy";
import type {
  BillingIntent,
  BillingObservation,
  BillingProvider,
  PurchaseTerms,
} from "./billing";
import type { ProviderActionAdapter } from "./provider-actions";
import {
  pathPart,
  stripeForm,
  type ProviderRequest,
} from "./provider-transport";
const id = z.string().min(1);
const money = z.number().int().nonnegative().safe();
const seconds = z.number().int().nonnegative();
const iso = (value: number) => new Date(value * 1000).toISOString();
const fail = () =>
  new AppError(
    "STRIPE_VERIFICATION_FAILED",
    "Stripe purchase does not match accepted terms.",
    409,
  );
const sessionSchema = z.object({
  id,
  livemode: z.boolean(),
  client_reference_id: id,
  status: z.enum(["open", "complete", "expired"]),
  payment_status: z.string(),
  subscription: id.nullable(),
  payment_intent: id.nullable(),
  currency: id.nullable(),
  amount_total: money.nullable(),
  discounts: z
    .array(z.object({ promotion_code: id.nullable() }))
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.string()),
});
const subscriptionSchema = z.object({
  id,
  livemode: z.boolean(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  start_date: seconds,
  metadata: z.record(z.string(), z.string()),
  items: z.object({
    data: z
      .array(
        z.object({
          current_period_start: seconds,
          current_period_end: seconds,
          price: z.object({
            id,
            product: id,
            recurring: z.object({
              interval: z.literal("month"),
              interval_count: z.literal(1),
            }),
          }),
          quantity: z.number(),
        }),
      )
      .length(1),
  }),
});
const lineSchema = z.object({
  id,
  quantity: z.number().nullable(),
  amount: z.number().int(),
  period: z.object({ start: seconds, end: seconds }),
  parent: z.object({
    subscription_item_details: z.object({ proration: z.literal(false) }),
  }),
  pricing: z
    .object({ price_details: z.object({ price: id, product: id }) })
    .nullable(),
});
const invoiceSchema = z.object({
  id,
  livemode: z.boolean(),
  status: z.string().nullable(),
  discounts: z
    .array(z.union([id, z.object({ promotion_code: id.nullable() })]))
    .default([]),
  amount_paid: money,
  amount_remaining: money,
  currency: id,
  created: seconds,
  status_transitions: z.object({ paid_at: seconds.nullable() }),
  lines: z.object({ has_more: z.boolean(), data: z.array(lineSchema) }),
});

export class StripeBillingProvider implements BillingProvider {
  readonly channel = "stripe" as const;
  constructor(
    private request: ProviderRequest,
    private live: boolean,
  ) {}
  private async reversal(paymentIntentId: string, amount: number) {
    const refunds = z
      .object({
        has_more: z.literal(false),
        data: z.array(
          z.object({ status: z.string().nullable(), amount: money }),
        ),
      })
      .parse(
        await this.request(
          "/v1/refunds?payment_intent=" +
            pathPart(paymentIntentId) +
            "&limit=100",
        ),
      );
    const disputes = z
      .object({
        has_more: z.literal(false),
        data: z.array(z.object({ status: z.string() })),
      })
      .parse(
        await this.request(
          "/v1/disputes?payment_intent=" +
            pathPart(paymentIntentId) +
            "&limit=100",
        ),
      );
    if (
      disputes.data.some(
        (v) => !["won", "warning_closed", "prevented"].includes(v.status),
      )
    )
      return amount;
    const refunded = refunds.data
      .filter((v) => v.status === "succeeded")
      .reduce((sum, v) => sum + v.amount, 0);
    if (!Number.isSafeInteger(refunded) || refunded > amount) throw fail();
    return refunded;
  }
  async checkout(
    intent: BillingIntent,
    origin: string,
    promotionCode?: string,
  ) {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw fail();
    const recurring = intent.terms.billing.kind === "subscription";
    return this.request(
      "/v1/checkout/sessions",
      "POST",
      stripeForm({
        mode: recurring ? "subscription" : "payment",
        client_reference_id: intent.accountBinding,
        metadata: { billingIntent: intent._id },
        ...(!recurring
          ? { payment_intent_data: { metadata: { billingIntent: intent._id } } }
          : {}),
        ...(recurring
          ? {
              subscription_data: {
                metadata: {
                  billingIntent: intent._id,
                  accountBinding: intent.accountBinding,
                },
              },
            }
          : {}),
        line_items: [{ price: intent.terms.provider.priceId, quantity: 1 }],
        success_url: url.origin + "/credits",
        cancel_url: url.origin + "/credits",
        ...(promotionCode
          ? { discounts: [{ promotion_code: promotionCode }] }
          : {}),
      }),
      "billing-checkout:" + intent._id,
    );
  }
  async inspect(
    intent: BillingIntent,
    providerId: string,
  ): Promise<BillingObservation> {
    const checkout = sessionSchema.parse(
      await this.request("/v1/checkout/sessions/" + pathPart(providerId)),
    );
    if (
      checkout.id !== providerId ||
      checkout.livemode !== this.live ||
      checkout.client_reference_id !== intent.accountBinding ||
      checkout.metadata.billingIntent !== intent._id
    )
      throw fail();
    if (!checkout.subscription) {
      if (
        intent.terms.billing.kind === "subscription" &&
        checkout.status === "complete"
      )
        throw fail();
      if (checkout.status !== "complete" || checkout.payment_status !== "paid")
        return {
          providerId,
          accountBinding: checkout.client_reference_id,
          state: checkout.status === "expired" ? "ended" : "pending",
          ...(checkout.status === "expired" &&
          checkout.payment_status === "unpaid"
            ? { unpaidOutcome: "expired-unpaid" as const }
            : {}),
          periodEnd: null,
          cancelAtPeriodEnd: false,
          payments: [],
        };
      if (
        !checkout.payment_intent ||
        checkout.currency === null ||
        checkout.amount_total === null
      )
        throw fail();
      const payment = z
        .object({
          id,
          status: z.literal("succeeded"),
          livemode: z.boolean(),
          amount_received: money,
          currency: id,
          latest_charge: id,
        })
        .parse(
          await this.request(
            "/v1/payment_intents/" + pathPart(checkout.payment_intent),
          ),
        );
      const charge = z
        .object({
          id,
          paid: z.literal(true),
          amount: money,
          amount_refunded: money,
          created: seconds,
          disputed: z.boolean(),
        })
        .parse(
          await this.request("/v1/charges/" + pathPart(payment.latest_charge)),
        );
      const items = z
        .object({
          has_more: z.literal(false),
          data: z
            .array(
              z.object({
                quantity: z.literal(1),
                price: z.object({
                  id,
                  product: id,
                  unit_amount: money,
                  currency: id,
                }),
              }),
            )
            .length(1),
        })
        .parse(
          await this.request(
            "/v1/checkout/sessions/" + pathPart(providerId) + "/line_items",
          ),
        );
      if (
        payment.livemode !== this.live ||
        payment.amount_received !== checkout.amount_total ||
        payment.currency !== checkout.currency
      )
        throw fail();
      return {
        providerId,
        accountBinding: checkout.client_reference_id,
        state: "ended",
        periodEnd: null,
        cancelAtPeriodEnd: false,
        payments: [
          {
            id: payment.id,
            productId: items.data[0].price.product,
            priceId: items.data[0].price.id,
            offerId: null,
            paidAt: iso(charge.created),
            periodStart: null,
            periodEnd: null,
            listedMinor: items.data[0].price.unit_amount,
            amountMinor: payment.amount_received,
            currency: payment.currency.toUpperCase(),
            refundedMinor: await this.reversal(payment.id, charge.amount),
            sequence: 1,
            providerPromotionId:
              checkout.discounts?.[0]?.promotion_code ?? null,
          },
        ],
      };
    }
    if (intent.terms.billing.kind !== "subscription") throw fail();
    const sub = subscriptionSchema.parse(
      await this.request(
        "/v1/subscriptions/" + pathPart(checkout.subscription),
      ),
    );
    if (
      sub.livemode !== this.live ||
      sub.metadata.billingIntent !== intent._id ||
      sub.metadata.accountBinding !== intent.accountBinding
    )
      throw fail();
    const list = z
      .object({
        has_more: z.literal(false),
        data: z.array(invoiceSchema).max(100),
      })
      .parse(
        await this.request(
          "/v1/invoices?subscription=" +
            pathPart(sub.id) +
            "&limit=100&expand[]=data.discounts",
        ),
      );
    const paid = list.data
      .filter((v) => v.status === "paid")
      .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
    const payments: BillingObservation["payments"] = [];
    for (const invoice of paid) {
      if (
        invoice.livemode !== this.live ||
        invoice.lines.has_more ||
        invoice.lines.data.length !== 1 ||
        invoice.amount_remaining !== 0 ||
        !invoice.status_transitions.paid_at
      )
        throw fail();
      const line = invoice.lines.data[0];
      if (line.quantity !== 1 || !line.pricing) throw fail();
      // Read canonical invoice payment allocations; notification amounts are not authoritative.
      const allocations = z
        .object({
          has_more: z.literal(false),
          data: z
            .array(
              z.object({
                status: z.string(),
                payment: z.object({
                  type: z.literal("payment_intent"),
                  payment_intent: id,
                }),
              }),
            )
            .max(1),
        })
        .parse(
          await this.request(
            "/v1/invoice_payments?invoice=" +
              pathPart(invoice.id) +
              "&status=paid&limit=100",
          ),
        );
      let refunded = 0;
      if (invoice.amount_paid > 0) {
        if (allocations.data.length !== 1) throw fail();
        const pi = z
          .object({ status: z.literal("succeeded"), latest_charge: id })
          .parse(
            await this.request(
              "/v1/payment_intents/" +
                pathPart(allocations.data[0].payment.payment_intent),
            ),
          );
        const charge = z
          .object({
            amount: money,
            amount_refunded: money,
            disputed: z.boolean(),
          })
          .parse(
            await this.request("/v1/charges/" + pathPart(pi.latest_charge)),
          );
        refunded = await this.reversal(
          allocations.data[0].payment.payment_intent,
          charge.amount,
        );
      }
      payments.push({
        id: invoice.id,
        productId: line.pricing.price_details.product,
        priceId: line.pricing.price_details.price,
        offerId: null,
        paidAt: iso(invoice.status_transitions.paid_at),
        periodStart: iso(line.period.start),
        periodEnd: iso(line.period.end),
        listedMinor: line.amount,
        amountMinor: invoice.amount_paid,
        currency: invoice.currency.toUpperCase(),
        refundedMinor: refunded,
        sequence: payments.length + 1,
        providerPromotionId:
          typeof invoice.discounts[0] === "object"
            ? invoice.discounts[0].promotion_code
            : null,
      });
    }
    const state = ["canceled", "incomplete_expired"].includes(sub.status)
      ? "ended"
      : ["past_due", "unpaid", "paused"].includes(sub.status)
        ? "past-due"
        : sub.status === "active"
          ? "active"
          : "pending";
    return {
      providerId,
      accountBinding: checkout.client_reference_id,
      state,
      periodEnd: iso(sub.items.data[0].current_period_end),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      payments,
    };
  }
  actions(origin: string): ProviderActionAdapter {
    const inputSchema = z.object({
      intentId: id,
      providerId: id.nullable(),
      accountBinding: id,
      providerPromotionId: id.nullable(),
      terms: z.unknown(),
      nextTerms: z.unknown().nullable(),
      effectiveAt: z.string().nullable(),
    });
    const subscription = async (providerId: string | null) => {
      if (!providerId) throw fail();
      const checkout = sessionSchema.parse(
        await this.request("/v1/checkout/sessions/" + pathPart(providerId)),
      );
      if (!checkout.subscription) throw fail();
      return checkout.subscription;
    };
    return {
      execute: async (action) => {
        const input = inputSchema.parse(action.input);
        if (action.kind === "checkout")
          return this.checkout(
            {
              _id: input.intentId,
              accountBinding: input.accountBinding,
              terms: input.terms,
            } as BillingIntent,
            origin,
            input.providerPromotionId ?? undefined,
          );
        const subscriptionId = await subscription(input.providerId);
        if (action.kind === "cancel")
          return this.cancelAtRenewal(subscriptionId, action._id);
        if (action.kind === "plan-change")
          return this.deferPlan(
            subscriptionId,
            input.nextTerms as PurchaseTerms,
            action._id,
          );
        throw fail();
      },
      readback: async (action, checkpoint) => {
        const input = inputSchema.parse(action.input);
        if (action.kind === "checkout") {
          const base =
            "/v1/checkout/sessions?limit=100&created[gte]=" +
            Math.floor((action.createdAt.getTime() - 60000) / 1000);
          const seen = new Set<string>();
          let cursor = action.recoveryCursor ?? undefined;
          // Page bounded provider responses; unrelated checkouts may have no binding.
          for (let page = 0; page < 100; page++) {
            const sessions = z
              .object({
                has_more: z.boolean(),
                data: z
                  .array(
                    z
                      .object({
                        id,
                        livemode: z.boolean(),
                        client_reference_id: id.nullable(),
                        metadata: z.record(z.string(), z.string()).nullable(),
                      })
                      .passthrough(),
                  )
                  .max(100),
              })
              .parse(
                await this.request(
                  base + (cursor ? "&starting_after=" + pathPart(cursor) : ""),
                ),
              );
            const candidate = sessions.data.find(
              (v) =>
                v.metadata?.billingIntent === input.intentId &&
                v.client_reference_id === input.accountBinding &&
                v.livemode === this.live,
            );
            if (candidate) {
              const found = sessionSchema
                .extend({ url: z.string().nullable() })
                .parse(candidate);
              return { id: found.id, url: found.url };
            }
            if (!sessions.has_more) {
              await checkpoint?.(null);
              return null;
            }
            const last = sessions.data.at(-1)?.id;
            if (!last || seen.has(last)) throw fail();
            seen.add(last);
            cursor = last;
            await checkpoint?.(cursor);
          }
          throw new AppError(
            "STRIPE_RECOVERY_LIMIT",
            "Checkout recovery paused at its saved cursor; retry reconciliation to continue.",
            409,
          );
        }
        const subscriptionId = await subscription(input.providerId);
        const sub = subscriptionSchema
          .extend({ schedule: id.nullable() })
          .parse(
            await this.request("/v1/subscriptions/" + pathPart(subscriptionId)),
          );
        if (
          sub.metadata.billingIntent !== input.intentId ||
          sub.metadata.accountBinding !== input.accountBinding ||
          sub.livemode !== this.live
        )
          throw fail();
        if (action.kind === "cancel")
          return sub.cancel_at_period_end
            ? { subscriptionId, cancelAtPeriodEnd: true }
            : null;
        if (action.kind !== "plan-change" || !sub.schedule) return null;
        const schedule = z
          .object({
            phases: z.array(
              z.object({
                start_date: seconds,
                proration_behavior: z.string(),
                items: z.array(z.object({ price: id, quantity: z.number() })),
              }),
            ),
          })
          .parse(
            await this.request(
              "/v1/subscription_schedules/" + pathPart(sub.schedule),
            ),
          );
        const next = input.nextTerms as PurchaseTerms;
        const phase = schedule.phases.find(
          (v) =>
            iso(v.start_date) === input.effectiveAt &&
            v.proration_behavior === "none" &&
            v.items.length === 1 &&
            v.items[0].price === next.provider.priceId &&
            v.items[0].quantity === 1,
        );
        return phase
          ? {
              subscriptionId,
              scheduleId: sub.schedule,
              effectiveAt: input.effectiveAt,
              priceId: next.provider.priceId,
            }
          : null;
      },
    };
  }
  async cancelAtRenewal(subscriptionId: string, key: string) {
    return this.request(
      "/v1/subscriptions/" + pathPart(subscriptionId),
      "POST",
      stripeForm({ cancel_at_period_end: true }),
      key,
    );
  }
  async deferPlan(subscriptionId: string, next: PurchaseTerms, key: string) {
    const sub = subscriptionSchema.parse(
      await this.request("/v1/subscriptions/" + pathPart(subscriptionId)),
    );
    const item = sub.items.data[0];
    const schedule = z
      .object({ id })
      .parse(
        await this.request(
          "/v1/subscription_schedules",
          "POST",
          stripeForm({ from_subscription: subscriptionId }),
          key + ":schedule",
        ),
      );
    return this.request(
      "/v1/subscription_schedules/" + pathPart(schedule.id),
      "POST",
      stripeForm({
        end_behavior: "release",
        proration_behavior: "none",
        phases: [
          {
            start_date: item.current_period_start,
            end_date: item.current_period_end,
            items: [{ price: item.price.id, quantity: 1 }],
            proration_behavior: "none",
          },
          {
            items: [{ price: next.provider.priceId, quantity: 1 }],
            proration_behavior: "none",
            duration: { interval: "month", interval_count: 1 },
          },
        ],
      }),
      key + ":phases",
    );
  }
}
