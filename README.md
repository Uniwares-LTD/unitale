# Base

Base is a reusable Next.js application template. It provides TypeScript,
Tailwind CSS and shadcn/ui; Firebase Authentication with MongoDB profiles;
English-only administration; credits and Stripe payments; private files;
in-app notifications; rate limits; diagnostics; MCP; optional durable Dify Runs
with personas and saved artifacts; PWA support with a prepared Android Trusted
Web Activity; and Classic/Glass/Soft Blue styles with light/dark/system themes.

Products are created from it with `npm run project:create` and receive later
template releases with `npm run template:update`. Project identity and modules
come from `project.config.json`; `APP_NAME` overrides the display name at
runtime. Project features extend the template through `src/project/`.

## Documentation

- [Using the template](docs/template.md): create a project, the first steps
  after creation, adding a feature, receiving updates and releasing the template.
- [Architecture](docs/architecture.md), [services](docs/services.md),
  [runs](docs/runs.md), [MCP](docs/mcp.md), [payments](docs/payments.md) and the
  [design system](docs/design-system.md) describe current behavior.
- [Local testing](docs/local-testing.md) and the [feature test plan](docs/test-plan.md)
  cover verification.
- [Deployment](docs/deployment.md) covers environments, releases and new
  installations; the private [shared infrastructure inventory](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/inventory/srv1.md)
  owns hosts. Public settings live in tracked environment JSON.
- The [implementation plan](docs/implementation-plan.md) lists open work and the
  [changelog](CHANGELOG.md) lists template releases.

## Agent setup

For Codex and Claude Code, run once from this repository
with Node.js and Git available and Git read access to the private handbook:

```powershell
npm.cmd run handbook:setup
```

No application dependency installation is needed for this command. It uses a sibling
`handbook` checkout, or `-- --path PATH` / `UNIWARES_HANDBOOK_PATH` for a local override.
At task start the agent runs `npm run handbook:check`: it checks for updates only after
four hours, reuses cached guidance when offline, and preserves local handbook edits.
There is no scheduler. Use `npm run handbook:doctor` for diagnosis and
`npm run handbook:check -- --force` for an immediate refresh.
Shared procedures resolve through twelve local .agents entrypoints; Claude references
them through .claude/skills and CLAUDE.md. Project facts remain in the
[adapter](.agents/repository-adapter.md) and [source map](docs/source-map.md), selected
by handbook.json. Use `npm run handbook:ready` offline for advisory structural warnings.
After reviewed integration/skill changes, run `npm run handbook:sync` and
`npm run handbook:entrypoints`; full shared updates use a committed resource snapshot
as documented in [agent tooling](docs/agent-tooling.md). Preserve custom instructions.
Normal refresh never rewrites entrypoints. Static checks do not certify native clients.

Derived projects receive the launcher and guidance but creation stays offline: it does
not clone handbook, migrate queues, or enroll the new repository in Uniwares projects.
Their maintainers review the inherited guidance and perform this setup separately.

## Start a derived project

Use the initializer from a reviewed source revision. It creates a new Git
repository that shares the template's history: one initialization commit on top of
the reviewed revision and an `upstream` remote for later template releases. It
never copies local environment overrides, caches, browser state, databases or the
generated Android wrapper. Because history is shared, it refuses a revision whose
history ever contained private material such as `.env` files or credentials.

1. Copy `project.config.json` to a reviewable manifest outside the destination.
   Set a unique `slug`, `displayName`, locales/default locale and style. Keep all
   reusable modules enabled. Set `examples: false` for application mode, or select
   `examples: true` explicitly for the sample workflows. Add
   `android: { "packageName": "com.example.product" }` only for Android preparation.
2. Run from the source repository with its pinned dependencies installed:

   ```powershell
   npm.cmd run project:create -- --revision TEMPLATE_RELEASE_COMMIT_ID --destination D:/Projects/my-product --manifest D:/Projects/my-product.manifest.json --mode application --image-owner Uniwares-LTD
   ```

   Use `--mode examples` only with an examples manifest. `--source` optionally
   selects another local Git checkout. The revision must contain this initializer
   contract; uncommitted working-tree edits are never copied. `project.source.json`
   records the source commit and template version for later upstream comparisons;
   [CHANGELOG.md](CHANGELOG.md) lists each template release and its upgrade notes. Use
   `--infrastructure-profile PATH` only to explicitly select shared public
   connections; derived projects otherwise clear source installation connections.

3. In the new directory, run `npm.cmd ci`, copy `.env.example` to `.env.local`, and
   review origin/connections before starting emulators. Run `npm.cmd run check:env`
   and `npm.cmd run db:indexes`. Sign up and verify `admin@uniwares.co.uk` for
   automatic first-admin initialization, or explicitly bootstrap a verified UID;
   no admin password or automatic credit grant is shipped.
4. Application mode starts with providers inactive and examples hidden. Examples
   mode explicitly selects local fake Runs and simulated payments; it never
   activates live credentials. Configure owned staging providers separately.
5. Set your own `origin` (`git remote add origin <your repository URL>`) before
   pushing. Pass `--upstream <template repository URL>` to the initializer when the
   source checkout's `origin` is not the URL later updates should fetch from.
6. Review the samples with `npm.cmd run samples` and remove unwanted ones with
   `npm.cmd run samples:remove -- <name>` ([samples guide](src/samples/README.md)).
   Replace product copy, icons and colors; regenerate icons with
   `npm.cmd run icons:generate`. Review generated deployment placeholders, ports,
   and private subnets for the target host. Initializer subnets/ports are suggested
   isolated defaults, not a host inventory or a collision-proof allocator.
7. Run `npm.cmd run validate`, inspect advisory results, then `npm.cmd run build`
   and affected HTTP/browser suites. Publish the new repository only when
   explicitly authorized. Preserve source licenses and skill provenance.

### Receive template updates

In a derived project with a clean working tree, run
`npm.cmd run template:update -- 1.2.0` (a version, or any upstream ref). It
fetches `upstream`, merges the `template-v1.2.0` tag with a merge commit and prints
the upgrade notes since the recorded version. Files the project deleted stay
deleted (listed as "kept deleted"; a template fix to such a file, including a
security fix, is not applied, so review the list), and removed samples stay
removed. When a project-owned installation file (`project.config.json`,
`deploy/environments/*.json`, Handbook choices, the implementation plan) conflicts,
the project's version is kept and listed as "kept project version"; template changes
that merge cleanly still apply. `project.source.json` records the release before
any manual step. Other conflicts stop with the merge open:
resolve them, `git add`, `git commit`. Then apply the upgrade notes and run
`npm.cmd ci`, `npm.cmd run validate` and `npm.cmd run build`.

To release the template, move the `Unreleased` changelog entries under a new
version heading with upgrade notes, set that version in `template.json`, merge, and
tag the merge commit `template-v<version>`. Pushing tags needs the same
authorization as other publication.

| Identity                                                                                       | Canonical source                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package name, browser cookies/storage/cache, Redis scope, deployment paths/locks/Compose names | Validated `project.config.json` slug; package/lock identity generated by the initializer                                                                     |
| Display defaults, enabled modules, locale and examples                                         | `project.config.json`; runtime `APP_NAME`/`APP_STYLE` can override display defaults                                                                          |
| Local Auth and database                                                                        | Derived `demo-<slug>` / `<slug_with_underscores>_local`; generated environment example                                                                       |
| Public deployment settings and credentials                                                     | Tracked `deploy/environments/*.json` plus private credentials; [environment catalog](docs/environment-catalog.md) and [deployment guide](docs/deployment.md) |
| Android                                                                                        | Optional manifest package identity, explicit host/signing configuration; regenerate before building                                                          |

The initializer gives the new product an empty implementation plan; record its
own accepted work there.

## Unitale local app with shared staging data

The [project adoption and prepared launch guide](docs/features/local-google-popup/adoption.md)
owns the private shared-staging setup, exact template revision, HTTPS command,
approved CA identity and real Google acceptance. Keep port 3000 and the existing
Base emulator services untouched. Readiness verifies configuration and database
connectivity; it does not prove sign-in, admin permission or a provider run.
Shared Firebase membership does not grant Unitale administration; appointing an
administrator requires a selected verified user and explicit permission.

### Local Google sign-in callback

Local real-Firebase uses the hosted popup helper; the canonical guide records the
main-first import and confirmed account acceptance. This setup does not deploy
staging or implement Booklet checkpoint 10. Keep the URL aligned with the private
origin. If an old tab shows the offline fallback, open the account URL directly;
preserve unrelated browser storage, approved CA and TLS/CSP validation.

## Dify environment connections

Each Dify app belongs to one project/environment. In Administration → Orchestrators,
Create prepares that environment's MCP connection automatically. An unmanaged or
foreign app offers **Create a copy for this environment**: select an exact published
version; the source app is never modified. Destination apps have an environment
suffix and `app:<project>-<environment>` tag. Remove unmanaged registrations manually
and replace them with environment-owned copies; there is no adoption or migration.

For local registration, configure `MCP_PUBLIC_URL` privately with your running HTTPS
tunnel's `/api/mcp` endpoint and restart the web process. Hosted environments use
`APP_ORIGIN` plus `/api/mcp` and reject this setting. The selected `RUN_MCP_CLIENT_ID`
needs `server:read` and the workflow's tool permissions. No credentials or temporary
tunnel addresses belong in template DSL files.

Application settings → Runs → External MCP mappings accepts a list of
`{ "source": "source_provider_id", "destination": "destination_provider_id" }`.
These explicitly approve third-party MCP connections for the current environment;
they contain no credentials. Unmapped nodes block copying/registration. Copied secret
variables start empty; configure destination resources in Dify before registering
an app marked Setup required. See [MCP environment binding](docs/mcp.md#environment-owned-dify-apps).

## Personas and saved artifacts

Personas answer workflow questions through a shared OpenAI-compatible Chat
Completions connection, configured independently of Dify. Set the same private
connection on the web process and AI worker:

```dotenv
PERSONA_COMPLETION_MODE=live
PERSONA_COMPLETION_BASE_URL=https://api.openai.com/v1
PERSONA_COMPLETION_API_KEY=your-private-key
```

The default mode is `disabled`; `fake` supports credential-free local verification.
Live activation is a separate operational step. In **Administration > Personas**,
configure the shared model ID, optional temperature, output-token limit and common
instructions, then enable completions. The default limit is 1,024 tokens; select
`max_tokens` only for compatible endpoints requiring that parameter. Requests time
out after 60 seconds and responses are bounded to 1 MiB. HTTPS is required except
for loopback HTTP with `APP_ENV=local`. Redirects are rejected.

Edit an example or create a persona, set its role instructions, fixed/token pricing
and answer limit, and enable it. Start Run offers **User** or an available persona.
Each accepted Run snapshots the Persona and shared configuration. Changes apply to
future Runs. Common instructions have one editable template with Reset to default;
there is no template library or Persona workflow in Orchestrators.

Persona text passes unchanged to the next workflow LLM, which interprets the answer.
Automatic answers require a raw-response workflow registration. Tool ownership and
human-only approval checks remain enforced. Completed valid answers remain
chargeable after parent failure or takeover; review the combined maximum before
starting. Ambiguous requests are never automatically resent: answer or take over
while an administrator resolves uncertain execution/usage evidence. Provider-cost
Persona pricing is unavailable; portable usage supports token-based pricing.

This change assumes fresh local Persona/Run data. There is no migration or legacy
Persona workflow adapter; it does not reset the database or delete external apps.

New private-MCP workflows use a server-filled **context** Start input, bound
directly to tool `runContext` arguments. It remains hidden from public inputs and
LLM prompts. Persona completions receive only public question context, never
this private capability. Existing `unibase_context` publications and accepted Run
snapshots remain compatible; no migration is required. Editing template JSON does
not replace a registered Dify graph: create from the updated template or update
the existing Dify draft, then Re-register the intended version.

In **Administration > Orchestrators**, **Register**, **Re-register**, and **Enable**
open a version selector. Choose a published version and **Register selected version**
to use it for future Runs. The selector shows the current Unibase workflow ID,
publication names/dates and more pages when available. Selecting a published version
does not publish the draft. **Saved draft — publish if changed** explicitly publishes
the saved Dify edits before registration. Accepted Runs retain their pinned version;
ordinary users do not choose a version separately. Local template JSON edits still
require creating a new workflow or updating the draft in Dify first.

For the reference product integration, grant `run:read`, `artifact:read`, and
`artifact:write` explicitly to the dedicated MCP client and refresh its tools in
Dify. Set `RUN_MCP_CLIENT_ID` to that client's ID (default `dify`), and configure
`DIFY_CREDENTIAL_ENCRYPTION_KEY` or the existing management-key derivation on both
web and AI workers. Create **Saved artifact**, then choose it on **Start run**.
Create a new artifact there or select an existing one; you can also start from
**Saved artifacts** with that artifact already selected. Approve/decline its deterministic
draft; the validated sample image is retained independently of execution cleanup.
This sample requires the Dify code sandbox and reachable MCP, with no image-generation
model. Persona mode needs the shared completion connection and the workflow's approval-interpretation model.

For a real comic workflow trial, select **Unitale** on **Start run** (or create it
from the template when absent), enter an idea and create/select an owned artifact.
Choose **User** or a configured **Persona**. Review the generated story and visual
plan in ordinary language, then explicitly approve the saved package. Persona
answers are interpreted by model steps; final approval requires a human takeover.

Four Dify LLM steps implement the grouped J01-J12 concept, manuscript, cast,
location, style, reference and page-planning work. After approval, nine real image
calls produce two style samples, two character sheets, one location sheet, a cover
and three pages. These use the configured OpenAI text provider and authorized
official OpenAI image tool, Dify's Code sandbox, reachable private MCP and existing
artifact/media storage. Provider costs and configured Run/Persona credit charges
apply. Consistency is guided by shared descriptions; reference-image conditioning,
a dedicated Unitale schema/API/reader and PDF export remain downstream work.

Local JSON changes affect future template creation only. Existing Dify drafts,
publications, registrations and accepted Runs keep their previous graphs. Use a
separate trial workflow or deliberately update a draft and publish/re-register
under the normal authorization boundary. See [template details](src/lib/server/runs/templates/README.md).

Saved artifact revisions are expandable, with the latest revision open by
default. Each revision displays its own retained images and approval/source Run.

Use the existing `ASSET_STORE=s3` and `ASSET_S3_*` settings for a private bucket;
MongoDB storage remains the local default. Run `npm run db:indexes` for the new
collections. Keep encryption secrets stable to resume accepted attempts. See
[Runs](docs/runs.md) and [MCP](docs/mcp.md) for ownership, billing and callback rules.

## Local development

Use Node.js **24.16.0**, pinned in `.nvmrc` and `.node-version`, and npm **12.0.1**. With your Node version manager, select the pinned version before installing.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Local development needs no cloud credentials. For account features, start `npm run emulators:auth` and `npm run emulators:mongo` in separate terminals first. The MongoDB runner downloads a local binary on first use, retains development data under `.cache/mongodb/<slug>`, and creates the unique profile UID index. Firebase's emulator UI is at http://127.0.0.1:4000; verification and password-reset links are available in the emulator output. Auth emulator accounts reset when the emulator stops. On Windows PowerShell, use `npm.cmd` and `npx.cmd` if execution policy blocks the `.ps1` wrappers; do not change system execution policy just for this project. npm caches downloads in the ignored `.cache/npm` directory.

Copy `.env.example` to `.env.local` only when overriding the local defaults. `APP_NAME` controls the displayed name; `APP_STYLE` sets the Classic/Glass/Soft Blue default; `APP_ENV` is local, staging, or production; `APP_ORIGIN` is an origin with no credentials, path, query, or fragment. Staging/production require an explicit HTTPS origin. Only the application name, validated default style and explicit Firebase browser configuration are passed to browser components. Restart the development server after changing environment configuration.

Open [Preferences](http://localhost:3000/preferences) to switch Classic/Glass/Soft Blue and color mode. Style changes apply immediately and persist in this browser; signed-in users can also save them with Save preferences. Use the development-only [showcase](http://localhost:3000/design-system) to compare components. See [design-system customization and testing](docs/design-system.md).

## Commands

For the complete feature checklist, test accounts, automated suite order and
separate live-service acceptance, see [the full test plan](docs/test-plan.md).

For the full manual M2 checklist, emulator email links, Google troubleshooting, and automated checks, see [Testing M2 locally](docs/local-testing.md).

For port conflicts, service recovery, standalone assets and stale offline workers,
see [local troubleshooting](docs/local-testing.md#local-recovery-and-troubleshooting).

For diagnostics and offline checks, see [Testing M3](docs/m3-testing.md). For wrapper generation, signing configuration, the manual release workflow and pending device checks, see [Android delivery](docs/android.md).

For VPS setup, releases and rollback, see [Deployment](docs/deployment.md). After
building, `npm run test:health` verifies readiness with synthetic credentials and
disposable MongoDB; `npm run test:deployment` exercises release safeguards in an
owned local Docker container. `npm start` serves the standalone build and copies
its public/static assets. It defaults to loopback; set HOSTNAME and PORT explicitly
when running outside Docker.

| Command                             | Purpose                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                            | Install exactly the dependencies in the lockfile.                                                                                                                                                                 |
| `npm run dev`                       | Run the development server.                                                                                                                                                                                       |
| `npm run build`                     | Create a production build; compilation/bundling failures return a nonzero exit code.                                                                                                                              |
| `npm start`                         | Serve the production build after building.                                                                                                                                                                        |
| `npm run check:env`                 | Validate configuration and report field names without printing values.                                                                                                                                            |
| `npm run typecheck`                 | Generate Next.js route types and check TypeScript.                                                                                                                                                                |
| `npm run lint`                      | Run ESLint without modifying source.                                                                                                                                                                              |
| `npm run format:check`              | Check application and tooling formatting without modifying files.                                                                                                                                                 |
| `npm test`                          | Run focused configuration, session-policy, and API-client tests.                                                                                                                                                  |
| `npm run emulators:auth`            | Start the local Firebase Auth Emulator.                                                                                                                                                                           |
| `npm run emulators:mongo`           | Start persistent local development MongoDB.                                                                                                                                                                       |
| `npm run db:indexes`                | Install profile/access, credit/payment, AI and reporting indexes.                                                                                                                                                 |
| `npm run db:migrate`                | Apply pending forward-only data migrations (after the operational backup).                                                                                                                                        |
| `npm run samples`                   | List removable samples; `npm run samples:remove -- <name>` removes one and `npm run check:samples` verifies removability.                                                                                         |
| `npm run project:create`            | Create a derived project from a released template commit; see [using the template](docs/template.md).                                                                                                             |
| `npm run template:update`           | In a derived project, merge a template release and print its upgrade notes.                                                                                                                                       |
| `npm run check:template`            | Check that `template.json` and `CHANGELOG.md` agree.                                                                                                                                                              |
| `npm run test:initialized-projects` | Create, install and build two fixture projects from the current tree.                                                                                                                                             |
| `npm run test:accounts`             | Isolated access, credit, payment, AI execution and pricing tests using disposable MongoDB.                                                                                                                        |
| `npm run test:ai`                   | Production HTTP tests with fake Dify and the Auth Emulator. Build first.                                                                                                                                          |
| `npm run test:ai-pricing`           | Production HTTP pricing-consent and partial-settlement tests. Build first.                                                                                                                                        |
| `npm run test:payments`             | Production HTTP payment fixtures; no Stripe calls. Build first.                                                                                                                                                   |
| `npm run worker:build`              | Build payment, AI and worker-healthcheck bundles without rebuilding Next.js.                                                                                                                                      |
| `npm run worker`                    | Start payment reconciliation and credit maintenance using configured resources.                                                                                                                                   |
| `npm run worker:ai`                 | Start AI dispatch and recovery using configured resources.                                                                                                                                                        |
| `npm run test:integration`          | Test the production build against isolated local auth/database services.                                                                                                                                          |
| `npm run check:skills`              | Verify local skill references and retained notices against their recorded hashes.                                                                                                                                 |
| `npm run validate:changed`          | Select local PR checks from the merge-base diff. Add `-- --dry-run` to inspect selection.                                                                                                                         |
| `npm run validate`                  | Run all local quality checks and write an advisory report to `output/validation/results.json`.                                                                                                                    |
| `npm run icons:generate`            | Render `src/app/icon.svg` into install icons.                                                                                                                                                                     |
| `npm run android:generate`          | Regenerate Bubblewrap using `ANDROID_HOST` / `ANDROID_PACKAGE_NAME` from `.env.local` or process environment, and version fields from `android/config.json`. Add `-- --release` to reject placeholder identities. |

Individual checks retain their real exit codes. The aggregate `validate` command reports warnings and exits successfully even if quality checks fail; it does not certify the build or runtime. Next.js type checking is deliberately separate from the build, following the agreed advisory policy. Always inspect the report. Dependency advisories can be inspected with `npm audit`; do not force a framework downgrade just to silence an advisory.

### Local PR verification

Run `npm run validate:changed -- --base origin/main --head HEAD` in a clean
checkout for commit-specific evidence. Omit `--head` to include staged,
unstaged and untracked work. Use `--dry-run` to inspect which paths selected
each check, including historical revision pairs. File-level tools check
existing changed files. Shared or unclassified inputs select broader tests.
A manual UI item needs browser evidence for the changed interaction.
For Unitale's theme or conversation components, verify English and Arabic
rendering at phone and desktop widths in light and dark mode. For
`manual:composer-keyboard`, focus the story composer with Tab, inspect the
outer focus indication, and verify keyboard entry and submission in the owned
Booklet browser fixture. Record the observed result alongside the report.
Booklet model and persistence checks include the read-only model diagram
verification in `check:docs`.

Each invocation prints an ignored directory under `output/validation/runs/`.
Paste its `report.md` into the PR verification section, with any manual checks
and skips. `run.json` records the scope and completion state; `results.json`
is an incremental snapshot. The full validator retains its advisory exit
behavior and shared compatibility snapshot. Use the printed run directory
when comparing concurrent or interrupted runs. The default per-check time
limit is five minutes, allowing headroom over a 45-second local migration
fixture run. Set `VALIDATE_CHECK_TIMEOUT_MS` for a slower machine.
Account workers announce their files; timeouts list outstanding files.

Hosted full quality runs are manual. Deployment-related PRs use the disposable
Linux job once per revision where validation is enabled. For unusually large
PRs, check the Actions path-filter result and run the disposable deployment
suite locally if a relevant CI job was missed.

## Current application surface

- `/`: responsive home and application navigation.
- `/account`: email/Google sign-in, explicit registration, verification, password reset, display-name editing, read-only email, and opt-in browser diagnostics. Sign out/account switching is available in the avatar menu.
- `/preferences`: color-mode and design-style preferences, with an independent Save preferences action for signed-in users.
- `/credits`: owned wallet, held credits, debt, upcoming expiry, paginated ledger, local-only purchase simulation and opt-in Stripe Checkout.
- `/runs/new`, `/runs`, `/runs/[id]`: selectable orchestrators, durable progress, generated decisions, results and linked recovery attempts. Dify is disabled by default.
- `/notes`, `/admin/notes`: the removable notes sample (see [samples](src/samples/README.md)).
- `/admin/settings`: revisioned branding, credit packs and execution policies.
- `/admin/orchestrators`: create a working starter in Dify, register published workflows and check availability.
- `/admin/ai`: AI usage and paginated, audited resolution of uncertain executions.
- `/admin/operations`: worker/queue health, manual payment reconciliation and preview-confirm local AI cleanup.
- `/runs`: paginated owned execution history.
- `/admin/reports`: filtered runtime and permanent audit reports.
- `/admin`, `/admin/users`: authorized user management, access/profile controls and confirmed credit adjustments.
- `/manifest.webmanifest`, `/sw.js`, `/offline.html`: install metadata and a public-only offline fallback. No account/API data is persisted offline.
- `/.well-known/assetlinks.json`: Android app association from optional validated runtime settings.
- `/api/health/live`, `/api/health/ready`: uncached process and required-dependency health checks.
- Unknown routes: a recovery page with a link home. Route/global error boundaries provide retry/home recovery without exposing internal errors.

M2 account integration is locally verified; live Firebase/Atlas activation remains environment-specific. Firebase browser credentials are held temporarily in tab-scoped session storage during sign-in/verification and cleared after exchanging a verified ID token for an HttpOnly server cookie. Browser local storage holds appearance and a non-secret account-change timestamp, never application session tokens.

## M2 account configuration

Use the demo Firebase project and local MongoDB database defaults in [.env.example](.env.example); keep them aligned with the emulator command in package.json. Run `npm run db:indexes` to install the unique UID index for an explicitly configured database. Run `npm run build`, then `npm run test:integration` with the Auth Emulator running: the test runner starts a separate disposable MongoDB instance and an application server at 127.0.0.1:3101 with hardcoded demo/test configuration. Tests never use production Atlas or real Firebase accounts.

For a real environment, configure the public Firebase project ID, API key and app ID, `AUTH_MODE=firebase`, the application's HTTPS origin, a scoped MongoDB URI/database, and Firebase Admin Application Default Credentials. Remove `FIREBASE_AUTH_EMULATOR_HOST`; startup rejects emulator configuration outside local demo projects. Keep service-account files outside Git and pass their path through `GOOGLE_APPLICATION_CREDENTIALS`.

For staging/production, enable Email/Password and Google in Firebase Authentication and add the application hostname to authorized domains. Google sign-in uses a popup on the project's default `<FIREBASE_PROJECT_ID>.firebaseapp.com` auth domain, whose OAuth handler Firebase already registers, so no per-host OAuth JavaScript origin or redirect URI is needed. The narrow `/__/auth/` proxy stays for one release as a fallback and is unused by popup sign-in. Keep the default Firebase-hosted verification/reset email action handler and authorize the application return URL. Configure Firebase password policy and email-enumeration protection in the project console. Live Google OAuth, email delivery, and Atlas connectivity require verification with the intended environment's configuration; emulator results do not prove live activation.

### Local Google popup sign-in

Unitale’s [adoption and prepared HTTPS launch](docs/features/local-google-popup/adoption.md)
record the project integration route and verified real-account acceptance.

With `AUTH_MODE=firebase` (local, staging and production), Google sign-in opens the
configured project's hosted Firebase popup helper. The browser uses
`<FIREBASE_PROJECT_ID>.firebaseapp.com` as `authDomain`; only that validated HTTPS
origin is added to `frame-src`. A localhost OAuth callback is unnecessary.
Only the local Auth Emulator retains the redirect flow.

Keep `FIREBASE_AUTH_EMULATOR_HOST` unset in real-Firebase mode. Use the direct
Next CLI (`node node_modules/next/dist/bin/next dev --port 3100`) with a complete
private `.env.local`: the generic local wrapper injects emulator defaults.
Use the exact `APP_ORIGIN` configured there. Plain localhost HTTP is supported;
existing local HTTPS and its approved CA can also be retained. Never weaken TLS
validation. The Firebase hosted domain must already be authorized; changing
shared provider settings requires its own operator authorization.

Allow popups for the site or use a normal browser if the popup is blocked.
Closing it leaves the form usable and does not retry or fall back to redirect.
A verified user still exchanges a fresh ID token through the existing CSRF-protected
session endpoint. Complete one real Google sign-in and confirm the application
session; fixture results and merely reaching Google's page do not prove acceptance.
The [implementation plan](docs/features/local-google-popup/implementation-plan.md)
records verification and the exact-template handoff boundary.

## Administration

The administrator area is at `/admin`, with a link on the Account page for current
admins. Firebase remains the identity source; member/admin role and suspension
state are server-owned MongoDB records. All existing accounts default to active
members. Application suspension blocks both existing sessions and new session
exchange; reactivation requires a new sign-in. It does not alter Firebase provider
settings. Administrative changes require a valid verified session and confirmation,
and write an atomic audit record. Change reasons are optional; supplied notes remain
bounded and are recorded with the change.

Local MongoDB now runs a single-node replica set so access and audit changes can
commit together. Stop your existing `npm run emulators:mongo` runner before
restarting it with the updated script. Data now lives under `.cache/mongodb/<slug>`;
the runner never deletes the earlier `.cache/mongodb-data` and explains how to move
it when it belongs to the current slug. Atlas also needs transaction support.

In every environment, the first verified sign-in for `admin@uniwares.co.uk`
automatically appoints that account as the initial administrator, provided no
administrator exists. Other emails remain members; unverified accounts cannot
initialize administration. This server-only, case-insensitive email match uses
Firebase-verified identity claims, never a submitted username. The appointment,
audit entry and durable initializer marker commit together. Concurrent sign-ins
appoint once. Suspended administrators block automatic replacement, and later
demotion or account deletion does not reset the marker. No password or credits
are seeded. Later roles are managed through administration.

Alternatively, create and verify an email or Google account, obtain its exact UID
from the Auth Emulator/Firebase console, then run:

```sh
npm run db:indexes
npm run admin:bootstrap -- FIREBASE_UID
```

This explicit operator command checks the configured provider/database, refuses
disabled/unverified accounts and refuses a second bootstrap when an active admin
exists. It also consumes the automatic initializer. Keep the environment
configuration pointed at the intended environment;
never put an admin allowlist in browser config. Later role changes use user
management. Self-demotion/suspension and removal of the last active admin are
rejected, including concurrent changes. User search accepts an exact email or UID.
`GET /api/admin/users` exposes the same authorized read with safe HTTP errors.

Application settings also offers **Diagnostic access** when `DIAGNOSTICS_ENABLED=true`
and Redis is configured (local or staging only). It issues expiring, read-only
grants for `POST /api/diagnostics`; use `npm run diagnostics -- --help` for the
operator helper. Click Create and copy the complete access string from the popup;
no phrase is required. Grants support up to 30 days and persist in MongoDB across
releases. Run `npm run db:indexes` before activating this update; existing Redis
grants need one replacement after the switch. See [diagnostics API](docs/diagnostics-api.md).

Release images select this flag from `deploy/environments/*.json` and preload it
before web/worker startup: staging is enabled, local/production are disabled.
Changing the flag uses an ordinary image release with the existing controller;
private host credentials and infrastructure settings remain separate.

`npm run test:accounts` checks transactions and competing admin changes using an
owned disposable replica set. Python 3 is needed for the embedded Dify Code-node
tests. The HTTP integration suite checks member/anonymous
denial, immediate demotion and rejection of old tokens after suspension/reactivation.
Admin, credits, reports and Stripe implementation (C1-C5) are locally verified;
Play billing (C6) remains unimplemented. See [its checkpoint plan](docs/admin-credits-plan.md).

## Credits development

The wallet UI, transactional core, admin adjustments and local purchase simulator
are implemented. New accounts receive zero credits. Purchased credits
never expire; promotional grants default to 90 days and support explicit expiry
or perpetual grants. Ordinary spending defaults to 15-minute holds; managed AI holds remain reserved until
settlement or audited resolution and do not expire on that timer. Refund shortfalls create
debt, which blocks spending until covered. There is no public endpoint for
arbitrary grants or spending.

Run `npm run db:indexes` after this update to install the credit indexes as well
as profile/access/audit indexes and the 30-day runtime-log TTL. It is idempotent and uses the configured database;
it does not grant credits or change existing balances. Local MongoDB must use
the documented replica-set runner, not a standalone process.

Open Credits from your Account page. Admins can inspect a user's wallet and grant
or deduct credits from `/admin/users` with a valid administrator session. Reasons are visible
to the account owner and recorded in the permanent admin audit. The local simulator
offers labelled 100/500/1000 fixture packs and success/pending/failure/cancellation/
refund/replay outcomes without charging money. Real Stripe and Play billing remain
separate acceptance. Stripe implementation is opt-in and uses your own configured
catalog/secrets; Play remains pending. See [payment setup](docs/payments.md).

Admins can open `/admin` for a small dashboard and `/admin/reports` for runtime
and permanent audit reports. Filter by UTC dates and event, then by severity/request
ID for runtime or actor/target UID for audit. Runtime storage is best-effort with
stdout fallback and excludes free text and secrets; required administrative audits
remain transactional. See [local testing](docs/admin-credits-testing.md).

For Stripe, configure the environment values described in payment setup, install
indexes, build and run `npm run worker` alongside the app. Compose includes the
worker in the same image. `npm run test:payments` uses signed local fixtures and
never contacts Stripe; real provider acceptance remains pending.

`PAYMENTS_MODE` defaults to simulation only with local emulators and to disabled
elsewhere. Set it to `disabled` in `.env.local` to hide the simulator. Optional
`CREDIT_PACKS_JSON` defines server-owned IDs, labels, whole credit quantities and
provider mappings; private mappings are not sent to the browser. Stripe packs also
require an amount and currency. Startup
and `npm run check:env` reject invalid catalogs and non-local simulation.
See [admin and credits testing](docs/admin-credits-testing.md) for manual steps.

Run `npm run test:accounts` to exercise the wallet with a disposable local replica
set; it does not need live Firebase, Atlas or payment credentials. Tests cover
concurrent holds, duplicate requests, expiry, debt, access revocation, failed
ledger/audit rollback and ledger/projection reconciliation. Other priced features can use `src/lib/server/credits.ts` to derive the wallet owner from the session
and reserve/commit/release a server-selected price. Stripe reconciliation already
uses the internal store after provider verification; future providers must preserve
the same authorization and idempotency boundaries.

## Engineering references

- [Design system](docs/design-system.md): editable tokens, shared patterns and the development-only interactive showcase.
- [Architecture](docs/architecture.md): server/client ownership, configuration, and UI conventions.
- [VPS deployment](docs/deployment.md): current release, initialization, promotion and recovery procedures.
- [Implementation plan](docs/implementation-plan.md): milestone scope and acceptance criteria.
- [Agent tooling](docs/agent-tooling.md): installed skills, provenance, and integrity commands.
- [Repository instructions](AGENTS.md): conventions for contributors and coding agents.

## Dify orchestrator Runs

Runs replace the former AI task/chat and creation-workspace features. Choose an
administrator-enabled Workflow orchestrator, provide its inputs, review maximum
credits and start. Progress and pending generated forms survive closing the
browser. Reopen the same Run to continue; restart and compatible stage recovery
create a new linked attempt. The default charge is one credit on successful
completion and zero on confirmed failure/cancellation.

Set `DIFY_MODE=fake` with local Firebase/MongoDB emulators for deterministic
fixtures (`decision`, `fail` and `partial` prompts). Use `DIFY_MODE=live` for
self-hosted Dify 1.17.1 and configure the connection/key references in
[.env.example](.env.example). Run `npm run db:indexes`, `npm run build` and
`npm run worker:ai`. Keep web and workers on the same database and private provider
configuration. No database is reset or migrated automatically.

Restart the AI worker after rebuilding it or changing its private configuration.
For live local Runs, the worker must be able to reach Dify and Dify must be able
to reach the authenticated MCP endpoint. A healthy web page or worker heartbeat
alone does not verify either connection. See [live Run recovery](docs/runs.md#local-live-service-readiness).
The worker runs the bundled `dist/ai-worker.cjs` loaded when its process starts;
rebuilding the file alone does not update a running process. Keep its bundle in
sync with the web server, especially when adding persona or artifact features.

Administration → Application settings initializes defaults once, then saved policies
control web/worker behavior. Branding is explicitly allowlisted; management/encryption secrets,
connection/origin settings and Android build identity stay in environment
configuration. Accepted attempts and purchases retain their original billing
terms. Administration → Orchestrators lists Dify Workflow apps. **Create orchestrator**
creates, publishes and registers **Unibase starter**: zero Start inputs, an MCP demo
document, a Brief/Detailed Generative UI choice and a native text result. Connect
Unibase MCP in Dify first; the starter needs a configured interpretation LLM in Dify.
Existing published workflows use **Register** without a form. Registration checks API access, declared inputs, Human
Input WebApp delivery and referenced MCP tools, then reuses/creates an encrypted
app key and enables the Orchestrator. Register validates the saved draft and
publishes it automatically when new or changed; it never edits nodes or inputs.
Create offers Document summary, Saved artifact, Unitale and Case preparation templates from
`src/lib/server/runs/templates`: basic MCP/human input, owned draft/approval/media,
a real comic journey, and country-neutral case preparation samples for derived
projects. Case preparation imports a draft: configure its country, legal knowledgebase
and models in Dify before publishing/registering. See [setup and limits](src/lib/server/runs/templates/README.md#case-preparation). Create refreshes
the app list automatically and disables Dify's public Web App;
the Human Input node's WebApp delivery stays enabled for API forms.
Native End outputs are normalized by Unibase. Inline prompts require no
prompt field. Users start Runs and view owned status, node tracing and Human Input.
Disable stops new Runs; Enable checks Dify again. Unregister removes the Unibase
registration while preserving Dify and Run history. Missing Dify workflows show
Unavailable with Delete registration; stale Start requests are rejected before
reserving credits. Provider outages do not erase registrations.
Connected MCP tools can read or write according to their server's permissions;
Unibase's supplied tools are read-only examples. Manual JSON/DSL setup was removed.

See [registration and credential storage](docs/runs.md#administration-and-setup).

See [Runs setup and contracts](docs/runs.md), [AI testing](docs/ai-testing.md), and
[sanitized Dify templates](dify/README.md). The starter's live MCP/Human Input test
passed; broader plugin, image and recovery acceptance remains pending.

## MCP integration

Optional read-only MCP tools let Dify and trusted services fetch server data.
See [MCP setup, Dify testing and maintenance](docs/mcp.md). The endpoint is disabled
by default; its credential is separate from your Dify app API key.

### Reuse hardening configuration and reads

The [environment catalog](docs/environment-catalog.md) is generated from
`scripts/deploy/environment-catalog.json`. Application checks and deployment
validation consume that catalog. Run `node scripts/environment-docs.mjs --check`
to check its documentation or omit `--check` to regenerate it.
MCP runtime settings and strictly named `MCP_TOKEN_*` credentials are supported
by VPS configuration validation; environment-specific identities remain required.

Multipart uploads authenticate before reading the body. The saved file limit,
1 MiB multipart allowance and 30-second body deadline apply to each request.
Artifact lists, revisions, Run events and decision history use 25-row keyset pages;
pending decisions are read independently. Start Run supports artifact search and
paging. API cursors belong to their owner, resource and filter.

`npm run test:ai-pricing` runs a distinct HTTP pricing suite through the bundled
AI worker with synthetic authentication/provider data and disposable MongoDB.
It covers all five pricing variants, stale consent, reservations, rounding,
release, failure charging, missing usage and settlement replay.

### Project identity, modules and request protection

`project.config.json` defines the application slug, display/style defaults, modules,
locales and example selection. Changing identity is a new-project operation:
existing installations retain their slug to preserve cookies and browser storage.
Module dependencies are validated; route visibility and server admission checks
use the same descriptors. Disable providers in runtime configuration until ready.
Accepted work and financial history are retained when admissions are disabled.

Non-local application processes require an authenticated `REDIS_URL`.
`RATE_LIMITS_JSON` overrides per-minute read/mutation/upload/admission/MCP limits.
Redis outages fail protected API requests with 503; excess requests return 429
and Retry-After. Account recovery endpoints and liveness remain available.
Local development may omit Redis; `npm run test:limits` runs a disposable
authenticated Redis container and two web replicas with the Auth Emulator.

Tracked staging/production configuration owns pinned Redis/Nginx images, private
bridge subnets and loopback ingress ports. The guided setup helper prepares
private Redis credentials; reviewed Infrastructure installation owns config/indexes. The existing host tunnel
routes to Nginx on those loopback ports; app releases never own or restart the
shared connector. See [deployment and secret setup](docs/deployment.md).

Document responses carry a fresh script nonce, framing restrictions and safe
browser headers. Firebase helper routes use a narrowly scoped separate policy.
The local production build supports the local emulator, with no script unsafe-eval.

### Private files and domain extensions

Files supports the existing TXT, PDF, PNG/JPEG/WebP, MP3/WAV and MP4 allowlist.
Saved upload quotas remain authoritative; defaults are 20 MiB/file, 100 files and
100 MiB/account, counting legacy provider-only uploads. Images are decoded and
normalized; other downloads are attachments. Local managed files use GridFS;
S3 uses the existing private asset configuration. Deletion remains pending until
the maintenance worker confirms storage deletion. Referenced files cannot be
removed; terminal-history cleanup releases Run references.

Start Run can reuse a managed file. Provider references are cached per owned file
and execution binding without counting the bytes twice. Historical provider-only
uploads do not acquire invented download links.

Trusted server adapters are registered in `src/lib/server/domains.ts` (core) or
`src/project/server.ts` (project extensions). A workflow may select a registered
`domainAdapter` ID/version; admission snapshots an owned `target`. Keep old
versions registered while accepted work exists. Existing `artifactId` records
remain readable. `npm run db:migrate` applies the additive
`runs:0001-domain-references` metadata migration with any other pending ones. It
reads the configured database; run it only against the intended environment.

### Notifications

The account-header bell opens the owned inbox. Runs, credit purchases/reversals
and administrative account changes are enabled by default; category preferences
control new delivery. Read and read-all actions are available in the inbox.
Run `npm run db:indexes` for notification pagination/retention indexes and keep the
maintenance worker running for delivery and 90-day cleanup. Notifications are
in-app only; no external messaging provider is needed.

Language and timezone are available under Preferences. Public pages use the same
URLs for English and Arabic; Arabic renders right to left. Administration is always
English and left to right, without changing your public-app language preference.
Browser language selection works before
sign-in, and verified accounts can save language/timezone independently of
appearance. See [locale architecture](docs/architecture.md#locale-and-direction).
`npm run check:i18n` verifies generated client dictionary and offline assets.

Reusable service contracts and migration instructions are in [services](docs/services.md).
`npm run project:create` creates a new project from a reviewed commit.
`npm run test:initializer` checks its safety boundaries; `npm run test:initialized-projects`
installs and builds two disposable projects. `npm run check:docs` checks local links,
anchors, command names and generated environment documentation. No initializer
command publishes source, activates a live provider or deploys infrastructure.

## Environment provisioning

Use [deployment guidance](docs/deployment.md) for staging setup, exact secret
consumers and the restricted control interface. Current staging uses Infrastructure's
reviewed root-owned bootstrap/preparation tooling and existing Firebase/Atlas
bindings. Routine release/check/rollback uses the installed restricted dispatcher;
it cannot provision providers or replace root-owned host control code.

Public settings live in `deploy/environments/local.json`, `staging.json` and
`production.json`; private local overrides remain in `.env.local`. Staging uses
repository secrets, public GHCR and its own workflows. The legacy **Provision
environment** workflow refuses staging and requires production compatibility work
before activation; Google OIDC/private-pull instructions describe that legacy path.
Shared tunnel and Dify ownership stay with Infrastructure; register each derived
app's repository, slug, environment, hostname and port there in a reviewed owner
change.

### Deployment commands

For a new project use [guided initialization](docs/deployment.md#guided-setup-helper).
For an existing installation start with `npm run deploy:ops -- doctor staging` (or `prod`). Promote reviewed main
revisions through `_staging`/`_prod`; merging the promotion triggers Release automatically. Use
Prepare protected deployment for host changes requiring Infrastructure approval.
`deploy:ops` also exposes plan, status, check, rollback, backup and restore. Follow the
[release/recovery procedures](docs/deployment.md#repeatable-release-and-protected-change-path)
for pinned access, exact plan IDs, approval and interruption handling. Production
activation and host installation require separately reviewed configuration and access.

Image maintenance diagnostics: after preparing the existing pinned deployment access, run `npm run deploy:ops -- maintenance staging` (or `prod`). See [deployment disk protection](docs/deployment.md#image-retention-and-disk-headroom); host cleanup and enrollment remain Infrastructure-owned.
