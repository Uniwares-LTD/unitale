"use client";

import { formatAdminNumber } from "@/lib/admin-labels";
import { Notice, SubmitButton } from "./page-patterns";
import { useActionState, useId, useRef, useState } from "react";
import { adjustUserCredits } from "@/app/admin/users/credit-actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";

export function AdminCreditControls({
  uid,
  actorUid,
  initialKey,
}: {
  uid: string;
  actorUid: string;
  initialKey: string;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [key, setKey] = useState(initialKey);
  const [expiry, setExpiry] = useState("default");
  const [direction, setDirection] = useState("grant");
  const [summary, setSummary] = useState("");
  const [state, action, pending] = useActionState(
    async (previous: { message: string; saved: boolean }, form: FormData) => {
      const result = await adjustUserCredits(actorUid, uid, previous, form);
      if (result.saved) setKey(crypto.randomUUID());
      return result;
    },
    { message: "", saved: false },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit adjustment</CardTitle>
      </CardHeader>
      <CardContent>
        <form id={id} ref={formRef} action={action} className="space-y-5">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="confirmed" value="yes" />
          <FieldSet className="space-y-2">
            <FieldLegend className="text-sm font-medium">
              Adjustment
            </FieldLegend>
            <RadioGroup
              name="direction"
              value={direction}
              onValueChange={setDirection}
              disabled={pending}
            >
              {[
                ["grant", "Grant promotional credits"],
                ["deduct", "Deduct available credits"],
              ].map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`${id}-${value}`} />
                  <FieldLabel htmlFor={`${id}-${value}`}>{label}</FieldLabel>
                </div>
              ))}
            </RadioGroup>
          </FieldSet>
          <Field className="space-y-2">
            <FieldLabel htmlFor={`${id}-amount`}>Credit amount</FieldLabel>
            <Input
              type="number"
              id={`${id}-amount`}
              name="amount"
              min={1}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
              required
              disabled={pending}
            />
          </Field>
          <FieldSet className="space-y-2">
            <FieldLegend className="text-sm font-medium">
              Grant expiry
            </FieldLegend>
            <RadioGroup
              name="expiry"
              value={expiry}
              onValueChange={setExpiry}
              disabled={pending || direction !== "grant"}
            >
              {[
                ["default", "Default: 90 days"],
                ["perpetual", "No expiry"],
                ["custom", "Specific date (UTC)"],
              ].map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`${id}-${value}`} />
                  <FieldLabel htmlFor={`${id}-${value}`}>{label}</FieldLabel>
                </div>
              ))}
            </RadioGroup>
          </FieldSet>
          {direction === "grant" && expiry === "custom" && (
            <Field className="space-y-2">
              <FieldLabel htmlFor={`${id}-expires`}>
                Expiry date and time (UTC)
              </FieldLabel>
              <Input
                type="datetime-local"
                id={`${id}-expires`}
                name="expiresAt"
                required
                disabled={pending}
              />
            </Field>
          )}
          <Field className="space-y-2">
            <FieldLabel htmlFor={`${id}-reason`}>
              Credit adjustment reason (optional)
            </FieldLabel>
            <Input
              id={`${id}-reason`}
              name="reason"
              maxLength={300}
              disabled={pending}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Recorded in the ledger and admin audit; visible to the account
              owner. Do not enter secrets.
            </p>
          </Field>
          <p className="text-sm text-muted-foreground">
            Deductions cannot consume held credits or create debt. Grants cover
            existing debt first.
          </p>
          <AlertDialog
            onOpenChange={(open) => {
              if (!open || !formRef.current) return;
              // Echo the submitted values so the confirmation names the exact change.
              const data = new FormData(formRef.current);
              const amount = Number(data.get("amount") || 0);
              setSummary(
                direction === "deduct"
                  ? "Deduct " +
                      (amount === 1
                        ? formatAdminNumber(amount) + " credit"
                        : formatAdminNumber(amount) + " credits") +
                      " from this account."
                  : expiry === "perpetual"
                    ? "Grant " +
                      (amount === 1
                        ? formatAdminNumber(amount) + " promotional credit"
                        : formatAdminNumber(amount) + " promotional credits") +
                      " with no expiry."
                    : expiry === "custom"
                      ? "Grant " +
                        (amount === 1
                          ? formatAdminNumber(amount) + " promotional credit"
                          : formatAdminNumber(amount) +
                            " promotional credits") +
                        " expiring " +
                        `${String(data.get("expiresAt") ?? "").replace("T", " ")} UTC` +
                        "."
                      : "Grant " +
                        (amount === 1
                          ? formatAdminNumber(amount) + " promotional credit"
                          : formatAdminNumber(amount) +
                            " promotional credits") +
                        " expiring in 90 days.",
              );
            }}
          >
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={pending}>
                {pending ? "Saving…" : "Review credit adjustment"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm credit adjustment</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-medium text-foreground">
                    {summary}
                  </span>
                  This immediately changes this account’s credits and records
                  your reason. Check the amount, direction and grant expiry
                  before confirming.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild type="submit">
                  <SubmitButton
                    pending={pending}
                    form={id}
                    variant={direction === "deduct" ? "destructive" : "default"}
                    onClick={(event) => {
                      if (!formRef.current?.reportValidity())
                        event.preventDefault();
                    }}
                  >
                    Confirm adjustment
                  </SubmitButton>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {state.message && (
            <Notice
              tone={state.saved ? "success" : "error"}
              title={state.message}
            />
          )}
        </form>
      </CardContent>
    </Card>
  );
}
