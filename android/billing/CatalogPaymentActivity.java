package com.google.androidbrowserhelper.playbilling.provider;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.android.billingclient.api.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Objects;

/** Payment Request bridge. Provider verification and acknowledgement remain server-side. */
public final class CatalogPaymentActivity extends Activity {
    private static final String METHOD = "https://play.google.com/billing";
    private BillingClient billing;
    private JSONObject request;
    private boolean finished;
    private boolean launched;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> fail();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Never replay a purchase when Android recreates an interrupted activity.
        if (state != null || getCallingActivity() == null || !PaymentVerifier.shouldAllowPayments(
                this, getCallingActivity().getPackageName(), "CatalogPayment")) { fail(); return; }
        try {
            Bundle methods = getIntent().getBundleExtra("methodData");
            if (methods == null) throw new IllegalArgumentException();
            String raw = methods.getString(METHOD);
            if (raw == null || raw.length() > 16384) throw new IllegalArgumentException();
            request = new JSONObject(raw);
            if (request.getInt("bridgeVersion") != 1 || !request.getString("sku").matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")) throw new IllegalArgumentException();
            if (!request.getString("operation").equals("quote") && !request.getString("operation").equals("purchase")) throw new IllegalArgumentException();
            if (!request.getString("productType").equals("subs") && !request.getString("productType").equals("inapp")) throw new IllegalArgumentException();
            if (request.getString("operation").equals("purchase") && !request.getString("accountBinding").matches("[a-f0-9]{64}")) throw new IllegalArgumentException();
            billing = BillingClient.newBuilder(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .setListener((result, purchases) -> {
                    if (!launched || result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.size() != 1) { fail(); return; }
                    try {
                        Purchase purchase = purchases.get(0);
                        if (!purchase.getProducts().contains(request.getString("sku"))) throw new IllegalArgumentException();
                        respond(new JSONObject().put("bridgeVersion", 1).put("kind", "purchase").put("purchaseToken", purchase.getPurchaseToken()));
                    } catch (Exception error) { fail(); }
                }).build();
            timer.postDelayed(timeout, 120000);
            billing.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { fail(); return; }
                    query();
                }
                @Override public void onBillingServiceDisconnected() { fail(); }
            });
        } catch (Exception error) { fail(); }
    }
    private void query() {
        try {
            QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(request.getString("sku")).setProductType(request.getString("productType")).build();
            billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build(), (result, response) -> {
                if (finished) return;
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || response.getProductDetailsList().size() != 1) { fail(); return; }
                try { selected(response.getProductDetailsList().get(0)); } catch (Exception error) { fail(); }
            });
        } catch (Exception error) { fail(); }
    }
    private void selected(ProductDetails details) throws Exception {
        String plan = request.getString("priceId");
        String offer = request.isNull("offerId") ? null : request.getString("offerId");
        String token = null;
        JSONArray phases = new JSONArray();
        int matches = 0;
        if (details.getProductType().equals(BillingClient.ProductType.SUBS)) {
            if (details.getSubscriptionOfferDetails() != null) for (ProductDetails.SubscriptionOfferDetails item : details.getSubscriptionOfferDetails()) {
                if (!plan.equals(item.getBasePlanId()) || !Objects.equals(offer, item.getOfferId())) continue;
                matches++; token = item.getOfferToken();
                for (ProductDetails.PricingPhase phase : item.getPricingPhases().getPricingPhaseList()) phases.put(new JSONObject()
                    .put("formattedPrice", phase.getFormattedPrice()).put("currency", phase.getPriceCurrencyCode())
                    .put("micros", Long.toString(phase.getPriceAmountMicros())).put("period", phase.getBillingPeriod())
                    .put("cycles", phase.getBillingCycleCount()).put("recurrence", phase.getRecurrenceMode()));
            }
        } else if (details.getOneTimePurchaseOfferDetailsList() != null) {
            for (ProductDetails.OneTimePurchaseOfferDetails item : details.getOneTimePurchaseOfferDetailsList()) {
                if (!plan.equals(item.getPurchaseOptionId()) || !Objects.equals(offer, item.getOfferId())) continue;
                if (item.getRentalDetails() != null || item.getPreorderDetails() != null) continue;
                matches++; token = item.getOfferToken();
                phases.put(new JSONObject().put("formattedPrice", item.getFormattedPrice()).put("currency", item.getPriceCurrencyCode())
                    .put("micros", Long.toString(item.getPriceAmountMicros())).put("period", "").put("cycles", 1).put("recurrence", 3));
            }
        }
        if (matches != 1 || token == null || phases.length() == 0) throw new IllegalArgumentException();
        JSONObject quote = new JSONObject().put("bridgeVersion", 1).put("kind", "quote")
            .put("sku", details.getProductId()).put("priceId", plan).put("offerId", offer == null ? JSONObject.NULL : offer)
            .put("title", details.getTitle()).put("phases", phases);
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(quote.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder hash = new StringBuilder();
        for (byte value : digest) hash.append(String.format("%02x", value & 255));
        quote.put("quoteId", hash.toString());
        if (request.getString("operation").equals("quote")) { respond(quote); return; }
        if (!hash.toString().equals(request.getString("quoteId"))) throw new IllegalArgumentException();
        BillingFlowParams.Builder flow = BillingFlowParams.newBuilder()
            .setObfuscatedAccountId(request.getString("accountBinding"))
            .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).setOfferToken(token).build()));
        if (request.has("oldPurchaseToken")) {
            if (!details.getProductType().equals(BillingClient.ProductType.SUBS) || !request.getString("replacementMode").equals("DEFERRED")) throw new IllegalArgumentException();
            String old = request.getString("oldPurchaseToken");
            if (old.isEmpty() || old.length() > 4096) throw new IllegalArgumentException();
            flow.setSubscriptionUpdateParams(BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                .setOldPurchaseToken(old).setSubscriptionReplacementMode(BillingFlowParams.SubscriptionUpdateParams.ReplacementMode.DEFERRED).build());
        }
        launched = true;
        if (billing.launchBillingFlow(this, flow.build()).getResponseCode() != BillingClient.BillingResponseCode.OK) fail();
    }
    private void respond(JSONObject value) {
        if (finished) return;
        finished = true;
        setResult(RESULT_OK, new Intent().putExtra("methodName", METHOD).putExtra("details", value.toString()));
        finish();
    }
    private void fail() {
        if (finished) return;
        finished = true;
        setResult(RESULT_CANCELED);
        finish();
    }
    @Override public void onDestroy() {
        timer.removeCallbacks(timeout);
        if (billing != null) billing.endConnection();
        super.onDestroy();
    }
}
