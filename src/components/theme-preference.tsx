"use client";
import { useTranslations } from "next-intl";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemePreference() {
  const translate = useTranslations("ui");
  const choices = [
    {
      value: "light",
      label: translate("mdbcd5e7bb7a0"),
      description: translate("m050f41d569ea"),
      Icon: Sun,
    },
    {
      value: "dark",
      label: translate("m60acc53f13a5"),
      description: translate("m9b817c6aee43"),
      Icon: Moon,
    },
    {
      value: "system",
      label: translate("m6725e7bbcd28"),
      description: translate("mf07f0ce5b4d1"),
      Icon: Monitor,
    },
  ];

  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  return (
    <FieldSet>
      <FieldLegend className="mb-4 text-sm font-medium">
        {translate("m9f1e7d7d98b2")}
      </FieldLegend>
      <RadioGroup
        aria-label={translate("m9f1e7d7d98b2")}
        value={hydrated ? (theme ?? "system") : ""}
        onValueChange={setTheme}
        disabled={!hydrated}
        className="grid gap-3 sm:grid-cols-3"
      >
        {choices.map(({ value, label, description, Icon }) => (
          <FieldLabel
            key={value}
            htmlFor={`theme-${value}`}
            className="flex cursor-pointer flex-col gap-5 rounded-xl border bg-background p-5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none"
          >
            <span className="flex items-center justify-between">
              <Icon
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
              <RadioGroupItem
                value={value}
                id={`theme-${value}`}
                aria-label={label}
              />
            </span>
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {description}
              </span>
            </span>
          </FieldLabel>
        ))}
      </RadioGroup>
      <p className="mt-5 text-sm text-muted-foreground" aria-live="polite">
        {hydrated ? translate("m77c9c9700543") : translate("mbd1b173b26a7")}
      </p>
    </FieldSet>
  );
}
