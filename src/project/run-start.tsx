"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { RunLanding } from "@/components/runs/run-start";
import { moduleEnabled } from "@/lib/project";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
      <div>
        <Button asChild>
          <Link href="/books/new">{t("ma0c29655f13c")}</Link>
        </Button>
      </div>
      {(choices.length > 0 || props.unfinished.length > 0) && (
        <section aria-labelledby="other-workflows" className="space-y-4">
          <h2 id="other-workflows" className="text-section-title">
            {t("mdbebb56a8c16")}
          </h2>
          <RunLanding {...props} choices={choices} />
        </section>
      )}
    </div>
  );
}
