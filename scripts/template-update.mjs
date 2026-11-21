// Merges a template release into a derived project.
// Usage: node scripts/template-update.mjs <version|ref> [--remote upstream]
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
import { removeSample } from "./samples.mjs";
import {
  changelogSections,
  validTemplateVersion,
} from "./template-version.mjs";

function runner(root) {
  return (args, { allowFailure = false } = {}) => {
    const result = spawnSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0 && !allowFailure)
      throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result;
  };
}
const registries = ["src/project/extensions.ts", "src/project/server.ts"];
// Files each project rewrites at creation and owns afterwards. On conflict the
// project's version is kept; template changes to them arrive as upgrade notes.
const projectOwned = [
  /^project\.config\.json$/,
  /^src\/project\/theme\.css$/,
  /^public\/fonts\//,
  /^deploy\/environments\/[^/]+\.json$/,
  /^\.agents\/(?:tracking\.json|repository\.md)$/,
  /^docs\/implementation-plan\.md$/,
];

// Three-way merge of one conflicted file with lines matching `marker` removed
// from the base, project and template versions. Returns true when clean.
function mergeWithoutMarkers(root, git, file, marker) {
  const versions = [1, 2, 3].map((stage) =>
    git(["show", `:${stage}:${file}`], { allowFailure: true })
      .stdout.split("\n")
      .filter((line) => !marker.test(line))
      .join("\n"),
  );
  const temp = mkdtempSync(path.join(tmpdir(), "template-merge-"));
  try {
    const [base, ours, theirs] = ["base", "ours", "theirs"].map((name, i) => {
      const target = path.join(temp, name);
      writeFileSync(target, versions[i]);
      return target;
    });
    const merged = spawnSync("git", ["merge-file", "-p", ours, base, theirs], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (merged.status !== 0) return false;
    writeFileSync(path.join(root, file), merged.stdout);
    return true;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
const compare = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

// Release notes after `from` up to and including `to`, oldest first.
export function upgradeNotes(changelog, from, to) {
  return changelogSections(changelog)
    .filter(
      ({ version }) =>
        validTemplateVersion(version) &&
        compare(version, from) > 0 &&
        compare(version, to) <= 0,
    )
    .reverse();
}

export async function templateUpdate(
  root,
  target,
  { remote = "upstream", generate = true } = {},
) {
  const git = runner(root);
  if (git(["status", "--porcelain"]).stdout.trim())
    throw new Error("Commit or stash local changes before updating.");
  const merging = () =>
    existsSync(
      path.resolve(
        root,
        git(["rev-parse", "--git-path", "MERGE_HEAD"]).stdout.trim(),
      ),
    );
  if (merging()) throw new Error("Finish the merge in progress first.");
  git(["fetch", "--quiet", "--tags", remote]);
  // Versions name release tags; other refs resolve on the remote first so
  // "main" means the template's branch, not this project's.
  const candidates = validTemplateVersion(target)
    ? [`template-v${target}`]
    : [`${remote}/${target}`, target];
  const commit = candidates
    .map((candidate) =>
      git(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], {
        allowFailure: true,
      }).stdout.trim(),
    )
    .find(Boolean);
  if (!commit) throw new Error(`Template release ${target} was not found.`);
  const show = (file) => git(["show", `${commit}:${file}`]).stdout;
  const sourceFile = path.join(root, "project.source.json");
  const record = JSON.parse(readFileSync(sourceFile, "utf8"));
  const from = record.templateVersion;
  const to = JSON.parse(show("template.json")).version;
  if (!validTemplateVersion(from) || !validTemplateVersion(to))
    throw new Error("Template versions must be MAJOR.MINOR.PATCH.");
  if (compare(to, from) < 0)
    throw new Error(`Refusing to move from template ${from} back to ${to}.`);

  if (
    git(["merge-base", "--is-ancestor", commit, "HEAD"], { allowFailure: true })
      .status === 0
  )
    return {
      status: "current",
      from,
      to,
      kept: /** @type {string[]} */ ([]),
      projectVersions: /** @type {string[]} */ ([]),
      notes: [],
    };
  const merge = git(["merge", "--no-ff", "--no-commit", commit], {
    allowFailure: true,
  });
  // Files this project deliberately deleted (initialization exclusions and
  // removed samples) stay deleted when the template changed them.
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const projectVersions = [];
  const removedNames = record.removedSamples ?? [];
  const removedMarker = removedNames.length
    ? new RegExp(`//\\s*sample:(?:${removedNames.join("|")})\\s*$`)
    : undefined;
  const conflicts = () =>
    git(["status", "--porcelain", "-z"])
      .stdout.split("\0")
      .filter((row) => /^(?:DD|AU|UD|UA|DU|AA|UU) /.test(row));
  for (const row of conflicts()) {
    const file = row.slice(3);
    if (row.startsWith("DU ")) {
      git(["rm", "-q", "--", file]);
      kept.push(file);
    } else if (
      // Only states with a project-side version can keep it.
      !/^(?:UA|DD) /.test(row) &&
      projectOwned.some((pattern) => pattern.test(file))
    ) {
      git(["checkout", "--ours", "--", file]);
      git(["add", "--", file]);
      projectVersions.push(file);
    } else if (file === "samples.json") {
      // Removed samples are reapplied below from the release's declarations;
      // samples only this project declared are kept.
      const ours = JSON.parse(git(["show", `:2:${file}`]).stdout).samples ?? {};
      const theirs = JSON.parse(git(["show", `:3:${file}`]).stdout);
      const base =
        JSON.parse(
          git(["show", `:1:${file}`], { allowFailure: true }).stdout || "{}",
        ).samples ?? {};
      for (const [name, sample] of Object.entries(ours))
        if (!theirs.samples[name] && !base[name]) theirs.samples[name] = sample;
      writeFileSync(
        path.join(root, file),
        JSON.stringify(theirs, null, 2) + "\n",
      );
      git(["add", "--", file]);
    } else if (registries.includes(file) && removedMarker)
      // The project deleted removed samples' marked lines; merge the three
      // versions without them so its own entries survive.
      if (mergeWithoutMarkers(root, git, file, removedMarker))
        git(["add", "--", file]);
  }
  if (merge.status !== 0 && !merging())
    throw new Error(`git merge failed: ${merge.stderr.trim()}`);
  // Record the release before any manual step, so committing a hand-resolved
  // merge also records the new template version.
  const recordRelease = () => {
    const updated = JSON.parse(readFileSync(sourceFile, "utf8"));
    updated.revision = commit;
    updated.templateVersion = to;
    writeFileSync(sourceFile, JSON.stringify(updated, null, 2) + "\n");
    git(["add", "--", "project.source.json"]);
  };
  const notes = upgradeNotes(show("CHANGELOG.md"), from, to);
  const remaining = conflicts().map((row) => row.slice(3));
  if (remaining.length) {
    if (!remaining.includes("project.source.json")) recordRelease();
    return {
      status: "conflicts",
      from,
      to,
      conflicts: remaining,
      kept,
      projectVersions,
      notes,
    };
  }

  // Reapply removed samples using the release's declarations, so registry
  // lines, messages or files the template added for them are removed too.
  const upstreamSamples = JSON.parse(show("samples.json")).samples ?? {};
  try {
    for (const name of removedNames.filter((name) => upstreamSamples[name])) {
      const local = JSON.parse(
        readFileSync(path.join(root, "samples.json"), "utf8"),
      );
      local.samples[name] = upstreamSamples[name];
      writeFileSync(
        path.join(root, "samples.json"),
        JSON.stringify(local, null, 2) + "\n",
      );
      await removeSample(root, name, { generate });
    }
  } catch (error) {
    throw new Error(
      `The merge is open, but reapplying removed samples failed: ${error instanceof Error ? error.message : error} Resolve it (for example remove the dependent sample with samples:remove), then git add and git commit, or run git merge --abort.`,
    );
  }
  recordRelease();
  git(["add", "-A"]);
  git(["commit", "-q", "-m", `Merge template ${to}`]);
  return {
    status: "merged",
    from,
    to,
    kept,
    projectVersions,
    notes,
  };
}

async function main() {
  const [target, ...rest] = process.argv.slice(2);
  const remoteIndex = rest.indexOf("--remote");
  if (!target || (remoteIndex >= 0 && !rest[remoteIndex + 1])) {
    console.error(
      "Usage: template-update.mjs <version|ref> [--remote upstream]",
    );
    process.exitCode = 1;
    return;
  }
  try {
    const result = await templateUpdate(".", target, {
      remote: remoteIndex >= 0 ? rest[remoteIndex + 1] : "upstream",
    });
    for (const file of result.kept)
      console.log(`kept deleted: ${file} (changed by the template)`);
    for (const file of result.projectVersions ?? [])
      console.log(
        `kept project version: ${file} (review the template's change in the upgrade notes)`,
      );
    if (result.status === "current") {
      console.log(`This project already includes template ${result.to}.`);
      return;
    }
    if (result.status === "conflicts") {
      console.error(
        `Template ${result.to} needs manual conflict resolution in:\n  ${result.conflicts.join("\n  ")}\nResolve them, then run git add and git commit; project.source.json already records ${result.to}. Run samples:remove again for any removed sample the merge restored.`,
      );
      process.exitCode = 1;
    } else console.log(`Merged template ${result.from} -> ${result.to}.`);
    for (const { version, body } of result.notes)
      console.log(`\n## ${version}${body.trimEnd()}`);
    console.log(
      "\nApply the upgrade notes above, then run npm ci, npm run validate and npm run build.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
