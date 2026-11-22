"use client";

import type { ComponentProps } from "react";
import type { RunDetail } from "@/components/runs/run-ui";
import { BookletRunPanel } from "./booklets/booklet-run-panel";

// Project-owned controls inside the existing poller. Authorization stays server-side.
// Booklet v2 Runs show their owned production view; other Runs are unchanged.
// Decisions remain in the existing authentic Run decision controls.
export function ProjectRunDetail({
  data,
  refresh,
}: {
  data: ComponentProps<typeof RunDetail>["initial"];
  refresh: () => Promise<void>;
}) {
  const target = data.target;
  if (target?.adapter !== "booklet" || target.version !== "2") return null;
  const latest = data.attempts.at(-1);
  return (
    <BookletRunPanel
      productionId={target.id}
      runStatus={data.status}
      runId={data.id}
      refreshRun={refresh}
      refreshKey={`${data.status}:${latest?.id ?? ""}:${latest?.updatedAt ?? ""}:${data.events.length}`}
    />
  );
}
