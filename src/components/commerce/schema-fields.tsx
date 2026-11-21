"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export type FormSchema = {
  type?: string;
  title?: string;
  properties?: Record<string, FormSchema>;
  items?: FormSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: FormSchema[];
  oneOf?: FormSchema[];
  required?: string[];
  additionalProperties?: unknown;
  $ref?: string;
  format?: string;
  default?: unknown;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
};
export function initialValue(schema: FormSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  const union = schema.oneOf ?? schema.anyOf;
  if (union)
    return initialValue(union.find((v) => v.type === "null") ?? union[0]);
  if (schema.enum) return schema.enum[0];
  if (schema.type === "object")
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [
        key,
        initialValue(value),
      ]),
    );
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "null") return null;
  if (schema.type === "number" || schema.type === "integer")
    return (
      schema.minimum ??
      (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 0)
    );
  return "";
}
const labelText = (value: string) =>
  value.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase());
export function SchemaFields({
  schema,
  value,
  onChange,
  label,
  disabled = false,
}: {
  schema: FormSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const choices = schema.oneOf ?? schema.anyOf;
  if (choices) {
    const selected = Math.max(
      0,
      choices.findIndex((c) =>
        c.type === "null"
          ? value === null
          : c.properties?.kind?.const !== undefined
            ? (value as { kind?: unknown })?.kind === c.properties.kind.const
            : c.type === typeof value ||
              (c.type === "object" &&
                value !== null &&
                typeof value === "object"),
      ),
    );
    return (
      <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{labelText(label)}</legend>
        <FieldLabel htmlFor={id}>Variant</FieldLabel>
        <select
          id={id}
          className="h-10 w-full rounded-md border bg-background px-3"
          value={selected}
          onChange={(e) =>
            onChange(initialValue(choices[Number(e.target.value)]))
          }
        >
          {choices.map((c, i) => (
            <option key={i} value={i}>
              {String(
                c.properties?.kind?.const ??
                  (c.type === "null"
                    ? "None / no expiry"
                    : (c.type ?? "Value")),
              )}
            </option>
          ))}
        </select>
        <SchemaFields
          schema={choices[selected]}
          value={value}
          onChange={onChange}
          label={label}
          disabled={disabled}
        />
      </fieldset>
    );
  }
  if (schema.const !== undefined || schema.type === "null")
    return (
      <p className="text-sm text-muted-foreground">
        {labelText(label)}: {String(schema.const ?? "None")}
      </p>
    );
  if (schema.type === "object" && schema.properties) {
    const object =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    return (
      <fieldset
        disabled={disabled}
        className="grid gap-3 rounded-lg border p-3"
      >
        <legend className="px-1 text-sm font-medium">{labelText(label)}</legend>
        {Object.entries(schema.properties).map(([key, child]) => (
          <SchemaFields
            key={key}
            schema={child}
            value={object[key]}
            label={key}
            disabled={disabled}
            onChange={(next) => onChange({ ...object, [key]: next })}
          />
        ))}
      </fieldset>
    );
  }
  if (schema.type === "array" && schema.items) {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{labelText(label)}</legend>
        {items.map((item, index) => (
          <div className="space-y-2" key={index}>
            <SchemaFields
              schema={schema.items!}
              value={item}
              label={`${label} ${index + 1}`}
              disabled={disabled}
              onChange={(next) =>
                onChange(items.map((old, i) => (i === index ? next : old)))
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Remove {index + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...items, initialValue(schema.items!)])}
        >
          Add {labelText(label)}
        </Button>
      </fieldset>
    );
  }
  if (!schema.type || schema.type === "object" || schema.$ref)
    return (
      <div className="space-y-2">
        <FieldLabel htmlFor={id}>{labelText(label)} (JSON)</FieldLabel>
        <Textarea
          id={id}
          disabled={disabled}
          key={JSON.stringify(value)}
          defaultValue={JSON.stringify(value ?? {}, null, 2)}
          onBlur={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
              e.target.setCustomValidity("");
            } catch {
              e.target.setCustomValidity("Enter valid JSON.");
              e.target.reportValidity();
            }
          }}
        />
      </div>
    );
  if (schema.enum)
    return (
      <div className="space-y-2">
        <FieldLabel htmlFor={id}>{labelText(label)}</FieldLabel>
        <select
          id={id}
          disabled={disabled}
          className="h-10 w-full rounded-md border bg-background px-3"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {schema.enum.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      </div>
    );
  if (schema.type === "boolean")
    return (
      <FieldLabel className="flex items-center gap-2" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {labelText(label)}
      </FieldLabel>
    );
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id}>{labelText(label)}</FieldLabel>
      <Input
        id={id}
        disabled={disabled}
        type={["integer", "number"].includes(schema.type) ? "number" : "text"}
        min={
          schema.minimum ??
          (schema.exclusiveMinimum !== undefined
            ? schema.exclusiveMinimum + 1
            : undefined)
        }
        max={schema.maximum}
        step={schema.type === "integer" ? 1 : "any"}
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        placeholder={
          schema.format === "date-time" ? "2026-11-04T00:00:00Z" : undefined
        }
        onChange={(e) =>
          onChange(
            ["integer", "number"].includes(schema.type!)
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </div>
  );
}
