"use client";
import { AdminStateLabel as StateLabel } from "./admin-state-label";
import { adminStateLabel } from "@/lib/admin-labels";

import { Notice, SubmitButton } from "./page-patterns";
import { useActionState, useId, useRef, useState } from "react";
import { changeUser } from "@/app/admin/users/actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
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

type ManagedUser = {
  uid: string;
  displayName: string;
  role: "admin" | "member";
  status: "active" | "suspended";
};
function ChangeForm({
  kind,
  user,
  actorUid,
}: {
  kind: "access" | "profile";
  user: ManagedUser;
  actorUid: string;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [change, setChange] = useState({ summary: "", risky: false });
  const [state, action, pending] = useActionState(
    changeUser.bind(null, kind, actorUid, user.uid),
    { message: "", saved: false },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {kind === "access" ? "Role and access" : "Application profile"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form id={id} ref={form} action={action} className="space-y-5">
          <input type="hidden" name="confirmed" value="yes" />
          {kind === "profile" ? (
            <Field className="space-y-2">
              <FieldLabel htmlFor={`${id}-name`}>Display name</FieldLabel>
              <Input
                id={`${id}-name`}
                name="displayName"
                defaultValue={user.displayName}
                required
                minLength={1}
                maxLength={80}
                disabled={pending}
              />
            </Field>
          ) : (
            <>
              {(
                [
                  { name: "role", options: ["member", "admin"] },
                  { name: "status", options: ["active", "suspended"] },
                ] as const
              ).map((group) => (
                <FieldSet key={group.name} className="space-y-2">
                  <FieldLegend className="text-sm font-medium">
                    <StateLabel value={group.name} />
                  </FieldLegend>
                  <RadioGroup
                    name={group.name}
                    defaultValue={user[group.name]}
                    disabled={pending}
                  >
                    {group.options.map((option) => (
                      <div key={option} className="flex items-center gap-2">
                        <RadioGroupItem id={`${id}-${option}`} value={option} />
                        <FieldLabel htmlFor={`${id}-${option}`}>
                          <StateLabel value={option} />
                        </FieldLabel>
                      </div>
                    ))}
                  </RadioGroup>
                </FieldSet>
              ))}
            </>
          )}
          <Field className="space-y-2">
            <FieldLabel htmlFor={`${id}-reason`}>Reason (optional)</FieldLabel>
            <Input
              id={`${id}-reason`}
              name="reason"
              maxLength={300}
              disabled={pending}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Recorded in the administrator audit history. Do not enter
              passwords or other secrets.
            </p>
          </Field>
          <AlertDialog
            onOpenChange={(open) => {
              if (!open || !form.current) return;
              // Name the exact before/after values in the confirmation.
              const data = new FormData(form.current);
              if (kind === "profile") {
                setChange({
                  summary:
                    "Display name changes from “" +
                    user.displayName +
                    "” to “" +
                    String(data.get("displayName") ?? "") +
                    "”.",
                  risky: false,
                });
                return;
              }
              const role = String(data.get("role") ?? user.role);
              const status = String(data.get("status") ?? user.status);
              setChange({
                summary:
                  "Role changes from " +
                  adminStateLabel(user.role) +
                  " to " +
                  adminStateLabel(role as ManagedUser["role"]) +
                  "; status from " +
                  adminStateLabel(user.status) +
                  " to " +
                  adminStateLabel(status as ManagedUser["status"]) +
                  ".",
                risky:
                  (user.role === "admin" && role === "member") ||
                  (user.status === "active" && status === "suspended"),
              });
            }}
          >
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={pending}>
                {pending ? "Saving…" : "Review change"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm account change</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-medium text-foreground">
                    {change.summary}
                  </span>
                  {kind === "access"
                    ? "Access changes take effect immediately. Reactivation requires a new sign-in."
                    : "This changes the application display name."}{" "}
                  The change and your reason will be audited.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild type="submit">
                  <SubmitButton
                    pending={pending}
                    form={id}
                    variant={change.risky ? "destructive" : "default"}
                    onClick={(event) => {
                      if (!form.current?.reportValidity())
                        event.preventDefault();
                    }}
                  >
                    Confirm change
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
export function AdminUserControls({
  user,
  actorUid,
}: {
  user: ManagedUser;
  actorUid: string;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        You cannot remove your own administrator access.
      </p>
      <ChangeForm kind="access" user={user} actorUid={actorUid} />
      <ChangeForm kind="profile" user={user} actorUid={actorUid} />
    </div>
  );
}
