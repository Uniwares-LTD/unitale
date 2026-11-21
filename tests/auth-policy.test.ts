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

const realFirebase = {
  AUTH_MODE: "firebase",
  FIREBASE_PROJECT_ID: "popup-fixture",
  FIREBASE_API_KEY: "fixture-key",
  FIREBASE_APP_ID: "fixture-app",
};
test("only local real Firebase selects hosted popup auth, independent of scheme and port", () => {
  for (const origin of [
    "http://localhost:3000",
    "http://localhost:3100",
    "https://localhost:3100",
    "http://127.0.0.1:4000",
  ]) {
    const config = parseAuthConfig(realFirebase, "local", origin);
    assert.equal(config.public.googleSignInMethod, "popup");
    assert.equal(config.public.authDomain, "popup-fixture.firebaseapp.com");
    assert.equal(config.public.emulatorUrl, null);
    assert.deepEqual(
      Object.keys(config.public).sort(),
      [
        "apiKey",
        "appId",
        "authDomain",
        "emulatorUrl",
        "googleSignInMethod",
        "projectId",
      ].sort(),
    );
    const emulator = parseAuthConfig({}, "local", origin);
    assert.equal(emulator.public.googleSignInMethod, "redirect");
    assert.equal(emulator.public.authDomain, new URL(origin).host);
  }
  for (const environment of ["staging", "production"]) {
    const config = parseAuthConfig(
      realFirebase,
      environment,
      "https://app.example:8443",
    );
    assert.equal(config.public.googleSignInMethod, "redirect");
    assert.equal(config.public.authDomain, "app.example:8443");
  }
  assert.throws(() =>
    parseAuthConfig(
      { ...realFirebase, FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" },
      "local",
      "http://localhost:3100",
    ),
  );
  for (const projectId of [
    "bad.example",
    "x/evil",
    "bad https://evil.example",
    "UPPERCASE",
    "",
    "a".repeat(64),
  ])
    assert.throws(() =>
      parseAuthConfig(
        { ...realFirebase, FIREBASE_PROJECT_ID: projectId },
        "local",
        "http://localhost:3100",
      ),
    );
});
