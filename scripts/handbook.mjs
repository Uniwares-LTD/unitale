// Consumer bootstrap: copy this file unchanged to scripts/handbook.mjs.
// Derived from Uniwares-LTD/unibase scripts/handbook.mjs; see provenance.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const handbookOrigin = "https://github.com/Uniwares-LTD/handbook.git";
export const sharedSkills = [
  "capture-project-learnings",
  "compile-feature-spec",
  "manage-issues",
  "review-change",
  "sync-docs-issues",
  "work-on-task",
];
const normalize = (value) =>
  value
    .replace(/^git@github.com:/, "https://github.com/")
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const blob = (cwd, revision, file) =>
  execFileSync("git", ["show", `${revision}:${file}`], {
    cwd,
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
function ordinary(directory) {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("Handbook path must be an ordinary checkout directory.");
}
export function resolveHandbook(root, explicit, environment = process.env) {
  return path.resolve(
    root,
    explicit || environment.UNIWARES_HANDBOOK_PATH || "../handbook",
  );
}
function inspect(directory, origin) {
  ordinary(directory);
  if (
    normalize(git(directory, "remote", "get-url", "origin")) !==
    normalize(origin)
  )
    throw new Error("Unexpected handbook origin; directory left untouched.");
  const metadata = git(directory, "rev-parse", "--absolute-git-dir");
  const file = path.join(metadata, "uniwares-handbook-baseline.json");
  const baseline = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : null;
  if (
    baseline &&
    (normalize(baseline.origin) !== normalize(origin) ||
      !/^[a-f0-9]{40,64}$/.test(baseline.revision))
  )
    throw new Error("Invalid handbook baseline.");
  if (baseline)
    git(directory, "cat-file", "-e", `${baseline.revision}^{commit}`);
  return { metadata, baseline };
}
function validateBootstrap(directory, revision) {
  if (!/^[a-f0-9]{40,64}$/.test(revision))
    throw new Error("Expected full revision.");
  for (const file of [
    "docs/work-policy.md",
    "docs/project.md",
    "docs/onboarding.md",
  ]) {
    if (!blob(directory, revision, file).toString().trim())
      throw new Error(`Missing guidance: ${file}`);
  }
  const source = blob(
    directory,
    revision,
    "scripts/refresh-handbook.mjs",
  ).toString("utf8");
  if (
    git(directory, "ls-tree", "--name-only", revision)
      .split("\n")
      .includes("handbook-contract.json")
  ) {
    const contract = JSON.parse(
      blob(directory, revision, "handbook-contract.json"),
    );
    if (contract.protocolVersion !== 1)
      throw new Error(
        "Unsupported Handbook protocol; update launcher explicitly.",
      );
  }
  return source;
}

// Full committed snapshot preserves relative dependencies. Never executes its contents.
// Revalidate every cached file before reuse; do not silently repair modified snapshots.
export function materialize(
  directory,
  revision,
  { origin = handbookOrigin } = {},
) {
  const { metadata } = inspect(directory, origin);
  validateBootstrap(directory, revision);
  const base = path.join(metadata, "uniwares-handbook-resources");
  mkdirSync(base, { recursive: true });
  ordinary(base);
  const destination = path.join(base, revision);
  const entries = git(directory, "ls-tree", "-rz", "--full-tree", revision)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/);
      if (!match)
        throw new Error(
          "Snapshot contains a symlink or unsupported Git entry.",
        );
      const name = match[3];
      if (
        name.includes("\\") ||
        name
          .split("/")
          .some(
            (part) =>
              !part ||
              part === "." ||
              part === ".." ||
              part.includes(":") ||
              part.toLowerCase() === ".git",
          )
      )
        throw new Error("Unsafe snapshot path.");
      return { name, mode: match[1] };
    });
  const verify = (target) => {
    ordinary(target);
    const expected = new Set(entries.map((e) => e.name));
    const walk = (dir, prefix = "") => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const name = prefix + item.name;
        if (item.isSymbolicLink())
          throw new Error("Modified resource snapshot: symlink.");
        if (item.isDirectory()) walk(path.join(dir, item.name), name + "/");
        else if (
          !expected.delete(name) ||
          !readFileSync(path.join(dir, item.name)).equals(
            blob(directory, revision, name),
          )
        )
          throw new Error(`Modified resource snapshot: ${name}`);
      }
    };
    walk(target);
    if (expected.size) throw new Error("Incomplete resource snapshot.");
  };
  if (existsSync(destination)) verify(destination);
  else {
    const temporary = path.join(
      base,
      `${revision}.${process.pid}.${Date.now()}.tmp`,
    );
    mkdirSync(temporary);
    for (const entry of entries) {
      const target = path.join(temporary, entry.name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, blob(directory, revision, entry.name), {
        mode: entry.mode === "100755" ? 0o755 : 0o644,
      });
    }
    try {
      renameSync(temporary, destination);
    } catch (error) {
      if (!existsSync(destination)) throw error;
      verify(destination);
    }
  }
  return { path: directory, revision, resourcePath: destination };
}

export async function runHandbook(
  command,
  { root, directory, force = false, revision, origin = handbookOrigin } = {},
) {
  root = path.resolve(
    root || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );
  directory = resolveHandbook(root, directory);
  if (!["setup", "check", "doctor", "resources"].includes(command))
    throw new Error("Use setup, check, doctor or resources.");
  if (!existsSync(directory)) {
    if (command !== "setup") {
      const error = new Error(
        `HANDBOOK_SETUP_REQUIRED: Handbook unavailable.\nOrigin: ${origin}\nDestination: ${directory}\nAfter approval, run npm run handbook:setup with -- --path set to this destination (quote it for your shell).\nPause only Handbook-dependent decisions.`,
      );
      error.code = "HANDBOOK_SETUP_REQUIRED";
      error.path = directory;
      error.origin = origin;
      throw error;
    }
    mkdirSync(path.dirname(directory), { recursive: true });
    git(
      path.dirname(directory),
      "clone",
      "--branch",
      "main",
      "--single-branch",
      origin,
      directory,
    );
  }
  const { baseline } = inspect(directory, origin);
  if (command === "resources")
    return materialize(directory, revision, { origin });
  const dirty = Boolean(
    git(directory, "status", "--porcelain", "--untracked-files=all"),
  );
  const branch = git(directory, "branch", "--show-current");
  if (!baseline && (dirty || branch !== "main")) {
    if (command === "doctor")
      return {
        path: directory,
        branch,
        dirty,
        revision: null,
        usable: false,
        warnings: ["No usable baseline; preserve local work."],
      };
    throw new Error(
      "No synchronized baseline and checkout is dirty or not on main. Preserve local work.",
    );
  }
  if (!baseline) {
    try {
      git(
        directory,
        "merge-base",
        "--is-ancestor",
        "HEAD",
        "refs/remotes/origin/main",
      );
    } catch {
      throw new Error(
        "No baseline and main is ahead, diverged or lacks origin/main. Preserve checkout; reconcile setup before executing shared code.",
      );
    }
  }
  // Bootstrap from committed clean main; later runs execute the last accepted helper.
  const selected = baseline?.revision || git(directory, "rev-parse", "HEAD");
  const source = validateBootstrap(directory, selected);
  const helper = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  if (
    typeof helper.refresh !== "function" ||
    typeof helper.diagnose !== "function"
  )
    throw new Error("Incompatible committed helper.");
  helper.validateRevision?.(directory, selected);
  if (command !== "doctor") return helper.refresh(directory, { origin, force });
  const state = helper.diagnose(directory, { origin }),
    warnings = [];
  let names = sharedSkills;
  const integration = path.join(root, "handbook.json");
  if (existsSync(integration)) {
    try {
      const config = JSON.parse(readFileSync(integration, "utf8"));
      if (
        !config ||
        config.version !== 1 ||
        !["source", "consumer"].includes(config.kind) ||
        !Array.isArray(config.technologySkills) ||
        config.technologySkills.some(
          (name) => typeof name !== "string" || !/^[a-z0-9-]+$/.test(name),
        )
      ) {
        throw new Error(
          "Expected version 1, kind source|consumer and a technologySkills array of skill names.",
        );
      }
      names = [
        ...sharedSkills,
        "maintain-project",
        "maintain-docs",
        ...config.technologySkills,
      ];
    } catch (error) {
      warnings.push(
        `Invalid handbook.json: ${error.message} Run handbook:ready and repair local metadata.`,
      );
    }
  }
  for (const name of new Set(names)) {
    if (typeof name !== "string" || !/^[a-z0-9-]+$/.test(name)) {
      warnings.push("Invalid selected skill name; run handbook:ready.");
      continue;
    }
    const local = path.join(root, ".agents/skills", name, "SKILL.md");
    if (!existsSync(local)) {
      warnings.push(`Missing local entrypoint: ${name}`);
      continue;
    }
    const content = readFileSync(local, "utf8");
    const identity = content.match(/^name: ["']?([^\r\n"']+)/m)?.[1];
    if (identity !== name)
      warnings.push(`Incompatible local entrypoint: ${name}`);
    if (state.revision) {
      try {
        blob(directory, state.revision, `.agents/skills/${name}/SKILL.md`);
      } catch {
        warnings.push(`Shared skill unavailable at cached revision: ${name}`);
      }
    }
  }
  return { ...state, warnings };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--path" && args[i + 1]) options.directory = args[++i];
      else if (
        args[i] === "--revision" &&
        args[i + 1] &&
        command === "resources"
      )
        options.revision = args[++i];
      else if (args[i] === "--force" && command === "check")
        options.force = true;
      else
        throw new Error(
          "Usage: handbook.mjs setup|check|doctor [--path PATH] [--force (check only)]; resources --revision SHA [--path PATH]",
        );
    }
    console.log(JSON.stringify(await runHandbook(command, options), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
