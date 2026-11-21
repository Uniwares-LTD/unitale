"use client";
import { useTranslations } from "next-intl";

import type { ReactNode } from "react";
import type { z } from "zod";
import type { inputFieldSchema } from "@/lib/contracts/runs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Field = z.input<typeof inputFieldSchema>;
type Value = string | number | undefined;

// One orchestrator start input, shared by the start form and restart attempts.
export function RunInputField({
  field,
  id,
  value,
  disabled,
  onChange,
  onFile,
  children,
}: {
  field: Field;
  id: string;
  value: Value;
  disabled?: boolean;
  onChange: (value: string | number) => void;
  onFile: (file: File) => void;
  children?: ReactNode;
}) {
  const translate = useTranslations("ui");
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id}>
        {field.required
          ? translate("m4d2b5b2356c2", { label: field.label })
          : field.label}
      </FieldLabel>
      {field.kind === "paragraph" ? (
        <Textarea
          id={id}
          name={field.name}
          autoComplete="off"
          required={field.required}
          disabled={disabled}
          maxLength={field.maxLength ?? 4000}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "select" ? (
        <Select
          value={String(value ?? "")}
          disabled={disabled}
          onValueChange={onChange}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={translate("maef4076f194a")} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          name={field.name}
          autoComplete="off"
          required={field.required && !(field.kind === "file" && value)}
          disabled={disabled}
          type={
            field.kind === "file"
              ? "file"
              : field.kind === "number"
                ? "number"
                : "text"
          }
          step={field.kind === "number" ? "any" : undefined}
          maxLength={
            field.kind === "text" ? (field.maxLength ?? 4000) : undefined
          }
          {...(field.kind === "file" ? {} : { value: value ?? "" })}
          onChange={(e) => {
            if (field.kind === "file") {
              if (e.target.files?.[0]) onFile(e.target.files[0]);
            } else
              onChange(
                field.kind === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value,
              );
          }}
        />
      )}
      {children}
    </div>
  );
}
