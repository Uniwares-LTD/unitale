"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useLeaveGuard } from "@/components/leave-guard";
import { EmptyState, Notice, SubmitButton } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  bookletEditableErrors,
  bookletPackagePageSchema,
  bookletPackageSummarySchema,
  bookletRunReferenceSchema,
  type BookletPackageSummary,
  type BookletStartCommand,
} from "./application-contract";

type Draft = {
  catalogId: string;
  title: string;
  idea: string;
  audience: string;
  language: string;
  characters: string;
  locations: string;
  visualPreferences: string;
};
type FieldName = keyof Draft;
const emptyDraft: Draft = {
  catalogId: "",
  title: "",
  idea: "",
  audience: "",
  language: "",
  characters: "",
  locations: "",
  visualPreferences: "",
};
// Order used to focus the first invalid control.
const fieldOrder: FieldName[] = [
  "catalogId",
  "title",
  "idea",
  "audience",
  "language",
  "characters",
  "locations",
];
const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

type Phase =
  | { kind: "edit" }
  | { kind: "review"; quote: BookletPackageSummary }
  // A submitted paid request stays immutable until its outcome is known.
  | {
      kind: "locked";
      quote: BookletPackageSummary;
      request: BookletStartCommand;
      reason: "sending" | "unknown" | "pending";
    };

export function BookletStart() {
  const t = useTranslations("ui");
  const router = useRouter();
  const prefix = useId();
  const [packages, setPackages] = useState<BookletPackageSummary[] | null>(
    null,
  );
  const [next, setNext] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  const [quoting, setQuoting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [started, setStarted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = (name: string) => `${prefix}-${name}`;

  const fetchPage = useCallback(
    (cursor?: string | null) =>
      api(
        `/api/booklets?section=packages${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        bookletPackagePageSchema,
      ),
    [],
  );
  // State changes only in promise callbacks, after the request settles.
  useEffect(() => {
    let live = true;
    fetchPage().then(
      (page) => {
        if (!live) return;
        setPackages(page.rows);
        setNext(page.next);
      },
      () => live && setLoadFailed(true),
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);
  async function load(cursor?: string | null) {
    setLoadFailed(false);
    if (cursor) setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setPackages((old) => [...(cursor ? (old ?? []) : []), ...page.rows]);
      setNext(page.next);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const selected = packages?.find((p) => p.catalogId === draft.catalogId);
  const firstAvailable = packages?.find((p) => p.available)?.catalogId;
  const dirty =
    !started &&
    Object.entries(draft).some(
      // Package and language are selections, not typed work worth guarding.
      ([key, value]) =>
        key !== "catalogId" && key !== "language" && value.trim() !== "",
    );
  useLeaveGuard({ dirty });
  const frozen = phase.kind === "locked";

  function update(name: FieldName, value: string) {
    if (frozen) return;
    setDraft((old) => {
      const changed = { ...old, [name]: value };
      if (name === "catalogId") {
        const pack = packages?.find((p) => p.catalogId === value);
        if (!pack?.languages.some((l) => l.tag === old.language))
          changed.language = pack?.languages[0]?.tag ?? "";
      }
      return changed;
    });
    setErrors((old) => ({ ...old, [name]: undefined }));
    // Any change invalidates a shown price; consent must follow a fresh quote.
    if (phase.kind === "review") setPhase({ kind: "edit" });
  }

  function validate(): boolean {
    const found: Partial<Record<FieldName, string>> = {};
    if (!selected) found.catalogId = t("m8bccd6d744c0");
    if (!draft.title.trim()) found.title = t("m8b33880c49b7");
    if (!draft.idea.trim()) found.idea = t("me32b6ba4efd7");
    if (!draft.audience.trim()) found.audience = t("me714689289a1");
    if (selected && !selected.languages.some((l) => l.tag === draft.language))
      found.language = t("m9e3569780985");
    if (selected && lines(draft.characters).length > selected.maxCharacters)
      found.characters = t("m50752d7cad11");
    if (selected && lines(draft.locations).length > selected.maxLocations)
      found.locations = t("m50752d7cad11");
    setErrors(found);
    const first = fieldOrder.find((name) => found[name]);
    if (first)
      formRef.current
        ?.querySelector<HTMLElement>(`[data-booklet-field="${first}"]`)
        ?.focus();
    return !first;
  }

  async function review() {
    setNotice(null);
    if (!validate() || !selected) return;
    setQuoting(true);
    try {
      const quote = await api("/api/booklets", bookletPackageSummarySchema, {
        method: "POST",
        body: { action: "quote", catalogId: selected.catalogId },
      });
      setPhase({ kind: "review", quote });
    } catch (error) {
      setNotice({
        title: t("m9541df23241a"),
        message: error instanceof ApiError ? error.message : t("m481859b689b0"),
      });
    } finally {
      setQuoting(false);
    }
  }

  async function send(
    request: BookletStartCommand,
    quote: BookletPackageSummary,
  ) {
    setNotice(null);
    setPhase({ kind: "locked", quote, request, reason: "sending" });
    try {
      const result = await api("/api/booklets", bookletRunReferenceSchema, {
        method: "POST",
        body: request,
        timeoutMs: 60000,
      });
      setStarted(true);
      router.push(`/runs/${encodeURIComponent(result.runId)}`);
    } catch (error) {
      const known = error instanceof ApiError ? error : null;
      const code = known?.code ?? null;
      if (known && bookletEditableErrors.includes(known.code)) {
        // Refused before any charge: the draft is kept and may be edited.
        setPhase({ kind: "edit" });
        setNotice({ title: t("m6c78666f04ee"), message: known.message });
        return;
      }
      setPhase({
        kind: "locked",
        quote,
        request,
        reason: code === "BOOKLET_START_PENDING" ? "pending" : "unknown",
      });
      setNotice(
        code === "BOOKLET_START_PENDING"
          ? { title: t("mcb9c01dfb795"), message: known!.message }
          : {
              title: t("m43a19acd5519"),
              message: t("m75c0ab1c13fa"),
            },
      );
    }
  }

  function confirm() {
    if (phase.kind !== "review") return;
    // Bind consent to the quoted revision, not the earlier package listing.
    const quote = phase.quote;
    const language = quote.languages.find((l) => l.tag === draft.language);
    setConfirming(false);
    if (
      !language ||
      lines(draft.characters).length > quote.maxCharacters ||
      lines(draft.locations).length > quote.maxLocations
    ) {
      setPhase({ kind: "edit" });
      setNotice({ title: t("m6c78666f04ee"), message: t("m8c942ee450ce") });
      return;
    }
    void send(
      {
        action: "start",
        key: crypto.randomUUID(),
        catalogId: quote.catalogId,
        revision: quote.revision,
        quoteHash: quote.quoteHash,
        acceptedCredits: quote.credits,
        title: draft.title.trim(),
        brief: {
          idea: draft.idea.trim(),
          audience: draft.audience.trim(),
          language,
          characters: lines(draft.characters),
          locations: lines(draft.locations),
          visualPreferences: draft.visualPreferences.trim(),
        },
      },
      quote,
    );
  }

  const quote = phase.kind === "edit" ? null : phase.quote;
  const sending = phase.kind === "locked" && phase.reason === "sending";

  return (
    <Card className="shadow-none">
      <CardHeader>
        <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-secondary">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        <CardTitle role="heading" aria-level={2} className="text-xl">
          {t("ma0c29655f13c")}
        </CardTitle>
        <CardDescription>{t("m6491cc84030a")}</CardDescription>
      </CardHeader>
      <CardContent>
        {packages === null && !loadFailed ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">{t("m2981eae03a7a")}</span>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : loadFailed && !packages?.length ? (
          <Notice tone="error" title={t("m476e8a6536d3")}>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void load()}
            >
              {t("md8b8392e2c54")}
            </Button>
          </Notice>
        ) : !packages?.length ? (
          <EmptyState
            title={t("m95f146e16f56")}
            description={t("mf671fc825ac0")}
          />
        ) : (
          <form
            ref={formRef}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void review();
            }}
            className="space-y-6"
          >
            <FieldSet>
              <FieldLegend>{t("m59de121db1b8")}</FieldLegend>
              <RadioGroup
                value={draft.catalogId}
                onValueChange={(value) => update("catalogId", value)}
                disabled={frozen}
                aria-invalid={Boolean(errors.catalogId)}
                aria-describedby={
                  errors.catalogId ? id("catalogId-error") : undefined
                }
                className="grid gap-3 sm:grid-cols-2"
              >
                {packages.map((pack, index) => (
                  <FieldLabel
                    key={pack.catalogId}
                    htmlFor={id("package-" + index)}
                    className="cursor-pointer has-disabled:cursor-not-allowed"
                  >
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        id={id("package-" + index)}
                        value={pack.catalogId}
                        disabled={!pack.available || frozen}
                        data-booklet-field={
                          pack.catalogId === firstAvailable
                            ? "catalogId"
                            : undefined
                        }
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="font-medium">
                          {t("m63b322a93fe0", { pages: pack.storyPages })}
                          {pack.includeCover && ` · ${t("m7002702e6ac6")}`}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t("md44493028180", {
                            characters: pack.maxCharacters,
                            locations: pack.maxLocations,
                          })}
                        </span>
                        <span className="text-sm font-medium">
                          {pack.available
                            ? t("me2eaabf3783d", { credits: pack.credits })
                            : t("m9cd3dd1370d1")}
                        </span>
                      </div>
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              <FieldError id={id("catalogId-error")}>
                {errors.catalogId}
              </FieldError>
              {next && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  onClick={() => void load(next)}
                >
                  {t("m263a9bc660b8")}
                </Button>
              )}
            </FieldSet>

            <FieldGroup>
              <Field data-invalid={Boolean(errors.title)}>
                <FieldLabel htmlFor={id("title")}>
                  {t("m4a682cfe8e6a")}
                </FieldLabel>
                <Input
                  id={id("title")}
                  data-booklet-field="title"
                  value={draft.title}
                  maxLength={160}
                  readOnly={frozen}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={
                    errors.title ? id("title-error") : undefined
                  }
                  onChange={(event) => update("title", event.target.value)}
                />
                <FieldError id={id("title-error")}>{errors.title}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.idea)}>
                <FieldLabel htmlFor={id("idea")}>
                  {t("m244ad1a61000")}
                </FieldLabel>
                <Textarea
                  id={id("idea")}
                  data-booklet-field="idea"
                  value={draft.idea}
                  maxLength={4000}
                  rows={4}
                  readOnly={frozen}
                  aria-invalid={Boolean(errors.idea)}
                  aria-describedby={`${id("idea-help")}${errors.idea ? " " + id("idea-error") : ""}`}
                  onChange={(event) => update("idea", event.target.value)}
                />
                <FieldDescription id={id("idea-help")}>
                  {t("mb7916fe04c00")}
                </FieldDescription>
                <FieldError id={id("idea-error")}>{errors.idea}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.audience)}>
                <FieldLabel htmlFor={id("audience")}>
                  {t("m545c02357695")}
                </FieldLabel>
                <Input
                  id={id("audience")}
                  data-booklet-field="audience"
                  value={draft.audience}
                  maxLength={400}
                  readOnly={frozen}
                  aria-invalid={Boolean(errors.audience)}
                  aria-describedby={`${id("audience-help")}${errors.audience ? " " + id("audience-error") : ""}`}
                  onChange={(event) => update("audience", event.target.value)}
                />
                <FieldDescription id={id("audience-help")}>
                  {t("mc4ff4adf1710")}
                </FieldDescription>
                <FieldError id={id("audience-error")}>
                  {errors.audience}
                </FieldError>
              </Field>
              {selected && (
                <Field data-invalid={Boolean(errors.language)}>
                  <FieldLabel htmlFor={id("language")}>
                    {t("ma4fe65264ef7")}
                  </FieldLabel>
                  <Select
                    value={draft.language}
                    onValueChange={(value) => update("language", value)}
                    disabled={frozen}
                  >
                    <SelectTrigger
                      id={id("language")}
                      data-booklet-field="language"
                      aria-invalid={Boolean(errors.language)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selected.languages.map((l) => (
                        <SelectItem key={l.tag} value={l.tag}>
                          <bdi dir={l.direction}>
                            {new Intl.DisplayNames([l.tag], {
                              type: "language",
                            }).of(l.tag) ?? l.tag}
                          </bdi>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{errors.language}</FieldError>
                </Field>
              )}
              {selected && selected.maxCharacters > 0 && (
                <Field data-invalid={Boolean(errors.characters)}>
                  <FieldLabel htmlFor={id("characters")}>
                    {t("m6fac39e2845b")}
                  </FieldLabel>
                  <Textarea
                    id={id("characters")}
                    data-booklet-field="characters"
                    value={draft.characters}
                    rows={3}
                    readOnly={frozen}
                    aria-invalid={Boolean(errors.characters)}
                    aria-describedby={`${id("characters-help")}${errors.characters ? " " + id("characters-error") : ""}`}
                    onChange={(event) =>
                      update("characters", event.target.value)
                    }
                  />
                  <FieldDescription id={id("characters-help")}>
                    {t("m2e8661e53ca9", { count: selected.maxCharacters })}
                  </FieldDescription>
                  <FieldError id={id("characters-error")}>
                    {errors.characters}
                  </FieldError>
                </Field>
              )}
              {selected && selected.maxLocations > 0 && (
                <Field data-invalid={Boolean(errors.locations)}>
                  <FieldLabel htmlFor={id("locations")}>
                    {t("m95c61170318a")}
                  </FieldLabel>
                  <Textarea
                    id={id("locations")}
                    data-booklet-field="locations"
                    value={draft.locations}
                    rows={3}
                    readOnly={frozen}
                    aria-invalid={Boolean(errors.locations)}
                    aria-describedby={`${id("locations-help")}${errors.locations ? " " + id("locations-error") : ""}`}
                    onChange={(event) =>
                      update("locations", event.target.value)
                    }
                  />
                  <FieldDescription id={id("locations-help")}>
                    {t("m2e8661e53ca9", { count: selected.maxLocations })}
                  </FieldDescription>
                  <FieldError id={id("locations-error")}>
                    {errors.locations}
                  </FieldError>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor={id("visual")}>
                  {t("mf5796a34b32c")}
                </FieldLabel>
                <Textarea
                  id={id("visual")}
                  value={draft.visualPreferences}
                  maxLength={2000}
                  rows={2}
                  readOnly={frozen}
                  aria-describedby={id("visual-help")}
                  onChange={(event) =>
                    update("visualPreferences", event.target.value)
                  }
                />
                <FieldDescription id={id("visual-help")}>
                  {t("m6d9f6163ca9f")}
                </FieldDescription>
              </Field>
            </FieldGroup>

            {notice && (
              <Notice tone={frozen ? "warning" : "error"} title={notice.title}>
                {notice.message}
              </Notice>
            )}

            {quote ? (
              <section
                aria-labelledby={id("price")}
                className="space-y-3 rounded-xl border p-4"
              >
                <h3 id={id("price")} className="font-medium">
                  {t("m93c91c851e7a")}
                </h3>
                <p className="text-2xl font-semibold">
                  {t("me2eaabf3783d", {
                    credits: quote.credits,
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {quote.entitlementDays === null
                    ? t("mf572dd2797cd")
                    : t("m0ade371d69fb", {
                        days: quote.entitlementDays,
                      })}
                </p>
                <div className="flex flex-wrap gap-3">
                  {phase.kind === "locked" && phase.reason !== "sending" ? (
                    <Button
                      onClick={() => void send(phase.request, phase.quote)}
                      type="button"
                    >
                      {phase.reason === "pending"
                        ? t("md8b8392e2c54")
                        : t("mfb7099ad8e81")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={sending}
                      aria-busy={sending}
                      onClick={() => setConfirming(true)}
                    >
                      {t("m2da13cbece9d")}
                      <ArrowRight
                        aria-hidden="true"
                        className="rtl:rotate-180"
                      />
                    </Button>
                  )}
                  {!frozen && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPhase({ kind: "edit" })}
                    >
                      {t("mfd9c61ac500e")}
                    </Button>
                  )}
                </div>
              </section>
            ) : (
              <SubmitButton pending={quoting}>
                {t("m070a6c308a8f")}
              </SubmitButton>
            )}
          </form>
        )}
      </CardContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mecaec0d7e762")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mf038302cd6f4", { credits: quote?.credits ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("m19766ed6ccb2")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              {t("m3339589ca259")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
