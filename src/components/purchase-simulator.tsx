"use client";
import { useTranslations } from "next-intl";

import { Notice, SubmitButton } from "./page-patterns";
import { DateLabel, StateLabel } from "./localized-value";
import { useActionState, useId, useState } from "react";
import { applySimulation, startSimulation } from "@/app/credits/actions";
import type { PublicOrder, PublicPack } from "@/lib/contracts/credits";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { FieldLabel, FieldLegend, FieldSet } from "./ui/field";

function Order({ order, uid }: { order: PublicOrder; uid: string }) {
  const translate = useTranslations("ui");

  const [state, action, pending] = useActionState(
    applySimulation.bind(null, uid, order.id),
    { message: "", saved: false },
  );
  const options =
    order.status === "pending"
      ? [
          ["success", translate("mc88a0b907419")],
          ["pending", translate("mf1b702d2fadd")],
          ["failure", translate("m09230b3dbc35")],
          ["cancel", translate("m19766ed6ccb2")],
        ]
      : order.status === "paid"
        ? [
            ["refund", translate("me20747accf61")],
            ["replay", translate("m9d8dd935b5ea")],
          ]
        : order.status === "refunded"
          ? [["replay", translate("m9d8dd935b5ea")]]
          : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {order.label} · <StateLabel value={order.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="break-all text-xs text-muted-foreground">
          {translate("m45314e97b0c2")} <bdi>{order.id.slice(0, 12)}</bdi> ·{" "}
          <DateLabel value={order.createdAt} />
        </p>
        <form action={action} className="flex flex-wrap gap-2">
          {options.map(([event, label]) => (
            <SubmitButton
              key={event}
              name="event"
              value={event}
              pending={pending}
              variant="outline"
            >
              {label}
            </SubmitButton>
          ))}
        </form>
        {state.message && (
          <Notice
            tone={state.saved ? "success" : "error"}
            title={state.message}
          />
        )}
      </CardContent>
    </Card>
  );
}
export function PurchaseSimulator({
  packs,
  orders,
  uid,
  initialKey,
}: {
  packs: PublicPack[];
  orders: PublicOrder[];
  uid: string;
  initialKey: string;
}) {
  const translate = useTranslations("ui");

  const id = useId();
  const [key, setKey] = useState(initialKey);
  const [state, action, pending] = useActionState(
    async (previous: { message: string; saved: boolean }, form: FormData) => {
      const result = await startSimulation(uid, previous, form);
      if (result.saved) setKey(crypto.randomUUID());
      return result;
    },
    { message: "", saved: false },
  );
  return (
    <section className="space-y-4" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {translate("m061fcef1b9a2")}
      </h2>
      <Notice title={translate("m14228c03b90c")}>
        {translate("m7736681e7fd8")}
      </Notice>
      <Card>
        <CardContent className="py-6">
          <form action={action} className="space-y-4">
            <input type="hidden" name="key" value={key} />
            <FieldSet className="space-y-2">
              <FieldLegend className="text-sm font-medium">
                {translate("me15ea8da07f3")}
              </FieldLegend>
              <RadioGroup
                name="packId"
                defaultValue={packs[0]?.id}
                disabled={pending}
              >
                {packs.map((pack) => (
                  <div key={pack.id} className="flex items-center gap-2">
                    <RadioGroupItem value={pack.id} id={`${id}-${pack.id}`} />
                    <FieldLabel htmlFor={`${id}-${pack.id}`}>
                      {pack.label}
                    </FieldLabel>
                  </div>
                ))}
              </RadioGroup>
            </FieldSet>
            <SubmitButton pending={pending}>
              {pending
                ? translate("mc79ed9492e3c")
                : translate("m89c54d05fbee")}
            </SubmitButton>
            {state.message && (
              <Notice
                tone={state.saved ? "success" : "error"}
                title={state.message}
              />
            )}
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        {translate("mce1133187be7")}
      </p>
      <div className="space-y-4">
        {orders.map((order) => (
          <Order key={order.id} order={order} uid={uid} />
        ))}
      </div>
    </section>
  );
}
