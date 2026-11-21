"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchemaFields, initialValue, type FormSchema } from "./schema-fields";
import type { commerceAdminView } from "@/lib/server/commerce/admin";
import { SubmitButton } from "@/components/page-patterns";
import { useLeaveGuard } from "@/components/leave-guard";
import type { SaveResult } from "@/lib/design-helpers";
type View = Awaited<ReturnType<typeof commerceAdminView>>;
const responseSchema = z.record(z.string(), z.unknown());
export function AdminCommerce({ initial }: { initial: View }) {
  const [view, setView] = useState(initial);
  const [definition, setDefinition] = useState<unknown>(null);
  const draftForm = useRef<HTMLFormElement>(null);
  const [baseline, setBaseline] = useState("");
  const [expected, setExpected] = useState(0);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [providerDraft, setProviderDraft] = useState<unknown>(null);
  const [providerPreview, setProviderPreview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uid, setUid] = useState("");
  const [refund, setRefund] = useState<{
    chargeId: string;
    uid: string;
    amount: number;
    reason: string;
    key: string;
  } | null>(null);
  const load = async (section = view.section, after?: string) => {
    const result = await api(
      "/api/admin/commerce?" +
        new URLSearchParams({
          section,
          ...(after ? { after } : {}),
          ...(uid ? { uid } : {}),
        }),
      z.unknown(),
    );
    setView(result as View);
  };
  const run = async (
    command: unknown,
    next?: (result: Record<string, unknown>) => void,
  ): Promise<SaveResult> => {
    if (busy) return "failed";
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const result = await api("/api/admin/commerce", responseSchema, {
        method: "POST",
        body: command,
      });
      committed = true;
      next?.(result);
      setMessage("Saved and verified by the server.");
      await load();
      return "saved";
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Request failed. Retry the same action to reconcile its outcome.",
      );
      if (committed) return "saved";
      return error instanceof ApiError && error.code !== "INVALID_RESPONSE"
        ? "failed"
        : "unknown";
    } finally {
      setBusy(false);
    }
  };
  const edit = (row: Record<string, unknown>) => {
    const draft = structuredClone(row.draft) as {
      terms: { identity: { revision: number } };
    };
    draft.terms.identity.revision = Number(row.revision) + 1;
    setDefinition(draft);
    setBaseline(JSON.stringify(draft));
    setExpected(Number(row.revision));
    setSelected(String(row._id));
    setPreview(null);
    setProviderPreview(null);
    setProviderDraft(null);
  };
  const draft = definition as {
    kind?: string;
    terms?: { productType?: string; productSchemaVersion?: number };
    fields?: unknown;
  } | null;
  const catalogSchema = structuredClone(view.catalogSchema) as FormSchema;
  if (draft?.kind === "consumption") {
    const variants = catalogSchema.oneOf ?? catalogSchema.anyOf ?? [];
    const consumption = variants.find(
      (v) => v.properties?.kind?.const === "consumption",
    );
    if (consumption?.properties) {
      delete consumption.properties.fields;
      const terms = consumption.properties.terms;
      if (terms?.properties) {
        delete terms.properties.productType;
        delete terms.properties.productSchemaVersion;
      }
    }
  }
  const productType = view.productTypes.find(
    (t) =>
      t.id === draft?.terms?.productType &&
      t.schemaVersion === draft?.terms?.productSchemaVersion,
  );
  const canSave = draft?.kind !== "consumption" || Boolean(productType);
  function saveDraft(): Promise<SaveResult> {
    if (!canSave || !draftForm.current?.checkValidity())
      return Promise.resolve("failed");
    return run(
      { action: "save", definition, expectedRevision: expected },
      (result) => {
        setSelected(String(result.id));
        setDefinition(null);
        setPreview(null);
      },
    );
  }
  useLeaveGuard({
    dirty:
      expected > 0 &&
      definition !== null &&
      JSON.stringify(definition) !== baseline,
    save: saveDraft,
  });
  return (
    <div className="space-y-6" aria-busy={busy}>
      <nav aria-label="Commerce sections" className="flex flex-wrap gap-2">
        {["catalogs", "subscriptions", "orders", "publications"].map(
          (section) => (
            <Button
              key={section}
              variant={view.section === section ? "default" : "outline"}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void load(section as View["section"])
                  .catch((e) => setMessage(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {section[0].toUpperCase() + section.slice(1)}
            </Button>
          ),
        )}
      </nav>
      <p role="status" className="text-sm">
        {message}
      </p>
      {["orders", "subscriptions"].includes(view.section) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            void load()
              .catch((e) => setMessage(String(e)))
              .finally(() => setBusy(false));
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Field>
            <FieldLabel htmlFor="commerce-uid">Account UID</FieldLabel>
            <Input
              id="commerce-uid"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
            />
          </Field>
          <SubmitButton pending={busy}>Filter</SubmitButton>
        </form>
      )}
      {view.section === "catalogs" && (
        <Button
          disabled={busy}
          onClick={() => {
            setDefinition(initialValue(view.catalogSchema as FormSchema));
            setExpected(0);
            setSelected("");
            setPreview(null);
            setProviderDraft(null);
            setProviderPreview(null);
          }}
        >
          Create catalog entry
        </Button>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {view.rows.map((row) => (
          <Card key={String(row._id)}>
            <CardHeader>
              <CardTitle className="break-all text-base">
                {String(row._id)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                {view.section === "catalogs"
                  ? `Draft revision ${row.revision}; published ${row.publishedRevision ?? "never"}`
                  : view.section === "orders"
                    ? `${row.amount} credits charged; ${row.refunded} refunded`
                    : `State: ${row.state}`}
              </p>
              {row.uid !== undefined && (
                <p className="break-all text-sm">
                  Account: <bdi>{String(row.uid)}</bdi>
                </p>
              )}
              <details>
                <summary className="cursor-pointer text-sm">
                  View accepted terms and identifiers
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(row, null, 2)}
                </pre>
              </details>
              {view.section === "catalogs" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => edit(row)}
                  >
                    Edit draft
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setSelected(String(row._id));
                      setDefinition(null);
                      setProviderPreview(null);
                      void run({ action: "preview", id: row._id }, setPreview);
                    }}
                  >
                    Preview publication
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setSelected(String(row._id));
                      setDefinition(null);
                      setProviderDraft(
                        initialValue(view.providerSchema as FormSchema),
                      );
                      setProviderPreview(null);
                      setPreview(null);
                    }}
                  >
                    Provider catalog
                  </Button>
                </div>
              )}
              {view.section === "publications" && row.state !== "verified" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run({ action: "provider-reconcile", id: row._id })
                  }
                >
                  Read provider status
                </Button>
              )}
              {view.section === "orders" &&
                Number(row.amount) > Number(row.refunded) && (
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      setRefund({
                        chargeId: String(row._id),
                        uid: String(row.uid),
                        amount: Number(row.amount) - Number(row.refunded),
                        reason: "",
                        key: crypto.randomUUID(),
                      })
                    }
                  >
                    Refund credits
                  </Button>
                )}
            </CardContent>
          </Card>
        ))}
      </div>
      {view.rows.length === 0 && (
        <p className="text-muted-foreground">
          No entries. Catalogs are created by administrators; no production
          offers are seeded.
        </p>
      )}
      {view.next && (
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            void load(view.section, view.next!).catch((e) =>
              setMessage(String(e)),
            )
          }
        >
          Next page
        </Button>
      )}
      {definition !== null && (
        <form
          ref={draftForm}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveDraft();
          }}
        >
          <h2 className="text-lg font-semibold">Catalog draft</h2>
          <p className="text-sm text-muted-foreground">
            Changes create a new version. Accepted orders and subscribers retain
            their snapshots.
          </p>
          <SchemaFields
            schema={catalogSchema}
            value={definition}
            label="Definition"
            disabled={busy}
            onChange={(value) => {
              setDefinition(value);
              setPreview(null);
            }}
          />
          {draft?.kind === "consumption" && (
            <fieldset disabled={busy} className="space-y-3">
              <FieldLabel htmlFor="product-type">Product type</FieldLabel>
              <select
                id="product-type"
                className="w-full rounded-md border bg-background p-2"
                value={
                  productType
                    ? `${productType.id}:${productType.schemaVersion}`
                    : ""
                }
                required
                onChange={(e) => {
                  const type = view.productTypes.find(
                    (t) => `${t.id}:${t.schemaVersion}` === e.target.value,
                  );
                  if (type)
                    setDefinition({
                      ...draft,
                      terms: {
                        ...draft.terms,
                        productType: type.id,
                        productSchemaVersion: type.schemaVersion,
                      },
                      fields: initialValue(type.fields as FormSchema),
                    });
                }}
              >
                <option value="">Select a registered product type</option>
                {view.productTypes.map((t) => (
                  <option
                    key={`${t.id}:${t.schemaVersion}`}
                    value={`${t.id}:${t.schemaVersion}`}
                  >
                    {t.id} v{t.schemaVersion}
                  </option>
                ))}
              </select>
              {productType && (
                <SchemaFields
                  key={`${productType.id}:${productType.schemaVersion}`}
                  schema={productType.fields as FormSchema}
                  value={draft.fields}
                  label="Product settings"
                  onChange={(fields) => setDefinition({ ...draft, fields })}
                  disabled={busy}
                />
              )}
            </fieldset>
          )}
          <p className="text-sm">
            Registered product types:{" "}
            {view.productTypes
              .map((v) => `${v.id} v${v.schemaVersion}`)
              .join(", ") ||
              "None. Register a trusted project extension before creating consumption products."}
          </p>
          <SubmitButton pending={busy} disabled={!canSave}>
            Save draft
          </SubmitButton>
        </form>
      )}
      {preview && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Publish this exact revision?</h2>
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(preview.definition, null, 2)}
          </pre>
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                {
                  action: "publish",
                  id: preview.id,
                  revision: preview.revision,
                  hash: preview.hash,
                },
                () => setPreview(null),
              )
            }
          >
            Publish local catalog
          </Button>
        </section>
      )}
      {providerDraft !== null && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setKey(crypto.randomUUID());
            void run(
              {
                action: "provider-preview",
                id: selected,
                draft: providerDraft,
              },
              setProviderPreview,
            );
          }}
        >
          <h2 className="font-semibold">Provider publication for {selected}</h2>
          <p className="text-sm">
            Preview does not contact the provider. Publish performs the
            displayed external change and verifies readback.
          </p>
          <SchemaFields
            schema={view.providerSchema as FormSchema}
            value={providerDraft}
            label="Provider definition"
            disabled={busy}
            onChange={(value) => {
              setProviderDraft(value);
              setProviderPreview(null);
            }}
          />
          <Button disabled={busy}>Preview provider change</Button>
        </form>
      )}
      {providerPreview && (
        <section className="space-y-3 rounded-lg border p-4">
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(providerPreview.preview, null, 2)}
          </pre>
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                {
                  action: "provider-publish",
                  key,
                  preview: providerPreview.preview,
                  hash: providerPreview.hash,
                },
                () => setProviderPreview(null),
              )
            }
          >
            Publish to provider and verify
          </Button>
        </section>
      )}
      {refund && (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "refund", ...refund }, () => setRefund(null));
          }}
        >
          <h2 className="font-semibold">
            Refund consumption charge {refund.chargeId}
          </h2>
          <FieldLabel htmlFor="refund-amount">Credits</FieldLabel>
          <Input
            id="refund-amount"
            type="number"
            min={1}
            value={refund.amount}
            onChange={(e) =>
              setRefund({ ...refund, amount: Number(e.target.value) })
            }
          />
          <FieldLabel htmlFor="refund-reason">Audit reason</FieldLabel>
          <Input
            required
            id="refund-reason"
            value={refund.reason}
            onChange={(e) => setRefund({ ...refund, reason: e.target.value })}
          />
          <p className="text-sm">
            This returns account credits. Store payment refunds must be issued
            through the provider and reconciled by the billing worker.
          </p>
          <Button disabled={busy}>Confirm credit refund</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRefund(null)}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
