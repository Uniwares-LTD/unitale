"use client";
import { StateLabel } from "./localized-value";
import { useTranslations } from "next-intl";

import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { saveAppearance } from "@/app/account/actions";
import type { Profile } from "@/lib/contracts/profile";
import { Notice, SubmitButton } from "./page-patterns";
import { useLeaveGuard } from "./leave-guard";
import { useStyle } from "./style-provider";
import { StylePreference } from "./style-preference";
import {
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./ui/field";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";

const subscribe = () => () => {};

export function AppearanceForm({ profile }: { profile: Profile }) {
  const translate = useTranslations("ui");

  // Show and save this browser's current look; the account look is applied at
  // sign-in, so opening this page never overrides a choice made here.
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { preference, projectTheme } = useStyle();
  const currentTheme = theme ?? profile.theme;
  const formRef = useRef<HTMLFormElement>(null);
  const [baseline, setBaseline] = useState<{ theme: string; style: string }>();
  const dirty = Boolean(
    baseline &&
    (baseline.theme !== currentTheme || baseline.style !== preference),
  );
  function markEdit() {
    setBaseline(
      (previous) => previous ?? { theme: currentTheme, style: preference },
    );
  }

  const [state, action, pending] = useActionState(
    async (previous: { message: string; saved: boolean }, form: FormData) => {
      const result = await saveAppearance(profile.uid, previous, form);
      if (result.saved) setBaseline(undefined);
      return result;
    },
    { message: "", saved: false },
  );
  useLeaveGuard({
    dirty,
    save: async () => {
      const form = formRef.current;
      if (!form || pending || !hydrated || !form.checkValidity())
        return "failed";
      const result = await saveAppearance(
        profile.uid,
        state,
        new FormData(form),
      );
      if (result.saved) setBaseline(undefined);
      return result.saved ? "saved" : "failed";
    },
  });

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-6"
      onResetCapture={(event) => {
        // Prevent form resets from restoring the old Radix value after a save.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <FieldSet className="space-y-3">
        <FieldLegend className="text-sm font-medium">
          {translate("m9f1e7d7d98b2")}
        </FieldLegend>
        <RadioGroup
          name="theme"
          value={hydrated ? currentTheme : ""}
          onValueChange={(next) => {
            markEdit();
            setTheme(next);
          }}
          aria-describedby="profile-theme-help"
          disabled={pending || !hydrated}
        >
          {["light", "dark", "system"].map((theme) => (
            <div key={theme} className="flex items-center gap-2">
              <RadioGroupItem id={`profile-${theme}`} value={theme} />
              <FieldLabel htmlFor={`profile-${theme}`}>
                <StateLabel value={theme} />
              </FieldLabel>
            </div>
          ))}
        </RadioGroup>
        <FieldDescription id="profile-theme-help">
          {translate("m64c7a3da6a24")}
        </FieldDescription>
      </FieldSet>
      {!projectTheme && (
        <StylePreference
          account
          disabled={pending}
          onPreferenceChange={markEdit}
        />
      )}
      <SubmitButton pending={pending} disabled={!hydrated}>
        {pending ? translate("m23e39291d613") : translate("m089e57e38f93")}
      </SubmitButton>
      {state.message && (
        <Notice
          tone={state.saved ? "success" : "error"}
          title={state.message}
        />
      )}
    </form>
  );
}
