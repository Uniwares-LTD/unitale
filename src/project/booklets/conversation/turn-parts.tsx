"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MilestoneDivider } from "@/project/components/conversation/messages";
import {
  ArtworkViewer,
  type ArtworkLabels,
} from "@/project/components/conversation/artwork-viewer";
import { wordGroups } from "@/project/components/conversation/prose-reveal";
import type {
  BookletReply,
  BookletTurn,
  BookletTurnPart,
} from "../turn-contract";

export const assetUrl = (productionId: string, assetId: string) =>
  `/api/booklets/${encodeURIComponent(productionId)}/assets/${encodeURIComponent(assetId)}`;

const prose = "text-body whitespace-pre-line [overflow-wrap:anywhere]";
const reviewCard = "gap-3 bg-muted/20 shadow-none ring-0";
// The role's weight replaces CardTitle's own font-medium.
const cardTitle =
  "font-heading text-card-title font-(number:--text-card-title--font-weight)";

export function useBookArtworkLabels(): ArtworkLabels {
  const t = useTranslations("ui");
  return {
    open: t("mb04fcdfc3287"),
    zoomIn: t("m0e47f09a748f"),
    zoomOut: t("mbc7b631a689b"),
  };
}

// Non-interactive parts render in the history in the Manager's order. The one
// interactive part (question, styles or approval) is rendered by the dock while
// open; once answered, only its prompt stays in the history.
export function TurnParts({
  productionId,
  turn,
  answered,
  revealCount,
}: {
  productionId: string;
  turn: BookletTurn;
  answered: boolean;
  revealCount?: number;
}) {
  const artwork = useBookArtworkLabels();
  let remaining = revealCount;
  const rendered: ReactNode[] = [];
  for (const [index, part] of turn.parts.entries()) {
    if (part.type === "prose" && remaining !== undefined) {
      const groups = wordGroups(part.text);
      const visible = groups.slice(0, remaining).join("");
      remaining = Math.max(0, remaining - groups.length);
      if (visible)
        rendered.push(
          <p key={index} dir="auto" aria-hidden="true" className={prose}>
            {visible}
          </p>,
        );
      continue;
    }
    rendered.push(
      <Part
        key={index}
        productionId={productionId}
        part={part}
        answered={answered}
        artwork={artwork}
      />,
    );
  }
  return <div className="space-y-4">{rendered}</div>;
}

function Part({
  productionId,
  part,
  answered,
  artwork,
}: {
  productionId: string;
  part: BookletTurnPart;
  answered: boolean;
  artwork: ArtworkLabels;
}) {
  switch (part.type) {
    case "prose":
      return (
        <p dir="auto" className={prose}>
          {part.text}
        </p>
      );
    case "milestone":
      return <MilestoneDivider label={part.label} />;
    case "overview":
      return (
        <Card className={reviewCard}>
          <CardHeader>
            <CardTitle dir="auto" className={cardTitle}>
              {part.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
              {part.facts.map((fact, index) => (
                <div key={index} className="contents">
                  <dt dir="auto" className="text-body text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd dir="auto" className="text-body [overflow-wrap:anywhere]">
                    <ReplyValue value={fact.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      );
    case "synopsis":
      return (
        <Card className={reviewCard}>
          <CardHeader>
            <CardTitle dir="auto" className={cardTitle}>
              {part.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p dir="auto" className={prose}>
              {part.body}
            </p>
          </CardContent>
        </Card>
      );
    case "character":
    case "location":
      return (
        <Card className={reviewCard}>
          <CardContent className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            {part.assetId && (
              <ArtworkViewer
                image={{
                  src: assetUrl(productionId, part.assetId),
                  alt: part.name,
                  width: 320,
                  height: 320,
                }}
                labels={artwork}
              />
            )}
            <div className={part.assetId ? undefined : "sm:col-span-2"}>
              <CardTitle dir="auto" className={cardTitle}>
                {part.name}
              </CardTitle>
              <p dir="auto" className={`mt-2 ${prose}`}>
                {part.description}
              </p>
            </div>
          </CardContent>
        </Card>
      );
    case "image":
      return (
        <ArtworkViewer
          image={{
            src: assetUrl(productionId, part.assetId),
            alt: part.alt,
            width: 640,
            height: 640,
          }}
          labels={artwork}
          className="max-w-md"
        />
      );
    case "question":
    case "styles":
      return answered ? (
        <p dir="auto" className={`${prose} font-medium`}>
          {part.prompt}
        </p>
      ) : null;
    case "approval":
      return null;
  }
}

/** The owner's reply as shown in the history (labels, not option IDs). */
export function ReplyText({
  turn,
  reply,
}: {
  turn: BookletTurn;
  reply: BookletReply;
}) {
  const t = useTranslations("ui");
  const format = useFormatter();
  const interactive = turn.parts.find(
    (p) =>
      p.type === "question" || p.type === "styles" || p.type === "approval",
  );
  // Manager content inside a translated sentence keeps its own direction.
  const subject =
    "\u2068" +
    (interactive?.type === "approval" ? interactive.subject : "") +
    "\u2069";
  if (reply.kind === "approve") return t("mcbb451a07423", { subject });
  if (reply.kind === "changes")
    return (
      <>
        <span className="mb-1 block text-caption text-muted-foreground">
          {t("mf63615fc3c6f", { subject })}
        </span>
        <ReplyValue value={reply.text} />
      </>
    );
  const options =
    interactive?.type === "question" || interactive?.type === "styles"
      ? interactive.options
      : [];
  // Locale list formatting; labels are Manager content, never joined by hand.
  return format.list(
    [
      ...reply.choices.map(
        (id) => options.find((o) => o.id === id)?.label ?? id,
      ),
      ...(reply.text ? [reply.text] : []),
    ].map((value, index) => <ReplyValue key={index} value={value} />),
    { type: "unit" },
  );
}

/** Keep each answer independent of the surrounding sentence and numeric ranges LTR. */
function ReplyValue({ value }: { value: string }) {
  return (
    <bdi>
      {value.split(/(\p{N}+(?:\s*[-–—]\s*\p{N}+)+)/u).map((part, index) =>
        index % 2 ? (
          <bdi key={index} dir="ltr">
            {part}
          </bdi>
        ) : (
          part
        ),
      )}
    </bdi>
  );
}
