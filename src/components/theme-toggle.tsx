"use client";
import { useTranslations } from "next-intl";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Compact light/dark switch for focused pages. It changes this browser's colour
// mode only (like a Preferences preview); saving to the account stays in
// Preferences. The name and icon describe the next appearance.
export function ThemeToggle() {
  const translate = useTranslations("ui");
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const dark = hydrated && resolvedTheme === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-(--control-touch-sm)"
      disabled={!hydrated}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={
        dark ? translate("m2f740f4cf688") : translate("m8abe9e0ba6b6")
      }
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
