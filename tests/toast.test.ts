import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { scheduleToastExpiry } from "../src/lib/toast-timing";

test("a confirmation restarts its full duration after a pause", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const css = readFileSync(
    new URL("../src/styles/design-system/unibase.css", import.meta.url),
    "utf8",
  );
  const duration = css.match(/--toast-confirmation-duration:\s*(.+?);/)?.[1];
  assert.ok(duration);
  const expire = t.mock.fn();
  const cancel = scheduleToastExpiry(false, duration, expire);
  t.mock.timers.tick(5999);
  assert.equal(expire.mock.callCount(), 0);
  cancel?.();
  scheduleToastExpiry(true, duration, expire);
  t.mock.timers.tick(6000);
  assert.equal(expire.mock.callCount(), 0);
  scheduleToastExpiry(false, duration, expire);
  t.mock.timers.tick(5999);
  assert.equal(expire.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.equal(expire.mock.callCount(), 1);
});
