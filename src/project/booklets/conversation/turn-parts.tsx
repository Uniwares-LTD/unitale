"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ResultImage } from "@/components/media-fallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MilestoneDivider } from "@/project/components/conversation/messages";
import type { BookletReply, BookletTurn, BookletTurnPart } from "../turn-contract";

export const assetUrl = (productionId: string, assetId: string) =>
  `/api/booklets/${encodeURIComponent(productionId)}/assets/${encodeURIComponent(assetId)}`;

const prose = "text-reading whitespace-pre-line [overflow-wrap:anywhere]";
// The role's weight replaces CardTitle's own font-medium.
const cardTitle =
  "font-heading text-card-title font-(number:--text-card-title--font-weight)";

// Non-interactive parts render in the history in the Manager's order. The one
// interactive part (question, styles or approval) is rendered by the dock while
// open; once answered, only its prompt stays in the history.
export function TurnParts({
  productionId,
  turn,
  answered,
}: {
  productionId: string;
  turn: BookletTurn;
  answered: boolean;
}) {
  return (
    <div className="space-y-4">
      {turn.parts.map((part, index) => (
        <Part key={index} productionId={productionId} part={part} answered={answered} />
      ))}
    </div>
  );
}

function Part({
  productionId,
  part,
  answered,
}: {
  productionId: string;
  part: BookletTurnPart;
  answered: boolean;
}) {
  switch (part.type) {
    case "prose":
      return <p dir="auto" className={prose}>{part.text}</p>;
    case "milestone":
      return <MilestoneDivider label={part.label} />;
    case "overview":
      return (
        <Card>
          <CardHeader>
            <CardTitle dir="auto" className={cardTitle}>
              {part.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              {part.facts.map((fact, index) => (
                <div key={index} className="contents">
                  <dt dir="auto" className="text-body text-muted-foreground">{fact.label}</dt>
                  <dd dir="auto" className="text-body [overflow-wrap:anywhere]">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      );
    case "synopsis":
      return (
        <Card>
          <CardHeader>
            <CardTitle dir="auto" className={cardTitle}>
              {part.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p dir="auto" className={prose}>{part.body}</p>
          </CardContent>
        </Card>
      );
    case "character":
    case "location":
      return (
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            {part.assetId && (
              <ResultImage
                unoptimized
                src={assetUrl(productionId, part.assetId)}
                width={320}
                height={320}
                aspectRatio="1 / 1"
                alt={part.name}
                className="rounded-(--x-unitale-radius-media)"
              />
            )}
            <div className={part.assetId ? undefined : "sm:col-span-2"}>
              <CardTitle dir="auto" className={cardTitle}>
                {part.name}
              </CardTitle>
              <p dir="auto" className={`mt-2 ${prose}`}>{part.description}</p>
            </div>
          </CardContent>
        </Card>
      );
    case "image":
      return (
        <ResultImage
          unoptimized
          src={assetUrl(productionId, part.assetId)}
          width={640}
          height={640}
          aspectRatio="1 / 1"
          alt={part.alt}
          className="max-w-md rounded-(--x-unitale-radius-media)"
        />
      );
    case "question":
    case "styles":
      return answered ? <p dir="auto" className={`${prose} font-medium`}>{part.prompt}</p> : null;
    case "approval":
      return null;
  }
}

/** The owner's reply as shown in the history (labels, not option IDs). */
export function ReplyText({ turn, reply }: { turn: BookletTurn; reply: BookletReply }) {
  const t = useTranslations("ui");
  const format = useFormatter();
  const interactive = turn.parts.find(
    (p) => p.type === "question" || p.type === "styles" || p.type === "approval",
  );
  // Manager content inside a translated sentence keeps its own direction.
  const subject = "\u2068" + (interactive?.type === "approval" ? interactive.subject : "") + "\u2069";
  if (reply.kind === "approve") return t("mcbb451a07423", { subject });
  if (reply.kind === "changes")
    return (
      <>
        <span className="mb-1 block text-caption text-muted-foreground">
          {t("mf63615fc3c6f", { subject })}
        </span>
        <span dir="auto">{reply.text}</span>
      </>
    );
  const options =
    interactive?.type === "question" || interactive?.type === "styles"
      ? interactive.options
      : [];
  // Locale list formatting; labels are Manager content, never joined by hand.
  return format.list(
    [
      ...reply.choices.map((id) => options.find((o) => o.id === id)?.label ?? id),
      ...(reply.text ? [reply.text] : []),
    ],
    { type: "unit" },
  );
}
