import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { projectSchema, moduleIds } from "../src/lib/project";
import { validTemplateVersion } from "./template-version.mjs";

type Options = {
  source: string;
  revision: string;
  destination: string;
  manifest: unknown;
  mode: "application" | "examples";
  infrastructureProfile?: unknown;
  // GHCR owner for deployment.imageRepository; must match the GitHub repository.
  imageOwner?: string;
  // Remote URL for template updates; defaults to the source's origin.
  upstream?: string;
};
// Generated, local or source-owned files: deleted in the initialization commit.
const excluded =
  /^(?:\.git(?:\/|$)|node_modules\/|\.next\/|\.cache\/|\.codex\/|\.firebase\/|\.setup\/|output\/|dist\/|coverage\/|test-results\/|playwright-report\/|\.playwright-cli\/|android\/project\/|deploy\/config\.json$|\.agents\/(?:tracking\.json|repository\.md)$|docs\/features\/|deploy\/shared-owner\/.*\.patch$)|(?:^|\/)(?:\.vscode|\.idea)(?:\/|$)|(?:^|\/)\.npmrc$|\.(?:aab|apk|tsbuildinfo|log)$/i;
// Private material. Derived projects share the template's history, so a
// revision whose history ever contained such a path is refused, not filtered.
const privatePath =
  /(?:^|\/)(?:\.env(?!\.example$)[^/]*|\.aws|secrets?|credentials?)(?:\/|$)|(?:service[-_]?account|credentials?)[^/]*\.json$|\.(?:pem|key|keystore|jks)$/i;
// Scans every path any commit touched; object listings deduplicate identical
// content under one name and would miss a private file that matches another.
function privateHistory(source: string, revision: string) {
  const names = new Set(
    git(source, [
      "log",
      "--format=",
      "--name-only",
      "--no-renames",
      "-m",
      "-z",
      revision,
    ])
      .toString()
      .split(/[\0\n]/)
      .filter(Boolean),
  );
  for (const name of names) {
    if (privatePath.test(name)) return name;
    if (!/(?:^|\/)\.npmrc$/i.test(name)) continue;
    for (const commit of git(source, ["rev-list", revision, "--", name])
      .toString()
      .split("\n")
      .filter(Boolean)) {
      const blob = spawnSync(
        "git",
        ["-C", source, "show", `${commit}:${name}`],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      );
      // Literal auth values are private; ${ENV} references are not.
      if (
        blob.status === 0 &&
        /(?:_auth(?:Token)?|_password|password)\s*=\s*(?!\$\{)\S/i.test(
          blob.stdout,
        )
      )
        return name;
    }
  }
  return undefined;
}
// Credentials embedded in a remote URL are never copied to the new repository.
function upstreamUrl(source: string, supplied?: string) {
  let url = supplied;
  if (!url) {
    const origin = spawnSync(
      "git",
      ["-C", source, "remote", "get-url", "origin"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    url = origin.status === 0 ? origin.stdout.trim() : source;
  }
  // A password in any scheme, or any user info in HTTP(S), is a credential;
  // ssh://git@host and scp-style git@host:org/repo name only an account.
  if (
    /^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i.test(url) ||
    /^https?:\/\/[^/]*@/i.test(url)
  )
    throw new Error("The upstream URL must not contain credentials.");
  return url;
}
function git(source: string, args: string[], input?: string | Buffer) {
  const result = spawnSync("git", ["-C", source, ...args], {
    input,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(`Git ${args[0]} failed during project initialization.`);
  return result.stdout;
}
function inside(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
async function checkedDestination(source: string, destination: string) {
  const target = path.resolve(destination);
  if (
    target === path.parse(target).root ||
    inside(source, target) ||
    inside(target, source)
  )
    throw new Error(
      "Destination must be separate from the source repository and its ancestors.",
    );
  // Existing parents must be ordinary directories, not junctions/symlinks.
  let current = target;
  while (current !== path.parse(current).root) {
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("Unsafe destination path.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    current = path.dirname(current);
  }
  try {
    if ((await readdir(target)).length)
      throw new Error("Destination must be empty.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}
export async function createProject(options: Options) {
  const manifest = projectSchema.parse(options.manifest);
  const imageOwner = options.imageOwner?.toLowerCase() ?? "replace-owner";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(imageOwner))
    throw new Error("Image owner must be a GitHub user or organization name.");
  if (!["application", "examples"].includes(options.mode))
    throw new Error("Choose application or examples mode.");
  if (manifest.examples !== (options.mode === "examples"))
    throw new Error("Manifest example selection must match the explicit mode.");
  if (!moduleIds.every((id) => manifest.modules.includes(id)))
    throw new Error("New projects start with every reusable module enabled.");
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(options.revision))
    throw new Error("Supply the full reviewed Git commit ID.");
  const source = await realpath(options.source),
    target = await checkedDestination(source, options.destination);
  const revision = git(source, [
    "rev-parse",
    "--verify",
    `${options.revision}^{commit}`,
  ])
    .toString()
    .trim();
  const entries = git(source, ["ls-tree", "-rz", "--full-tree", revision])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);
      if (!match) throw new Error("Invalid source tree.");
      const [, mode, type, object, name] = match;
      if (
        name.includes("\\") ||
        name
          .split("/")
          .some(
            (part) =>
              !part || part === "." || part === ".." || part.includes(":"),
          ) ||
        name.startsWith("/")
      )
        throw new Error("Unsafe source path.");
      if (type !== "blob" || !["100644", "100755"].includes(mode))
        throw new Error("Source symlinks and submodules are not supported.");
      return { mode, object, name, removed: excluded.test(name) };
    });
  if (
    new Set(entries.map((entry) => entry.name.toLowerCase())).size !==
    entries.length
  )
    throw new Error("Source paths collide on case-insensitive filesystems.");
  const removed = entries
    .filter((entry) => entry.removed)
    .map((entry) => entry.name);
  const names = new Set(
    entries
      .filter((entry) => !entry.removed)
      .map((entry) => entry.name.toLowerCase()),
  );
  for (const required of [
    "package.json",
    "package-lock.json",
    "project.config.json",
    ".env.example",
    "deploy/config.example.json",
    "scripts/i18n-assets.mjs",
    "deploy/environments/local.json",
    "deploy/environments/staging.json",
    "deploy/environments/production.json",
    "deploy/contract.json",
    "scripts/deploy/operations.py",
  ])
    if (!names.has(required))
      throw new Error(
        "The reviewed revision does not contain the reusable-project contract.",
      );
  if (!names.has("template.json"))
    throw new Error(
      "The reviewed revision predates template versioning; select a revision with template.json.",
    );
  // A shallow source would yield a broken repository and an incomplete scan.
  if (
    git(source, ["rev-parse", "--is-shallow-repository"]).toString().trim() ===
    "true"
  )
    throw new Error(
      "Initialize from a full clone of the template, not a shallow one.",
    );
  const upstream = upstreamUrl(source, options.upstream);
  const leaked = privateHistory(source, revision);
  if (leaked)
    throw new Error(
      `The reviewed history contains private material (${leaked}); derived projects would inherit it.`,
    );
  await mkdir(path.dirname(target), { recursive: true });
  const staging = await mkdtemp(
    path.join(path.dirname(target), `.${manifest.slug}-create-`),
  );
  // On failure retain only this newly created staging directory for inspection;
  // never recursively remove an existing user destination.
  // The derived repository shares the reviewed commit's history so later
  // template releases merge; only objects reachable from it are copied.
  git(staging, ["init", "-q", "-b", "main"]);
  git(
    staging,
    ["index-pack", "--stdin"],
    git(source, ["pack-objects", "--revs", "--stdout", "-q"], revision + "\n"),
  );
  git(staging, ["update-ref", "refs/heads/main", revision]);
  git(staging, ["reset", "-q", "--hard"]);
  for (const name of removed)
    await rm(path.join(staging, name), { force: true });
  // Prune directories the removals emptied, deepest first.
  const emptied = [
    ...new Set(
      removed.flatMap((name) =>
        name
          .split("/")
          .slice(0, -1)
          .map((_, index, parts) => parts.slice(0, index + 1).join("/")),
      ),
    ),
  ].sort((a, b) => b.split("/").length - a.split("/").length);
  for (const directory of emptied)
    await rmdir(path.join(staging, directory)).catch(() => undefined);
  const json = async (file: string, value: unknown) =>
    writeFile(path.join(staging, file), JSON.stringify(value, null, 2) + "\n");
  const readJson = async (file: string) =>
    JSON.parse(await readFile(path.join(staging, file), "utf8"));
  const old = await readJson("project.config.json");
  const deploymentContract = await readJson("deploy/contract.json");
  if (deploymentContract.version !== 1 || !deploymentContract.settings)
    throw new Error(
      "Adopt a supported deployment contract before initialization.",
    );
  // Tracking identity and user-confirmed preferences belong to this repository.
  // Derived repositories select their own during Handbook adoption.
  if (names.has("handbook.json")) {
    const handbook = await readJson("handbook.json");
    if (
      handbook.tracking === ".agents/tracking.json" ||
      handbook.preferences === ".agents/repository.md"
    )
      await mkdir(path.join(staging, ".agents"), { recursive: true });
    if (handbook.tracking === ".agents/tracking.json")
      await json(handbook.tracking, {
        version: 1,
        provider: "github",
        organization: null,
        repositories: [],
      });
    if (handbook.preferences === ".agents/repository.md")
      await writeFile(
        path.join(staging, handbook.preferences),
        "# Repository preferences\n\nNot configured. During Handbook adoption, confirm the issue language, integration\nbranch and deployment promotion sources with this repository's owner.\n",
      );
  }
  await json("project.config.json", manifest);
  const theme = path.join(staging, "src/project/theme.css");
  if (existsSync(theme)) {
    const skeleton = await readFile(theme, "utf8");
    await writeFile(theme, skeleton.replaceAll("project-slug", manifest.slug));
    await mkdir(path.join(staging, "public/fonts"), { recursive: true });
  }
  await writeFile(
    path.join(staging, ".npmrc"),
    "cache=.cache/npm\nsave-exact=true\n",
  );
  const pkg = await readJson("package.json");
  pkg.name = manifest.slug;
  pkg.scripts = {
    ...pkg.scripts,
    "deploy:ops": "python scripts/deploy/operations.py",
  };
  await json("package.json", pkg);
  const lock = await readJson("package-lock.json");
  lock.name = manifest.slug;
  if (lock.packages?.[""]) lock.packages[""].name = manifest.slug;
  await json("package-lock.json", lock);
  const prefix = manifest.slug.replaceAll("-", "_");
  const overrides: Record<string, string> = {
    APP_NAME: JSON.stringify(manifest.displayName),
    APP_STYLE: manifest.defaultStyle,
    FIREBASE_PROJECT_ID: `demo-${manifest.slug}`,
    MONGODB_DATABASE: `${prefix}_local`,
    PAYMENTS_MODE: options.mode === "examples" ? "simulation" : "disabled",
    DIFY_MODE: options.mode === "examples" ? "fake" : "disabled",
    MCP_ENABLED: "false",
    ANDROID_PACKAGE_NAME: manifest.android?.packageName ?? "",
  };
  let env = await readFile(path.join(staging, ".env.example"), "utf8");
  for (const [key, value] of Object.entries(overrides)) {
    const line = new RegExp(`^#? ?${key}=.*$`, "m");
    env = line.test(env)
      ? env.replace(line, () => `${key}=${value}`)
      : env + `\n${key}=${value}\n`;
  }
  await writeFile(path.join(staging, ".env.example"), env);
  const deploy = await readJson("deploy/config.example.json");
  deploy.imageRepository = `ghcr.io/${imageOwner}/${manifest.slug}`;
  const seed = createHash("sha256")
    .update(manifest.slug)
    .digest()
    .readUInt32BE();
  for (const [i, environment] of ["staging", "production"].entries()) {
    deploy[environment].mongoDatabase = `${prefix}_${environment}`;
    deploy[environment].mongoUser = `${prefix}_${environment}`;
    deploy[environment].firebaseProject =
      `replace-${manifest.slug}-${environment}`;
    deploy[environment].port = 20000 + (seed % 15000) * 2 + i;
    const subnet = (seed % 32768) * 2 + i;
    deploy[environment].ingressSubnet =
      `172.${16 + Math.floor(subnet / 4096)}.${Math.floor(subnet / 16) % 256}.${(subnet % 16) * 16}/28`;
  }
  await json("deploy/config.example.json", deploy);
  // Deployment connections are installation-owned. Only an explicit public
  // profile can opt a derived app into shared services.
  const profile = options.infrastructureProfile as
    Record<string, Record<string, unknown>> | undefined;
  const profileKeys: Record<string, string[]> = {
    ssh: [
      "host",
      "user",
      "cloudflaredVersion",
      "cloudflaredSha256",
      "transport",
    ],
    shared: [
      "ownerRepository",
      "ownerRef",
      "routeWorkflow",
      "tunnelId",
      "cloudflareAccountId",
      "cloudflareZoneId",
      "routeMode",
    ],
    atlas: ["projectId", "clusterName", "vpsEgressCidr"],
    google: [
      "stagingProjectId",
      "parent",
      "workloadIdentityProvider",
      "provisionerServiceAccount",
      "oauthClientId",
    ],
    deployment: ["redisImage", "nginxImage", "adminImage"],
    ghcr: ["pullUser"],
  };
  if (profile) {
    if (typeof profile !== "object" || Array.isArray(profile))
      throw new Error("Invalid infrastructure profile.");
    for (const [section, values] of Object.entries(profile)) {
      if (
        !profileKeys[section] ||
        !values ||
        typeof values !== "object" ||
        Array.isArray(values)
      )
        throw new Error("Invalid infrastructure profile section.");
      for (const [key, value] of Object.entries(values))
        if (
          !profileKeys[section].includes(key) ||
          (value !== null &&
            (typeof value !== "string" || /[\r\n\0]/.test(value)))
        )
          throw new Error(
            "Infrastructure profiles contain allowlisted public connections only.",
          );
    }
  }
  for (const [i, environment] of ["local", "staging", "production"].entries()) {
    const config = await readJson(`deploy/environments/${environment}.json`);
    config.runtime.APP_NAME = manifest.displayName;
    config.runtime.APP_STYLE = manifest.defaultStyle;
    config.runtime.MONGODB_DATABASE = `${prefix}_${environment}`;
    config.runtime.APP_ENV = environment;
    config.runtime.APP_ORIGIN =
      environment === "local" ? "http://localhost:3000" : null;
    config.runtime.FIREBASE_PROJECT_ID =
      environment === "local" ? `demo-${manifest.slug}` : null;
    config.runtime.AUTH_MODE =
      environment === "local" ? "emulator" : "firebase";
    config.runtime.DIFY_MODE =
      environment === "local" && options.mode === "examples"
        ? "fake"
        : "disabled";
    config.runtime.PAYMENTS_MODE =
      environment === "local" && options.mode === "examples"
        ? "simulation"
        : "disabled";
    config.runtime.MCP_ENABLED = "false";
    // Copy no source provider links, Android association or optional integrations.
    for (const key of Object.keys(config.runtime))
      if (
        ![
          "APP_NAME",
          "APP_STYLE",
          "MONGODB_DATABASE",
          "APP_ENV",
          "APP_ORIGIN",
          "FIREBASE_PROJECT_ID",
          "AUTH_MODE",
          "DIFY_MODE",
          "PAYMENTS_MODE",
          "MCP_ENABLED",
          "ASSET_STORE",
          "MONGODB_URI",
          "FIREBASE_AUTH_EMULATOR_HOST",
        ].includes(key)
      )
        delete config.runtime[key];
    config.runtime.ASSET_STORE = "mongo";
    config.runtime.DIAGNOSTICS_ENABLED = "false";
    if (environment === "local") {
      config.runtime.MONGODB_URI = "mongodb://127.0.0.1:27017";
      config.runtime.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    } else {
      delete config.runtime.MONGODB_URI;
      delete config.runtime.FIREBASE_AUTH_EMULATOR_HOST;
    }
    for (const section of Object.keys(profileKeys)) {
      config[section] = Object.fromEntries(
        Object.keys(config[section]).map((key) => [key, null]),
      );
      if (environment !== "local" && profile?.[section])
        for (const [key, value] of Object.entries(profile[section]))
          if (key !== "stagingProjectId") config[section][key] = value;
    }
    config.shared.routeWorkflow ??= "shared-app-routes.yml";
    config.android = {
      host: null,
      packageName: manifest.android?.packageName ?? null,
    };
    config.atlas.mongoUser = `${prefix}_${environment}`;
    config.deployment.imageRepository = `ghcr.io/${imageOwner}/${manifest.slug}`;
    const deployIndex = Math.max(0, i - 1);
    config.deployment.port = 20000 + (seed % 15000) * 2 + deployIndex;
    const subnet = (seed % 32768) * 2 + deployIndex;
    config.deployment.ingressSubnet = `172.${16 + Math.floor(subnet / 4096)}.${Math.floor(subnet / 16) % 256}.${(subnet % 16) * 16}/28`;
    if (environment === "staging" && profile?.google?.stagingProjectId) {
      config.google.projectId = profile.google.stagingProjectId;
      config.runtime.FIREBASE_PROJECT_ID = profile.google.stagingProjectId;
    }
    await json(`deploy/environments/${environment}.json`, config);
  }
  for (const entry of entries.filter(
    (entry) =>
      (!entry.removed && entry.name.startsWith(".github/workflows/")) ||
      entry.name === "Dockerfile" ||
      entry.name === "public/sw.js",
  )) {
    const file = path.join(staging, entry.name);
    let content = (await readFile(file, "utf8")).replaceAll(
      old.slug,
      manifest.slug,
    );
    if (entry.name.startsWith(".github/workflows/"))
      content = content.replace(
        /^name: (.+)$/m,
        (_, name: string) =>
          "name: " +
          JSON.stringify(
            name
              .replaceAll(old.displayName, () => manifest.displayName)
              .replaceAll("Unibase", () => manifest.displayName),
          ),
      );
    await writeFile(file, content);
  }
  // The next build regenerates the public recovery assets from the new manifest.
  for (const file of ["public/offline.html", "public/offline-locale.js"]) {
    const content = await readFile(path.join(staging, file), "utf8");
    await writeFile(
      path.join(staging, file),
      content
        .replaceAll(
          `${old.slug}-offline-locale`,
          `${manifest.slug}-offline-locale`,
        )
        .replaceAll(`namespace=${old.slug}`, `namespace=${manifest.slug}`),
    );
  }
  const template = await readJson("template.json");
  if (!validTemplateVersion(template.version))
    throw new Error("The reviewed revision has no valid template version.");
  // The template's milestones are not the project's: start an empty plan.
  await writeFile(
    path.join(staging, "docs/implementation-plan.md"),
    `# Implementation plan

Accepted milestones for ${manifest.displayName}. Accepted milestones authorize
implementation without a new issue; add them here as they are agreed.

## Current state

Created from template ${template.version}.

## Open work

None yet.
`,
  );
  await json("project.source.json", {
    version: 1,
    revision,
    templateVersion: template.version,
    upstreamRemote: "upstream",
    mode: options.mode,
  });
  await mkdir(path.join(staging, "docs"), { recursive: true });
  await json("deploy/image-retention.proposal.json", {
    version: 1,
    project: manifest.slug,
    imageRepository: `ghcr.io/${imageOwner}/${manifest.slug}`,
    environments: { staging: "staging", prod: "production" },
    automatic: false,
    status: "Owner review and explicit Infrastructure enrollment required",
  });
  await writeFile(
    path.join(staging, "docs/deployment-start.md"),
    `# ${manifest.displayName} deployment setup\n\n` +
      "Configure deploy/environments/staging.json and production.json with this project's public bindings. " +
      "External targets are staging and prod; retained production paths and APP_ENV=production stay unchanged.\n\n" +
      "Run npm run deploy:ops -- doctor staging (or prod). Collect missing credential references through the secure channel. " +
      "Run scripts/deploy/staging-setup.py with --environment staging or prod to preview the existing setup flow. " +
      "Review its exact digest before applying. Never copy parent database, Firebase web registration, network allocations or credentials.\n\n" +
      "After reviewed host enrollment, promote main to _staging or _prod. A protected configuration change needs an immutable " +
      "projected bundle and Infrastructure approval of the exact plan. Use deploy:ops plan, status, check, rollback, backup and restore. " +
      "Backup and restore return approval plans; restore requires an exact snapshot and destination. " +
      "Complete disposable recovery acceptance before production activation.\n\n" +
      "Review deploy/image-retention.proposal.json with Infrastructure after selecting the image repository. " +
      "It grants no enrollment or cleanup authority. Install image-retention-v1, enroll this project explicitly, " +
      "and inspect deploy:ops maintenance staging before release. Retention keeps at least three successful releases " +
      "and fourteen days of activations, plus current/previous and pending recovery; image pulls require 20 GiB free.\n",
  );
  git(staging, ["add", "-A"]);
  const commit = spawnSync(
    "git",
    [
      "-C",
      staging,
      "commit",
      "-q",
      "-m",
      `Initialize ${manifest.slug} from template ${template.version}`,
    ],
    { windowsHide: true },
  );
  if (commit.status !== 0)
    throw new Error(
      "Could not create the initialization commit. Configure git user.name and user.email.",
    );
  git(staging, ["remote", "add", "upstream", upstream]);
  await checkedDestination(source, target);
  try {
    await rmdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(staging, target);
      break;
    } catch (error) {
      // Windows scanners can briefly hold freshly written files. Retry only a
      // transient lock, and never replace a destination created in the meantime.
      if (
        process.platform !== "win32" ||
        attempt >= 5 ||
        !["EPERM", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
      try {
        await lstat(target);
        throw error;
      } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code !== "ENOENT") throw probe;
      }
      await checkedDestination(source, target);
      await delay(100 * (attempt + 1));
    }
  }
  return { destination: target, revision, slug: manifest.slug };
}
