"use client";

import { useEffect, useId, useState } from "react";
import { useFormatter } from "next-intl";
import { api } from "@/lib/client/api";
import {
  workflowVersionsSchema,
  type WorkflowVersionSelection,
  type WorkflowVersions,
} from "@/lib/contracts/workflow-versions";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WorkflowVersionPicker({
  appId,
  currentWorkflowId,
  label,
  disabled,
  onRegister,
  copy = false,
}: {
  appId: string;
  currentWorkflowId?: string;
  label: string;
  disabled: boolean;
  onRegister: (selection?: WorkflowVersionSelection) => void;
  copy?: boolean;
}) {
  const format = useFormatter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [versions, setVersions] = useState<
    (WorkflowVersions["versions"][number] & { page: number })[]
  >([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api(
          "/api/admin/orchestrators/manage",
          workflowVersionsSchema,
          {
            method: "POST",
            body: { action: "versions", appId, page },
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) return;
        setVersions((prior) => [
          ...prior.filter(
            (row) => !result.versions.some((item) => item.id === row.id),
          ),
          ...result.versions.map((row) => ({ ...row, page: result.page })),
        ]);
        setHasMore(result.hasMore);
        if (result.versions.some((row) => row.id === currentWorkflowId))
          setSelected((prior) => prior || currentWorkflowId!);
      } catch {
        if (!controller.signal.aborted)
          setError("Versions could not be loaded. Close and reopen to retry.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [open, appId, page, currentWorkflowId]);
  const chosen = versions.find((row) => row.id === selected);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setVersions([]);
          setSelected("");
          setPage(1);
          setHasMore(false);
          setError("");
          setLoading(true);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose workflow version</DialogTitle>
          <DialogDescription>
            Choose the version for future Runs. Accepted Runs keep their saved
            version.
          </DialogDescription>
        </DialogHeader>
        {currentWorkflowId && (
          <p className="break-all text-sm">
            {"Current registered version: " + currentWorkflowId}
          </p>
        )}
        <FieldLabel htmlFor={id}>Workflow version</FieldLabel>
        <Select value={selected} onValueChange={setSelected} disabled={loading}>
          <SelectTrigger id={id} className="w-full min-w-0">
            <SelectValue placeholder="Select a version" />
          </SelectTrigger>
          <SelectContent>
            {!copy && (
              <SelectItem value="draft">
                Saved draft — publish if changed
              </SelectItem>
            )}
            {versions.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name ||
                  (row.number == null ? row.version : `#${row.number}`)}{" "}
                ·{" "}
                {format.dateTime(new Date(row.createdAt * 1000), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {row.id.slice(0, 8)}
                {row.id === currentWorkflowId ? ` · ${"Current"}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected === "draft" && (
          <p className="text-sm text-muted-foreground">
            This publishes the saved Dify draft if it has changed, then
            registers it for new Runs.
          </p>
        )}
        {chosen && <p className="break-all text-sm">{chosen.id}</p>}
        {loading && <p role="status">Loading versions…</p>}
        {error && <p role="alert">{error}</p>}
        {error ? (
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
            }}
          >
            Close
          </Button>
        ) : (
          hasMore && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Load more versions
            </Button>
          )
        )}
        <DialogFooter>
          <Button
            disabled={disabled || loading || (selected !== "draft" && !chosen)}
            onClick={() => {
              setOpen(false);
              onRegister(
                chosen
                  ? { workflowId: chosen.id, page: chosen.page }
                  : undefined,
              );
            }}
          >
            {copy
              ? "Create a copy for this environment"
              : "Register selected version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
