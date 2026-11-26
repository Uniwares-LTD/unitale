"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Unitale conversation messages (design package: Message & question dock and
// Waiting & message reveal). Agent turns use the static mascot face, which
// identifies the agent decoratively; its name carries the meaning.

const mascot = "/images/unitale-mascot-face.svg";

// `working` bobs and glows; `greet` waves once. Both are still under reduced motion.
function MascotFace({ mood }: { mood?: "working" | "greet" }) {
  return (
    <Image
      data-unitale-mascot={mood}
      src={mascot}
      alt=""
      aria-hidden="true"
      width={28}
      height={28}
      className="size-7 shrink-0"
    />
  );
}

/** One agent turn; reveals with the package's reveal timing, instantly under reduced motion. */
export function AgentMessage({
  name,
  greet = false,
  children,
}: {
  name: string;
  /** The newest reply: the mascot waves once as it arrives. */
  greet?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-(--x-unitale-duration-reveal)">
      <div className="mb-2 flex items-center gap-2">
        <MascotFace mood={greet ? "greet" : undefined} />
        <span className="text-caption text-muted-foreground">
          <bdi>{name}</bdi>
        </span>
      </div>
      {children}
    </div>
  );
}

/** The owner's message, aligned to the end edge. Past messages are not editable. */
export function UserMessage({
  author,
  children,
}: {
  author: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-end">
      <span className="mb-1 text-caption text-muted-foreground">{author}</span>
      <div
        data-slot="user-message"
        className="max-w-[min(32rem,85%)] rounded-(--x-unitale-radius-card) bg-muted/60 px-4 py-3 text-body whitespace-pre-line text-foreground [overflow-wrap:anywhere]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Current-work line while the agent works. Copy must describe real activity;
 * no percentages. `steps` shows the book's real stages, the current one lit.
 */
export function WaitRow({
  children,
  steps,
}: {
  children: ReactNode;
  steps?: { label: string; labels: string[]; current: number };
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-(--control-touch-sm) items-center gap-2 text-supporting text-muted-foreground">
        <MascotFace mood="working" />
        <span data-unitale-activity className="min-w-0">
          {children}
        </span>
      </div>
      {steps && (
        <ol aria-label={steps.label} className="flex items-start">
          {steps.labels.map((label, index) => {
            const done = index < steps.current;
            const current = index === steps.current;
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
              >
                {index > 0 && (
                  // Connector from the previous step; logical so RTL mirrors it.
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute end-1/2 top-2 h-0.5 w-full -translate-y-1/2",
                      index <= steps.current ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
                <span
                  aria-hidden="true"
                  data-unitale-step={current ? "current" : undefined}
                  className={cn(
                    "relative grid size-4 place-items-center rounded-full border-2",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && "border-primary bg-card",
                    !done && !current && "border-border bg-card",
                  )}
                >
                  {done && <Check className="size-2.5" strokeWidth={4} />}
                  {current && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span
                  className={cn(
                    "w-full truncate px-0.5 text-caption",
                    current
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Offered instead of moving a reader who is looking at earlier messages. */
export function NewResponseButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-(--control-touch-sm) rounded-full bg-card text-supporting shadow-none"
      onClick={onClick}
    >
      <ArrowDown aria-hidden="true" />
      {label}
    </Button>
  );
}

/** A Manager-chosen section label in the transcript; it claims no progress. */
export function MilestoneDivider({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 pt-2"
      role="separator"
      aria-label={label}
    >
      <span className="h-px flex-1 bg-border" />
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
