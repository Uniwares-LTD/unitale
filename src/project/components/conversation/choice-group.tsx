"use client";

import { ResultImage } from "@/components/media-fallback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArtworkViewer, type ArtworkLabels } from "./artwork-viewer";

export type ChoiceOption = {
  id: string;
  label: string;
  /** Optional artwork, e.g. an illustration style sample. */
  image?: { src: string };
};

/**
 * Unitale single and multiple choice (design package: Single & multiple choice;
 * Unibase selection). A single, reversible choice commits on one tap; multiple
 * choices are a draft shown with aria-pressed until the composer's Send. Two
 * columns, the odd last option spans both. Selecting is never approval or
 * payment consent.
 */
export function ChoiceGroup({
  legendId,
  legend,
  hint,
  options,
  mode,
  selected = [],
  onChoose,
  disabled = false,
  artworkLabels,
  compact = false,
}: {
  legendId: string;
  legend: string;
  /** Short instruction under the legend, e.g. that several may be chosen. */
  hint?: string;
  options: readonly ChoiceOption[];
  mode: "single" | "multiple";
  selected?: readonly string[];
  /** Single: commit this option. Multiple: toggle it in the draft. */
  onChoose: (id: string) => void;
  disabled?: boolean;
  artworkLabels?: ArtworkLabels;
  compact?: boolean;
}) {
  const media = options.some((option) => option.image);
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={hint && !compact ? `${legendId}-hint` : undefined}
      className="min-w-0"
    >
      <legend id={legendId} dir="auto" className="mb-2 text-body font-semibold">
        {legend}
      </legend>
      {hint && !compact && (
        <p
          id={`${legendId}-hint`}
          className="-mt-1 mb-2 text-supporting text-muted-foreground"
        >
          {hint}
        </p>
      )}
      {options.length > 0 && !compact && (
        <div
          className={cn(
            "grid gap-2",
            media
              ? "grid-cols-2 sm:grid-cols-3"
              : "grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2",
          )}
        >
          {options.map((option) => {
            const pressed = selected.includes(option.id);
            const control = (
              <Button
                type="button"
                variant={pressed ? "default" : "outline"}
                aria-pressed={mode === "multiple" ? pressed : undefined}
                onClick={() => onChoose(option.id)}
                className={cn(
                  "h-auto min-h-(--control-touch-sm) rounded-(--x-unitale-radius-card) shadow-none whitespace-normal text-body",
                  !pressed && "bg-muted/20 hover:bg-muted/40",
                  option.image
                    ? "w-full flex-col items-stretch gap-0 overflow-hidden p-0 text-start"
                    : "px-4 py-2.5",
                )}
              >
                {option.image && (
                  <ResultImage
                    unoptimized
                    src={option.image.src}
                    alt=""
                    width={240}
                    height={240}
                    className="aspect-square w-full object-cover"
                  />
                )}
                <bdi className={cn(option.image && "px-3 py-2")}>
                  {option.label}
                </bdi>
              </Button>
            );
            return (
              <div
                key={option.id}
                className={cn("grid min-w-0", option.image && "relative")}
              >
                {control}
                {option.image && artworkLabels && (
                  <ArtworkViewer
                    image={{
                      src: option.image.src,
                      alt: option.label,
                      width: 640,
                      height: 640,
                    }}
                    labels={artworkLabels}
                    iconOnly
                    className="absolute end-2 top-2 bg-background"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
