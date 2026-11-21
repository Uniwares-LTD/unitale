import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptSubmit,
  describedBy,
  fieldError,
  leaveActions,
  leaveGuard,
  mediaState,
  noticeAction,
  type LeaveState,
} from "../src/lib/design-helpers";

test("Field describedBy lists help, then error when shown", () => {
  assert.equal(describedBy("name", { help: false, error: false }), undefined);
  assert.equal(describedBy("name", { help: true, error: false }), "name-help");
  assert.equal(describedBy("name", { help: false, error: true }), "name-error");
  assert.equal(
    describedBy("name", { help: true, error: true }),
    "name-help name-error",
  );
});

test("Field error appears on invalid or server result and clears on input", () => {
  let state = fieldError(
    { message: null },
    { type: "invalid", message: "Required" },
  );
  assert.equal(state.message, "Required");
  state = fieldError(state, { type: "input" });
  assert.equal(state.message, null);
  state = fieldError(state, { type: "server", message: "Taken" });
  assert.equal(state.message, "Taken");
});

test("Pending submit ignores a second activation", () => {
  assert.equal(acceptSubmit(false), true);
  assert.equal(acceptSubmit(true), false);
});

const closed: LeaveState = { phase: "closed", intent: null };

test("Leave guard: a clean form navigates without a dialog", () => {
  const r = leaveGuard(closed, {
    type: "navigate",
    href: "/runs",
    dirty: false,
  });
  assert.deepEqual(r.effect, { go: "/runs" });
  assert.equal(r.state.phase, "closed");
});

test("Leave guard: dirty opens the dialog; Keep editing cancels the intention", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/runs",
    dirty: true,
  });
  assert.deepEqual(open.state, { phase: "open", intent: "/runs" });
  assert.deepEqual(open.effect, {});
  const keep = leaveGuard(open.state, { type: "keep" });
  assert.deepEqual(keep.state, closed);
  assert.deepEqual(keep.effect, {});
});

test("Leave guard: Discard & exit navigates", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/a",
    dirty: true,
  }).state;
  assert.deepEqual(leaveGuard(open, { type: "discard" }).effect, { go: "/a" });
});

test("Leave guard: save succeeds and navigates while the intention is active", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/a",
    dirty: true,
  }).state;
  const saving = leaveGuard(open, { type: "save" }).state;
  assert.equal(saving.phase, "saving");
  const done = leaveGuard(saving, { type: "saveResult", result: "saved" });
  assert.deepEqual(done.effect, { go: "/a" });
  assert.equal(done.state.phase, "closed");
});

test("Leave guard: save succeeds after Keep editing and stays", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/a",
    dirty: true,
  }).state;
  const saving = leaveGuard(open, { type: "save" }).state;
  const kept = leaveGuard(saving, { type: "keep" }).state;
  const done = leaveGuard(kept, { type: "saveResult", result: "saved" });
  assert.deepEqual(done.effect, {});
});

test("Leave guard: failed save stays open and allows retry or discard", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/a",
    dirty: true,
  }).state;
  const saving = leaveGuard(open, { type: "save" }).state;
  const failed = leaveGuard(saving, { type: "saveResult", result: "failed" });
  assert.equal(failed.state.phase, "failed");
  assert.deepEqual(failed.effect, {});
  assert.deepEqual(leaveActions("failed", true), {
    keep: true,
    save: true,
    discard: true,
    discardDisabled: false,
  });
  assert.equal(
    leaveGuard(failed.state, { type: "save" }).state.phase,
    "saving",
  );
});

test("Leave guard: unknown outcome keeps only Keep editing and cancels the intention", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/a",
    dirty: true,
  }).state;
  const saving = leaveGuard(open, { type: "save" }).state;
  const unknown = leaveGuard(saving, { type: "saveResult", result: "unknown" });
  assert.deepEqual(unknown.state, { phase: "unknown", intent: null });
  assert.deepEqual(unknown.effect, {});
  assert.deepEqual(leaveActions("unknown", true), {
    keep: true,
    save: false,
    discard: false,
    discardDisabled: true,
  });
  assert.deepEqual(leaveGuard(unknown.state, { type: "discard" }).effect, {});
});

test("Leave guard: an unknown outcome after Keep editing does not reopen the dialog", () => {
  const open = leaveGuard(closed, {
    type: "navigate",
    href: "/a",
    dirty: true,
  }).state;
  const saving = leaveGuard(open, { type: "save" }).state;
  const kept = leaveGuard(saving, { type: "keep" }).state;
  const r = leaveGuard(kept, { type: "saveResult", result: "unknown" });
  assert.deepEqual(r.state, closed);
  assert.deepEqual(r.effect, {});
});

test("Leave guard: Save & exit hidden without saving; Discard disabled while saving", () => {
  assert.equal(leaveActions("open", false).save, false);
  assert.equal(leaveActions("saving", true).discardDisabled, true);
});

test("Media fallback distinguishes missing and failed images", () => {
  assert.equal(mediaState(undefined, false), "missing");
  assert.equal(mediaState("", false), "missing");
  assert.equal(mediaState("/a.png", false), "image");
  assert.equal(mediaState("/a.png", true), "failed");
});

test("Notice action: labels name the state; pending and success cannot be activated", () => {
  const labels = {
    available: "Check result",
    pending: "Checking result",
    success: "Result checked",
  };
  assert.deepEqual(noticeAction("available", labels), {
    label: "Check result",
    activatable: true,
    ariaDisabled: false,
    ariaBusy: false,
  });
  assert.deepEqual(noticeAction("pending", labels), {
    label: "Checking result",
    activatable: false,
    ariaDisabled: true,
    ariaBusy: true,
  });
  assert.deepEqual(noticeAction("success", labels), {
    label: "Result checked",
    activatable: false,
    ariaDisabled: true,
    ariaBusy: false,
  });
  assert.deepEqual(noticeAction("failed", labels), {
    label: "Check result",
    activatable: true,
    ariaDisabled: false,
    ariaBusy: false,
  });
});
