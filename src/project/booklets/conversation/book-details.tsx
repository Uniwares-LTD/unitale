"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { bookletViewSchema, type BookletView } from "../application-contract";
import { BookletActions } from "../booklet-actions";
import { BookletHistoryPanel } from "../booklet-history";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function BookDetails({
  productionId,
  runId,
  refreshKey,
  refreshConversation,
  open,
  onOpenChange,
}: {
  productionId: string;
  runId: string | null;
  refreshKey: string;
  refreshConversation: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ui");
  const [view, setView] = useState<BookletView | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    () =>
      api(
        `/api/booklets/${encodeURIComponent(productionId)}`,
        bookletViewSchema,
      ),
    [productionId],
  );
  useEffect(() => {
    if (!open) return;
    let live = true;
    load().then(
      (value) => {
        if (live) {
          setView(value);
          setFailed(false);
        }
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [load, open, refreshKey]);

  const kinds: Record<string, string> = {
    concept: t("m54287be80625"),
    outline: t("meabbf3abaf8d"),
    manuscript: t("md16bb3df6fcd"),
    description: t("m526e0087cc3f"),
    roster: t("m710a6e8b03d3"),
    style: t("m7e744141b40e"),
    reference: t("m1a11982bb733"),
    "page-plan": t("m3d92cbd77e0d"),
    "page-image": t("md99d69879e52"),
    "book-manifest": t("md4425bec974a"),
  };
  function refresh() {
    load().then(
      (value) => {
        setView(value);
        setFailed(false);
      },
      () => setFailed(true),
    );
    refreshConversation();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-muted-foreground"
        >
          <Info aria-hidden="true" />
          {t("m9f17d3680bca")}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-unitale-book-details
        aria-describedby={undefined}
        className="max-h-[90svh] overflow-y-auto bg-card shadow-none ring-0 sm:max-w-3xl"
      >
        <DialogTitle className="min-h-11 pe-12 font-heading text-section-title">
          {t("m395409137696")}
        </DialogTitle>
        <div className="space-y-4">
          {failed && (
            <Notice tone="error" title={t("m1ba40346f6b3")}>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                onClick={refresh}
              >
                {t("md8b8392e2c54")}
              </Button>
            </Notice>
          )}
          {!view && !failed && (
            <Skeleton aria-label={t("mba3bbbe10d8b")} className="h-12 w-full" />
          )}
          {view && (
            <>
              {!view.completed && (
                <p className="text-supporting text-muted-foreground">
                  {t("m82f68bf17e33", {
                    accepted: view.pages.accepted,
                    total: view.pages.total,
                  })}
                </p>
              )}
              <BookletActions view={view} refresh={refresh} />
              <BookletHistoryPanel
                view={view}
                currentRunId={runId}
                kindLabel={(kind) => kinds[kind] ?? kind}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
