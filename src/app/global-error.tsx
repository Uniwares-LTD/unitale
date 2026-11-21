"use client";
import { project } from "@/lib/project";
import recovery from "../../messages/recovery.json";
import { localeCookie, resolveLocale, presentationLocale } from "@/lib/locale";
import { useEffect, useSyncExternalStore } from "react";
import { diagnostics } from "@/lib/client/diagnostics";
import { Button } from "@/components/ui/button";
import "./globals.css";
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const locale = useSyncExternalStore<"en" | "ar">(
    () => () => {},
    () =>
      presentationLocale(
        resolveLocale(
          document.cookie
            .split("; ")
            .find((v) => v.startsWith(localeCookie + "="))
            ?.split("=")[1],
          undefined,
          navigator.language,
        ),
        location.pathname,
      ),
    () => "en",
  );
  const text = recovery[locale];
  useEffect(() => {
    diagnostics.record("global-error");
  }, []);
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-project={project.theme ? project.slug : undefined}
    >
      <body className="bg-background font-sans text-foreground">
        <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6 py-12">
          <h1 className="font-heading text-3xl">{text.failure}</h1>
          <p className="mt-4 text-muted-foreground">{text.retryHelp}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={retry} className="h-11">
              {text.retry}
            </Button>
            <Button variant="outline" asChild className="h-11">
              {/* A full document navigation recovers even if the root layout failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/">{text.home}</a>
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
