import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { parseArgs } from "node:util";
import projectRules from "./validation-project.mjs";

export const fullChecks = [
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

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
const records = (output) => output.split("\0").filter(Boolean);
const revision = (ref) =>
  git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}").trim();

export function cleanHead(head) {
  return revision("HEAD") === head && !git("status", "--porcelain=v1", "-z");
}

export function changes(base, head, dryRun) {
  const current = revision("HEAD");
  const target = head ? revision(head) : current;
  const ancestor = git("merge-base", revision(base), target).trim();
  // Without rename detection a rename contributes both the deletion and the addition.
  const diff = (...refs) =>
    records(git("diff", "--no-renames", "--name-only", "-z", ...refs, "--"));
  const staged = diff("--cached", current),
    unstaged = diff(),
    untracked = records(
      git("ls-files", "--others", "--exclude-standard", "-z"),
    );
  const dirty = staged.length + unstaged.length + untracked.length > 0;
  if (head && !dryRun && (dirty || target !== current))
    throw Error(
      "Use a clean checkout of the requested head to run its checks.",
    );
  const files = new Set(diff(ancestor, target));
  if (!head)
    for (const path of [...staged, ...unstaged, ...untracked]) files.add(path);
  const atHead = head
    ? new Set(records(git("ls-tree", "-r", "--name-only", "-z", target)))
    : null;
  const present = (path) =>
    atHead ? atHead.has(path) : existsSync(path) && lstatSync(path).isFile();
  return {
    base: ancestor,
    head: target,
    local: !head && dirty,
    files: [...files].sort(),
    present,
  };
}

const rules = [
  [
    /^(?:\.agents\/|AGENTS\.md$|handbook\.json$|skills-lock\.json$|scripts\/handbook)/,
    [
      "check:skills",
      "handbook:ready",
      "handbook:entrypoints",
      "test:handbook",
      "check:docs",
    ],
  ],
  [
    /^(?:\.github\/workflows\/|scripts\/deploy\/|tests\/deploy\/|deploy\/|Dockerfile$|\.dockerignore$|scripts\/runtime-settings\.cjs$|src\/lib\/server\/migration|scripts\/[^/]*migration)/,
    ["test:deployment", "check:workflows", "check:shell"],
  ],
  [
    /^(?:\.env\.example$|scripts\/environment|src\/lib\/(?:server\/)?config\/)/,
    ["check:env", "check:docs", "test", "typecheck"],
  ],
  [/^(?:messages\/|src\/i18n\/|scripts\/i18n)/, ["check:i18n", "test"]],
  [
    /^(?:src\/samples\/|scripts\/samples|samples\.json$)/,
    ["check:samples", "test"],
  ],
  [
    /^(?:template\.json$|scripts\/(?:template|project-initializer|create-project)|tests\/initializer)/,
    ["check:template", "test:initializer", "check:docs"],
  ],
  [/^project\.source\.json$/, ["check:template", "check:docs"]],
  [
    /^src\/(?:app\/(?!api\/)|components\/)/,
    ["typecheck", "check:i18n", "test", "manual:ui"],
  ],
  [
    /^src\/(?:project|lib)\/|^src\/app\/(?:api|account|admin|credits|runs)\//,
    ["typecheck", "test", "test:accounts"],
  ],
];
export function select(files, present = () => true) {
  const selected = new Map();
  function add(name, path) {
    if (!selected.has(name)) selected.set(name, new Set());
    selected.get(name).add(path);
  }
  for (const path of files) {
    let matched = false;
    if (/^tests\/(?:accounts\/)?[^/]+\.test\.ts$/.test(path)) {
      const suite = path.startsWith("tests/accounts/")
        ? "test:accounts"
        : "test";
      add(present(path) ? suite + ":files" : suite, path);
      add("typecheck", path);
      matched = true;
    }
    if (/\.(md|mdx)$/.test(path)) {
      add("check:docs", path);
      matched = true;
    }
    if (/\.css$/.test(path)) {
      add("manual:ui", path);
      matched = true;
    }
    const extra = projectRules(path);
    for (const name of extra) add(name, path);
    for (const [pattern, names] of rules)
      if (
        pattern.test(path) &&
        !(
          extra.length &&
          /^src\/(?:project\/|lib\/server\/booklets\/|app\/api\/(?:admin\/)?booklets\/)/.test(
            path,
          )
        ) &&
        !(path.startsWith("src/") && /\.(css|md|mdx)$/.test(path))
      ) {
        for (const name of names) add(name, path);
        matched = true;
      }
    if (!matched && !extra.length)
      for (const name of [
        ...fullChecks,
        "test:booklet-modules",
        "test:booklet-compat",
      ])
        add(name, path);
  }
  for (const [name, pattern] of [
    ["format:files", /\.(?:[cm]?[jt]sx?|json|css|md|ya?ml)$/],
    ["lint:files", /\.(?:[cm]?[jt]sx?)$/],
  ]) {
    for (const path of files)
      if (present(path) && pattern.test(path)) add(name, path);
  }
  // Keep file-oriented checks scoped even when semantic checks need broad coverage.
  selected.delete("lint");
  selected.delete("format:check");
  for (const suite of ["test", "test:accounts"])
    if (selected.has(suite)) selected.delete(suite + ":files");
  return [...selected].map(([name, paths]) => ({ name, paths: [...paths] }));
}

export function plan(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      changed: { type: "boolean" },
      "dry-run": { type: "boolean" },
      base: { type: "string" },
      head: { type: "string" },
    },
  });
  if (!values.changed && (values.base || values.head))
    throw Error("--base and --head require --changed");
  const scope = changes(
    values.base ?? (values.changed ? "origin/main" : "HEAD"),
    values.head,
    values["dry-run"],
  );
  const checks = values.changed
    ? select(scope.files, scope.present)
    : fullChecks.map((name) => ({ name, paths: [] }));
  return {
    base: scope.base,
    head: scope.head,
    local: scope.local,
    mode: values.changed ? "changed" : "full",
    dryRun: !!values["dry-run"],
    checks,
  };
}
