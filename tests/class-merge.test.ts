import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { cn, typeRoles } from "../src/lib/utils";

test("typography roles replace a primitive's own font size", () => {
  // CardTitle/Button-style base classes followed by a caller's role.
  assert.equal(
    cn("text-base leading-snug font-medium", "font-heading text-card-title"),
    "font-medium font-heading text-card-title",
  );
  assert.equal(cn("text-sm", "text-body"), "text-body");
  assert.equal(cn("text-reading", "text-sm"), "text-sm");
  // Colours and other utilities keep their usual merging.
  assert.equal(
    cn("text-sm text-muted-foreground", "text-destructive"),
    "text-sm text-destructive",
  );
  assert.equal(cn("px-2 py-1", "px-4"), "py-1 px-4");
});

test("every foundation role is registered with cn", () => {
  const css = readFileSync(
    "src/styles/design-system/tailwind-theme.css",
    "utf8",
  );
  const declared = [...css.matchAll(/^\s+--text-([a-z-]+):/gm)]
    .map((m) => m[1])
    .filter((name) => !/--/.test(name));
  assert.deepEqual([...new Set(declared)].sort(), [...typeRoles].sort());
});

test("components import cn through the configured alias", () => {
  const offenders = readdirSync("src", { recursive: true })
    .map((file) => "src/" + String(file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file) && file !== "src/lib/utils.ts")
    .filter((file) => /from\s+["']cn["']/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});
