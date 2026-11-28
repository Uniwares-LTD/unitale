import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkReadiness,
  syncEntrypoints,
  syncTemplates,
  mapSections,
} from "../scripts/handbook-integration.mjs";

// Synthetic source keeps consumer tests offline and independent of a Handbook clone.
const consumer = fileURLToPath(new URL("..", import.meta.url));
const source = mkdtempSync(path.join(tmpdir(), "handbook-source-"));
after(() => rmSync(source, { recursive: true, force: true }));
const skills = [
  "capture-project-learnings",
  "compile-feature-spec",
  "maintain-docs",
  "maintain-project",
  "manage-issues",
  "review-change",
  "sync-docs-issues",
  "work-on-task",
  "playwright",
];
writeFileSync(
  path.join(source, "handbook-contract.json"),
  JSON.stringify({ protocolVersion: 1, skills }),
);
for (const name of skills) {
  const directory = path.join(source, ".agents/skills", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Fixture ${name}\n---\nFixture procedure.\n`,
  );
}
// Source-aware sync installs the managed Claude reviewer from the shared contract.
mkdirSync(path.join(source, ".agents/agents"), { recursive: true });
writeFileSync(
  path.join(source, ".agents/agents/reviewer.md"),
  "---\nname: reviewer\ndescription: Fixture reviewer\n---\nFixture review contract.\n",
);
mkdirSync(path.join(source, "docs"));
writeFileSync(
  path.join(source, "docs/consumer-bootstrap.md"),
  "# Fixture bootstrap\nRun handbook:check; retain the revision.\n",
);
// Sync inlines the session contract and installs startup routing by default.
mkdirSync(path.join(source, "docs/guidance"));
writeFileSync(
  path.join(source, "docs/guidance/communication.md"),
  "# Communication guidance\n\n## Session contract\n\nFixture contract.\n\n## Workflow adherence\n\nFixture routing.\n",
);
mkdirSync(path.join(source, "scripts"));
writeFileSync(
  path.join(source, ".agents/gated-commands.json"),
  JSON.stringify({
    ask: [["git", "push"]],
    retired: [["git", "commit"]],
    denyRead: ["**/.env"],
  }),
);
mkdirSync(path.join(source, ".agents/templates/github"), { recursive: true });
writeFileSync(
  path.join(source, ".agents/templates/github/PULL_REQUEST_TEMPLATE.md"),
  "# Shared PR starter\n",
);
cpSync(
  path.join(consumer, "scripts/handbook-integration.mjs"),
  path.join(source, "scripts/handbook-integration.mjs"),
);
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "handbook-integration-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = {
    version: 1,
    kind: "consumer",
    guidance: "docs/local.md",
    sourceMap: "docs/architecture.md#source-map",
    preferences: "docs/preferences.md",
    tracking: "tracking.json",
    technologySkills: ["playwright"],
  };
  mkdirSync(path.join(root, "docs"));
  writeFileSync(
    path.join(root, "docs/preferences.md"),
    "# Preferences\n- Issue language: English\n- Integration branch: main\n- Deployment branches: _staging (from main)\n",
  );
  writeFileSync(
    path.join(root, "tracking.json"),
    JSON.stringify({
      version: 1,
      provider: "github",
      organization: "example-org",
      repositories: ["example-org/product"],
      number: 2,
      url: "https://github.com/orgs/example-org/projects/2",
    }),
  );
  writeFileSync(path.join(root, "handbook.json"), JSON.stringify(config));
  writeFileSync(
    path.join(root, "AGENTS.md"),
    `Run handbook:check. Read ${config.guidance} and ${config.sourceMap}.`,
  );
  writeFileSync(
    path.join(root, "docs/local.md"),
    "# Local\nRead [architecture](architecture.md#source-map).\n",
  );
  writeFileSync(
    path.join(root, "docs/architecture.md"),
    "# Architecture\n\n## Source map\n" +
      mapSections
        .map(
          (name) => `\n### ${name}\nUnknown; resolve from project evidence.\n`,
        )
        .join(""),
  );
  return root;
}

test("consumer sync is idempotent and offline readiness needs no clone or credentials", (t) => {
  const root = fixture(t);
  const first = syncEntrypoints(root, { source, write: true });
  assert(first.changed.includes(".agents/skills/maintain-project/SKILL.md"));
  assert(first.changed.includes(".claude/skills/playwright/SKILL.md"));
  assert.deepEqual(syncEntrypoints(root, { source, write: true }).changed, []);
  assert.deepEqual(syncEntrypoints(root, { source }).warnings, []);
  assert.deepEqual(checkReadiness(root), { ready: true, warnings: [] });
  const wrapper = readFileSync(
    path.join(root, ".agents/skills/playwright/SKILL.md"),
    "utf8",
  );
  assert.match(wrapper, /retained Handbook path and full revision/);
  assert.match(wrapper, /Handbook bootstrap/);
  assert.match(
    readFileSync(path.join(root, ".agents/handbook.md"), "utf8"),
    /handbook:check/,
  );
});

test("readiness reports broken references, absent map sections and invalid metadata", (t) => {
  const root = fixture(t);
  syncEntrypoints(root, { source, write: true });
  writeFileSync(path.join(root, "docs/local.md"), "[missing](missing.md)");
  writeFileSync(
    path.join(root, "docs/architecture.md"),
    "## Source map\n### Components\n",
  );
  const result = checkReadiness(root);
  assert(!result.ready);
  assert(result.warnings.some((w) => w.includes("Broken reference")));
  assert(result.warnings.some((w) => w.includes("Components")));
  assert(result.warnings.some((w) => w.includes("Ownership")));
  writeFileSync(path.join(root, "handbook.json"), "{broken");
  assert.match(checkReadiness(root).warnings[0], /handbook.json/);
});

test("sync preserves custom instruction content and reports manually modified wrappers", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "CLAUDE.md"), "# Local Claude\nKeep this.\n");
  syncEntrypoints(root, { source, write: true });
  assert.equal(
    readFileSync(path.join(root, "CLAUDE.md"), "utf8"),
    "@AGENTS.md\n\n# Local Claude\nKeep this.\n",
  );
  const file = path.join(root, ".claude/skills/playwright/SKILL.md");
  const original = readFileSync(file, "utf8");
  writeFileSync(
    file,
    original.replace("Read and follow", "Local override: read"),
  );
  const result = syncEntrypoints(root, { write: true });
  assert(result.warnings.some((w) => w.includes("Preserved customized")));
  assert.match(readFileSync(file, "utf8"), /Local override/);
  assert(!result.changed.includes(".claude/skills/playwright/SKILL.md"));
});

test("metadata changes refresh managed references while preserving custom suffixes", (t) => {
  const root = fixture(t);
  syncEntrypoints(root, { source, write: true });
  const canonical = path.join(root, ".agents/skills/playwright/SKILL.md");
  const claude = path.join(root, ".claude/skills/playwright/SKILL.md");
  writeFileSync(claude, readFileSync(claude, "utf8") + "\nCustom suffix.\n");
  writeFileSync(
    canonical,
    readFileSync(canonical, "utf8").replace(
      /^description: .+$/m,
      'description: "Changed discovery text"',
    ),
  );
  const before = readFileSync(claude, "utf8");
  assert(syncEntrypoints(root).warnings.some((w) => w.includes("playwright")));
  assert.equal(readFileSync(claude, "utf8"), before);
  syncEntrypoints(root, { write: true });
  assert.match(readFileSync(claude, "utf8"), /Changed discovery text/);
  assert(readFileSync(claude, "utf8").endsWith("Custom suffix.\n"));
});

test("unmanaged consumer skills survive adoption and removed skills are reported", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, ".agents/skills/playwright"), { recursive: true });
  const file = path.join(root, ".agents/skills/playwright/SKILL.md");
  const own =
    "---\nname: playwright\ndescription: Local browser procedure\n---\nKeep local behavior.\n";
  writeFileSync(file, own);
  const result = syncEntrypoints(root, { source, write: true });
  assert(
    result.warnings.some((w) => w.includes("Preserved customized/unmanaged")),
  );
  assert.equal(readFileSync(file, "utf8"), own);
  rmSync(file);
  assert(
    syncEntrypoints(root).warnings.some((w) => w.includes("Orphan Claude")),
  );
});

test("skill integrity detects changed or deleted bootstrap and deleted Claude references", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "handbook-integrity-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of [
    ".agents/skills",
    ".agents/handbook.md",
    ".claude/skills",
    "CLAUDE.md",
    "handbook.json",
    "skills-lock.json",
    "scripts/check-skills.mjs",
  ]) {
    const destination = path.join(root, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(consumer, name), destination, { recursive: true });
  }
  const check = () =>
    spawnSync(process.execPath, ["scripts/check-skills.mjs"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
  const before = check();
  assert.equal(before.status, 0, before.error?.message || before.stderr);
  const bootstrap = path.join(root, ".agents/handbook.md");
  const original = readFileSync(bootstrap, "utf8");
  writeFileSync(bootstrap, original + "\nUnreviewed change.\n");
  assert.equal(check().status, 1, "modified bootstrap must fail integrity");
  rmSync(bootstrap);
  assert.equal(check().status, 1, "deleted bootstrap must fail integrity");
  writeFileSync(bootstrap, original);
  assert.equal(check().status, 0);
  rmSync(path.join(root, ".claude/skills/review-change/SKILL.md"));
  const after = check();
  assert.equal(after.status, 1, after.error?.message || after.stderr);
  assert.match(after.stderr, /Supporting contract files differ from lock/);
});

test("copied offline tool works independently of its original source tree", async (t) => {
  const root = fixture(t);
  syncEntrypoints(root, { source, write: true });
  mkdirSync(path.join(root, "scripts"));
  cpSync(
    path.join(source, "scripts/handbook-integration.mjs"),
    path.join(root, "scripts/handbook-integration.mjs"),
  );
  const { pathToFileURL } = await import("node:url");
  const independent = await import(
    pathToFileURL(path.join(root, "scripts/handbook-integration.mjs")).href
  );
  assert(independent.checkReadiness(root).ready);
});

test("gate upgrades remove exact retired rules and preserve custom client settings", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, ".claude"));
  writeFileSync(
    path.join(root, ".claude/settings.json"),
    JSON.stringify({
      model: "keep",
      permissions: {
        ask: ["Bash(git commit *)", "Bash(git commit --amend *)"],
        allow: ["Bash(npm test)"],
      },
    }),
  );
  syncEntrypoints(root, { source, write: true });
  const settings = JSON.parse(
    readFileSync(path.join(root, ".claude/settings.json"), "utf8"),
  );
  assert.equal(settings.model, "keep");
  assert.deepEqual(settings.permissions.allow, ["Bash(npm test)"]);
  assert(settings.permissions.ask.includes("Bash(git push *)"));
  assert(settings.permissions.ask.includes("Bash(git commit --amend *)"));
  assert(!settings.permissions.ask.includes("Bash(git commit *)"));
  assert(settings.permissions.deny.includes("Read(**/.env)"));
  assert.deepEqual(syncEntrypoints(root, { source, write: true }).changed, []);
});

test("template setup preserves existing copies until a named update", (t) => {
  const root = fixture(t);
  assert.deepEqual(syncTemplates(root, { source }).changed, []);
  assert.deepEqual(syncTemplates(root, { source, write: true }).changed, [
    ".github/PULL_REQUEST_TEMPLATE.md",
  ]);
  const file = path.join(root, ".github/PULL_REQUEST_TEMPLATE.md");
  writeFileSync(file, "# Local operator instructions\n");
  assert.deepEqual(syncTemplates(root, { source, write: true }).changed, []);
  assert.equal(readFileSync(file, "utf8"), "# Local operator instructions\n");
  syncTemplates(root, { source, update: [".github/PULL_REQUEST_TEMPLATE.md"] });
  assert.equal(readFileSync(file, "utf8"), "# Shared PR starter\n");
});
