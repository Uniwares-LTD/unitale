# Unitale booklet delivery plan

## Contract and decisions

The accepted [R01–R14 PRD](prd.md) and [issue #10 workflow design](workflow-design.md)
define the target. The latter owns current decisions, gaps and unresolved contracts;
it explicitly replaces earlier app/Executor human-approval and quality gates.
Preserve existing records and the single-orchestrator dispatcher. Unibase changes originate in its repository and
reach Unitale through reviewed template integration. No production catalog seeds.
For the current issue #10 design handoff, the Handbook baseline is
`D:\misc\code\uniwares\handbook` at
`0048c32a98060bb094eb3010aa0f4f407e97796e` (explicitly refreshed from the local
committed Handbook on 2026-11-09; earlier task baseline was `71891a9031eeebee1ff8d2a66494bdeb10ad5d3f`).
Earlier implementation evidence below retains its historical scope.

## Execution prerequisites

**Readiness: checkpoints 01-06 are locally implemented and reviewed;
application authorization and runtime evidence remain separate.** The
[A01-A22 register](workflow-design.md#implementation-readiness-audit)
links each resolution to the [package specification](workflow-package-spec.md#technical-resolutions-for-a01-a22).
Checkpoints 01-12 below replace the application-first C0-C10 sequence. Deliver the
candidate workflows and proposed application changes at 06, then stop before
material application implementation at 07. E1-E6 remain evidence/setup gates, not
assumed successes; candidate validation is distinct from integrated/live acceptance.
A failed probe blocks its dependent binding, not independent schemas/fake-provider work.
No checkpoint starts merely because documentation has been updated.

The user subsequently authorized preparation of bounded upstream fixes for the
demonstrated official-provider gaps. The [patch and application instructions](workflow-package/integration-handoff.md#prepared-upstream-patch)
record offline evidence. This amendment adds no package framework or production Unitale plugin;
upstream submission, shared-plugin installation and paid probes initially remained
separately gated. The subsequent full-compatibility authorization covers upstream
submission, isolated target testing and necessary application compatibility work,
with **US$1 total probe spending**. The preservation requirement still applies:
temporary namespaced copies leave shared experiment plugins intact. Submission,
frozen-lock packaging, isolated installation and no-money form/DSL checks pass;
provider execution awaits secure credentials and cost bounds. This is not production
activation or acceptance of unverified E1-E5 behavior.

The initial delivery authorization covered local DSL-first implementation through 06.
The later compatibility authorization and dependencies above govern continuation.
The user authorized
committing/pushing the reviewed candidate and updating issue #10 on 2026-11-09.
Merging and later publication still require their own session authorization.
Releases, deployments, provider publications and paid calls
remain separately gated. Use fake providers and disposable databases. Full-product T28
acceptance requires configured Dify publications/plugins/credentials and a finite
approved budget, Stripe test configuration, Play products/notifications/
signing/internal track, Digital Asset Links and an installed Android device. Admin
creates actual offers/packages and enables only accepted languages/capabilities.

## Checkpoints

Every dependency is mandatory for integrated completion. Contract-level fixture work
may proceed before integration; do not report it as a working product. Each checkpoint
requires focused boundary tests and two consecutive clean read-only reviews of the
same state; final review covers the integrated diff. After explicit implementation
authorization, continuation is automatic only through
checkpoints whose dependencies and evidence gates are satisfied; publication/external
acceptance retain separate authorization. No agent delegation is implied.

| ID | Owner | Outcome | Dependencies | State |
| --- | --- | --- | --- | --- |
| T01 | Both | Versioned catalogs, entitlements, operations, booklet/decision/manifest/workflow contracts and fixtures | None | Complete |
| T02 | Unitale | Offline Dify parent/child, Human Input, native files and adapter compatibility harness | None | Complete (offline scope accepted) |
| T03 | Unibase | Stripe/Play and Android bridge compatibility harness | None | Complete in Unibase; imported and verified in Unitale |
| T04 | Unibase | Configurable MCP limits and extensible private authorization | T01 | Complete in Unibase; imported and verified in Unitale |
| T05 | Unibase | Execution measurements, evidence, redaction and cleanup | T01 | Complete in Unibase; imported and verified in Unitale |
| T06 | Unibase | Versioned catalogs and trusted product extensions | T01 | Complete in Unibase; imported and verified in Unitale |
| T07 | Unibase | Upfront consumption, entitlements, concurrency and refunds | T06 | Complete in Unibase; imported and verified in Unitale |
| T08 | Unibase | Promotions, reservations, limits and bonus grants | T06 | Complete in Unibase; imported and verified in Unitale |
| T09 | Unibase | Stripe subscriptions, coupons and catalog publication | T03,T06,T08 | Imported from Unibase; offline verification complete |
| T10 | Unibase | Play verification, acknowledgement, renewals, restore and catalog publication | T03,T06,T08 | Imported from Unibase; offline verification complete |
| T11 | Unibase | Android TWA purchase, restore and deferred changes | T10 | Imported from Unibase; local verification complete |
| T12 | Unibase | Commerce administration, preview/readback and refunds | T07,T08,T09,T10 | Imported from Unibase; local verification complete |
| T13 | Both | Reviewed foundation through normal template integration | T04–T12 | Complete (local foundation integration) |
| T14 | Unitale | Owned book/production/revision repositories with embedded subjects/artifact index | T01 | Implemented; local verification complete |
| T15 | Unitale | Lifecycle, human decisions, locks, entitlements and restart | T13,T14 | Implemented; local verification complete |
| T16 | Unitale | Original media, derivatives, source routing and resumable attachment | T13,T14 | Implemented; local verification complete |
| T17 | Unitale | MCP-only booklet tools | T15,T16 | Implemented; manifest transport-limit review finding remains; verification notes below |
| T18 | Unitale | Source specialist workflows generalized to package inputs | T01,T02 | Pending |
| T19 | Unitale | Versioned quality assessment service and bounded correction contract; issue #10 covers all review modes | T01,T02 | Pending |
| T20 | Unitale | Manager composition, Human Input and durable continuation | T17,T18,T19 | Pending |
| T21 | Unitale | Creator brief, quotes, progress, decisions, revisions and history | T15,T16 | Pending |
| T22 | Unitale | Private reader and image downloads | T15,T16 | Pending |
| T23 | Unitale | Manifest-bound deterministic PDF | T15,T16 | Pending |
| T24 | Unitale | Revocable version-bound sharing and download controls | T22,T23 | Pending |
| T25 | Unitale | Storefront, wallet, offers, coupons and entitlements | T13,T15 | Pending |
| T26 | Both | Integrated simulated journeys and compatibility | T20,T21,T24,T25 | Pending |
| T27 | Both | Migration/recovery rehearsal, documentation and final reviews | T26 | Pending |
| T28 | Both | Authorized real provider/store/device acceptance | T27 + external prerequisites | Gated |

### Issue #10 design and delivery boundary

The 2026-11-09 simplification decision supersedes the earlier custom-provider and
authoring-framework prescriptions. Deliver seven readable Dify YAML workflows using
native nodes and official provider plugins. Dify/YAML is the source of truth. Manager
alone communicates with Unitale. Preserve the accepted creative, review, revision and
recovery behavior in [workflow design](workflow-design.md); simplifying the machinery
does not remove a behavior requirement.

### Necessity and simplicity gate

For material implementation choices, keep the rationale in the nearest specification
or checkpoint evidence; routine choices need no separate checklist: **Do we really need this change? Is there a simpler approach?**

1. Identify the accepted behavior requiring it. Without one, omit the change.
2. Check native Dify nodes, existing official plugins and existing application seams.
3. Select the smallest approach with a credible path to the required behavior.
4. State the observable proof and distinguish local checks from target execution.

Prefer native nodes, then small self-contained Code nodes. Do not add a generator,
bundled runtime, shared framework, dependency, custom plugin or expanded interface
without a demonstrated gap and an explicit amendment to this plan. Pending compatibility
is a gate, not permission to build a substitute platform. Do not recreate the Dify
engine for tests. Code size is a review signal, never permission to omit required behavior.

### Issue #10 deliverables and dependency map

| Checkpoint | Deliverable | Acceptance and continuation |
| --- | --- | --- |
| 01 - Minimal boundaries | Seven-role inputs/outputs, essential identities, source mapping and provider capability matrix | Boundary/privacy fixtures and two clean read-only reviews; continue to 02 |
| 02 - Existing plugins and compatibility | Official text/vision/image plugin configuration; source-backed capability findings | Record installed/import/runtime evidence separately; unresolved capabilities explicitly pending; continue only with independently valid work |
| 03 - Creative and text review DSL | Planner, Manuscript, Art Director and text/specification/correction Reviewer | Load actual YAML, check references and execute essential inline checks; two clean reviews |
| 04 - Composition and images DSL | Page Composer, deterministic Prepare, exact Generate and all Reviewer modes | Exact Unicode/routing, ordered originals, partial/unknown outcomes and scoped coverage fixtures; two clean reviews |
| 05 - Serial Manager DSL | Create/continue/revise/recover, optional human waits, preflight, review, bounded correction and retention | Seven actual graphs checked; deterministic guard tests; full Dify journeys remain pending unless actually executed; two clean reviews |
| 06 - Candidate and handoff | Secret-free seven-workflow package, configuration, minimum application delta and evidence | Affected checks and two clean integrated read-only reviews against 713da2d; stop before 07 |
| 07 - Application Contracts & Persistence | Versioned runtime interfaces, compatible readers and necessary storage/index changes | Compatibility scope authorized; provider feasibility pending; preserve v1 records and update model/example/both Mermaid versions together |
| 08 - Shared Runtime Extensions | Only demonstrated missing generic seams, implemented in Unibase and imported through review | Separate authorization; no speculative core extensions |
| 09 - Unitale Gateway & Recovery | Necessary booklet MCP, admission, usage, originals and recovery behavior | Actual handlers/repositories and failure-path tests |
| 10 - Run UI Integration | Existing Run start/review/continue/revise and authentic Human Input | Browser/race checks; no separate creator workspace |
| 11 - Integrated Verification | Actual workflows against implemented application interfaces | Real integrated offline checks and two clean reviews |
| 12 - Staging Publication & Acceptance | Exact publications, finite paid acceptance and final exports | Separate scoped live/publication/paid authorization and operator inputs |

### 07 - Application Contracts & Persistence

Authorized for necessary compatibility integration once provider feasibility is
established. Use the candidate handoff and update the
model guide, JSON example and both Mermaid diagrams with any persistence change.

### Execution boundary and artifact layout

Original 01-06 local scope: package YAML, essential inline checks, focused fixtures/tests and
canonical booklet documentation/navigation. Application code, runtime registries,
migrations, root dependencies/lockfiles, deployment settings and Unibase are excluded.
Commits, pushes, live operations and paid calls require separate authorization.
Existing v1 compatibility tests are preserved. No retroactive issue is needed.

Package root: `docs/features/booklet-generation/workflow-package/`. Maintain one
`workflow.yaml` for each of the seven named roles; fixtures, README, manifest and a
single integration handoff contain only material used by those workflows. Inline code
stays readable in YAML, using only the standard library and no package imports or
generated dependency bundles. Tests inspect
the actual YAML and run focused pure functions; they do not emulate graph execution.

### Local commands and evidence levels

Use prepared Node 24 and locked dependencies. The local npm launcher is
`node output/tooling/npm/node_modules/npm/bin/npm-cli.js`. Run tsx/Git helpers outside
the sandbox on this Windows environment. No dependency upgrade is authorized.

- `npm.cmd run test:booklet-compat`: preserved v1 regressions plus current package checks.
- `npm.cmd run check:docs`, `npm.cmd run check:i18n`, `npm.cmd run check:skills`.
- `npm.cmd run handbook:ready` after document restructuring.
- Run affected inline-code tests with the prepared Python runtime where Python Code
  nodes are used; this requires no Python package or plugin distribution.
- Run typecheck for TypeScript test changes. No application build is required when
  application/runtime/dependency inputs are unchanged.

YAML parsing, static graph checks and isolated Code execution are local evidence.
They are **not** Dify import, nested execution, native-file transport, Human Input
resume, effective provider settings, pricing or paid acceptance evidence. E1-E5 remain
pending until their exact probes are authorized and performed.

### Checkpoint procedure

Work in cohesive slices. Validate before each checkpoint exit. Each checkpoint needs
two consecutive clean read-only reviews of the same implementation state; fixes reset
the affected count. Without delegation authorization, use and label separate same-agent
read-only passes. Final 06 reviews cover the entire diff and all checkpoint dependencies.
Missing required evidence prevents a completion claim; a documented pending live gate
does not invalidate independently established local evidence. Update subsequent steps
from concrete findings rather than accumulating speculative implementation tasks.

### Verified progress and resume for issue #10

The previous custom plugin, 117-module authoring framework, generated schemas, six
bundled-runtime YAML files and v2 graph interpreter/tests are superseded. Their old
test counts/review hashes do not establish correctness of the replacement. Source
selector provenance, two original PNG fixtures and correction-limit scenarios survive.
An ignored recovery archive and file/hash inventory were verified before cleanup.

Local candidate checkpoints 01-06 are complete under the revised DSL-first scope.
The [candidate README](workflow-package/README.md#checkpoint-evidence) records current
checks, two clean same-agent review passes per checkpoint and the implementation
digest. E1-E5 remain open. Authorized no-money staging probes established disposable
candidate import/readback, native child/files/control and Human Input resume; the
README records exact scope, remaining gates and cleanup. No paid or integrated
application journey is claimed.
Checkpoint 07 awaits provider-feasibility dependencies under the later compatibility
authorization. No application changes have started. Future changes reset affected
checks/reviews; do not inherit the superseded framework evidence.
The [compatibility procedure](workflow-package/integration-handoff.md#difyprovider-compatibility-procedure)
separates early Dify feasibility checks from application-dependent integration proof.

### New-session goal prompt

The DSL-first candidate through 06 is locally validated on
`feature/10-dify-workflow-design` from `713da2d`. Read current candidate evidence,
accepted specification and the necessity/simplicity gate before any further work.
Continue authorized full-compatibility work using the handoff's current identities
and pending inputs. Application compatibility work starts when provider feasibility
is established. Keep total probe spending within US$1 and preserve shared experiment
plugins. Production activation and unrelated later product milestones remain gated.
Preserve the seven roles, Manager-only app communication and pending E1-E5 evidence.

## Foundation import

Unibase PR #44 merged T03-T06 at `327bc01ed1ec4ca1dfbacd8ca7cdd64118a5f1b1`.
The template update imports that pinned revision, including the shared T01 commerce
and measurement contracts, while retaining Unitale booklet contracts and the T02
Dify harness. Template version remains 0.4.0; this is a main-commit import, not a
new template release. At this checkpoint, T13 awaited T07-T12 integration.
See [foundation services](../booklet-foundation/services.md) and
[billing compatibility](../booklet-foundation/billing-compatibility.md).

Import verification: 65 focused TypeScript tests pass across the foundation, Dify,
booklet and payment suites (the affected payment suite was rerun after correcting
its hardcoded template namespace). All 12 deployment configuration tests pass after
making their database fixtures project-aware. Typecheck, lint, build, docs, i18n,
skills, template and environment checks pass. No dependency versions changed.
The full deployment suite and live provider acceptance were not run for this import.

## Orders and promotions import

Unibase PR #45 merged accepted T07-T08 at
`b2fb215496f2ff6dfcab6f2dd33e4e0b7bd30907`. Unitale imports that exact revision
through the template helper, retaining project contracts, Dify fixtures and the
project-aware payment/deployment tests. See [orders and promotions](../booklet-foundation/orders-promotions.md).
At this checkpoint, T13 awaited T09-T12; no live provider activation or deployment was included.
The combined commerce, wallet, Run, payment, booklet-contract and Dify suites pass
98 tests. The disposable MongoDB fixture required forced shutdown during teardown;
the runner completed successfully. Typecheck/build and repository checks are recorded
in the integration PR.

## Provider billing import

Unitale imports Unibase PRs #46 and #47 at
`4760ecacda76df55c2836cb370a2db77990b4ab5` using the template helper. The import
includes T09/T10 and the audited fixes for checkout return routes, resumable Stripe
recovery, Play cancellation during pending plan changes and unpaid coupon release.
Template version remains 0.4.0. Unitale's configuration, booklet contracts, Dify
harness and prior project-specific test adaptations are retained.

The combined provider, commerce, wallet, legacy payment, booklet-contract and
Dify suites pass 102 tests. Deployment checks cover configuration and the provider
credential boundary; the contract test uses synthetic MCP metadata rather than
assuming a staging installation. Typecheck, lint, build and repository check
results are recorded at handoff. See [provider billing](../booklet-foundation/provider-billing.md).

The imported `core:0003-provider-billing` migration adds billing indexes when a
separately authorized installation runs migrations. No existing database was
changed, and no providers, purchase catalogs or subscriptions were activated.
This checkpoint supplied the prerequisites for the T11/T12 import below.
Live Stripe/Play and Android acceptance remains T28.

## Commerce administration and Android import

Unitale imports [Unibase PR #48](https://github.com/Uniwares-LTD/unibase/pull/48)
at `cee55c143c9f19a3e2a454c087b7d6fefe9d20dc` through `template:update`.
The import adds T11 native catalog purchases, restore/deferred changes, and T12
commerce administration. Template version remains 0.4.0. Project identity,
booklet contracts, the offline Dify harness and prior project-specific tests are
preserved. No new dependency version or database migration is introduced.

The imported foundation passes disposable-database commerce, billing, MCP,
migration, wallet, Run and project contract/payment checks. Unitale Android
regeneration and offline `:app:assembleDebug` pass with all 31 tasks executed,
using the verified SDK/cache and fixture identity `test.unitale.billing`.
See [Android verification](../../android.md#verification-status) for artifact
identity and remaining real-device gates. Web/build and repository check results
are recorded in the integration PR. Two same-agent read-only reviews cover the
final integrated state; no independent-agent review is claimed.

T13's template integration and local compatibility are complete. This does not
activate providers, create production purchase offers, apply migrations to an
existing installation or complete the booklet-specific T14-T27 work. Operator
installation and live acceptance remain separately authorized.

## Verification and review scope

T02 implements offline candidate graphs, deterministic fake providers, executable
Code-node/adapter checks and existing-transport integration tests. It requires no
environment file, database, Dify instance or paid calls. No production registrations,
endpoints or dispatcher changes are included. Dify engine/plugin and real-provider
acceptance remain T28 gates. T18–T20 reuse the candidate contracts and checks.

Use focused tests plus `npm.cmd run typecheck`, `npm.cmd run lint`, and
`npm.cmd run build` for runtime changes. Run applicable `check:docs`, `check:i18n`,
`check:skills`, `check:env` and migration tests. Verify ownership, full encoded MCP
bounds, duplicate starts/payments/revisions, immutable snapshots, stage-lock races,
unknown-outcome reconciliation, repair exhaustion, original hashes, generated workflow
parameters, varied/RTL packages, subscription/coupon races, share revocation and cleanup.
UI acceptance includes desktop/390px, keyboard, en/ar and English/LTR administration.
Preserve old sample Runs, purchases, credits and artifact history. Offline results
cannot stand in for T28. Same-agent read-only reviews must be identified as such.

## Verified progress and resume

T01 work branches were Unitale `task/booklet-generation` and Unibase
`task/booklet-foundation`; both were merged into their respective main branches.
T02 work branch: Unitale `task/booklet-dify-compatibility`. Accepted PRD and
dependency graph are persisted. T01 and offline T02 were implemented at this checkpoint; the table above records
subsequent foundation progress.

T02 adds [candidate graphs, fake adapters and the compatibility report](dify-compatibility.md).
`npm.cmd run test:booklet-compat` passes eleven tests. The affected existing Dify
transport and T01 suites pass 22 tests. Full `typecheck`, lint, `check:docs`,
`check:i18n` and `check:skills` pass; final test-support fixes also pass typecheck
and focused lint. No build was required: only test support, a test command and
documentation changed, with no production imports or dependency changes.
`handbook:ready` retains the pre-existing unset tracking, issue-language and
integration-branch warnings. Two consecutive final read-only reviews use the
same-agent cold-review fallback; no independent reviewer or delegation is claimed.
The user accepted T02's offline scope on 2026-11-03. Publication remains separate.
T28 retains actual Dify engine,
plugin, native-file delivery, live image quality and provider-cost acceptance.

T01 now has opt-in Zod contracts and fixtures for catalog terms, consumption orders,
subscriptions/promotions, measurements, booklets, productions, immutable revisions,
decisions, operations, original receipts, quality, manifests and specialist envelopes.
No runtime registration, database migration, billing service or workflow is implemented.
See [compatibility](contracts.md) for the boundary between parsing and authorization.

Validation of the working changes:

- Unibase: seven contract tests, `typecheck`, full lint, build, `check:docs`,
  `check:i18n`, `check:skills` and `handbook:ready` passed. Final contract changes
  were also checked with focused lint and typecheck. The final review corrected
  publication audit UID validation to match existing account UIDs and added a
  regression test. The application build evidence remains applicable: these opt-in
  contracts have no runtime importers, and the correction changes no bundled module.
- Unitale: nine contract tests passed with its own installed dependencies; full
  `typecheck`, lint and build passed. `check:docs`, `check:i18n` and `check:skills`
  passed. Handbook readiness reports pre-existing unset tracking, issue-language and
  integration-branch preferences; those settings were not changed.
- Early Unitale checks during dependency extraction failed on missing packages and
  native-file locks. Installation subsequently completed offline from Unibase's cache.
  The final typecheck and build ran outside the sandbox because SWC's user-owned
  native cache rejects the sandbox identity. No dependency versions or install-script
  permissions changed.
- Same-agent read-only inspection found and corrected ambiguous creative identities,
  inadequate initial-image budgets, quality contradictions, preallocated child
  workflow identity and publication audit UID compatibility. Following the final
  correction, two consecutive same-agent read-only passes found no blocking issues
  in the unchanged source/test state. This was not an independent-agent review.
- The prior approval-review timeout is resolved. User-authorized `gh repo view`
  verified both repository identities/access; local Git status, complete tracked
  diff, untracked source inventory and `diff --check` succeeded. The generated
  Unibase `.npm-cache/` directory is outside the product change and must not be staged.

Bases: Unitale `446a6c3a3412a45680e4aa6d996d7ca89986d0b0`; Unibase
`7b6086ca2c3f368fe934bbec0afafde9d4292dba`. T01 changes are maintained on the
work branches above; publication and live acceptance remain separate gates.

Current resume: T01-T13 foundation work and T14 repository implementation are
locally verified. T15 (lifecycle) and T16 (original media) can now proceed in parallel;
T18/T19 remain independently available. The integrated product is incomplete and
real provider/store/device acceptance remains T28.

### T14 repository checkpoint

Implemented four Unitale-owned collections: `bookletBooks`, `bookletProductions`,
`bookletRevisions` and `bookletRepositoryWrites`. The production embeds subjects
and artifact pointers; there are no separate subject/artifact collections or
independent artifact versions. Strict persistence schemas are separate from v1
workflow DTOs. See the [model and remaining integration work](model.md#implemented-and-remaining-decisions).

Owned reads, scoped cursor pagination, order-bound creation, mutation leases,
monotonic fencing and transactional revision/pointer/idempotency writes are implemented.
Production/revision BSON defaults are 1 MiB/4 MiB. Manifest records remain unapproved
drafts; there is no API for approval, charging, stage transitions or completion.
Creation accepts an existing transaction containing its order. The namespaced
`booklets:0001-repositories` migration only creates indexes; no existing data is
converted. No Unibase change/import or live migration was performed.

Verification on 2026-11-07:

- `npm run test:booklet-repositories`: 16 tests pass, including the canonical JSON
  example, concurrent writes, rollback, replay, ownership, bounds and fencing.
- Existing booklet contracts, offline compatibility, MCP foundation, migration and
  legacy artifact revision suites: 32 tests pass.
- Typecheck, lint, build, documentation, environment, i18n and skill checks pass.
- Broader `npm test`: 106/107 pass. The pre-existing auth-policy test expects
  `demo-unibase` instead of Unitale's `demo-unitale`; its source is unchanged from
  HEAD. This is a baseline test expectation, not a T14 regression.
- Handbook readiness retains the existing tracking/preference warnings.
- Final review uses two consecutive same-agent read-only passes; no independent
  reviewer or delegated review is claimed. Commit/merge remain separately authorized.

### T15/T16 service checkpoint

Implemented Unitale lifecycle services, prepaid Run admission and the booklet domain
adapter. Production start/continuation/revisions reuse Unibase commerce transactions;
no second Run charge is permitted. Exact-revision human approvals, stale-source
checks, stage locks, paid source-production reuse, quality evidence gates, bounded
repair admission and manifest completion are covered by disposable-database tests.

Original image bytes are retained unchanged in local private binary parts or the
existing configured private object store. Immutable receipts, separate derivatives,
atomic revision attachment, ordered subject-specific reference routing and reviewer
input assembly preserve hashes and ownership. Storage response loss retries the
same receipt without generating another image. Migration
`booklets:0002-lifecycle-media` creates indexes only, including repeated-run tests.

The canonical [model](model.md), JSON examples and both Mermaid views reflect actual
collections and embedded fields. The new command is
`npm run test:booklet-lifecycle-media`. No Unibase edits/import, public routes, MCP
tools, production workflow registration, provider generation, live migrations or
publication were performed. Existing interfaces remain unchanged.

Local verification on 2026-11-07: the new service suite has 12 passing tests;
the combined repository, contract, offline Dify, commerce, evidence, MCP, migration
and legacy artifact suites have 80 passing tests. Typecheck, lint, build, documentation,
environment, i18n and skill checks pass. The parallel combined test run required
MongoMemoryServer's forced-stop fallback for two disposable fixture processes;
a serial rerun passed all 80 tests without cleanup warnings. Focused regressions also verify logical-Run evidence protection and display derivatives after entitlement expiry. Final read-only reviews are
reported in the implementation handoff; no independent reviewer is claimed.

Verification on 2026-11-08 after recovery, revision-continuation, repair-allocation and successive-reuse
corrections: all 16 lifecycle/media tests and all 84 tests in the combined affected
suite pass. Regressions cover retained-output attachment from a verified terminal
Run (including an unknown image outcome), no duplicate charge/generation, an
allocation's inability to reset its repair budget, and original/derivative access
through three explicitly accepted paid productions. Revision continuations retain
their original allocation scope without another charge, respect revocation, and
cannot reset repair budgets; a new revision request replaces the scope. The focused
and combined runs passed with MongoMemoryServer's forced-stop cleanup warning.
Typecheck, lint, build,
documentation, environment, i18n and skill checks pass. Typecheck and build run
outside the sandbox because SWC's native cache rejects the sandbox user.

T17 consumes this service checkpoint. T18/T19 remain independently
available; T20 wires actual specialist/reviewer publications and enforces provider
spending, text-call, elapsed-time and workflow-step limits. T21 supplies the creator
workspace and rich image review presentation. These server-service results are not
live Dify, visual-quality or end-user journey acceptance; those remain their assigned
tasks and T28. Commit, merge and deployment still require explicit authorization.

### T17 MCP checkpoint

The `booklets` extension registers fifteen versioned tools through `/api/mcp`.
The [catalog guide](../../mcp.md#unitale-booklet-catalog-t17) documents permissions,
automatic Run scope, version/fence checks, exact human decisions, bounded transfers,
quality evidence and manifest completion. There are no additional tool endpoints,
dispatcher changes, provider calls or Unibase edits/imports.

Private transfer metadata, parts, cumulative budgets and server-owned reviewer
bindings are reflected in the model guide, JSON example and regenerated diagrams.
Migration `booklets:0003-mcp` adds indexes only. Diagnostic transfer completion
retains its idempotency receipt and discards raw staging bytes; remaining staging
cleanup belongs to the later retention work. T19/T20 must provision verified
reviewer bindings and trusted measurements before quality calls can succeed.

Local verification on 2026-11-08: `npm run test:booklet-mcp` passes seven tests.
The combined repository, lifecycle/media, contract, offline Dify, commerce, evidence,
MCP, migration and legacy artifact suites pass all 98 tests. Typecheck, lint, build,
documentation, environment, i18n and skills checks pass. An initial combined run
emitted MongoMemoryServer's forced-stop warning; the final 98-test run passed.
Two consecutive same-agent read-only reviews are reported in the handoff, with no
independent reviewer claimed.

Additional existing Dify registration coverage is not green: nine subtests plus
their parent fail with `DIFY_ENVIRONMENT_OWNERSHIP` (five tests pass). The same
failures reproduce in a disposable detached worktree at unchanged base
`ad8dd8fe736823b757da3d6701785b2cd3a567f8`. This is a pre-existing registration-fixture
or environment-binding issue, not evidence of live Dify compatibility. T17's new
catalog uses the real MCP handler with a fake identity provider and disposable
database; T28 still owns real provider/Dify acceptance.

T18 specialists and T19 visual reviewer are next and may proceed independently.
T20 manager composition requires both plus T17. Commit, merge, publication and
deployment remain separate authorized actions; no live configuration was changed.

Review follow-up: original-image MCP reads now reuse a bounded cache of fully
verified bytes and recheck authorization for every chunk. The focused lifecycle/media
and MCP suites pass 24 tests, including local/object storage read counts, fresh Db
handles, idle expiry, foreign ownership and deletion after cache population. The
Mongo fixture emitted its forced-stop cleanup warning. This correction adds no
persistence fields. The separate 100-item manifest source/asset transport limit
finding remains unchanged, as requested; it still needs resolution before accepting
larger packages through the complete MCP production path.
