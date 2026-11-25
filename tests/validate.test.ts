import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(
  new URL("../scripts/validate.mjs", import.meta.url),
);

test("validation kills a stalled check's descendants and continues reporting", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "validate-timeout-"));
  try {
    const npm = path.join(cwd, "npm.mjs");
    writeFileSync(
      npm,
      `
      import { spawn } from "node:child_process";
      import { writeFileSync } from "node:fs";
      if (process.argv[3] === "check:env") {
        const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: "inherit" });
        writeFileSync("pids.json", JSON.stringify([process.pid, child.pid]));
        if (process.env.VALIDATE_FIXTURE_CANCEL)
          setTimeout(() => process.kill(process.ppid, "SIGTERM"), 100);
        process.on("SIGTERM", () => {});
        console.log("stalled-check-output");
        setInterval(() => {}, 1000);
      } else if (process.argv[3] === "check:skills") {
        process.exitCode = 7;
      } else console.log("completed " + process.argv[3]);
    `,
    );
    const result = spawnSync(process.execPath, [script], {
      cwd,
      env: {
        ...process.env,
        npm_execpath: npm,
        VALIDATE_CHECK_TIMEOUT_MS: "1000",
      },
      encoding: "utf8",
      timeout: 15_000,
      killSignal: "SIGKILL",
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const rows = JSON.parse(
      readFileSync(path.join(cwd, "output/validation/results.json"), "utf8"),
    );
    assert.equal(rows.length, 18);
    assert.deepEqual(rows[0], {
      name: "check:env",
      exitCode: 1,
      outcome: "warning",
      timedOut: true,
    });
    assert.equal(rows[1].exitCode, 7);
    assert.equal(rows[1].outcome, "warning");
    assert.equal(rows[1].timedOut, false);
    assert.ok(
      rows
        .slice(2)
        .every((row: { outcome: string }) => row.outcome === "passed"),
    );
    assert.match(
      readFileSync(path.join(cwd, "output/validation/check-env.log"), "utf8"),
      /stalled-check-output[\s\S]*Check timed out after 1000 ms/,
    );
    assert.match(result.stdout, /completed check:shell/);
    const cancelled = spawnSync(process.execPath, [script], {
      cwd,
      env: { ...process.env, npm_execpath: npm, VALIDATE_FIXTURE_CANCEL: "1" },
      encoding: "utf8",
      timeout: 15_000,
      killSignal: "SIGKILL",
    });
    assert.equal(
      cancelled.status,
      143,
      cancelled.stderr || String(cancelled.error),
    );
    assert.doesNotMatch(cancelled.stdout, /Running check:skills/);
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(cwd, "output/validation/results.json"), "utf8"),
      ),
      [],
      "a cancelled rerun must not retain the previous run's results",
    );
  } finally {
    // Keep a failing regression from leaving its deliberately stalled fixtures.
    const pids = path.join(cwd, "pids.json");
    if (existsSync(pids)) {
      for (const pid of JSON.parse(readFileSync(pids, "utf8"))) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});
