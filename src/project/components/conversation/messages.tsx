"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowDown, Check, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Unitale conversation messages (design package: Message & question dock and
// Waiting & message reveal). Agent turns use the static mascot face, which
// identifies the agent decoratively; its name carries the meaning.

const mascot = "/images/unitale-mascot-face.svg";

// `working` bobs and glows; it is still under reduced motion. `large` is the
// waiting slot, where the mascot is the main sign that the book is being made.
function MascotFace({
  working,
  large,
}: {
  working?: boolean;
  large?: boolean;
}) {
  return (
    <Image
      data-unitale-mascot={working ? "working" : undefined}
      src={mascot}
      alt=""
      aria-hidden="true"
      width={large ? 56 : 28}
      height={large ? 56 : 28}
      className={cn("shrink-0", large ? "size-14" : "size-7")}
    />
  );
}

/**
 * One agent turn. The same header is the working row while the agent works
 * and the reply's header once it streams in, so the one mascot stays put and
 * the text flows below it. The body reveals with the package's reveal timing,
 * instantly under reduced motion.
 */
export function AgentMessage({
  name,
  working = false,
  large = false,
  children,
}: {
  name: string;
  /** The agent is working on, or still streaming, this turn: the mascot glows. */
  working?: boolean;
  /** A bigger mascot for the waiting slot. */
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <div className={cn("mb-2 flex items-center", large ? "gap-3" : "gap-2")}>
        <MascotFace working={working} large={large} />
        <span className="text-caption text-muted-foreground">
          <bdi>{name}</bdi>
        </span>
      </div>
      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-(--x-unitale-duration-reveal)">
        {children}
      </div>
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
 * Current-work line under the working agent header. Copy must describe real activity;
 * no percentages. `steps` shows the book's real stages: done ones checked, the
 * current one lit. `artwork` holds a placeholder where pictures will appear while
 * they are being made. Everything stays readable when motion is reduced.
 */
export function WaitRow({
  children,
  steps,
  artwork,
}: {
  children: ReactNode;
  steps?: { label: string; labels: string[]; current: number };
  /** Accessible name of the picture placeholder; omitted when no art is in progress. */
  artwork?: string;
}) {
  return (
    <div className="space-y-4 rounded-(--x-unitale-radius-card) bg-muted/30 px-4 py-4 sm:px-5">
      <p
        data-unitale-activity
        className="min-w-0 text-body font-medium text-foreground"
      >
        {children}
      </p>
      {steps && (
        <ol aria-label={steps.label} className="flex items-start">
          {steps.labels.map((label, index) => {
            const done = index < steps.current;
            const current = index === steps.current;
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
              >
                {index > 0 && (
                  // Connector from the previous step; logical so RTL mirrors it.
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute end-1/2 top-3.5 h-0.5 w-full -translate-y-1/2",
                      index <= steps.current ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
                <span
                  aria-hidden="true"
                  data-unitale-step={current ? "current" : undefined}
                  className={cn(
                    "relative grid size-7 place-items-center rounded-full border-2",
                    done && "border-primary bg-primary text-primary-foreground",
                    current &&
                      "border-primary bg-card text-primary ring-4 ring-primary/20",
                    !done && !current && "border-border bg-card",
                  )}
                >
                  {done && <Check className="size-4" strokeWidth={3} />}
                  {current && (
                    <span className="size-2.5 rounded-full bg-primary" />
                  )}
                </span>
                <span
                  className={cn(
                    "w-full truncate px-0.5",
                    current
                      ? "text-label font-semibold text-foreground"
                      : done
                        ? "text-caption text-foreground"
                        : "text-caption text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {artwork && (
        // Where the pictures will land; it claims no progress.
        <div
          role="img"
          aria-label={artwork}
          className="grid grid-cols-2 gap-3 sm:max-w-md"
        >
          {[0, 1].map((frame) => (
            <div
              key={frame}
              data-unitale-art-skeleton
              className="relative grid aspect-2/3 place-items-center overflow-hidden rounded-(--x-unitale-radius-media) bg-muted"
            >
              <ImageIcon
                aria-hidden="true"
                className="size-8 text-muted-foreground/70"
              />
            </div>
          ))}
        </div>
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
