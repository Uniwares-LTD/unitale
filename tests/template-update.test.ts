import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { removeSample } from "../scripts/samples.mjs";
import { templateUpdate, upgradeNotes } from "../scripts/template-update.mjs";

const changelog = (versions: string[]) =>
  "# Log\n\n" +
  versions
    .map(
      (version) =>
        `## ${version}\n\n### Changes\n\n- ${version}\n\n### Upgrade notes\n\nNotes for ${version}.\n\n`,
    )
    .join("");

test("upgrade notes cover releases after the current version", () => {
  assert.deepEqual(
    upgradeNotes(
      changelog(["Unreleased", "1.2.0", "1.1.0", "1.0.0"]),
      "1.0.0",
      "1.2.0",
    ).map((section) => section.version),
    ["1.1.0", "1.2.0"],
  );
});

test("template updates merge releases, keep deliberate deletions and stop on conflicts", async () => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: "Template fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Template fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  });
  const root = await mkdtemp(path.join(tmpdir(), "template-update-"));
  const template = path.join(root, "template"),
    project = path.join(root, "project");
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = async (repo: string, files: Record<string, unknown>) => {
    for (const [file, value] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
      await writeFile(
        path.join(repo, file),
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2) + "\n",
      );
    }
  };
  const release = async (version: string, files: Record<string, unknown>) => {
    await write(template, {
      "template.json": { version, changelog: "CHANGELOG.md" },
      ...files,
    });
    git(template, "add", "-A");
    git(template, "commit", "-q", "-m", `Release ${version}`);
    git(template, "tag", `template-v${version}`);
  };
  try {
    await mkdir(template);
    git(template, "init", "-q", "-b", "main");
    await release("1.0.0", {
      ".gitattributes": "* text=auto eol=lf\n",
      "CHANGELOG.md": changelog(["1.0.0"]),
      "README.md": "v1\n",
      "android/project/build.gradle": "generated v1\n",
      "samples.json": {
        version: 1,
        samples: {
          demo: {
            description: "x",
            requires: [],
            paths: ["src/samples/demo"],
            modules: ["demo"],
            messages: [],
            mcpPermissions: [],
          },
        },
      },
      "project.config.json": { modules: ["files", "demo"] },
      "messages/en.json": { ui: {} },
      "messages/ar.json": { ui: {} },
      "scripts/deploy/environment-catalog.json": { mcpPermissions: [] },
      "src/project/extensions.ts":
        'import { demo } from "../samples/demo/a"; // sample:demo\nexport const extensions = [\n  demo, // sample:demo\n];\n',
      "src/project/server.ts": "export const serverExtensions = [];\n",
      "src/samples/demo/a.ts": "export const demo = 1;\n",
    });

    // A derived project: shared history, initialization exclusions, one
    // removed sample and its own feature.
    spawnSync("git", ["clone", "-q", "-o", "upstream", template, project]);
    await rm(path.join(project, "android"), { recursive: true });
    await write(project, {
      "project.source.json": {
        version: 1,
        revision: git(template, "rev-parse", "HEAD"),
        templateVersion: "1.0.0",
        upstreamRemote: "upstream",
      },
    });
    git(project, "add", "-A");
    git(project, "commit", "-q", "-m", "Initialize");
    await removeSample(project, "demo", { generate: false });
    await write(project, {
      "src/feature.ts": "export const feature = 1;\n",
      "src/project/theme.css": "/* project theme */\n",
      "public/fonts/project-font.woff2": "project font content\n",
      // The project registers its own feature next to the removed sample.
      "src/project/extensions.ts":
        'import { feature } from "../feature";\nexport const extensions = [\n  feature,\n];\n',
    });
    git(project, "add", "-A");
    git(project, "commit", "-q", "-m", "Project work");

    await release("1.1.0", {
      "CHANGELOG.md": changelog(["1.1.0", "1.0.0"]),
      "README.md": "v2\n",
      "src/project/theme.css": "/* template starter */\n",
      "public/fonts/project-font.woff2": "template font content\n",
      "project.config.json": { modules: ["files", "demo", "extra"] },
      "android/project/build.gradle": "generated v2\n",
      "src/samples/demo/a.ts": "export const demo = 2;\n",
      "src/samples/demo/b.ts": "export const added = 1;\n",
      "src/project/extensions.ts":
        'import { demo } from "../samples/demo/a"; // sample:demo\nimport { more } from "../samples/demo/b"; // sample:demo\nexport const extensions = [\n  demo, // sample:demo\n  more, // sample:demo\n];\n',
    });

    const result = await templateUpdate(project, "1.1.0", { generate: false });
    assert.deepEqual([result.status, result.conflicts], ["merged", undefined]);
    assert.deepEqual(
      result.notes?.map((section) => section.version),
      ["1.1.0"],
    );
    assert.equal(
      await readFile(path.join(project, "README.md"), "utf8"),
      "v2\n",
    );
    assert.equal(existsSync(path.join(project, "src/samples/demo")), false);
    assert.equal(existsSync(path.join(project, "android")), false);
    assert.ok(result.kept.includes("android/project/build.gradle"));
    // Project-owned installation files keep the project's version.
    assert.ok(result.projectVersions?.includes("project.config.json"));
    for (const [file, content] of [
      ["src/project/theme.css", "/* project theme */\n"],
      ["public/fonts/project-font.woff2", "project font content\n"],
    ]) {
      assert.ok(result.projectVersions?.includes(file));
      assert.equal(await readFile(path.join(project, file), "utf8"), content);
    }
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(project, "project.config.json"), "utf8"),
      ).modules,
      ["files"],
    );
    assert.ok(existsSync(path.join(project, "src/feature.ts")));
    const registry = await readFile(
      path.join(project, "src/project/extensions.ts"),
      "utf8",
    );
    assert.doesNotMatch(registry, /demo|more/);
    assert.match(registry, /extensions = \[\s*feature/);
    const record = JSON.parse(
      await readFile(path.join(project, "project.source.json"), "utf8"),
    );
    assert.equal(record.templateVersion, "1.1.0");
    assert.equal(record.revision, git(template, "rev-parse", "HEAD"));
    assert.deepEqual(record.removedSamples, ["demo"]);
    assert.equal(git(project, "status", "--porcelain"), "");
    assert.equal(
      git(project, "rev-list", "--parents", "-n", "1", "HEAD").split(" ")
        .length,
      3,
    );
    assert.equal((await templateUpdate(project, "1.1.0")).status, "current");

    // Competing edits stop with the conflicts listed and the merge open.
    await write(project, { "README.md": "project\n" });
    git(project, "commit", "-q", "-am", "Project readme");
    await release("1.2.0", {
      "CHANGELOG.md": changelog(["1.2.0", "1.1.0", "1.0.0"]),
      "README.md": "v3\n",
    });
    const conflicted = await templateUpdate(project, "1.2.0", {
      generate: false,
    });
    assert.equal(conflicted.status, "conflicts");
    assert.deepEqual(conflicted.conflicts, ["README.md"]);
    // The release is already staged, so a hand-resolved commit records it.
    assert.equal(
      JSON.parse(git(project, "show", ":project.source.json")).templateVersion,
      "1.2.0",
    );
    assert.deepEqual(
      conflicted.notes?.map((section) => section.version),
      ["1.2.0"],
    );
    await assert.rejects(
      templateUpdate(project, "1.2.0"),
      /local changes|merge in progress/,
    );
    git(project, "merge", "--abort");
    await assert.rejects(templateUpdate(project, "9.9.9"), /not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
