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
implemented and reviewed. Scope B covers 07-11; checkpoint 09 is in progress. Runtime/live
acceptance and scope C remain separate.** The
[A01-A22 register](workflow-design.md#implementation-readiness-audit)
links each resolution to the [package specification](workflow-package-spec.md#technical-resolutions-for-a01-a22).
Checkpoints 01-12 below replace the application-first C0-C10 sequence. Deliver the
candidate workflows and proposed application changes at 06. That initial stop was
superseded by the recorded scope B approval; continue through 11, with 12 still gated. E1-E5 retain partial or pending runtime evidence; E6 records current local checks, not
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
| T17 | Unitale | MCP-only booklet tools | T15,T16 | Implemented; manifest transport-limit review finding remains; verification notes below |
| T18 | Unitale | Source specialist workflows generalized to package inputs | T01,T02 | Candidate implemented; integration/acceptance pending |
| T19 | Unitale | Versioned quality assessment service and bounded correction contract; issue #10 covers all review modes | T01,T02 | Candidate implemented; persistence/integration/acceptance pending |
| T20 | Unitale | Manager composition, Human Input and durable continuation | T17,T18,T19 | Candidate implemented; application/recovery/acceptance pending |
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
| 08 - Shared Runtime Extensions | Only demonstrated missing generic seams, implemented in Unibase and imported through review | Complete locally at Unitale `2873e60`; exact Unibase PR #49/#50 import, checks and two clean same-agent reviews; live conversion remains 12 |
| 09 - Unitale Gateway & Recovery | Necessary booklet MCP, admission, usage, originals and recovery behavior | Actual handlers/repositories and failure-path tests |
| 10 - Run UI Integration | T21 brief, quotes, progress, decisions, revisions and history in existing Run UI | Browser/race checks; no separate creator workspace |
| 11 - Integrated Verification | Actual workflows against implemented application interfaces | Real integrated offline checks and two clean reviews |
| 12 - Staging Publication & Acceptance | Exact publications, finite paid acceptance and final exports | Separate scoped live/publication/paid authorization and operator inputs |

### Remaining implementation: kickoff and ownership

Planning amendment accepted 2026-11-10. **Scope B execution started.** The user requested committing the current changes
and executing 07-11. Candidate/planning baseline committed as `2dc7b8c`; checkpoint 07
is complete through `867759c`, and 08 is imported/verified at `2873e60`; 09 is next. Scope C and paid/live operations remain pending. The plan targets unattended
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
| T18 | Specialist candidates implemented locally in 01-04/06; opt-in v2 storage in 07 | 08-09 bindings/originals and 11-12 integration/acceptance |
| T19 | Six Reviewer modes, correction candidate and 07 durable assessment/counter storage | 09 runtime enforcement and 11-12 proof |
| T20 | Manager candidate implemented locally in 05-06; 07 durable work/checkpoint storage | 08-10 authenticated decisions, retry/recovery and continuation; 11-12 proof |
| T21 | Generic Run capabilities exist | 09 backend and 10 brief, quote/consent, progress, decisions, revisions and history; 11-12 proof |

No T18-T20 behavior is intentionally omitted. Complete T21 through existing Run
surfaces; a dedicated booklet list/workspace is excluded, not its history or financial
consent requirements. Reader/PDF/sharing/storefront and full-product T26-T28 remain
separate. Earlier T18-T20 next-step statements below are historical evidence.

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
| 09.4 Human decisions and completion | In progress | Connect existing authentic first-wins decisions, Manager acceptance, manifest drafts, structural completion and backend history reads. Correct requests resume; stale responses and invalid purchased structures fail without partial finalization. |
| 09.5 Bounded recovery | Pending | Wire accepted action retries, reconciliation/backoff and retry/continue/stop through existing worker/native failure routes. Prove unknown outcomes, late results, exhaustion, repeated clicks and cancellation preserve successful work, liability, counters and prepaid scope. |
| 09.6 Connected journeys | Pending | Complete native bindings and deterministic creation/revision/correction/continuation/completion journeys through actual handlers and YAML boundaries. Cover all review modes, large text, originals, human waits and partial results; preserve v1/unrelated Runs. |
| 09.7 Review and handoff | Pending | Fix blockers, apply demonstrated simplifications, run final affected checks and two consecutive clean read-only reviews on the same final state. Consolidate evidence and revise checkpoint 10 around completed interfaces, then stop before its implementation. |

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

For 09.3, preparation and generation use distinct action/call IDs. Generation consumes
the exact retained prepared request, including its preparation identity. Replace the
candidate's same-call-ID equality check and its focused fixtures together, preserving
prepared/source/reference hash checks. This resolves the demonstrated collision with
the existing unique work call identity without introducing phase records.

All accepted retry/reconciliation, financial, human and ownership decisions above
remain binding. Manager owns creative orchestration; application guards remain
structural/financial, not replacement quality policy. Use local fixtures/fake providers.
Default to no further Unibase changes; demonstrated generic gaps originate there and
enter Unitale through reviewed template integration. Continue independent local work
when an external capability blocks a dependent path; never weaken its exit criteria.
Scope B covers local implementation. Deployments, paid calls and live activation stay
behind scope C at checkpoint 12; no preliminary tunnel or checkpoint 10 UI work.

#### Delivered foundation and current evidence

09.1 slice: the v2 lease adapter uses the existing atomic mutation/receipt mechanism
to refresh a fence and return `leaseHeld:false` for acquire/renew/release. Every later
write still checks its own fence. Held repository leases block refresh and remain
unchanged; no lock spans a workflow call. Context/suite integration is partial,
and now verifies its local boundary. This adds no production field; model JSON and diagrams remain
applicable. Focused gateway coverage checks replay, stale fences and the next write.
The same document reader now exposes owned `{checkpointVersion,state}` via
`kind:checkpoint`, allowing cursor-based reads of large saved state without a new
storage field. Thirteen MCP tests pass, including large checkpoint sections and
foreign-production rejection; scoped lint and documentation checks pass.
The 09.1 suite validator compares server-owned Manager/child publication and tool
metadata with the actual exported Manager's six child nodes. A fixture binds those
nodes in memory and rejects missing children, foreign tools/Manager publications and
duplicate node IDs. It performs no Dify call and does not prove that remote workflow
tools still resolve to the recorded child publications. Context now loads one matching
server-owned policy record, validates its suite/Manager graph and Reviewer publication,
and exposes only binding identities. Sources, recent work, assessments and correction
facts are bounded with explicit completeness flags; complete bodies use owned reads.
Dispatch remains disabled. Context now includes an older checkpoint-pending work item
outside its recent selection. Owned work/assessment histories expose continuation
cursors, invalidated by production changes rather than silently omitting new records;
individual work/assessment/correction bodies use bounded document reads. Local tests
cover 26 work records, pending selection, cross-query/foreign cursors and changed state.
The demonstrated large-checkpoint mismatch is resolved with a 128 KiB context envelope,
keeping the entire checkpoint inline and its storage cap at 64 KiB. Actual Manager
Code fixtures preserve its state beyond the prior context cap and reject oversize
context. No checkpoint merge/projection protocol is needed. Registration's owned
immutable sources and full request hash authorize a paid child's source selection;
the native guard no longer treats the bounded source preview as a complete allowlist.
Content hashes and registered paid-call matching remain enforced, including a 20-source
fixture with an empty preview. Actual remote readback remains checkpoint 12 evidence.
Provider snapshots pin unique full text/image package identifiers; child app/publication
identities are distinct and the Reviewer policy matches its child publication. Dispatch binding
enforcement belongs to 09.2. No suite provisioning or live activation is claimed.

09.1 exit evidence: 60 affected repository/lifecycle/MCP tests passed in the combined
run; the final changed MCP/suite cases passed again (15 tests). Forty native/v1
compatibility tests, build, post-build typecheck, scoped lint, docs and independent
13-path hash audit pass. A separate same-agent read-only review (cold-review fallback)
found and fixed the source-preview/product-limit defect; its follow-up found no further
blocking issue. The disposable Mongo fixture needed forced shutdown once; a subsequent
process inventory found no remaining mongod process. This is local verification, not
integrated Dify execution. Checkpoint-wide review pair remains 09.7 work.

09.2 in progress: context now reports production-owned dispatched work-attempt counts
by paid LLM/image/non-paid category, with active and unresolved totals. Registered
intents are excluded and aggregation covers all owned work, not its recent preview.
These are application-attempt facts, not provider-internal counts or complete native
usage. Terminal native Manager `decide` observations now create metadata-only work facts with
native identity, bounded exact outputs when available and separate redacted trace.
Duplicate/normalized retry observations count once; failed reasoning remains unknown
until trusted success, and late success/readback updates that same attempt. Complete
late output can hydrate a previously truncated observation without another attempt;
unavailable/oversized output is explicitly omitted while retaining attempt accounting.
Observation never
advances production versions/fences. History cursors also bind inventory counts to
notice newly observed work without forcing checkpoint races. No prompt inputs are
available on this hook: its request hash identifies native metadata, not an observed
prompt, and trace explicitly records `requestObserved:false`. Complete prompt/cost
integration, dispatch safeguards and the text journey remain pending;
`usage.canDispatch` stays false. Existing work fields suffice; model JSON and diagrams
are structurally unaffected.

09.2 cost facts now reuse the existing `aiUsage` ledger through production-owned Runs.
Per Run, the larger of a reported execution total and the reported node subtotal is
used, never their sum; a lagging summary cannot hide already reported node cost.
Decimal arithmetic is exact. Missing/invalid reports and other currencies are counted
explicitly, not converted or claimed as a zero invoice. The reported subtotal is
compared with the configured minor-unit ceiling, with `complete:false` because nested
provider/SDK costs may be absent. No duplicate ledger, estimate pricing configuration
or spending reservation is introduced. Dispatch integration remains pending.
The cost-fact slice passes 16 MCP tests (exact decimals, lagging summaries, unknowns,
cross-Run accumulation and owner/production isolation), build, post-build typecheck,
scoped lint and docs checks. A separate same-agent read-only review fixed the lagging
summary issue and found no further blocking issue in this addition. No stored fields
changed, so the model JSON/diagrams and native package digest remain applicable.
Native text-journey reassessment: the previous stale-context finding was not confirmed.
The actual `turn -> context -> facts -> can-reason -> decide` path is inside the Loop,
so `facts.context` is refreshed each iteration. Preserve this existing path and verify
two consecutive actions before closing 09.2; no additional Loop state is required.

Paid child checkpoints now retain a compact owned work reference instead of copying
the response body. The consume node clears pending intent only after fresh context
confirms matching retained work; missing results, changed identity and unknown outcomes
stop advancement. Complete/partial proposal bodies remain in existing work storage.
The real MCP fixture publishes exact oversized text, saves/replays a compact checkpoint,
then exercises a second read/checkpoint action using fresh context and advancing fences.
It executes actual YAML Code functions against actual handler replies, not a Dify
interpreter. This verifies local boundaries; dispatch and full Manager execution remain
gated. No schema or storage field changed, so the model JSON/diagrams are unaffected.
This slice passes 16 MCP and 41 native/v1 compatibility tests, typecheck, scoped lint,
docs/i18n/skills checks and an independent 13-path hash audit. A separate same-agent
read-only review (cold-review fallback) found no blocking issue in this slice. Full
09.2 exit evidence and the checkpoint-wide review pair remain pending.

Repository dispatch now checks production-wide paid LLM/image attempt limits and the
reported spending ceiling in its existing atomic mutation. Active creative dispatch
also reuses the publication-stage lock and current revision-allocation checks, so
forbidden work is rejected before execution. Reviews remain possible for locked
creative stages; draft storage fixtures keep their existing construction behavior.
Attempt totals moved into the existing usage reader to avoid a repository/registration
import cycle. No new ledger, reservation, contract field or dependency is introduced.
Thirty repository and 16 MCP tests pass, including rollback of dispatch denied by
usage, price, lock and funding guards. Model JSON/diagrams and YAML digest are unchanged.
The native stream's demonstrated identity timing gap is resolved through Unibase
[PR #51](https://github.com/Uniwares-LTD/unibase/pull/51), imported with `template:update`
at exact reviewed merge revision `949ac66d2e02ab5c9ed4a6fa59b0ad66c97742d4`.
Opt-in observers receive the actual initial publication through the existing running
execution event before node results. Legacy missing identities are not inferred;
reconnect preserves newer state. No generic interface or stored field was added.
Shared verification passes 17 Dify/tracing and 17 AI-job tests, build, separate
typecheck and required checks; two same-agent read-only reviews are clean. The Unitale
MCP fixture now uses the actual Dify parser and worker event persistence before its
Booklet observer, then publishes/checkpoints exact large text after a stream drops
before parent completion. All 16 MCP and 34 imported adapter/tracing/worker tests pass
in Unitale, along with template consistency, build, typecheck and required checks.
Configured-suite text dispatch/source bindings now use actual handler and native Code
boundaries. Context reports attempt/cost/native step and elapsed bounds; dispatch
rechecks them atomically. Native steps survive activity-log cleanup through existing
accounting records. Elapsed coverage remains a labelled lower bound, with nested
durations never added. The deterministic text journey checkpoints intent, checks
sources, dispatches once, runs Manuscript validate/pack, retains native output, saves
a compact checkpoint and publishes exact text once. Replay attempts with fresh context
fail, while lost write replies reuse receipts. Image references/dispatch and remaining
review-mode safeguards stay in 09.3. No execution switch or live binding was changed.

09.2 exit accounting review corrected additive Loop/Iteration child-cost aggregates
in Unibase [PR #52](https://github.com/Uniwares-LTD/unibase/pull/52), imported through
`template:update` at exact revision `a7eda79b0f7c77732913e3a6b82a6eab3f6485fe`.
Native step/duration records and parent execution totals remain; invalid timing does
not discard valid pricing. Accepted records are not rewritten and no ledger is added.
The correction passes 18 native adapter/tracing and 17 shared worker tests, build,
separate typecheck and two clean same-agent read-only reviews. The final Unitale state
passes 18 MCP, 30 repository, 18 native adapter/tracing and 41 compatibility tests,
build, post-build typecheck, scoped lint, template consistency and required checks.
The separate task review found no remaining local text-action blocker. Model JSON/
diagrams and the native package digest are unchanged. Checkpoint-wide final reviews
remain 09.7 work.

Accepted provider limits: SDK attempts and complete nested charges can be unknown;
Manager prompt inputs are not exposed by the existing private hook; elapsed coverage
is a reported lower bound; current remote bindings/file conversion and live execution
remain unverified. Preserve these labels and safe unresolved-work handling. They do
not trigger broader provider implementation or block the remaining local tasks.

09.3 assessment slice: `record_assessment` resolves exact retained native Reviewer
work by its existing run/node/execution locator, derives the originating configured
policy server-side, and reuses repository content/coverage guards and replay receipts.
The native prompt names that locator; no workflow graph, execution switch, interface
field, stored schema or provider control was added. Model JSON/diagrams remain valid.
The large-text review fixture demonstrated that the default 64 KiB request limit
cannot carry an accepted child envelope. The fixture and handoff now configure the
existing `requestBytes` allowance to 2 MiB for JSON/RPC escaping; shared defaults and
live configuration are unchanged. The 19-test MCP suite passes exact review output,
wrong identity/content/coverage/policy claims and replay cases. Image/preflight,
correction-finding lineage and revalidation remain 09.3 work.
This slice also passes 41 compatibility tests, build, post-build typecheck, scoped lint,
docs/i18n/skills/environment checks and an independent 13-path hash audit. A separate
same-agent read-only review (cold-review fallback) found no blocking issue in this
addition; checkpoint-wide final review pairs remain 09.7 work.
09.3 preparation/preflight slice: unpaid Prepare now registers and dispatches through
the existing work/receipt path (`nonPaid`), and native observations retain its exact
result. Manager routes every child through durable dispatch and checkpoints a compact
work reference after confirmed retention. The internal branch keeps its node ID and
uses an explicit child-dispatch flag, separate from paid budget classification.
Prepare and Generate now have distinct call IDs in the actual YAML/fixtures; the
unchanged prepared object's call ID remains part of its hash. Image-request Reviewer
registration rejects self-consistent fabricated preparations and requires the exact
retained native preparation, targets, source tuples and ordered original identities.
It can dispatch without original references and record its exact native assessment.
This adds no stored fields, collections or provider controls; model JSON and diagrams
remain structurally unaffected. Original-byte bridging, paid generation, remaining
visual review modes, correction lineage, publication and revalidation remain 09.3 work.
Slice evidence: 20 MCP and 42 compatibility tests pass, including preflight rejection
before native retention, fabricated preparation, exact assessment and replay cases.
Build, post-build typecheck, scoped lint, model/docs/i18n/skills/environment checks and
independent 13-path hash audit pass. A separate same-agent read-only review (cold-review
fallback) found no blocking issue in this slice; final checkpoint review pairs remain 09.7.

09.3 generation/original slice: Generate reuses the retained-preparation guard and
registers as `paidImage`; actual Manager/Executor fixtures dispatch the reviewed request
and retain two originals from a partial three-image result without redispatch.
The demonstrated separate call ceilings require one context fact, `canDispatchImage`;
text/reasoning retains `canDispatch`. The existing media service now selects v2 ownership
internally, requires an observed outputKey, and verifies exact canvas/format/bytes.
The new `retain_original` gateway matches the observed native file and reuses the existing
restricted downloader, mutation receipt and byte store. Replays do not download again.
Retention can finish after cancellation without granting publication or dispatch.
No new collection, persisted field, provider change or dependency; model guide/example and both
diagrams explain the v2 work relationship using the existing asset format.
Expired observed URLs remain an accepted unresolved-retention gap; do not regenerate
or expand provider support. Specialist original-input delivery, visual reviews,
correction-finding lineage, image publication and revalidation remain 09.3 work.
Slice evidence: 20 MCP, 17 lifecycle/media and 42 compatibility tests pass. The extended
native fixture covers partial Generate, exact file download through fake HTTP, one
download across replay, multiple originals, cancellation, foreign access and canvas/
format rejection. Build, post-build typecheck, scoped lint, model/docs/i18n/skills/env
checks and the independent 13-path hash audit pass. A separate same-agent read-only
slice review (cold-review fallback) found no blocking issue; checkpoint-wide review
pairs remain 09.7. The lifecycle fixture needed forced Mongo shutdown; the subsequent
process inventory found no remaining mongod process.

09.3 original-input/publication slice: `sources` now returns ordered verified original
MCP image blocks with separate identity metadata, using the imported native image seam.
It rejects changed/foreign/derivative bytes and insufficient response capacity. The
demonstrated 16 MiB MCP tool ceiling requires an explicit 8 MiB aggregate/16-original
carrier bound; existing admin limits are documented for base64 expansion, without
changing shared defaults, live configuration or product counts. Creative/visual work
registration verifies owned original metadata; the real source read verifies bytes.
Actual native Manager/Executor fixtures bind synthetic native handles for edit input.
Image publication reuses revision/asset storage and guards each selected observed
original, sources, evidence, funding and locks. Each original/artifact has one saved
effect, allowing separate candidate revisions for different outputs from one Generate.
The Manager prompt now names that exact image-content boundary. The visual-review
fixture reads these saved revisions and actual original pixels, then retains/records
exact native coverage. No schema, collection, index or model relationship changes;
the model guide records why its JSON example and both diagrams remain valid.
All review modes are dispatchable, but whole-book/correction integration and finding
lineage/revalidation still require their 09.3 exit evidence. Target Dify conversion
remains an accepted unverified capability; no plugin/provider work is added.
Slice evidence: 22 MCP, 30 repository and 42 compatibility tests pass, including
old-candidate replay without pointer rollback. Build, post-build typecheck, scoped
lint, model/docs/i18n/skills/environment checks and the independent 13-path hash audit
pass. A separate same-agent read-only slice review (cold-review fallback) found no
blocking issue. The repository registration fixture now supplies owned original
metadata; full byte integrity is proved separately by the MCP fixture. The native
Reviewer fixture uses an explicit local execution flag without changing candidate
gates. No remaining mongod process was observed. Task 09.3 stays In progress;
checkpoint-wide final review pairs remain 09.7 work.

09.3 correction-lineage slice: request-backed corrective registration now requires
each confirmed finding to identify an exact selected immutable baseline that was
actually reviewed, not merely another source in the review context. Subject-scoped
findings map only to their selected artifact sources; whole-book findings also bind
the inspected page original. The same guard checks correction-review before/after
inputs and rejects altered original finding bodies. Legacy metadata-only internal
registrations keep their compatibility path. A streaming lookup reuses existing
assessment/revision fields; no new schema, collection, dependency or provider control.
Repository fixtures cover valid corrective registration, invented findings, changed
finding text and identical-content/different-revision rejection. The real MCP/native
Reviewer fixture also records a confirmed visual defect and checks before/after
originals with that unchanged finding, retaining exact correction-review coverage.
Native corrective-generation journey, whole-book integration and revalidation remain 09.3 work.
Current slice checks: 30 repository and 22 MCP tests, typecheck, scoped lint and
model/docs/i18n/skills/environment checks pass. The unchanged 13-path candidate hash
audit passes. A separate same-agent read-only slice review found no blocking issue.
Build and post-build typecheck now pass. A separate read-only follow-up of the added
native correction-review fixture found no blocking issue. These slice checks do not
complete task 09.3; checkpoint-wide review pairs remain 09.7 work.

09.3 revalidation slice is locally verified. The repository and existing save gateway now
accept `revalidatedFrom`; omitting content copies the retained body server-side.
The write preserves exact content/assets. Manager may reuse retained producer evidence;
new review evidence must match the baseline plus ordered replacement sources, with
original-pixel coverage for images. A new revision records lineage; old history and pointers are
not rewritten by receipt replay. The first real MCP fixture passes source rebinding
and replay. The 22-test MCP suite now also rejects changed content/assets and a
mismatched replacement-source review. Typecheck, scoped lint and model/docs checks
pass, as do 30 repository regression tests, 42 compatibility tests, build, post-build
typecheck and the independent 13-path hash audit. The read-only review removed an
unnecessary mandatory-review gate to preserve Manager policy ownership; the follow-up
found no blocking issue. The Manager prompt/handoff and model guide/example/diagrams
track the optional lineage field. Task 09.3 remains In progress pending whole-book
integration and the corrective-generation journey; final review pairs remain 09.7 work.

09.3 corrective-generation evidence: the existing real MCP fixture now chains unpaid
Prepare, exact preflight, native Manager guard, bounded image-correction dispatch,
native observation, original retention, image publication and before/after review of
the newly published original. A second corrective intent may register, but dispatch
is denied after the image allowance is consumed. Review does not consume another
image correction. Synthetic provider results/pixels and native file handles are
explicit fixtures; no provider or paid call occurs. The 22-test MCP suite, typecheck
and scoped lint pass. A separate same-agent read-only review found no blocking issue.
No runtime/schema/DSL change was needed, so prior build and package hash evidence
remain applicable. Whole-book integration was the remaining mode fixture at that slice;
checkpoint-wide final review pairs remain 09.7 work.

09.3 whole-book/specification slice: whole-book registration now requires the
selected immutable manifest source and each scoped page's matching page-image
source and inspected original. Manifest lookup uses its explicit revision ID,
including when two revisions have equal content hashes. Actual MCP/native Code
fixtures reject missing sources, wrong pixels and altered assessment coverage;
exact assessment replay is stable. The specification-mode fixture likewise uses
actual registration, dispatch, native retention and assessment recording, rejecting
an altered target hash. The whole-book fixture stages owned page/manifest metadata;
it is not proof of manifest publication/completion (09.4) or a fully composed
creation journey (09.6). Native file conversion is synthetic, not target evidence.
These are input-validation changes; persisted schemas, model JSON/diagrams and
the package digest are unchanged.

09.3 exit audit fixed the native guard's use of the eight-row assessment preview
as complete authorization history. Context now resolves the registered Generate
action's exact complete passing preflight under the configured policy/publication,
with matching targets, outside the recent preview. It exposes that compact fact on
the existing work summary; the summary retains its 8 KiB bound. The native guard
checks it instead of searching recent assessments. Correction dispatch relies on
the confirmed finding/baseline lineage already verified at registration and keeps
the durable allowance check. No stored field, provider change or second quality
policy was added. Fixtures prove preflight outside nine newer assessments, reject
wrong policy, and dispatch an app-registered correction with an empty preview.
Acceptance/completion must likewise avoid bounded-preview authority in 09.4.

This slice passes 24 MCP tests, production build, post-build typecheck, scoped lint
and docs/i18n/skills checks. A separate same-agent read-only review found no blocking
issue in its source/manifest binding and exact-assessment changes. The known preview
guard issue was subsequently fixed as described above.

09.3 exit evidence: 24 MCP and 42 native/v1 compatibility tests pass, including all
six review modes, partial originals, exact source delivery, corrective generation,
revalidation, immutable selected manifests and preview-independent preflight.
Production build, post-build typecheck, scoped lint and the independent 13-path
hash/disabled-gate audit pass. A separate same-agent read-only slice review found
no blocking issue after the preview fix. No stored schema changed; model JSON and
diagrams remain applicable. This establishes local 09.3 behavior, not target Dify
execution or connected creation/completion. The final checkpoint review pair is
still 09.7 work. Next: 09.4 authentic decisions, acceptance, manifest publication,
structural completion and backend history; no checkpoint 10 UI implementation.

09.4 acceptance slice: `record_acceptance` now records the current prepaid Manager's
selection through the existing immutable acceptance writer. Request sources must
equal the selected revision's sources; revision/hash/target/original identities are
checked. Admitted writes recheck active Manager, stage locks, revision funding and
owned work/assessment evidence in the transaction. This does not add app quality
or human-approval gates. `read_document` adds the owned `acceptance` DTO through its
existing bounded reader. Fixtures execute the actual Manager guard/checkpoint and
MCP gateway, reject changed identities, foreign evidence/sources and model-supplied
Run identity, preserve exact replay after a stage lock, and reject a foreign
acceptance read. The existing 07 acceptance schema is reused unchanged; model JSON
and both diagrams are unaffected. Human request/response correlation, manifest
publication, structural completion and remaining backend histories are still 09.4
work; 09.5-09.7 remain Pending.

Acceptance slice checks: 25 MCP and 30 repository tests pass, plus production build,
post-build typecheck, scoped lint and docs/i18n/skills checks. A separate same-agent
read-only review found no blocking issue in the gateway, immutable reader or
transactional admission/evidence checks. The first MCP run exposed an invalid
boolean lock fixture; the corrected schema-valid fixture passes. No native YAML,
package digest, stored schema, Unibase code or live configuration changed.

09.4 human-request slice: reuse the existing mutation receipt's result for the
immutable request (ID, original Manager Run, current target tuples, exact presentation
and response contract); actual answers remain in `runDecisions`. The supported
contract is the existing `{mode:"raw-v1"}` paragraph response. Presentation uses
existing typed cards, leaving one of twenty slots for the question/request identity.
The gateway requires the accepted raw-v1 Run mode and does not create an approval
or answer. Optional brief questions may have no revision targets. Owned response
reads match original Run, native `human` node and exact form, and expose only a
submitted user intent whose sent/confirmed response agrees. Unknown submissions
remain pending; changed targets are stale. Existing Run submission supplies atomic
first-wins/idempotency and same-execution continuation. A native filled event can
confirm an uncertain submitted response without another submission. No application
quality/human-policy gate, collection, scheduler or Unibase change was added.
The native checkpoint stores a human-response document reference rather than copying
a large form; the unchanged form reaches Human Input with its placeholder exactly
once. Updated model guide/JSON and complete diagram describe the optional receipt
result; the regenerated core diagram excludes receipts and is otherwise unchanged.
Target Dify form rendering/readback remains checkpoint 12 evidence.

Human-request slice checks: 26 MCP, 30 repository and 42 native/v1 compatibility
tests pass. The actual Run submit service with its fake provider proves foreign-user
rejection, exact repeat replay, conflicting second-answer rejection and exact Unicode
response retention. Actual native decision/filled events prove that an unknown
submission stays pending until confirmation. Changed presentation/attempt/targets,
persona-only provenance and expired forms cannot supply a usable answer. Native Code
fixtures preserve a large form while checkpointing a compact reference. Production
build, post-build typecheck, scoped lint, model/docs/i18n/skills checks and independent
13-path hash/disabled-gate audit pass. A separate same-agent read-only slice review
found no blocking issue. The package identity is recorded in the candidate README;
checkpoint-wide review pairs remain 09.7 work. Next within 09.4: manifest draft
publication, structural completion and remaining backend histories, including the
known acceptance/completion assessment-preview integration item.

09.4 manifest-publication slice: the existing `save_revision` gateway now resolves
typed/transfer content before selecting a producer. A Manager-assembled book manifest
uses the admitted Manager identity and a `manifest:` snapshot operation ID, without
inventing a specialist result or dispatching work. Its page IDs must select owned
immutable page-image sources, and attachments must be exactly those originals. Any
supplied evidence must belong to the production; assembly may use an empty evidence
array. Text/image publication still requires its retained producer evidence and
creative funding/locks. Manifest assembly/selection is metadata over saved artifacts,
so it does not require a new story allocation during a page-only paid revision.
The active prepaid Manager and ownership checks remain mandatory.

The existing immutable writer also revalidates unchanged manifest content/assets
with replacement sources and `revalidatedFrom`, without another provider. Exact
replays and equivalent snapshot writes return the prior revision without rewinding
the selected candidate. The enhanced whole-book fixture now saves and revalidates
actual manifests (only page metadata remains staged), reviews the explicitly selected
revision among equal-content snapshots, and records Manager selection through the
app gateway. Neither save nor selection sets production completion or its final
manifest pointer. No schema field/collection changed: the model guide records the
existing provenance semantics, and the JSON/diagrams remain structurally applicable.
Completion, remaining backend histories and native acceptance/completion proof beyond
the recent assessment preview remain 09.4 work.

Manifest slice checks: 26 MCP and 30 repository tests, production build, post-build
typecheck, scoped lint and docs/i18n/skills checks pass. A separate same-agent
read-only slice review found no blocking issue in publication, immutable revalidation
or original/source binding. No native YAML or hash-covered fixture changed, so the
existing 42 compatibility tests and package identity remain applicable. The native
whole-book acceptance guard is still an open integration item, not established by
the fixture's direct acceptance gateway call. Final checkpoint review pairs remain
09.7 work.

Completion must distinguish the latest draft from Manager's selected candidate.
Equal-content manifest revisions can have different source contexts, as the fixture
now demonstrates. Bind an explicit immutable selection and aggregate review evidence
for that exact manifest revision, rather than its content hash or recent preview
alone. Keep quality policy in Manager and structural/financial checks in the app.

The reasoning slice passes 29 repository and 15 MCP tests, including fenced rollback,
normalized duplicate observations, exact native readback, late output hydration,
unknown failure and BSON-capacity fallback without losing attempt counts. Build,
post-build typecheck, scoped lint, environment and model/docs checks pass. A separate
same-agent read-only slice review fixed the observation/checkpoint race and found no
further blocking issue in this addition. This does not complete 09.2.

In progress; not ready for activation. Checkpoint 07 storage and checkpoint 08 shared
seams are complete locally. Current 09 implementation provides:

- V2 prepaid Run admission, start/continuation/revision lifecycle services and quote
  guards using existing commerce journals; generic Run admission remains blocked.
- Atomic checkpoint/index writes, stable identities, version/fence checks and exact
  replay receipts. No lease is held across a provider or Human Input wait.
- Creative-text registration for the thirteen native operations. Artifact accounting
  targets and child subject selectors are checked separately. Correction limits remain
  durable across regrouping, technical retries, continuation and funding scopes.
- Reviewer registration validates all six modes against immutable target hashes and
  owned source/original identities. Distinct before/after revisions of one artifact
  are allowed; identical source tuples are rejected. Each batch item's scope is
  retained. Current request-backed assessment writes require that item's exact
  retained native proposal, rather than treating the first item as the entire batch.
  This does not yet supply the assessment MCP gateway, immutable Reviewer binding,
  dispatch authorization or complete correction-finding verification.
- Owned revision/work/assessment reads with typed sections and Unicode text fragments;
  artifact history uses a stable ordinal snapshot. Complete bodies never truncate.
- Durable meaningful request bodies in the existing work record (optional for older
  records, maximum 256 KiB), atomically hash-checked at registration. Renewable reference
  URLs/native handles are excluded; creative JSON is preserved without diagnostic
  redaction. The existing owned typed reader exposes the body after restart.
- V2 transfer reuses the existing bounded chunk store, ownership checks, cumulative
  budget and secret scanning. It grants no publication/dispatch authority.
- The native worker hook retains matching complete child results and native execution
  identity in the existing work record, plus a separate redacted trace. Fenced rollback,
  duplicate observations, unrelated/truncated output rejection and retention after
  parent cancellation/revocation are covered locally. Retention alone does not verify
  Reviewer scope, settle costs, classify technical retries or publish a revision.
- Native reconciliation reads the work's stored parent Run through existing provider
  retrieval and bounded tracing. It verifies native run/workflow identities before
  transactional retention, without rewriting the AI worker lease/status. Optional
  locators only constrain readback; they cannot select another provider or app.
  Missing identity, timeout or missing child output leaves work unresolved and grants
  no retry. Automatic worker polling/backoff and measurement settlement remain pending.
- Native Manager result/fence integration and Story Planner description-only revision
  fixes. Seven role identities, provider bindings and disabled execution gates remain.
- Creative-text publication accepts an exact retained proposal reference, typed content
  or complete transfer. It checks the current prepaid Manager, native producer, target,
  sources/evidence, funding, stage locks and purchased layout/panel limits. A producer
  publishes each artifact once across continuation. Roster deltas preserve the other
  narrative group and record their preceding roster source; raw child output is retained.
  Proposal references avoid copying large exact text through the model.
- Manager's private Start now uses the existing Run `context` text-input convention,
  bound directly to MCP `runContext`. The actual capability inspector regression
  fails on the prior export and passes on the corrected isolated Start/tool boundary.
  No Unibase extension was needed. Full registration still requires the remaining
  tools and Human Input integration; revised candidate import/execution remains pending.

The exposed v2 tools are context, lease/fence refresh, checkpoint, index, transfer, creative-text/Reviewer work registration,
native work reconciliation, creative-text publication and the partial document reader.
Registration does not authorize paid dispatch. Automatic recovery, image publication/reviews,
human decisions and accounting remain incomplete. There is no complete application-connected
journey. The latest YAML identity and verification are maintained in the
[candidate README](workflow-package/README.md#current-integration-slice).

Current application verification: 60 affected repository, lifecycle/media and MCP
tests pass, including native retention/readback, continuation publication, roster
lineage, product-capacity rejection and large exact-text reference/transfer publication.
Reviewer tests use the real native observation hook for a partial batch, preserve
before/after source revisions, save distinct assessments of the same scope and reject
altered assessment content. Owned production reads exclude order/owner/lease/checkpoint
fields. These checks do not establish Reviewer publication identity or paid dispatch.
The revised native package passes 40 compatibility tests, including private Start
inspection against existing application code. Its hashes/digest are refreshed.
Production build, sequential typecheck, scoped lint, environment and model/docs/i18n/
skills checks pass. A separate same-agent read-only slice review found no blocking
issue. No Dify, provider, deployment or checkpoint 10 UI implementation occurred. Historical
slice results remain in Git; they are not acceptance of unimplemented paths. Checkpoint
09 requires two clean read-only reviews after its complete behavior is implemented.
The readback addition also passes 16 existing native adapter/tracing tests. Publication
changes no stored fields or native YAML; model diagrams and package hashes remain
applicable. Large-body source/checkpoint hydration, images, Reviewer bindings and the
remaining runtime behavior still need implementation before checkpoint-wide reviews.

Wire the sixteen capabilities in the [existing handoff](workflow-package/integration-handoff.md#minimum-managerapplication-interface):
context, document reads, lease, index, work register/dispatch, transfer, original retention,
revision save, human request, evidence, assessment, sources, reconciliation, acceptance,
checkpoint and completion. Parse each operation's bounded request; no generic executor.
Validate private Run context and production ownership on every tool. Children never
receive private context or call app tools. Pin suite/publication and reviewer identity
from server configuration, not model claims.

Register v2 booklet domain/product contributions through project registries. Reuse
existing quote/consumption/continuation/revision services; validate price/input identity
at consent and consume once. Keep generic restart from bypassing prepaid admission.
A successor requires verified termination and the same production/order scope.

Implement trusted observations and per-output original retention before enabling paid
dispatch. Retain full successful/partial outputs before checkpoint advancement; validate
restricted download hosts, ownership, size, output order and original hashes. Validate
per-kind authorized canvas settings, not one blanket page canvas for all references.
Use bounded typed reads/cursors and complete-payload transfer for large revisions;
never silently truncate or impose transport item limits as product limits. Measurements
separate reported/estimated/unknown costs and avoid parent/child double counting.

Add the retry/reconciliation behavior above to existing services and necessary native
YAML failure branches. Correct only demonstrated integration mismatches; no prompt or
graph redesign unrelated to accepted behavior. Preserve seven role/tool identities.
Refresh YAML hashes/digest and reset affected checks/reviews when YAML actually changes.

Completion verifies ownership, immutable identities, product structure, locks and
accounting. Manager alone decides creative acceptance, human policy and quality usage.
Exit: handler/repository tests prove these paths with fake providers, including safe
retention after cancellation, correction exhaustion and no duplicate continuation charge.

### 10 - Existing Run UI and complete T21

Use `/runs/new`, existing Run detail/history surfaces and Unitale project components.
Supply all six outcomes: package/brief/audience/preferences; creation/revision quote and
financial consent; progress/results; authentic decisions; target-scoped revisions;
owner-bound paginated production, artifact revision, decision and execution history.
Saving history alone does not meet the UI requirement. Use existing owned media services;
never pass booklet IDs into Run asset routes without an ownership-aware resolver.

Add Retry failed step, Continue booklet and Stop with server-enforced eligibility above.
Show saved progress and reconciliation states without technical identifiers in public
copy. Review prompts are optional Manager policy; combine related questions. Financial
consent remains mandatory. Expose retry settings and sanitized evidence in existing
administration; no new dashboard, standalone workspace or booklet listing page.
Public UI uses typed en/ar dictionaries and logical RTL; admin remains English/LTR.

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
isolation, media ownership and served-document CSP. No paid calls for local checks.

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

This documentation amendment changes no executable contract or persistence. The model
JSON/diagrams therefore remain unchanged until 07. Existing 01-06 evidence remains
historical for those exact artifacts; the new retry behavior needs fresh implementation
and verification. No current application or YAML retry capability is claimed.

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
The user explicitly stopped before checkpoint 07 after validated provider feasibility.
All eight disposable apps and both test plugins are removed, with original apps/shared
plugins unchanged. No application changes have started. Future changes reset affected
checks/reviews; do not inherit the superseded framework evidence.
The [compatibility procedure](workflow-package/integration-handoff.md#difyprovider-compatibility-procedure)
separates early Dify feasibility checks from application-dependent integration proof.
The seven repository candidates now use compact `Unitale: <Readable Role>` display
names. The handoff owns [naming/tagging conventions](workflow-package/integration-handoff.md#naming-and-tagging-conventions)
and the [remaining stages and preparation](workflow-package/integration-handoff.md#next-step-runbook).
Names do not change service/tool identifiers; live renaming/tagging has not occurred.

### New-session goal prompt

Continue scope B on `feature/10-dify-workflow-design`: 01-06 native candidates and 07
storage and 08 shared-runtime integration are complete locally; continue at 09. Read AGENTS,
the accepted plan/handoff, current code and checkpoint evidence. Use prepared tools,
small slices and the necessity/simplicity gate. Scope B already covers necessary
Unitale/Unibase implementation, scoped code commits/pushes/PRs/merges and reviewed exact
template imports after checks/reviews. Verify upstream Unibase main before branching;
never patch copied shared core locally. No new framework, scheduler, plugin or dashboard.
Unibase PRs #49/#50 merged the reviewed shared seams and initialization correction.
Exact import `98b77fd1926bc38cefa172a1c90e4735597ca6db` is in Unitale `2873e60`.
Checks and two clean same-agent integrated reviews pass; continue 09 rather than recreating the seams.

Continue through 11 when dependencies are satisfied. Each checkpoint needs two clean
read-only reviews. Do not confuse storage tests with verified Dify/application recovery.
No temporary tunnel. Defer actual MCP file conversion to the real staging endpoint in
12. Scope C remains pending; its selected future US$3 provider ceiling is not current
spending approval. Preserve historical US$1 probe accounting and shared plugins. Stop
before staging deployment/publication/migrations/paid acceptance without C approval.

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
