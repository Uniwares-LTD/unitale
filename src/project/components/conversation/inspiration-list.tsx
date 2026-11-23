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
      <h2 id={headingId} className="mb-3 text-supporting text-muted-foreground">
        {heading}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.title}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onPick(index)}
              className="h-auto min-h-(--control-touch-sm) w-full flex-col items-start gap-1 rounded-(--x-unitale-radius-card) px-4 py-3 text-start whitespace-normal"
            >
              <span className="text-body font-medium">{item.title}</span>
              <span className="text-caption text-muted-foreground">{item.hint}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
