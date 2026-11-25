import assert from "node:assert/strict";
import { test } from "node:test";
import { select } from "../scripts/validation-scope.mjs";

const names = (file: string) => select([file]).map((check) => check.name);
test("theme and conversation edits route to rendering and keyboard review", () => {
  for (const file of [
    "src/project/theme.css",
    "src/project/components/conversation/composer.tsx",
  ]) {
    const checks = names(file);
    for (const check of ["manual:ui", "manual:composer-keyboard"])
      assert.ok(checks.includes(check));
    for (const check of ["test:accounts", "test:deployment", "audit:quality"])
      assert.ok(!checks.includes(check));
  }
});
test("Booklet persistence, schemas and account dependencies select their consumers", () => {
  for (const file of [
    "src/lib/server/booklets/repository-v2.ts",
    "src/project/booklets/contracts-v2.ts",
  ]) {
    const checks = names(file);
    for (const check of [
      "test:booklet-repositories",
      "test:booklet-application",
      "test:booklet-modules",
      "check:docs",
    ])
      assert.ok(checks.includes(check));
  }
  const creditChecks = names("src/lib/server/credits.ts");
  assert.ok(creditChecks.includes("test:accounts"));
  assert.ok(creditChecks.includes("test:booklet-modules"));
});
