# Use consumption orders and promotions

## Purpose

T07 adds prepaid product orders and revision entitlements; T08 adds promotion
publication, checkout reservations and verified-payment benefits. Both reuse the
existing transactional wallet. These are server-only services, not public tool
endpoints. Unitale will connect product rules and its creator experience in later
tasks; T09/T10 own real provider verification and subscription lifecycle, T12 owns
commerce admin screens, and T25 owns checkout/storefront UI.

## Prerequisites

Use MongoDB transactions and apply the additive
`core:0002-consumption-promotions` migration, or run `npm run db:indexes`.
Existing wallets, purchase orders, reservations and Run jobs retain their parsers
and settlement behavior. No production offers, packages or coupon codes are seeded.
No new environment variable or provider credential is required.

## Consumption lifecycle

The [order service](../../../src/lib/server/commerce/orders.ts) takes an authenticated
credit actor and trusted product admission callbacks.

1. `queueConsumption` verifies the current published quote and product validator,
   stores immutable terms/fields, and binds one order to the owned production ID.
   Exact retries reuse it; changed inputs conflict. Cancelling queued work costs zero.
2. `startConsumption` rechecks ownership/configuration/capacity through the required
   admission callback, debits the snapshotted package price, and creates one active
   workflow in the same transaction. Call it at production admission before dispatch,
   not when placing work on a waitlist. Admission failure rolls back the debit.
3. `createAiJob` accepts a server-supplied `consumption: { orderId, workflowId }`.
   Such jobs require zero generic credits, no pricing/responder, and an exact owned
   target ID. One workflow binds one job; generic Run settlement cannot bill again.
   This is an opt-in server integration. Existing browser Run creation does not
   acquire prepaid status merely by sending an order ID.
4. `finishConsumptionWorkflow` releases the workflow only after its bound job has
   a retained, verified terminal outcome or recorded operator resolution. Unknown
   outcomes remain busy. An unbound workflow can be explicitly abandoned before
   dispatch; its charge and revision usage remain for audited refund decisions.
5. `continueConsumption` admits another workflow without another package debit.
   It rejects expired/closed/refunded entitlements and competing active workflows.
   The caller must validate the continuation's exact product state in its admission
   callback. A continuation is not a new customer revision.
6. `closeConsumption` closes inactive started orders or cancels unstarted orders.
   There is no automatic refund for cancellation or failure.

Admission callbacks must use the supplied transaction to fence the owned production,
configuration, capacity and allowed target subjects. They must not perform network
calls. The callbacks are trusted application code; clients cannot supply them.
Product state transitions and stage-specific rules remain Unitale responsibilities.

### Revisions and locks

`quoteRevision` returns the affected stable subjects, included/paid allocation,
credits and quote hash. Request allowances count once per request; subject allowances
count independently for each stable subject. `startRevision` requires the accepted
hash and amount, rechecks the quote in the wallet transaction, and consumes each
allocation once with its debit. Stale quotes or changed retries conflict.

`lockRevisionCategories` permanently closes selected categories for the active
workflow before downstream generation is authorized. Extra payment cannot reopen
them. Product adapters decide which generation boundary closes each category.
Clarification and automatic repair paths use the existing workflow; they must not
call the customer revision API. Paid revisions do not reopen earlier stages.

`refundConsumption` rechecks administrator access and atomically links a credit
adjustment to the original package/revision charge. Refunds cannot exceed that charge
and cannot run while work is active. Fully refunding a package disables its entitlement;
fully refunding a revision revokes its allocations. Partial refunds leave the remaining
entitlement active. Refund credits are non-expiring. Repeated refund identities are
idempotent; changed payloads conflict. Resolve unknown provider outcomes before release
and refund. Administrators can use `resolveConsumptionWorkflow` for a suspended
owner after verified termination or before any job was bound; it audits the release
and cannot bypass an unknown outcome or automatically refund. A failed response must be reconciled using the same request identity.

## Promotion lifecycle

Publish `kind: "promotion"` through the existing draft, preview, explicit publish
and readback catalog service. Definitions contain T01 promotion terms plus optional
`eligibility` (account allowlist or first-verified-purchase-only; default unrestricted).
Coupon codes are uppercase, unique across catalog identities and not reusable by a
different promotion. `resolvePromotionCode` returns only the current catalog identity;
eligibility is checked at reservation. A null code represents a scheduled offer selected
explicitly by the application. V1 selects one promotion and does not stack.

The [promotion service](../../../src/lib/server/commerce/promotions.ts) provides:

- `reservePromotion`: authenticates the account; checks the current published
  offer/promotion, code, schedule, channel, eligibility and global/per-account limits;
  snapshots accepted terms. A checkout cannot switch to a second promotion.
- A 30-minute checkout reservation window, shortened by promotion end time.
  Expired or uncertain checkouts continue occupying their quota until a provider
  adapter verifies they ended unpaid. This deliberately avoids selling the same last
  slot twice when payment callbacks arrive late. There is no timer-based quota release.
- `recordVerifiedPayment`: a trusted provider-adapter boundary that stores immutable
  channel/payment/account/offer/sequence identity with retained provider-receipt
  evidence. T09/T10 must verify the canonical payment, account association, accepted
  monetary terms and status before calling it. A webhook payload or model claim is
  not sufficient. Reuse stable evidence/payment identities on retries.
- `finalizePromotion`: checks the verified payment against the reservation and
  commits its benefit and wallet grant atomically. The first payment must fall inside
  the accepted checkout window. Later subscription payments must match the same
  subscription, offer snapshot and configured duration. The default terms are
  first-payment-only; multiple-payment terms must be explicitly published.
- Bonus credits work on either channel. Expiry is calculated from verified payment
  time, and a late callback cannot revive an expired bonus. Monetary discounts grant
  no extra credits and require the exact provider-observed promotion identity.
  Play discounts must already be represented by supported store prices/offers.
- `releasePromotion`: server-only provider reconciliation for verified unpaid,
  terminal checkouts, with retained receipt evidence. Client cancellation, a missing
  notification or a local timeout alone cannot release the quota.

The wallet prevents concurrent balance races; a shared promotion document fences
global quota across different accounts. Unique payment and subscription sequence
identities prevent duplicate grants. Published edits never change accepted reservations.

Provider receipt payloads live in T05 evidence storage; operational payment IDs and
promotion claims remain in dedicated collections. Provider adapters must retain
unresolved evidence and handle refund/revocation reconciliation in T09/T10. No new
model-callable payment verification or refund action is exposed.

## Verify

```powershell
npm.cmd run test:commerce
node --conditions=react-server --import tsx --test tests/accounts/credits.test.ts tests/accounts/ai-jobs.test.ts
```

Tests use disposable MongoDB and fake observations. Real payments, live provider
catalog publication, store restoration and device behavior remain external acceptance
gates. Deploying this code does not activate a product or a provider.
