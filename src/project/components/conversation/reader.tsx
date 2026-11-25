"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Columns2,
  Download,
  File,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArtworkViewer, type Artwork } from "./artwork-viewer";
import { readerRange, readerStep } from "./reader-position";

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
  autoOpen = false,
  onRequestChanges,
  hasCover = true,
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
  hasCover?: boolean;
  autoOpen?: boolean;
  onRequestChanges?: () => void;
}) {
  const t = useTranslations("ui");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(false);
  const position = useRef(0);
  const openedPath = useRef("");
  const current = Math.max(0, Math.min(index, pages.length - 1));
  if (index !== current) setIndex(current);
  useEffect(() => {
    if (autoOpen) {
      position.current = window.scrollY;
      openedPath.current = window.location.pathname;
      const frame = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [autoOpen]);
  const visible = readerRange(current, pages.length, spread, hasCover);
  const move = (delta: -1 | 1) =>
    setIndex(readerStep(current, pages.length, spread, delta, hasCover));
  function onKeyDown(event: KeyboardEvent) {
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    move(
      event.key === (direction === "rtl" ? "ArrowLeft" : "ArrowRight") ? 1 : -1,
    );
  }
  if (!pages.length) return null;
  const illustration = pages[current];
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-(--x-unitale-radius-card) bg-muted/20 px-5 py-4">
      <div className="space-y-1">
        <h2 className="font-heading text-card-title">{heading}</h2>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Check className="size-3.5" aria-hidden="true" />
          {t("mf9a050170cd9")}
        </p>
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (value) {
            position.current = window.scrollY;
            openedPath.current = window.location.pathname;
          }
          setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" className="min-h-11">
            <BookOpen aria-hidden="true" />
            {openLabel}
          </Button>
        </DialogTrigger>
        <DialogContent
          data-unitale-reader
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onCloseAutoFocus={() => {
            requestAnimationFrame(() => {
              if (window.location.pathname === openedPath.current)
                window.scrollTo({ top: position.current, behavior: "instant" });
            });
          }}
          className="flex max-h-[94svh] min-w-0 flex-col gap-0 overflow-hidden bg-card p-0 text-card-foreground shadow-none ring-0 sm:max-w-5xl motion-reduce:animate-none"
        >
          <div className="shrink-0 space-y-4 border-b border-border/60 px-5 pt-5 pb-4 sm:px-8">
            <div className="flex min-h-11 min-w-0 items-center pe-12">
              <DialogTitle className="min-w-0 font-heading text-section-title [overflow-wrap:anywhere]">
                <bdi>{title}</bdi>
              </DialogTitle>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label={t("mbc34ad4a9d8c")}
                className="flex rounded-full bg-muted/40 p-1"
              >
                <Button
                  type="button"
                  variant={spread ? "ghost" : "secondary"}
                  className="min-h-11 rounded-full"
                  aria-pressed={!spread}
                  onClick={() => setSpread(false)}
                >
                  <File aria-hidden="true" />
                  {t("m6c9b2e0e1629")}
                </Button>
                <Button
                  type="button"
                  variant={spread ? "secondary" : "ghost"}
                  className="min-h-11 rounded-full"
                  aria-pressed={spread}
                  onClick={() => setSpread(true)}
                >
                  <Columns2 aria-hidden="true" />
                  {t("m70aa44634ac4")}
                </Button>
              </div>
              <Button
                asChild
                variant="outline"
                className="min-h-11 rounded-full"
              >
                <a href={illustration.src} download={illustration.alt}>
                  <Download aria-hidden="true" />
                  {downloadLabel}
                </a>
              </Button>
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/15 p-4 sm:px-8 sm:py-6"
            dir={direction}
          >
            <div
              className={
                spread && visible.length > 1
                  ? "grid grid-cols-2 gap-2 sm:gap-5"
                  : "mx-auto max-w-xl"
              }
            >
              {visible.map((pageIndex) => {
                const page = pages[pageIndex];
                const { text, ...art } = page;
                return (
                  <article
                    key={page.src + pageIndex}
                    className="min-w-0 overflow-hidden rounded-(--x-unitale-radius-media) bg-card shadow-sm"
                  >
                    <ArtworkViewer
                      image={art}
                      labels={{
                        open: t("mb04fcdfc3287"),
                        zoomIn: t("m0e47f09a748f"),
                        zoomOut: t("mbc7b631a689b"),
                      }}
                      className="rounded-none [&_img]:max-h-[52svh]"
                    />
                    {text.length > 0 && (
                      <div className="space-y-3 px-4 py-5 text-reading [overflow-wrap:anywhere] sm:px-6">
                        {text.map((line, i) => (
                          <p key={i} className="whitespace-pre-wrap">
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                    {spread && visible.length > 1 && (
                      <p className="px-4 pb-3 text-center text-caption text-muted-foreground">
                        {pageLabel(pageIndex)}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 space-y-3 border-t border-border/60 px-4 py-4 sm:px-8">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                aria-label={previousLabel}
                disabled={visible[0] === 0}
                className="min-h-11 min-w-11"
                onClick={() => move(-1)}
              >
                <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
                <span className="hidden min-[700px]:inline">
                  {previousLabel}
                </span>
              </Button>
              <output
                className="text-center text-supporting"
                aria-live="polite"
                aria-atomic="true"
              >
                {pageLabel(current)}
              </output>
              <Button
                type="button"
                variant="outline"
                aria-label={nextLabel}
                disabled={visible.at(-1) === pages.length - 1}
                className="min-h-11 min-w-11"
                onClick={() => move(1)}
              >
                <span className="hidden min-[700px]:inline">{nextLabel}</span>
                <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button asChild variant="link" className="min-h-11 px-0">
                <Link href="/books">{t("m1ad84286274b")}</Link>
              </Button>
              {onRequestChanges && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    setOpen(false);
                    requestAnimationFrame(onRequestChanges);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  {t("m3566cb095669")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
