"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArtworkViewer, type Artwork } from "./artwork-viewer";

export function ConversationReader({
  title,
  heading,
  openLabel,
  downloadLabel,
  previousLabel,
  nextLabel,
  pageLabel,
  pages,
  direction,
}: {
  title: string;
  heading: string;
  openLabel: string;
  downloadLabel: string;
  previousLabel: string;
  nextLabel: string;
  pageLabel: (index: number) => string;
  pages: readonly (Artwork & { text: readonly string[] })[];
  direction: "ltr" | "rtl";
}) {
  const t = useTranslations("ui");
  const [index, setIndex] = useState(0);
  const position = useRef(0);
  const current = Math.max(0, Math.min(index, pages.length - 1));
  // Closing keeps the page; only a shorter page list adjusts the stored index.
  if (index !== current) setIndex(current);
  const move = (delta: number) =>
    setIndex(Math.max(0, Math.min(current + delta, pages.length - 1)));
  const onKeyDown = (event: KeyboardEvent) => {
    // A nested artwork dialog's keys must not turn the reader page behind it.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const navigationDirection = getComputedStyle(event.currentTarget).direction;
    move(
      event.key === (navigationDirection === "rtl" ? "ArrowLeft" : "ArrowRight")
        ? 1
        : -1,
    );
  };
  if (!pages.length) return null;
  const { text, ...illustration } = pages[current];
  return (
    <Card className="bg-muted/20 shadow-none ring-0">
      <CardHeader>
        <CardTitle
          role="heading"
          aria-level={2}
          className="font-heading text-card-title"
        >
          {heading}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog
          onOpenChange={(open) => {
            if (open) position.current = window.scrollY;
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" className="min-h-(--control-touch-sm)">
              <BookOpen aria-hidden="true" />
              {openLabel}
            </Button>
          </DialogTrigger>
          <DialogContent
            data-unitale-reader
            aria-describedby={undefined}
            onKeyDown={onKeyDown}
            onCloseAutoFocus={() => {
              requestAnimationFrame(() =>
                window.scrollTo({ top: position.current, behavior: "instant" }),
              );
            }}
            className="max-h-[92svh] overflow-auto bg-card text-card-foreground shadow-none ring-0 sm:max-w-3xl motion-reduce:animate-none"
          >
            <div className="flex min-h-(--control-touch-sm) min-w-0 items-center pe-12">
              <DialogTitle className="min-w-0 font-heading text-section-title [overflow-wrap:anywhere]">
                <bdi>{title}</bdi>
              </DialogTitle>
            </div>
            <ArtworkViewer
              key={illustration.src}
              image={illustration}
              labels={{
                open: t("mb04fcdfc3287"),
                zoomIn: t("m0e47f09a748f"),
                zoomOut: t("mbc7b631a689b"),
              }}
              className="[&_img]:max-h-[52svh]"
            />
            <Button
              asChild
              variant="outline"
              className="min-h-(--control-touch-sm) justify-self-start"
            >
              <a href={illustration.src} download={illustration.alt}>
                <Download aria-hidden="true" />
                {downloadLabel}
              </a>
            </Button>
            {text.length > 0 && (
              <div
                dir={direction}
                className="space-y-2 text-reading [overflow-wrap:anywhere]"
              >
                {text.map((line, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {line}
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                aria-label={previousLabel}
                disabled={current === 0}
                className="min-h-(--control-touch-sm) min-w-(--control-touch-sm)"
                onClick={() => move(-1)}
              >
                <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
                <span className="hidden min-[700px]:inline">
                  {previousLabel}
                </span>
              </Button>
              <output
                className="text-supporting"
                aria-live="polite"
                aria-atomic="true"
              >
                {pageLabel(current)}
              </output>
              <Button
                type="button"
                variant="outline"
                aria-label={nextLabel}
                disabled={current === pages.length - 1}
                className="min-h-(--control-touch-sm) min-w-(--control-touch-sm)"
                onClick={() => move(1)}
              >
                <span className="hidden min-[700px]:inline">{nextLabel}</span>
                <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
