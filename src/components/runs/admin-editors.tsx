"use client";
import { DateLabel } from "@/components/localized-value";

import { AdminStateLabel as StateLabel } from "@/components/admin-state-label";

import { designStyleSchema } from "@/lib/design-styles";
import { project } from "@/lib/project";
import { adminFieldLabel } from "@/lib/admin-labels";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import type { settingsView } from "@/lib/server/settings";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { useLeaveGuard } from "@/components/leave-guard";
import type { SaveResult } from "@/lib/design-helpers";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Notice, SubmitButton } from "@/components/page-patterns";

type Json = z.infer<ReturnType<typeof z.json>>;
function errorMessage(e: unknown) {
  return e instanceof ApiError
    ? e.message
    : e instanceof Error
      ? e.message
      : "Could not confirm the request.";
}
const modes: Record<string, string[]> = {
  defaultStyle: designStyleSchema.options,
  failureCharging: ["success-only", "verified-usage"],
  mode: ["fixed", "tokens", "provider-cost", "hybrid"],
  basis: ["total", "split"],
};
const preset: Record<string, Json> = {
  fixed: { mode: "fixed", credits: 1 },
  tokens: {
    mode: "tokens",
    maxCredits: 10,
    rate: { basis: "total", creditsPerMillion: "1000" },
  },
  "provider-cost": {
    mode: "provider-cost",
    maxCredits: 10,
    currency: "USD",
    creditsPerCurrencyUnit: "100",
  },
  hybrid: {
    mode: "hybrid",
    maxCredits: 10,
    baseCredits: 1,
    usage: {
      mode: "tokens",
      rate: { basis: "total", creditsPerMillion: "1000" },
    },
  },
};
export function SettingsField({
  name,
  value,
  onChange,
  tokenPricingOnly = false,
}: {
  name: string;
  value: Json;
  tokenPricingOnly?: boolean;
  onChange: (value: Json) => void;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const label = adminFieldLabel(name);
  const projectControlsStyle = name === "defaultStyle" && project.theme;
  if (Array.isArray(value))
    return (
      <Field className="space-y-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          id={id}
          className="font-mono text-xs"
          defaultValue={JSON.stringify(value, null, 2)}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            // Validate as the administrator types so a bad list is visible before saving.
            try {
              const parsed: unknown = JSON.parse(e.target.value);
              if (!Array.isArray(parsed)) throw new Error("not a list");
              onChange(parsed as Json);
              e.target.setCustomValidity("");
              setInvalid(false);
            } catch {
              e.target.setCustomValidity("Enter a valid JSON list.");
              setInvalid(true);
            }
          }}
        />
        <p
          id={`${id}-help`}
          className={
            invalid
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {invalid
            ? "Enter a valid JSON list."
            : "Credit pack definitions: ID, label, credits, and optional payment product references."}
        </p>
      </Field>
    );
  if (value !== null && typeof value === "object")
    return (
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-2 font-semibold">{label}</legend>
        {Object.entries(value)
          .filter(
            ([key]) =>
              !(tokenPricingOnly && name === "usage" && key === "mode"),
          )
          .map(([key, entry]) => (
            <SettingsField
              key={`${key}-${key === "mode" ? String(entry) : ""}`}
              name={key}
              tokenPricingOnly={tokenPricingOnly}
              value={entry}
              onChange={(next) => {
                if (
                  key === "mode" &&
                  typeof next === "string" &&
                  name !== "usage"
                )
                  onChange(preset[next]);
                else if (key === "mode" && name === "usage")
                  onChange(
                    next === "tokens"
                      ? {
                          mode: "tokens",
                          rate: { basis: "total", creditsPerMillion: "1000" },
                        }
                      : {
                          mode: "provider-cost",
                          currency: "USD",
                          creditsPerCurrencyUnit: "100",
                        },
                  );
                else if (key === "basis")
                  onChange(
                    next === "total"
                      ? { basis: "total", creditsPerMillion: "1000" }
                      : {
                          basis: "split",
                          inputCreditsPerMillion: "1000",
                          outputCreditsPerMillion: "1000",
                        },
                  );
                else onChange({ ...value, [key]: next });
              }}
            />
          ))}
      </fieldset>
    );
  return (
    <div className="space-y-2">
      {typeof value === "boolean" ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={value}
            onCheckedChange={(v) => onChange(v === true)}
          />
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
        </div>
      ) : (
        <>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {modes[name] ? (
            <Select
              value={String(value)}
              onValueChange={onChange}
              disabled={projectControlsStyle}
            >
              <SelectTrigger
                id={id}
                aria-describedby={
                  projectControlsStyle ? `${id}-theme` : undefined
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modes[name]
                  .filter(
                    (mode) => !tokenPricingOnly || mode !== "provider-cost",
                  )
                  .map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      <StateLabel value={mode} />
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={id}
              type={typeof value === "number" ? "number" : "text"}
              value={String(value ?? "")}
              onChange={(e) =>
                onChange(
                  typeof value === "number"
                    ? Number(e.target.value)
                    : e.target.value,
                )
              }
            />
          )}
          {projectControlsStyle && (
            <p id={`${id}-theme`} className="text-sm text-muted-foreground">
              This project uses its own theme. Preset selection is disabled.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function BaseSettingsEditor({
  initial,
}: {
  initial: Awaited<ReturnType<typeof settingsView>>;
}) {
  const [settings, setSettings] = useState(initial.settings);
  const [baseline, setBaseline] = useState(initial.settings);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  async function save(): Promise<SaveResult> {
    if (busy || !formRef.current?.checkValidity()) return "failed";
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/admin/settings", z.unknown(), {
        method: "POST",
        body: { revision: initial.revision, reason, settings },
      });
      setMessage({ tone: "success", text: "Settings saved." });
      setBaseline(settings);
      setReason("");
      router.refresh();
      return "saved";
    } catch (e) {
      setMessage({ tone: "error", text: errorMessage(e) });
      return e instanceof ApiError && e.code !== "INVALID_RESPONSE"
        ? "failed"
        : "unknown";
    } finally {
      setBusy(false);
    }
  }
  useLeaveGuard({
    dirty:
      JSON.stringify(settings) !== JSON.stringify(baseline) || Boolean(reason),
    save,
  });

  return (
    <div className="space-y-5">
      <form
        ref={formRef}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <SettingsField
          name="settings"
          value={settings}
          onChange={(value) => setSettings(value as typeof settings)}
        />
        <FieldLabel htmlFor="settings-reason">
          Change reason (optional)
        </FieldLabel>
        <Input
          id="settings-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <SubmitButton pending={busy}>Save settings</SubmitButton>
      </form>
      {message && <Notice tone={message.tone} title={message.text} />}
      <Card>
        <CardHeader>
          <CardTitle>Configuration status</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {(
              [
                ["Dify", initial.configuration.difyMode],
                [
                  "Management",
                  initial.configuration.managementConfigured
                    ? "configured"
                    : "disabled",
                ],
                ["Storage", initial.configuration.storage],
                ["Payments", initial.configuration.payments],
              ] as const
            ).map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-muted-foreground">{term}</dt>
                <dd>
                  <StateLabel value={value} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            Credentials and connection settings are configured on the server.
          </p>
        </CardContent>
      </Card>
      <section>
        <h2 className="font-semibold">Revision history</h2>
        <p>Current revision: {initial.revision}</p>
        {initial.history.map((row) => (
          <p key={row.revision}>
            Revision {row.revision} · <DateLabel value={row.updatedAt} />
          </p>
        ))}
      </section>
    </div>
  );
}
