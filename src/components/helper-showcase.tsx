"use client";

// Synthetic examples of the shared helpers adopted at U2 (#53). Development-only, like the rest
// of the showcase: every state is demonstrated; nothing here calls a service.

import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Notice, SubmitButton, type NoticeAction } from "./page-patterns";
import { StatusBadge } from "./status-badge";
import { MediaFallback, ResultImage } from "./media-fallback";
import { useGuardedNavigation, useLeaveGuard } from "./leave-guard";
import {
  acceptSubmit,
  describedBy,
  fieldIds,
  type SaveResult,
} from "@/lib/design-helpers";

function FieldExample() {
  const id = useId();
  const email = useId();
  const ids = fieldIds(id);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      noValidate={false}
      className="grid gap-4"
      // Capture-phase invalid handler next to LocalizedValidation (spec §2): copy the translated
      // message into the field, suppress the browser bubble, focus the first invalid control.
      onInvalidCapture={(event) => {
        const control = event.target as HTMLInputElement;
        event.preventDefault();
        if (control.id === id) setError(control.validationMessage);
        const first = form.current?.querySelector<HTMLElement>(":invalid");
        if (first === control) control.focus();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>Project name</FieldLabel>
        <Input
          id={id}
          name="name"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, {
            help: true,
            error: Boolean(error),
          })}
          onInput={() => setError(null)}
        />
        <FieldDescription id={ids.help}>
          Shown on the project page.
        </FieldDescription>
        {error && <FieldError id={ids.error}>{error}</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor={email}>Email</FieldLabel>
        <Input
          id={email}
          type="email"
          dir="ltr"
          size="lg"
          placeholder="name@example.test"
        />
      </Field>
      <Field orientation="horizontal">
        <Checkbox id={`${id}-terms`} />
        <FieldLabel htmlFor={`${id}-terms`}>Notify me about changes</FieldLabel>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Textarea
          size="lg"
          aria-label="Large text area"
          placeholder="Large text area"
        />
        <Select>
          <SelectTrigger size="lg" aria-label="Large select">
            <SelectValue placeholder="Large select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Option A</SelectItem>
            <SelectItem value="b">Option B</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit">Submit</Button>
        {submitted && <span role="status">Submitted.</span>}
      </div>
    </form>
  );
}

function PendingExample() {
  const [pending, setPending] = useState(false);
  const [requests, setRequests] = useState(0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!acceptSubmit(pending)) return;
    setPending(true);
    setRequests((n) => n + 1);
    setTimeout(() => setPending(false), 1500);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Value"
        readOnly={pending}
        defaultValue="Draft value"
        className="max-w-56"
      />
      <SubmitButton pending={pending}>Save changes</SubmitButton>
      <span data-testid="requests">Requests sent: {requests}</span>
    </form>
  );
}

function LeaveGuardExample() {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [capability, setCapability] = useState<
    "succeed" | "fail" | "unknown" | "none"
  >("succeed");
  const dirty = draft !== saved;
  const save = useCallback(
    () =>
      new Promise<SaveResult>((resolve) =>
        setTimeout(() => {
          if (capability === "succeed") {
            setSaved(draft);
            resolve("saved");
          } else resolve(capability === "fail" ? "failed" : "unknown");
        }, 800),
      ),
    [capability, draft],
  );
  const { navigate } = useLeaveGuard({
    dirty,
    save: capability === "none" ? undefined : save,
  });
  const guarded = useGuardedNavigation();
  return (
    <div className="grid gap-3">
      <Textarea
        aria-label="Draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Type to make the draft unsaved"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Save outcome"
          value={capability}
          onChange={(event) =>
            setCapability(event.target.value as typeof capability)
          }
          className="h-8 rounded-lg border px-2 text-sm"
        >
          <option value="succeed">Save succeeds</option>
          <option value="fail">Save fails</option>
          <option value="unknown">Save outcome unknown</option>
          <option value="none">No saving</option>
        </select>
        <Button asChild variant="outline">
          <Link href="/" onNavigate={guarded("/")}>
            Leave through a link
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/preferences")}
        >
          Leave programmatically
        </Button>
        <span role="status">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
      </div>
    </div>
  );
}

function NoticeActionExample() {
  const [state, setState] = useState<NoticeAction["state"]>("available");
  const [fail, setFail] = useState(false);
  const receipts: Record<NoticeAction["state"], string> = {
    available: "Ready to inspect the existing result.",
    pending: "Checking the existing result. Your draft is kept.",
    success: "Check complete. Your draft is kept.",
    failed:
      "The check could not finish. Your draft is kept; no new request was started.",
  };
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={fail} onCheckedChange={(v) => setFail(v === true)} />
        Next check fails
      </label>
      <Notice
        tone="info"
        title="A result is available"
        action={{
          state,
          labels: {
            available: "Check result",
            pending: "Checking result",
            success: "Result checked",
          },
          receipt: receipts[state],
          onAction: () => {
            setState("pending");
            setTimeout(() => setState(fail ? "failed" : "success"), 1200);
          },
        }}
      >
        The feature supplies the real outcome; the notice never retries on its
        own.
      </Notice>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setState("available")}
      >
        Reset example
      </Button>
    </div>
  );
}

export function HelperShowcase() {
  return (
    <section aria-labelledby="helpers-title" className="space-y-4">
      <h2 id="helpers-title" className="text-xl font-semibold">
        Shared helpers
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="helper-field">
          <CardHeader>
            <CardTitle>Field, sizes and touch</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldExample />
          </CardContent>
        </Card>
        <Card id="helper-pending">
          <CardHeader>
            <CardTitle>Pending submit</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingExample />
          </CardContent>
        </Card>
        <Card id="helper-leave">
          <CardHeader>
            <CardTitle>Leave guard</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveGuardExample />
          </CardContent>
        </Card>
        <Card id="helper-media">
          <CardHeader>
            <CardTitle>Missing media</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <ResultImage
              src={null}
              alt="Missing result image"
              width={240}
              height={160}
              aspectRatio="3 / 2"
            />
            <ResultImage
              src="/__design-system-missing-image.png"
              alt="Broken result image"
              width={240}
              height={160}
              unoptimized
              aspectRatio="3 / 2"
            />
            <MediaFallback reason="missing" aspectRatio="3 / 2" />
            <MediaFallback reason="failed" aspectRatio="3 / 2" />
          </CardContent>
        </Card>
        <Card id="helper-badges">
          <CardHeader>
            <CardTitle>Status badges</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">Draft</StatusBadge>
            <StatusBadge tone="info">In progress</StatusBadge>
            <StatusBadge tone="warning">Needs your approval</StatusBadge>
            <StatusBadge tone="success">Ready</StatusBadge>
            <StatusBadge tone="error">Could not finish</StatusBadge>
            <div className="w-40">
              <StatusBadge tone="warning">
                A long status label that wraps inside its container
              </StatusBadge>
            </div>
          </CardContent>
        </Card>
        <Card id="helper-notice">
          <CardHeader>
            <CardTitle>Notice with an action</CardTitle>
          </CardHeader>
          <CardContent>
            <NoticeActionExample />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
