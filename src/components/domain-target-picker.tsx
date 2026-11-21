"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { z } from "zod";
import { api } from "@/lib/client/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FieldLabel } from "./ui/field";
const pageSchema = z.object({
  rows: z.array(z.object({ id: z.string(), title: z.string() })),
  next: z.string().nullable(),
});
export function DomainTargetPicker({
  metadata,
  disabled,
  onSelected,
}: {
  metadata: { kind: string; label: string; path: string };
  disabled: boolean;
  onSelected: (target: { kind: string; id: string }) => void;
}) {
  const translate = useTranslations("ui");

  const [query, setQuery] = useState(""),
    [page, setPage] = useState<z.infer<typeof pageSchema> | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  async function load(cursor?: string) {
    try {
      setError("");
      const params = new URLSearchParams({
        search: query,
        ...(cursor ? { cursor } : {}),
      });
      setPage(await api(`${metadata.path}?${params}`, pageSchema));
    } catch (e) {
      setError(e instanceof Error ? e.message : translate("m4cdf992620a9"));
    }
  }
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor="domain-target-search">{metadata.label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id="domain-target-search"
          value={query}
          maxLength={100}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void load();
            }
          }}
        />
        <Button type="button" disabled={disabled} onClick={() => void load()}>
          {translate("m49c266baaaa7")}{" "}
        </Button>
      </div>
      {page?.rows.map((row) => (
        <Button
          key={row.id}
          type="button"
          variant={selected === row.id ? "default" : "outline"}
          disabled={disabled}
          onClick={() => {
            setSelected(row.id);
            onSelected({ kind: metadata.kind, id: row.id });
          }}
        >
          {row.title}
        </Button>
      ))}
      {page?.next && (
        <Button
          type="button"
          disabled={disabled}
          onClick={() => void load(page.next!)}
        >
          {translate("mce9b6d8427c8")}{" "}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
