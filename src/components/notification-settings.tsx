"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";
import { api } from "@/lib/client/api";
import { notificationPreferencesSchema } from "@/lib/contracts/notifications";
import { Notice } from "./page-patterns";
import { Checkbox } from "./ui/checkbox";
import { FieldLabel } from "./ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

type Preferences = z.infer<typeof notificationPreferencesSchema>;

export function NotificationSettings({ initial }: { initial: Preferences }) {
  const translate = useTranslations("ui");
  const [preferences, setPreferences] = useState(initial),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<"" | "saved" | "failed">("");
  const labels = {
    runs: translate("m848f54e89660"),
    credits: translate("m2a6b24ad2872"),
    account: translate("m7738853a0f09"),
  };
  async function save(next: Preferences) {
    setBusy(true);
    setResult("");
    try {
      setPreferences(
        await api(
          "/api/notifications/preferences",
          notificationPreferencesSchema,
          { method: "PATCH", body: next },
        ),
      );
      setResult("saved");
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card id="notifications" className="shadow-none">
      <CardHeader>
        <CardTitle>{translate("m868cb91d007c")}</CardTitle>
        <CardDescription>{translate("ma4c98ae6d949")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="sr-only">{translate("m19a58710832b")}</legend>
          {(["runs", "credits", "account"] as const).map((category) => (
            <div key={category} className="flex items-center gap-3">
              <Checkbox
                id={`notifications-${category}`}
                checked={preferences[category]}
                disabled={busy}
                onCheckedChange={(value) =>
                  void save({ ...preferences, [category]: value === true })
                }
              />
              <FieldLabel htmlFor={`notifications-${category}`}>
                {labels[category]}
              </FieldLabel>
            </div>
          ))}
        </fieldset>
        {result === "saved" && (
          <Notice tone="success" title={translate("m33f6f7953fde")} />
        )}
        {result === "failed" && (
          <Notice tone="error" title={translate("me6c5c7ec5c6b")} />
        )}
      </CardContent>
    </Card>
  );
}
