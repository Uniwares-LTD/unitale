"use client";
// Sample: notes. Owned list with create and delete through /api/notes.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { EmptyState, Notice, SubmitButton } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { noteSchema, type Note } from "./contract";

export function NotesPanel({ initial }: { initial: Note[] }) {
  const translate = useTranslations("ui");
  const [notes, setNotes] = useState(initial),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState<"" | "limit" | "failed">("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailed("");
    try {
      await action();
    } catch (error) {
      setFailed(
        error instanceof ApiError && error.code === "NOTE_LIMIT"
          ? "limit"
          : "failed",
      );
    } finally {
      setBusy(false);
    }
  }
  const add = () =>
    run(async () => {
      const note = await api("/api/notes", noteSchema, {
        method: "POST",
        body: { title, body },
      });
      setNotes((rows) => [note, ...rows]);
      setTitle("");
      setBody("");
    });
  const remove = (id: string) =>
    run(async () => {
      await api(`/api/notes/${id}`, z.strictObject({ ok: z.literal(true) }), {
        method: "DELETE",
      });
      setNotes((rows) => rows.filter((row) => row.id !== id));
    });
  return (
    <div className="page-stack">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{translate("m76ea482f843e")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Field>
              <FieldLabel htmlFor="note-title">
                {translate("m7e8cd2056da7")}
              </FieldLabel>
              <Input
                id="note-title"
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="note-body">
                {translate("md8da2c49df39")}
              </FieldLabel>
              <Textarea
                id="note-body"
                maxLength={5000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
            <SubmitButton pending={busy} disabled={!title.trim()}>
              {translate("m63565c0485fe")}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      {failed && (
        <Notice
          tone="error"
          // Literal translate("m…") calls keep both keys in the page inventory.
          title={
            failed === "limit"
              ? translate("m393509c1225a")
              : translate("mb64495b0aa67")
          }
        />
      )}
      <section aria-labelledby="notes-heading" className="space-y-3">
        <h2 id="notes-heading" className="text-lg font-semibold">
          {translate("m55576676783c")}
        </h2>
        {notes.length ? (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id}>
                <Card className="shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <CardTitle className="break-words">{note.title}</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-label={translate("mb4c7358981b6", {
                        title: note.title,
                      })}
                      onClick={() => void remove(note.id)}
                    >
                      {translate("me2d0a54968ea")}
                    </Button>
                  </CardHeader>
                  {note.body && (
                    <CardContent className="whitespace-pre-wrap break-words">
                      {note.body}
                    </CardContent>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={translate("m57bde4deb215")}
            description={translate("m8ee11db3ff88")}
          />
        )}
      </section>
    </div>
  );
}
