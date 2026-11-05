import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCreditConfig, parsePaymentMode } from "../src/lib/config/credits";

test("purchase simulation is restricted to local emulator configuration", () => {
  assert.deepEqual(
    parseCreditConfig({}, "local", "emulator").packs.map(
      (pack) => pack.credits,
    ),
    [100, 500, 1000],
  );
  assert.equal(
    parseCreditConfig({}, "production", "firebase").mode,
    "disabled",
  );
  assert.deepEqual(parseCreditConfig({}, "production", "firebase").packs, []);
  for (const environment of ["staging", "production"] as const)
    assert.throws(
      () =>
        parseCreditConfig(
          { PAYMENTS_MODE: "simulation" },
          environment,
          "firebase",
        ),
      /PAYMENTS_MODE/,
    );
  assert.throws(
    () =>
      parseCreditConfig({ PAYMENTS_MODE: "simulation" }, "local", "firebase"),
    /PAYMENTS_MODE/,
  );
});
test("server catalog validates whole credits, identities and safe errors", () => {
  const pack = { id: "one", label: "100 credits", credits: 100 };
  assert.equal(
    parseCreditConfig(
      { PAYMENTS_MODE: "disabled", CREDIT_PACKS_JSON: JSON.stringify([pack]) },
      "production",
      "firebase",
    ).packs[0].credits,
    100,
  );
  for (const raw of [
    "secret-value",
    JSON.stringify([pack, pack]),
    JSON.stringify([{ ...pack, credits: 1.5 }]),
    JSON.stringify([{ ...pack, id: "../../bad" }]),
    JSON.stringify([{ ...pack, secret: "secret-value" }]),
  ]) {
    assert.throws(
      () => parseCreditConfig({ CREDIT_PACKS_JSON: raw }, "local", "emulator"),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Invalid credit configuration: CREDIT_PACKS_JSON.",
    );
  }
});

test("saved catalog policy is independent of environment connection activation", () => {
  assert.equal(
    parsePaymentMode(
      { PAYMENTS_MODE: "stripe", CREDIT_PACKS_JSON: "invalid seed" },
      "production",
      "firebase",
    ),
    "stripe",
  );
  assert.throws(() =>
    parsePaymentMode({ PAYMENTS_MODE: "simulation" }, "production", "firebase"),
  );
});

test("versioned Stripe catalogs do not require legacy pack seeds", () => {
  assert.deepEqual(
    parseCreditConfig({ PAYMENTS_MODE: "stripe" }, "production", "firebase")
      .packs,
    [],
  );
});
