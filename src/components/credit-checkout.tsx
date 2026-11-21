"use client";
import { useFormatter, useTranslations } from "next-intl";

import { Notice, SubmitButton } from "./page-patterns";
import { useActionState, useState } from "react";
import { usePaymentContext } from "@/lib/client/payment-context";
import { checkoutCredits } from "@/app/credits/checkout-action";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function CreditCheckout({
  uid,
  packs,
  initialKey,
}: {
  uid: string;
  initialKey: string;
  packs: {
    id: string;
    label: string;
    credits: number;
    amountMinor?: number;
    currency?: string;
  }[];
}) {
  const translate = useTranslations("ui");
  const format = useFormatter();
  const price = (amountMinor?: number, currency?: string) => {
    if (!amountMinor || !currency) return null;
    const code = currency.toUpperCase();
    // Stripe amounts use the currency's minor unit (e.g. cents, or none for JPY).
    const digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    return format.number(amountMinor / 10 ** digits, {
      style: "currency",
      currency: code,
    });
  };

  const [state, action, pending] = useActionState(
    checkoutCredits.bind(null, uid),
    { message: "" },
  );
  const [submittedPack, setSubmittedPack] = useState<string>();
  const context = usePaymentContext();
  if (context === "play") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate("mfd70f8c19e46")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {translate("m5a12455b2151")}
        </p>
        <form
          action={action}
          className="flex flex-wrap gap-3"
          onSubmit={(event) => {
            const submitter = event.nativeEvent.submitter;
            setSubmittedPack(
              submitter instanceof HTMLButtonElement
                ? submitter.value
                : undefined,
            );
          }}
        >
          <input type="hidden" name="key" value={initialKey} />
          {packs.map((pack) => {
            const amount = price(pack.amountMinor, pack.currency);
            return (
              <SubmitButton
                key={pack.id}
                pending={pending && submittedPack === pack.id}
                name="packId"
                value={pack.id}
                disabled={pending || context !== "web"}
              >
                {amount
                  ? translate("ma351e232280b", {
                      label: pack.label,
                      credits: pack.credits,
                      price: amount,
                    })
                  : translate("meaf8dfc7740c", {
                      label: pack.label,
                      credits: pack.credits,
                    })}
              </SubmitButton>
            );
          })}
        </form>
        <p role="status" className="text-sm text-muted-foreground">
          {context === "checking"
            ? translate("m00b134e2a81b")
            : translate("m75fada4bbaf4")}
        </p>
        {state.message && <Notice tone={"error"} title={state.message} />}
      </CardContent>
    </Card>
  );
}
