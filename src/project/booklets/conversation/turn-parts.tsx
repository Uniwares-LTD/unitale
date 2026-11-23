"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { ResultImage } from "@/components/media-fallback";
import type { BookletReply, BookletTurn, BookletTurnPart } from "../turn-contract";

export const assetUrl = (productionId: string, assetId: string) =>
  `/api/booklets/${encodeURIComponent(productionId)}/assets/${encodeURIComponent(assetId)}`;

export function AgentLabel() {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Image
        src="/images/unitale-mascot-face.svg"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="size-7"
      />
      <span className="text-xs text-muted-foreground">
        <bdi>Unitale</bdi>
      </span>
    </div>
  );
}

export function UserBubble({ children }: { children: React.ReactNode }) {
  const t = useTranslations("ui");
  return (
    <div className="flex flex-col items-end">
      <span className="mb-1 text-xs text-muted-foreground">{t("m08b041935798")}</span>
      <div className="max-w-[min(32rem,85%)] whitespace-pre-line rounded-[var(--x-unitale-radius-card)] border bg-secondary px-4 py-3 text-base leading-relaxed text-secondary-foreground [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

const card =
  "rounded-[var(--x-unitale-radius-card)] border bg-card p-4 text-card-foreground sm:p-5";

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
        <Part
          key={index}
          productionId={productionId}
          part={part}
          answered={answered}
        />
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
      return (
        <p className="whitespace-pre-line text-base leading-relaxed [overflow-wrap:anywhere]">
          {part.text}
        </p>
      );
    case "milestone":
      return (
        <div className="flex items-center gap-3 pt-2" role="separator" aria-label={part.label}>
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {part.label}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    case "overview":
      return (
        <section className={card}>
          <h3 className="font-heading text-xl">{part.title}</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            {part.facts.map((fact, index) => (
              <div key={index} className="contents">
                <dt className="text-sm text-muted-foreground">{fact.label}</dt>
                <dd className="text-sm [overflow-wrap:anywhere]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case "synopsis":
      return (
        <section className={card}>
          <h3 className="font-heading text-xl">{part.title}</h3>
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed [overflow-wrap:anywhere]">
            {part.body}
          </p>
        </section>
      );
    case "character":
    case "location":
      return (
        <section className={`${card} grid gap-4 sm:grid-cols-[10rem_1fr]`}>
          {part.assetId && (
            <ResultImage
              unoptimized
              src={assetUrl(productionId, part.assetId)}
              width={320}
              height={320}
              aspectRatio="1 / 1"
              alt={part.name}
              className="rounded-[var(--x-unitale-radius-media)]"
            />
          )}
          <div className={part.assetId ? "" : "sm:col-span-2"}>
            <h3 className="font-heading text-xl">{part.name}</h3>
            <p className="mt-2 whitespace-pre-line text-base leading-relaxed">{part.description}</p>
          </div>
        </section>
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
          className="max-w-md rounded-[var(--x-unitale-radius-media)]"
        />
      );
    case "question":
    case "styles":
      return answered ? (
        <p className="text-base leading-relaxed font-medium">{part.prompt}</p>
      ) : null;
    case "approval":
      return null;
  }
}

/** The owner's reply as shown in the history (labels, not option IDs). */
export function ReplyText({ turn, reply }: { turn: BookletTurn; reply: BookletReply }) {
  const t = useTranslations("ui");
  const interactive = turn.parts.find(
    (p) => p.type === "question" || p.type === "styles" || p.type === "approval",
  );
  if (reply.kind === "approve")
    return t("mcbb451a07423", {
      subject: interactive?.type === "approval" ? interactive.subject : "",
    });
  if (reply.kind === "changes")
    return (
      <>
        <span className="mb-1 block text-xs text-muted-foreground">
          {t("mf63615fc3c6f", {
            subject: interactive?.type === "approval" ? interactive.subject : "",
          })}
        </span>
        {reply.text}
      </>
    );
  const options =
    interactive?.type === "question" || interactive?.type === "styles"
      ? interactive.options
      : [];
  return [
    ...reply.choices.map((id) => options.find((o) => o.id === id)?.label ?? id),
    ...(reply.text ? [reply.text] : []),
  ].join(", ");
}
