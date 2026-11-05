"use client";
import { useEffect, useState } from "react";
import { namespace } from "../project";
import { paymentContext } from "../payment-context";
let marked = false;
export function rememberPlayContext() {
  marked ||=
    document.referrer.startsWith("android-app://") ||
    new URLSearchParams(location.search).get("client") === "play";
  try {
    marked ||= sessionStorage.getItem(namespace("play-context")) === "yes";
    if (marked) sessionStorage.setItem(namespace("play-context"), "yes");
  } catch {
    /* Keep the fail-closed in-memory marker when storage is unavailable. */
  }
  return marked;
}
export function usePaymentContext() {
  const [context, setContext] = useState<"checking" | "web" | "play">(
    "checking",
  );
  useEffect(() => {
    let active = true;
    const browser = window as Window & {
      getDigitalGoodsService?: (method: string) => Promise<unknown>;
    };
    void paymentContext({
      markedPlay: rememberPlayContext(),
      referrer: document.referrer,
      search: location.search,
      digitalGoods: browser.getDigitalGoodsService
        ? () =>
            browser.getDigitalGoodsService!("https://play.google.com/billing")
        : undefined,
    }).then((result) => {
      if (result === "play") {
        marked = true;
        rememberPlayContext();
      }
      if (active) setContext(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return context;
}
