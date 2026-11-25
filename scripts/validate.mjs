import { spawnSync } from "node:child_process";
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
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script through npm run validate.");

mkdirSync("output/validation", { recursive: true });
const results = checks.map((name) => {
  console.log(`\nRunning ${name}`);
  const result = spawnSync(process.execPath, [npm, "run", name], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const report = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? "\nCheck runner failed.\n" : ""}`;
  process.stdout.write(report);
  writeFileSync(`output/validation/${name.replaceAll(":", "-")}.log`, report);
  return {
    name,
    exitCode: result.status ?? 1,
    outcome: result.status === 0 ? "passed" : "warning",
  };
});

mkdirSync("output/validation", { recursive: true });
writeFileSync(
  "output/validation/results.json",
  `${JSON.stringify(results, null, 2)}\n`,
);
console.table(results);
console.log(
  results.some((result) => result.exitCode !== 0)
    ? "Quality warnings reported. See output/validation/results.json. Build is a separate required check."
    : "All advisory checks passed. Build is a separate required check.",
);
// Quality reports deliberately do not turn warnings into a release gate.
