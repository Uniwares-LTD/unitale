# Run billing compatibility checks

## Purpose

T03 provides offline fixtures for Stripe and Google Play billing contracts.
It exercises the installed Stripe SDK with injected fetchers, webhook signature
verification, Play REST request/response candidates, and the installed Bubblewrap
billing feature. Global fetch is rejected; only explicit fake fetchers are used.

## Prerequisites and command

Node 24 and locked npm dependencies are sufficient for this suite. No secrets,
environment file, payment account, Android SDK, store publication or paid calls
are required.

```powershell
npm.cmd run test:billing-compat
```

The suite currently contains nine tests. Provider candidates are test support,
not live billing implementation.

## Verified contracts

- Stripe recurring price creation supplies the accepted product, amount, currency,
  interval and stable idempotency key; retrieval checks provider readback.
- Signed webhook notices are authenticated; invoice retrieval supplies payment
  and subscription identities. A renewal grant must key off the verified payment,
  not a notification delivery ID.
- Lost Stripe publication responses are not automatically replayed.
- Play subscription restoration/RTDN handling queries subscriptionsv2 with the
  purchase token, verifies account/product and distinguishes pending, expired,
  paused, held, active, canceled and grace-period cases. Previously paid order
  identity remains stable across restoration; a renewal has a different order ID.
- Consumable verification precedes durable credit delivery and consumption.
  Pending/canceled/refunded purchases do not grant credits; uncertain consumption
  remains unresolved. Subscription acknowledgement uses its own endpoint.
- Play subscription catalog candidates create a draft and verify readback.
  Unknown creates remain uncertain instead of repeating publication.
- TWA fixtures cover store-provided prices and restored tokens. A known Play
  context without the bridge is unavailable rather than falling back to Stripe.
- Installed Bubblewrap 1.25.0 contributes
  `com.google.androidbrowserhelper:billing:1.2.0`, PaymentActivity,
  PaymentService and DigitalGoodsRequestHandler. The current Android generator
  has `features: {}`; T11 must enable `playBilling` and verify the resulting app.

The existing Stripe one-time purchase suite separately covers checkout
verification, refunds, disputes and durable reconciliation. T09/T10 will compose
these contracts with the wallet, subscription exclusivity, promotions and provider
publication journals; this suite does not claim those services already exist.

## Sources and acceptance limits

Provider references checked for this task on 2026-11-04:

- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
  describe verified subscription payment notifications.
- [Play subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
  identifies subscriptionsv2 as the source of current state and describes acknowledgement.
- [Play subscription resource](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2)
  defines state, account identities and line-item order fields.
- [Play product purchases](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products)
  defines consumable verification and consumption.
- [Play subscription catalogs](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions)
  defines base plans and regional pricing.
- [TWA Play billing](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
  describes Digital Goods/Payment Request APIs and the Bubblewrap feature.

Offline fixture success is not store acceptance. T28 still needs configured
Stripe test flows, verified webhooks, Play internal-test purchases/notifications,
signing, Digital Asset Links and installed-device purchase/restore behavior.
Actual store-supported discounts, bridge dependency compatibility and publication
permissions must be confirmed before advertising capabilities.
