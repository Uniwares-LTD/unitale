import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { select } from "../scripts/validation-scope.mjs";
const runner = fileURLToPath(
  new URL("../scripts/validate.mjs", import.meta.url),
);
function fixture(t: import("node:test").TestContext) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "quality-scope-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Local fixture");
  writeFileSync(path.join(cwd, "old name.md"), "old");
  writeFileSync(path.join(cwd, ".gitignore"), "output/\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("branch", "baseline");
  return { cwd, git };
}
const names = (files: string[]) =>
  select(files).map((c: { name: string }) => c.name);
test("concurrent npm entry points keep failed and unavailable results separate", async (t) => {
  const { cwd, git } = fixture(t);
  const npm = process.env.npm_execpath;
  if (!npm) return t.skip("covered when launched through npm");
  writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({
      scripts: {
        "validate:changed": 'node "' + runner + '" --changed',
        "test:deployment":
          "node -e \"console.log('SKIP: Docker is unavailable')\"",
        "check:workflows": 'node -e "process.exit(2)"',
        "check:shell": 'node -e "process.exit(0)"',
      },
    }),
  );
  git("add", ".");
  git("commit", "-qm", "setup");
  git("branch", "start");
  mkdirSync(path.join(cwd, "tests/deploy"), { recursive: true });
  writeFileSync(path.join(cwd, "tests/deploy/example.py"), "# fixture\n");
  git("add", ".");
  git("commit", "-qm", "fixture");
  const args = [
    npm,
    "run",
    "validate:changed",
    "--",
    "--base",
    "start",
    "--head",
    "HEAD",
  ];
  const runs = await Promise.allSettled(
    [1, 2].map(() => promisify(execFile)(process.execPath, args, { cwd })),
  );
  assert.ok(
    runs.every(
      (result) => result.status === "rejected" && result.reason.code === 1,
    ),
  );
  const parent = path.join(cwd, "output/validation/runs");
  const ids = readdirSync(parent);
  assert.equal(ids.length, 2);
  for (const id of ids) {
    const meta = JSON.parse(
      readFileSync(path.join(parent, id, "run.json"), "utf8"),
    );
    assert.equal(meta.id, id);
    assert.equal(meta.complete, true);
    assert.equal(meta.local, false);
    const rows = JSON.parse(
      readFileSync(path.join(parent, id, "results.json"), "utf8"),
    );
    assert.deepEqual(
      rows.map((row: { outcome: string }) => row.outcome),
      ["skipped", "failed", "passed"],
    );
  }
});
test("behavior coverage follows paths and conservative boundaries", () => {
  for (const [file, expected, absent] of [
    ["src/project/theme.css", "manual:ui", "test:accounts"],
    ["docs/guide.md", "check:docs", "test:deployment"],
    ["src/lib/server/session.ts", "test:accounts", "test:deployment"],
    ["tests/deploy/test_vps.py", "test:deployment", "test:accounts"],
    ["package-lock.json", "test:accounts", ""],
    ["new-boundary.data", "test:accounts", ""],
    [
      "tests/accounts/migration-report.test.ts",
      "test:accounts:files",
      "test:accounts",
    ],
    ["tests/validation.test.ts", "test:files", "test"],
  ]) {
    assert.ok(names([file]).includes(expected), file);
    assert.ok(!names([file]).includes(absent), file);
  }
  assert.equal(names([]).length, 0);
});
test("CLI collects committed, staged, unstaged, untracked and deleted paths", (t) => {
  const { cwd, git } = fixture(t);
  git("mv", "old name.md", "new name.md");
  git("commit", "-qm", "rename");
  writeFileSync(path.join(cwd, "new name.md"), "changed");
  writeFileSync(path.join(cwd, "another.md"), "new");
  git("add", "another.md");
  writeFileSync(path.join(cwd, "untracked.md"), "untracked");
  const args = [runner, "--changed", "--base", "baseline"];
  const scope = JSON.parse(
    execFileSync(process.execPath, [...args, "--dry-run"], {
      cwd,
      encoding: "utf8",
    }),
  );
  assert.equal(scope.local, true);
  const inputs = (name: string) =>
    scope.checks.find((c: { name: string }) => c.name === name).paths;
  assert.deepEqual(inputs("check:docs"), [
    "another.md",
    "new name.md",
    "old name.md",
    "untracked.md",
  ]);
  assert.ok(!inputs("format:files").includes("old name.md"));
  const explicit = spawnSync(process.execPath, [...args, "--head", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  assert.notEqual(explicit.status, 0);
  assert.match(explicit.stderr, /clean checkout/);
  assert.notEqual(
    spawnSync(
      process.execPath,
      [...args, "--head", "nonexistent", "--dry-run"],
      { cwd },
    ).status,
    0,
  );
});
test("timeout stops workers and preserves earlier results in a private report", async (t) => {
  const { cwd } = fixture(t);
  mkdirSync(path.join(cwd, "tests/accounts"), { recursive: true });
  const npm = path.join(cwd, "fake.cjs");
  writeFileSync(
    npm,
    "if(process.argv[3]==='test:accounts'){const p=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});require('node:fs').writeFileSync('worker.pid',String(p.pid));setInterval(()=>{},1000)}",
  );
  const result = spawnSync(process.execPath, [runner], {
    cwd,
    env: {
      ...process.env,
      npm_execpath: npm,
      VALIDATE_CHECK_TIMEOUT_MS: "1500",
    },
    encoding: "utf8",
    timeout: 45000,
  });
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(
    readFileSync(path.join(cwd, "output/validation/results.json"), "utf8"),
  );
  assert.equal(rows[0].outcome, "passed");
  assert.equal(
    rows.find((r: { name: string }) => r.name === "test:accounts").outcome,
    "timed out",
  );
  const pid = Number(readFileSync(path.join(cwd, "worker.pid"), "utf8"));
  const running = () => {
    try {
      process.kill(pid, 0);
      if (
        process.platform === "linux" &&
        readFileSync("/proc/" + pid + "/stat", "utf8").includes(") Z ")
      )
        return false;
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 20 && running(); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(!running(), "worker survived timeout");
  const runs = path.join(cwd, "output/validation/runs");
  const [id] = readdirSync(runs);
  assert.equal(
    JSON.parse(readFileSync(path.join(runs, id, "run.json"), "utf8")).complete,
    true,
  );
});

test("a stopped full run leaves its partial report associated with its own id", (t) => {
  const { cwd } = fixture(t);
  const npm = path.join(cwd, "interrupt.cjs");
  writeFileSync(
    npm,
    "if(process.argv[3]==='check:skills')process.kill(process.ppid,'SIGTERM')",
  );
  const result = spawnSync(process.execPath, [runner], {
    cwd,
    env: { ...process.env, npm_execpath: npm },
    timeout: 30000,
  });
  assert.notEqual(result.status, 0);
  const root = path.join(cwd, "output/validation");
  const { id } = JSON.parse(
    readFileSync(path.join(root, "latest-full.json"), "utf8"),
  );
  const dir = path.join(root, "runs", id);
  const meta = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8"));
  assert.equal(meta.complete, false);
  assert.equal(meta.active, "check:skills");
  assert.match(
    readFileSync(path.join(dir, "report.md"), "utf8"),
    /Partial run/,
  );
  const rows = JSON.parse(readFileSync(path.join(dir, "results.json"), "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "check:env");
});
