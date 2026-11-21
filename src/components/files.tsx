"use client";
import { BytesLabel, DateLabel, StateLabel, useBytes } from "./localized-value";
import { useTranslations } from "next-intl";

import { useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { sessionRequestSignal } from "@/lib/client/session-lifecycle";
import {
  filePageSchema,
  privateFileSchema,
  uploadStatusSchema,
} from "@/lib/contracts/files";
import {
  EmptyState,
  Notice,
  PageHeader,
  SubmitButton,
} from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// Larger non-image files use resumable part uploads, so they can exceed the
// single-request limit and continue after an interrupted part.
const RESUMABLE_BYTES = 8 * 1024 * 1024;
export function Files({
  initial,
}: {
  initial: z.infer<typeof filePageSchema>;
}) {
  const translate = useTranslations("ui");
  const bytes = useBytes();

  const uploadKey = useRef<string | null>(null);
  // Resumable uploads reuse their key for the same file while the page is open,
  // so pressing Upload again continues from the stored parts.
  const resumableKeys = useRef(new Map<string, string>());
  const [progress, setProgress] = useState<number | null>(null);
  const [page, setPage] = useState(initial),
    [paged, setPaged] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : translate("me6c5c7ec5c6b"));
    } finally {
      setBusy(false);
    }
  }
  async function download(file: z.infer<typeof privateFileSchema>) {
    setError("");
    const session = sessionRequestSignal();
    try {
      const response = await fetch(`/api/files/${file.id}/content`, {
        signal: AbortSignal.any([session, AbortSignal.timeout(60_000)]),
      });
      if (!response.ok) throw new Error("Download request failed");
      const data = await response.blob();
      session.throwIfAborted();
      if (data.size !== file.bytes) throw new Error("Incomplete download");
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!session.aborted) setError(translate("m5fc277959f9a"));
    }
  }
  async function resumableUpload(file: File) {
    const identity = [file.name, file.size, file.lastModified].join(":");
    const key = resumableKeys.current.get(identity) ?? crypto.randomUUID();
    resumableKeys.current.set(identity, key);
    try {
      await uploadParts(file, key);
      resumableKeys.current.delete(identity);
    } catch (error) {
      // A removed or conflicting upload cannot resume; the next attempt starts over.
      if (
        error instanceof ApiError &&
        ["FILE_NOT_FOUND", "UPLOAD_CLOSED", "IDEMPOTENCY_CONFLICT"].includes(
          error.code,
        )
      )
        resumableKeys.current.delete(identity);
      throw error;
    }
  }
  async function uploadParts(file: File, key: string) {
    let status = await api("/api/files/uploads", uploadStatusSchema, {
      method: "POST",
      body: { key, name: file.name, mime: file.type, bytes: file.size },
    });
    const id = status.file.id,
      received = new Set(status.received);
    setProgress(Math.floor((received.size / status.count) * 100));
    for (let n = 0; n < status.count; n++) {
      if (received.has(n)) continue;
      status = await api(
        `/api/files/uploads/${id}/parts/${n}`,
        uploadStatusSchema,
        {
          method: "PUT",
          body: file.slice(n * status.partBytes, (n + 1) * status.partBytes),
          timeoutMs: 60000,
        },
      );
      setProgress(Math.floor((status.received.length / status.count) * 100));
    }
    await api(`/api/files/uploads/${id}/complete`, privateFileSchema, {
      method: "POST",
      timeoutMs: 120000,
    });
  }
  async function refresh(cursor?: string) {
    setPage(
      await api(
        "/api/files" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
        filePageSchema,
      ),
    );
    setPaged(!!cursor);
  }
  return (
    <div className="page-stack">
      <PageHeader
        title={translate("mabc7e9892806")}
        description={translate("meeeb832fdc41", {
          count: page.usage.count,
          size: bytes(page.usage.bytes),
        })}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const file = form.get("file");
          form.set(
            "key",
            uploadKey.current ?? (uploadKey.current = crypto.randomUUID()),
          );
          setUploading(true);
          void perform(async () => {
            try {
              if (
                file instanceof File &&
                file.size > RESUMABLE_BYTES &&
                !file.type.startsWith("image/")
              )
                await resumableUpload(file);
              else
                await api("/api/files", privateFileSchema, {
                  method: "POST",
                  body: form,
                  timeoutMs: 60000,
                });
              uploadKey.current = null;
              await refresh();
            } finally {
              setUploading(false);
              setProgress(null);
            }
          });
        }}
        className="space-y-3"
      >
        <Field>
          <FieldLabel htmlFor="private-file">
            {translate("m6d684ec42aa9")}
          </FieldLabel>
          <div className="flex flex-wrap gap-3">
            <Input
              id="private-file"
              name="file"
              type="file"
              className="max-w-md"
              onChange={() => {
                uploadKey.current = null;
              }}
              required
              disabled={busy}
              accept=".txt,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.mp4"
            />
            <SubmitButton pending={uploading} disabled={busy}>
              {uploading
                ? progress === null
                  ? translate("m7cdfb59cd1d3")
                  : translate("ma505610c7e5b", { percent: progress })
                : translate("m865e89de78d9")}
            </SubmitButton>
          </div>
        </Field>
      </form>
      {error && <Notice tone="error" title={error} />}
      {page.rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{translate("md05e405905a1")}</TableHead>
              <TableHead>{translate("m1eb06f0b8fd8")}</TableHead>
              <TableHead>{translate("mdeb54f8a3538")}</TableHead>
              <TableHead>{translate("meee85bf67468")}</TableHead>
              <TableHead>
                <span className="sr-only">{translate("m7def83024fde")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="max-w-64 whitespace-normal break-words font-medium">
                  {file.name}
                </TableCell>
                <TableCell>
                  <BytesLabel value={file.bytes} />
                </TableCell>
                <TableCell>
                  <StateLabel value={file.state} />
                </TableCell>
                <TableCell>
                  <DateLabel value={file.createdAt} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {file.state === "ready" &&
                      (file.bytes <= RESUMABLE_BYTES ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void download(file)}
                        >
                          {translate("md6eafe823591")}
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <a href={`/api/files/${file.id}/content`} download>
                            {translate("md6eafe823591")}
                          </a>
                        </Button>
                      ))}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            busy ||
                            (file.state !== "ready" && file.state !== "staging")
                          }
                        >
                          {translate("me2d0a54968ea")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {translate("m35b9286c5b55")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {translate("m87fb3548d215", { name: file.name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {translate("m19766ed6ccb2")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              void perform(async () => {
                                await api(
                                  `/api/files/${file.id}`,
                                  z.object({ ok: z.boolean() }),
                                  { method: "DELETE" },
                                );
                                uploadKey.current = null;
                                resumableKeys.current.clear();
                                await refresh();
                              })
                            }
                          >
                            {translate("me2d0a54968ea")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          title={translate("m0bf925c64716")}
          description={translate("m2762059d5404")}
        />
      )}
      {(paged || page.next) && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void perform(() => refresh())}
          >
            {paged ? translate("m5667f952fe11") : translate("m0e9161011702")}
          </Button>
          {page.next && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void perform(() => refresh(page.next!))}
            >
              {translate("mf4df99a92042")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
