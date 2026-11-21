"use client";
import { useTranslations } from "next-intl";

import { useId } from "react";
import type { personaChoices } from "@/lib/server/runs/personas";
import { FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AnswererSelect({
  personas,
  value,
  onChange,
  disabled = false,
}: {
  personas: Awaited<ReturnType<typeof personaChoices>>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const translate = useTranslations("ui");

  const id = useId();
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id}>{translate("mbe4cc95114f3")}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">{translate("mb512d97e7cbf")}</SelectItem>
          {personas.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
