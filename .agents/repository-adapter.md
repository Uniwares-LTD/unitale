# Repository adapter

This file owns local constraints and accepted Handbook adaptations. Root
[instructions](../AGENTS.md) retain decision-point reminders; the
[source map](../docs/source-map.md) owns navigation and canonical document ownership.
Read the generated [bootstrap](handbook.md) for shared guidance access and
[agent tooling](../docs/agent-tooling.md) for integration procedures and provenance.

## Repository and task contract

- Project: named by `displayName` in `project.config.json`. Resolve repository
  identity from `git remote -v`; do not assume
  an extracted repository exists. [Preferences](repository.md) own issue language
  and durable branches; [tracking](tracking.json) owns the selected destination.
- The user's request and [implementation plan](../docs/implementation-plan.md)
  define scope. Accepted milestones, including onboarding, need no retroactive
  issue; new substantial work follows Handbook issue policy. Small standalone
  changes may use the request directly. Do not implement later milestones.
- Preserve unrelated work and existing work branches. Use Handbook branch naming
  for new work; never develop on durable branches. Existing accepted branches
  need not be renamed during integration maintenance.
- Keep setup in README, current behavior in architecture, and milestone state in
  the implementation plan, as linked by the source map. Preserve dated evidence
  and anchors. Record useful lessons in the nearest canonical document rather
  than a work log or competing source of truth.

## Template and project extensions

- This repository is the reusable template or a project created from it
  (`project.source.json` exists in projects). See [using the template](../docs/template.md).
- Add project features through the `src/project` registries, `src/samples` for
  removable samples and `<module>:<NNNN>-<name>` migrations; do not edit core lists
  to add a feature.
- In the template, every reusable change adds an `Unreleased` entry to
  [CHANGELOG.md](../CHANGELOG.md), with upgrade notes when projects must act.
  Projects never edit `CHANGELOG.md` or `template.json`; `npm run template:update`
  owns them.
- Derived-project template imports follow [the integration-first route](../docs/template.md#receive-template-updates):
  import on a clean branch from the project's integration branch, merge the scoped
  PR there, then merge integration into active issue branches. Current checkout
  location alone does not select the import destination. An exception needs explicit
  user approval.
- Tagging a template release (`template-v<version>`) is publication and needs
  explicit authorization.

## GitHub access

Follow Handbook's [GitHub access policy](https://github.com/Uniwares-LTD/handbook/blob/main/docs/work-policy.md#github-access)
at the task revision. All GitHub writes use locally authenticated tools: plain Git,
then a locally authenticated GitHub MCP, then CLI. The hosted connector is read-only.
If CLI lacks configuration or access, stop that operation and guide repair.
Chrome needs explicit approval and is only for rare read-only actions; report
writes no local tool can perform as blockers. Run Git/local MCP/gh and helpers/tests
invoking them outside the sandbox from the first
attempt. Required helper previews/readback and local authority still apply.

## Publication and external actions

Local authority exception: commits require explicit session authorization,
unlike Handbook's work-branch commit default. This preserves the accepted
reviewable-working-tree workflow. Pushes, PR publication, merges, deployments,
releases, permissions and other project configuration changes also need explicit
session authorization. Gates are a backstop, never authority.

For assigned issue work, enrollment of the existing issue, nonterminal status/
blocker maintenance and concise evidence are authorized under Handbook policy.
Resolve the accountable member from the assignment, not credentials. New issues
and sub-issues need human approval and the task snapshot's create-issue helper;
humans close/reopen issues and mark Done. Use ordinary Related to references.
Reuse recorded tracking choices; unconfigured tracking needs destination
confirmation before tracking operations. Preserve human edits and inspect partial
results before retrying; metadata does not prove live permissions or workflow state.

Integrate through PRs with normal merge commits only, which retain commit identities
and PR boundaries. Squash and rebase merges are not used and are disabled in the
repository settings. If a merge commit is unavailable, stop and report it instead
of merging another way. Deployment promotions follow the recorded source branches
and remain separately authorized.

## Validation and review

Use `npm run validate:changed` for local PR evidence. Follow [local PR verification](../README.md#local-pr-verification) for exact-head reports and manual checks.

[package.json](../package.json) owns check commands. Run affected checks after
relevant source, configuration, dependency or environment changes; read their
complete output. Use typecheck, lint, tests and check:env as relevant.
Build-sensitive work also runs `npm run build`; the build omits type checking,
so run `npm run typecheck` separately. `npm run validate` collects advisory
results; warnings and optional preferences never become release gates.
Compilation, bundling, runtime and operational failures retain real failures.

Add meaningful behavior/boundary tests, not source-mirroring tests; never use
production services. Initializer Git fixtures must be disposable and cannot
mutate this repository's index, refs or history. After relevant edits run
`npm run check:docs`, `npm run check:i18n` and `npm run check:skills`.
Refresh generated inventories/assets and skill hashes only for reviewed changes.

Use a separate read-only review of the final diff against the task contract.
Fix actionable in-scope defects and report stale/missing evidence honestly.
No local reviewer role is installed; delegation needs session authorization.
Preserve proportional checks, no arbitrary retry limit and advisory quality policy
when applying imported workflows.

## Reusable runtime contracts

One Next.js App Router application serves web and the planned Android TWA; do
not add Expo or a separate backend. Prefer Server Components; client boundaries
exist for interaction/browser APIs with narrowly scoped providers. Server reads
call server modules directly rather than this app's HTTP endpoints.
Use installed Next.js documentation and current official guidance for version-specific
behavior. Imported examples do not override verified APIs or require new caching/
concurrency dependencies. Prefer allowlisted DTOs with explicit timestamp forms
without claiming React cannot transport Date/Map/Set. Keep authorization fresh;
never cache protected data across users.

[Service contracts](../docs/services.md) own files, quotas, domain adapters, limits
and notification transactions. Preserve accepted adapter versions, owner-bound
cursors, reference fences, accounting/idempotency evidence and outbox replay.
Module admission is separate from navigation visibility. Project identity,
modules, locales, examples and namespaces come from `project.config.json`;
private credentials stay server-side. Initializers must isolate derived identities
and exclude secrets and machine/source-project bindings.
Use the current JSON [template catalog](../src/lib/server/runs/templates/README.md),
distinguishing it from historical YAML. MCP handlers remain server-only,
permission-checked, bounded and independent of transport; service credentials
never confer end-user ownership. Read [MCP guidance](../docs/mcp.md) for affected work.

## UI and browser verification

Follow [locale architecture](../docs/architecture.md#locale-and-direction) and
the [design system](../docs/design-system.md). Public copy uses typed catalogs,
page-scoped dictionaries and logical layout. Admin copy, shared controls and
administrative errors are English-only, outside locale catalogs. Preserve user/
model content and the user's public language/timezone/offline preferences.
Reuse shadcn primitives through the CLI and semantic CSS theme variables.
Build UI with the local `build-ui` skill. The design system owns interaction
rules and type roles. Derived projects start from the
[design extension guide](../docs/design-system-extension.md).

Verify desktop and 390px public English/Arabic layouts, English/LTR admin with
an Arabic public preference, and preference restoration when leaving admin.
Check navigation, Radix direction, bidirectional identifiers, keyboard focus,
recovery copy, hydration and document nonces. CSP evidence requires injection
into a served document; privileged Playwright evaluation does not prove CSP permits it.
Verify the toast stylesheet in a production build with `npm run build` and
`npm start`. In Arabic, check dialog centring, sheet close-button placement
and directional arrows.

Use named headless Playwright sessions unless an interactive window is requested.
On Windows use `npm.cmd` / `npx.cmd` with a workspace-local npm cache, or the
task snapshot wrapper from the consumer cwd. No global CLI install, execution-policy
change or cloud credentials are needed. Keep captures/auth state in ignored
`output/playwright/` or `.playwright-cli/`; stop only task-started fixtures.

## Deployment and provider work

Read [deployment guidance](../docs/deployment.md#current-staging-release) and
[Infrastructure guidance](https://github.com/Uniwares-LTD/infrastructure/blob/main/AGENTS.md)
before deployment work. Infrastructure owns hosts, access, installed controller/
configuration identities and capacity; this app owns serving release identity,
behavior and acceptance. References transfer no Booklet/Dify/tunnel ownership.
Distinguish planned conventions, current code and dated live evidence.

Follow [guided initialization](../docs/deployment.md#guided-setup-helper) and
Infrastructure's named credential inventory. Collect missing secure Credentials
channel exports once, outside Git; use allowlisted credential exports, never copy
a local environment file or parent database/web/host bindings. Public settings
use tracked JSON, not Actions variables. Never print secrets. Preserve generated
keys and uncertain-operation markers; inspect partial state before retrying.
Verify source-app identity and provider provenance: a non-JSON edge error alone
does not prove an invalid key. Separate first encryption installation from
migration of existing ciphertext. Local operation needs no cloud credentials;
live provider activation and deployment need separate session authorization.

Before operator instructions, resolve non-secret values from configuration,
canonical inventory and verified owner/session evidence. Give complete commands
for the stated shell/location and cite configured versus live-verified facts.
Group consequential missing inputs. Never infer credentials, transport access,
host fingerprints or network allocations from hostnames. Shared-host access uses
Infrastructure's [operations guide](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md):
the securely distributed admin key is `srv1-ops-admin`, saved on Windows as
`$env:USERPROFILE\.ssh\uniwares-ops-admin`. Never request its contents;
keep it separate from routine deployment keys and use the owner's connection command.

Classify image, host configuration, controller, provider and data impact; contract
changes need validation, update behavior and compatibility coverage. Every
publication PR follows [operator reporting](../docs/deployment.md#publication-and-operator-intervention):
state none or name owner, location, ordering, verification and failure/resume.
Verify executable prerequisites, not module presence alone. Report implementation,
publication, operator installation, release and live/AI acceptance separately.
Documentation-only publication must not repeat a completed installation.

Image maintenance preserves application-then-host-image lock ordering,
capability-bound requests and separate release/maintenance outcomes. Infrastructure
owns enrollment, retention policy and timers; initializers emit proposals only.
Protect current/previous images and uncertain recovery images.

## Shared integration maintenance

[Agent tooling](../docs/agent-tooling.md) owns sync, templates, client safeguards,
integrity and provenance. [handbook.json](../handbook.json) selects skills and
local sources; do not duplicate that catalog in instructions. Maintain the source
map when boundaries, commands, generated areas or ownership change. Reconcile
environment/translation inventories with canonical sources; preserve dated evidence.
Keep reusable procedures in Handbook and application adaptations here. After
skill metadata/routing edits explicitly sync and check entrypoints, retaining
custom content and reviewing hashes before refresh. Templates remain project-owned
copies, updated only by explicit per-file selection.

For promotions use the selected promote-to-environment skill with deployment.md's
source/target and operator rules. For data-operation work use operate-data with that
runbook and Infrastructure's root-only recovery boundary. These optional skills use
the existing technologySkills selection and grant no publication or live authority.
