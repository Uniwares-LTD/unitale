import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const run = (args, options = {}) =>
  spawnSync(process.execPath, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
test("packaging preserves released source checksums, binds runner bytes, rejects tampering and ignores credentials for manifest", () => {
  const build = run(["scripts/build-migrations.mjs"]);
  assert.equal(build.status, 0, build.stderr);
  const source = run(
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/db-migrate.ts",
      "--manifest",
    ],
    { env: { ...process.env, MONGODB_URI: "invalid", APP_ENV: "invalid" } },
  );
  assert.equal(source.status, 0, source.stderr);
  const bundled = run(["dist/migration-runner.cjs", "--manifest"]);
  assert.equal(bundled.status, 0, bundled.stderr);
  const { runnerSha256, ...manifest } = JSON.parse(bundled.stdout);
  assert.deepEqual(manifest, JSON.parse(source.stdout));
  assert.equal(
    runnerSha256,
    createHash("sha256")
      .update(readFileSync("dist/migration-runner.cjs"))
      .digest("hex"),
  );
  assert.deepEqual(
    manifest.migrations.map((m) => m.checksum),
    [
      "2e3ec576ee533478af4aec2798703843608e3b563b43e3c7ed2bad8bea5dae7a",
      "ed49b71d484008d67367c9fd326808b12d505325dc98dfbaf5770643db9ad8e3",
      "16749f7972f96fdcbc88feb0350972165ea76cb60e71be9f1f5fe7727110097d",
      "bf4576ed4c1a934612f7b2d40e0e3ec55c7a942b4341ad6c51858a1c57a01923",
      "a4f65324758bb5b01d167ab3e6020a10b4931a30446bfd02864997354cce0b79",
      "5bf1da051cde70c502078c83f8e9e4b82bb8a65193cb1e1780775fe48d14c5a9",
    ],
  );
  const directory = mkdtempSync(path.join(tmpdir(), "migration-package-"));
  try {
    const runner = path.join(directory, "migration-runner.cjs");
    copyFileSync("dist/migration-runner.cjs", runner);
    const file = path.join(directory, "migration-manifest.json");
    copyFileSync("dist/migration-manifest.json", file);
    assert.equal(run([runner, "--manifest"]).status, 0);
    const altered = JSON.parse(readFileSync(file, "utf8"));
    altered.migrations[0].checksum = "0".repeat(64);
    writeFileSync(file, JSON.stringify(altered));
    assert.equal(run([runner, "--manifest"]).status, 1);
    copyFileSync("dist/migration-manifest.json", file);
    writeFileSync(
      runner,
      readFileSync(runner, "utf8") + "\n// altered bytes\n",
    );
    assert.equal(run([runner, "--manifest"]).status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
