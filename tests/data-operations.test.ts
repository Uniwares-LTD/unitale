import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataOperationSchema } from "../src/lib/contracts/data-operations";
test("Infrastructure report fixture obeys the strict shared DTO", () => {
  const bytes = readFileSync(
    "tests/fixtures/data-operation-report.json",
    "utf8",
  );
  const fixture = JSON.parse(bytes);
  assert.equal(dataOperationSchema.parse(fixture).state, "completed");
  assert.equal(
    dataOperationSchema.safeParse({ ...fixture, mongoUri: "canary" }).success,
    false,
  );
  assert.equal(
    dataOperationSchema.safeParse({
      ...fixture,
      backup: { ...fixture.backup, verified: false },
    }).success,
    false,
  );
  assert.equal(
    dataOperationSchema.safeParse({ ...fixture, verification: [] }).success,
    false,
  );
});

const mirror = path.join(
  process.env.INFRASTRUCTURE_CHECKOUT || "../infrastructure",
  "tests/fixtures/data-operation-report.json",
);
test(
  "Infrastructure report fixture matches its available checkout",
  {
    skip:
      !process.env.INFRASTRUCTURE_CHECKOUT && !existsSync(mirror)
        ? "Infrastructure checkout unavailable; mirror parity not checked"
        : false,
  },
  () => {
    assert.deepEqual(
      JSON.parse(
        readFileSync("tests/fixtures/data-operation-report.json", "utf8"),
      ),
      JSON.parse(readFileSync(mirror, "utf8")),
    );
  },
);
