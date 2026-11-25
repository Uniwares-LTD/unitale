import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { cleanHead, plan } from "./validation-scope.mjs";

const scope = plan(process.argv.slice(2));
if (scope.dryRun) {
  console.log(JSON.stringify(scope, null, 2));
  process.exit(0);
}
const npm = process.env.npm_execpath;
if (!npm) throw Error("Run this script through npm.");
const timeout = Number(process.env.VALIDATE_CHECK_TIMEOUT_MS ?? 300000);
if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483647)
  throw Error("Invalid VALIDATE_CHECK_TIMEOUT_MS");
const id = randomUUID();
const root = path.resolve("output/validation");
const dir = path.join(root, "runs", id);
mkdirSync(dir, { recursive: true });
function write(file, data) {
  const temp = file + "." + id + ".tmp";
  writeFileSync(temp, data);
  renameSync(temp, file);
}
const rows = [];
let active = null;
let complete = false;
// The shared file is a compatibility snapshot. A run's authoritative evidence
// always lives in its own directory, including during concurrent invocations.
const latestFull = path.join(root, "latest-full.json");
if (scope.mode === "full")
  write(latestFull, JSON.stringify({ id, head: scope.head }));
function persist() {
  const results = JSON.stringify(rows, null, 2) + "\n";
  write(path.join(dir, "results.json"), results);
  write(
    path.join(dir, "run.json"),
    JSON.stringify({ ...scope, id, complete, active }, null, 2) + "\n",
  );
  if (
    scope.mode === "full" &&
    JSON.parse(readFileSync(latestFull, "utf8")).id === id
  )
    write(path.join(root, "results.json"), results);
  const lines = [
    "### Verification",
    "",
    "Base " +
      scope.base +
      " · head " +
      scope.head +
      (scope.local ? " with local edits" : "") +
      " · " +
      scope.mode,
    "",
    scope.mode === "full"
      ? "`npm run validate`"
      : "`npm run validate:changed -- --base " +
        scope.base +
        (scope.local ? "" : " --head " + scope.head) +
        "`",
    ...(scope.mode === "changed"
      ? [
          "Scope: " +
            new Set(scope.checks.flatMap((check) => check.paths)).size +
            " changed paths. Selection details are in run.json.",
        ]
      : []),
    "",
    ...rows.map(
      (r) =>
        "- " +
        r.command +
        " — " +
        r.outcome +
        " (" +
        (r.durationMs / 1000).toFixed(1) +
        "s)",
    ),
    "",
    complete
      ? "Run complete."
      : "Partial run" + (active ? " — " + active : "") + ".",
    ...(scope.checks.length ? [] : ["No changed paths."]),
  ];
  write(path.join(dir, "report.md"), lines.join("\n") + "\n");
}
persist();
console.log("Report directory: " + dir);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    "report_dir=" +
      path.relative(process.cwd(), dir).split(path.sep).join("/") +
      "\n",
  );
function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (e) {
    if (e.code !== "ESRCH") throw e;
  }
}
function commands(check) {
  if (check.name === "test:files" || check.name === "test:accounts:files")
    return [
      [
        ...(check.name === "test:accounts:files"
          ? ["--conditions=react-server"]
          : []),
        "--import",
        "tsx",
        "--test",
        ...check.paths,
      ],
    ];
  if (check.name === "format:files" || check.name === "lint:files") {
    const format = check.name === "format:files";
    const bin = format ? "prettier/bin/prettier.cjs" : "eslint/bin/eslint.js";
    const args = [
      path.resolve("node_modules", bin),
      ...(format ? ["--check", "--ignore-unknown"] : []),
      "--",
    ];
    const batches = [];
    let batch = [],
      size = 0;
    for (const p of check.paths) {
      if (size + p.length > 10000 && batch.length) {
        batches.push([...args, ...batch]);
        batch = [];
        size = 0;
      }
      batch.push("./" + p);
      size += p.length + 4;
    }
    return [...batches, [...args, ...batch]];
  }
  return [[npm, "run", check.name]];
}
async function run(check, args) {
  const env = { ...process.env };
  const account =
    check.name === "test:accounts" || check.name === "test:accounts:files";
  const progress = path.join(dir, "account-files");
  if (account) {
    mkdirSync(progress, { recursive: true });
    const hook = new URL("./account-validation.mjs", import.meta.url);
    env.NODE_OPTIONS = (env.NODE_OPTIONS ?? "") + " --import=" + hook.href;
    env.VALIDATE_ACCOUNT_PROGRESS = progress;
  }
  const child = spawn(process.execPath, args, {
    env,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = path.join(dir, check.name.replaceAll(":", "-") + ".log");
  let timedOut = false,
    failed = false,
    unavailable = false,
    tail = "";
  const capture = (chunk) => {
    appendFileSync(log, chunk);
    process.stdout.write(chunk);
    const text = tail + chunk;
    if (
      /SKIP: Docker is unavailable|unavailable; check not performed/.test(text)
    )
      unavailable = true;
    tail = text.slice(-120);
  };
  child.stdout.setEncoding("utf8").on("data", capture);
  child.stderr.setEncoding("utf8").on("data", capture);
  // Node buffers worker stdout until it can emit the file's ordered results.
  // Read its marker independently so a stuck file is visible immediately.
  const announced = new Set();
  function announceFiles() {
    for (const file of readdirSync(progress)) {
      if (announced.has(file)) continue;
      announced.add(file);
      capture("Account test started: " + file + "\n");
    }
  }
  const progressTimer = account ? setInterval(announceFiles, 500) : null;
  function reportOutstanding() {
    if (account && existsSync("tests/accounts")) {
      const files =
        check.name === "test:accounts:files"
          ? check.paths.map((file) => path.basename(file))
          : readdirSync("tests/accounts");
      const outstanding = files.filter(
        (f) =>
          f.endsWith(".test.ts") &&
          (!existsSync(path.join(progress, f)) ||
            readFileSync(path.join(progress, f), "utf8") !== "finished"),
      );
      capture("Outstanding account files: " + outstanding.join(", ") + "\n");
    }
  }
  const timer = setTimeout(() => {
    timedOut = true;
    reportOutstanding();
    capture("Check timed out after " + timeout + " ms.\n");
    stopTree(child);
  }, timeout);
  let interrupted;
  function interrupt(signal) {
    interrupted = signal;
    reportOutstanding();
    stopTree(child);
  }
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  child.on("error", (error) => {
    failed = true;
    capture("Runner error: " + error.message + "\n");
  });
  const code = await new Promise((resolve) => child.once("close", resolve));
  clearTimeout(timer);
  if (progressTimer) {
    clearInterval(progressTimer);
    announceFiles();
  }
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  if (interrupted) {
    persist();
    process.exit(interrupted === "SIGINT" ? 130 : 143);
  }
  const outcome = timedOut
    ? "timed out"
    : failed
      ? "runner error"
      : unavailable
        ? "skipped"
        : code === 0
          ? "passed"
          : "failed";
  return { outcome, exitCode: outcome === "passed" ? 0 : code || 1 };
}
for (const check of scope.checks) {
  active = check.name;
  persist();
  const start = Date.now();
  console.log("Running " + check.name);
  let result = { outcome: "passed", exitCode: 0 };
  if (check.name.startsWith("manual:"))
    result = { outcome: "manual review required", exitCode: 1 };
  else
    for (const args of commands(check)) {
      result = await run(check, args);
      if (result.exitCode) break;
    }
  const command = check.name.includes(":files")
    ? check.name + " (" + check.paths.length + " changed files)"
    : check.name.startsWith("manual:")
      ? check.name
      : "npm run " + check.name;
  rows.push({
    name: check.name,
    command,
    ...result,
    durationMs: Date.now() - start,
  });
  active = null;
  persist();
}
if (!scope.local && !cleanHead(scope.head)) {
  scope.local = true;
  console.error(
    "Checkout changed during verification. Reverify the clean PR head.",
  );
  if (scope.mode === "changed") process.exitCode = 1;
}
complete = true;
persist();
console.table(rows);
if (
  scope.mode === "changed" &&
  rows.some((r) => ["timed out", "failed", "runner error"].includes(r.outcome))
)
  process.exitCode = 1;
