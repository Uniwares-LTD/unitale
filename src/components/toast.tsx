"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { toast as sonner } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { scheduleToastExpiry } from "@/lib/toast-timing";
import { cn } from "@/lib/utils";

const tones = {
  confirm: { icon: CircleCheck, style: "bg-success text-success-foreground" },
  info: { icon: Info, style: "bg-info text-info-foreground" },
  error: {
    icon: CircleX,
    style: "border-destructive bg-[var(--card-solid)] text-destructive",
  },
  action: { icon: TriangleAlert, style: "bg-warning text-warning-foreground" },
};

type Kind = keyof typeof tones;

function ToastMessage({
  id,
  kind,
  text,
  opener,
}: {
  id: string | number;
  kind: Kind;
  text: string;
  opener: Element | null;
}) {
  const translate = useTranslations("ui");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const transient = kind === "confirm" || kind === "info";
  const { icon: Icon, style } = tones[kind];

  useEffect(() => {
    if (transient) {
      const duration = getComputedStyle(
        document.documentElement,
      ).getPropertyValue("--toast-confirmation-duration");
      return scheduleToastExpiry(hovered || focused, duration, () =>
        sonner.dismiss(id),
      );
    }
  }, [focused, hovered, id, transient]);

  return (
    <div
      role={transient ? undefined : "alert"}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-3",
        style,
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words text-sm">{text}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          sonner.dismiss(id);
          if (opener instanceof HTMLElement && opener.isConnected)
            opener.focus();
        }}
      >
        {translate("m48845bff334a")}
      </Button>
    </div>
  );
}

let sequence = 0;

function show(kind: Kind, text: string) {
  const opener = document.activeElement;
  const key = ++sequence;
  const transient = kind === "confirm" || kind === "info";
  return sonner.custom(
    (id) => (
      <ToastMessage key={key} id={id} kind={kind} text={text} opener={opener} />
    ),
    { id: transient ? "confirmation" : undefined, duration: Infinity },
  );
}

export const toast = {
  confirm: (text: string) => show("confirm", text),
  info: (text: string) => show("info", text),
  error: (text: string) => show("error", text),
  action: (text: string) => show("action", text),
};

export function AppToaster() {
  const rtl = useLocale() === "ar";
  const translate = useTranslations("ui");
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      dir={rtl ? "rtl" : "ltr"}
      position={rtl ? "bottom-left" : "bottom-right"}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      offset={16}
      mobileOffset={16}
      containerAriaLabel={translate("m788011833a5a")}
      style={{ fontFamily: "var(--type-body)" }}
    />
  );
}
