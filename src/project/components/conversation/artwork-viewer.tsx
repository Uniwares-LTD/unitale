"use client";

import { useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { ResultImage } from "@/components/media-fallback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type Artwork = {
  src: string;
  alt: string;
  width: number;
  height: number;
};
export type ArtworkLabels = { open: string; zoomIn: string; zoomOut: string };

export function ArtworkViewer({
  image,
  labels,
  className,
  iconOnly = false,
}: {
  image: Artwork;
  labels: ArtworkLabels;
  className?: string;
  iconOnly?: boolean;
}) {
  const [zoomed, setZoomed] = useState(false);
  const position = useRef(0);
  const label = `${labels.open} · ${image.alt}`;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) position.current = window.scrollY;
        else setZoomed(false);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={iconOnly ? "outline" : "ghost"}
          size={iconOnly ? "icon" : "default"}
          aria-label={label}
          className={cn(
            iconOnly
              ? "size-(--control-touch-sm)"
              : "block h-auto w-full min-w-0 overflow-hidden rounded-(--x-unitale-radius-media) p-0",
            className,
          )}
        >
          {iconOnly ? (
            <Maximize2 aria-hidden="true" />
          ) : (
            <ResultImage
              {...image}
              unoptimized
              className="block h-auto w-full object-contain"
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={() => {
          requestAnimationFrame(() =>
            window.scrollTo({ top: position.current }),
          );
        }}
        className="max-h-[90svh] min-w-0 gap-3 sm:max-w-3xl motion-reduce:animate-none"
      >
        <DialogTitle
          dir="auto"
          className="text-card-title pe-10 [overflow-wrap:anywhere]"
        >
          {image.alt}
        </DialogTitle>
        <div
          className="max-h-[63svh] min-w-0 overflow-auto overscroll-contain rounded-(--x-unitale-radius-media) bg-muted"
          tabIndex={0}
          aria-label={image.alt}
        >
          <div className={zoomed ? "w-[200%]" : "w-full"}>
            <ResultImage
              {...image}
              unoptimized
              className={cn(
                "mx-auto block h-auto w-full object-contain",
                !zoomed && "max-h-[63svh]",
              )}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-(--control-touch-sm) justify-self-start"
          onClick={() => setZoomed(!zoomed)}
        >
          {zoomed ? (
            <ZoomOut aria-hidden="true" />
          ) : (
            <ZoomIn aria-hidden="true" />
          )}
          {zoomed ? labels.zoomOut : labels.zoomIn}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
