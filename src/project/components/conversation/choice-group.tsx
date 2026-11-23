"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  options,
  mode,
  selected = [],
  onChoose,
  disabled = false,
}: {
  legendId: string;
  legend: string;
  options: readonly ChoiceOption[];
  mode: "single" | "multiple";
  selected?: readonly string[];
  /** Single: commit this option. Multiple: toggle it in the draft. */
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  const media = options.some((option) => option.image);
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend id={legendId} dir="auto" className="mb-2 text-body font-semibold">
        {legend}
      </legend>
      {options.length > 0 && (
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
            return (
              <Button
                key={option.id}
                type="button"
                variant={pressed ? "default" : "outline"}
                aria-pressed={mode === "multiple" ? pressed : undefined}
                onClick={() => onChoose(option.id)}
                className={cn(
                  "h-auto min-h-(--control-touch-sm) whitespace-normal text-body",
                  option.image
                    ? "flex-col items-stretch gap-0 overflow-hidden p-0 text-start"
                    : "px-4 py-2.5",
                )}
              >
                {option.image && (
                  <Image
                    unoptimized
                    src={option.image.src}
                    alt=""
                    width={240}
                    height={240}
                    className="aspect-square w-full object-cover"
                  />
                )}
                <span dir="auto" className={cn(option.image && "px-3 py-2")}>
                  {option.label}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
