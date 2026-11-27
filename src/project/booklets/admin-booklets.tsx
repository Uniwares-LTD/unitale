"use client";

// Administration copy is English/LTR by design (no locale catalogs).
import { useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import type { bookletAdminView } from "@/lib/server/booklets/admin";
import type { SaveResult } from "@/lib/design-helpers";
import { useLeaveGuard } from "@/components/leave-guard";
import { Notice, SubmitButton, EmptyState } from "@/components/page-patterns";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { bookletIdSchema } from "./contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type View = Awaited<ReturnType<typeof bookletAdminView>>;
type Policy = View["policies"][number];
type Defaults = NonNullable<Policy["retryDefaults"]>;
const fields: { key: keyof Defaults; label: string; help: string }[] = [
  {
    key: "paidLlm",
    label: "Paid LLM actions",
    help: "Extra automatic attempts after a retriable paid text failure.",
  },
  {
    key: "paidImage",
    label: "Paid image actions",
    help: "Extra automatic attempts after a retriable paid image failure.",
  },
  {
    key: "nonPaid",
    label: "Retriable non-paid actions",
    help: "Extra automatic attempts for retriable unpaid steps.",
  },
];
const saved = z.object({
  policyId: z.string(),
  retryDefaults: z.object({
    paidLlm: z.number(),
    paidImage: z.number(),
    nonPaid: z.number(),
  }),
  retryDefaultsVersion: z.string(),
});

const savedDefault = z.object({ catalogId: z.string(), version: z.string() });

function DefaultPackageCard({ initial }: { initial: View["defaultPackage"] }) {
  const [current, setCurrent] = useState(initial);
  const [catalogId, setCatalogId] = useState(initial.catalogId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = catalogId.trim() !== (current.catalogId ?? "");
  const fieldId = "default-booklet-catalog";

  async function save(): Promise<SaveResult> {
    if (pending) return "unknown";
    const selected = bookletIdSchema.safeParse(catalogId.trim());
    if (!selected.success) {
      setError("Enter a published booklet catalog ID.");
      document.getElementById(fieldId)?.focus();
      return "failed";
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api("/api/admin/booklets", savedDefault, {
        method: "PUT",
        body: { catalogId: selected.data, expectedVersion: current.version },
      });
      setCurrent({ ...result, available: true });
      setCatalogId(result.catalogId);
      toast.confirm("Default booklet package saved.");
      return "saved";
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "BOOKLET_UNAVAILABLE") {
        setError(
          "Choose a published booklet package with a matching, usable workflow policy.",
        );
        return "failed";
      }
      if (cause instanceof ApiError && cause.code === "CONFLICT") {
        setNotice(
          "The default package changed. Reload this page before saving again.",
        );
        return "failed";
      }
      if (
        cause instanceof ApiError &&
        [
          "FORBIDDEN",
          "UNAUTHENTICATED",
          "ACCOUNT_CHANGED",
          "INVALID_INPUT",
        ].includes(cause.code)
      ) {
        setNotice(
          "The package couldn’t be saved. Check your session and the catalog ID.",
        );
        return "failed";
      }
      setNotice(
        "The save couldn’t be confirmed. Reload this page to check the current package.",
      );
      return "unknown";
    } finally {
      setPending(false);
    }
  }

  useLeaveGuard({ dirty, save });

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Default booklet package
        </CardTitle>
        <CardDescription>
          New conversations quote this package before the customer starts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!current.catalogId || !current.available) && (
          <Notice
            tone="warning"
            title={
              current.catalogId
                ? "Current package unavailable"
                : "No default package"
            }
          >
            Select a published booklet package with a usable workflow policy to
            enable new conversations.
          </Notice>
        )}
        {notice && <Notice tone="error" title={notice} />}
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty)
              void save().then((outcome) => {
                if (outcome === "failed")
                  document.getElementById(fieldId)?.focus();
              });
          }}
        >
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={fieldId}>Published catalog ID</FieldLabel>
            <Input
              id={fieldId}
              dir="ltr"
              value={catalogId}
              readOnly={pending}
              maxLength={128}
              aria-invalid={Boolean(error)}
              aria-describedby={
                fieldId + "-help" + (error ? " " + fieldId + "-error" : "")
              }
              onChange={(event) => {
                setCatalogId(event.target.value);
                setError(null);
              }}
            />
            <FieldDescription id={fieldId + "-help"}>
              Enter the full consumption catalog ID listed in Commerce.
            </FieldDescription>
            <FieldError id={fieldId + "-error"}>{error}</FieldError>
          </Field>
          <SubmitButton pending={pending} disabled={!dirty}>
            Save default package
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function PolicyCard({ policy }: { policy: Policy }) {
  const [expected, setExpected] = useState(policy.retryDefaults);
  const [version, setVersion] = useState(policy.retryDefaultsVersion);
  const [state, setState] = useState(policy.retryDefaultsState);
  const shown = (defaults: Defaults | null) => ({
    paidLlm: String(defaults?.paidLlm ?? 2),
    paidImage: String(defaults?.paidImage ?? 0),
    nonPaid: String(defaults?.nonPaid ?? 3),
  });
  // The values on screen when the page opened or last saved; edits are compared with these.
  const [baseline, setBaseline] = useState(() => shown(policy.retryDefaults));
  const [values, setValues] = useState(baseline);
  const [errors, setErrors] = useState<Partial<Record<keyof Defaults, string>>>(
    {},
  );
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const id = (key: string) => `${policy.id}-${key}`;
  const changed = fields.some(
    ({ key }) => values[key].trim() !== baseline[key],
  );
  // Missing or invalid stored defaults can be saved as shown, to repair them.
  const canSave = changed || state !== "valid";

  async function save(): Promise<SaveResult> {
    if (pending) return "unknown";
    const found: Partial<Record<keyof Defaults, string>> = {};
    const next = {} as Defaults;
    for (const { key } of fields) {
      const value = Number(values[key]);
      if (!/^\d+$/.test(values[key].trim()) || value > 10)
        found[key] = "Enter a whole number from 0 to 10.";
      else next[key] = value;
    }
    setErrors(found);
    const first = fields.find(({ key }) => found[key]);
    if (first) {
      document.getElementById(id(first.key))?.focus();
      return "failed";
    }
    setPending(true);
    setNotice(null);
    try {
      const result = await api("/api/admin/booklets", saved, {
        method: "POST",
        body: { policyId: policy.id, expectedVersion: version, next },
      });
      setExpected(result.retryDefaults);
      setVersion(result.retryDefaultsVersion);
      setState("valid");
      setBaseline(shown(result.retryDefaults));
      setValues(shown(result.retryDefaults));
      toast.confirm("Retry defaults saved for new productions.");
      return "saved";
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "The settings couldn’t be saved. Reload and check them.",
      );
      return error instanceof ApiError ? "failed" : "unknown";
    } finally {
      setPending(false);
    }
  }

  useLeaveGuard({ dirty: changed, save });

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          <span dir="ltr">{policy.profileId}</span> · revision{" "}
          {policy.profileRevision}
        </CardTitle>
        <CardDescription>
          Orchestrator <span dir="ltr">{policy.orchestratorId}</span>{" "}
          configuration {policy.configurationRevision}
          {" · "}
          <StatusBadge tone={policy.current ? "success" : "neutral"}>
            {policy.current
              ? "Uses the orchestrator’s current configuration"
              : "Uses an earlier orchestrator configuration"}
          </StatusBadge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">
              Capacity (fixed for this profile revision)
            </dt>
            <dd>
              {policy.capacity
                ? `${policy.capacity.maxStoryPages} pages · ${policy.capacity.maxCharacters} characters · ${policy.capacity.maxLocations} locations · ${policy.capacity.languages.join(", ")}`
                : "Missing or invalid: new productions cannot start"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reviewer policy</dt>
            <dd>
              {policy.reviewer
                ? `${policy.reviewer.id} · revision ${policy.reviewer.revision}`
                : "Not configured"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Saved retry defaults</dt>
            <dd>
              {state === "valid" && expected ? (
                <ul>
                  {fields.map(({ key, label }) => (
                    <li key={key}>
                      {label}: {expected[key]}
                    </li>
                  ))}
                </ul>
              ) : state === "invalid" ? (
                "Invalid: save valid values to repair. New productions cannot start until then."
              ) : (
                "Not set: new productions cannot start"
              )}
            </dd>
          </div>
        </dl>
        {notice && (
          <Notice tone="error" title="Not saved">
            {notice}
          </Notice>
        )}
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) void save();
          }}
        >
          {fields.map(({ key, label, help }) => (
            <Field key={key} data-invalid={Boolean(errors[key])}>
              <FieldLabel htmlFor={id(key)}>{label}</FieldLabel>
              <Input
                id={id(key)}
                inputMode="numeric"
                value={values[key]}
                readOnly={pending}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={`${id(key)}-help${errors[key] ? ` ${id(key)}-error` : ""}`}
                onChange={(event) => {
                  setValues((old) => ({ ...old, [key]: event.target.value }));
                  setErrors((old) => ({ ...old, [key]: undefined }));
                }}
              />
              <p
                id={`${id(key)}-help`}
                className="text-sm text-muted-foreground"
              >
                {help}
              </p>
              <FieldError id={`${id(key)}-error`}>{errors[key]}</FieldError>
            </Field>
          ))}
          <div className="sm:col-span-3">
            <SubmitButton pending={pending} disabled={!canSave}>
              Save retry defaults
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AdminBooklets({ initial }: { initial: View }) {
  return (
    <div className="page-stack">
      <DefaultPackageCard initial={initial.defaultPackage} />
      {initial.policies.length === 0 ? (
        <EmptyState
          title="No booklet bindings"
          description="Trusted provisioning creates workflow policy bindings. Booklets cannot start until one exists with capacity and retry defaults."
        />
      ) : (
        initial.policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))
      )}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Recent retry authorizations
          </CardTitle>
          <CardDescription>
            Customer-authorized extra attempts after automatic retries ran out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initial.retryEvidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time (UTC)</TableHead>
                  <TableHead>Production</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Attempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initial.retryEvidence.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {row.at?.replace("T", " ").slice(0, 16) ?? "—"}
                    </TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">
                      {row.productionId.slice(0, 16)}
                    </TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.retryOrdinal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
