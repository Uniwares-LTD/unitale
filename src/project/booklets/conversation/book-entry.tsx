"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ExternalLink, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { signInPath } from "@/lib/return-path";
import { Notice, SubmitButton } from "@/components/page-patterns";
import { useLeaveGuard } from "@/components/leave-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "@/project/components/conversation/composer";
import { InspirationList } from "@/project/components/conversation/inspiration-list";
import {
  bookletBusyMessage,
  bookletEntrySchema,
  bookletIdeaStartCommandSchema,
  bookletRunReferenceSchema,
  type BookletEntry,
  type BookletIdeaStartCommand,
} from "../application-contract";

// The idea survives the sign-in round trip in this tab only.
const draftKey = "unitale-book-idea";
function readDraft() {
  try {
    return sessionStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(draftKey);
    else sessionStorage.setItem(draftKey, value);
  } catch {
    /* Storage unavailable: the idea simply is not kept. */
  }
}

type Problem =
  "failed" | "pending" | "busy" | "price" | "credits" | "unavailable";

function readPendingStart(storageKey: string | null) {
  if (!storageKey) return null;
  try {
    const saved = sessionStorage.getItem(storageKey);
    return saved
      ? bookletIdeaStartCommandSchema.parse(JSON.parse(saved))
      : null;
  } catch {
    return null;
  }
}

export function BookEntry({ ownerId }: { ownerId: string | null }) {
  const signedIn = ownerId !== null;
  const storageKey = ownerId ? `unitale-book-start:${ownerId}` : null;
  const t = useTranslations("ui");
  const locale = useLocale();
  const router = useRouter();
  const field = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const [idea, setIdea] = useState("");
  const [consent, setConsent] = useState(false);
  const [entry, setEntry] = useState<BookletEntry | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pendingStart, setPendingStart] =
    useState<BookletIdeaStartCommand | null>(null);
  // Only an unsent idea can be lost; a held one waits in this tab.
  useLeaveGuard({ dirty: !consent && !!idea.trim() });

  useEffect(() => {
    const saved = readDraft();
    const pending = readPendingStart(storageKey);
    queueMicrotask(() => {
      if (pending) {
        setPendingStart(pending);
        setIdea(pending.idea);
        setConsent(true);
      } else if (saved) {
        setIdea(saved);
        if (storageKey) setConsent(true);
      }
    });
  }, [storageKey]);

  function loadEntry() {
    api("/api/booklets?section=default", bookletEntrySchema).then(
      (value) => {
        setEntry(value);
        setLoadFailed(false);
      },
      () => setLoadFailed(true),
    );
  }
  useEffect(() => {
    if (consent && !entry && !pendingStart) loadEntry();
  }, [consent, entry, pendingStart]);
  // Back from buying credits in the other tab: show the new balance.
  const short =
    !!entry?.package && entry.package.credits > entry.availableCredits;
  useEffect(() => {
    if (!consent || !short) return;
    const onVisible = () => {
      if (!document.hidden) loadEntry();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [consent, short]);

  const inspirations = [
    {
      title: t("meb672e0170f0"),
      hint: t("m491b6c85f933"),
      text: t("mc6fa1a75fbe8"),
    },
    {
      title: t("ma140c531b8a3"),
      hint: t("mbf8d890060df"),
      text: t("mdf95364616ae"),
    },
    {
      title: t("m886dae665bb5"),
      hint: t("m0bfea2d8af37"),
      text: t("m451fd4729617"),
    },
  ];

  function send() {
    const text = idea.trim();
    if (!text || starting) return;
    if (!signedIn) {
      writeDraft(text);
      router.push(signInPath("/books/new"));
      return;
    }
    writeDraft(text);
    setConsent(true);
    setProblem(null);
  }

  function edit() {
    setConsent(false);
    setProblem(null);
    field.current?.focus();
  }

  async function start() {
    if (!storageKey || submitting.current) return;
    const pack = entry?.package;
    let request = pendingStart;
    if (!request) {
      if (!pack) return;
      request = {
        action: "start-idea",
        key: crypto.randomUUID(),
        catalogId: pack.catalogId,
        revision: pack.revision,
        quoteHash: pack.quoteHash,
        acceptedCredits: pack.credits,
        idea: idea.trim(),
        language: locale === "ar" ? "ar" : "en",
      };
      // Save before sending. A reload must replay the exact consented request.
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(request));
      } catch {
        setProblem("failed");
        return;
      }
      setPendingStart(request);
      setProblem(null);
    }
    const clearPending = () => {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // The retained request is still safe to replay with the same key.
      }
      setPendingStart(null);
    };
    submitting.current = true;
    setStarting(true);
    try {
      const run = await api("/api/booklets", bookletRunReferenceSchema, {
        method: "POST",
        timeoutMs: 60000,
        body: request,
      });
      writeDraft(null);
      clearPending();
      router.push(`/books/${encodeURIComponent(run.productionId)}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      // Transient refusals such as rate limiting cannot settle an earlier attempt.
      if (
        [
          "INVALID_INPUT",
          "BOOKLET_CONFLICT",
          "BOOKLET_UNAVAILABLE",
          "BOOKLET_INVALID",
          "INSUFFICIENT_CREDITS",
        ].includes(code)
      ) {
        clearPending();
        setEntry(null);
      }
      if (code === "BOOKLET_START_PENDING")
        setProblem(
          (error as Error).message === bookletBusyMessage ? "busy" : "pending",
        );
      else if (code === "INSUFFICIENT_CREDITS") setProblem("credits");
      else if (code === "BOOKLET_CONFLICT") setProblem("price");
      else if (code === "BOOKLET_UNAVAILABLE") setProblem("unavailable");
      else setProblem("failed");
      submitting.current = false;
      setStarting(false);
    }
  }

  const pack = entry?.package ?? null;
  const missing = pack ? pack.credits - (entry?.availableCredits ?? 0) : 0;
  const recovering = pendingStart && (!entry || problem !== null);
  // Same condition under which the card shows "Start my book".
  const canStart = !!pack && missing <= 0 && !recovering;
  return (
    <div
      data-slot="book-entry"
      className="mx-auto flex w-full max-w-xl flex-col gap-8 py-4 sm:py-8"
    >
      <header className="text-center">
        <p className="mb-5 font-heading text-section-title text-muted-foreground">
          <bdi>Unitale</bdi>
        </p>
        <h1 className="font-heading text-display">
          <span className="block">{t("m262c2d549b96")}</span>
          <span className="block">{t("me524c3dd7e43")}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-body text-muted-foreground">
          {t("mec401c187075")}
        </p>
      </header>

      <div className="relative mt-4">
        {/* Static mascot face only (decorative); the 3D mascot is deferred. */}
        <Image
          src="/images/unitale-mascot-face.svg"
          alt=""
          aria-hidden="true"
          width={48}
          height={48}
          className="pointer-events-none absolute -top-10 end-6 size-12 sm:end-8"
        />
        <Composer
          id="book-idea"
          size="entry"
          inputRef={field}
          value={idea}
          onChange={setIdea}
          // Once held, the arrow does what "Start my book" does.
          onSend={consent ? start : send}
          canSend={consent ? canStart : !!idea.trim()}
          pending={starting}
          readOnly={consent}
          maxLength={4000}
          label={t("mb3ba025e2ecd")}
          describedBy={!consent ? "book-idea-hint" : undefined}
          placeholder={t("m4966873a89fb")}
          sendLabel={consent ? t("m0ee71f4dfb02") : t("mf6f4688ff23d")}
          footer={
            consent && !pendingStart ? (
              // Round pen in Send's place: edit the held idea.
              <Button
                variant="outline"
                size="icon"
                className="size-(--control-touch-sm) rounded-full"
                onClick={edit}
                disabled={starting}
                aria-label={t("mfd1d3a3672ed")}
                title={t("mfd1d3a3672ed")}
              >
                <Pencil aria-hidden="true" />
              </Button>
            ) : null
          }
        />
        {!consent && (
          <p
            id="book-idea-hint"
            className="mt-3 text-center text-supporting text-muted-foreground"
          >
            {/* Signed out, Send leads to sign-in; say so beside Send. */}
            {!signedIn && idea.trim() ? t("mcd5053d9a549") : t("m79a2b7be2cdc")}
          </p>
        )}
      </div>

      {recovering && (
        <Notice
          tone="warning"
          title={
            problem === "busy"
              ? t("ma43eb39b6d6a")
              : problem === "pending"
                ? t("me079e4adcff9")
                : t("m6b8971f87e59")
          }
        >
          <SubmitButton
            pending={starting}
            onClick={start}
            className="mt-3 min-h-(--control-touch-sm)"
          >
            {t("md8b8392e2c54")}
          </SubmitButton>
        </Notice>
      )}
      {consent && !recovering && (
        // Accepted exception (2026-11-23): an inline consent card that states
        // pages, price and balance instead of an AlertDialog.
        <Card
          aria-labelledby="book-consent-title"
          size="sm"
          // Raised like the idea box so the next step stands out.
          className="gap-2 rounded-(--x-unitale-radius-dialog) bg-card shadow-(--x-unitale-shadow-raised) ring-0 motion-safe:animate-in motion-safe:fade-in"
        >
          <CardHeader>
            <CardTitle
              id="book-consent-title"
              className="font-heading text-card-title font-(number:--text-card-title--font-weight)"
            >
              {t("mee15ab57a7fb")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!entry && !loadFailed && (
              <div className="space-y-2" aria-label={t("mba3bbbe10d8b")}>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
            {loadFailed && (
              <>
                <Notice tone="error" title={t("mb99fbb363d5b")} />
                <Button variant="outline" onClick={loadEntry}>
                  {t("md8b8392e2c54")}
                </Button>
              </>
            )}
            {entry && !pack && (
              <Notice tone="warning" title={t("m391e8b97689b")} />
            )}
            {pack && (
              <>
                <div>
                  <p className="text-body">
                    {pack.includeCover
                      ? t("m2625981f6078", { pages: pack.storyPages })
                      : t("me047ec3372f2", { pages: pack.storyPages })}
                  </p>
                  <p className="text-supporting text-muted-foreground">
                    {t("mcc1d89950812", {
                      credits: pack.credits,
                      available: entry!.availableCredits,
                    })}
                  </p>
                </div>
                {problem && (
                  <Notice
                    tone={
                      problem === "pending" || problem === "busy"
                        ? "warning"
                        : "error"
                    }
                    title={
                      problem === "busy"
                        ? t("ma43eb39b6d6a")
                        : problem === "pending"
                          ? t("me079e4adcff9")
                          : problem === "price"
                            ? t("m589bd2ada19a")
                            : problem === "credits"
                              ? t("m06db853045c4", {
                                  missing: Math.max(1, missing),
                                })
                              : problem === "unavailable"
                                ? t("m391e8b97689b")
                                : t("m3d3a090b7c87")
                    }
                  />
                )}
                <div className="flex flex-col">
                  {missing > 0 ? (
                    <>
                      <Button
                        asChild
                        className="min-h-(--control-touch-sm) w-full"
                      >
                        {/* Credits has no return link, so it opens beside this
                            tab: the held idea stays here, and the balance is
                            read again when the person comes back. */}
                        <a href="/credits" target="_blank" rel="noopener">
                          {t("m040985b8ff7e")}
                          <ExternalLink aria-hidden="true" />
                        </a>
                      </Button>
                      <p className="mt-2 text-center text-supporting text-muted-foreground">
                        {t("m693036881436")}
                      </p>
                    </>
                  ) : (
                    // Pending keeps the label; the request key makes a retry safe.
                    <SubmitButton
                      pending={starting}
                      onClick={start}
                      className="min-h-(--control-touch-sm) w-full"
                    >
                      {problem === "pending" ||
                      problem === "busy" ||
                      problem === "failed"
                        ? t("md8b8392e2c54")
                        : t("m6d9b2dbc225a")}
                    </SubmitButton>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!consent && (
        <InspirationList
          headingId="book-inspiration-title"
          heading={t("m288f7ad20405")}
          items={inspirations}
          onPick={(index) => {
            // Fills the composer only; sending stays a deliberate action.
            setIdea(inspirations[index].text);
            field.current?.focus();
          }}
        />
      )}
    </div>
  );
}
