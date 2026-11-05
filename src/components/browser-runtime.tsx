"use client";
import { rememberPlayContext } from "@/lib/client/payment-context";
import { project } from "@/lib/project";
import { useEffect } from "react";
import { diagnostics } from "@/lib/client/diagnostics";

export function BrowserRuntime({
  preferredLocale,
}: {
  preferredLocale: string;
}) {
  useEffect(() => {
    rememberPlayContext();
    try {
      localStorage.setItem(`${project.slug}-offline-locale`, preferredLocale);
    } catch {}
  }, [preferredLocale]);
  useEffect(() => {
    // Listeners observe only event types; never suppress browser/React handling.
    const error = () => diagnostics.record("browser-error");
    const rejection = () => diagnostics.record("unhandled-rejection");
    const online = () => diagnostics.record("online");
    const offline = () => diagnostics.record("offline");
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", rejection);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register(`/sw.js?namespace=${project.slug}`, {
          scope: "/",
          updateViaCache: "none",
        })
        .then(
          () => diagnostics.record("worker-ready"),
          () => diagnostics.record("worker-failed"),
        );
    }
    return () => {
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", rejection);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  return null;
}
