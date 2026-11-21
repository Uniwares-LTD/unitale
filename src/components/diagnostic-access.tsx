"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import {
  diagnosticCapabilities,
  diagnosticCapabilityNames,
  grantListSchema,
  grantCreatedSchema,
  type GrantCreated,
  type grantDurations,
  type DiagnosticCapability,
  type GrantView,
} from "@/lib/contracts/diagnostics";
import { DateLabel } from "./localized-value";
import { Notice, SubmitButton } from "./page-patterns";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

type Message = { tone: "success" | "error" | "warning"; text: string };
type Duration = keyof typeof grantDurations;
const metadataDefaults = diagnosticCapabilityNames.filter(
  (name) => diagnosticCapabilities[name] === "metadata",
);
const contentCapabilities = diagnosticCapabilityNames.filter(
  (name) => diagnosticCapabilities[name] === "content",
);
export function DiagnosticAccess({
  availability,
}: {
  availability: { enabled: boolean; redisConfigured: boolean };
}) {
  const id = useId();
  const copyInput = useRef<HTMLTextAreaElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [duration, setDuration] = useState<Duration>("1h");
  const [selected, setSelected] = useState<Set<DiagnosticCapability>>(
    () => new Set(metadataDefaults),
  );
  const [grants, setGrants] = useState<GrantView[] | null>(null);
  const [created, setCreated] = useState<GrantCreated | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = availability.enabled && availability.redisConfigured;

  const describe = useCallback((error: unknown): Message => {
    // Network failures and unconfirmed creation share the uncertain state.
    if (
      !(error instanceof ApiError) ||
      error.code === "DIAGNOSTIC_GRANT_OUTCOME_UNKNOWN"
    )
      return {
        tone: "warning",
        text: "The request outcome is uncertain. Check active grants before trying again.",
      };
    switch (error.code) {
      case "RECENT_LOGIN_REQUIRED":
        return {
          tone: "error",
          text: "Your sign-in is too old for this change. Sign out, sign in again and retry.",
        };
      case "DIAGNOSTICS_STORAGE_UNAVAILABLE":
        return {
          tone: "error",
          text: "Diagnostic grant storage (MongoDB) is unavailable.",
        };
      case "DIAGNOSTICS_REDIS_UNAVAILABLE":
        return {
          tone: "error",
          text: "Diagnostic request protection (Redis) is unavailable.",
        };
      case "NOT_FOUND":
        return {
          tone: "error",
          text: "Diagnostics is disabled in this environment.",
        };
      case "DIAGNOSTIC_GRANT_LIMIT":
        return {
          tone: "error",
          text: "You already have the maximum number of active grants. Revoke one first.",
        };
      case "DIAGNOSTIC_GRANT_UNCERTAIN":
        return {
          tone: "warning",
          text: "Access could not be recorded, so it was withdrawn. Check active grants before trying again.",
        };
      case "DIAGNOSTIC_GRANT_NOT_FOUND":
        return { tone: "error", text: "That grant is no longer active." };
      default:
        return { tone: "error", text: error.message };
    }
  }, []);
  const load = useCallback(
    (signal?: AbortSignal) =>
      api("/api/admin/diagnostics/grants", grantListSchema, { signal })
        .then((data) => setGrants(data.grants))
        .catch((error: unknown) => {
          if (!signal?.aborted) setMessage(describe(error));
        }),
    [describe],
  );
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [ready, load]);
  async function create() {
    setBusy(true);
    setMessage(null);
    setCreated(null);
    try {
      const grant = await api(
        "/api/admin/diagnostics/grants",
        grantCreatedSchema,
        {
          method: "POST",
          body: { duration, capabilities: [...selected] },
        },
      );
      setCopyStatus("idle");
      setCreated(grant);
      setMessage({ tone: "success", text: "Diagnostic access created." });
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setBusy(false);
      void load();
    }
  }
  async function revoke(grantId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api(
        "/api/admin/diagnostics/grants",
        z.object({ ok: z.literal(true), recorded: z.boolean() }),
        { method: "DELETE", body: { id: grantId } },
      );
      if (created?.id === grantId) setCreated(null);
      setMessage({ tone: "success", text: "Diagnostic access revoked." });
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setBusy(false);
      void load();
    }
  }
  const toggle = (name: DiagnosticCapability, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  const valid = selected.size > 0;
  const accessDetails = created
    ? `Diagnostic endpoint: ${created.endpoint} | Authorization: Bearer ${created.credential}`
    : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(accessDetails);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
      copyInput.current?.focus();
      copyInput.current?.select();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostic access</CardTitle>
        <CardDescription>
          Create temporary, read-only access to the diagnostics API. Grants are
          separate from application settings and are never saved with them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!availability.enabled ? (
          <Notice
            tone="info"
            title="Diagnostics is disabled in this environment."
          />
        ) : !availability.redisConfigured ? (
          <Notice
            tone="warning"
            title="Diagnostic request protection (Redis) is unavailable."
          >
            Configure REDIS_URL for this environment; diagnostics has no other
            grant store.
          </Notice>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid && !busy) void create();
            }}
          >
            <div className="space-y-2">
              <FieldLabel htmlFor={`${id}-duration`}>Expires after</FieldLabel>
              <Select
                value={duration}
                disabled={busy}
                onValueChange={(value) => setDuration(value as Duration)}
              >
                <SelectTrigger id={`${id}-duration`} className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15 minutes</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="4h">4 hours</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="7d">1 week (7 days)</SelectItem>
                  <SelectItem value="30d">1 month (30 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FieldSet className="space-y-3">
              <FieldLegend className="text-sm font-medium">
                Metadata capabilities
              </FieldLegend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {metadataDefaults.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-${name}`}
                      checked={selected.has(name)}
                      disabled={busy}
                      onCheckedChange={(value) => toggle(name, value === true)}
                    />
                    <FieldLabel
                      htmlFor={`${id}-${name}`}
                      className="font-mono text-xs"
                    >
                      {name}
                    </FieldLabel>
                  </div>
                ))}
              </div>
            </FieldSet>
            <FieldSet className="space-y-3">
              <FieldLegend className="text-sm font-medium">
                Content capabilities
              </FieldLegend>
              <p className="text-xs text-muted-foreground">
                These return stored prompts, answers, outputs and saved text
                from any account. Select them only when the investigation needs
                that content.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {contentCapabilities.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-${name}`}
                      checked={selected.has(name)}
                      disabled={busy}
                      onCheckedChange={(value) => toggle(name, value === true)}
                    />
                    <FieldLabel
                      htmlFor={`${id}-${name}`}
                      className="font-mono text-xs"
                    >
                      {name}
                    </FieldLabel>
                  </div>
                ))}
              </div>
            </FieldSet>
            <SubmitButton ref={createButton} pending={busy} disabled={!valid}>
              Create access
            </SubmitButton>
          </form>
        )}
        {message && <Notice tone={message.tone} title={message.text} />}
        {created && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setCreated(null);
                setCopyStatus("idle");
              }
            }}
          >
            <DialogContent
              className="sm:max-w-lg"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                createButton.current?.focus();
              }}
            >
              <DialogHeader>
                <DialogTitle>Copy diagnostic access</DialogTitle>
                <DialogDescription>
                  Copy this string and paste it into the chat. It is shown only
                  once. If you lose it, revoke this grant and create another.
                </DialogDescription>
              </DialogHeader>
              <FieldLabel htmlFor={`${id}-access`}>
                Diagnostic access details
              </FieldLabel>
              <div className="flex items-start gap-2">
                <Textarea
                  ref={copyInput}
                  id={`${id}-access`}
                  readOnly
                  value={accessDetails}
                  dir="ltr"
                  rows={5}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 break-all font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void copy()}
                  aria-label="Copy access details"
                >
                  {copyStatus === "copied" ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p role="status" className="text-sm text-muted-foreground">
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "failed"
                    ? "Copy failed. Select the text and copy it manually."
                    : null}
              </p>
            </DialogContent>
          </Dialog>
        )}
        {ready && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Your active grants</h3>
            {grants === null ? null : grants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active grants.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grant ID</TableHead>
                    <TableHead>Capabilities</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.map((grant) => (
                    <TableRow key={grant.id}>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {grant.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-md flex-wrap gap-1">
                          {grant.capabilities.map((name) => (
                            <Badge
                              key={name}
                              variant={
                                diagnosticCapabilities[name] === "content"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="font-mono"
                            >
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DateLabel value={grant.expiresAt} />
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Revoke diagnostic access?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Requests using this grant stop working
                                immediately. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void revoke(grant.id)}
                              >
                                Revoke
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
