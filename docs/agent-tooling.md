# Agent tooling

Handbook supplies eight core workflow skills, four selected technology/UI skills and
two optional deployment/data skills. Canonical local
.agents/skills entrypoints read shared procedures at the task revision. Claude's thin
.claude/skills references route to them; CLAUDE.md imports @AGENTS.md. Project facts and
adaptations remain in the [adapter](../.agents/repository-adapter.md) and
[source map](source-map.md), declared by [handbook.json](../handbook.json).

## Guidance ownership

Maintain each rule at its owning source and link to it from other entrypoints.
Keep short authority and safety reminders where an agent makes the decision.

| Source | Owns |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Task-start routing and decision-point reminders; retain Next.js's generated block |
| [Repository adapter](../.agents/repository-adapter.md) | Local constraints, verification and accepted shared-policy exceptions |
| [Source map](source-map.md#task-routing) | Task routing, canonical sources, code boundaries and ownership |
| [Handbook bootstrap](../.agents/handbook.md) and skill wrappers | Generated access/discovery instructions; update through explicit sync |
| This guide | Integration commands, maintenance procedures, client limits and historical provenance |
| [handbook.json](../handbook.json) and [preferences](../.agents/repository.md) | Selected skills/source paths and confirmed repository choices |

Shared workflows remain in Handbook at the task revision. Do not copy skill bodies,
skill catalogs or bootstrap recovery steps into the root instructions or adapter.
Canonical application/operational documents retain their detailed procedures.

The [repository preferences](../.agents/repository.md) record user-confirmed language
and durable branches; [tracking](../.agents/tracking.json) records this repository's
project selection when configured. An unconfigured selection grants no tracking
destination or authority. Local configuration does not verify live access or workflows.

## Setup and daily use

Run `npm run handbook:setup` once with Node, Git and read access to the private Handbook.
No application dependency installation is needed. It uses a sibling checkout unless
`-- --path PATH` or UNIWARES_HANDBOOK_PATH supplies a local override. Never commit machine paths.
The generated [local bootstrap](../.agents/handbook.md) owns new-device setup consent,
missing-checkout recovery, task revision retention and immutable resource resolution.
Read it before shared skills. Root instructions retain task-start and local-authority
reminders; project adaptations belong in the adapter. Normal refresh never rewrites
these local files. Use `npm.cmd` on Windows when PowerShell wrappers are blocked.

The launcher runs committed helper content. Required guidance/helper compatibility is
checked before promotion; cached/offline guidance stays usable. Follow-main refresh has
a four-hour success/failure cooldown, explicit force and no scheduler. No persistent
task records or per-consumer revision pins are added.

## Explicit integration updates

Shared procedure edits need no consumer rewrite. Bootstrap prose changes update one
local guide; discovery metadata changes update matching wrappers. Launcher changes
require explicit reconciliation. Missing/customized bootstrap content produces
readiness diagnostics; sync preserves customized managed bodies and custom suffixes.
Integrity covers the bootstrap as well as canonical and Claude wrappers.

Review Handbook's merged onboarding instructions at the task revision before reconciling
launcher/offline-tool copies. Preserve local scope, accepted milestones and advisory checks.
Record which Handbook revision an update adopted in its pull request, not here.

## Troubleshooting

The [GitHub access policy](../.agents/repository-adapter.md#github-access) applies to
Handbook setup/check/doctor/resources and Git-based tests because they spawn Git.
Readiness, entrypoint drift and other purely offline checks can run normally.

`npm run handbook:doctor` is read-only. It reports origin, cached revision, checkout state,
attempts and local entrypoint warnings. `npm run handbook:check -- --force` bypasses cooldown.
Preserve dirty/non-main/ahead/diverged checkouts. Never reset/stash/switch to force refresh.
Wrong-origin directories are rejected, not repaired. With no baseline, run setup/repair
and continue unrelated work under local guidance; pause only Handbook-dependent decisions.
Ancient helpers without refresh/diagnose exports need explicit bootstrap reconciliation.
After an interrupted lock, inspect its PID and remove it only after confirming no active refresh.

## Advisory validation

`npm run validate` runs checks sequentially, streams their progress and records each
completed result in `output/validation/`. A check that exceeds five minutes is stopped
with its process tree and reported as a warning; remaining checks continue. Local
investigations can set `VALIDATE_CHECK_TIMEOUT_MS` to a positive integer in milliseconds.
CI job timeouts still bound the overall run. Build failures remain separate failures.
The runner regression is `node --test tests/validate.test.ts`.

## Clients and lightweight acceptance

Codex discovery uses .agents/skills. Claude uses CLAUDE.md imports and .claude/skills.
Markdown references install no hooks, permissions, subagents or dependencies.

### Optional deployment skills

`promote-to-environment` routes reviewed promotion/release orchestration;
`operate-data` routes backup, migration, manual handoff and status/recovery through
the same supported clients. Both are selected through the legacy `technologySkills`
array in handbook.json; no workflowSkills field or default-core expansion is added.
Reusable procedures and the promotion starter live in Handbook. Application-specific
identities, permissions and operating boundaries remain in the adapter/runbooks.

Refresh metadata through explicit sync, preserve local build-ui and custom suffixes,
review integrity/provenance and check entrypoints/readiness. Publication of shared
changes precedes consumer regeneration from the reviewed committed revision; local
candidate wrappers alone do not establish published guidance or installed capability.
The [reference mapping](features/deployment-data-operations/implementation-plan.md#deployment-skills-and-reference-adoption)
records the supplied attachment and excludes uninspected upstream material.

## Local contracts and provenance

The adapter retains runtime, deployment, Windows browser, locale/CSP, DTO and performance
adaptations. Accepted implementation-plan milestones need no retroactive issues. Warnings
remain advisory; build/runtime failures are real failures. Derived creation copies reviewed
guidance, references, metadata and offline tooling, but never clones Handbook, copies its
cache, sets credentials, enrolls projects or migrates backlogs. It excludes this repo's
tracking selection and preferences, replacing them with explicit unconfigured
placeholders at the same paths so guidance links remain valid. Readiness reports the
missing choices until maintainers confirm them during adoption. Maintainers reconcile the
inherited source map and ownership before adoption.

skills-lock.json records local entrypoint hashes. Historical imports, original upstream
identities and resource hashes are preserved in provenance/handbook-migration.json.
Duplicated technology procedures/resources moved to Handbook with licenses/notices and
provenance; Playwright LICENSE.txt and NOTICE.txt also remain locally. Shared snapshots
retain relative resources. System-owned skills are unchanged.
