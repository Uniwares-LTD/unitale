"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { RunLanding } from "@/components/runs/run-start";
import { moduleEnabled } from "@/lib/project";
import { BookletStart } from "./booklets/booklet-start";

// Project-owned start composition; client-safe code only. Booklets start through
// their own paid admission, so booklet orchestrators are not offered to the
// generic Run start (its admission always refuses them). Other Runs keep the
// unchanged generic landing.
export function ProjectRunStart(props: ComponentProps<typeof RunLanding>) {
  const t = useTranslations("ui");
  if (!moduleEnabled("booklets")) return <RunLanding {...props} />;
  const choices = props.choices.filter(
    (choice) => choice.domainTarget?.kind !== "booklet-production",
  );
  return (
    <div className="page-stack">
      <BookletStart />
      {(choices.length > 0 || props.unfinished.length > 0) && (
        <section aria-labelledby="other-workflows" className="space-y-4">
          <h2
            id="other-workflows"
            className="text-lg font-semibold tracking-tight"
          >
            {t("mdbebb56a8c16")}
          </h2>
          <RunLanding {...props} choices={choices} />
        </section>
      )}
    </div>
  );
}
