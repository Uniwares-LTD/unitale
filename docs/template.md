# Using the template

Base is maintained as a template. Products are separate repositories that share
its Git history, so template fixes reach them by merging. This guide covers the
whole lifecycle; command details are in the [README](../README.md#start-a-derived-project).

## Create a project

Create projects only with `npm run project:create` from a released template commit
(the commit of a `template-v<version>` tag, for example
`git rev-parse template-v0.3.0^{commit}`), passing `--image-owner` with the GitHub
organization that will own the project's repository. Do not use GitHub's "Use this template" button: it
copies files without history, and `template:update` could never merge into such a
repository. The initializer:

- copies the reviewed history and adds one initialization commit and an `upstream`
  remote;
- rewrites package, environment, deployment-example, workflow-name and offline
  identity from the manifest;
- deletes generated files, this repository's tracking choices and its own planning
  documents (`docs/features/`), and starts an empty `docs/implementation-plan.md`;
- refuses revisions whose history ever contained private material.

## First steps in a new project

1. Create the GitHub repository and set `origin`; push `main`.
2. Remove samples you do not need: `npm run samples`, then
   `npm run samples:remove -- <name>`.
3. Adopt the shared Handbook (`npm run handbook:setup`, then `npm run handbook:ready`)
   and confirm `.agents/tracking.json`, `.agents/repository.md` and the
   [source map](source-map.md) during adoption.
4. Replace product copy and branding: the home page (set a component in `src/project/home.tsx`),
   icons (`npm run icons:generate`), theme colors in `src/app/manifest.ts` and
   the offline source `scripts/i18n-assets.mjs` (regenerate the asset).
   Use the [derived-project design guide](design-system-extension.md) for a theme.
   Set the per-project theme color, offline background and text, and icon colors
   to match your product.
5. Write the project's first milestones in `docs/implementation-plan.md`.
6. For deployment, follow [derived-project deployment initialization](deployment.md#derived-project-deployment-initialization).
   `deployment.imageRepository` must equal `ghcr.io/<owner>/<repository>` of the
   GitHub repository (`--image-owner` sets the owner; rename it if the repository
   name differs from the slug), create the `_staging` and `_prod` branches, and create
   GitHub environments with these secrets:
   - `staging` and `prod`: `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_HOST_KEY`,
     `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `CLOUDFLARE_READ_TOKEN`;
   - `android-release` (only for Android): the four `ANDROID_*` keystore secrets
     and `PLAY_SERVICE_ACCOUNT_JSON`.
7. The first verified sign-in for the organization's administrator mailbox becomes
   the initial administrator; see [administrator access](architecture.md#administrator-access).

## Content limits

`project.config.json` may set `limits` for product-shaped bounds; omitted values
keep the defaults:

```json
"limits": { "artifactTextChars": 40000, "runImages": 24 }
```

- `artifactTextChars` (1,000–100,000, default 8,000) bounds saved artifact
  drafts, including the MCP save and read tools.
- `runImages` (1–50, default 10) bounds generated images per Run result and the
  images an artifact receives from it. Inline base64 result images stay at 10.

Lowering a value does not rewrite stored records. Orchestrator templates keep their
own bounds (the samples check 8,000 characters in their Code nodes), and the
destination Dify installation must allow the larger outputs. File size and quota
limits are administrator settings; see [resumable uploads](services.md#resumable-uploads).

## Add a feature

Compose existing UI primitives and register project behavior through the
extension points below. See the [design extension guide](design-system-extension.md).

Extend through the registries instead of editing core lists. The
[notes sample](../src/samples/README.md) is a complete reference.

1. Contract and storage: zod schemas and owned persistence that filters by the
   caller's `uid`.
2. Registration: a `defineExtension` entry in `src/project/extensions.ts` (module,
   routes, collections, links, admin sections) and a `defineServerExtension` entry
   in `src/project/server.ts` (MCP tools, domain adapters, indexes, migrations).
   See [project extensions](architecture.md#project-extensions).
3. Routes under `src/app`: Route Handlers use `endpoint()` (module gating, CSRF,
   session and rate limits); pages outside module routes check `moduleEnabled`.
4. Copy: public text in `messages/en.json` and `messages/ar.json` with literal
   `t("m…")` calls; administration copy stays in English source.
5. Data changes: a migration with ID `<module>:<NNNN>-<name>`, run by
   `npm run db:migrate`; see [migrations](architecture.md#extension-conventions).
6. Tests, then `npm run typecheck`, `npm run lint`, the affected test suites and
   `npm run build`.

Project-specific Run controls belong in `src/project/run-start.tsx` and
`src/project/run-detail.tsx`: compose `ProjectRunStart` with the existing
`RunLanding` for package/quote admission, and render additional owned controls through `ProjectRunDetail`. The detail slot receives
the same allowlisted DTO (including the owned target identity) and refresh function
as the existing polling UI; do not add a second Run poller or copy shared controls. Defaults preserve generic Run behavior.
Keep these components client-safe, use the page's typed message scope and put all
ownership, financial consent and mutation authorization in server services. Prepaid
Runs omit generic restart controls; their product admission owns continuation.

## Receive template updates

Create a clean import branch from the project's current integration branch, as
recorded in its repository preferences. Run `npm run template:update -- <version|exact-ref>`
there, review the scoped adoption and merge its PR into that integration branch with
a normal merge commit. Keep active feature implementation out of the import PR.
Then merge the updated integration branch normally into active issue branches.
Record the exact upstream revision and preserve both project and template history.
A feature-only import route requires an explicit user-approved exception.

The update command keeps files the project deliberately deleted, keeps the project's
version of its installation files when they conflict (clean template changes to them
still apply), reapplies removed samples and prints upgrade notes. Other conflicts
stop with the merge open. Resolve them and verify project identity, configuration,
extension hooks and private bindings before committing. Never edit `template.json`
or `CHANGELOG.md` by hand in a project; the update command owns their imported identity.

## Release the template

In this repository:

1. Every reusable change adds an entry under `## Unreleased` in
   [CHANGELOG.md](../CHANGELOG.md), with upgrade notes when projects must act.
2. To release, move the entries under `## <version> — <date>` (semantic versioning:
   major when projects must act), set that version in `template.json`, and run
   `npm run check:template` and `npm run test:initialized-projects`.
3. Merge to `main`, then tag the merge commit `template-v<version>` and push the
   tag (publication needs explicit authorization).
