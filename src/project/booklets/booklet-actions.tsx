"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Notice, SubmitButton } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  bookletEditableErrors,
  bookletRetryResultSchema,
  bookletRevisionQuoteSchema,
  bookletRunReferenceSchema,
  type BookletProductionCommand,
  type BookletRevisionQuote,
  type BookletRunReference,
  type BookletView,
} from "./application-contract";

type Revision = BookletView["actions"]["revisions"][number];
type Pending = {
  command: BookletProductionCommand;
  reason: "sending" | "unknown";
};

/** Recovery and revision controls. The server rechecks every command; one key
 * per intent is reused for a retry when an outcome is unknown. */
export function BookletActions({
  view,
  currentRunId,
  refresh,
}: {
  view: BookletView;
  currentRunId: string;
  refresh: () => void;
}) {
  const t = useTranslations("ui");
  const router = useRouter();
  const prefix = useId();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{
    tone: "error" | "warning" | "info";
    title: string;
    message?: string;
  } | null>(null);
  const [category, setCategory] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [quote, setQuote] = useState<
    (BookletRevisionQuote & { requestId: string; scope: string }) | null
  >(null);
  const [quoting, setQuoting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const actions = view.actions;
  const selected = actions.revisions.find((r) => r.category === category);
  const scope = JSON.stringify([category, [...subjects].sort(), view.version]);
  const busy = pending !== null;

  const categoryLabel: Record<Revision["category"], string> = {
    story: t("me9e509dcd358"),
    style: t("m7e744141b40e"),
    reference: t("m7f635ab40e2d"),
    page: t("m9046da16aea9"),
  };

  function go(result: BookletRunReference) {
    setPending(null);
    if (result.runId === currentRunId) refresh();
    else router.push(`/runs/${encodeURIComponent(result.runId)}`);
  }

  async function send(command: BookletProductionCommand) {
    setNotice(null);
    setPending({ command, reason: "sending" });
    try {
      const path = `/api/booklets/${encodeURIComponent(view.productionId)}`;
      if (command.action === "retry") {
        const result = await api(path, bookletRetryResultSchema, {
          method: "POST",
          body: command,
        });
        if (result.continued) return go(result.continued);
        setPending(null);
        setNotice({
          tone: "info",
          title: t("m4f53ea9f8511"),
          message: t("m73ddfa2a29db"),
        });
        refresh();
        return;
      }
      go(
        await api(path, bookletRunReferenceSchema, {
          method: "POST",
          body: command,
          timeoutMs: 60000,
        }),
      );
    } catch (error) {
      const known = error instanceof ApiError ? error : null;
      if (known && bookletEditableErrors.includes(known.code)) {
        setPending(null);
        setQuote(null);
        setNotice({
          tone: "error",
          title: t("me90b5655e574"),
          message: known.message,
        });
        refresh();
        return;
      }
      // Unknown outcome: keep the exact command for a same-key check.
      setPending({ command, reason: "unknown" });
      setNotice({
        tone: "warning",
        title: t("mc0cbfcd14937"),
        // Saved but not started: the server says so; otherwise the outcome is unknown.
        message:
          known?.code === "BOOKLET_START_PENDING"
            ? known.message
            : t("m3b35fbc959af"),
      });
    }
  }

  async function review() {
    if (!selected) return;
    setNotice(null);
    setQuoting(true);
    const requestId = crypto.randomUUID();
    try {
      const result = await api(
        `/api/booklets/${encodeURIComponent(view.productionId)}`,
        bookletRevisionQuoteSchema,
        {
          method: "POST",
          body: {
            action: "quote-revision",
            requestId,
            expectedVersion: view.version,
            category: selected.category,
            subjects: selected.unit === "subject" ? subjects : [],
          },
        },
      );
      setQuote({ ...result, requestId, scope });
    } catch (error) {
      setNotice({
        tone: "error",
        title: t("m9541df23241a"),
        message: error instanceof ApiError ? error.message : t("m481859b689b0"),
      });
    } finally {
      setQuoting(false);
    }
  }

  function chooseCategory(value: string) {
    setCategory(value);
    setQuote(null);
    const next = actions.revisions.find((r) => r.category === value);
    setSubjects(
      next?.allSubjectsRequired ? next.subjects.map((s) => s.id) : [],
    );
  }

  const shownQuote = quote && quote.scope === scope ? quote : null;
  const canReview =
    selected && (selected.unit === "request" || subjects.length > 0);

  return (
    <section
      aria-labelledby={`${prefix}-actions`}
      className="space-y-4 border-t pt-4"
    >
      <h3 id={`${prefix}-actions`} className="font-medium">
        {t("mdd00d3d3e9f7")}
      </h3>
      {notice && (
        <Notice tone={notice.tone} title={notice.title}>
          {notice.message}
        </Notice>
      )}
      {pending?.reason === "unknown" && (
        <Button type="button" onClick={() => void send(pending.command)}>
          {t("mfb7099ad8e81")}
        </Button>
      )}
      {actions.running && (
        <p className="text-sm text-muted-foreground">{t("mca656448efa2")}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {actions.retry && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              void send({
                action: "retry",
                key: crypto.randomUUID(),
                callId: actions.retry!.callId,
              })
            }
          >
            {t("m400a4fd58c2a")}
          </Button>
        )}
        {actions.continue && (
          <Button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              void send({ action: "continue", key: crypto.randomUUID() })
            }
          >
            {t("m9939bc8e6272")}
          </Button>
        )}
      </div>
      {actions.revisions.length > 0 && (
        <form
          className="space-y-4 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void review();
          }}
        >
          <FieldSet>
            <FieldLegend>{t("mcb5d9f987803")}</FieldLegend>
            <RadioGroup
              value={category}
              onValueChange={chooseCategory}
              disabled={busy}
              className="flex flex-wrap gap-4"
            >
              {actions.revisions.map((r) => (
                <Field
                  key={r.category}
                  orientation="horizontal"
                  className="w-auto"
                >
                  <RadioGroupItem
                    id={`${prefix}-${r.category}`}
                    value={r.category}
                  />
                  <FieldLabel htmlFor={`${prefix}-${r.category}`}>
                    {categoryLabel[r.category]}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
          {selected?.unit === "subject" && (
            <FieldSet>
              <FieldLegend variant="label">
                {selected.allSubjectsRequired
                  ? t("m2828999f1cd9")
                  : t("m13521e091b96")}
              </FieldLegend>
              <div className="grid gap-2 sm:grid-cols-2">
                {selected.subjects.map((s) => (
                  <Field key={s.id} orientation="horizontal">
                    <Checkbox
                      id={`${prefix}-s-${s.id}`}
                      checked={subjects.includes(s.id)}
                      disabled={busy || selected.allSubjectsRequired}
                      onCheckedChange={(checked) =>
                        setSubjects((old) =>
                          checked
                            ? [...old, s.id]
                            : old.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <FieldLabel htmlFor={`${prefix}-s-${s.id}`}>
                      <bdi>
                        {s.pageRole === "cover" ? t("mfa8d84566676") : s.label}
                      </bdi>
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldSet>
          )}
          {shownQuote ? (
            <div className="space-y-3" role="status">
              <p className="font-medium">
                {shownQuote.credits === 0
                  ? t("mc286b09f35f1")
                  : t("me2eaabf3783d", { credits: shownQuote.credits })}
              </p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t("mb89dfd3ea089")}
              </Button>
            </div>
          ) : (
            <SubmitButton pending={quoting} disabled={!canReview || busy}>
              {t("m070a6c308a8f")}
            </SubmitButton>
          )}
        </form>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mc5d2b63e6a98")}</AlertDialogTitle>
            <AlertDialogDescription>
              {shownQuote?.credits
                ? t("m895dfe6829de", { credits: shownQuote.credits })
                : t("mfe5a9dbcbf24")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("m19766ed6ccb2")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!shownQuote || !selected) return;
                setConfirming(false);
                void send({
                  action: "start-revision",
                  requestId: shownQuote.requestId,
                  expectedVersion: view.version,
                  category: selected.category,
                  subjects: selected.unit === "subject" ? subjects : [],
                  quoteHash: shownQuote.quoteHash,
                  acceptedCredits: shownQuote.credits,
                });
              }}
            >
              {t("m3339589ca259")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
