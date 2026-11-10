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
material application implementation at 07. E1-E5 retain partial or pending runtime evidence; E6 records current local checks, not
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
was subsequently approved on 2026-11-10 for 07-11 as recorded below; implementation
has not started. This reconciliation task is documentation only.
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
| 07 - Application Contracts & Persistence | Versioned runtime interfaces, compatible readers and necessary storage/index changes | Scope B approved; implementation not started; isolated provider feasibility established; preserve v1 records and update model/example/both Mermaid versions together |
| 08 - Shared Runtime Extensions | Only demonstrated missing generic seams, implemented in Unibase and imported through review | Scope B covers demonstrated generic changes and reviewed imports; no speculative core extensions |
| 09 - Unitale Gateway & Recovery | Necessary booklet MCP, admission, usage, originals and recovery behavior | Actual handlers/repositories and failure-path tests |
| 10 - Run UI Integration | T21 brief, quotes, progress, decisions, revisions and history in existing Run UI | Browser/race checks; no separate creator workspace |
| 11 - Integrated Verification | Actual workflows against implemented application interfaces | Real integrated offline checks and two clean reviews |
| 12 - Staging Publication & Acceptance | Exact publications, finite paid acceptance and final exports | Separate scoped live/publication/paid authorization and operator inputs |

### Remaining implementation: kickoff and ownership

Planning amendment accepted 2026-11-10. **Scope B execution started.** The user requested committing the current changes
and executing 07-11. Candidate/planning baseline committed as `2dc7b8c`; 07.1 is in
progress. Scope C and paid/live operations remain pending. The plan targets unattended
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
Refresh and verify before implementation; do not build on that stale checkout.
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
| T18 | Specialist candidates implemented locally in 01-04/06 | 07-09 bindings, originals and 11-12 integration/acceptance |
| T19 | Six Reviewer modes and correction workflow implemented locally | 07 durable assessments/counters, 09 enforcement, 11-12 proof |
| T20 | Manager candidate implemented locally in 05-06 | 07-10 authenticated decisions, retry/recovery and continuation; 11-12 proof |
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
visible. The current documentation-only change leaves model JSON/diagrams and runtime
artifacts unchanged.

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

Current implementation evidence (07 in progress): 07.1 adds `src/project/booklets/contracts-v2.ts`
for consumed native content, six-mode assessment and retry-policy boundaries. Existing
v1 parsers remain unchanged. Focused contract checks pass 12 tests (including three
v2 behavior cases). 07.2 adds explicit v2 production/revision schemas and atomic new
production creation, retry-policy snapshots, short leases and bounded checkpoint
CAS/idempotency in the v2 repository. The 18 repository and 17 lifecycle/media tests
pass; the v2 case covers owner isolation, unchanged v1 records, duplicate creation,
changed payloads, lease replay, one-winner checkpoint races and oversized rollback.
Draft immutable revision writing now preserves exact text and validates local source/
original identities, with atomic pointers/ordinals and idempotent receipts; active v2
writes stay closed until 09 admission integration. The new revision race/hash test passes.
07.3 work/assessment/acceptance/correction storage remains pending. Checkpoint 07 completion and its final review pair are not claimed. Baseline candidate
checks pass 34 tests, typecheck, scoped lint, docs/i18n/skills and digest audit. Sandbox
spawn/cache restrictions were resolved by running affected checks outside the sandbox.
The model guide, independent v2 JSON example and both generated Mermaid schemas
were updated together with 07.2. Typecheck, scoped lint and documentation checks pass.
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

Current task: documentation reconciliation only. Scope B for 07-11 is approved
with minimal implementation and required reviews; no implementation has started.
No temporary tunnel; scope C stays pending with a selected future US$3 ceiling.
The following records the original completed 01-06 authorization, not a new task.

The DSL-first candidate through 06 is locally validated on
`feature/10-dify-workflow-design` from `713da2d`. Read current candidate evidence,
accepted specification and the necessity/simplicity gate before any further work.
Stop at the validated Dify/provider handoff. Further application implementation in
07-11 needs separate authorization. Preserve the US$1 probe accounting and shared
experiment plugins; temporary probe apps/plugins are removed. Production activation
and unrelated later product milestones remain gated.
Preserve the seven roles, Manager-only app communication and pending E1-E5 evidence.

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
