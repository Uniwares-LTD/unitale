# Use provider-backed purchase catalogs

## Purpose

The server-only billing services connect published purchase snapshots to Stripe
and Google Play. They are additive to legacy credit-pack checkout and its worker.
The Android purchase bridge and commerce administration screens belong to T11 and
T12; provider provisioning and installed-device acceptance belong to T28.

## Prerequisites

Use MongoDB transactions and apply `core:0003-provider-billing`, or run
`npm run db:indexes`. Existing purchase lots remain non-expiring. New subscription
lots expire 90 days after the verified payment time. No catalog is seeded.

Offline tests require no provider credentials. For separately authorized provider
acceptance, Stripe uses the existing private key/webhook settings and
`PAYMENTS_MODE=stripe`. Play uses `ANDROID_PACKAGE_NAME` and the private
`PLAY_BILLING_SERVICE_ACCOUNT_JSON`. Configure authenticated Pub/Sub push with
`PLAY_BILLING_PUBSUB_AUDIENCE` and `PLAY_BILLING_PUBSUB_EMAIL`; the audience must
match the notification URL and the email the authorized push service account.
These are server settings. The service-account JSON is a credential reference,
never tracked deployment configuration. Host-owned audience/email values and
credential installation require normal deployment authorization.

## Purchase and subscription flow

1. `beginBilling` snapshots the currently published offer under an authenticated
   account and stable checkout identity. A pending subscription occupies the same
   account slot as an active subscription, across both stores.
2. `startCatalogPurchase` returns a journalled Stripe checkout URL or Play product
   identifiers and an obfuscated account binding for the TWA client. Never fall
   back to Stripe inside the Play distribution; T11 owns that client guard.
3. `restoreCatalogPurchase` takes the owned checkout and provider identity. The
   adapter retrieves canonical store data, validates application/mode/account,
   product, price and payment status, then the service grants credits once.
4. Signed Stripe events and authenticated Google notifications enter a durable
   inbox. The payment worker reconciles those identities and polls known purchases
   to recover missed notifications. Notifications themselves never grant credits.
5. Verified Play delivery is followed by journalled acknowledgement for subscriptions
   or consumption for one-time purchases. Readback resolves a lost response without
   repeating the financial grant or blindly replaying a provider write.

`POST /api/payments/catalog` is an authenticated, same-origin browser API with
`start`, `restore` and `change` actions. Its authenticated GET lists owned purchase
identities with an opaque pagination cursor for restoration on another device. It is not a workflow/MCP tool. Existing
`/api/payments/stripe/checkout` and its accounting remain available unchanged.
`/api/payments/play/notifications` verifies Google RS256 signatures, issuer,
audience, sender email and expiry before accepting bounded notification data.

Cancellation stops renewal at period end. Stripe changes use subscription
schedules with a future phase and no proration. Play changes return a `DEFERRED`
replacement instruction for T11; the backend accepts a linked replacement token
only for an accepted next offer and applies new credits at a verified renewal.
A pending Play replacement instruction does not block period-end cancellation.
Unknown backend writes still require reconciliation before competing changes.
Canonical payment evidence finalizes the pending Play change. A different store
cannot take the account slot until the prior subscription is verified ended.

Accepted terms remain immutable in payment grants. Catalog edits do not change
existing subscriptions. Refund targets are cumulative, use integer arithmetic,
and reverse associated bonus credits. Pending refunds do not reduce the wallet;
won/closed Stripe disputes restore entitlement. Expired unused subscription credits
are not deducted again. Financial records and idempotency receipts remain durable;
completed raw evidence is released to normal retention, while unresolved evidence
stays protected.

Stripe checkout success and cancellation return to `/credits`. Lost-response
recovery follows provider pagination in batches of at most 100 pages, with up to
100 sessions per page. It saves a durable cursor after each page; retrying a paused
batch continues readback without replaying an unknown checkout creation.

Coupon reservations are released only after canonical unpaid terminal evidence:
Stripe expiry or Play cancellation before payment. Pending checkouts, elapsed local
time and browser cancellation cannot release capacity. A canceled Play order must
have no processed payment. Stable receipt identities and a reconciliation lease
fence make duplicate notifications and lost release responses idempotent.

## Provider publication

`previewProviderCatalog` validates a bounded provider draft. An administrator binds
that preview to the current local catalog revision with `prepareProviderPublication`.
`executeProviderAction` records preparation, publishing, verified, partial or unknown
outcome. A successful network response alone is insufficient: readback must match
intended fields. Unknown writes permit readback only, not an automatic second write.

Supported primitives are Stripe products, immutable prices, percentage coupons and native promotion codes;
Play subscription/one-time product patches, base-plan activation and offer activation.
Play patch drafts retain explicit provider fields so administration can preview the
actual listings and regional configurations. Multi-step publication uses separate
journalled primitives. Native offers/coupon behavior is provider-specific. Provider
IDs returned by verified publication must be bound into the local purchase catalog
before publishing that offer; local catalog publication does not itself contact a
provider. T12 supplies the administrator editors and explicit publication controls.

## Verify

Run `npm run test:provider-billing` for disposable-database financial tests, injected
canonical provider fixtures, signed push tests and transport/readback failures.
Run the existing commerce, wallet, payment and billing-compatibility tests as well.
The transport allows only the two provider origins, bounds responses to 1 MiB and
uses 10-second request timeouts. Reconciliation uses a fenced two-minute lease and
bounded history (100 records); oversized histories stop explicitly for bounded
administrative reconciliation rather than truncating financial data.

These fixtures do not prove live SDK/API or store behavior. T28 must exercise the
configured Stripe API version (`2026-09-30.endive`, matching the installed SDK),
Play application/offer configuration, renewal and replacement flows, Pub/Sub,
acknowledgement, restore and installed TWA behavior before production activation.

## Troubleshooting

A provider timeout after a write is an unknown outcome. Keep the journal and use
canonical readback. Do not delete its identity and retry with a new purchase key.
A pending subscription blocks another store until canonical terminal evidence
releases its slot. Ownership, price, currency or period mismatches halt grants.
An expired delayed monthly payment is recorded without issuing fresh credits.
Provider readback failures and partial publication remain visible journal states
for administrative reconciliation; they are not silently treated as success.

## Provider references

- [Stripe checkout pagination](https://docs.stripe.com/api/checkout/sessions/list)
- [Stripe subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
- [Google subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
- [Google Orders resource](https://developers.google.com/android-publisher/api-ref/rest/v3/orders)
- [Google subscription publishing](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/patch)
- [Google one-time product publishing](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts/patch)
