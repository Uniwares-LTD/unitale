"use client";
import { useTranslations } from "next-intl";

import { Notice, SubmitButton } from "./page-patterns";
import { toast } from "./toast";
import { useLeaveGuard } from "./leave-guard";
import { useActionState, useRef, useState } from "react";
import { saveProfile } from "@/app/account/actions";
import type { Profile } from "@/lib/contracts/profile";
import { Field, FieldLabel, FieldTitle } from "./ui/field";
import { Input } from "./ui/input";

export function ProfileForm({ profile }: { profile: Profile }) {
  const translate = useTranslations("ui");

  const [state, action, pending] = useActionState(
    async (previous: { message: string; saved: boolean }, form: FormData) => {
      const result = await saveProfile(profile.uid, previous, form);
      if (result.saved) toast.confirm(result.message);
      return result;
    },
    { message: "", saved: false },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  useLeaveGuard({
    dirty: displayName.trim() !== profile.displayName,
    save: async () => {
      const form = formRef.current;
      if (!form || pending || !form.checkValidity()) return "failed";
      const result = await saveProfile(profile.uid, state, new FormData(form));
      return result.saved ? "saved" : "failed";
    },
  });

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <Field>
        <FieldLabel htmlFor="displayName">
          {translate("m2b7f6a84de91")}
        </FieldLabel>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="name"
          minLength={1}
          maxLength={80}
          required
          disabled={pending}
        />
      </Field>
      <Field>
        <FieldTitle>{translate("m969ccbd3cf63")}</FieldTitle>
        <p className="break-all text-sm">
          <bdi>{profile.email}</bdi>
        </p>
      </Field>
      <SubmitButton pending={pending}>
        {pending ? translate("m23e39291d613") : translate("m0c8209e72ec8")}
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
