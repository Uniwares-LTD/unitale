"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/client/api";
import { Notice } from "@/components/page-patterns";
import { DateLabel } from "@/components/localized-value";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bookletHistorySchema,
  type BookletHistory,
  type BookletView,
} from "./application-contract";

type Kind = BookletHistory["kind"];
type Page = { items: BookletHistory["items"]; next: string | null };

/** On-demand owned history. Loaded when opened, never on each poll, so updates
 * do not disturb reading; "Show more" follows the server's scoped cursor. */
export function BookletHistoryPanel({
  view,
  currentRunId,
  kindLabel,
}: {
  view: BookletView;
  currentRunId: string;
  kindLabel: (kind: string) => string;
}) {
  const t = useTranslations("ui");
  const prefix = useId();
  const [pages, setPages] = useState<Partial<Record<Kind, Page>>>({});
  const [failed, setFailed] = useState<Partial<Record<Kind, string>>>({});
  const [loading, setLoading] = useState<Kind | null>(null);
  const [artifactId, setArtifactId] = useState("");
  const artifacts = view.subjects.flatMap((s) =>
    s.artifacts.map((a) => ({ id: a.id, subject: s, kind: a.kind })),
  );

  async function load(kind: Kind, more = false, artifact = artifactId) {
    setLoading(kind);
    setFailed((old) => ({ ...old, [kind]: undefined }));
    try {
      const query = new URLSearchParams({ section: "history", kind });
      if (kind === "revisions") query.set("artifactId", artifact);
      const cursor = more ? pages[kind]?.next : null;
      if (cursor) query.set("cursor", cursor);
      const page = await api(
        `/api/booklets/${encodeURIComponent(view.productionId)}?${query}`,
        bookletHistorySchema,
      );
      setPages((old) => ({
        ...old,
        [kind]: {
          items: [...(more ? (old[kind]?.items ?? []) : []), ...page.items],
          next: page.next,
        },
      }));
    } catch (error) {
      // A changed history invalidates its cursor: restart from the first page.
      setFailed((old) => ({
        ...old,
        [kind]: error instanceof ApiError ? error.message : t("m20d50bacdeff"),
      }));
    } finally {
      setLoading(null);
    }
  }

  const runStatus = {
    active: t("mc1f88e9d6c41"),
    confirming: t("m738b154f4bb9"),
    succeeded: t("m7804f7a79a9e"),
    failed: t("m51f276aed9ae"),
    cancelled: t("md353a99eb455"),
  } as const;
  const empty = (
    <p className="text-sm text-muted-foreground">{t("m07d417d868a4")}</p>
  );

  function list(kind: Kind) {
    const page = pages[kind];
    return (
      <div className="space-y-3 pt-3">
        {failed[kind] && (
          <Notice tone="error" title={t("m20d50bacdeff")}>
            {failed[kind]}
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void load(kind)}
            >
              {t("m962e64b76196")}
            </Button>
          </Notice>
        )}
        {page && !page.items.length && empty}
        {page && page.items.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {page.items.map((item) => {
              if ("runId" in item)
                return (
                  <li
                    key={item.runId + (item.createdAt ?? "")}
                    className="flex flex-wrap justify-between gap-2 px-3 py-2"
                  >
                    <Link
                      href={`/runs/${encodeURIComponent(item.runId)}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {item.createdAt ? (
                        <DateLabel value={item.createdAt} />
                      ) : (
                        t("m00d60e31a4e6")
                      )}
                    </Link>
                    <span className="text-muted-foreground">
                      {item.runId === currentRunId
                        ? `${t("m0dbde8fd9594")} · `
                        : ""}
                      {runStatus[item.status]}
                    </span>
                  </li>
                );
              if ("productionId" in item)
                return (
                  <li
                    key={item.productionId}
                    className="flex flex-wrap justify-between gap-2 px-3 py-2"
                  >
                    <span>
                      {item.createdAt ? (
                        <DateLabel value={item.createdAt} />
                      ) : (
                        t("mdd167905de0d")
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {item.current
                        ? t("ma74487de8969")
                        : item.predecessor
                          ? t("m6bc311a6a9aa")
                          : t("me12fd2a25b0d")}
                    </span>
                  </li>
                );
              return (
                <li
                  key={item.revisionId}
                  className="flex flex-wrap justify-between gap-2 px-3 py-2"
                >
                  <span>
                    {t("m98c71b667959", { number: item.ordinal })} ·{" "}
                    <DateLabel value={item.createdAt} />
                  </span>
                  <span className="text-muted-foreground">
                    {item.selected
                      ? t("m57fd7a0cf33f")
                      : item.current
                        ? t("mbfe3f9618c5e")
                        : t("me6ece1e67281")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {page?.next && (
          <Button
            variant="outline"
            disabled={loading === kind}
            aria-busy={loading === kind}
            onClick={() => void load(kind, true)}
          >
            {t("mf5c9bd131486")}
          </Button>
        )}
        {!page && loading === kind && (
          <p className="text-sm text-muted-foreground" role="status">
            {t("mba3bbbe10d8b")}
          </p>
        )}
      </div>
    );
  }

  const section = (kind: Kind, title: string, body = list(kind)) => (
    <details
      className="rounded-lg border px-3 py-2"
      onToggle={(event) => {
        if (event.currentTarget.open && !pages[kind] && kind !== "revisions")
          void load(kind);
      }}
    >
      <summary className="cursor-pointer font-medium">{title}</summary>
      {body}
    </details>
  );

  return (
    <section
      aria-labelledby={`${prefix}-history`}
      className="space-y-3 border-t pt-4"
    >
      <h3 id={`${prefix}-history`} className="font-medium">
        {t("m0e7696009337")}
      </h3>
      {section("runs", t("m85226e143424"))}
      {section("versions", t("m56f6713d80de"))}
      {artifacts.length > 0 &&
        section(
          "revisions",
          t("m28619f03da52"),
          <div className="pt-3">
            <Select
              value={artifactId}
              onValueChange={(value) => {
                setArtifactId(value);
                void load("revisions", false, value);
              }}
            >
              <SelectTrigger aria-label={t("m031684dbd2c9")}>
                <SelectValue placeholder={t("m031684dbd2c9")} />
              </SelectTrigger>
              <SelectContent>
                {artifacts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <bdi>
                      {a.subject.pageRole === "cover"
                        ? t("mfa8d84566676")
                        : a.subject.label}
                    </bdi>
                    {" · "}
                    {kindLabel(a.kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {artifactId && list("revisions")}
          </div>,
        )}
    </section>
  );
}
