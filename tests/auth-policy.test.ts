import assert from "node:assert/strict";
import { test } from "node:test";
import { requireRecentLogin, requireSameOrigin } from "../src/lib/auth-policy";
import { parseAuthConfig } from "../src/lib/config/auth";
import { profileUpdateSchema } from "../src/lib/contracts/profile";
import { project } from "../src/lib/project";

test("session exchange requires recent authentication and issuance", () => {
  const now = 10000;
  for (const age of [100, 301, 900, 1800])
    requireRecentLogin({ auth_time: now - age, iat: now - age }, now);
  for (const claims of [
    { auth_time: now - 1801, iat: now },
    { auth_time: now, iat: now - 1801 },
    { auth_time: now + 100, iat: now },
    { auth_time: now, iat: now + 100 },
    { auth_time: NaN, iat: now },
    { auth_time: now, iat: NaN },
  ])
    assert.throws(() => requireRecentLogin(claims, now));
});
test("session mutations reject absent, foreign and sibling origins", () => {
  requireSameOrigin(
    new Headers({
      origin: "https://unibase.example",
      "sec-fetch-site": "same-origin",
    }),
    "https://unibase.example",
  );
  for (const origin of [
    null,
    "https://evil.example",
    "null",
    "https://sibling.unibase.example",
  ]) {
    const headers = new Headers();
    if (origin) headers.set("origin", origin);
    assert.throws(() => requireSameOrigin(headers, "https://unibase.example"));
  }
});
test("profile updates cannot submit ownership or private fields", () => {
  assert.equal(
    profileUpdateSchema.safeParse({ displayName: "Alice", theme: "dark" })
      .success,
    true,
  );
  for (const key of ["uid", "email", "password", "idToken", "$set"])
    assert.equal(
      profileUpdateSchema.safeParse({
        displayName: "Alice",
        theme: "dark",
        [key]: "attacker",
      }).success,
      false,
    );
});
test("emulator configuration cannot be enabled outside a local demo project", () => {
  const config = parseAuthConfig({}, "local", "http://localhost:3000");
  assert.equal(config.public.projectId, `demo-${project.slug}`);
  assert.ok(!("mongoUri" in config.public));
  assert.throws(() =>
    parseAuthConfig(
      { AUTH_MODE: "emulator" },
      "production",
      "https://unibase.example",
    ),
  );
  assert.throws(() =>
    parseAuthConfig(
      { FIREBASE_PROJECT_ID: "real-project" },
      "local",
      "http://localhost:3000",
    ),
  );
});
