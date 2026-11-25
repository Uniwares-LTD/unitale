import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const checks = [
  "check:env",
  "check:skills",
  "handbook:ready",
  "handbook:entrypoints",
  "test:handbook",
  "check:docs",
  "check:template",
  "check:samples",
  "check:i18n",
  "typecheck",
  "lint",
  "format:check",
  "test",
  "test:accounts",
  "test:deployment",
  "audit:quality",
  "check:workflows",
  "check:shell",
];
const checkTimeoutMs = Number(process.env.VALIDATE_CHECK_TIMEOUT_MS ?? 300_000);
if (!Number.isSafeInteger(checkTimeoutMs) || checkTimeoutMs <= 0)
  throw new Error("VALIDATE_CHECK_TIMEOUT_MS must be a positive integer.");
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script through npm run validate.");

mkdirSync("output/validation", { recursive: true });
const results = [];
writeFileSync("output/validation/results.json", "[]\n");
for (const name of checks) {
  console.log(`\nRunning ${name}`);
  // Give each check its own process group so a timeout also stops npm's
  // descendants (test workers, MongoDB, etc.) that may keep pipes open.
  let report = "";
  let timedOut = false;
  let runnerFailed = false;
  const child = spawn(process.execPath, [npm, "run", name], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stop = () => {
    if (!child.pid) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  };
  const interrupt = (signal) => {
    stop();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const capture = (chunk) => {
    report += chunk;
    process.stdout.write(chunk);
    if (Buffer.byteLength(report) > 16 * 1024 * 1024) {
      runnerFailed = true;
      stop();
    }
  };
  child.stdout.setEncoding("utf8").on("data", capture);
  child.stderr.setEncoding("utf8").on("data", capture);
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, checkTimeoutMs);
  const status = await new Promise((resolve) => {
    child.on("error", () => {
      runnerFailed = true;
    });
    child.on("close", resolve);
  });
  clearTimeout(timer);
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  const diagnostic = timedOut
    ? `\nCheck timed out after ${checkTimeoutMs} ms.\n`
    : runnerFailed
      ? "\nCheck runner failed.\n"
      : "";
  report += diagnostic;
  process.stdout.write(diagnostic);
  writeFileSync(`output/validation/${name.replaceAll(":", "-")}.log`, report);
  results.push({
    name,
    exitCode: timedOut || runnerFailed ? 1 : (status ?? 1),
    outcome: !timedOut && !runnerFailed && status === 0 ? "passed" : "warning",
    timedOut,
  });
  // Keep completed evidence even if the overall job is cancelled later.
  writeFileSync(
    "output/validation/results.json",
    `${JSON.stringify(results, null, 2)}\n`,
  );
}

console.table(results);
console.log(
  results.some((result) => result.exitCode !== 0)
    ? "Quality warnings reported. See output/validation/results.json. Build is a separate required check."
    : "All advisory checks passed. Build is a separate required check.",
);
// Quality reports deliberately do not turn warnings into a release gate.
