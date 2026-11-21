"use client";
import { ProjectRunDetail } from "@/project/run-detail";
import {
  CurrencyLabel,
  DateLabel,
  StateLabel,
} from "@/components/localized-value";

import { useFormatter, useTranslations } from "next-intl";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ResultImage } from "@/components/media-fallback";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { PricingDescription } from "@/components/pricing-description";
import { cardRegistry, type SavedCard } from "@/lib/runs/cards";
import {
  activeRunStatuses,
  terminalRunStatuses,
  uiPayloadSchema,
} from "@/lib/contracts/runs";
import { maximumCredits } from "@/lib/config/ai-pricing";
import { Notice } from "@/components/page-patterns";
import { RegisteredCard } from "./registered-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { runDetail } from "@/lib/server/runs/service";

import { AnswererSelect } from "./answerer-select";
import { RunInputField } from "./dynamic-field";
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
} from "@/components/ui/alert-dialog";

type Detail = Awaited<ReturnType<typeof runDetail>>;
const responseSchema = z.object({ id: z.string() });
function message(
  error: unknown,
  translate: ReturnType<typeof useTranslations<"ui">>,
) {
  return error instanceof ApiError ? error.message : translate("m96f22b8e7ee5");
}
// Human-input variables have no label of their own; show "due_date" as "Due date".
function fieldLabel(name: string) {
  const text = name.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function answerText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(answerText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function savedCard(
  card: z.infer<typeof uiPayloadSchema>["cards"][number],
  response: unknown,
): SavedCard {
  return {
    id: card.id,
    content: card.content,
    status: "active",
    response:
      response === undefined ? null : (response as SavedCard["response"]),
    responseAction: null,
    createdAt: "",
    answeredAt: null,
    sourceJobId: null,
  };
}
function Decision({
  decision,
  runId,
  attemptId,
  cancelRequested,
  refresh,
}: {
  decision: Detail["decisions"][number];
  runId: string;
  attemptId: string;
  cancelRequested: boolean;
  refresh: () => void;
}) {
  const translate = useTranslations("ui");

  const prefix = useId();
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    "defaults" in decision ? (decision.defaults ?? {}) : {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const parsed = uiPayloadSchema.safeParse({
    version: 1,
    cards: decision.cards,
  });
  const cards = parsed.success ? parsed.data.cards : [];
  const active = decision.status === "pending" && !cancelRequested;
  const raw = "responseMode" in decision && decision.responseMode === "raw-v1";
  async function submit(action: string) {
    setError("");
    setBusy(true);
    try {
      await api(
        `/api/runs/${runId}/decisions/${decision.id}`,
        z.object({ status: z.string() }),
        {
          method: "POST",
          body: {
            key,
            action,
            ...(raw
              ? { response: cards.length ? answers : (answers.response ?? "") }
              : { answers }),
          },
        },
      );
      refresh();
    } catch (e) {
      setError(message(e, translate));
    } finally {
      setBusy(false);
    }
  }
  async function upload(name: string, files: FileList) {
    setError("");
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("attemptId", attemptId);
        form.set("key", crypto.randomUUID());
        form.set("file", file);
        const result = await api(
          `/api/runs/${runId}/uploads`,
          z.object({ id: z.string(), status: z.string() }),
          { method: "POST", body: form, timeoutMs: 120000 },
        );
        if (result.status !== "ready") throw new Error();
        ids.push(result.id);
      }
      const field = decision.inputs.find(
        (f) => f.output_variable_name === name,
      );
      setAnswers((v) => ({
        ...v,
        [name]: field?.type === "file-list" ? ids : ids[0],
      }));
    } catch (e) {
      setError(message(e, translate));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{decision.title}</CardTitle>
        <Badge>
          <StateLabel value={decision.status} />
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {"error" in decision && decision.error && (
          <Notice tone="warning" title={decision.error} />
        )}
        {"automaticError" in decision && decision.automaticError && (
          <Notice tone="warning" title={decision.automaticError} />
        )}
        {"answerSource" in decision && decision.answerSource && (
          <p className="text-sm text-muted-foreground">
            {decision.answerSource.type === "persona"
              ? translate("m7d27a307d119", {
                  revision: decision.answerSource.personaRevision ?? "",
                })
              : translate("mac408f9af0dc")}
          </p>
        )}
        {"description" in decision && (
          <p className="whitespace-pre-wrap">{decision.description}</p>
        )}
        {cards.map((card) => (
          <div key={card.id}>
            <RegisteredCard
              rawResponse={raw}
              card={savedCard(card, answers[card.id])}
              disabled={busy || !active}
              allowedAssetIds={cardRegistry
                .get(card.content.type, card.content.version)
                .assets(card.content.data)}
              onRespond={(_action, value) =>
                setAnswers((v) => ({ ...v, [card.id]: value }))
              }
            />
            {card.id in answers && (
              <p role="status">{translate("m66127c4a57df")}</p>
            )}
          </div>
        ))}
        {!cards.length &&
          decision.inputs.map((field) => (
            <div key={field.output_variable_name} className="space-y-2">
              <Label htmlFor={`${prefix}-${field.output_variable_name}`}>
                {fieldLabel(field.output_variable_name)}
              </Label>
              {field.type === "select" ? (
                <Select
                  disabled={!active || busy}
                  value={String(answers[field.output_variable_name] ?? "")}
                  onValueChange={(value) =>
                    setAnswers((v) => ({
                      ...v,
                      [field.output_variable_name]: value,
                    }))
                  }
                >
                  <SelectTrigger id={`${prefix}-${field.output_variable_name}`}>
                    <SelectValue placeholder={translate("mc7f937836f5d")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options ?? field.option_source?.value ?? []).map(
                      (option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              ) : field.type === "paragraph" ? (
                <Textarea
                  id={`${prefix}-${field.output_variable_name}`}
                  disabled={!active || busy}
                  value={String(
                    answers[field.output_variable_name] ??
                      ("defaults" in decision
                        ? decision.defaults?.[field.output_variable_name]
                        : "") ??
                      "",
                  )}
                  onChange={(e) =>
                    setAnswers((v) => ({
                      ...v,
                      [field.output_variable_name]: e.target.value,
                    }))
                  }
                />
              ) : (
                <Input
                  id={`${prefix}-${field.output_variable_name}`}
                  type="file"
                  multiple={field.type === "file-list"}
                  disabled={!active || busy}
                  onChange={(e) => {
                    if (e.target.files)
                      void upload(field.output_variable_name, e.target.files);
                  }}
                />
              )}
            </div>
          ))}
        {active && (
          <div className="flex flex-wrap gap-2">
            {decision.actions.map((action) => (
              <Button
                key={action.id}
                disabled={
                  busy ||
                  cards.some(
                    (c) =>
                      cardRegistry.get(c.content.type, c.content.version)
                        .actions.length && !(c.id in answers),
                  )
                }
                onClick={() => void submit(action.id)}
              >
                {action.title}
              </Button>
            ))}
          </div>
        )}
        {!active && "answers" in decision && decision.answers && (
          <dl className="space-y-2 text-sm">
            {Object.entries(decision.answers as Record<string, unknown>).map(
              ([name, value]) => (
                <div key={name}>
                  <dt className="text-muted-foreground">{fieldLabel(name)}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {answerText(value) || translate("m2afe0daa0861")}
                  </dd>
                </div>
              ),
            )}
          </dl>
        )}
        {error && <Notice tone="error" title={error} />}
      </CardContent>
    </Card>
  );
}
export function RunDetail({ initial }: { initial: Detail }) {
  const translate = useTranslations("ui");
  const format = useFormatter();
  const common = useTranslations("common");

  const [data, setData] = useState(initial);
  const [readError, setReadError] = useState("");
  const [pages, setPages] = useState<Record<string, string>>({});
  const pageQuery = new URLSearchParams(pages).toString();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restartInputs, setRestartInputs] = useState(
    initial.attempts.at(-1)!.inputs,
  );
  const current = data.attempts.at(-1)!;
  const [restartAnswerer, setRestartAnswerer] = useState("user");
  const selectedPersona = data.personas.find((p) => p.id === restartAnswerer);
  const restartPricing = data.configuration?.pricing ?? {
    mode: "fixed" as const,
    credits: 1,
  };
  async function refresh() {
    setRefreshing(true);
    try {
      const result = await api(
        `/api/runs/${data.id}?${pageQuery}`,
        z.custom<Detail>(),
      );
      setData(result);
      setReadError("");
    } catch (e) {
      setReadError(message(e, translate));
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const next = await api(
          `/api/runs/${initial.id}?${pageQuery}`,
          z.custom<Detail>(),
          {
            signal: controller.signal,
          },
        );
        if (!stopped) {
          setData(next);
          setReadError("");
        }
      } catch (e) {
        if (!stopped) setReadError(message(e, translate));
      }
      if (!stopped)
        timer = setTimeout(() => void poll(), initial.pollSeconds * 1000);
    }
    void poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [initial.id, initial.pollSeconds, pageQuery, translate]);
  async function command(
    action:
      | "cancel"
      | "restart"
      | "recover"
      | "test-stage"
      | "take-over"
      | "retry-application",
    stage?: string,
  ) {
    setError("");
    setBusy(true);
    try {
      await api(`/api/runs/${data.id}`, responseSchema, {
        method: "POST",
        body: {
          key: crypto.randomUUID(),
          action,
          attemptId: current.id,
          ...(action !== "cancel"
            ? {
                configurationKey: data.configuration?.configurationKey,
                inputs: restartInputs,
              }
            : {}),
          answerer: selectedPersona
            ? {
                type: "persona",
                id: selectedPersona.id,
                revision: selectedPersona.revision,
                configurationKey: selectedPersona.configurationKey,
              }
            : { type: "user" },
          ...(stage ? { stage } : {}),
        },
      });
      await refresh();
    } catch (e) {
      setError(message(e, translate));
    } finally {
      setBusy(false);
    }
  }
  async function uploadRestart(name: string, file: File) {
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("orchestratorId", data.configuration!.id);
      form.set("key", crypto.randomUUID());
      form.set("file", file);
      const saved = await api(
        "/api/run-uploads",
        z.object({ id: z.string(), status: z.string() }),
        { method: "POST", body: form, timeoutMs: 120000 },
      );
      if (saved.status !== "ready") throw new Error();
      setRestartInputs((v) => ({ ...v, [name]: saved.id }));
    } catch (e) {
      setError(message(e, translate));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <ProjectRunDetail data={data} refresh={refresh} />
      <div className="flex flex-wrap items-center gap-3">
        <Badge>
          <StateLabel value={data.status} />
        </Badge>
        <p>
          {current.chargedCredits === null
            ? translate("mcbc2c3aa78b8", {
                number: current.number,
                seconds: current.elapsedSeconds,
                credits: current.credits,
              })
            : translate("m9a18dae00f69", {
                number: current.number,
                seconds: current.elapsedSeconds,
                credits: current.chargedCredits,
              })}
        </p>
        <Button
          variant="outline"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? translate("mdeb3d3cea7fa") : translate("m0e9161011702")}
        </Button>
        {activeRunStatuses.includes(data.status) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={busy || current.cancelRequested}
              >
                {current.cancelRequested
                  ? translate("mab1da702bdb4")
                  : translate("m56bccd9d49b0")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {translate("m885030d80baf")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {translate("mdf3be7427abf")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {translate("m00099c7194db")}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void command("cancel")}
                >
                  {translate("m56bccd9d49b0")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {current.answerer && (
        <div className="space-y-2">
          <p>
            {current.takenOver
              ? translate("m6ef59ce56d3d")
              : translate("m824e561989c5", {
                  name: current.answerer.name,
                  revision: current.answerer.revision,
                })}
          </p>
          {!current.takenOver && activeRunStatuses.includes(data.status) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void command("take-over")}
            >
              {translate("m66abfef02cd8")}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {current.parentCharge === null
              ? translate("m03933c64d12f", {
                  persona: current.responderCharge,
                })
              : translate("m56a439f6713c", {
                  main: current.parentCharge,
                  persona: current.responderCharge,
                })}
          </p>
        </div>
      )}
      {current.application && (
        <div className="flex flex-wrap items-center gap-3">
          <span>{translate("me8d51a5ad1cd")}</span>
          <Badge variant="outline">
            <StateLabel value={current.application} />
          </Badge>
          {current.application === "failed" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void command("retry-application")}
            >
              {translate("me4a8905b1395")}
            </Button>
          )}
        </div>
      )}
      {current.artifactId && (
        <Link className="underline" href={`/artifacts/${current.artifactId}`}>
          {translate("m5c2d5c2c1036")}
        </Link>
      )}
      {data.responders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{translate("m7ccd4bca1a1d")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.responders.map((r) => (
              <p key={r.id}>
                <StateLabel value={r.status} /> ·{" "}
                {translate("md274fdd8b592", {
                  tokens: r.totalTokens ?? common("unknown"),
                })}{" "}
                ·{" "}
                {r.settledCredits === null
                  ? common("settlementPending")
                  : common("settled", { count: r.settledCredits })}
                {r.cost && (
                  <>
                    {" "}
                    ·{" "}
                    <CurrencyLabel
                      amount={r.cost.amount}
                      currency={r.cost.currency}
                    />
                  </>
                )}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      {(error || readError) && (
        <Notice tone="error" title={error || readError} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{translate("m69e561abfb58")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.events
            .filter((e) => e.event.type === "stage")
            .map((e) => (
              <p key={e.id}>
                {e.event.title} · <StateLabel value={e.event.status} />
                {e.event.elapsedMs != null && (
                  <>
                    {" "}
                    ·{" "}
                    {translate("m7d53c10ba2b5", {
                      seconds: format.number(e.event.elapsedMs / 1000, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </>
                )}
              </p>
            ))}
          {!data.events.some((e) => e.event.type === "stage") && (
            <p className="text-muted-foreground">
              {terminalRunStatuses.includes(current.status)
                ? translate("m9f173522b4e5")
                : translate("m0cf47511f846")}
            </p>
          )}
        </CardContent>
      </Card>
      {data.decisions.map((decision) => (
        <Decision
          key={decision.id}
          decision={decision}
          cancelRequested={current.cancelRequested}
          runId={data.id}
          attemptId={
            ("attemptId" in decision ? decision.attemptId : undefined) ??
            current.id
          }
          refresh={() => void refresh()}
        />
      ))}
      <nav
        aria-label={translate("mde427024aac2")}
        className="flex flex-wrap gap-2"
      >
        {(
          [
            ["actionable", data.actionable.next, translate("mb45e85e04627")],
            [
              "decisions",
              data.decisionHistory.next,
              translate("m5f487fd06eb2"),
            ],
            ["events", data.eventHistory.next, translate("m672bb0139b65")],
          ] as const
        ).map(
          ([kind, next, label]) =>
            next && (
              <Button
                key={kind}
                variant="outline"
                onClick={() => setPages((p) => ({ ...p, [kind]: next }))}
              >
                {label}
              </Button>
            ),
        )}
        {Object.keys(pages).length > 0 && (
          <Button variant="outline" onClick={() => setPages({})}>
            {translate("m58515cdc3981")}
          </Button>
        )}
      </nav>
      {data.attempts.map((attempt) => (
        <Card key={attempt.id}>
          <CardHeader>
            <CardTitle>
              {translate("mc934cc71493d", { number: attempt.number })}
            </CardTitle>
            <Badge>
              <StateLabel value={attempt.status} />
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <DateLabel value={attempt.createdAt} />
            </p>
            {attempt.failure && (
              <p role="alert" className="break-words text-destructive">
                {attempt.failure}
              </p>
            )}
            {attempt.result && (
              <>
                <p className="whitespace-pre-wrap break-words">
                  {attempt.result.text}
                </p>
                {attempt.result.failure && (
                  <Notice tone="warning" title={attempt.result.failure} />
                )}
                {attempt.result.images.map(
                  (image: { id: string; name: string }) => (
                    // The preview opens the full-resolution original.
                    <a
                      key={image.id}
                      href={`/api/run-assets/${image.id}`}
                      target="_blank"
                      rel="noopener"
                      className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <ResultImage
                        aspectRatio="3 / 2"
                        unoptimized
                        src={`/api/run-assets/${image.id}?size=preview`}
                        width={600}
                        height={400}
                        alt={image.name}
                        className="max-h-96 w-full object-contain"
                      />
                      <span className="sr-only">
                        {translate("m1d1833565142")}
                      </span>
                    </a>
                  ),
                )}
                {attempt.result.cards.map(
                  (card: z.infer<typeof uiPayloadSchema>["cards"][number]) => (
                    <RegisteredCard
                      key={card.id}
                      card={savedCard(card, null)}
                      disabled
                      allowedAssetIds={cardRegistry
                        .get(card.content.type, card.content.version)
                        .assets(card.content.data)}
                      onRespond={() => {}}
                    />
                  ),
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
      {data.canRestart && data.configuration && (
        <Card>
          <CardHeader>
            <CardTitle>{translate("m8928ee03f0a7")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AnswererSelect
              personas={data.personas}
              value={restartAnswerer}
              onChange={setRestartAnswerer}
            />
            {selectedPersona && (
              <p className="text-sm text-muted-foreground">
                {translate("m02f69969e239", {
                  calls: selectedPersona.maxCalls,
                  credits: selectedPersona.maximum,
                })}
              </p>
            )}
            {data.configuration.inputs.map((field) => (
              <RunInputField
                key={field.name}
                field={field}
                id={`restart-${field.name}`}
                value={restartInputs[field.name] as string | number | undefined}
                onChange={(value) =>
                  setRestartInputs((v) => ({ ...v, [field.name]: value }))
                }
                onFile={(file) => void uploadRestart(field.name, file)}
              />
            ))}
            <p className="text-sm text-muted-foreground">
              <PricingDescription pricing={restartPricing} />
            </p>
            <p className="text-sm text-muted-foreground">
              {data.configuration.failureCharging === "verified-usage"
                ? translate("m5d401b01fc4f")
                : translate("m2790bb24347a")}
            </p>
            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy || !data.configuration.ready}>
                    {translate("md07c9916a5c9")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {translate("mbbddb3abf8e9")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {translate("m97bd1795b8bf", {
                        credits:
                          maximumCredits(restartPricing) +
                          (selectedPersona?.maximum ?? 0),
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {translate("m19766ed6ccb2")}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => void command("restart")}>
                      {translate("md07c9916a5c9")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {data.isAdmin &&
                data.configuration.recovery?.diagnostic &&
                data.configuration.recovery.stages.map((stage) => (
                  <Button
                    key={stage}
                    variant="outline"
                    disabled={busy}
                    onClick={() => void command("test-stage", stage)}
                  >
                    {translate("mc5609a1c3ba7", { stage })}
                  </Button>
                ))}
              {current.result?.checkpoint &&
                data.configuration.recovery?.version ===
                  current.result.checkpoint.version && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void command("recover", current.result.checkpoint.stage)
                    }
                  >
                    {translate("m65e466bf2710")}
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
