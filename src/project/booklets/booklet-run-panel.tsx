"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { api } from "@/lib/client/api";
import type { RunStatus } from "@/lib/contracts/runs";
import { Notice } from "@/components/page-patterns";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ResultImage } from "@/components/media-fallback";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bookletViewSchema, type BookletView } from "./application-contract";
import { BookletActions } from "./booklet-actions";

// Public Run statuses (runStatuses) whose outcome is not yet known; saved work
// stays visible. Unknown/settlement-blocked attempts map to these.
const uncertain: readonly RunStatus[] = ["reconciling", "needs-review"];

export function BookletRunPanel({
  productionId,
  refreshKey,
  runStatus,
  runId,
  refreshRun,
}: {
  productionId: string;
  refreshKey: string;
  runStatus: string;
  runId: string;
  refreshRun: () => Promise<void>;
}) {
  const t = useTranslations("ui");
  const [view, setView] = useState<BookletView | null>(null);
  const [failed, setFailed] = useState(false);
  const fetchView = useCallback(
    () =>
      api(
        `/api/booklets/${encodeURIComponent(productionId)}`,
        bookletViewSchema,
      ),
    [productionId],
  );
  // Re-read when the polled Run changes; state changes only after the request.
  useEffect(() => {
    let live = true;
    fetchView().then(
      (next) => {
        if (!live) return;
        setView(next);
        setFailed(false);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [fetchView, refreshKey]);
  async function retry() {
    setFailed(false);
    try {
      setView(await fetchView());
    } catch {
      setFailed(true);
    }
  }

  const states: Record<BookletView["state"], [string, StatusTone]> = {
    draft: [t("mba35f0c47d86"), "neutral"],
    "in-progress": [t("mc1f88e9d6c41"), "info"],
    completed: [t("m143b270a3260"), "success"],
    closed: [t("mc21ead0614e7"), "neutral"],
  };
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
  const artifactStatus = {
    "not-started": t("mba35f0c47d86"),
    "in-progress": t("mc1f88e9d6c41"),
    selected: t("m57fd7a0cf33f"),
  };
  const subjectName = (s: BookletView["subjects"][number]) =>
    s.pageRole === "cover" ? t("mfa8d84566676") : s.label;

  return (
    <Card className="shadow-none">
      <CardHeader>
        <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-secondary">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        <CardTitle role="heading" aria-level={2} className="text-xl">
          {view ? <bdi>{view.title}</bdi> : t("mdf4bb1fa43af")}
        </CardTitle>
        <CardDescription>{t("mcd63e17b829a")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {uncertain.includes(runStatus as RunStatus) && (
          <Notice tone="warning" title={t("m08d20ade842d")}>
            {t("maa1257a275bb")}
          </Notice>
        )}
        {failed && !view ? (
          <Notice tone="error" title={t("m1ba40346f6b3")}>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void retry()}
            >
              {t("md8b8392e2c54")}
            </Button>
          </Notice>
        ) : !view ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={states[view.state][1]}>
                {states[view.state][0]}
              </StatusBadge>
              <p className="text-sm text-muted-foreground" role="status">
                {t("m82f68bf17e33", {
                  accepted: view.pages.accepted,
                  total: view.pages.total,
                })}
              </p>
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-3">
              {(
                [
                  ["story", t("me9e509dcd358")],
                  ["style", t("m7e744141b40e")],
                  ["references", t("m7f635ab40e2d")],
                ] as const
              ).map(([stage, label]) => (
                <li key={stage} className="rounded-lg border px-3 py-2">
                  <span className="font-medium">{label}</span>
                  <span className="block text-muted-foreground">
                    {view.stages[stage]
                      ? t("m4ec194daf2af")
                      : t("mbc935bbed3ce")}
                  </span>
                </li>
              ))}
            </ul>
            {view.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("m56bb51ae9c2d")}
              </p>
            ) : (
              <section
                aria-labelledby={`${productionId}-results`}
                className="space-y-3"
              >
                <h3 id={`${productionId}-results`} className="font-medium">
                  {t("m219c4a6c86a7")}
                </h3>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {view.subjects.map((subject) => (
                    <li
                      key={subject.id}
                      className="space-y-2 rounded-xl border p-3"
                    >
                      <p className="font-medium">
                        <bdi>{subjectName(subject)}</bdi>
                      </p>
                      {subject.artifacts
                        .flatMap((a) => a.images)
                        .slice(0, 1)
                        .map((image) => (
                          <a
                            key={image.assetId}
                            href={image.url}
                            target="_blank"
                            rel="noopener"
                            className="block rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <ResultImage
                              unoptimized
                              src={image.url}
                              width={400}
                              height={400}
                              aspectRatio="1 / 1"
                              alt={t("mcc63290d43af", {
                                name: subjectName(subject),
                              })}
                              className="h-40 w-full rounded-md object-contain"
                            />
                            <span className="sr-only">
                              {t("mb0eb095216f8")}
                            </span>
                          </a>
                        ))}
                      <ul className="space-y-1 text-sm">
                        {subject.artifacts.map((a) => (
                          <li key={a.id} className="flex justify-between gap-2">
                            <span>{kinds[a.kind] ?? a.kind}</span>
                            <span className="text-muted-foreground">
                              {artifactStatus[a.status]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <BookletActions
              view={view}
              currentRunId={runId}
              refresh={() => {
                void retry();
                void refreshRun();
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
