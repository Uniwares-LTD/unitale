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
import { ArtworkViewer, downloadHref, type Artwork } from "./artwork-viewer";
import { readerRange, readerStep } from "./reader-position";

export function ConversationReader({
  title,
  heading,
  openLabel,
  downloadLabel,
  previousLabel,
  nextLabel,
  pageLabel,
  spreadLabel,
  downloadPageLabel,
  narrowNote,
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
  /** Names an open spread, for example "Pages 3–4 of 8". */
  spreadLabel: (first: number, last: number) => string;
  /** Names one page's download, so a spread offers each of its pages. */
  downloadPageLabel: (index: number) => string;
  /** Says why Book view is missing on a narrow screen. */
  narrowNote: string;
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
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 600px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // Two pages side by side are too small to read on a phone.
  const twoUp = spread && wide;
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
  const visible = readerRange(current, pages.length, twoUp, hasCover);
  const move = (delta: -1 | 1) =>
    setIndex(readerStep(current, pages.length, twoUp, delta, hasCover));
  function onKeyDown(event: KeyboardEvent) {
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const navigationDirection = getComputedStyle(event.currentTarget).direction;
    move(
      event.key === (navigationDirection === "rtl" ? "ArrowLeft" : "ArrowRight")
        ? 1
        : -1,
    );
  }
  if (!pages.length) return null;
  // An open book: two pages on one sheet. The cover and a last odd page stay alone.
  const pair = twoUp && visible.length > 1;
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
          className="flex h-[94svh] min-w-0 flex-col gap-0 overflow-hidden bg-card p-0 text-card-foreground shadow-none ring-0 sm:max-w-5xl motion-reduce:animate-none"
        >
          {/* Wide screens: title and view choice share one row, leaving the
              pages more height. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-border/60 px-5 pt-5 pb-4 pe-16 sm:px-8 sm:pe-16">
            <div className="flex min-h-11 min-w-0 flex-1 basis-60 items-center">
              <DialogTitle className="min-w-0 font-heading text-section-title [overflow-wrap:anywhere]">
                <bdi>{title}</bdi>
              </DialogTitle>
            </div>
            {/* Two pages side by side are too small on a phone; say why the
                choice is missing instead of offering one that does nothing. */}
            <p className="basis-full text-caption text-muted-foreground min-[600px]:hidden">
              {narrowNote}
            </p>
            <div className="flex flex-wrap items-center gap-3 max-[599px]:hidden">
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
            </div>
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-muted/15 p-4 sm:px-8 sm:py-5"
            dir={direction}
          >
            <div
              data-unitale-spread={pair ? "" : undefined}
              className={
                pair
                  ? "relative mx-auto grid w-full max-w-4xl flex-1 grid-cols-2 overflow-hidden rounded-(--x-unitale-radius-media) bg-card shadow-(--x-unitale-shadow-raised)"
                  : "mx-auto flex w-full max-w-xl flex-1 flex-col"
              }
            >
              {pair && (
                // The fold between the pages; symmetric, so it needs no mirroring.
                <span
                  aria-hidden="true"
                  data-unitale-spine
                  className="pointer-events-none absolute inset-y-0 inset-x-0 z-10 mx-auto w-20"
                />
              )}
              {visible.map((pageIndex) => {
                const page = pages[pageIndex];
                const { text, ...art } = page;
                return (
                  <article
                    key={page.src + pageIndex}
                    className={
                      pair
                        ? "flex min-w-0 flex-col gap-1 px-5 pt-5 sm:px-7 sm:pt-7"
                        : "flex min-w-0 flex-1 flex-col overflow-hidden rounded-(--x-unitale-radius-media) bg-card p-3 shadow-sm sm:p-4"
                    }
                  >
                    <ArtworkViewer
                      image={art}
                      labels={{
                        open: t("mb04fcdfc3287"),
                        zoomIn: t("m0e47f09a748f"),
                        zoomOut: t("mbc7b631a689b"),
                      }}
                      // The reader has a fixed height and the picture takes the room
                      // the page's words leave, so the words stay above the footer.
                      // A zero basis keeps long pages scrolling instead of clipping.
                      // The frame hugs the picture at its own shape: no letterbox.
                      className="flex min-h-[24svh] grow basis-0 items-center justify-center rounded-(--x-unitale-radius-media) [&_img]:h-full [&_img]:max-h-[60svh] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-(--x-unitale-radius-media) [&_img]:shadow-sm [&_img]:ring-1 [&_img]:ring-border/50 max-[599px]:[&_img]:max-h-[42svh]"
                    />
                    {text.length > 0 && (
                      <div className="space-y-3 px-1 py-4 text-reading [overflow-wrap:anywhere] sm:px-2">
                        {text.map((line, i) => (
                          <p key={i} className="whitespace-pre-wrap">
                            {line}
                          </p>
                        ))}
                      </div>
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
                {pair
                  ? spreadLabel(visible[0], visible[1])
                  : pageLabel(current)}
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
              {/* The shown page's picture, named so nobody expects the whole
                  book; an open spread offers each of its two pages. */}
              <div className="flex flex-wrap gap-1">
                {visible.map((pageIndex) => (
                  <Button
                    key={pageIndex}
                    asChild
                    variant="ghost"
                    className="min-h-11"
                  >
                    <a href={downloadHref(pages[pageIndex])} download>
                      <Download aria-hidden="true" />
                      {pair ? downloadPageLabel(pageIndex) : downloadLabel}
                    </a>
                  </Button>
                ))}
              </div>
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
