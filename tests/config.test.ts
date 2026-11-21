import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "../src/lib/config/schema";
import { parsePublicConfig } from "../src/lib/config/public";
import manifest from "../project.config.json";
import { project, projectSchema } from "../src/lib/project";
import { validateEnvironmentNames } from "../src/lib/config/environment";

test("local development needs no cloud credentials", () => {
  assert.deepEqual(parseConfig({}), {
    public: {
      appName: project.displayName,
      defaultStyle: project.defaultStyle,
    },
    server: { environment: "local", origin: "http://localhost:3000" },
  });
});

test("public configuration explicitly discards private or unknown fields", () => {
  assert.deepEqual(
    parsePublicConfig({ appName: "Unibase", password: "secret" }),
    { appName: "Unibase", defaultStyle: "classic" },
  );
  assert.deepEqual(
    parseConfig({ APP_NAME: "My Unibase", PRIVATE_CANARY: "secret" }).public,
    { appName: "My Unibase", defaultStyle: "classic" },
  );
});

test("application style is an allowlisted runtime default with safe validation", () => {
  assert.equal(
    parseConfig({ APP_STYLE: "soft-blue" }).public.defaultStyle,
    "soft-blue",
  );
  assert.equal(
    parseConfig({ APP_STYLE: "glass" }).public.defaultStyle,
    "glass",
  );
  assert.throws(
    () => parseConfig({ APP_STYLE: "private-invalid-value" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /APP_STYLE/);
      assert.ok(!error.message.includes("private-invalid-value"));
      return true;
    },
  );
});

test("non-local environments require an explicit HTTPS origin", () => {
  for (const APP_ENV of ["staging", "production"]) {
    assert.throws(() => parseConfig({ APP_ENV }), /APP_ORIGIN/);
    assert.throws(
      () => parseConfig({ APP_ENV, APP_ORIGIN: "http://example.com" }),
      /APP_ORIGIN/,
    );
    assert.equal(
      parseConfig({ APP_ENV, APP_ORIGIN: "https://example.com/" }).server
        .origin,
      "https://example.com",
    );
  }
});

test("invalid configuration names fields without reflecting supplied values", () => {
  for (const APP_ORIGIN of [
    "ftp://example.com",
    "https://user:password@example.com",
    "https://example.com/private",
    "https://example.com?secret=abc",
    "https://example.com#private",
    "sensitive-invalid-value",
  ]) {
    assert.throws(
      () => parseConfig({ APP_ORIGIN }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /APP_ORIGIN/);
        assert.ok(!error.message.includes(APP_ORIGIN));
        return true;
      },
    );
  }
  assert.throws(() => parseConfig({ APP_ENV: "secret-env-value" }), /APP_ENV/);
  assert.throws(() => parseConfig({ APP_NAME: " " }), /APP_NAME/);
});

test("declared tooling names pass while unknown application names fail", () => {
  // Agent hosts set MCP_CONNECTION_NONBLOCKING; it is tooling, not app config.
  assert.doesNotThrow(() =>
    validateEnvironmentNames({ MCP_CONNECTION_NONBLOCKING: "true" }),
  );
  assert.throws(
    () => validateEnvironmentNames({ MCP_UNKNOWN_SETTING: "x" }),
    /Invalid application environment setting name/,
  );
});

test("project themes default off, accept boolean opt-in, and stay outside runtime settings", () => {
  const legacy = { ...manifest, theme: undefined };
  assert.equal(projectSchema.parse(legacy).theme, false);
  assert.equal(projectSchema.parse({ ...manifest, theme: true }).theme, true);
  assert.ok(!projectSchema.safeParse({ ...manifest, theme: "true" }).success);
  assert.ok(
    !("theme" in parsePublicConfig({ appName: "Unibase", theme: true })),
  );
});
