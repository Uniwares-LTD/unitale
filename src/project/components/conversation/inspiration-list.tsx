"use client";

import { Button } from "@/components/ui/button";

export type Inspiration = { title: string; hint: string };

/**
 * Unitale inspiration (design package: Entry & inspiration). Picking an item
 * only fills the composer; sending stays a deliberate action, and inspiration
 * stays secondary to writing.
 */
export function InspirationList({
  headingId,
  heading,
  items,
  onPick,
}: {
  headingId: string;
  heading: string;
  items: readonly Inspiration[];
  onPick: (index: number) => void;
}) {
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-3 text-center text-supporting text-muted-foreground"
      >
        {heading}
      </h2>
      <ul className="flex gap-2 overflow-x-auto px-1 py-2 scroll-px-1">
        {items.map((item, index) => (
          <li key={item.title} className="min-w-40 flex-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onPick(index)}
              className="h-auto min-h-(--control-touch-sm) w-full flex-col items-start gap-1 rounded-(--x-unitale-radius-card) bg-muted/25 px-3 py-3 text-start whitespace-normal hover:bg-muted/50"
            >
              <span className="text-body font-medium">{item.title}</span>
              <span className="text-caption text-muted-foreground">
                {item.hint}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
