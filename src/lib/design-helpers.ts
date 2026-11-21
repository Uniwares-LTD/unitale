// Pure logic behind the shared design-system helpers (design-system adoption U2, #53).
// Components stay thin; these rules are unit-tested without a DOM (plan decision P-06).

/** IDs and `aria-describedby` for a Field (spec §2): help first, then error when shown. */
export function fieldIds(id: string) {
  return { help: `${id}-help`, error: `${id}-error` };
}

export function describedBy(
  id: string,
  { help, error }: { help: boolean; error: boolean },
): string | undefined {
  const ids = fieldIds(id);
  const parts = [help && ids.help, error && ids.error].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

/** Field error display (spec §2): shown after a submit attempt or a server result, cleared on input. */
export type FieldErrorState = { message: string | null };
export type FieldErrorEvent =
  | { type: "invalid"; message: string }
  | { type: "server"; message: string }
  | { type: "input" };

export function fieldError(
  _state: FieldErrorState,
  event: FieldErrorEvent,
): FieldErrorState {
  if (event.type === "input") return { message: null };
  return { message: event.message };
}

/** Pending submit (spec §5): a second activation while pending is ignored. */
export function acceptSubmit(pending: boolean): boolean {
  return !pending;
}

/** Leave guard (spec §6). */
export type SaveResult = "saved" | "failed" | "unknown";
export type LeavePhase = "closed" | "open" | "saving" | "failed" | "unknown";
export type LeaveState = {
  phase: LeavePhase;
  /** The navigation the user asked for; cleared when cancelled. */
  intent: string | null;
};
export type LeaveEvent =
  | { type: "navigate"; href: string; dirty: boolean }
  | { type: "keep" }
  | { type: "save" }
  | { type: "saveResult"; result: SaveResult }
  | { type: "discard" };
export type LeaveEffect = { go?: string };

export function leaveGuard(
  state: LeaveState,
  event: LeaveEvent,
): { state: LeaveState; effect: LeaveEffect } {
  switch (event.type) {
    case "navigate":
      // A clean form navigates normally; a dirty one opens the dialog.
      if (!event.dirty) return { state, effect: { go: event.href } };
      return { state: { phase: "open", intent: event.href }, effect: {} };
    case "keep":
      // Keep editing or Escape closes the dialog and cancels the intention, never the save.
      return { state: { phase: "closed", intent: null }, effect: {} };
    case "save":
      if (state.phase === "unknown" || state.phase === "closed")
        return { state, effect: {} };
      return { state: { ...state, phase: "saving" }, effect: {} };
    case "saveResult":
      if (event.result === "saved") {
        // Navigate only if the intention is still active.
        return {
          state: { phase: "closed", intent: null },
          effect: state.intent ? { go: state.intent } : {},
        };
      }
      if (event.result === "failed") {
        if (state.intent === null) return { state, effect: {} };
        return { state: { ...state, phase: "failed" }, effect: {} };
      }
      // Unknown outcome: stay; if the dialog is still open, show only Keep editing; cancel the intention.
      if (state.phase === "closed") return { state, effect: {} };
      return { state: { phase: "unknown", intent: null }, effect: {} };
    case "discard":
      if (state.phase === "saving" || state.phase === "unknown")
        return { state, effect: {} };
      return {
        state: { phase: "closed", intent: null },
        effect: state.intent ? { go: state.intent } : {},
      };
  }
}

/** Which dialog actions are offered (spec §6 behaviour table). */
export function leaveActions(phase: LeavePhase, canSave: boolean) {
  if (phase === "unknown")
    return { keep: true, save: false, discard: false, discardDisabled: true };
  return {
    keep: true,
    save: canSave,
    discard: true,
    discardDisabled: phase === "saving",
  };
}

/** Missing media (spec §8). */
export function mediaState(
  src: string | null | undefined,
  failed: boolean,
): "image" | "missing" | "failed" {
  if (!src) return "missing";
  return failed ? "failed" : "image";
}

/** Notice action (spec §11, decisions P-16 to P-18). */
export type NoticeActionState = "available" | "pending" | "success" | "failed";
export function noticeAction(
  state: NoticeActionState,
  labels: { available: string; pending: string; success: string },
) {
  const label =
    state === "pending"
      ? labels.pending
      : state === "success"
        ? labels.success
        : labels.available;
  const activatable = state === "available" || state === "failed";
  return {
    label,
    activatable,
    ariaDisabled: !activatable,
    ariaBusy: state === "pending",
  };
}
