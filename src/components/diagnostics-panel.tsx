"use client";
import { useTranslations } from "next-intl";

import { namespace } from "@/lib/project";
import { useState, useSyncExternalStore } from "react";
import { diagnostics } from "@/lib/client/diagnostics";
import { Notice } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export function DiagnosticsPanel() {
  const translate = useTranslations("ui");
  const common = useTranslations("common");

  const enabled = useSyncExternalStore(
    diagnostics.subscribe,
    diagnostics.isEnabled,
    () => false,
  );
  const count = useSyncExternalStore(
    diagnostics.subscribe,
    () => diagnostics.entries().length,
    () => 0,
  );
  const [downloadFailed, setDownloadFailed] = useState(false);
  function download() {
    setDownloadFailed(false);
    try {
      const url = URL.createObjectURL(
        new Blob([diagnostics.export()], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = namespace("diagnostics.json");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadFailed(true);
    }
  }
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>{translate("m6a8576dff840")}</CardTitle>
        <CardDescription>{translate("m1e55606bd490")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status">
          {enabled
            ? common("diagnosticCount", { count })
            : translate("mdb00d1b43aba")}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            aria-pressed={enabled}
            onClick={() => diagnostics.setEnabled(!enabled)}
          >
            {enabled ? translate("md21efe50cdaf") : translate("m6b72b5f69f4a")}
          </Button>
          <Button
            variant="outline"
            disabled={!enabled || count === 0}
            onClick={download}
          >
            {translate("mb4205182f0eb")}
          </Button>
        </div>
        {downloadFailed && (
          <Notice tone="error" title={translate("m5fc277959f9a")} />
        )}
      </CardContent>
    </Card>
  );
}
