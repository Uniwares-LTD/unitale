"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/lib/client/api";
import { usePaymentContext } from "@/lib/client/payment-context";
import {
  purchaseOffersSchema,
  purchaseHistorySchema,
  playInstructionSchema,
  type PurchaseOffer,
} from "@/lib/contracts/purchase-client";
import {
  ownedPlayToken,
  subscriptionActionKey,
  playRequest,
  PLAY_METHOD,
  type DigitalGoods,
  type PlayInstruction,
  type PlayQuote,
} from "@/lib/client/play-billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type History = z.infer<typeof purchaseHistorySchema>;
const anyResult = z.record(z.string(), z.unknown());
async function goods(): Promise<DigitalGoods> {
  const browser = window as Window & {
    getDigitalGoodsService?: (method: string) => Promise<DigitalGoods>;
  };
  if (!browser.getDigitalGoodsService || !window.PaymentRequest)
    throw new Error("Play unavailable");
  return browser.getDigitalGoodsService(PLAY_METHOD);
}
export function CatalogPurchases() {
  const translate = useTranslations("ui");
  const format = useFormatter();
  const stateLabels = {
    pending: translate("mca000000001a"),
    active: translate("mca000000001b"),
    "past-due": translate("mca000000001c"),
    ended: translate("mca000000001d"),
    revoked: translate("mca000000001e"),
  };
  const context = usePaymentContext();
  const [catalog, setCatalog] = useState<z.infer<
    typeof purchaseOffersSchema
  > | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [selected, setSelected] = useState<PurchaseOffer | null>(null);
  const [prepared, setPrepared] = useState<PlayInstruction | null>(null);
  const [oldToken, setOldToken] = useState<string>();
  const [quote, setQuote] = useState<PlayQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const attempted = useRef(new Set<string>());
  const [awaitingRestore, setAwaitingRestore] = useState(false);
  const identities = useRef(new Map<string, string>());
  const identity = (target: string) => {
    let key = identities.current.get(target);
    if (!key) {
      key = crypto.randomUUID();
      identities.current.set(target, key);
    }
    return key;
  };
  const refresh = async (cursor?: string) =>
    setHistory(
      await api(
        "/api/payments/catalog" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        purchaseHistorySchema,
      ),
    );
  useEffect(() => {
    let current = true;
    Promise.all([
      api("/api/payments/offers", purchaseOffersSchema),
      api("/api/payments/catalog", purchaseHistorySchema),
    ])
      .then(([offers, purchases]) => {
        if (current) {
          setCatalog(offers);
          setHistory(purchases);
        }
      })
      .catch(() => {
        if (current) setMessage(translate("mca000000000b"));
      });
    return () => {
      current = false;
    };
  }, [translate]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch {
      setMessage(translate("mca000000000b"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const start = async (offer: PurchaseOffer, checkoutId?: string) => {
    if (
      context === "checking" ||
      (context === "play") !== (offer.terms.channel === "google-play")
    )
      throw new Error("Wrong channel");
    if (context === "play") await goods();
    const result = await api("/api/payments/catalog", anyResult, {
      method: "POST",
      body: checkoutId
        ? {
            action: "change",
            checkoutId,
            key: await subscriptionActionKey(checkoutId, "plan-change", {
              id: offer.id,
              revision: offer.revision,
            }),
            kind: "plan-change",
            nextOffer: { id: offer.id, revision: offer.revision },
          }
        : {
            action: "start",
            checkoutId: identity(`start:${offer.id}:${offer.revision}`),
            offerId: offer.id,
            offerRevision: offer.revision,
          },
    });
    if (context === "play") {
      const instruction = playInstructionSchema.parse(result);
      const token = instruction.oldProductId
        ? await ownedPlayToken(await goods(), instruction.oldProductId)
        : undefined;
      setAwaitingRestore(attempted.current.has(instruction.checkoutId));
      setPrepared(instruction);
      setOldToken(token);
      setQuote(null);
    } else if (result.url) {
      const url = new URL(z.string().parse(result.url));
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("Invalid checkout URL");
      location.assign(url.href);
    } else {
      await refresh();
      setMessage(translate("mca000000000c"));
    }
  };
  const storeRequest = (operation: "quote" | "purchase") => {
    if (!prepared || context !== "play") return;
    void run(async () => {
      if (operation === "purchase") {
        if (attempted.current.has(prepared.checkoutId))
          throw new Error("Restore the existing purchase first");
        attempted.current.add(prepared.checkoutId);
        setAwaitingRestore(true);
      }
      const result = await playRequest(
        prepared,
        operation,
        (methods, details) => new PaymentRequest(methods, details),
        quote ?? undefined,
        oldToken,
      );
      if (result.kind === "quote") {
        setQuote(result);
        return;
      }
      await api("/api/payments/catalog", anyResult, {
        method: "POST",
        body: {
          action: "restore",
          checkoutId: prepared.checkoutId,
          providerId: result.purchaseToken,
        },
      });
      for (const [key, value] of identities.current)
        if (value === prepared.checkoutId) identities.current.delete(key);
      setPrepared(null);
      setQuote(null);
      await refresh();
      setMessage(translate("mca000000000c"));
    });
  };
  if (context === "checking")
    return <p role="status">{translate("mca000000000d")}</p>;
  const offers =
    catalog?.offers.filter(
      (o) =>
        o.terms.channel === (context === "play" ? "google-play" : "stripe"),
    ) ?? [];
  return (
    <section className="space-y-4" aria-busy={busy}>
      <h2 className="text-xl font-semibold">{translate("mca0000000001")}</h2>
      <p role="status">{message}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {offers.map((offer) => (
          <Card key={offer.id}>
            <CardHeader>
              <CardTitle>{offer.terms.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>
                {translate("mca0000000010", { credits: offer.terms.credits })}
              </p>
              <p>
                {offer.terms.billing.kind === "subscription"
                  ? translate("mca0000000011")
                  : translate("mca0000000012")}
              </p>
              {context === "web" && (
                <p>
                  {format.number(
                    offer.terms.price.amountMinor /
                      10 **
                        (new Intl.NumberFormat("en", {
                          style: "currency",
                          currency: offer.terms.price.currency,
                        }).resolvedOptions().maximumFractionDigits ?? 2),
                    { style: "currency", currency: offer.terms.price.currency },
                  )}
                </p>
              )}
              <Button
                disabled={busy || !!prepared}
                onClick={() => void run(() => start(offer))}
              >
                {translate("mca0000000002")}
              </Button>
              {offer.terms.billing.kind === "subscription" && (
                <Button
                  className="ms-2"
                  variant={selected?.id === offer.id ? "default" : "outline"}
                  disabled={busy || !!prepared}
                  onClick={() => setSelected(offer)}
                >
                  {translate("mca0000000008")}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {catalog && offers.length === 0 && <p>{translate("mca000000000a")}</p>}
      {context === "play" && !catalog?.playPackage && (
        <p>{translate("mca000000000e")}</p>
      )}
      {catalog?.next && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setCatalog(
                await api(
                  "/api/payments/offers?after=" +
                    encodeURIComponent(catalog.next!),
                  purchaseOffersSchema,
                ),
              ),
            )
          }
        >
          {translate("mca000000000f")}
        </Button>
      )}
      {prepared && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p>{translate("mca0000000015")}</p>
            {quote && (
              <>
                <h3>{quote.title}</h3>
                {quote.phases.map((phase, index) => (
                  <p key={index}>
                    {phase.formattedPrice}
                    {phase.period && (
                      <>
                        {" "}
                        ?{" "}
                        {translate("mca0000000016", {
                          period: phase.period,
                          cycles: phase.cycles,
                        })}
                      </>
                    )}
                  </p>
                ))}
              </>
            )}
            <Button disabled={busy} onClick={() => storeRequest("quote")}>
              {translate("mca0000000003")}
            </Button>
            {quote && (
              <Button
                className="ms-2"
                disabled={busy || awaitingRestore}
                onClick={() => storeRequest("purchase")}
              >
                {translate("mca0000000004")}
              </Button>
            )}
            <Button
              className="ms-2"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                setQuote(null);
              }}
            >
              {translate("mca0000000017")}
            </Button>
          </CardContent>
        </Card>
      )}
      <h2 className="text-xl font-semibold">{translate("mca0000000009")}</h2>
      <p className="text-sm text-muted-foreground">
        {translate("mca0000000018")}
      </p>
      <p className="text-sm text-muted-foreground">
        {translate("mca0000000019")}
      </p>
      {selected && (
        <p>
          {selected.terms.label}: {translate("mca0000000013")}
        </p>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void run(() => refresh())}
      >
        {translate("mca0000000014")}
      </Button>
      {history?.purchases.map((purchase) => (
        <Card key={purchase.checkoutId}>
          <CardContent className="space-y-3 pt-6">
            <p>
              {purchase.terms.label} ? <bdi>{stateLabels[purchase.state]}</bdi>
            </p>
            <p className="break-all text-xs">
              <bdi>{purchase.checkoutId}</bdi>
            </p>
            {purchase.periodEnd && (
              <p>{format.dateTime(new Date(purchase.periodEnd))}</p>
            )}
            {context === "play" && purchase.terms.channel === "google-play" && (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const token = await ownedPlayToken(
                      await goods(),
                      purchase.nextTerms?.provider.productId ??
                        purchase.terms.provider.productId,
                      purchase.terms.provider.productId,
                    );
                    await api("/api/payments/catalog", anyResult, {
                      method: "POST",
                      body: {
                        action: "restore",
                        checkoutId: purchase.checkoutId,
                        providerId: token,
                      },
                    });
                    await refresh();
                    setMessage(translate("mca000000000c"));
                  })
                }
              >
                {translate("mca0000000005")}
              </Button>
            )}
            {purchase.terms.billing.kind === "subscription" && (
              <div className="flex flex-wrap gap-2">
                {purchase.terms.channel === "google-play" &&
                  catalog?.playPackage && (
                    <Button asChild variant="outline">
                      <a
                        href={`https://play.google.com/store/account/subscriptions?${new URLSearchParams({ sku: purchase.terms.provider.productId, package: catalog.playPackage })}`}
                      >
                        {translate("mca0000000006")}
                      </a>
                    </Button>
                  )}
                {purchase.state === "active" && !purchase.cancelAtPeriodEnd && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api("/api/payments/catalog", anyResult, {
                          method: "POST",
                          body: {
                            action: "change",
                            checkoutId: purchase.checkoutId,
                            key: await subscriptionActionKey(
                              purchase.checkoutId,
                              "cancel",
                            ),
                            kind: "cancel",
                          },
                        });
                        await refresh();
                      })
                    }
                  >
                    {translate("mca0000000007")}
                  </Button>
                )}
                {selected &&
                  purchase.state === "active" &&
                  selected.terms.channel === purchase.terms.channel && (
                    <Button
                      disabled={busy || !!prepared}
                      onClick={() =>
                        void run(() => start(selected, purchase.checkoutId))
                      }
                    >
                      {translate("mca0000000008")}
                    </Button>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {history?.cursor && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => refresh(history.cursor!))}
        >
          {translate("mca000000000f")}
        </Button>
      )}
    </section>
  );
}
