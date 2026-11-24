"use client";

import {
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function subscribeToKeyboard(callback: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", callback);
  document.addEventListener("focusin", callback);
  document.addEventListener("focusout", callback);
  return () => {
    viewport?.removeEventListener("resize", callback);
    document.removeEventListener("focusin", callback);
    document.removeEventListener("focusout", callback);
  };
}

function keyboardOccludesDock() {
  const viewport = window.visualViewport;
  return (
    !!viewport &&
    viewport.scale === 1 &&
    window.innerWidth < 700 &&
    window.innerHeight - viewport.height > 100 &&
    !!document.activeElement?.closest(
      '[data-slot="composer"][data-size="dock"]',
    )
  );
}

export function useDockKeyboardOpen() {
  return useSyncExternalStore(
    subscribeToKeyboard,
    keyboardOccludesDock,
    () => false,
  );
}

/**
 * The Unitale question dock surface: the current question, its choices and the
 * dock composer stay visibly connected above the transcript.
 */
export function ConversationDock({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="conversation-dock"
      className="space-y-3 rounded-(--x-unitale-radius-dialog) border bg-card p-3 text-card-foreground shadow-(--x-unitale-shadow-raised)"
    >
      {children}
    </div>
  );
}

/**
 * Unitale composer (design package: Entry and Message & question dock).
 * One surface with a growing text field and a Send action. Enter sends,
 * Shift+Enter adds a line and IME composition never sends. The owner keeps
 * the draft and clears it only after the send is acknowledged.
 */
export function Composer({
  id,
  value,
  onChange,
  onSend,
  canSend,
  pending = false,
  readOnly = false,
  disabled = false,
  placeholder,
  label,
  labelledBy,
  describedBy,
  sendLabel,
  size = "dock",
  maxLength,
  inputRef,
  footer,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Whether Send is offered; typing stays available while it is not. */
  canSend: boolean;
  /** A send is in flight: Send shows progress and the text is held read-only. */
  pending?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder: string;
  /** Accessible label when no visible element labels the field. */
  label?: string;
  /** ID of a visible element (question or target) that labels the field. */
  labelledBy?: string;
  describedBy?: string;
  sendLabel: string;
  /** `entry` is the opening idea composer; `dock` the conversation reply. */
  size?: "entry" | "dock";
  maxLength?: number;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Supporting content beside Send (entry hint or alternate action). */
  footer?: ReactNode;
  className?: string;
}) {
  const send = () => {
    if (canSend && !pending) onSend();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    send();
  };
  const action = (
    <Button
      type="button"
      size="icon"
      className="size-(--control-touch-sm) shrink-0 rounded-full"
      onClick={send}
      disabled={!canSend && !pending}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      aria-label={sendLabel}
    >
      {pending ? (
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <ArrowUp aria-hidden="true" />
      )}
    </Button>
  );
  return (
    <div
      data-slot="composer"
      data-size={size}
      className={cn(
        "border",
        "has-[textarea:focus-visible]:outline-(length:--x-unitale-focus-width) has-[textarea:focus-visible]:outline-offset-(--x-unitale-focus-offset) has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
        // Entry is a raised surface; the dock composer is an inset field inside
        // the ConversationDock surface.
        size === "entry"
          ? "rounded-(--x-unitale-radius-dialog) bg-card p-4 text-card-foreground shadow-(--x-unitale-shadow-raised) sm:p-6"
          : "rounded-(--x-unitale-radius-card) bg-background p-1.5 ps-3",
        className,
      )}
    >
      {label && !labelledBy && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className={cn(size === "dock" && "flex items-end gap-2")}>
        <Textarea
          id={id}
          ref={inputRef}
          size="lg"
          rows={size === "entry" ? 3 : 1}
          value={value}
          maxLength={maxLength}
          readOnly={readOnly || pending}
          disabled={disabled}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            // The composer surface carries the border and focus indication.
            "resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent",
            // Override the large field's own spacing; its 1rem text is the field role.
            size === "entry"
              ? "max-h-56 ring-0 data-[size=lg]:px-0"
              : "max-h-36 data-[size=lg]:min-h-(--control-touch-sm) data-[size=lg]:px-0 data-[size=lg]:py-2.5",
          )}
        />
        {size === "dock" && action}
      </div>
      {size === "entry" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">{footer}</div>
          {action}
        </div>
      )}
      {size === "dock" && footer}
    </div>
  );
}
