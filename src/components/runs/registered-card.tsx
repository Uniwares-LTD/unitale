"use client";
import { StateLabel } from "@/components/localized-value";

import { useTranslations } from "next-intl";

import { useId, useState, type ComponentType } from "react";
import { ResultImage } from "@/components/media-fallback";
import { createRegistry, type RegisteredValue } from "@/lib/runs/registry";
import {
  cardRegistry,
  parseCard,
  questionSchema,
  formCardSchema,
  summaryCardSchema,
  galleryCardSchema,
  progressCardSchema,
  issueCardSchema,
  type SavedCard,
  type CardAction,
} from "@/lib/runs/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/page-patterns";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CardBodyProps = {
  rawResponse?: boolean;
  content: RegisteredValue;
  disabled: boolean;
  respond: (action: CardAction, value: RegisteredValue["data"]) => void;
  allowedAssetIds: string[];
};
function QuestionBody({
  content,
  disabled,
  respond,
  rawResponse,
}: CardBodyProps) {
  const translate = useTranslations("ui");

  const data = questionSchema.parse(content.data);
  return (
    <FormBody
      rawResponse={rawResponse}
      content={{
        type: "form",
        version: 1,
        data: {
          title: data.title,
          explanation: data.explanation,
          fields: [
            data.kind === "text"
              ? {
                  id: "answer",
                  kind: "text",
                  label: translate("md0e869b777a6"),
                  required: true,
                  multiline: true,
                  maxLength: 4000,
                }
              : {
                  id: "answer",
                  kind: "choice",
                  label: translate("md0e869b777a6"),
                  required: true,
                  multiple: data.kind === "multiple",
                  options: data.options,
                },
          ],
        },
      }}
      disabled={disabled}
      allowedAssetIds={[]}
      respond={(_action, value) =>
        respond(
          "submit",
          (value as Record<string, RegisteredValue["data"]>).answer,
        )
      }
    />
  );
}
function FormBody({ content, disabled, respond, rawResponse }: CardBodyProps) {
  const translate = useTranslations("ui");

  const form = formCardSchema.parse(content.data);
  const prefix = useId();
  const [values, setValues] = useState<
    Record<string, string | number | boolean | string[]>
  >({});
  const [error, setError] = useState("");
  const change = (id: string, value: string | number | boolean | string[]) =>
    setValues((old) => ({ ...old, [id]: value }));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          const parsed = cardRegistry
            .get("form", 1)
            .response(form, "submit", values);
          respond("submit", rawResponse ? values : parsed);
        } catch (e) {
          setError(e instanceof Error ? e.message : translate("m94391b48e270"));
        }
      }}
    >
      {form.explanation && (
        <p className="text-sm text-muted-foreground">{form.explanation}</p>
      )}
      {form.fields.map((field) => {
        const id = `${prefix}-${field.id}`;
        if (field.kind === "toggle")
          return (
            <div key={field.id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                disabled={disabled}
                checked={values[field.id] === true}
                onCheckedChange={(value) => change(field.id, value === true)}
              />
              <FieldLabel htmlFor={id}>
                {field.label}
                {field.required ? " (required)" : ""}
              </FieldLabel>
            </div>
          );
        if (field.kind === "choice") {
          const selected = Array.isArray(values[field.id])
            ? (values[field.id] as string[])
            : [values[field.id]];
          return (
            <FieldSet key={field.id} disabled={disabled} className="space-y-2">
              <FieldLegend className="text-sm font-medium">
                {field.label}
                {field.required ? " (required)" : ""}
              </FieldLegend>
              <p className="text-xs text-muted-foreground">
                {field.multiple
                  ? translate("m97169869b5b3")
                  : translate("m0b24aed53ab6")}
              </p>
              <div className="flex flex-wrap gap-2">
                {field.options.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    variant={
                      selected.includes(option.id) ? "secondary" : "outline"
                    }
                    aria-pressed={selected.includes(option.id)}
                    disabled={disabled}
                    onClick={() =>
                      change(
                        field.id,
                        field.multiple
                          ? selected.includes(option.id)
                            ? selected.filter(
                                (id): id is string =>
                                  typeof id === "string" && id !== option.id,
                              )
                            : [
                                ...selected.filter(
                                  (id): id is string => typeof id === "string",
                                ),
                                option.id,
                              ]
                          : option.id,
                      )
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </FieldSet>
          );
        }
        return (
          <Field key={field.id}>
            <FieldLabel htmlFor={id}>
              {field.label}
              {field.required ? " (required)" : ""}
            </FieldLabel>
            {field.kind === "text" && field.multiline ? (
              <Textarea
                id={id}
                disabled={disabled}
                value={String(values[field.id] ?? "")}
                onChange={(e) => change(field.id, e.target.value)}
                maxLength={field.maxLength}
                required={field.required}
              />
            ) : (
              <Input
                id={id}
                disabled={disabled}
                type={field.kind === "number" ? "number" : "text"}
                value={String(values[field.id] ?? "")}
                onChange={(e) =>
                  change(
                    field.id,
                    field.kind === "number" && e.target.value !== ""
                      ? e.target.valueAsNumber
                      : e.target.value,
                  )
                }
                required={field.required}
                {...(field.kind === "number"
                  ? { min: field.min, max: field.max, step: "any" }
                  : { maxLength: field.maxLength })}
              />
            )}
          </Field>
        );
      })}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <SubmitButton pending={false} disabled={disabled}>
        {translate("mf83d508047c9")}
      </SubmitButton>
    </form>
  );
}
function SummaryBody({ content, disabled, respond }: CardBodyProps) {
  const translate = useTranslations("ui");

  const data = summaryCardSchema.parse(content.data);
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap break-words">{data.body}</p>
      <Button
        disabled={disabled}
        variant="outline"
        onClick={() => respond("acknowledge", null)}
      >
        {translate("mf9236d9e87b6")}
      </Button>
    </div>
  );
}
function GalleryBody({
  content,
  disabled,
  respond,
  allowedAssetIds,
}: CardBodyProps) {
  const translate = useTranslations("ui");

  const data = galleryCardSchema.parse(content.data);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.items.map((item) => (
        <div key={item.assetId} className="space-y-2 rounded-md border p-3">
          {allowedAssetIds.includes(item.assetId) ? (
            <ResultImage
              aspectRatio="4 / 3"
              unoptimized
              src={`/api/run-assets/${item.assetId}?size=thumb`}
              width={400}
              height={300}
              alt={item.label}
              className="h-48 w-full rounded-md object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {translate("m8d25d2b1ce81")}
            </p>
          )}
          <p>{item.label}</p>
          <Button
            disabled={disabled || !allowedAssetIds.includes(item.assetId)}
            variant="outline"
            onClick={() => respond("choose", item.assetId)}
          >
            {translate("mc7f937836f5d")} {item.label}
          </Button>
        </div>
      ))}
    </div>
  );
}
function ProgressBody({ content }: CardBodyProps) {
  const data = progressCardSchema.parse(content.data);
  return (
    <div role="status" className="space-y-2">
      <p>
        {data.label} · {data.completed} / {data.total}
      </p>
      <Progress
        value={(data.completed / data.total) * 100}
        aria-label={data.title}
      />
    </div>
  );
}
function IssueBody({ content, disabled, respond }: CardBodyProps) {
  const translate = useTranslations("ui");

  const data = issueCardSchema.parse(content.data);
  return (
    <div className="space-y-3">
      <Badge
        variant={data.severity === "blocking" ? "destructive" : "secondary"}
      >
        <StateLabel value={data.severity} />
      </Badge>
      <ul className="list-disc space-y-1 ps-5">
        {data.details.map((detail, i) => (
          <li key={i}>{detail}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {translate("me289c76a8970")}
      </p>
      <Button
        disabled={disabled}
        variant="outline"
        onClick={() => respond("acknowledge", null)}
      >
        {translate("mf9236d9e87b6")}
      </Button>
    </div>
  );
}
// Product UI extensions register components here; they never modify the Runs
// layout or execute code provided by a model. Contracts live in the shared registry.
export const cardRenderers = createRegistry<{
  type: string;
  version: number;
  component: ComponentType<CardBodyProps>;
}>([
  { type: "question", version: 1, component: QuestionBody },
  { type: "form", version: 1, component: FormBody },
  { type: "summary", version: 1, component: SummaryBody },
  { type: "gallery", version: 1, component: GalleryBody },
  { type: "progress", version: 1, component: ProgressBody },
  { type: "issue", version: 1, component: IssueBody },
]);
export function RegisteredCard({
  rawResponse = false,
  card,
  disabled,
  onRespond,
  allowedAssetIds = [],
}: {
  rawResponse?: boolean;
  card: SavedCard;
  disabled: boolean;
  allowedAssetIds?: string[];
  onRespond: (action: CardAction, value: RegisteredValue["data"]) => void;
}) {
  const translate = useTranslations("ui");

  let content: RegisteredValue;
  let Component: ComponentType<CardBodyProps>;
  try {
    content = parseCard(card.content);
    Component = cardRenderers.get(content.type, content.version).component;
  } catch {
    return (
      <p role="status" className="rounded-md border p-3">
        {translate("m1b069b7cfe37")}
      </p>
    );
  }
  const title =
    typeof content.data === "object" &&
    content.data !== null &&
    "title" in content.data
      ? String(content.data.title)
      : translate("m857d0d542784");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {cardRegistry.get(content.type, content.version).label}
          {cardRegistry.get(content.type, content.version).actions.length > 0
            ? ` · ${card.status}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {card.status === "active" ? (
          <Component
            rawResponse={rawResponse}
            content={content}
            disabled={disabled}
            respond={onRespond}
            allowedAssetIds={allowedAssetIds}
          />
        ) : (
          <>
            <p className="text-sm">
              {translate("mfc56c76f0422")} {card.responseAction}
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
              {JSON.stringify(card.response, null, 2)}
            </pre>
          </>
        )}
      </CardContent>
    </Card>
  );
}
