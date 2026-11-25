"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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
  const t = useTranslations("ui");
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const position = useRef(0);
  const openedPath = useRef("");
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === dialog.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  function fit() {
    setZoom(1);
    viewport.current?.scrollTo({ left: 0, top: 0 });
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === dialog.current)
        await document.exitFullscreen();
      else await dialog.current?.requestFullscreen();
    } catch {
      setNotice(t("mee06dd885c12"));
    }
  }
  const label = `${labels.open} · ${image.alt}`;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          position.current = window.scrollY;
          openedPath.current = window.location.pathname;
        } else {
          fit();
          setNotice("");
          if (document.fullscreenElement === dialog.current)
            void document.exitFullscreen();
        }
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
        ref={dialog}
        data-unitale-artwork-viewer
        aria-describedby={undefined}
        onCloseAutoFocus={() => {
          requestAnimationFrame(() => {
            if (window.location.pathname === openedPath.current)
              window.scrollTo({ top: position.current, behavior: "instant" });
          });
        }}
        onEscapeKeyDown={(event) => {
          if (document.fullscreenElement === dialog.current) {
            event.preventDefault();
            void document.exitFullscreen();
          }
        }}
        className="max-h-[92svh] min-w-0 gap-3 overflow-y-auto bg-card text-card-foreground shadow-none ring-0 sm:max-w-4xl motion-reduce:animate-none"
      >
        <div className="flex min-h-(--control-touch-sm) min-w-0 items-center pe-12">
          <DialogTitle className="min-w-0 text-card-title [overflow-wrap:anywhere]">
            <bdi>{image.alt}</bdi>
          </DialogTitle>
        </div>
        <div
          ref={viewport}
          dir="ltr"
          className={cn(
            "h-[63svh] max-h-[63svh] min-w-0 overflow-auto overscroll-contain rounded-(--x-unitale-radius-media) bg-muted/40",
            zoom > 1 && "cursor-grab touch-none active:cursor-grabbing",
          )}
          tabIndex={0}
          aria-label={image.alt}
          onDoubleClick={fit}
          onPointerDown={(event) => {
            if (zoom <= 1 || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            event.currentTarget.scrollLeft =
              drag.current.left - (event.clientX - drag.current.x);
            event.currentTarget.scrollTop =
              drag.current.top - (event.clientY - drag.current.y);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
            <ResultImage
              {...image}
              unoptimized
              className="mx-auto block h-full w-full object-contain"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={labels.zoomOut}
              disabled={zoom <= 1}
              onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
            >
              <ZoomOut aria-hidden="true" />
            </Button>
            <output
              className="min-w-12 text-center text-supporting"
              aria-live="polite"
            >
              {Math.round(zoom * 100)}%
            </output>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={labels.zoomIn}
              disabled={zoom >= 4}
              onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
            >
              <ZoomIn aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={fit}
            >
              <RotateCcw aria-hidden="true" />
              {t("m32bb0d298ca1")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={fullscreen ? t("m37fd4e355ba3") : t("mc461dbb2bab7")}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <Maximize2 aria-hidden="true" />
              )}
            </Button>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <a href={image.src} download={image.alt}>
              <Download aria-hidden="true" />
              {t("md6eafe823591")}
            </a>
          </Button>
        </div>
        <p
          className="text-caption text-muted-foreground"
          role={notice ? "status" : undefined}
        >
          {notice || t("m4535cee1ed67")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
