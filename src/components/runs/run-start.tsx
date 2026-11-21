"use client";
import { StateLabel } from "@/components/localized-value";

import { useTranslations } from "next-intl";

import { DomainTargetPicker } from "@/components/domain-target-picker";
import { ManagedFilePicker } from "@/components/managed-file-picker";
import { moduleEnabled } from "@/lib/project";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { maximumCredits } from "@/lib/config/ai-pricing";
import { PricingDescription } from "@/components/pricing-description";
import type { personaChoices } from "@/lib/server/runs/personas";
import type { orchestrators } from "@/lib/server/runs/orchestrators";
import type { runStartSchema } from "@/lib/contracts/runs";
import { EmptyState, Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/page-patterns";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AnswererSelect } from "./answerer-select";
import { RunInputField } from "./dynamic-field";

type Choice = Awaited<ReturnType<typeof orchestrators>>[number];
export type ArtifactOption = { id: string; title: string; revision: number };
type Submission = {
  input: z.infer<typeof runStartSchema>;
  create: { id: string; title: string } | null;
};
const idResponse = z.object({ id: z.string() });
// These server checks precede admission. Other failures may have lost a
// successful response, so keep the exact request immutable for reconciliation.
const editableErrors = new Set([
  "INVALID_INPUT",
  "INVALID_ORCHESTRATOR",
  "CONFIGURATION_CHANGED",
  "ORCHESTRATOR_UNAVAILABLE",
  "ARTIFACT_REQUIRED",
  "ARTIFACT_NOT_FOUND",
  "AI_DISABLED",
  "INSUFFICIENT_CREDITS",
  "PERSONA_UNAVAILABLE",
  "PERSONA_CHANGED",
]);

export function RunLanding({
  choices,
  unfinished,
  personas = [],
  artifacts: initialArtifacts = [],
  artifactId,
  artifactsNext = null,
}: {
  choices: Choice[];
  unfinished: { id: string; name: string; status: string }[];
  personas?: Awaited<ReturnType<typeof personaChoices>>;
  artifacts?: ArtifactOption[];
  artifactId?: string;
  artifactsNext?: string | null;
}) {
  const translate = useTranslations("ui");

  const [domainTarget, setDomainTarget] = useState<{
    kind: string;
    id: string;
  } | null>(null);
  const router = useRouter();
  const prefix = useId();
  const [selected, setSelected] = useState(
    () =>
      (artifactId
        ? choices.find((c) => c.requiresArtifact && c.ready)
        : choices.find((c) => c.ready)
      )?.id ??
      choices[0]?.id ??
      "",
  );
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [answerer, setAnswerer] = useState("user");
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [artifactMode, setArtifactMode] = useState(
    artifactId ? "existing" : "new",
  );
  const [selectedArtifact, setSelectedArtifact] = useState(
    artifactId ?? initialArtifacts[0]?.id ?? "",
  );
  const [artifactSearch, setArtifactSearch] = useState("");
  const [artifactNext, setArtifactNext] = useState(artifactsNext);
  const [artifactSearching, setArtifactSearching] = useState(false);
  async function findArtifacts(more = false) {
    setArtifactSearching(true);
    try {
      const query = new URLSearchParams({ search: artifactSearch });
      if (more && artifactNext) query.set("cursor", artifactNext);
      const page = await api(
        `/api/artifacts?${query}`,
        z.object({
          rows: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              revision: z.number(),
            }),
          ),
          next: z.string().nullable(),
        }),
      );
      setArtifacts((old) => {
        const retained = more
          ? old
          : old.filter((a) => a.id === selectedArtifact);
        return [
          ...retained,
          ...page.rows.filter((a) => !retained.some((r) => r.id === a.id)),
        ];
      });
      setArtifactNext(page.next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : translate("m95d19ac52e89"));
    } finally {
      setArtifactSearching(false);
    }
  }
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "artifact" | "run" | "upload">(
    "idle",
  );
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const submission = useRef<Submission | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const busy = phase !== "idle";
  const frozen = busy || locked;
  const choice = choices.find((c) => c.id === selected);
  const persona = personas.find((p) => p.id === answerer);
  const artifact = artifacts.find((a) => a.id === selectedArtifact);
  const pricing = choice?.pricing ?? { mode: "fixed" as const, credits: 1 };
  const maximum = maximumCredits(pricing) + (persona?.maximum ?? 0);

  function invalid(text: string, id: string) {
    setError(text);
    document.getElementById(id)?.focus();
  }
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice || busy || !choice.ready) return;
    setError("");
    if (!submission.current) {
      const missing = choice.inputs.find(
        (f) =>
          f.required && (values[f.name] === undefined || values[f.name] === ""),
      );
      if (missing)
        return invalid(
          translate("m54583b4ae772", { label: missing.label }),
          `${prefix}-${missing.name}`,
        );
      if (choice.requiresArtifact && artifactMode === "existing" && !artifact)
        return invalid(translate("m50adc9ae2617"), `${prefix}-artifact`);
      if (choice.requiresArtifact && artifactMode === "new" && !title.trim())
        return invalid(translate("m665823bb1053"), `${prefix}-title`);
      if (choice.domainTarget && !choice.requiresArtifact && !domainTarget)
        return invalid(translate("m39c4bb954fb7"), "domain-target-search");
      const create =
        choice.requiresArtifact && artifactMode === "new"
          ? { id: crypto.randomUUID(), title: title.trim() }
          : null;
      submission.current = {
        create,
        input: {
          key,
          orchestratorId: choice.id,
          configurationKey: choice.configurationKey,
          inputs: { ...values },
          ...(domainTarget && !choice.requiresArtifact
            ? { target: domainTarget }
            : {}),
          answerer: persona
            ? {
                type: "persona",
                id: persona.id,
                revision: persona.revision,
                configurationKey: persona.configurationKey,
              }
            : { type: "user" },
          ...(choice.requiresArtifact
            ? { artifactId: create?.id ?? artifact!.id }
            : {}),
        },
      };
    }
    const request = submission.current;
    setLocked(true);
    let navigating = false;
    try {
      if (request.create) {
        setPhase("artifact");
        await api("/api/artifacts", idResponse, {
          method: "POST",
          body: request.create,
        });
        const created = request.create;
        setArtifacts((rows) =>
          rows.some((a) => a.id === created.id)
            ? rows
            : [{ ...created, revision: 0 }, ...rows],
        );
        setSelectedArtifact(created.id);
        setArtifactMode("existing");
      }
      setPhase("run");
      const result = await api("/api/runs", idResponse, {
        method: "POST",
        body: request.input,
      });
      navigating = true;
      router.push(`/runs/${result.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : translate("m7d5febc83f9b"));
      if (e instanceof ApiError && editableErrors.has(e.code)) {
        submission.current = null;
        setLocked(false);
      }
    } finally {
      if (!navigating) setPhase("idle");
    }
  }
  async function upload(name: string, file: File) {
    setPhase("upload");
    setError("");
    try {
      const form = new FormData();
      form.set("orchestratorId", selected);
      form.set("key", crypto.randomUUID());
      form.set("file", file);
      const result = await api(
        "/api/run-uploads",
        z.object({ id: z.string(), status: z.string() }),
        { method: "POST", body: form, timeoutMs: 120000 },
      );
      if (result.status !== "ready") throw new Error();
      setValues((v) => ({ ...v, [name]: result.id }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : translate("mf745841a4086"));
    } finally {
      setPhase("idle");
    }
  }

  const emptyState = (
    <EmptyState
      title={translate("ma22a3795f07a")}
      description={translate("m90bf6d210a70")}
    />
  );

  return (
    <div className="space-y-6">
      {!choices.length ? (
        emptyState
      ) : (
        <form
          onSubmit={(event) => void start(event)}
          aria-busy={busy}
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>
                <h2>{translate("mc2fe29ab435d")}</h2>
              </CardTitle>
              <CardDescription>{translate("m80aedcc89540")}</CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset disabled={frozen} className="space-y-6">
                <legend className="sr-only">
                  {translate("m5066259b6cb8")}
                </legend>
                {choice?.domainTarget && !choice.requiresArtifact && (
                  <DomainTargetPicker
                    key={choice.id}
                    metadata={choice.domainTarget}
                    disabled={frozen}
                    onSelected={setDomainTarget}
                  />
                )}
                <Field className="space-y-2">
                  <FieldLabel htmlFor={`${prefix}-workflow`}>
                    {translate("m2e2d5c5649b7")}
                  </FieldLabel>
                  <Select
                    value={selected}
                    disabled={frozen}
                    onValueChange={(id) => {
                      setSelected(id);
                      setValues({});
                      setDomainTarget(null);
                      setError("");
                    }}
                  >
                    <SelectTrigger id={`${prefix}-workflow`} className="w-full">
                      <SelectValue placeholder={translate("mb900afa8e97c")} />
                    </SelectTrigger>
                    <SelectContent>
                      {choices.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {choice?.description}
                  </p>
                </Field>
                {choice?.inputs.map((field) => (
                  <RunInputField
                    key={field.name}
                    field={field}
                    id={`${prefix}-${field.name}`}
                    value={values[field.name]}
                    disabled={frozen}
                    onChange={(value) =>
                      setValues((v) => ({ ...v, [field.name]: value }))
                    }
                    onFile={(file) => void upload(field.name, file)}
                  >
                    {field.kind === "file" && moduleEnabled("files") && (
                      <ManagedFilePicker
                        orchestratorId={selected}
                        disabled={frozen}
                        onBusy={(busy) => setPhase(busy ? "upload" : "idle")}
                        onSelected={(id) =>
                          setValues((v) => ({ ...v, [field.name]: id }))
                        }
                      />
                    )}
                    {field.kind === "file" && values[field.name] && (
                      <p className="text-sm text-muted-foreground">
                        {translate("m3b785af06b03")}
                      </p>
                    )}
                  </RunInputField>
                ))}
                {choice?.requiresArtifact && (
                  <section
                    className="space-y-4"
                    aria-labelledby={`${prefix}-save-heading`}
                  >
                    <Separator />
                    <div>
                      <h2
                        id={`${prefix}-save-heading`}
                        className="font-semibold"
                      >
                        {translate("m600dd253a092")}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {translate("m15806ddb33a4")}
                      </p>
                    </div>
                    <RadioGroup
                      value={artifactMode}
                      onValueChange={setArtifactMode}
                      disabled={frozen}
                      aria-label={translate("m071149f031fd")}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <FieldLabel
                        htmlFor={`${prefix}-new`}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-accent/50"
                      >
                        <RadioGroupItem id={`${prefix}-new`} value="new" />
                        {translate("m9b7560405862")}
                      </FieldLabel>
                      <FieldLabel
                        htmlFor={`${prefix}-existing`}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-accent/50"
                      >
                        <RadioGroupItem
                          id={`${prefix}-existing`}
                          value="existing"
                          disabled={!artifacts.length}
                        />
                        {translate("m3f1e4c236b23")}
                      </FieldLabel>
                    </RadioGroup>
                    {artifactMode === "new" ? (
                      <Field className="space-y-2">
                        <FieldLabel htmlFor={`${prefix}-title`}>
                          {translate("m96ccf50319c0")}
                        </FieldLabel>
                        <Input
                          id={`${prefix}-title`}
                          name="artifactTitle"
                          autoComplete="off"
                          required
                          maxLength={100}
                          value={title}
                          placeholder={translate("m6ed7be7c4f6a")}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                          {translate("mdb47707c45f4")}
                        </p>
                      </Field>
                    ) : (
                      <Field className="space-y-2">
                        <FieldLabel htmlFor={`${prefix}-artifact-search`}>
                          {translate("mc71436cce0eb")}
                        </FieldLabel>
                        <Input
                          id={`${prefix}-artifact-search`}
                          disabled={artifactSearching}
                          value={artifactSearch}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              if (!artifactSearching) void findArtifacts();
                            }
                          }}
                          maxLength={100}
                          onChange={(e) => {
                            setArtifactSearch(e.target.value);
                            setArtifactNext(null);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={artifactSearching}
                          onClick={() => void findArtifacts()}
                        >
                          {translate("m49c266baaaa7")}
                        </Button>
                        {artifactNext && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={artifactSearching}
                            onClick={() => void findArtifacts(true)}
                          >
                            {translate("m17ef296818cd")}
                          </Button>
                        )}
                        <FieldLabel htmlFor={`${prefix}-artifact`}>
                          {translate("ma4a34f6cfd5c")}
                        </FieldLabel>
                        <Select
                          value={selectedArtifact}
                          disabled={frozen}
                          onValueChange={setSelectedArtifact}
                        >
                          <SelectTrigger
                            id={`${prefix}-artifact`}
                            className="w-full"
                          >
                            <SelectValue
                              placeholder={translate("m69e0720012f2")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {artifacts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {translate("ma5d75a4f4a56", {
                                  title: a.title,
                                  revision: a.revision,
                                })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {artifact && (
                          <p className="text-sm text-muted-foreground">
                            {translate("m9e691d2303d1")}{" "}
                            <Link
                              href={`/artifacts/${artifact.id}`}
                              className="underline underline-offset-4"
                            >
                              {artifact.title}
                            </Link>
                            .
                          </p>
                        )}
                      </Field>
                    )}
                    {!artifacts.length && (
                      <p className="text-sm text-muted-foreground">
                        {translate("me6b5a40f17cd")}
                      </p>
                    )}
                  </section>
                )}
              </fieldset>
            </CardContent>
          </Card>
          <Card className="min-w-0 lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle>
                <h2>{translate("m642a3c41d846")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <AnswererSelect
                personas={personas}
                value={answerer}
                onChange={setAnswerer}
                disabled={frozen}
              />
              <p className="text-sm text-muted-foreground">
                {persona
                  ? translate("m7fe8dfcc6b82", { name: persona.name })
                  : translate("m29cda917e844")}
              </p>
              <Separator />
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">
                    {translate("m2e2d5c5649b7")}
                  </dt>
                  <dd className="break-words font-medium">{choice?.name}</dd>
                </div>
                {choice?.requiresArtifact && (
                  <div>
                    <dt className="text-muted-foreground">
                      {translate("m1daa7df740ac")}
                    </dt>
                    <dd className="break-words font-medium">
                      {artifactMode === "new"
                        ? title.trim() || translate("mf14a9c499dfa")
                        : artifact?.title || translate("ma9dc34945059")}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">
                    {translate("m012bc7eea71e")}
                  </dt>
                  <dd className="font-medium">
                    {translate("m420376141061", { count: maximum })}
                  </dd>
                </div>
              </dl>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <PricingDescription pricing={pricing} />
                </p>
                {persona && (
                  <p>
                    {translate("m0f24fdc55588", {
                      calls: persona.maxCalls,
                      credits: persona.maximum,
                    })}
                  </p>
                )}
                <p>
                  {choice?.failureCharging === "verified-usage"
                    ? translate("mc6dda04924f2")
                    : translate("m2790bb24347a")}
                </p>
              </div>
              {!choice?.ready && (
                <Notice tone="warning" title={translate("m5ba6fd0ba107")} />
              )}
              {error && <Notice tone="error" title={error} />}
              {locked && !busy && (
                <p className="text-sm text-muted-foreground">
                  {translate("m4d0bdaa2f2b6")}
                </p>
              )}
              <SubmitButton
                pending={busy}
                disabled={!choice?.ready}
                className="h-auto w-full whitespace-normal py-3"
              >
                {phase === "artifact"
                  ? translate("md903c89eccc6")
                  : phase === "upload"
                    ? translate("m7cdfb59cd1d3")
                    : phase === "run"
                      ? translate("m3ffaa0a06314")
                      : locked
                        ? translate("m5ffcb43525ac")
                        : choice?.requiresArtifact && artifactMode === "new"
                          ? translate("mf6bc33eab003")
                          : translate("m0b01328f236c")}
              </SubmitButton>
            </CardContent>
          </Card>
        </form>
      )}
      {unfinished.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h2>{translate("m53845582bd6c")}</h2>
            </CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/runs">{translate("md79ea2fab3c7")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {unfinished.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="min-w-0 break-words font-medium">
                  {run.name}
                </span>
                <Badge variant="secondary">
                  <StateLabel value={run.status} />
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
