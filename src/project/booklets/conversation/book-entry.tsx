"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { signInPath } from "@/lib/return-path";
import { Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import {
  bookletEditableErrors,
  bookletEntrySchema,
  bookletRunReferenceSchema,
  type BookletEntry,
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

type Problem = "failed" | "pending" | "price" | "credits" | "unavailable";

export function BookEntry({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("ui");
  const locale = useLocale();
  const router = useRouter();
  const field = useRef<HTMLTextAreaElement>(null);
  const [idea, setIdea] = useState("");
  const [consent, setConsent] = useState(false);
  const [entry, setEntry] = useState<BookletEntry | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // One key per consented request, reused for every retry of that request.
  const key = useRef<string | null>(null);

  useEffect(() => {
    const saved = readDraft();
    // Restored after the sign-in round trip; the user still confirms the price.
    queueMicrotask(() => {
      if (saved) setIdea(saved);
      if (saved && signedIn) setConsent(true);
    });
  }, [signedIn]);

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
    if (consent && !entry) loadEntry();
  }, [consent, entry]);

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
    key.current = null;
    field.current?.focus();
  }

  async function start() {
    const pack = entry?.package;
    if (!pack || starting) return;
    key.current ??= crypto.randomUUID();
    setStarting(true);
    setProblem(null);
    try {
      const run = await api("/api/booklets", bookletRunReferenceSchema, {
        method: "POST",
        timeoutMs: 60000,
        body: {
          action: "start-idea",
          key: key.current,
          catalogId: pack.catalogId,
          revision: pack.revision,
          quoteHash: pack.quoteHash,
          acceptedCredits: pack.credits,
          idea: idea.trim(),
          language: locale === "ar" ? "ar" : "en",
        },
      });
      writeDraft(null);
      router.push(`/books/${encodeURIComponent(run.productionId)}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "BOOKLET_START_PENDING") setProblem("pending");
      else if (code === "INSUFFICIENT_CREDITS") setProblem("credits");
      else if (code === "BOOKLET_CONFLICT") {
        // The quote changed: show the current price before a new consent.
        setProblem("price");
        setEntry(null);
        loadEntry();
      } else if (code === "BOOKLET_UNAVAILABLE") setProblem("unavailable");
      else setProblem("failed");
      // Refusals before any charge allow a fresh request; anything else keeps
      // the same key so a retry can never start a second paid book.
      if (bookletEditableErrors.includes(code)) key.current = null;
      setStarting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    send();
  }

  const pack = entry?.package ?? null;
  const missing = pack ? pack.credits - (entry?.availableCredits ?? 0) : 0;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 py-6 sm:py-12">
      <header className="text-center">
        <h1 className="font-heading text-[clamp(2.5rem,6vw,4rem)] leading-[1.08] tracking-tight">
          <span className="block">{t("m262c2d549b96")}</span>
          <span className="block">{t("me524c3dd7e43")}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          {t("mec401c187075")}
        </p>
      </header>

      <div className="relative">
        {/* Static mascot face only; the 3D mascot is deferred. */}
        <Image
          src="/images/unitale-mascot-face.svg"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className="absolute -top-14 end-8 size-16 sm:end-12"
        />
        <div className="rounded-[var(--x-unitale-radius-dialog)] border bg-card p-4 shadow-[var(--x-unitale-shadow-raised)] focus-within:ring-[3px] focus-within:ring-ring/40 sm:p-6">
          <label htmlFor="book-idea" className="sr-only">
            {t("mb3ba025e2ecd")}
          </label>
          <textarea
            id="book-idea"
            ref={field}
            value={idea}
            maxLength={4000}
            rows={3}
            readOnly={consent}
            placeholder={t("m4966873a89fb")}
            onChange={(event) => setIdea(event.target.value)}
            onKeyDown={onKeyDown}
            className="block max-h-56 min-h-24 w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("m79a2b7be2cdc")}</p>
            {consent ? (
              <Button variant="ghost" onClick={edit} disabled={starting}>
                {t("mfd1d3a3672ed")}
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-11 rounded-full"
                onClick={send}
                disabled={!idea.trim()}
                aria-label={t("mf6f4688ff23d")}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {consent && (
        <section
          aria-labelledby="book-consent-title"
          className="rounded-[var(--x-unitale-radius-card)] border bg-card p-5 sm:p-6 motion-safe:animate-in motion-safe:fade-in"
        >
          <h2 id="book-consent-title" className="font-heading text-xl">
            {t("mee15ab57a7fb")}
          </h2>
          {!entry && !loadFailed && (
            <div className="mt-4 space-y-2" aria-label={t("mba3bbbe10d8b")}>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {loadFailed && (
            <div className="mt-4 space-y-3">
              <Notice tone="error" title={t("mb99fbb363d5b")} />
              <Button variant="outline" onClick={loadEntry}>
                {t("md8b8392e2c54")}
              </Button>
            </div>
          )}
          {entry && !pack && (
            <div className="mt-4">
              <Notice
                tone="warning"
                title={t("m391e8b97689b")}
              />
            </div>
          )}
          {pack && (
            <>
              <p className="mt-3 text-base leading-relaxed">
                {pack.includeCover
                  ? t("m2625981f6078", {
                      pages: pack.storyPages,
                    })
                  : t("me047ec3372f2", {
                      pages: pack.storyPages,
                    })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("mcc1d89950812", {
                  credits: pack.credits,
                  available: entry!.availableCredits,
                })}
              </p>
              {problem && (
                <div className="mt-4">
                <Notice
                  tone={problem === "pending" ? "warning" : "error"}
                  title={
                    problem === "pending"
                      ? t("me079e4adcff9")
                      : problem === "price"
                        ? t("m319be527cbf8")
                        : problem === "credits"
                          ? t("m06db853045c4", {
                              missing: Math.max(1, missing),
                            })
                          : problem === "unavailable"
                            ? t("m391e8b97689b")
                            : t("m3d3a090b7c87")
                  }
                />
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                {missing > 0 ? (
                  <Button asChild>
                    <a href="/credits">{t("m040985b8ff7e")}</a>
                  </Button>
                ) : (
                  <Button onClick={start} disabled={starting} aria-busy={starting}>
                    {starting
                      ? t("m3768da03d71e")
                      : problem === "pending" || problem === "failed"
                        ? t("md8b8392e2c54")
                        : t("m6d9b2dbc225a")}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {!consent && (
        <section aria-labelledby="book-inspiration-title">
          <h2 id="book-inspiration-title" className="mb-3 text-sm text-muted-foreground">
            {t("m288f7ad20405")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {inspirations.map((item) => (
              <li key={item.title}>
                <button
                  type="button"
                  // Fills the composer only; sending stays a deliberate action.
                  onClick={() => {
                    setIdea(item.text);
                    field.current?.focus();
                  }}
                  className="flex min-h-[var(--control-touch-lg,2.75rem)] w-full flex-col items-start gap-1 rounded-[var(--x-unitale-radius-card)] border bg-card px-4 py-3 text-start transition-colors hover:bg-accent focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!signedIn && idea.trim() && (
        <p className="text-center text-sm text-muted-foreground">
          {t("mcd5053d9a549")}
        </p>
      )}
    </div>
  );
}
