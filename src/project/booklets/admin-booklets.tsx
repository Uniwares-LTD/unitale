"use client";

// Administration copy is English/LTR by design (no locale catalogs).
import { useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import type { bookletAdminView } from "@/lib/server/booklets/admin";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
});

function PolicyCard({ policy }: { policy: Policy }) {
  const [expected, setExpected] = useState(policy.retryDefaults);
  const [values, setValues] = useState<Record<keyof Defaults, string>>({
    paidLlm: String(policy.retryDefaults?.paidLlm ?? 2),
    paidImage: String(policy.retryDefaults?.paidImage ?? 0),
    nonPaid: String(policy.retryDefaults?.nonPaid ?? 3),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Defaults, string>>>(
    {},
  );
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const id = (key: string) => `${policy.id}-${key}`;

  async function save() {
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
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const result = await api("/api/admin/booklets", saved, {
        method: "POST",
        body: { policyId: policy.id, expected, next },
      });
      setExpected(result.retryDefaults);
      toast.confirm("Retry defaults saved for new productions.");
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : "The settings couldn’t be saved. Reload and check them.",
      );
    } finally {
      setPending(false);
    }
  }

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
            {policy.current ? "Current configuration" : "Earlier configuration"}
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
              {expected
                ? `${expected.paidLlm} / ${expected.paidImage} / ${expected.nonPaid}`
                : "Not set: new productions cannot start"}
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
            void save();
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
            <SubmitButton pending={pending}>Save retry defaults</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AdminBooklets({ initial }: { initial: View }) {
  return (
    <div className="page-stack">
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
