"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "./ui/button";
import { FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";
import { Notice } from "./page-patterns";
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
} from "./ui/alert-dialog";

export function AiResolution({
  jobId,
  canAccept,
}: {
  jobId: string;
  canAccept: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  async function resolve(decision: "accept" | "release") {
    setBusy(true);
    setMessage(null);
    try {
      await api(
        `/api/admin/ai/jobs/${jobId}/resolve`,
        z.object({ resolved: z.literal(true) }),
        {
          method: "POST",
          body: { decision, reason, acknowledgeProviderMayStillRun: true },
        },
      );
      router.refresh();
      setMessage({ tone: "success", text: "Resolution recorded." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof ApiError
            ? error.message
            : "Could not confirm the resolution. Refresh before retrying.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <FieldLabel htmlFor={id}>Resolution explanation (optional)</FieldLabel>
      <Textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        disabled={busy}
        placeholder="Record the evidence and reason for this decision."
      />
      <div className="flex flex-wrap gap-2">
        {canAccept && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={busy}>
                Accept saved result and settle its calculated charge
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Accept this result and charge the user?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This settles the calculated charge from the user&apos;s
                  reserved credits and closes the review. It is recorded in the
                  audit log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep reserved</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void resolve("accept");
                  }}
                >
                  Accept and charge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={busy}>
              Resolve attempt and release credits
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Release the user’s credits?</AlertDialogTitle>
              <AlertDialogDescription>
                This records an audited credit waiver and allows a new attempt.
                It does not stop provider work that may still be running, so
                costs can still accrue and work may be duplicated.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep reserved</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void resolve("release");
                }}
              >
                Release credits
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {message && <Notice tone={message.tone} title={message.text} />}
    </div>
  );
}
