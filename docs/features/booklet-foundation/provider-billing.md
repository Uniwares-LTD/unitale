# Use provider-backed purchase catalogs

## Purpose

The server-only billing services connect published purchase snapshots to Stripe
and Google Play. They are additive to legacy credit-pack checkout and its worker.
The Android purchase client and commerce administration are implemented in this
repository; provider provisioning and installed-device acceptance belong to T28.

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
   back to Stripe inside the Play distribution; the client retains its Play context
   across navigation, even when the native billing service is unavailable.
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
replacement instruction for the native client; the backend accepts a linked replacement token
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

## Administration and purchase UI

`/admin/commerce` is English/LTR and requires current administrator access on
both reads and mutations. Catalogs include purchase offers, consumption products
and promotions. The consumption editor obtains field controls from registered
trusted product types; it cannot register executable extensions. Save creates a
new draft revision. Preview binds the exact revision/hash. Explicit local publish
preserves prior accepted snapshots. Provider publication has its own preview,
explicit publish and readback journal; a status check never issues a provider write.
Subscriptions and consumption charges have bounded account-filtered lists.
Consumption refunds require an audit reason and use the original charge's limits;
active work must be resolved first. Monetary payment refunds remain provider-side
and are reconciled by the existing worker.

`/credits` shows published, configured-channel offers and owned purchase history.
Stripe catalogs can be used without legacy `CREDIT_PACKS_JSON` seeds; existing
legacy packs and receipts remain supported. No production offers are installed.
The browser API `GET /api/payments/offers` returns bounded published snapshots;
it excludes drafts and exposes no provider credentials. All purchase mutations
retain same-origin/session protection. Plan changes use a stable action identity
across reloads. Unknown purchase outcomes direct the owner to restore the original
checkout instead of automatically invoking payment again.

## Android bridge

Regenerate using `npm run android:generate` with the configured host/package.
Bubblewrap 1.25.0 enables Play Billing and its Digital Goods delegation service,
uses a Play-marked start URL, and copies `android/billing/CatalogPaymentActivity.java`
into the generated project. The wrapper now requires API 24 or newer. The generator
checks the expected upstream PaymentActivity before replacing it, and pins Billing
Client 8.3.0 alongside Android Browser Helper billing 1.2.0. Do not edit generated
Android files to retain customizations; regeneration owns them.

The activity accepts requests only from the verified TWA browser. It queries the
exact product, base plan/purchase option and offer, then returns all store pricing
phases for an explicit price confirmation. A second user gesture starts payment;
it rechecks the quote and carries the server's obfuscated account binding. Changed
prices or unavailable offers fail explicitly. Deferred subscription replacement
passes the owned old token and DEFERRED mode. Recreation or connection loss never
replays a purchase. The backend remains responsible for verification, grants,
acknowledgement and consumption; tokens are not placed in client logs or storage.

Digital Goods `listPurchases` supports restoration against an owned original
checkout. Ambiguous product matches fail rather than guessing an entitlement.
A pending replacement tries the new product, then the old product if replacement
has not happened. Store management links include the configured application and
product. Cross-store transitions still wait for the old subscription to end.
The native quote step is necessary because the standard Digital Goods subscription
response can select only the first eligible offer rather than the configured plan.

## Verify

Run `npm run test:commerce-ui` for admin service and fake Payment Request tests.
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

## Native build prerequisites

The generated API 36 project uses Android Gradle Plugin 8.10.1, Gradle 8.11.1,
Android SDK Platform 36 and Build Tools 35.0.0. Java 17 is the minimum. Gradle
compiles and packages the Android wrapper; Google Maven supplies the Android
plugin, browser helper and Play Billing libraries. They are build dependencies,
not services deployed with the web application.

If Google's default Maven hostname returns 404 for these published versions,
`android/google-maven.init.gradle` provides an opt-in official Google hostname
fallback. From the repository root, with Gradle available and `ANDROID_HOME`
pointing to the prepared SDK, use PowerShell:

```powershell
$googleInit = (Resolve-Path android/google-maven.init.gradle).Path
gradle -I $googleInit -p android/project :app:assembleDebug --no-daemon
```

The absolute init-script path is necessary because `-p` changes the project
root. The script changes only Google's default Maven repository URL; it preserves
versions, TLS verification and Maven Central. It does not configure a proxy.
Use environment-appropriate Gradle proxy settings and a separate `GRADLE_USER_HOME`
when an existing user configuration points to an obsolete proxy. SDK downloads
are separate from Maven resolution and still require the correct platform/build
tools and an accepted Android SDK license.

For the same hostname issue during SDK setup, official package metadata is available
at [Google's alternate SDK repository](https://dl-ssl.google.com/android/repository/repository2-3.xml).
The verified packages for this build are `platform-36_r02.zip` and
`build-tools_r35_windows.zip`; Google's download CDN also serves these under
`https://redirector.gvt1.com/edgedl/android/repository/`. Validate complete archive
lengths and checksums against the metadata before extraction. An isolated SDK uses
`platforms/android-36` and `build-tools/35.0.0` under its `ANDROID_HOME`. Keep license
acceptance explicit; reuse existing acceptance only for identical license terms.

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
