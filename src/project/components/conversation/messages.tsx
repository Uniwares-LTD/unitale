"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// Unitale conversation messages (design package: Message & question dock and
// Waiting & message reveal). Agent turns use the static mascot face, which
// identifies the agent decoratively; its name carries the meaning.

const mascot = "/images/unitale-mascot-face.svg";

function MascotFace() {
  return (
    <Image src={mascot} alt="" aria-hidden="true" width={28} height={28} className="size-7 shrink-0" />
  );
}

/** One agent turn; reveals with the package's reveal timing, instantly under reduced motion. */
export function AgentMessage({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-(--x-unitale-duration-reveal)">
      <div className="mb-2 flex items-center gap-2">
        <MascotFace />
        <span className="text-caption text-muted-foreground">
          <bdi>{name}</bdi>
        </span>
      </div>
      {children}
    </div>
  );
}

/** The owner's message, aligned to the end edge. Past messages are not editable. */
export function UserMessage({ author, children }: { author: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-end">
      <span className="mb-1 text-caption text-muted-foreground">{author}</span>
      <div className="max-w-[min(32rem,85%)] rounded-(--x-unitale-radius-card) border bg-secondary px-4 py-3 text-reading whitespace-pre-line text-secondary-foreground [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

/** Current-work line while the agent works. Copy must describe real activity; no percentages. */
export function WaitRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-supporting text-muted-foreground">
      <MascotFace />
      <span>{children}</span>
      <span aria-hidden="true" className="flex gap-1">
        <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" />
        <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse motion-safe:[animation-delay:200ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse motion-safe:[animation-delay:400ms]" />
      </span>
    </div>
  );
}

/** Offered instead of moving a reader who is looking at earlier messages. */
export function NewResponseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" className="min-h-(--control-touch-sm)" onClick={onClick}>
      <ArrowDown aria-hidden="true" />
      {label}
    </Button>
  );
}

/** A Manager-chosen section label in the transcript; it claims no progress. */
export function MilestoneDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
