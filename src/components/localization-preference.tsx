"use client";
import { useLocale, useTranslations, useTimeZone } from "next-intl";
import { useMemo, useState } from "react";
import { localeCookie } from "@/lib/locale";
import { project } from "@/lib/project";
import { api } from "@/lib/client/api";
import { profileSchema } from "@/lib/contracts/profile";
import { Notice } from "./page-patterns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Field, FieldLabel } from "./ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

// Each language is named in itself so it stays recognisable whatever is active.
const languageName = (value: string) =>
  new Intl.DisplayNames([value], { type: "language" }).of(value) ?? value;

export function LocalizationPreference({ canSave }: { canSave: boolean }) {
  const locale = useLocale(),
    t = useTranslations("locale"),
    zone = useTimeZone() ?? "UTC";
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return [...new Set(["UTC", zone, ...all])];
  }, [zone]);
  // Signed-in choices are saved to the profile first; the cookie then applies them here.
  function apply(next: { locale: string; timeZone: string }) {
    const commit = () => {
      document.cookie = `${localeCookie}=${next.locale}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === "https:" ? "; Secure" : ""}`;
      location.reload();
    };
    if (!canSave) return commit();
    setBusy(true);
    setFailed(false);
    void api("/api/profile/localization", profileSchema, {
      method: "PATCH",
      body: next,
    })
      .then(commit)
      .catch(() => {
        setFailed(true);
        setBusy(false);
      });
  }
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription>
          {canSave ? t("account") : t("browser")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="locale-choice">{t("language")}</FieldLabel>
          <Select
            value={locale}
            disabled={busy}
            onValueChange={(value) => apply({ locale: value, timeZone: zone })}
          >
            <SelectTrigger id="locale-choice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {project.locales.map((value) => (
                <SelectItem key={value} value={value} lang={value}>
                  {languageName(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {canSave ? (
          <Field>
            <FieldLabel htmlFor="time-zone">{t("timeZone")}</FieldLabel>
            <Select
              value={zone}
              disabled={busy}
              onValueChange={(value) => apply({ locale, timeZone: value })}
            >
              <SelectTrigger id="time-zone" dir="ltr">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="ltr" className="max-h-80">
                {zones.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted-foreground">{t("signIn")}</p>
        )}
        {failed && <Notice tone="error" title={t("failed")} />}
      </CardContent>
    </Card>
  );
}
