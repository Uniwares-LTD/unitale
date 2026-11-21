import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
const integration = JSON.parse(readFileSync("handbook.json", "utf8"));
const sharedSkills = [
  "capture-project-learnings",
  "compile-feature-spec",
  "manage-issues",
  "maintain-docs",
  "maintain-project",
  "review-change",
  "sync-docs-issues",
  "work-on-task",
  ...integration.technologySkills,
];

const root = process.cwd();
const source = "karpishe-experiments/agentic-poc";
const sourceRef = "4e1478355843e42e1b27fdc8e33212476a4d4fa3";
const names = [
  "build-ui",
  "capture-project-learnings",
  "compile-feature-spec",
  "maintain-docs",
  "maintain-project",
  "manage-issues",
  "next-best-practices",
  "playwright",
  "review-change",
  "sync-docs-issues",
  "vercel-react-best-practices",
  "web-design-guidelines",
  "work-on-task",
];
const textExtensions = new Set([
  ".md",
  ".svg",
  ".json",
  ".yaml",
  ".yml",
  ".sh",
  ".txt",
  ".toml",
]);

function digest(file) {
  const bytes = readFileSync(path.join(root, file));
  const normalized = textExtensions.has(path.extname(file))
    ? bytes.toString("utf8").replace(/\r\n/g, "\n")
    : bytes;
  return createHash("sha256").update(normalized).digest("hex");
}

function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      assert.ok(
        !entry.isSymbolicLink(),
        `Skill symlinks are not allowed: ${entry.name}`,
      );
      const file = `${directory}/${entry.name}`;
      return entry.isDirectory() ? files(file) : [file];
    })
    .sort();
}

function fileHashes(directory) {
  return Object.fromEntries(
    files(directory).map((file) => [file, digest(file)]),
  );
}

const actualNames = readdirSync(".agents/skills", { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name)
  .sort();
assert.deepEqual(
  actualNames,
  names,
  "Installed skills must match the approved set.",
);
const supportFiles = [
  "CLAUDE.md",
  ".agents/handbook.md",
  ...files(".claude/skills"),
];

if (process.argv.includes("--write")) {
  // Refresh only after reviewing an intentional import/update. Preserve the
  // original upstream records without treating their hashes as local hashes.
  const old = existsSync("skills-lock.json")
    ? JSON.parse(readFileSync("skills-lock.json", "utf8"))
    : undefined;
  const upstream = existsSync(".cache/upstream-skills-lock.json")
    ? JSON.parse(readFileSync(".cache/upstream-skills-lock.json", "utf8"))
    : undefined;
  const skills = Object.fromEntries(
    names.map((name) => [
      name,
      sharedSkills.includes(name)
        ? {
            ...old?.skills[name],
            kind: "handbook-entrypoint",
            source: "Uniwares-LTD/handbook",
            sourcePath: `.agents/skills/${name}`,
            channel: "main",
            files: fileHashes(`.agents/skills/${name}`),
          }
        : {
            ...old?.skills[name],
            source: old?.skills[name]?.source ?? source,
            sourceRef: old?.skills[name]?.sourceRef ?? sourceRef,
            sourcePath: `.agents/skills/${name}`,
            upstream: old?.skills[name]?.upstream ??
              upstream?.skills[name] ?? { source, sourceRef },
            files: fileHashes(`.agents/skills/${name}`),
          },
    ]),
  );
  writeFileSync(
    "skills-lock.json",
    `${JSON.stringify({ ...old, version: 2, hashFormat: "sha256 per file; LF-normalized text, raw binary", source, sourceRef, skills, supportFiles: Object.fromEntries(supportFiles.map((file) => [file, digest(file)])) }, null, 2)}\n`,
  );
  console.log(
    "Updated skills-lock.json. Review the changed provenance and hashes before committing.",
  );
} else {
  const lock = JSON.parse(readFileSync("skills-lock.json", "utf8"));
  assert.deepEqual(Object.keys(lock.skills).sort(), names);
  for (const name of names) {
    if (sharedSkills.includes(name)) {
      assert.equal(lock.skills[name].kind, "handbook-entrypoint");
      assert.equal(lock.skills[name].source, "Uniwares-LTD/handbook");
      const text = readFileSync(`.agents/skills/${name}/SKILL.md`, "utf8");
      assert.ok(
        text.includes("[Handbook bootstrap](../../handbook.md)") &&
          text.includes("retained Handbook path and full revision") &&
          text.includes(`.agents/skills/${name}/SKILL.md`),
        `Invalid shared entrypoint: ${name}`,
      );
    }
    assert.ok(
      existsSync(`.agents/skills/${name}/SKILL.md`),
      `Missing SKILL.md for ${name}`,
    );
    assert.deepEqual(
      fileHashes(`.agents/skills/${name}`),
      lock.skills[name].files,
      `Skill files differ from lock: ${name}`,
    );
  }
  assert.deepEqual(
    Object.keys(lock.supportFiles).sort(),
    [...supportFiles].sort(),
    "Supporting contract files differ from lock.",
  );
  for (const file of supportFiles)
    assert.equal(
      digest(file),
      lock.supportFiles[file],
      `Changed supporting contract: ${file}`,
    );
  console.log(
    `Verified ${sharedSkills.length} Handbook entrypoints, Claude references and retained notices (offline).`,
  );
}
