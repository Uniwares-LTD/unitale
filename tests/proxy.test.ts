import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("personalized HTML rejects intermediary transforms without weakening document CSP", () => {
  const response = proxy(new NextRequest("https://app.example/account"))!;
  const cache = response.headers.get("cache-control")!;
  for (const directive of ["private", "no-store", "no-transform"])
    assert.ok(
      cache
        .split(",")
        .map((value) => value.trim())
        .includes(directive),
    );
  const csp = response.headers.get("content-security-policy")!;
  assert.match(csp, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test("document CSP follows only local loopback emulator ports and excludes untrusted origins", () => {
  const previousEnvironment = process.env.APP_ENV;
  const previousHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const policy = () =>
    proxy(new NextRequest("http://localhost:3000/"))!.headers.get(
      "content-security-policy",
    )!;
  try {
    process.env.APP_ENV = "local";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9199";
    assert.match(policy(), /http:\/\/127\.0\.0\.1:9199/);
    assert.match(policy(), /http:\/\/localhost:9199/);
    assert.doesNotMatch(policy(), /:9099/);
    const framePolicy = policy()
      .split("; ")
      .find((directive) => directive.startsWith("frame-src "))!;
    assert.match(framePolicy, /http:\/\/127\.0\.0\.1:9199/);
    assert.match(framePolicy, /http:\/\/localhost:9199/);
    for (const host of [
      "localhost:9199 https://untrusted.example",
      "remote.example:9199",
      "localhost:99999",
    ]) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = host;
      assert.doesNotMatch(
        policy(),
        /untrusted|remote\.example|http:\/\/localhost:/,
      );
    }
    process.env.APP_ENV = "production";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9199";
    assert.doesNotMatch(policy(), /localhost|127\.0\.0\.1/);
  } finally {
    if (previousEnvironment === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousEnvironment;
    if (previousHost === undefined)
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousHost;
  }
});

test("hosted Firebase frame admission is exact and restricted to real Firebase", () => {
  const keys = [
    "APP_ENV",
    "AUTH_MODE",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_AUTH_EMULATOR_HOST",
  ] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const policy = () =>
    proxy(new NextRequest("http://localhost:3100/account"))!
      .headers.get("content-security-policy")!
      .replace(/nonce-[^']+/g, "nonce-fixture");
  try {
    process.env.APP_ENV = "local";
    process.env.AUTH_MODE = "emulator";
    process.env.FIREBASE_PROJECT_ID = "popup-fixture";
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const baseline = policy();
    process.env.AUTH_MODE = "firebase";
    const popup = policy();
    assert.equal(
      popup,
      baseline.replace(
        /(frame-src[^;]*)/,
        "$1 https://popup-fixture.firebaseapp.com",
      ),
    );
    // Deployed real Firebase uses the same popup frame source; emulators never do.
    for (const environment of ["staging", "production"]) {
      process.env.APP_ENV = environment;
      assert.match(
        policy(),
        /; frame-src 'self' https:\/\/accounts\.google\.com https:\/\/popup-fixture\.firebaseapp\.com;/,
      );
      const deployed = policy();
      // Unset AUTH_MODE defaults to real Firebase outside local, as in auth config.
      delete process.env.AUTH_MODE;
      assert.equal(policy(), deployed);
      process.env.AUTH_MODE = "emulator";
      const emulatorPolicy = policy();
      assert.doesNotMatch(emulatorPolicy, /firebaseapp\.com/);
      // Only the exact frame source differs between deployed emulator and Firebase.
      assert.equal(
        deployed,
        emulatorPolicy.replace(
          /(frame-src[^;]*)/,
          "$1 https://popup-fixture.firebaseapp.com",
        ),
      );
      process.env.AUTH_MODE = "firebase";
    }
    delete process.env.APP_ENV;
    assert.match(policy(), / https:\/\/popup-fixture\.firebaseapp\.com(?:;|$)/);
    process.env.APP_ENV = "local";
    for (const projectId of [
      "bad.example",
      "x/evil",
      "bad https://evil.example",
      "UPPERCASE",
      "",
      "a".repeat(64),
    ]) {
      process.env.FIREBASE_PROJECT_ID = projectId;
      assert.throws(policy, /FIREBASE_PROJECT_ID/);
    }
    process.env.AUTH_MODE = "emulator";
    assert.equal(policy(), baseline);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
