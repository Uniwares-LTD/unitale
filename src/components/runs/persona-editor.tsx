"use client";

import { formatAdminNumber } from "@/lib/admin-labels";
import { EmptyState, Notice, SubmitButton } from "@/components/page-patterns";

import { useId, useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import type { PersonaFields } from "@/lib/contracts/personas";
import type { personasView } from "@/lib/server/runs/personas";
import { CompletionEditor } from "./persona-completion-editor";
import { SettingsField } from "./admin-editors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { useLeaveGuard } from "@/components/leave-guard";
import type { SaveResult } from "@/lib/design-helpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
type View = Awaited<ReturnType<typeof personasView>>;
type Row = View["personas"][number];
function PersonaForm({
  initial,
  saved,
  onBusyChange,
}: {
  initial: Row;
  saved: (row: Row) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<PersonaFields>(() => ({
    name: initial.name,
    description: initial.description,
    instructions: initial.instructions,
    enabled: initial.enabled,
    archived: initial.archived,
    pricing: initial.pricing,
    maxCalls: initial.maxCalls,
  }));
  const [baseline] = useState(() => JSON.stringify(fields));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(): Promise<SaveResult> {
    if (busy || !formRef.current?.checkValidity()) return "failed";
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    try {
      await api("/api/admin/personas", z.object({ id: z.string() }), {
        method: "POST",
        body: { id: initial.id, revision: initial.revision, fields, reason },
      });
      saved({
        ...initial,
        ...fields,
        revision: initial.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      setMessage("Saved.");
      return "saved";
    } catch (e) {
      setMessage(
        e instanceof ApiError
          ? e.message
          : "Could not confirm the save. Reload before retrying.",
      );
      return e instanceof ApiError && e.code !== "INVALID_RESPONSE"
        ? "failed"
        : "unknown";
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  useLeaveGuard({
    dirty:
      initial.revision > 0 &&
      (JSON.stringify(fields) !== baseline || Boolean(reason)),
    save,
  });
  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void save();
      }}
    >
      {(["name", "description", "instructions"] as const).map((name) => (
        <Field className="space-y-2" key={name}>
          <FieldLabel htmlFor={`${prefix}-${name}`}>
            {name === "instructions"
              ? "Persona instructions"
              : name === "name"
                ? "Name"
                : "Description"}
          </FieldLabel>
          {name === "name" ? (
            <Input
              id={`${prefix}-${name}`}
              maxLength={100}
              required
              value={fields[name]}
              onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
            />
          ) : (
            <Textarea
              id={`${prefix}-${name}`}
              maxLength={name === "instructions" ? 3000 : 500}
              required={name === "instructions"}
              value={fields[name]}
              onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
            />
          )}
        </Field>
      ))}
      {(["enabled", "archived"] as const).map((name) => (
        <div className="flex items-center gap-2" key={name}>
          <Checkbox
            id={`${prefix}-${name}`}
            checked={fields[name]}
            onCheckedChange={(v) =>
              setFields({ ...fields, [name]: v === true })
            }
          />
          <FieldLabel htmlFor={`${prefix}-${name}`}>
            {name === "enabled" ? "Enabled" : "Archived"}
          </FieldLabel>
        </div>
      ))}
      <SettingsField
        name="pricing"
        tokenPricingOnly
        value={fields.pricing}
        onChange={(pricing) =>
          setFields({
            ...fields,
            pricing: pricing as PersonaFields["pricing"],
          })
        }
      />
      <FieldLabel htmlFor={`${prefix}-limit`}>
        Maximum answers per attempt (1–100)
      </FieldLabel>
      <Input
        id={`${prefix}-limit`}
        type="number"
        min={1}
        max={100}
        value={fields.maxCalls}
        onChange={(e) =>
          setFields({ ...fields, maxCalls: Number(e.target.value) })
        }
      />
      <FieldLabel htmlFor={`${prefix}-reason`}>
        Change reason (optional)
      </FieldLabel>
      <Input
        id={`${prefix}-reason`}
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      <SubmitButton pending={busy}>
        {busy ? "Saving…" : "Save persona"}
      </SubmitButton>
      {message && <Notice title={message} />}
    </form>
  );
}
function newPersona(instructions: string): Row {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    updatedAt: new Date().toISOString(),
    name: "",
    description: "",
    instructions,
    enabled: false,
    archived: false,
    pricing: { mode: "fixed", credits: 1 },
    maxCalls: 10,
  };
}
function PersonaDialog({
  row,
  saved,
}: {
  row?: Row;
  saved: (row: Row) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Row>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setDraft(row ?? newPersona("Answer as this persona."));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={row ? "outline" : "default"}>
          {row ? "Edit persona" : "Add persona"}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${row.name}` : "Add persona"}</DialogTitle>
          <DialogDescription>
            Set the role instructions, pricing and answer limit for this
            persona.
          </DialogDescription>
        </DialogHeader>
        {open && draft && (
          <PersonaForm
            key={draft.id}
            initial={draft}
            onBusyChange={setBusy}
            saved={(next) => {
              saved(next);
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
export function PersonaEditor({ initial }: { initial: View }) {
  const [rows, setRows] = useState(initial.personas);
  const [completionReady, setCompletionReady] = useState(
    initial.completion.ready,
  );
  function saved(next: Row) {
    setRows((old) =>
      old.some((row) => row.id === next.id)
        ? old.map((row) => (row.id === next.id ? next : row))
        : [...old, next],
    );
  }
  return (
    <div className="space-y-4">
      <CompletionEditor
        initial={initial.completion}
        onReady={setCompletionReady}
      />
      <PersonaDialog saved={saved} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="break-words">{row.name}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    row.enabled && !row.archived ? "default" : "secondary"
                  }
                >
                  {row.archived
                    ? "Archived"
                    : row.enabled
                      ? "Enabled"
                      : "Disabled"}
                </Badge>
                {!completionReady && (
                  <Badge variant="outline">Completion unavailable</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {row.description && (
                <p className="text-sm text-muted-foreground break-words">
                  {row.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {row.instructions}
              </p>
              <p className="text-sm text-muted-foreground">
                {"Up to " +
                  (row.maxCalls === 1
                    ? formatAdminNumber(row.maxCalls) + " answer"
                    : formatAdminNumber(row.maxCalls) + " answers") +
                  " per attempt · Revision " +
                  row.revision}
              </p>
              <PersonaDialog row={row} saved={saved} />
            </CardContent>
          </Card>
        ))}
      </div>
      {!rows.length && (
        <EmptyState
          title="No personas yet. Add one to get started."
          description="Personas answer workflow questions during runs."
        />
      )}
    </div>
  );
}
