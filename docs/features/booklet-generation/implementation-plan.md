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

**Readiness: candidate checkpoints 01-06, local storage 07 and shared-runtime import 08 are
implemented and reviewed. Scope B covers 07-11; checkpoint 09 is Verified locally. The active goal stops before 10. Runtime/live
acceptance and scope C remain separate.** The
[A01-A22 register](workflow-design.md#implementation-readiness-audit)
links each resolution to the [package specification](workflow-package-spec.md#technical-resolutions-for-a01-a22).
Checkpoints 01-12 below replace the application-first C0-C10 sequence. Deliver the
candidate workflows and proposed application changes at 06. That initial stop was
superseded by the recorded scope B approval for 07-11. The active goal completes
09.7 and the 10 plan, then stops before 10 implementation; 12 remains gated. E1-E5 retain partial or pending runtime evidence; E6 records current local checks, not
integrated acceptance; candidate validation is distinct from integrated/live acceptance.
A failed probe blocks its dependent binding, not independent schemas/fake-provider work.
No checkpoint starts merely because documentation has been updated.

The user subsequently authorized preparation of bounded upstream fixes for the
demonstrated official-provider gaps. The [patch and application instructions](workflow-package/integration-handoff.md#prepared-upstream-patch)
record offline evidence. This amendment adds no package framework or production Unitale plugin;
upstream submission, shared-plugin installation and paid probes initially remained
separately gated. The subsequent full-compatibility authorization covers upstream
submission and isolated Dify/provider testing only, as clarified by the user at handoff,
with **US$1 total probe spending**. The preservation requirement still applies:
temporary namespaced copies leave shared experiment plugins intact. Submission,
frozen-lock packaging, isolated installation, Luna structured output, Sol vision and
dated Sunburst Generate/Edit probes pass. Native structured-output alias/schema
defects were corrected and regression-covered; the handoff retains their failed runs,
usage estimates and conservative liabilities. This is not production
activation or acceptance of unverified E1-E5 behavior.

The user subsequently accepted SDK retries, the existing network timeout and the
Sunburst alias, with honest admin evidence and future status reconciliation as
defined in the [handoff amendment](workflow-package/integration-handoff.md#accepted-provider-tradeoffs).
This removes provider patch/release/installation prerequisites. Current-provider
configuration/import/export readback now passes for all seven disabled candidates,
with cleanup verified; revised-binding execution and integrated runtime proof remain pending.

The initial delivery authorization covered local DSL-first implementation through 06.
That initial authorization stopped at the validated Dify/provider handoff. Scope B
was subsequently approved on 2026-11-10 for 07-11 as recorded below. Implementation
has started: 07 storage and the reviewed 08 shared-runtime import are complete locally.
The user authorized
committing/pushing the reviewed candidate and updating issue #10 on 2026-11-09.
Scope B now covers scoped code publication/merges after checks and reviews;
Dify publication and operational activation remain scope C.
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
| T17 | Unitale | MCP-only booklet tools | T15,T16 | v1 implemented and preserved with historical transport bounds; v2 complete-payload path locally verified in 09 |
| T18 | Unitale | Source specialist workflows generalized to package inputs | T01,T02 | Candidate implemented; integration/acceptance pending |
| T19 | Unitale | Versioned quality assessment service and bounded correction contract; issue #10 covers all review modes | T01,T02 | Candidate, persistence and local enforcement verified through 09.6; target acceptance pending |
| T20 | Unitale | Manager composition, Human Input and durable continuation | T17,T18,T19 | Candidate and local application/recovery verified through 09.6; creator controls and target acceptance pending |
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
| 07 - Application Contracts & Persistence | Versioned runtime interfaces, compatible readers and necessary storage/index changes | Locally complete with two clean reviews; v1 preserved; model/example/both Mermaid versions updated; runtime integration remains 08-11 |
| 08 - Shared Runtime Extensions | Only demonstrated missing generic seams, implemented in Unibase and imported through review | Reviewed imports through Unibase `a7eda79b0f7c77732913e3a6b82a6eab3f6485fe` (PRs #49/#50/#52); local checks pass; live conversion remains 12 |
| 09 - Unitale Gateway & Recovery | Necessary booklet MCP, admission, usage, originals and recovery behavior | Actual handlers/repositories and failure-path tests |
| 10 - Run UI Integration | T21 brief, quotes, progress, decisions, revisions and history in existing Run UI | Browser/race checks; no separate creator workspace |
| 11 - Integrated Verification | Actual workflows against implemented application interfaces | Real integrated offline checks and two clean reviews |
| 12 - Staging Publication & Acceptance | Exact publications, finite paid acceptance and final exports | Separate scoped live/publication/paid authorization and operator inputs |

### Remaining implementation: kickoff and ownership

Planning amendment accepted 2026-11-10. **Scope B execution started.** The user requested committing the current changes
and executing 07-11. Candidate/planning baseline committed as `2dc7b8c`; checkpoint 07
is complete through `867759c`. The original reviewed 08 import was Unibase
`a7eda79b0f7c77732913e3a6b82a6eab3f6485fe` (PRs #49/#50/#52). The current exact
import is recorded in `project.source.json` and the [local-popup adoption](#local-google-popup-adoption);
09.1-09.7 are Verified locally; checkpoint 10 remains unimplemented. Scope C and paid/live operations remain pending. The plan targets unattended
Sol Medium work under the recorded approval.

The [capability audit and approval register](workflow-package/integration-handoff.md#approval-register)
records the actual user decisions. Scope A used one zero-cost disposable app, verified
native retries/delay and output/retry readback, and cleaned it up. Selective paid retry,
crash/nested recovery and native MCP file conversion are not yet proven.

Scope B approval on 2026-11-10 covers Unitale checkpoints 07-11, necessary bounded
Unibase changes, and scoped commits, pushes, PR publication, normal merges and reviewed
exact template imports after required checks/reviews. User condition: "keep everything
simple and minimal, do not over-engineer". Preserve and review the task-owned diff;
reuse existing services/worker/Run UI. No new framework, scheduler, plugin, dashboard,
dependency, delegation, release/tag, deployment or paid call is authorized by B.
Required external reviews and branch protections remain in force.

The user accepted **no temporary tunnel**. Validate the MCP response shape locally in
08-09, then prove deployed native-file conversion through the real staging application
endpoint in 12. This defers live evidence, not the original-image requirement. Source/
local tests may permit 07-11 progression; failed local compatibility still blocks its
dependent work. Do not add a fixture server/network merely to clear a planning gate.

Scope C remains **pending** by explicit user choice. A **US$3 total** provider-spend
ceiling is selected for future staging acceptance, conditional on later C approval;
it is not spending authorization now. Retain estimated costs and unresolved liabilities
before dispatch and the accepted hidden-SDK-retry limitation. No live activation or
paid acceptance is included in B.

Continue Unitale on `feature/10-dify-workflow-design`. Create an Unibase work branch
from verified upstream main, never develop on main. The 2026-11-10 read-only check
found local Unibase at `65e70ca35786c8e81ba1039dd258a7a010d40df0`, while upstream main
and Unitale's recorded import were `cee55c143c9f19a3e2a454c087b7d6fefe9d20dc`.
The checkout was subsequently refreshed and `feature/booklet-runtime-seams` created
from that verified upstream revision before checkpoint 08 changes.
Follow both repositories' guidance and retained Handbook baseline above. Use prepared
local tools, fake providers and disposable databases; no credentials are needed for
local 07-11 work. Establish affected baselines and preserve unrelated changes.

Unitale owns booklet policy, content/persistence, assessments, counters, Manager
MCP tools, product registration, booklet UI and YAML. Unibase owns reusable Run,
worker/provider/MCP transport and generic extension points. Shared changes originate
upstream and enter Unitale through reviewed `template:update`; never copy shared
patches locally. No booklet roles, collections or policy in Unibase.

| Milestone | Verified progress | Remaining coverage |
| --- | --- | --- |
| T18 | Seven candidates, storage and local handler/native Code bindings/originals verified through 09.6 | 11-12 integration/acceptance |
| T19 | Six modes, immutable assessments and durable correction enforcement verified locally through 09.6 | 11-12 proof |
| T20 | Local Manager gateway, authenticated decisions, retry/reconciliation and connected continuation verified through 09.6 | Creator controls in 10; 11-12 proof |
| T21 | Generic Run slots and local booklet lifecycle/quote/recovery/history services exist | 10 all six creator outcomes and admin settings; 11-12 proof |

No T18-T20 behavior is intentionally omitted. Complete T21 through existing Run
surfaces; a dedicated booklet list/workspace is excluded, not its history or financial
consent requirements. Reader/PDF/sharing/storefront and full-product T26-T28 remain
separate. Earlier T18-T20 next-step statements below are historical evidence.

### Estimated implementation effort completed and checkpoint mapping

Planning estimate as of 2026-11-12, not measured hours, acceptance percentages or a
claim that the MVP is ready. Ranges estimate each T milestone's implementation work
already delivered, including reusable foundations. Milestones differ in size and share
services: do not average these percentages or add them as effort. Live acceptance is
reported separately, principally in 12 and T28. No per-T time ledger exists.

| T checkpoint | Estimated implementation effort done | Current delivery-checkpoint relationship | Remaining outcome |
| --- | --- | --- | --- |
| T01 | 95-100% | Original contracts; v2 refinement in 01/07/09 | Boundary adjustments demonstrated during UI/integration |
| T02 | 100% of accepted offline scope | 02/06; reused in 09/11 | Live evidence belongs to 12 |
| T03 | 95-100% | Earlier Unibase foundation, reused by 08/11 | Store/device acceptance in T28 |
| T04-T08 (each) | 95-100% | Earlier Unibase foundation; necessary generic extensions in 08 | Final integrated regression/acceptance |
| T09-T12 (each) | 90-100% | Earlier billing/Android/admin imports, reused by 08/11 | Actual configured stores/device and final integration |
| T13 | 100% of local foundation scope | Earlier import; reviewed runtime updates in 08 | Future imports only for demonstrated gaps |
| T14 | 95-100% | 07 persistence; 09 runtime use | Final UI/integration boundary validation |
| T15 | 90-95% | 09 lifecycle/recovery; consumed by 10 | Public recovery/revision integration and acceptance |
| T16 | 90-95% | 09 originals/reuse; 10 owned media bridge | Public delivery and real transport evidence |
| T17 | 90-95% | 09 v2 MCP; 11 regression; 12 live bindings | Actual deployed MCP/native-file proof |
| T18 | 85-95% | 03/04/06 workflows; 09 integration | 11 local integration and 12 actual execution/quality |
| T19 | 85-95% | 03/04 Reviewer; 07/09 durable enforcement | Broader revision cases and actual quality acceptance |
| T20 | 80-90% | 05 Manager; 09 recovery; 10 controls | Creator integration and real Dify journeys |
| T21 | 15-25% | Supporting 09 services; primary work is 10 | All six creator outcomes, browser checks in 10/11 |
| T22 | 10-20% | Reuses 09 media and 10 bridge; delivery is after 12 | Private ordered reader and accepted downloads |
| T23 | 0-5% | After 12; reuses immutable manifest/originals | Deterministic PDF |
| T24 | 0-5% | After 12 | Revocable version-bound sharing/download controls |
| T25 | 25-40% | Reuses earlier commerce/wallet; beyond 10-12 scope | Customer storefront/offer/entitlement integration |
| T26 | 15-25% | 11 contributes a subset | Whole-product journeys including delivery/sharing/storefront |
| T27 | 10-20% | 11/12 contribute evidence | Whole-product migration/recovery rehearsal and reviews |
| T28 | 5-10% | 12 contributes Dify acceptance | Full provider/store/device acceptance; historical probes are feasibility only |

The final MVP still needs T21-T28. Checkpoints 10-12 complete the workflow integration
slice and do not replace those later delivery, commerce-experience or release outcomes.

### Requirements alignment check

Documentation review on 2026-11-10 against the accepted PRD and T18-T21 scope:

| Requirement / invariant | Planned coverage and boundary |
| --- | --- |
| R01 configurable creation; T21 brief/quotes | 09 admission/price identity and 10 package/brief/consent; synthetic local fixtures, no launch catalog seeds |
| R02-R03 persistence and history | 07 versioned immutable state and 09 continuation; 10 accessible history; preserve v1 and embedded subject/artifact identities |
| R04/R08 measurements and limits | 09 trusted bounded evidence and no double counting; missing SDK attempts/costs remain unknown |
| R05-R07 orchestration, decisions, revision locks and MCP security | Manager-only app communication, authentic correlated responses, owned tools and existing accounting; no app creative scheduler |
| R09 originals | Local response/byte/hash checks in 08-11; actual MCP/Dify conversion in 12 through real staging endpoint; requirement retained despite evidence deferral |
| R10/T19 quality and corrections | All six review modes, Manager policy, durable correction counts distinct from technical retries and paid customer revisions |
| R12 consumption and recovery | Prepaid scope preserved; unknown calls reconciled, never blindly replayed; no duplicate continuation charge |
| T18-T21 completeness | Specialist/Reviewer/Manager integration plus all six creator outcomes; existing Run UI, not a new workspace |
| Later product obligations | R11 commerce remains reused and regression-protected; R13 delivery and later retention/product acceptance remain their existing milestones, not added to B |

No accepted requirement is removed by the no-tunnel decision. This is a planning
conformance check, not proof of implemented behavior. Scopes A/B/C and technical
evidence are recorded separately in the handoff; unresolved integration proof stays
visible. The original documentation-only readiness audit left model JSON/diagrams
and runtime artifacts unchanged; subsequent checkpoint 07 implementation updated them
together as recorded in its evidence below.

### Action retries and automatic reconciliation

These are accepted target semantics for 07-11, **not capabilities of the current
01-06 candidate**. Unitale administration owns the following production-snapshotted
settings; values are nonnegative safe integers and count retries after the first attempt.

| Category | Default retries | Maximum automatic action attempts |
| --- | --- | --- |
| Paid LLM | 2 | 3 |
| Paid image | 0 | 1 |
| Retriable non-paid | 3 | 4 |
| Non-retriable | Not applicable | Stop until cause changes |

Existing spending, execution and action limits still apply. Settings changes affect
new productions, never reset active counters. SDK retry defaults remain accepted;
action attempts are measurable, hidden provider attempts/costs may be unknown.
No provider patch or exact SDK-attempt control is required.

Use one durable action history: logical action ID, canonical request hash, category,
policy snapshot, attempt IDs/numbers, reason, outcome, timestamps, next eligible time,
result/evidence references and correction-chain identity. Each paid dispatch gets a
new attempt/call ID under the same logical action. Non-paid write retries reuse their
business idempotency key. A new invocation or successor cannot reset allowances.
Technical retries and quality corrections have separate counts in this same history:
a failed image with zero retries differs from a successful defective image eligible
for the existing one correction. Keep three LLM corrections and one image correction,
with customer-paid revisions separate. Reviews themselves are not corrections.

Manager remains the only workflow orchestrator. App services classify trusted outcomes
and atomically authorize attempts; no app specialist scheduler. Retry only the failed
operation, never successful siblings or an entire child/Manager flow. Save failures
reuse retained bytes/results. A deterministic native failure branch must handle a
failed Manager reasoning call without asking that failed LLM to recover itself.
Keep independent Dify node retry layers disabled. Native failure routing must use the
same app-authorized attempt identity/counter before any new paid action. A graph whose
failed stage cannot be isolated must stop rather than replay successful paid stages.

Classify from trusted evidence, never model explanations:

- Confirmed transient failure with no unresolved execution: eligible for bounded retry.
- Invalid input, credentials, permissions, unsupported configuration or exhausted product
  limits: non-retriable until corrected. A stale fence requires rereading state, not
  overwriting concurrent work.
- Timeout, disconnect or incomplete evidence: unknown; reconcile before redispatch.
  A terminal Dify error alone does not prove the underlying provider did not complete.
- Successful defective content: quality correction, not a technical retry.

Reuse existing Run `retryBaseSeconds`, `retryMaxSeconds`, `pollSeconds` and
`reconciliationHours`; do not add timing settings or a scheduler. Backoff starts at
configured base and doubles to configured maximum, using the action's retry ordinal;
honor validated retry-after within existing bounds. Persist eligibility times; never
hold a transaction/production lease or run a busy-wait Code node during delays.
Checkpoint 08 must prove a native wait/reentry path using existing mechanisms. If an
active Dify execution cannot safely wait, checkpoint it and expose continuation after
verified termination rather than create an alternative scheduling system.

The existing AI worker automatically reconciles: inspect retained evidence first,
then query the bound Dify run/node when a verified execution locator exists. Successful
running/paused reads are normal observation, not failures. Failed status reads consume
the non-paid attempt budget (initial failed read plus three retries by default)
for that reconciliation episode; successful observations do not
reset its failed-read count. End automatic reconciliation at allowance exhaustion or
the existing snapshotted reconciliation deadline. Missing locators/unavailable evidence
become explicitly unresolved; do not search by similarity. Ordinary observation can
continue for a confirmed active Run under existing runtime limits.

Exhaustion/deadline is not proof of provider failure, termination or zero cost. Preserve
liability and accept trusted late results through restricted recovery. Do not query
OpenAI directly unless a supported locator/status capability is demonstrated later;
that future improvement is not required here. Stop/revocation forbids dispatch but not
retention of already-paid results. No automatic successor scheduling.

Public controls:

- **Retry failed step:** only a confirmed retriable failure with no active/unknown
  attempt; one authenticated click authorizes one additional attempt, never resets
  automatic counters or bypasses existing financial safeguards. Duplicate clicks are
  idempotent. If the original workflow has terminated, execute it through the same
  verified successor path as Continue, scoped to the failed action.
- **Continue booklet:** verified predecessor termination, same production/prepaid scope,
  checkpoint and known results; no duplicate charge. If termination is unknown, do not
  offer a successor even if the worker has stopped waiting.
- **Stop:** prevent new dispatch; retain/reconcile paid results.
- Unknown outcomes show "Your completed work is saved. We're checking the last step
  before continuing." When checks exhaust, show that the step needs review, not an
  unsafe retry action. Non-retriable failures require a corrected cause first.

Log every application error, retry, explicit retry authorization and reconciliation
check in existing bounded evidence/administrative views: category, code, timestamps,
attempt/call/run/node IDs, outcome, available provider IDs and usage provenance.
Redact credentials/private Run context; preserve missing SDK retries/costs as unknown.
Do not add a dedicated dashboard or rely on logs for authoritative accounting state.

### 07 - Application Contracts & Persistence

Current implementation evidence (07 complete locally): 07.1 adds `src/project/booklets/contracts-v2.ts`
for consumed native content, six-mode assessment and retry-policy boundaries. Existing
v1 parsers remain unchanged. Focused contract checks pass 12 tests (including three
v2 behavior cases). 07.2 adds explicit v2 production/revision schemas and atomic new
production creation, retry-policy snapshots, short leases and bounded checkpoint
CAS/idempotency in the v2 repository. The 21 repository and 17 lifecycle/media tests
pass; the v2 case covers owner isolation, unchanged v1 records, duplicate creation,
changed payloads, lease replay, one-winner checkpoint races and oversized rollback.
Draft immutable revision writing now preserves exact text and validates local source/
original identities, with atomic pointers/ordinals and idempotent receipts; active v2
writes stay closed until 09 admission integration. The new revision race/hash test passes.
07.3 now adds work CAS transitions, snapshotted automatic retry limits, repeatable
scoped assessments, Manager acceptance and correction counts from the same work history.
Three new collections are registered with index-only `booklets:0004-manager-state`;
v1 quality uniqueness and records are untouched. The 21 repository tests include
unknown-outcome replay prevention across runs, retry limits 2/0/3, distinct correction
limits 3/1, evidence/scope binding (including original IDs and continuity pairs), repeat
assessments and atomic acceptance. Trusted
dispatch/admission/observer wiring remains 08-09. Existing review-request/runDecisions
storage fields support human correlation; wiring/authentic resume remains 09-10. Checkpoint 07 exit is locally complete. Two consecutive clean same-agent read-only
reviews covered the final implementation after fixing unbounded finding reads and
unobserved/incomplete assessment coverage. No independent-agent review is claimed.
Reviewed source/test/model digest: `601e456d3e9998fd9e02b3a02e18d332bd25c6ffa761b6e29a89929dd2e041d5`
(14 implementation/model files, relative path plus file SHA-256 list, base `2dc7b8c`;
status/evidence-only docs excluded to avoid self-reference). Ignored reproducibility
record: `output/tooling/checkpoint07-review.json`.

Final checks: 21 repository, 17 lifecycle/media, 7 MCP, 12 contract and 34 candidate
compatibility tests pass (91 total); typecheck, scoped ESLint, build including workers,
check:env, check:docs, check:i18n and check:skills pass. One disposable Mongo teardown
needed SIGKILL after its graceful shutdown timeout; tests exited successfully. No live
migration was run. Candidate package digest remains
`1cef1f643dd8a043a46eb52fb74c88a8978127de21d8b0a3f369405467e18df3`.

Next: verify current Unibase main and inspect the specific 08 seams. Normal mutators
still require live ownership/fences; restricted late-result retention needs the trusted
observer path in 08-09, not an unguarded bypass. Manual retry grants, actual scheduling,
paid admission and live file conversion remain runtime/integration work, not 07 claims. Baseline candidate
checks pass 34 tests, typecheck, scoped lint, docs/i18n/skills and digest audit. Sandbox
spawn/cache restrictions were resolved by running affected checks outside the sandbox.
The model guide, independent v2 JSON example and both generated Mermaid schemas
were updated together with the executable storage changes. Typecheck, scoped lint and documentation checks pass.
No existing v1 data conversion, migration or live activation occurred.

Unitale only. Implement four slices, each checked before proceeding:

1. Add only consumed v2 boundary parsers/content variants beside strict v1 contracts.
   Provider JSON-string carriers are not domain types. Bind new productions explicitly
   to v2; preserve v1 records/publications and reject cross-version continuation.
2. Add versioned production/revision readers before writers. Reuse existing repositories,
   canonical hashing, embedded subject/artifact identities and immutable lineage.
   Preserve exact Unicode/whitespace; no automatic conversion or text normalization.
3. Persist missing action attempts, retry policy/counters, scoped assessments, Manager
   acceptance, human correlation and correction chains. Use separate v2 assessment
   storage; do not change the v1 unique quality index. Keep opaque checkpoint plus CAS
   version on the owned production, capped at 64 KiB. Large outputs stay in existing
   bounded evidence/media storage. Work facts remain authoritative over checkpoint intent.
4. Register only query/idempotency indexes actually consumed, including unique owned
   logical-action/attempt and mutation keys. Register a forward-only booklet migration
   after `booklets:0003-mcp` through the existing project extension. Update collection
   registration, model guide, JSON example and both Mermaid schemas together.

Mutation facades use existing short Run-owned leases/fences around local transactions;
no lease spans model/Human Input waits. Reload authoritative state/fence after waits.
Preserve v1 human/quality gates on v1 bindings; only v2 transfers policy to Manager.
No MCP registration, admission, native transport, UI or live migration in 07.

Exit: actual candidate boundary fixtures, mixed-version reads, exact hashes, ownership,
immutable lineage, stale fences, duplicate/conflicting writes, one-winner checkpoint CAS,
repeat assessments, durable counters and idempotent migration pass on disposable data.

### 08 - Verify runtime seams and import necessary Unibase changes

Unibase shared seams are merged in [PR #49](https://github.com/Uniwares-LTD/unibase/pull/49)
at `61001a0174ac53f542d1e93f6ad7d08a2bd32dd0`, from verified base
`cee55c143c9f19a3e2a454c087b7d6fefe9d20dc`. Six small commits end at
`473affe0522858d7702d4673577f62cda1750180`. The optional changes provide ordered
native MCP images, private transactional node observations, declared internal waits,
project Run UI composition and late-result reconciliation in the existing worker.
Handled Dify exceptions now display failed stages; raw errors remain private.
No dependency, framework, scheduler, migration or provider change was added.

Final upstream verification: 65 AI-job/Run/persona/result-application/MCP regressions
and 16 Dify stream/replay/tracing tests pass, alongside typecheck, scoped ESLint,
production application/worker build, docs, environment inventory, i18n, skills and
template checks. Initializer tests and two independently initialized project builds
also passed with task-local Git 2.56 (host Git 2.27 lacks `init -b`). Native image
tests preserve bytes/order and cover synthetic 8 MiB capacity and encoded bounds.
Recovery tests cover stale fences, rollback, parallel human/internal waits, a lost
submission response without redispatch, and private late-result retention after Stop.
Local headless browser checks cover English/Arabic desktop/390px Run pages, genuine
Human Input, focus, English/LTR admin and preference restoration, navigation nonces
and served-document CSP enforcement. Task browser/server fixtures were stopped.

Two consecutive separate same-agent read-only full-candidate reviews at `473affe`
found no blocking issue; no independent review is claimed. These establish generic
local seams, not application-connected recovery or deployed Dify image conversion.
No live configuration or provider call occurred. Booklet storage/model diagrams are
unaffected by generic Run metadata.

Integration found an eager AI-job/domain registry import cycle in the real Unitale
extension. [Unibase PR #50](https://github.com/Uniwares-LTD/unibase/pull/50) corrects
it by resolving domains during event handling, without another interface. It passed
32 upstream AI-job/Run tests, typecheck, scoped lint, worker build and two separate
same-agent read-only passes. Unitale imported corrected merge
`98b77fd1926bc38cefa172a1c90e4735597ca6db` through `template:update` as `2873e60`;
`project.source.json` records it. Project registries, booklet implementation,
configuration and dependencies are preserved. The actual previously failing consumer
suites now pass all 38 repository/lifecycle tests, including v1/v2 storage and media.
The disposable Mongo fixture required forced-stop cleanup; the test process passed.
The first import also passed 81 shared-runtime and 55 other booklet/package/migration
tests; those results did not prove the failing initialization order. Corrected Unitale
production build, sequential typecheck and full lint pass. Final documentation,
environment, i18n, skills, model-view and template checks pass; the corrected import
also passes all 32 Unitale AI-job/Run regressions.
An initial concurrent build/typecheck raced generated `.next/types`; use sequential
checks. The superseded build was stopped before importing the correction.
Two clean separate same-agent integrated source reviews at `2873e60` found no blocking
issue; no independent reviewer is claimed. Checkpoint 08 is complete locally. Native
deployed MCP conversion and application-specific recovery remain 09-12 evidence.

08 wait/resume resolution: the existing worker already schedules paused Runs and
the decision submission helper journals uncertain submissions. Reuse those paths.
Add an optional versioned domain declaration of fixed native application-wait node
IDs and a paused-Run resume hook. Only those server-declared nodes become internal
waits: retain their decision journal, suppress creator questions/notifications and
persona answers, and display reconciliation progress. An application response must
match the owned target/declared node and cannot approve a human/quality decision.
Use the existing worker eligibility/poll/reconciliation bounds, one execution and
the existing submission intent; no new scheduler, paid responder or blind replay.
Unitale 09 must additionally bind each wait to its actual authorized action and
durable eligibility/counters. Local fake-provider tests prove the generic seam;
application-specific policy and live acceptance remain their later checkpoints.

08 terminal-interface finding: Manager currently returns its domain status envelope,
while the existing Run worker already accepts a `result` UI envelope. No new shared
normalization hook is needed. In 09, keep the domain envelope unchanged under the
additional End output `booklet_result` and use the existing small finish Code node
to produce the generic `result` view. Map a finished `complete` domain result to
success, `invalid_input`/`failed` to failed, and other terminal domain states to
partial; the worker still requires native execution success for success. Keep
cards/images empty and checkpoint null in this view: owned booklet state/assets
remain authoritative. Include only a bounded readable summary and sanitized failure
code/message, never raw work evidence, private context or native file handles.
Update the v2 binding/fixtures/hashes/handoff together in 09. Preserve existing v1
outputs and worker accounting; no additional generic result protocol or interpreter.
Verified against the actual `consume` Code node: it emits `complete` only after the
application confirms structural completion. The earlier `succeeded` wording was
incorrect and must not create a second domain completion vocabulary.

08 late-result finding: the generic worker does not claim terminal Runs. Active-node
observation and paused-Run resume therefore cannot reconcile a child that finishes
after its parent stops. Add one optional server-extension `reconcile(db, now)` callback
to the existing AI worker cycle. Unitale 09 supplies one bounded, leased, non-paid
readback/retention pass over already accepted unresolved work, including when module
admission is disabled. It cannot dispatch paid work or create a successor. Keep the
existing worker mode switch, timing and heartbeat; do not keep stopped Runs artificially
active, add another queue/scheduler, or repurpose decision-failure fields for this case.

First prove existing extension points against current upstream; no fixed expansion list.

| Required proof | Smallest permitted Unibase delta if absent |
| --- | --- |
| Trusted child/Manager execution identity, outputs and usage | Optional bounded provider/worker observation hook, preserving defaults without a project consumer |
| Ordered native originals across actual MCP wrapper | Optional validated file-result transport; retain JSON/text compatibility, permissions, redaction and complete encoded-response limits |
| Authenticated decisions, terminal recovery and scheduled eligibility | Narrow optional Run/domain hook using existing worker scheduling, not another dispatcher |
| Existing Run UI can host project-specific controls/history | Typed optional extension point; no booklet-specific policy in shared UI |

The approved one-app probe established native node_retry events and terminal output/
retry-row readback; current stream/trace adapters discard part of that evidence. Use
the [probe result](workflow-package/integration-handoff.md#approved-minimal-capability-probe-results)
to scope the observer delta, not as proof of paid retry classification or crash recovery.

Current Unitale MCP transport emits JSON/text only; native file conversion is a real
proof obligation. Use a local synthetic fixture for the 08-09 response/transport contract;
defer deployed byte conversion to the real staging endpoint in 12. No temporary tunnel. Inspect installed wrapper declarations and recorded probes. Assert
actual result shape, byte identity/order, practical capacity, expiry and permission
failures; local mocks alone do not close target evidence. Do not silently invent a
wrapper, expose base64 to models, add a plugin, or treat declarations as live execution.
If local inspection/testing cannot establish a supported response path, mark dependent
work blocked and continue independent work. The absence of live MCP conversion evidence
alone is not a pre-07-11 blocker under the accepted deferral; it remains a 12 gate.

For needed shared changes: implement backwards-compatible optional APIs in Unibase,
focused tests and an Unreleased changelog/upgrade note. Run checks and two clean reviews;
then PR/merge under kickoff approval and repository protections. Import exact reviewed
revision with `template:update` from a clean Unitale tree. Preserve project-owned files,
registries, deleted samples, identities and configuration; verify source record and
regressions. Do not manually edit Unitale CHANGELOG/template version. Close 08 with
no code if all seams suffice. Do not claim an external required reviewer can be automated.

### 09 - Unitale Gateway & Recovery

#### Sequential execution and progress

The accepted remaining-work sequence is 09.1–09.7 below. Baseline: `d294935`.
Reuse the delivered foundation described below; passing foundation tests do not
establish a complete application-connected journey. Track tasks as Pending,
In progress or Verified, with one task active at a time. Report task ID (out of seven), intended
outcome, changes/checks and remaining work at each implementation point. Do not
use estimated completion percentages as acceptance evidence.

| Task | State | Required outcome and exit evidence |
| --- | --- | --- |
| 09.1 Manager context and bindings | Verified | Local configuration/identity, bounded context/navigation, complete checkpoint and atomic fence tests pass. Actual remote/plugin readback remains checkpoint 12 evidence. |
| 09.2 One complete text action | Verified | Local guarded dispatch, native usage, exact retained text/publication and compact checkpoint journey pass, including lost-reply/replay denial. Provider/target limitations remain accepted and explicitly labelled below. |
| 09.3 Assessment and image actions | Verified | Local handler/native Code fixtures cover all six modes, correction lineage, exact preparation/preflight, original bytes, publication and revalidation. Exact assessments/coverage cannot be altered; partial results and save/attachment replay preserve originals. Live Dify conversion remains checkpoint 12 evidence. |
| 09.4 Human decisions and completion | Verified | Authentic first-wins response correlation, exact Manager acceptance, manifest publication and structural completion pass local handler/native Code fixtures. Owned acceptance/human/execution/production histories page beyond previews and exclude private/foreign records. Actual Dify rendering remains checkpoint 12 evidence. |
| 09.5 Bounded recovery | Verified | Local repository/handler/worker and native Code fixtures prove durable retry eligibility, explicit retry authorization, automatic technical waits, bounded readback, terminal continuation, cancellation and replay without lost successful work or another charge. Provider-safe failure classification remains an accepted limitation; unknown/unisolatable outcomes stop for reconciliation. Creator controls remain 10. |
| 09.6 Connected journeys | Verified | Real handlers/native Code fixtures cover creation, correction, purchased revision, continuation, predecessor reuse and completion; all review modes, large exact text, originals, human waits, partial results and v1/unrelated Run regressions pass locally. Target graph execution remains 12. |
| 09.7 Review and handoff | Verified | Final affected checks and two consecutive clean same-agent read-only whole-package reviews pass. Evidence consolidated; 10.1-10.7 plan revised around delivered services. Stopped before 10 implementation. |

Execute in order; existing code from later tasks remains reusable. Verify each exit
before marking its task Verified. Within a task implement coherent slices, run focused
checks and record concise evidence here; reserve full checkpoint review pairs for 09.7.
Routine implementation choices need no further approval. Demonstrate a named behavior
gap before adding an interface, persisted field or abstraction, and record the smallest
necessary amendment here. No speculative scaffolding, framework, generator, scheduler,
dependency, custom provider plugin, dashboard or additional tracking hierarchy.

The 2026-11-11 acceptance amendment applies throughout the remaining sequence:
provider gaps that require broader scope or implementation are accepted limitations.
Record their verified effect, fallback and missing evidence, then continue. Do not
add provider controls, plugins, telemetry interfaces or infrastructure to close them.
Keep the accepted application ownership, funding, persistence and replay safeguards;
target execution stays a separately authorized checkpoint 12 activity.

09.3 now uses distinct preparation/generation action and call IDs. Generation consumes
the exact retained prepared request, including preparation identity. The candidate and
fixtures preserve prepared/source/reference hash checks without colliding with unique
work call identities or introducing phase records.

All accepted retry/reconciliation, financial, human and ownership decisions above
remain binding. Manager owns creative orchestration; application guards remain
structural/financial, not replacement quality policy. Use local fixtures/fake providers.
Default to no further Unibase changes; demonstrated generic gaps originate there and
enter Unitale through reviewed template integration. Continue independent local work
when an external capability blocks a dependent path; never weaken its exit criteria.
Scope B covers local implementation. Deployments, paid calls and live activation stay
behind scope C at checkpoint 12; no preliminary tunnel or checkpoint 10 UI work.

#### Delivered foundation and current evidence

This is the current local checkpoint summary. Superseded slice counts, intermediate
pending claims and detailed debugging chronology remain in Git history; they are not
additional work or evidence for a later state. The sequential table above owns status.

| Accepted behavior | Delivered boundary and observable local evidence |
| --- | --- |
| Manager-only application access | Sixteen v2 capabilities in `mcp-tools-v2.ts`, fresh owned Run capabilities, per-operation bounded schemas, server-selected suite/publication/Reviewer identity and module admission. Specialists receive no private Run context or app tools. |
| Durable state and exact text | `repository-v2.ts`, `read-v2.ts` and existing transfers enforce atomic fences/version checks, immutable writes, exact replay receipts, complete hash-bound bodies, Unicode fragments and owned cursors. No lease spans provider or human waits. |
| Registration and guarded dispatch | `work-v2.ts` binds the thirteen creative operations, six assessment modes and image preparation/generation to exact sources, targets, funding and retained requests. Registration alone grants no dispatch authority. Preparation and generation have distinct call IDs; generation consumes the exact retained preparation. |
| Observation and accounting | `observations-v2.ts` retains matching complete/partial child envelopes and execution identities, including after cancellation. `usage-v2.ts` separates reported, estimated and unknown cost without another ledger or parent/child double counting. Truncated/unrelated model output cannot grant authority. |
| Original images | Existing private media storage verifies ordered native files, permitted download sources, size/hash/ownership and per-kind canvas. Successful originals are retained independently of failed siblings; attachment/save replay creates no second generation. JSON identifiers never substitute for image bytes. |
| Assessments and quality | Current-publication Reviewer identity, exact retained proposals, immutable source/target hashes and correction-finding lineage are checked. All six modes, before/after revisions and batch item scopes have local coverage. Manager owns creative acceptance, quality usage and human policy. |
| Human response and completion | Native decision identities correlate to authentic first-wins responses. Explicit Manager acceptance selects candidates; completion checks the selected manifest, current accepted dependency graph, locks, originals and unresolved paid liability. Replay uses the saved completion receipt rather than another creative call. |
| Bounded recovery | `retry-v2.ts` and `reconcile-v2.ts` reuse existing worker hooks. Durable action allowances, eligibility/backoff, one journaled explicit extra retry grant, technical `retry-wait`, bounded leased readback and verified-terminal continuation preserve successful work and consumption. Unknown outcomes grant no redispatch. |
| Revision and reuse | Existing quote/allocation journals enforce one consent/charge and scope locks. Purchased revision starts a new logical Run on the same production. Selected predecessor candidates copy exact bodies/original attachments with local dependency identities; unchanged compatible body-review provenance may survive, but whole-book review is fresh. Imported-image context revalidation preserves original pixels. |
| Product and configuration admission | The project registry contributes booklet product schema 1 using existing creative fields; content contract 2 is independent. Invalid package fields, disabled modules, mismatched suite bindings and duplicate matching policy rows are rejected. No catalog seed or administration UI is added in 09. |
| Regression protection | Strict v1 readers, lifecycle/media, generic Run/AI behavior and unrelated project hooks remain covered. Shared core changes originate in reviewed Unibase imports, not local copied-core patches. |

The connected five-page fixture uses actual lifecycle, admission and MCP handlers with
isolated native Code nodes for all seven roles. It creates the style original and every
page artifact, completes two whole-book windows, resumes after verified termination
without another purchase, buys one five-credit fixture page revision and preserves the
other pages. A second production reuses the selected predecessor DAG/originals and runs
fresh whole-book review without fabricated creative producer work. It also covers
rejected foreign sources, altered copied bodies/assets and incompatible canvas/layout.
The separate large Unicode composition journey and partial-result, human, correction
and immutable-publication fixtures remain necessary coverage.

Checkout terms, native provider starts/termination, specialist replies and pixels are
synthetic. These fixtures execute real application boundaries and essential inline
logic; they do not recreate the Dify graph engine or establish creative quality. Older
structural tests that stage metadata are labelled separately from connected journeys.

The current candidate identity and check totals are in the
[candidate README](workflow-package/README.md#current-integration-slice). Final affected
checks and two same-state checkpoint review passes passed in 09.7, as recorded below.
The final review found missing product registration and checked policy uniqueness;
the existing unique policy index already prevents ambiguity, so the proposed extra
lookup was removed and a regression asserts that guarantee. Product registration
introduces no schema or model change.
Model JSON and both diagrams therefore remain applicable to these fixes.

#### 09.7 exit evidence

Checkpoint 09 closure follow-up is verified locally; its fresh evidence and
checkpoint 10 prerequisite report are recorded below. Earlier identities remain historical.

Verified locally on 2026-11-12. Initial exit checks pass: 32 MCP, 33 repository, 17
lifecycle/media, 46 compatibility, 31 commerce and 58 generic Run/AI/Dify/MCP tests;
production build and worker bundle; post-build typecheck; scoped ESLint; environment,
model generation, docs/i18n/skills checks; workflow/fixture/digest and disabled-gate audit;
`git diff --check`. Handbook readiness exits successfully with pre-existing advisory
tracking/preferences warnings; no tracking or project configuration was changed.

Two consecutive clean **same-agent cold-review fallback** passes cover the whole
package against `713da2d`: first ownership/funding/persistence/recovery and requirement
coverage; second graph/bindings, compatibility, necessity/scope, evidence and the 10 plan.
No blocking findings were identified in those passes. These are separate passes, not independent-agent reviews.
Their identical 86-file pre-evidence-update content hash is
`86ab530b3460461f19ec7468867240c84d371bf7d7b5f083a0a78ca5dc247c4b`.
Compute it by sorting the baseline diff's repository-relative paths, concatenating each
path + NUL + SHA-256 of its bytes + LF, then hashing the concatenation. This progress
record changes documentation metadata after review; runtime/workflows/planned behavior
are unchanged. The corresponding non-doc source/test/import identity is
`49b1d25bcf273ca63c885fcabba62ba8452bf7c26b45fac6527ee608344475c3`
(same algorithm, excluding `docs/` and `CHANGELOG.md`). Eighteen shared runtime/project
slot files match exact imported commit blobs. The 13-path candidate digest remains in
README; it intentionally does not cover application code or these progress records.

Review fixes: add the missing existing product-type registration; prove policy uniqueness
through the existing index rather than another lookup; cover both failed and successful
Manager termination in the connected continuation journey; remove superseded slice
chronology and stale pending claims; sequence 10 configuration parsing before its editor.
No new framework, dependency, plugin, application UI or live operation was added.
Model field/relationship definitions, JSON example and both diagrams are unaffected by
these final registration/evidence changes. The completed local goal stops before 10.

Follow-up correction (2026-11-12): character/location `reference` image artifacts now
use the existing reference funding and stage-lock classification, like their image
specifications. Previously an authorized reference revision could be rejected as story
work. A regression reproduced the failure before the one-line fix and now verifies both
subject kinds, wrong-subject funding rejection, locked-stage rejection and permitted
dispatch. All 34 repository and 32 MCP tests, build, post-build typecheck, scoped ESLint
and docs/i18n/skills checks pass. Two separate same-agent read-only passes of this
bounded correction found no remaining blocker. The whole-package review hashes above
are historical identities preceding this correction, not hashes of the current tree.
No model fields, persistence shape, JSON example, schema diagrams, workflow YAML or
candidate digest changed; checkpoint 10 remains unimplemented.

#### Accepted amendments and remaining evidence

- Page Composer `compose` consumes the retained layout rather than requiring a second
  manuscript copy; exact manuscript content is already bound during pagination.
- The private Manager Start uses existing Run `context`, bound to MCP `runContext`.
  Stored child identities and the server-owned policy row supply suite/Reviewer facts.
- Technical retries wait in the existing native application-owned Human Input node;
  the existing worker resumes the call-bound form only when eligible. Creator questions
  are separate. No automatic successor or second scheduler is introduced.
- Provider error alone is not safe-rejection evidence. Accepted hidden SDK attempts,
  incomplete billing, default timeout and alias drift remain labelled limitations.
  Missing locators, expired readback budgets/deadlines or unresolved outcomes remain
  unknown; no expanded provider control is required to progress.
- Generic Run restart accepts only terminated failed/cancelled attempts. A customer
  revision after successful completion therefore starts a new logical Run. A later
  product continuation after a successful Manager stop also uses a new execution,
  preserving production state; never weaken shared restart rules to reuse a Run ID.
- Source reuse follows only an owned current/direct predecessor production and exact
  verified lineage. New current candidates must be explicitly selected; historical
  acceptance does not satisfy current whole-book coverage.

All execution gates remain disabled. Actual revised Dify imports/publications, nested
runtime execution, retry-form resume, Manager/application MCP image conversion,
configured commercial packages and paid acceptance are checkpoint 12 evidence.
Creator controls and public history are checkpoint 10; saving history is not its UI.
The active goal stops before implementing 10. No deployment or paid call occurred.

### Checkpoint 09 closure follow-up and checkpoint 10 prerequisites

Closure follow-up on 2026-11-12, branch `feature/10-dify-workflow-design`,
HEAD `554ec9d51004264d2e9e8f7b874485dfb414fda7` plus the preserved working tree.

| Task | State | Evidence |
| --- | --- | --- |
| 09-F1 baseline | Verified | Existing changes preserved; relevant worker/provider/commerce boundaries match reviewed Unibase import. Unresolved replay regression failed before the correction. |
| 09-F2 dispatch locks | Verified | Existing transaction sets first story/style/reference locks according to generated subject kind. Repository cases cover style, character, location and page, replay, locked quotes and retained locks after failed/unknown outcomes. |
| 09-F3 unresolved targets | Verified | Existing work lookup rejects overlapping paid creative attempts across funding/Run/service scopes, preserving funding-scoped correction accounting. Both unknown and dispatching states reject atomically. |
| 09-F4 verification | Verified | 38 repository, 32 MCP, 17 lifecycle/media and 46 compatibility tests pass. Build, sequential typecheck, scoped lint and docs/model/i18n/skills checks pass. Two separate same-agent focused read-only passes found no blocking issue. |
| 09-F5 readiness handoff | Verified | Prerequisite inventory below; checkpoint 10 remains unimplemented. |

A necessary adjacent correction projects lock timestamps as ISO strings in the
existing production reader. Populated locks exposed two JSON-read failures in the
MCP suite; no new wire fields or persistence shapes were introduced. Model fields,
JSON example and both diagrams remain applicable. Seven workflow hashes still match
the manifest; YAML, provider bindings and disabled execution gates are unchanged.
No Unibase changes, imports, dependencies, migration, UI, deployment or paid call.

#### Checkpoint 10 prerequisite report

| Category | Finding / next action | Owner and automation |
| --- | --- | --- |
| Local foundations | Prepaid admission, lifecycle/recovery, owned history/media, authentic decisions and existing Run start/detail project slots are available. | Unitale; reusable locally |
| Remaining pre-10 work | None identified after the final connected MCP regression and focused review pair. | No manual setup needed |
| Work belonging to 10 | Execute 10.1 facade, then 10.2-10.7 in their existing order. Configuration parsing/defaults belong to 10.1; only retry-default editing follows in 10.6, while capacity stays bound to its immutable profile revision. | Unitale; unattended local implementation under B |
| User decisions/manual inputs before local 10 | None identified. Scope B is approved. A subsequent instruction starts 10; this task stops before it. | User starts next task |
| Later evidence | Broader local integration in 11; live publication/bindings, MCP image conversion and paid acceptance in 12. | Implementer, then operator under C |
| Later manual gate | Scope C, exact release/configuration, credentials, test package/account and finite spending approval remain deferred. The selected US$3 ceiling grants no current spending. | User/operator at 12 |

**Historical readiness at the 2026-11-12 source state:** ready to start checkpoint 10 locally. No prerequisite user decision or manual
setup remains identified. The next task is **10.1 Private application facade** after
a subsequent start instruction. No additional pre-10 interface, configuration field
or shared-runtime change is proposed.

Reviewed correction identities (SHA-256, source/test bytes):
- `repository-v2.ts`: `d0824174d67db0db05d7bebc0e7279a50fb6a990f9c55b2940a1f480b463f678`
- `read-v2.ts`: `42c07b7259f4265376495549e0303960eda10d888baf4ed1cadf2da8e6b7a9e4`
- `booklet-repositories.test.ts`: `7f6544f81ca3c91910f223db633d0731fcc1ddaf18103925dc35275566ad0852`
- `booklet-mcp.test.ts`: `dc7390f5343ec1643ca2fea73e45871ab838a3c46510cd44a5b63f4e69c720f6`

These focused passes cover the correction and its integration tests, not a fresh
independent review of the entire historical package. Synthetic prior-work rows exercise
cross-funding protection; the connected journey separately proves actual purchased
revision and continuation. No live execution or exact hidden-provider retry count is claimed.

### 10 - Existing Run UI and complete T21

**Verified locally (2026-11-22).** See the per-task decisions and the
[checkpoint 10 closure](#checkpoint-10-closure-2026-11-22) below. Scope B is already approved; routine local implementation needs
no repeated approval. Live inputs/actions stay grouped in 12. Default Unibase work:
none. Reuse the imported project slots, domain picker and existing decision UI. Do not
edit copied shared core or add a standalone workspace/listing page, scheduler or plugin.

#### Refreshed baseline and design handoff (2026-11-21)

The design-reference refresh changes planning only. No model/schema/persistence, JSON example,
Mermaid diagram, workflow, application or configuration change is made.

Issue branch refresh `dfa8d30` incorporates Unitale main `99cb6b5` and its Unibase
0.5.0 candidate import `2c13d814c02f512edd9acbd3a27a41f530b0aec5`.
`project.source.json` owns the current import identity; earlier 0.4.0 identities above
remain historical checkpoint evidence. Shared booklet runtime seams and project slots
are preserved. Handbook for this refresh is `c1b6166437ba729b59723a7dd4066c78e2f15185`.

The interrupted merge checks are superseded by the verified local-popup adoption
below: production build, subsequent typecheck and full lint now pass on the refreshed
issue branch. No checkpoint 10 implementation was started. Earlier checkpoint 09
results remain historical evidence, not a substitute for these current checks.

Use the adopted [design system](../../design-system.md),
[project extension guide](../../design-system-extension.md) and local
[build-ui skill](../../../.agents/skills/build-ui/SKILL.md).
The additional [Unitale handoff](https://github.com/Uniwares-LTD/unitale-design/blob/c95973a138947e1ce9da7165bd562a08643ba2a2/docs/design-system/projects/unitale/README.md)
is pinned to `c95973a138947e1ce9da7165bd562a08643ba2a2`; its product layer is marked
proposed/not accepted. Its specimens are reference HTML/local demonstration state,
not a React API, backend capability or replacement product contract. The IDE's
`docs/features/design-handoff/unibase-prd.md` is absent from this checkout and is not
an executable source for this revision. Replace this reference only after the actual
package is identified and reconciled, rather than inferring missing requirements.

| Remaining task | Apply now within accepted scope | Keep outside this implementation |
| --- | --- | --- |
| 10.1 facade | Existing product ownership, catalog/quote journals, durable action state and allowlisted DTOs stay authoritative. | No specimen localStorage persistence, new conversation protocol or inferred commercial defaults. |
| 10.2 start/consent | Compose existing Field/help/error, SubmitButton and paid confirmation. Retain entered data on failure/unknown outcome and focus the first invalid field. | No hardcoded welcome credits, first-book free access, fixed style catalog or mandatory prototype stage sequence. |
| 10.3 progress/decisions/media | Existing Run controls, semantic StatusBadge/Notice, ResultImage fallback and enlarged owned-original view with clear close/focus restoration. Preserve decision drafts; do not force-scroll history. Show actual activity without invented percent/ETA. | No replacement chat workspace, voice/photo capture, transcription, mascot engine or timed prose-reveal controller. |
| 10.4 recovery/revisions | Existing target-scoped controls retain successful output until replacement; retain unsent feedback for its target, warn before discarding it, and distinguish retry from continuation. | No automatic retry of an unknown paid operation, mandatory human approval or restarting an entire workflow. |
| 10.5 history / 10.6 admin | Existing owned paginated history and English/LTR admin; shared empty/loading/error helpers and meaningful dirty-form leave guard. | No new Library/storefront, public reader/PDF/share/Explore surface or operations dashboard. |
| 10.7 / 11 verification | Test these real states and services; specimen animations/storage never establish successful save, approval, billing or completion. | No migration of the static specimen controllers into production. |

The [handoff decisions](https://github.com/Uniwares-LTD/unitale-design/blob/c95973a138947e1ce9da7165bd562a08643ba2a2/docs/design-system/projects/unitale/decisions.md)
confirm that the journey is representative: Manager chooses when to request human input.
Keep public en/ar and authenticated native Run responses despite the design package's
English-only examples. Use one existing response control per active decision; preserve
its draft until acknowledgement, never add another feedback field for that decision.
Target-specific revision feedback remains tied to its own quoted request and financial consent.

The original planning-only restriction on brand activation is superseded by the user's
2026-11-22 explicit pre-10 theme adoption request. Unitale now enables the existing
project theme extension, with handoff colours/type roles and self-hosted licensed fonts.
See [the adoption and component inventory](../../design-system-extension.md#unitale-adoption-before-checkpoint-10).
Unibase shared components remain unchanged. This authorizes theme assets only, not
specimen controllers, new dependencies, CSP changes or checkpoint 10 behavior.
Optional welcome access, attachments/voice and later reader/PDF/sharing remain separately
scoped work; their absence does not block the accepted T21 Run integration.

#### Pre-checkpoint 10 local setup

Added by user instruction on 2026-11-21; do this before 10 implementation.
Use the existing app and setup tools, not a new bootstrap framework.

| Step | Status | Outcome / verification |
| --- | --- | --- |
| Local environment inspection | Verified | Default configuration validates. Existing Base app/auth/MongoDB services are preserved. Unitale dev server starts on loopback port 3100; this is startup evidence, not connected database/auth acceptance. |
| Shared development/staging identity | Verified configuration | User confirmed real shared staging Firebase locally. Use `uniwares-base`, Unitale web registration `unitale-staging`, app ID `1:870391561828:web:ad66111854ba5233882971`, and `unitale_staging` for dev/staging. No demo auth or fixture simulation on shared data. |
| Database provisioning | Verified | Created `unitale_staging` runtime user with only readWrite on `unitale_staging`, scoped to existing `kids-booklet` cluster in Atlas project `6a869d84e65675f845fa22eb`. Ping and transaction capability pass. No new cluster or network rule. Credentials retained outside Git. |
| Local bindings and preparation | Verified | Ignored user-only `.env.local` selects APP_ENV local, https://localhost:3100, real Firebase, scoped Atlas DB and disabled payments/Dify/MCP/persona execution. Additive indexes pass; 3 earlier migration records retained and 7 remaining migrations applied successfully. Runtime secrets are outside Git. |
| As-is local acceptance | Verified sign-in | The preserved HTTPS local app serves Account. On 2026-11-21 the user completed real Google popup sign-in and confirmed the Unitale account; the session endpoint returned 200. This does not establish owned Run, administrator or provider acceptance; checkpoint 10 remains unimplemented. |
| Unitale theme and component readiness | Verified locally, 2026-11-22 | Unibase foundation/helpers already adopted; project-owned light/dark tokens, fonts and type roles now enabled. Build, typecheck, 133 unit tests, contrast and public browser checks pass. [Inventory and verification limits](../../design-system-extension.md#unitale-adoption-before-checkpoint-10). No checkpoint 10 behavior implemented. |

Shared database means local and staging writes affect the same Unitale records.
Use the same authentication project and compatible encryption configuration when both
runtimes are connected. Never run destructive/disposable test suites against the shared
database; those suites keep their isolated fixtures. Local startup does not deploy staging
or authorize scope C. Missing access, identity or capability blocks only its dependent step.
Local DNS SRV lookup timed out on fresh Atlas connections. The local ignored environment
uses the Atlas-provided standard TLS/replica-set URI; the protected staging SRV record
is retained. No system DNS, Atlas network rule or application code was changed.
Post-restart Turbopack requests exceeded the probe deadline while Next reported slow
filesystem compilation. A supported webpack CLI fallback was tried but fails because
instrumentation pulls Node MongoDB modules into the Edge bundle (`net` unresolved).
Default Turbopack launch is retained; no dependency or source fix was attempted.
After returning to default Turbopack, the latest restart returns 200/ready with the
standard Atlas URI. Latest home also returns 200 with title Unitale; real-user journeys remain pending. The failed webpack
fallback remains a known local startup limitation, not a successful alternate launch.

The existing migration lease is respected after interruption; never force-clear it or
infer success from an index-preparation message. Confirm the final migration report.

Use the [documented local launch](../../../README.md#unitale-local-app-with-shared-staging-data)
with the complete private environment. The generic npm dev wrapper injects emulator
defaults, so use the direct existing Next CLI. The approved local CA and its private
files remain preserved. HTTPS remains supported; the hosted popup removes the local
HTTPS/OAuth-callback requirement. No shared provider configuration is changed.

#### Pre-10 readiness closeout (2026-11-22)

**Ready to start checkpoint 10 locally after a subsequent instruction.** No new
user decision or manual action is required first. This closeout stops before 10.1.
Source: Unitale `6b775cf9df16f5f66ca7d7a5d74a57fcd142b4de` on
`feature/10-dify-workflow-design`; Unibase import remains
`02517797c9ecd1d8e9696cd1b68c9b976f2105db`. Handbook baseline remains
`c1b6166437ba729b59723a7dd4066c78e2f15185`.

| Pre-10 item | Disposition and evidence |
| --- | --- |
| Design foundation and Unitale brand | Complete: imported Unibase helpers and project-owned theme/fonts are committed in `6b775cf`; component inventory identifies no missing shared primitive. |
| Authenticated theme evidence | Closed using the existing `--owned-auth --browser --raw-responses --ai` fixture: 20/20 production-browser checks pass across 1440px/390px and light/dark. Admin and settings are English/LTR; returning to public Preferences restores Arabic/RTL without changing the saved preference. Native Run decisions render in en/ar with no body overflow or page errors. Mobile admin and Arabic Run captures were visually reviewed. |
| Safe local operation | HTTPS liveness on port 3100 returned 200. The documented direct Next launch remains the supported shared-staging setup; generic wrapper/emulator-default and webpack limitations remain documented, with a verified launch path; no shared-core patch is needed before 10. |
| Plan/source consistency | Resume prompt now uses the current manifest import. The immutable profile capacity is validated in 10.1; only retry defaults receive the minimal editor in 10.6. Existing product decisions and scope are preserved. |
| Later evidence and approvals | Booklet-specific facade/media/recovery/history/admin behavior belongs to 10, broader integration to 11, and application-connected Dify/MCP image and paid acceptance to 12 under pending scope C. These are not pre-10 blockers. |

The fixture used its own ephemeral Auth Emulator, MongoDB replica set, synthetic
admin and fake-provider Runs. It made no shared-staging data or access changes and
no external provider calls. Its generic Run checks establish reusable UI readiness,
not completed booklet journeys or durable recovery acceptance. Disposable services
and session state were cleaned up; the HTTPS developer app remains intact.

No application, shared-runtime, schema, model, workflow, provider, dependency or
execution-gate change was needed. Model guide/JSON/Mermaid remain unaffected.
Existing build/typecheck/unit/theme evidence remains applicable to unchanged code;
this closeout adds authenticated evidence, 46/46 workflow compatibility tests
(including unchanged hash/gate checks), docs/i18n/skills checks, a clean whitespace
check and two consecutive same-agent read-only documentation/evidence reviews. The first next task remains
**10.1 Private application facade**.

#### Local Google popup adoption

The initial standalone setup task imported Unibase main
`899785b93b7f6d0ebe02c62dbdd3ac80f27fe6a5` through `template:update` on the issue
branch (Unitale PR #14). That route is historical. The current import is exact
`02517797c9ecd1d8e9696cd1b68c9b976f2105db`, received by normal merge from Unitale
`main` after [PR #15](https://github.com/Uniwares-LTD/unitale/pull/15), main revision
`528d0a1cf340bad28369bc467776492f2ade6b12`. The [project adoption guide](../local-google-popup/adoption.md)
owns current setup and route; the evidence below describes the original runtime adoption. Unibase [PR #64](https://github.com/Uniwares-LTD/unibase/pull/64) contains
reviewed commit `c18d8b13f002afaefa8e567606f85438ca23c555`, tree
`9d55ef9502288e4293a184998b19c87cf02bcba1`; its two consecutive same-agent reviews
and verification are upstream evidence, not Unitale acceptance.

The import preserves project identity, deployment bindings, Booklet hooks and existing
setup/planning work. The only runtime delta selects the hosted Google popup for local
real Firebase and admits its exact validated helper origin in local `frame-src`.
The existing session exchange and emulator/staging/production redirects are retained.
Unitale verification passes: 133 unit/template tests; 46 compatibility, 38 repository,
17 lifecycle/media and 32 MCP tests; 10 owned-auth integration tests plus bundled
worker/readiness checks; production build, subsequent typecheck, full lint,
model/docs/i18n/skills/template/samples and Handbook readiness. One initial combined
Booklet run had a five-second Python subprocess timeout; the unchanged MCP-only
rerun passes all 32 tests with the existing deadline. No source or timeout workaround
was introduced. Lint retains the upstream CLI test function's advisory expression warning.

The adopted real form passes popup activation, duplicate/cancel/block/error handling,
fresh-token CSRF/session exchange, appearance/return path, verified-user/stale-state
guards and redirect recovery/initiation. EN/AR feedback/focus passes all 24
preset/theme/width combinations, reduced motion and 200% zoom. An isolated production
Unitale app reaches Google's ordinary sign-in page from plain localhost HTTP through
the hosted helper, with quiet recovery on close. The final local app retains its
existing HTTPS origin and approved CA; the private environment and TLS files are unchanged.

On 2026-11-21 the user completed real Google sign-in at `https://localhost:3100/account`
and confirmed that Unitale shows the signed-in account. This is real-account acceptance,
separate from fixture and provider-page evidence. Two consecutive same-agent read-only
reviews of the complete adoption are required before push; evidence accompanies the
adoption commit and issue #10 update. No dependency, migration, provider edit, paid call,
deployment or checkpoint 10 implementation is included. Booklet model/persistence,
JSON example and both Mermaid schema versions are unaffected.

#### Fixed scope and sequence

| Task | State | Smallest change and exit evidence |
| --- | --- | --- |
| 10.1 Private application facade | Verified locally (2026-11-22; see 10.1 facade decisions) | Define/validate the existing policy row's capacity and retry-default fields here (only retry-default editing follows in 10.6; capacity stays bound to its immutable profile revision); adapt delivered services into owned public DTOs and bounded quote/start/revision/recovery commands. Tests prove changed-key rejection, fresh ownership/module admission and resumption after each committed financial/admission effect. |
| 10.2 Package and financial consent | Verified locally (2026-11-22; see 10.2 decisions) | Use `ProjectRunStart` on `/runs/new` for package, brief, audience/preferences, quote and explicit consent. Also replace the generic home through the existing `projectHome` hook (`src/project/home.tsx`; no Unibase or core change): signed out, Sign in returning to `/runs/new`; signed in, **Create a book** (`/runs/new`) and **Continue your books** (`/runs`) plus the existing account/appearance cards; booklet copy; links only. Published package snapshots and changed-price/input tests pass; no production seeds. |
| 10.3 Progress, decisions and originals | Verified locally (2026-11-22; see 10.3 decisions) | Use `ProjectRunDetail` for booklet target data, saved progress, selected results and owned original URLs. Keep authentic decisions in existing Run UI. Unauthorized/media-leak and partial/unknown-state tests pass. |
| 10.4 Revision and recovery controls | Verified locally (2026-11-22; see 10.4 decisions) | Add target-scoped revision quote/consent, Retry failed step, Continue booklet and existing Stop. Double-click/reload and terminal-state tests prove no successful-work replay, duplicate charge or dispatch during uncertainty. |
| 10.5 Accessible history | Verified locally (2026-11-22; see 10.5 decisions) | Add owner-bound paginated production, artifact revision, decision and execution history inside existing Run surfaces; show current/selected versus historical state. Test more than one page and foreign/malformed cursors. |
| 10.6 Minimal administration | Verified locally (2026-11-22; see 10.6 decisions) | Reuse the admin shell for three action-retry defaults and sanitized evidence. New productions snapshot defaults; existing productions keep theirs. Admin authentication, validation/conflict and language isolation tests pass. |
| 10.7 Verification and handoff | Verified locally (2026-11-22; see checkpoint 10 closure) | Run affected service/UI checks, desktop/390px en/ar browser journeys, English/LTR admin with Arabic public preference and restoration, keyboard and served-document CSP checks. Two clean same-state read-only reviews; update evidence and remaining 11/12 steps. |

#### 10.1 facade decisions (2026-11-22)

- `src/lib/server/booklets/application.ts` (`server-only`) adapts delivered services; the
  client-safe `src/project/booklets/application-contract.ts` holds only strict
  schemaVersion-1 commands and DTOs. Routes and the `module.routes` entry land with
  their consuming slices (10.2-10.4); 10.1 is the service boundary.
- Configuration is resolved, never inferred: exactly one enabled, validated booklet v2
  orchestrator at its current revision must have a `bookletWorkflowPolicies` row for
  the frozen profile, carrying valid `capacity` and `retryDefaults`. Otherwise the
  package is shown as unavailable and cannot be quoted or started. Older rows for
  earlier configuration revisions keep serving in-flight Runs.
- Start uses one browser key: owned book, then the queued order (its admission validates
  ownership, accepted credits, capacity and brief), then the v2 production (snapshots
  `retryDefaults`), the existing paid start, and the zero-credit Run. Booklet/production
  IDs derive from the key, so each committed effect resumes; an existing Run returns
  first, so a later orchestrator upgrade cannot break exact replay. Changed title, brief,
  price or catalog revision conflicts and needs a fresh quote and consent. A first
  attempt validates quote, price and brief before creating the book (refusals leave no
  empty booklet), configuration mirrors Run admission (native `raw-v1`, no legacy or
  required browser inputs) and disabled Runs refuse before the paid start.
- Continue chains a verified failed/cancelled predecessor, starts a fresh logical Run
  after verified success and refuses active or uncertain work. Retry authorizes the
  existing single extra grant and continues only after verified termination; otherwise
  the active Manager resumes from its own wait. Revision commands bind scope only
  (category and subjects); creative instructions stay with Manager's authentic Run
  decisions, so no new persistence is added.
- Catalog terms have no package label, so the package DTO describes size, languages,
  allowances and price; no package name or profile/execution identity is exposed.
- Evidence: `test:booklet-application` 7/7 (package allowlist and owner-bound cursors;
  exact replay with one charge; consent/price/catalog/brief refusal without an empty
  booklet; resume after queued order, after production creation and after the paid
  start; absent/duplicate/mismatched/stale/non-native policy rejection; foreign
  ownership, predecessor chaining, fresh logical continuation, revision consent and
  replay). Also `test:booklet-mcp` 32/32, `test:booklet-compat` 46/46,
  `test:booklet-lifecycle-media` 17/17, `test:booklet-repositories` 38/38,
  `test:commerce` 31/31, unit 133/133, typecheck, scoped ESLint/Prettier and
  `check:docs`. Python suites need `BOOKLET_PYTHON` where `python3` resolves to the
  Windows Store alias. Not yet covered: an authorized retry of a real failed work row
  (exercised by existing MCP retry tests), and route/UI use (10.2-10.4). Two separate
  same-agent read-only passes; the first found two Medium defects (charge before
  predictable Run refusal; empty booklet on refused first start), both fixed and retested.

#### 10.2 start and consent decisions (2026-11-22)

- `/api/booklets` (registered as a booklets module route, so the module guard applies):
  GET returns picker rows `{rows:[{id,title}],next}` (owned live books with a current
  production, escaped title search, owner/search-scoped cursors) or, with
  `section=packages`, allowlisted package summaries; POST takes `quote`/`start`, with a
  verified session and existing CSRF/origin/rate-limit checks.
- `ProjectRunStart` composes **Create a book** above the unchanged generic landing and
  omits booklet orchestrators from it (generic admission always refuses them). Flow:
  form, inline validation with first-invalid focus, **Review price** (quote), an
  `AlertDialog` naming the exact credits, then start and navigation to the Run. Any edit
  after a quote clears it. One key per confirmed request; known pre-charge refusals
  unlock editing; transport/unknown outcomes and `BOOKLET_START_PENDING` keep the exact
  request locked for a same-key retry. A leave guard protects typed work.
- `BOOKLET_START_PENDING`: once charged, a Run-admission refusal is reported with this
  code so the browser never edits into a new key (a second booklet and charge). A first
  attempt also checks available credits before creating the book, so an underfunded
  attempt leaves no draft.
- Homepage through `projectHome`: booklet copy; signed out, Sign in returning to
  `/runs/new`; signed in, Create a book and Continue your books plus the existing
  account/appearance cards; links only.
- Evidence: `test:booklet-application` 7/7 (adds picker ownership/search/cursor and
  START_PENDING cases); production build then typecheck; lint (0 errors; the browser
  script carries the same advisory expression warning as the existing auth-form
  script); `check:i18n`, `check:docs`. Browser: `tests/integration/booklet-browser-checks.js`
  against the owned fixture seeded by `tests/integration/booklet-fixture-seed.ts`
  passes: signed-out return path; home and start in en/ar at 1440px/390px with correct
  direction and no horizontal overflow; unavailable package disabled; first-invalid
  focus; quote; consent cancel sends nothing; confirm sends exactly one start and opens
  the Run; edits clear a quote; leaving a dirty form raises the browser warning.
  Captures were reviewed. Dark mode, keyboard-only traversal, 200% zoom, reduced motion
  and served-document CSP remain for the 10.7 matrix.

#### 10.3 progress and originals decisions (2026-11-22)

- `view(productionId)` (`GET /api/booklets/[productionId]`, verified session) is an
  allowlisted projection: book title, lifecycle state, version, expiry, completion,
  predecessor ID, stage locks, page progress (accepted page images of story pages plus
  cover) and per-subject artifact status (`not-started`, `in-progress`, `selected`). Only
  accepted revisions are "selected"; a current draft is never shown as a result. Images
  are owned URLs of accepted revisions; brief, prompts, work, checkpoints, evidence and
  audit data are not returned. Text artifacts show status, not content (Manager presents
  content through authentic Run decisions).
- `GET /api/booklets/[productionId]/assets/[assetId]` serves original bytes through
  `bookletMedia.read` (fresh ownership, ready state, verified predecessor attachment),
  with an allowlisted image MIME, `private, no-store`, `nosniff` and inline disposition.
  Booklet IDs are never sent to generic Run asset routes.
- `ProjectRunDetail` renders the booklet panel only for `booklet@2` targets, refreshing
  when the polled Run changes; other Runs are unchanged. `reconciling`/`needs-review`
  Runs show that saved work is kept and nothing is repeated or recharged while the
  outcome is confirmed. Decisions stay in the existing first-wins Run controls.
- Facade construction for routes is `src/lib/server/booklets/application-request.ts`.
- Evidence: `test:booklet-application` 8/8 (adds allowlisted view, selected versus
  draft, partial progress, stranger/other-production/staging/missing media refusals);
  build then typecheck; scoped lint; `check:i18n`. Browser: the Run page shows the
  panel with title, state, `0 of 5 pages selected`, stage states and the empty saved
  state; an unowned asset URL returns 404. Captured and reviewed.

#### 10.4 recovery and revision decisions (2026-11-22)

- `POST /api/booklets/[productionId]` serves `quote-revision`, `start-revision`, `retry`
  and `continue` (strict schema, verified session, CSRF/origin, fresh ownership).
- The view adds advisory `actions` (commands stay authoritative): `running`; `continue`
  only for an unfinished, unexpired production whose latest Run is verified terminal;
  `retry` for the newest failed retriable call of its action after its automatic
  allowance (`authorizeRetry` still checks correction roots and entitlement); and
  `revisions` only when no Run is active, from the order's allowances minus order and
  stage locks, with eligible subjects (style requires every style sample).
- The panel's **Next steps**: Retry failed step, Continue booklet, and Request changes
  (category, subjects, quote, an `AlertDialog` naming the credits or the included
  revision, then start). A new logical Run opens on its own page; the same Run refreshes.
  Uncertain outcomes keep the exact command for a same-key Check again; known refusals
  show a Notice and re-read eligibility. While a Run is active the panel explains the
  existing **Cancel run**: accepted work is kept and cancelling is not a refund. No
  second cancellation path exists.
- Evidence: `test:booklet-application` 9/9 (adds active-Run eligibility, retry
  eligibility, two concurrent Continue clicks admitting exactly one attempt with one
  charge, revision exact replay, a second revision refused during an active Run with no
  extra charge, and a completed production refusing Continue). Build then typecheck,
  scoped lint, `check:i18n`. Browser: next steps follow server eligibility on an active
  Run (guidance shown; no revision form). Clicking Continue/Retry/revision in a browser
  against seeded terminal states is part of the 10.7 matrix.
- Local note: account suites stop MongoDB memory-server processes during forced
  cleanup; do not run them while a browser fixture is running.

#### 10.5 history decisions (2026-11-22)

- `history(productionId, {kind, artifactId?, cursor?})` (`GET
  /api/booklets/[productionId]?section=history&kind=…`) wraps the delivered bounded
  readers and their owner/production/query-scoped cursors (a changed history
  invalidates them; the UI offers Start again). Allowlisted items only:
  `runs` (logical Run ID, public status active/confirming/succeeded/failed/cancelled,
  time; no native/provider IDs), `versions` (productions of this book, marked current or
  predecessor) and `revisions` (an artifact's revisions, marked selected, latest draft or
  earlier). Decision history stays in each Run page's existing decision history; the
  booklet history links every Run.
- Malformed path/query input (IDs, kind, cursor text, picker search) is a 404/400
  application error, never a 503; foreign cursors conflict.
- The panel's **History** uses native disclosures loaded on open (not on each poll),
  "Show more" pagination and localized result names.
- Evidence: `test:booklet-application` 10/10 (adds more than one page of runs and
  revisions, selected/current/historical flags, no native IDs, foreign and malformed
  cursors, invalid kind, stranger and invalid path). Build then typecheck, scoped lint,
  `check:i18n`. Browser: history lists this run and the current version; a malformed
  cursor returns 400.

#### 10.6 administration decisions (2026-11-22)

- `/admin/booklets` is added through `adminSections` (no shared settings change);
  `/api/admin/booklets` has an explicit booklets module guard because core `/admin` and
  `/api/admin` are not module routes. Both are English/LTR and use the existing admin
  shell and admin-checked access transactions (`src/lib/server/booklets/admin.ts`).
- The view lists up to 50 bindings with identity, current-configuration status, a
  read-only capacity summary, reviewer ID/revision (no publication ID, suite or provider
  data) and saved retry defaults; sanitized evidence lists the 20 most recent
  customer retry authorizations.
- Only `retryDefaults` (three integers 0-10) can be edited. The update matches the
  previously read values field by field (stale edits conflict with 409), writes a
  `booklet-retry-defaults-updated` audit event and preserves every other field. New
  productions snapshot the new defaults; existing productions keep theirs.
- Evidence: `test:booklet-application` 11/11 (adds non-admin refusal for read and
  update, out-of-range 400, stale 409, preserved suite/capacity, audit event, no leaked
  provider/publication data, and existing versus new production snapshots). Build then
  typecheck, scoped lint. Browser: admin is English/LTR with an Arabic public
  preference, focuses an invalid value, saves and confirms; returning to `/` restores
  Arabic/RTL. Captured and reviewed.

#### Checkpoint 10 review record (2026-11-22)

Separate same-agent read-only passes (cold-review fallback; no independent review is
claimed). Fixes reset the clean count.

| Pass | State | Scope | Result |
| --- | --- | --- | --- |
| 1 | pre-`97844a3` | Full checkpoint diff | Two defects (post-charge admission refusal not resumable by key; empty package page hiding later pages); fixed in `97844a3` and retested |
| A | `97844a3` | Facade, routes, admin module, start/actions UI read in full | Clean for code; informational: an editable refusal after the draft exists (Runs disabled, balance race) can leave an unpaid unstarted draft; advisory actions can be offered while an unbound committed flow exists (commands refuse safely); a malformed stored `retryDefaults` cannot be repaired from the UI; policy row IDs are assumed to be ObjectIds |
| B | `cf88bfe` | Exit criteria against evidence; docs against code | Two documentation defects (stale "Public application DTOs remain 10"; contract comment implying a `schemaVersion` field); fixed in `36f2c91`. Informational: module-disabled path and the `reconciling` notice are not browser-exercised |
| C | `36f2c91` | Client/server boundary, secrets, public-contract allowlist, route session/CSRF/module guards, stable keys | Clean |
| D | `36f2c91` | Recorded evidence against actual results and files; evidence currency | Clean |

Passes C and D are two consecutive clean reviews of the same state (`36f2c91`). Checks on
that state: full suites, build and checks on `cf88bfe` (code identical except one
comment) plus typecheck, lint, Prettier and `check:docs` on `36f2c91`; browser evidence
ran on a production build containing all code changes.

#### Checkpoint 10 closure (2026-11-22)

**Checkpoint 10 is verified locally** on `feature/10-dify-workflow-design`; T21's six
outcomes (package/brief, quote/consent, progress/results, authentic decisions, scoped
revisions, owned history) are delivered through existing Run surfaces. Not live
acceptance: no Dify graph, provider call, deployment or spending occurred.

- Review fixes at closure: a committed continuation/revision/start refused at Run
  admission (including a configuration lookup after the charge) is now reported as
  `BOOKLET_START_PENDING` everywhere, so only a same-key retry resumes it; the start form
  offers more packages when a page holds only non-booklet products.
- Checks after the last change: `test:booklet-application` 12/12 (adds pending
  continuation resumable only by key), `test:booklet-repositories` 38/38,
  `test:booklet-lifecycle-media` 17/17, `test:booklet-mcp` 32/32, `test:booklet-compat`
  46/46 (with `BOOKLET_PYTHON`), `test:commerce` 31/31, unit 133/133; typecheck, lint
  (0 errors; 5 advisory expression warnings in run-code browser scripts, one existing),
  `check:docs`, `check:i18n`, `check:skills`, `check:env`; production build then
  typecheck.
- Browser (production build, owned fixture seeded by `booklet-fixture-seed.ts`):
  `booklet-browser-checks.js` (signed-out return, home/start en/ar 1440/390 without
  overflow, validation focus, quote, consent, single start, Run panel, media 404,
  next steps, history, malformed cursor, admin English/LTR with Arabic restoration,
  leave warning); `booklet-browser-matrix.js` (dark mode with reduced motion en 1440 /
  ar 390, 200% zoom as 640/720px CSS viewports en/ar plus admin, keyboard order with
  visible focus, served-document CSP: an un-nonced inline script and style injected into
  the served HTML are refused with violations reported); after `seed … settle failed`,
  `booklet-browser-recovery.js` (Continue booklet chains attempt 2 with one request);
  after `settle succeeded`, `booklet-browser-revision.js` (included story revision with
  explicit consent opens a new Run). Captures reviewed. CSS-viewport zoom is not native
  zoom-control evidence; physical devices, screen readers and final visual acceptance
  remain pending.
- Reviews (separate same-agent read-only passes, cold-review fallback; no independent
  review is claimed): pass 1 over the full checkpoint diff found the two defects above
  (fixed and retested). A closure note at `97844a3` claimed two further clean passes
  that had not actually been run; this record corrects it. The final state was then
  reviewed by two consecutive passes recorded below in
  [checkpoint 10 review record](#checkpoint-10-review-record-2026-11-22).
- Remaining: **11** integrated local verification (actual YAML boundaries with real
  handlers, all six review modes, crash/lease/race matrices, Human Input continuation,
  preserved v1 and disabled-hook behavior); **12** grouped approvals and staging
  acceptance under pending scope C (US$3 ceiling is not spending authorization).

Implement in order; keep only one task In progress. Small affected checks per slice;
checkpoint-wide reviews follow 10.7. No percentage or line count substitutes for exits.
For each slice report the task, required behavior, existing primitive/service used,
actual checks and remaining gaps. No new public API is authorized by the design reference.

#### Application boundary and financial ordering

Keep server orchestration in a project-owned `src/lib/server/booklets/application.ts`
facade using existing actor, errors, module guards, commerce and booklet services.
Create a small client-safe contract file only for actual request/DTO boundaries;
never export private records. Reuse existing `endpoint` authentication, mutation-origin
checks and account limits. Server components call private modules directly.

Use `/api/booklets` GET for the existing domain picker (`{rows:[{id,title}],next}` with
search/cursor); a distinct bounded `section=packages` returns allowlisted published
booklet package summaries. POST accepts discriminated quote/start commands. Use
`/api/booklets/[productionId]` GET for public views/history and POST for revision/recovery
commands; each action has a strict schema, stable idempotency key and fresh ownership
check. Do not add an endpoint per internal service. Resolve user identity, configuration,
funding and native status on the server, never from browser claims.

A creation quote binds the selected published catalog ID/revision/hash, brief/input
hash and existing consent semantics. Reject changed terms/input and require fresh
consent. Start resumes this idempotent sequence:

1. Create/read the owned booklet and queue consumption using the existing order journal
   and a stable request key. The admission callback validates owned target and pinned
   fields; it must not create a v2 production before the order exists.
2. Create/read the v2 production against the committed frozen order and trusted profile
   capacity/retry defaults. If it already exists, verify the same owned input/order and
   reuse its stored snapshots; later admin edits cannot change an in-progress purchase.
3. Call the existing lifecycle start once, then enqueue the prepaid booklet Run with
   the exact stored orchestrator/configuration. The Run itself reserves no extra credits.
4. On interruption, resume the first incomplete committed effect under the same key;
   changed payloads conflict. Do not wrap provider calls in a transaction or create a
   parallel purchase journal. An unstarted queued order is not a paid generation.

Read published catalog heads/versions through the existing commerce model, filtering
booklet product type/schema and module eligibility. Return public fields and price;
never return provider bindings, credentials, policy rows or environment snapshots.
Keep v1 history readable through its existing readers; no automatic content migration.

#### Run views, decisions, recovery and history

Replace the project Run start/detail stubs through their existing slots, keyed by
`target.adapter`, `target.version` and `kind`; unrelated Runs retain existing behavior.
Show the six T21 outcomes: package/brief/audience/preferences, quote/consent, progress/
results, authentic decisions, scoped revisions and owned accessible history.
Use `build-ui` and the adopted shared compositions: Field, SubmitButton, Notice,
StatusBadge, toast confirmation and meaningful leave guards. Persistent errors and
required actions stay inline; a toast alone cannot explain an unresolved paid action.
Use semantic type roles/tokens and typed page-scoped en/ar catalogs with logical RTL styles.
No technical call/provider IDs in public copy; show clear saved progress and uncertainty.

Public projections allowlist status, selected result metadata, retry eligibility/time,
revision scope/price, safe progress summary and owned media URLs. Never forward raw
work requests/results, checkpoints, feedback, private execution JSON or raw audit rows.
Use existing bounded readers for production/artifact/acceptance/human/execution histories
and their cursors; do not turn transport windows into product limits. Clearly label
historical versus current selected candidates and predecessor provenance.

Serve originals through `/api/booklets/[productionId]/assets/[assetId]` using
`bookletMedia.read` and fresh owner checks, including verified predecessor attachments.
Use private no-store responses, validated MIME and nosniff. No arbitrary client URL
fetching and no booklet IDs passed to generic Run asset routes.

Keep creator questions in existing authentic first-wins Run decision controls; never
answer them via application retry waits. Manager chooses optional review prompts and
may group related questions. Financial consent is always explicit.

- **Retry failed step:** after automatic allowance is exhausted, authorize the existing
  single extra action grant using `authorizeRetry`; preserve its counter and stable key.
  Resume through the ordinary owned continuation path only when the previous Manager
  execution is verified terminal. An active Manager retains control; do not enqueue a
  parallel successor. Unknown outcomes offer status/reconciliation, not paid retry.
- **Continue booklet:** preserve production/order, successful artifacts, counters and
  checkpoint. For eligible failed/cancelled predecessors use existing predecessor
  chaining. After a successfully terminated Manager execution, start a new logical Run
  against the same production, omitting `predecessorId`; retain production history.
  Test both terminal shapes. Never label this Start over or discard paid work.
- **Stop:** call the existing Run cancellation command. Explain that accepted provider
  work may finish and be retained; cancellation is not proof of provider termination or
  a refund. Do not add a second cancellation implementation.
- **Revision:** use `quoteRevision`/`startRevision`, expected version and stable request ID.
  Preserve categories story (one scoped round), style (affected style samples), reference
  (selected character/location identities) and page (selected page identities). Server
  locks, entitlement, quote hash and allocation remain authoritative. A revision after
  completion starts a new logical Run without generic restart or another package charge.

#### Administration and local configuration

Keep the defaults labelled **action retries**: paid LLM 2, paid image 0, retriable
non-paid 3; non-retriable actions have no allowance. Retry counts and correction counts
remain separate and durable. SDK attempts stay unknown when unavailable; no new controls.

Reuse the project-owned `bookletWorkflowPolicies` record keyed by execution profile ID/
revision and orchestrator/configuration revision. Extend it only with validated profile
capacity and retry defaults needed by the application boundary. Capacity must match its
profile identity and is immutable per profile revision; changes require a new profile
revision. Retry-default edits affect new productions only. Existing snapshots win on
replay. Reject absent/duplicate/mismatched bindings; never infer live configuration.

The imported admin settings surface has no project form slot. Add one small Booklet
settings section at `/admin/booklets` using existing `adminSections`, shell and admin
authentication; do not change shared settings core. `/api/admin/booklets` reads/updates
only allowed settings with explicit booklet module guard. Do not declare these under
module route prefixes that overlap core `/admin` or `/api/admin`. Read-only identity,
three bounded integer inputs and sanitized evidence suffice; no new dashboard.
Use conflict detection against the previously read settings, existing transactions and
audit events. Preserve suite/provider/Reviewer bindings on retry-default edits. Reuse
existing admin AI/report evidence for errors, application attempts and reconciliation;
if needed, render a bounded sanitized table in this section, not another operations UI.

Use synthetic published catalogs, frozen terms, policy/profile fixtures and local
accounts for all 10 tests. Real package/capacity selection, credentials and live binding
readback are final 12 inputs. Admin stays English/LTR without changing public preference.
No deployment, migration of a live database, provider call or live import is part of 10.

### 11 - Integrated verification and handoff

Use actual YAML boundaries and real app handlers with deterministic providers/disposable
persistence, not a Dify execution engine emulator. Cover:

- Creation, all six review modes, exact text/originals and structural completion.
- Retry defaults, settings snapshots, non-retriable errors, distinct correction counts,
  durable limits, backoff eligibility and no duplicate/whole-flow paid replay.
- Partial siblings, retained-save retry, late results and reconciliation success/failure/
  uncertainty; missing locators, exhausted reads and deadline do not imply safe replay.
- Crash after dispatch, after retention and before checkpoint; conflicting workers and
  expired leases; cancellation/capability expiry permits retention, not new dispatch.
- Same-run Human Input, authentic first-wins answers, stale decisions and successor
  continuation with no duplicate charge; repeated user retry/continue clicks.
- Quote changes, one-time consent/consumption, locks, revision scope and owned history.
- Preserved v1 behavior and optional shared hooks disabled for unrelated projects.

Run affected `test:booklet-compat`, `test:booklet-repositories`,
`test:booklet-lifecycle-media`, `test:booklet-mcp`, MCP/Run/AI/commerce suites and contract
fixtures using prepared npm. Run typecheck, scoped ESLint, build for runtime inputs,
and applicable check:env, check:docs, check:i18n, check:skills. Persistence changes run
`docs:booklet-model` before `check:docs`; shared changes add template and initialized-
project checks. Browser proof covers desktop/390px en/ar, keyboard, admin language
isolation, media ownership and served-document CSP. Use a production build for toast
stylesheet/CSP evidence, stop dev before building, and run typecheck after build. For
affected surfaces follow build-ui's three presets, light/dark, 390px/1440px, public Arabic,
keyboard, 200% zoom and reduced-motion checks. Include draft preservation on known/unknown
failure, invalid-field focus, leave/return behavior, enlarged-media close/focus restoration
and non-disruptive history updates. Physical-device/screen-reader and final visual
acceptance are explicitly recorded as pending where not actually exercised; do not claim
specimen parity from unit tests. No paid calls for local checks.

Every checkpoint requires two consecutive clean read-only reviews on the same state;
fixes reset the affected count. Slices require affected checks, not extra review pairs.
Without delegation authorization label separate same-agent review passes. Update exact
artifact/revision evidence, G01-G17 resolutions and E1-E6 status; local tests never prove
Dify runtime acceptance. Preserve bounded evidence when an external gate remains open.

### 12 - Final approvals and staging acceptance

Present one reviewable package after 11: exact revisions/import, migration instructions,
workflow hashes, plugin identities, settings/bindings, test evidence and unresolved gates.
Group final manual inputs/approval: staging app deployment/migration, Dify publication
and tool bindings, secure credentials/environment identity, selected package/capacity,
test accounts and confirmation of the selected US$3 total provider-spend ceiling.
Scope C is pending; that ceiling is not permission to spend before approval. Prior
US$1 probe approval is historical and not reusable. Verify live MCP image conversion
through this staging endpoint; no preliminary tunnel is planned.
Human account/financial-consent steps remain human actions. No production activation.
Before choosing a staging destination, record Unitale's approved environment/branches:
repository preferences currently declare no deployment branches. Inherited `_staging`/
`_prod` conventions and the Unibase operator runbook do not authorize Unitale promotion.
Additional design assets or expanded product capabilities require separate bounded
approval; they are not silent prerequisites of the accepted 10-12 scope. The
2026-11-22 pre-10 token/font adoption is already authorized and recorded above.

After authorization, publish specialists before Manager, verify exact bindings and tags,
then run bounded application-connected T18-T21 journeys. Preserve existing apps/shared
plugins. Verify cleanup or explicitly retained resources and secret-free final exports.
Close E1-E5 only with actual supporting evidence; E6 tracks current local checks/reviews.
T18-T21 completion requires their acceptance evidence, not full-product T28 completion.
Stop after the final handoff; later milestones remain excluded.

### Unattended execution and documentation rules

Use small slices with checks, necessity/simplicity rationale and updated evidence in
these existing docs; no new tracking hierarchy. Continue automatically through satisfied
dependencies after kickoff. Fix in-scope defects without asking routine implementation
questions. Pause only dependent work for a missing capability, required external reviewer,
permissions failure or excluded-scope change; keep independent work moving. Never bypass
branch protections or claim a gated capability is proven. Routine syntax/file organization
choices belong to the implementer; business behavior and ownership above are fixed.

The original planning amendment was documentation-only. Subsequent 07-09 changes
implemented the storage and local application/native retry boundaries recorded above.
Model JSON/diagrams track implemented contracts. Existing 01-06 evidence is historical
for its exact artifacts; 09 uses fresh checks and reviews, with target execution pending.

### Execution boundary and artifact layout

Original 01-06 local scope: package YAML, essential inline checks, focused fixtures/tests and
canonical booklet documentation/navigation. That original scope excluded application code, runtime registries,
migrations, root dependencies/lockfiles, deployment settings and Unibase. Scope B later
authorized bounded 07-11 implementation/publication as recorded above. Deployments,
paid calls and live activation remain excluded until scope C approval.
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
resume, effective provider settings, pricing or paid acceptance evidence. E1-E5 retain partial/pending evidence as recorded in the package specification;
close only the specific behavior actually probed under its authorization.

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
README records exact scope, remaining gates and cleanup. Actual paid provider probes
are recorded in the handoff; no integrated application journey is claimed.
The initial stop before 07 was superseded by scope B. Checkpoints 07-08 and tasks
09.1-09.6 are locally verified; 09.7 is now Verified locally; checkpoint 10 is Verified locally (2026-11-22). All eight historical disposable
apps and both test plugins were removed, with original apps/shared plugins preserved. Future changes reset affected
checks/reviews; do not inherit the superseded framework evidence.
The [compatibility procedure](workflow-package/integration-handoff.md#difyprovider-compatibility-procedure)
separates early Dify feasibility checks from application-dependent integration proof.
The seven repository candidates now use compact `Unitale: <Readable Role>` display
names. The handoff owns [naming/tagging conventions](workflow-package/integration-handoff.md#naming-and-tagging-conventions)
and the [remaining stages and preparation](workflow-package/integration-handoff.md#next-step-runbook).
Names do not change service/tool identifiers; live renaming/tagging has not occurred.

### New-session goal prompt

**Session handoff (2026-11-22, after checkpoint 10):** checkpoints 01-10 are locally
complete; see the [checkpoint 10 closure](#checkpoint-10-closure-2026-11-22). The next
checkpoint is **11 Integrated verification and handoff**; start it only on a new
instruction. Booklet browser checks reuse `tests/integration/booklet-fixture-seed.ts`
and the `booklet-browser-*.js` scripts; set `BOOKLET_PYTHON` where `python3` is a
Store alias, and never run account suites while a browser fixture is running.

**Homepage (approved 2026-11-22):** the Unitale-owned homepage with **Create a book**,
**Continue your books**, sign-in return routing and booklet copy is part of 10.2 on this
issue branch, using the existing `projectHome` hook. No Unibase change and no separate
prerequisite branch. Do not implement a workspace, reader or storefront.

Repository ownership remains governed by [preferences](../../../.agents/repository.md)
and [template updates](../../template.md#receive-template-updates): reusable fixes
originate in the existing Unibase clone on a separate branch, then enter Unitale main
through reviewed adoption before normal merges into feature branches. Unitale owns
booklet services/workflows, theme and product compositions through existing project
extensions. The existing `src/project/home.tsx` hook can support a future approved
homepage without editing shared core. No new Unibase change is planned for 10.

Checkpoints 09 and 10 are Verified locally on `feature/10-dify-workflow-design`.
On a new instruction to start 11, follow its scope above and reuse delivered services,
the checkpoint 10 facade/routes/fixtures and the current reviewed Unibase import in
`project.source.json` (`02517797c9ecd1d8e9696cd1b68c9b976f2105db`). Do not restore the
historical checkpoint 08 import. Report status/checks at each step.
Follow AGENTS and the necessity/simplicity gate. No copied-core patch, new framework,
scheduler, dependency or provider plugin. Scope B remains approved. Provider gaps
requiring expansion are accepted limitations, not scope expansion. No temporary tunnel,
deployments, paid calls or live activation. Scope C stays pending at 12; the selected
future US$3 ceiling is not current spending approval. Keep 11 local integration and
12 grouped manual/operator acceptance distinct from local implementation evidence.

## Foundation import

The remaining historical sections preserve evidence at their original checkpoints.
Use the current 07-12 plan above for next actions and milestone status.

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
