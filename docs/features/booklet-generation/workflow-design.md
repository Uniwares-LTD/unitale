# Dify workflow package design

## Outcome

Deliver the seven-workflow package from [issue #10](https://github.com/Uniwares-LTD/unitale/issues/10)
as one integrated staging delivery, with complete focused services and a minimal
Manager. Focused workflows should change mainly for creative refinement and
optimization; orchestration changes should normally be confined to Manager.

Status: ownership and delivery decisions below are accepted in the design session
on 2026-11-08. Technical working decisions and recommendations are distinguished
below; selected technical resolutions are now recorded in the package specification.
Executable schemas and live feasibility remain unimplemented/unverified.
This document owns workflow-specific decisions, integration gaps and open questions;
the [PRD](prd.md) owns product requirements, [contracts](contracts.md) describes
current compatibility, and the existing [delivery plan](implementation-plan.md)
owns the semantic 01-12 checkpoints as well as historical milestone context.
The user selected workflow-first delivery with the provider plugin: 01-06 deliver a
candidate package and detailed app-change handoff, then stop before application changes
at 07. The local environment and plan are prepared; package implementation starts
only when explicitly requested in its implementation session.
Update these sections in place as decisions are made; do not append a session log.
The [first-package specification](workflow-package-spec.md) expands the operation
mapping, proposed wire/content fields, Manager behavior, MCP/UI requirements and configuration inputs.

## Scope and authority

This handoff authorizes local environment preparation and documentation finalization,
including commit/push. It creates no package or application implementation. An explicit
01-06 implementation goal authorizes package-local contracts, workflows, tests and the
narrow plugin within the delivery plan; app changes require the post-06 gate.
PR publication, Dify writes/publication, deployment and paid execution retain their
separate approval gates.

In scope for the eventual delivery: all seven workflows, minimal runtime integration,
current secret-free exports and a minimum usable flow to start, review,
resume and request revisions through the existing Run UI. No separate booklet
list/workspace pages are included in this package. This UI integration extends
the issue's original runtime/test-harness-only scope; it is not a full creator workspace.
Package/product registration and admission wiring may reuse existing commerce services;
no new commerce engine or production catalog seeding is included.

Out of scope: full creator-workspace redesign, reader/PDF/sharing, infrastructure
changes, production promotion, implementing parallel orchestration in the initial Manager, sub-managers, dynamic role
registries, adaptive model routing or a generic provider/policy framework.

One integrated delivery replaces the earlier incremental user-facing slice proposal.
Internal verification checkpoints and the early composition feasibility gate remain;
they do not imply separate partial-product releases. Missing access or approval blocks
only dependent work. No live approval has been granted by these design decisions.

## Accepted approach

### Seven focused responsibilities

| Workflow | Service responsibility |
| --- | --- |
| Manager | Overall progression, context selection, human interaction, review/correction coordination, app communication, continuation and completion proposals |
| Story Planner | Concept, outline, preliminary cast and locations; scoped revisions |
| Manuscript Writer/Editor | Manuscript and reconciliation of final narrative facts |
| Art Director | Style, sample and character/location reference specifications |
| Page Composer | Pagination, panels, composition, lettering and page/cover specifications |
| Image Executor | Prepare final image requests; Generate the authorized exact request |
| Quality Reviewer | Text, specification, image-request, generated-image, whole-book and targeted correction assessment |

All creative templates, model-request construction and creative logic live in Dify.
Focused workflows receive explicit task, relevant sources, constraints and feedback,
not Manager's private state or its stage names. They validate contracts and required
data, perform the requested service, and return results, findings or operational
failure/uncertainty. They do not select the next service, request human decisions,
initiate regeneration, enforce production progression or write to the application.
Reviewer assessment is a service result, not authority to advance or stop production.

Unitale invokes only Manager. All specialist-to-app interaction, including hidden
plugin callbacks and artifact transfer, passes through Manager. Children receive
no application credential or private `runContext`. Manager starts serial and bounded,
using deterministic control for known transitions and LLM interpretation where useful.
Serial execution is an initial Manager policy, not an app or contract restriction.
Manager may later group calls or dispatch independent generation in parallel without
changing app or service contracts. Minimal Manager means a simple implementation of the required journey, not missing
creation, revision, pause/resume, quality or recovery behavior.

### Decision and enforcement ownership

| Policy | Decision owner | Enforcement/storage boundary |
| --- | --- | --- |
| Creative task selection, sequence, context and grouping | Manager | App verifies ownership, source identities and payload bounds; it does not schedule work |
| Revision impact, correction, regeneration, reuse or pause | Manager | App enforces product locks, exact identities and available allowances |
| Human approval and clarification: whether, what, when and how | Manager | App authenticates and records actual responses, but does not require human approval for progression |
| Quality criteria and assessment | Reviewer's versioned Dify policy | Reviewer reports evidence and uncertainty; Manager chooses the response |
| Preflight, output review, whole-book review and quality acceptance | Manager | App stores evidence without making a pass a lifecycle prerequisite; Executor does not independently enforce quality policy |
| Correction strategy and attempt limits | Manager's versioned Dify configuration | App preserves counters and enforces bound limits within product ceilings; continuation cannot reset them |
| Package limits, entitlement, expiry, revision categories and stage locks | App/product rules | Manager queries them; app rejects prohibited operations |
| Credit consumption, revision allowances, prices and refunds | App | Human financial consent and app accounting cannot be replaced by Manager's assertion |
| Paid dispatch and usage management | Manager | App records usage/overages and can block new paid progress at a configured per-production ceiling; this is a safeguard, not a hard spending guarantee |
| Idempotency, concurrency and unknown paid outcomes | App for durable records/accounting; Manager for dispatch/recovery | App prevents duplicate customer consumption and conflicting writes; Manager never blindly replays an unknown call and may continue independent work |
| Creative revision selection and proposed completion | Manager | App validates identities, structural package completeness, ownership and retained bytes, not creative quality |
| Immutable history, originals and provenance | App | Manager requests writes; app verifies and persists them |
| Publication changes affecting accepted/in-flight work | Authorized operator | Preserve bound identities; no silent publication migration |

Storing Manager state in Unitale does not transfer orchestration ownership. App
responses supply authoritative facts, remaining allowances and rejection reasons,
not creative next-step plans. Manager is trusted to control paid dispatch. The app
does not reserve provider spending or issue signed execution grants. Existing hard
purchase, entitlement, customer-credit and product-lock rules remain app-owned.

Human responses, Manager acceptance and quality assessments are distinct concepts.
Manager may select an artifact without a human decision; it cannot fabricate one.
Likewise, removing app quality gates does not permit fabricated reviewer identity,
measurement authority or evidence. Authentication and integrity remain app concerns.

### Changes to earlier requirements

These explicit session decisions supersede the conflicting parts of issue #10,
the pinned migration reference and the earlier PRD/design. The GitHub issue has not
been edited; implementation/publication handoffs must include this reconciliation.

| Earlier requirement/design | Accepted replacement |
| --- | --- |
| App requires exact human approval before relevant downstream use/completion | Manager owns all human approval policy; app records authentic responses without enforcing approval prerequisites |
| App enforces required quality passes and human approval cannot bypass those app gates | Manager owns all quality gates; app does not condition generation/acceptance/completion on quality disposition |
| Image Executor rejects Generate for absent/stale preflight pass | Manager validates exact preflight applicability before dispatch; Executor validates its authorized service contract and required data, not quality policy |
| Runtime/test-harness integration only | Add the minimum usable start/review/resume/revision UI/API flow; full creator workspace remains deferred |
| Incremental product slices | Deliver the complete package together, retaining internal checks and separately authorized feasibility/live work |
| Atomic provider-spend reservations and executor-enforced single-use grants | Trust Manager dispatch controls; app records usage/overages and applies a configured per-production safeguard |
| Unknown execution pauses all paid work | Do not replay the uncertain item; Manager may continue independent work within applicable safeguards |

Mandatory image preflight and independent review remain Manager behavior requirements.
Run deterministic structural checks before paid AI review. Manager reviews artifacts
before acceptance/downstream use, not every temporary draft. Output criteria include
missing/wrong/unreadable lettering, missing required content, material subject
inconsistency and unusable layout; aesthetic preferences remain advisory.
Manager must not dispatch Generate without a pass for the exact prompt, ordered
reference content, meaningful settings, sources and policy/reviewer identity. Meaningful
changes invalidate applicability. Review every image kind, then assess generated output.
This is verified in Manager behavior; there is deliberately no second app/Executor
quality-policy gate. Human approval is not itself a substitute for a quality pass.

Confirmed repairable defects permit targeted corrections. Aesthetic advice and
inconclusive evidence do not trigger automatic regeneration. Reviewer findings identify
criterion, precise evidence, expected/observed behavior, affected scope, smallest
correction and limitations. Whole-book assessment must cover actual ordered pages,
including cross-page continuity; summaries do not prove unseen pixels were reviewed.

Defaults remain three LLM corrections after the initial attempt (including request
corrections) and one generated-image correction after the initial image. Review calls
do not consume correction attempts. Keep request/image corrections, transport retries
and customer-requested revisions separate. Counts survive continuation and candidate
revisions. Exhaustion pauses with findings and a resolution path. Storage retries use
retained original bytes; unknown paid outcomes require reconciliation before replay.

## Integration gap assessment

Source-inspected baseline: Unitale `f269357d302eff53702c8c51d3a26cce900e43f8`.
These are current gaps, not implemented fixes or a second task queue. Proposed
resolutions must be checked against the accepted ownership boundary above.

| ID | Current evidence | Required contract/integration work |
| --- | --- | --- |
| G01 | [Specialist envelope](../../../src/project/booklets/workflow-contracts.ts) has one proposal and aggregate character/location payloads, while persistence uses descriptions/roster | Version grouped typed results with individual identities and source/acceptance coverage; reconcile DTOs with persisted content |
| G02 | [Artifact schemas](../../../src/project/booklets/contracts.ts) simplify reference creative fields; `reference` already requires an image asset | Define the minimal durable pre-generation specifications and creative fields needed for approved-source fidelity; map each service input/output without copying experiment counts |
| G03 | [Quality schema](../../../src/project/booklets/contracts.ts) requires an asset and has pass/repair/blocked only; [service](../../../src/lib/server/booklets/lifecycle.ts) permits one immutable disposition per revision | Support scoped assessments, inconclusive evidence, coverage and additional review attempts; separate assessment records from Manager acceptance |
| G04 | [Lifecycle](../../../src/lib/server/booklets/lifecycle.ts) enforces human approval and image-quality passes | Replace these policy gates with Manager acceptance persistence while retaining authenticity, identities, locks and structural completion checks |
| G05 | Generation admission has no final-request identity; no target Image Executor exists | Define Prepare/Generate, canonical request identity and Manager-owned exact preflight checks; bind authorized execution and resulting evidence to the dispatched request |
| G06 | [Guards](../../../src/lib/server/booklets/guards.ts) require customer allocation for changed story/style content; image repair roots are the only correction accounting | Add bounded platform-funded text/request correction authorization and durable policy/counters without consuming customer revision allowances |
| G07 | Packages declare text/step/time/spending ceilings, but booklet services lack complete usage integration; [measurement writer](../../../src/lib/server/execution/measurements.ts) has no production callers | Record calls, usage, labelled estimates and overages; apply per-production safeguards and reconcile without double counting; never promote model-reported usage to provider authority |
| G08 | [MCP](../../../src/lib/server/booklets/mcp-tools.ts) requires a decision ID to apply approval but exposes no lookup; context lacks a complete recovery view | Define authentic decision retrieval and bounded continuation context for outstanding operations, responses, Manager acceptance and correction state; avoid inferred IDs |
| G09 | Revision JSON is transferred, but source/asset metadata remains inline with 100-item caps | Transfer the complete revision payload under existing integrity/byte bounds; demonstrate larger manifests without imposing a 100-item product cap |
| G10 | [Media](../../../src/lib/server/booklets/media.ts) and [transfer](../../../src/lib/server/booklets/mcp-transfers.ts) use 8 KiB chunks; native-file conversion is unproven | Prove ordered original-byte transfer through Manager at realistic sizes and rate limits; 1 MiB requires 128 data chunks per direction before overhead |
| G11 | [Booklet extension](../../../src/project/booklets/server.ts) registers no product type; no booklet entry route exists | Register validated product fields and wire existing catalog/order, production and prepaid Run admission services; no new commerce engine |
| G12 | [Generic restart](../../../src/lib/server/runs/service.ts) uses ordinary admission, which [booklet domain](../../../src/project/booklets/domain.ts) rejects; lifecycle release exists without an integrated caller | Connect booklet continuation/revision and terminal workflow release; handle partial admission, cancellation and unknown outcomes without duplicate charges |
| G13 | Review forms serialize JSON into [summary cards](../../../src/lib/runs/cards.ts) capped at 10,000 characters; Run gallery authorization only reads `runAssets` | Supply readable bounded text/image reviews and owned booklet media access; reuse components without confusing booklet assets with Run assets |
| G14 | [Reviewer bindings](../../../src/lib/server/booklets/mcp-tools.ts) exist as a server-owned collection, but suite provisioning/composition is absent | Define verified suite/publication/tool bindings and evidence provenance under the new ownership policy; no child app registration journals |
| G15 | Prior [compatibility evidence](dify-compatibility.md) is offline candidate behavior; current dependencies lack `tsx` | Restore locked dependencies after implementation/setup authorization, re-establish affected baselines and prove actual composition separately |
| G16 | [Media retention](../../../src/lib/server/booklets/media.ts) permits only one original per generation; a generation has a single target/revision | Separate paid call/group from output-item identities so grouped/multiple outputs retain per-item provenance, retries and accounting without a future app contract change |
| G17 | [Attachment and reuse guards](../../../src/lib/server/booklets/guards.ts) require every original, including reference sheets, to match the single package canvas | Define page product canvas versus sample/reference execution settings; validate against authorized per-kind output constraints without altering original bytes |

Booklet changes belong in project extensions. If Run/card/transport extension points
need reusable core changes, implement them in Unibase and import through reviewed
template integration. An upstream dependency is not permission to patch copied core
locally or publish changes. The selected upstream scope is recorded in A20 of the package specification; implementation and reviewed import remain pending.

## Contract design working decisions

These technical defaults follow the accepted ownership boundary and existing services.
They are design choices, not implemented schemas. Accepted user preferences are
explicitly marked; technical proposals do not imply user approval or live feasibility.

### Versioning, identity and persistence

- Introduce v2 workflow/quality/acceptance contracts where shapes or semantics break;
  do not change the meaning of strict v1 payloads. Retain v1 readers and historical
  evidence. Existing in-flight registrations remain bound to their original contract.
  Do not migrate live production data as part of installing a new workflow suite.
- Keep the embedded Production subject/artifact index and immutable revisions. Grouped
  proposals are transport/service results, not a new aggregate artifact collection.
  Each proposed artifact retains its own identity, content, sources and acceptance.
- Distinguish Manager acceptance, authenticated human responses and immutable Reviewer
  assessments. No record of one kind is fabricated from another. Completion uses
  Manager-selected revisions plus app structural/product checks.
- Reuse the existing canonical JSON representation: recursively sorted object keys,
  preserved array order and SHA-256. Bind meaningful request content and ordered
  reference hashes rather than temporary native-file IDs or expiring download URLs.
  Raw prompt strings and exact lettering must not be trimmed or rewritten when hashing.
- Keep raw prompts, large requests and provider traces in bounded evidence storage;
  durable operational records retain explicit identity and evidence references.
  State required for resumption must not depend on searching logs.
- A repeated write/operation key with identical input returns its original receipt;
  changed input conflicts. Transport retry is not a new creative/correction attempt.
  Reconcile an unknown paid result before replaying that item; independent work may continue.

### Bounded transport and recovery reads

- The v2 revision transfer contains the complete typed payload, including source,
  asset and evidence references. The commit call carries its transfer identity and
  mutation fence; metadata must not remain subject to the current inline 100-item cap.
  Existing total-byte and production-capacity safeguards remain, with no truncation.
- Manager can retrieve bounded operational state: current/accepted artifact pointers,
  locks, remaining allowances, outstanding operations, human requests/responses,
  assessments, correction counters and its saved continuation checkpoint. Lists are
  paginated and record bodies use bounded reads; do not return full history by default.
- Human response lookup is scoped by the authenticated parent Run and stable request
  identity. It reports pending/submitted/stale/closed/reconciling states and exact target
  revisions. A submission race must yield pending/reconciliation, not an inferred ID.
- Reacquire a valid lease/fence after long human or provider waits. Do not hold a MongoDB
  transaction across an external call. Revalidate identities before committing results.
- A stored Manager checkpoint records its own next-action intent and bindings; Unitale
  does not interpret it to schedule specialists. Uncertain operations take precedence
  over replaying checkpoint intent.

### Resolved package preferences

| Choice | Recommendation | Status |
| --- | --- | --- |
| Creative artifact detail | Use balanced structured artifacts: preserve useful narrative facts, style, specifications, composition and exact lettering without over-specifying | Accepted |
| Paid work per focused invocation | Manager owns call grouping and parallelism; initial Manager may choose one call at a time for simplicity; no architectural single-call restriction | Accepted |
| Minimum UI placement | Use the existing Run UI; add only the integration needed for booklet interactions, without separate booklet pages | Accepted |
| Human checkpoints | Identify common checkpoints, keep all creative reviews optional, and let Manager choose from context with fewer interruptions preferred | Accepted |
| Initial models | Use published reference models through interchangeable model/workflow bindings; keep service contracts model-independent | Accepted |
| Paid-call safeguards | Trust Manager controls; app records usage, identifies overages and can block progress at a configured ceiling; no executor-level replay guarantee | Accepted |
| Ceiling scope | Per paid production/version; continuation and corrections share it, while a new paid production has its own ceiling | Accepted |
| Unknown calls | Never blindly replay the uncertain item; Manager may continue independent work | Accepted |
| Cost basis | Use reported cost when available, otherwise a clearly labelled estimate with versioned pricing; replace estimates without double counting | Accepted |

Artifact-detail examples illustrating the accepted direction (not final field names):

| Artifact | Lean representation | Structured creative detail |
| --- | --- | --- |
| Character | Name and description: “Mina is a curious child in a yellow coat.” | Stable subject ID; appearance, proportions, clothing, distinguishing marks, temperament and continuity constraints in separate fields |
| Manuscript | Ordered prose blocks | Prose plus scene/beat identities, participating subjects, setting and facts that later illustrations must preserve |
| Page specification | “Mina finds a lantern near the old tree.” plus dialogue | Panel order, framing, subject/action placement, lighting, exact lettering and reading order, referenced manuscript units and required visual facts |
| Style | “Warm watercolor.” | Medium, palette, line/texture treatment, lighting, typography and consistency constraints |

Accepted: preserve creative details that downstream services, revision impact
analysis or reviewers actually consume, with optional fields when not relevant.
Do not force the human to fill every field, and do not copy experiment-specific page
counts or decorative metadata. Dify generates this structure from the brief; the
Run UI presents readable content. Require a field only when an identified generation,
review, revision or integrity use needs it; otherwise make it optional or omit it.
Do not require exhaustive personality profiles, camera settings or layout coordinates
for every artifact. Keep exact text and stable source/subject identities where needed,
while allowing creative descriptions to remain prose. These examples do not make
every listed detail mandatory. Final field-level schemas still require design review.

### Service contract outline

The following is the proposed v2 service surface, not a deployed operation catalog.
Operation names are service capabilities, not Manager stage names. Final schemas
must map each published prompt/schema selector to a capability or an explicitly
documented omission before contract freeze.

| Service | Proposed operations | Result boundary |
| --- | --- | --- |
| Story Planner | Develop concept; outline; describe cast/locations; revise named targets | Typed story proposals and stable subject identities; no acceptance or downstream scheduling |
| Manuscript Writer/Editor | Draft manuscript; reconcile narrative facts; revise selected units | Manuscript proposals and explicit changed facts/subject references |
| Art Director | Define style; specify sample; specify subject references; revise specifications | Creative specifications independent of generated assets |
| Page Composer | Paginate; compose page/cover; revise selected composition | Ordered page plan, source coverage, panels and exact lettering; no image dispatch |
| Image Executor | Prepare; Generate | Prepare returns final request plus identity; Generate executes that exact authorized request and returns original output handles/evidence |
| Quality Reviewer | Assess text/specification/request/image/whole-book; verify correction | Scoped findings, disposition, inspected-input coverage and limitations; no repair execution |
| Manager | Create; continue; revise; recover | Calls scoped services, persists proposals, selects revisions and proposes completion through app contracts |

Every child request binds contract version, invocation/operation identity, expected
service publication, operation, target scope, exact source revisions/content hashes,
constraints and applicable feedback. Inputs contain sufficient selected context;
children do not discover private app state. A result echoes its bindings and contains
typed proposals or an operational outcome. Runtime-observed child identity must be
verified independently of an echoed model field.

Grouped results have unique item identities, explicit source references and an
enumerated requested/returned scope. Missing items cannot be treated as success.
Partial proposals may be retained, but Manager decides whether to request missing
work or accept a smaller scope where product rules permit. Contract invalidity,
provider failure and uncertain paid execution are separate from creative findings.
An incomplete assessment cannot represent a pass for uninspected content.

Prepare must be deterministic and unpaid if it only serializes an already complete
creative specification. If creative request construction needs a model, declare it
as paid work tracked under Manager controls and usage safeguards; do not hide a model call in preparation.
Generate may translate validated settings into provider syntax but must not rewrite
the approved prompt, lettering or ordered reference content.

### Paid execution and evidence boundary

Manager controls paid dispatch, call grouping, retries and concurrency. App operation
records bind stable item identities, exact request/source hashes and execution evidence;
they are not signed spending grants or provider-cost reservations. No executor-level
single-use enforcement, distributed claim service or new infrastructure is required
for the v1 usage safeguard. Disable automatic retries around paid calls.

The configured usage ceiling applies to one paid production/version. Continuations,
platform corrections and customer revisions within that production share its usage.
A new paid production has its own ceiling. This is distinct from customer credits,
purchases and revision allowances, whose existing hard accounting rules remain.

Use provider-reported cost when available, otherwise a clearly labelled estimate
with a recorded pricing revision. Reconciliation replaces the estimate for the same
call rather than adding another charge. Keep actual, estimated and unknown coverage
visible; missing usage is never represented as known zero. Do not double-count child
calls and parent summaries or treat a model's assertion as provider evidence.

At an enabled configured ceiling, the app blocks new paid work. Reads, original-byte
retention, result attachment and reconciliation remain available subject to ownership
and integrity checks. Already-dispatched calls may finish and exceed the ceiling;
record that overage. This is a safeguard, not a strict maximum-spend guarantee.
Manager should consult current usage and safeguard status before further dispatch.

An unknown call retains its identity, evidence and incomplete usage status. Never
blindly replay it. Manager may continue independent work, including paid work, while
reconciling that item, unless another applicable safeguard or product rule blocks it.
Unknown estimates count toward the cost safeguard when an estimate is available;
unknown actual cost is still labelled unknown. Completed siblings are not replayed.

Distinct child invocation/item identities, out-of-order results, partial completion
and per-item reconciliation must be supported. One active Manager mutation workflow
per production remains compatible with independent children. Manager coordinates
conflicting edits and persistence fences; an unrelated unknown child must not cause
an unconditional production-wide dispatch lock. Parallel execution remains a later
Manager choice, not an initial delivery requirement.

Record Manager reasoning, Reviewer and specialist calls, including separately billable
preparation/counting calls where applicable. Provider/model support and evidence paths
still need verification; no child-to-Unitale callback is introduced by usage reporting.

### Correction policy and source changes

Recommended policy behavior: bind a policy identity and immutable configuration
snapshot to each correction chain. Continuation uses that snapshot and durable
counters; publishing a newer Manager does not reset attempts or silently replace
the policy. Changing a bound policy requires an explicit migration decision, with
prior attempts preserved. Product ceilings remain authoritative at admission.

Manager determines revision impact. A changed source does not silently update any
existing revision's provenance. Proposed reuse mechanism: Manager records an
explicit revalidation of retained content against the exact replacement source set,
with assessment evidence where its policy requires it. App verifies identities and
product locks, not the creative conclusion. The new lineage/acceptance must be an
immutable record; the original revision and earlier acceptance remain readable.
The package specification chooses a new revision with `revalidatedFrom`; current
strict source-freshness checks do not yet implement this reuse behavior.

The planned v2 clock contract is defined in the package specification: finite active
parent-execution time across attempts, excluding human waits/durable pauses, with
existing entitlement expiry separate. Preserve v1 duration-field semantics.
Provider deadlines, workflow-step limits, correction counts and currency ceilings
are different limits and must not be substituted for one another.

### Minimum UI and core-extension boundary

Use the existing Run UI for the first package, including entry/return, progress,
questions, review, retained results and allowed revision requests. Do not build a
separate booklet list/start/work page. Wire booklet admission and continuation into
the existing Run flow where required. The UI must distinguish
customer revision consumption from platform-funded correction and show resumable
failure/unknown states without offering unsafe duplicate dispatch.

Review rendering needs bounded typed text/specification and image cards, with exact
artifact/revision targets. Large manuscripts and page sets require paging or bounded
detail views, not JSON inside a summary card. Human responses bind to the displayed
request and revisions; Manager owns the interpretation and next action.

Booklet originals/derivatives need their own authorized media resolver or an explicit
project extension to the shared resolver. Do not insert booklet IDs into the Run
asset route without the corresponding ownership contract. Reusable Run rendering,
media-resolution or lifecycle hooks belong upstream in Unibase if current extension
points cannot support them. Booklet routes, view models and product policies remain
in Unitale. The selected A20 interface delta is an implementation prerequisite, not
a claim that those extension points already exist.

### Closure criteria

Design closure means an explicit owner, contract and acceptance criterion; it does
not mean a missing feature is implemented. G01–G09 have working contract directions
above, with executable schemas and usage-evidence integration still unimplemented. G10 and
G14 require real composition/transport evidence; G11–G13 need implementation and
UI verification; G15 requires dependency setup and fresh checks. Keep all gaps open
until verified; G16/G17 require item-aware media and per-kind output constraints. Keep
implementation status separate from settled design choices. No gap is resolved
until the applicable evidence exists. User preferences, model configuration and
live/paid approval remain separate from technical defaults.

### Additional source findings

Read-only inspection of the pinned experiment adapters confirms that the image tool's
`deliver` path sends evidence and original bytes to hardcoded Booklet callbacks. The
text adapter supplies bounded deadlines, no-retry behavior and usage evidence but
uses a Booklet-specific prepared carrier. Reuse lessons and narrowly adapt supported
mechanisms; do not install or mutate shared plugins during this design session.

Unitale's existing Manager creation service supports exact-publication copying with
an import journal and graph-parity check. This is a viable documented ownership path
to evaluate; it does not prove staging credentials, destination configuration or an
existing app's ownership. No console app may be adopted solely from its display name.

The existing server extension contract already supports product-type registration,
so registering booklet consumption fields belongs in the Unitale extension rather
than a new commerce framework. Existing Run UI cards and media authorization still
follow A19-A20 of the package specification; no implemented extensibility is assumed from comments alone.

## Validation and acceptance

Future acceptance covers creation and returning to an existing production; variable
package sizes; grouped identities; actual human interaction and pause/resume; Manager
preflight producing zero image calls on failed/stale review; all review modes; targeted
correction/exhaustion; locks and financial limits; uncertain-outcome reconciliation;
original-byte persistence retry; and manifests beyond the current metadata limit.

Add boundary tests proving that missing human/quality passes do not independently
block app lifecycle operations under the new contract, while Manager still follows
its review policy and app product/financial checks remain effective. Focused workflow
tests must not introduce orchestration decisions through hidden callbacks or retries.

Use affected contract, booklet repository/lifecycle/media/MCP, Run/Dify transport and
registration tests. Runtime changes also need typecheck, lint and build. UI changes
need desktop/390px English/Arabic, keyboard, recovery, authenticated media and CSP
checks; administration remains English/LTR. Run applicable documentation, environment,
i18n, skills and migration checks. Each implementation checkpoint needs two consecutive
clean read-only reviews; final reviews cover the integrated change. No delegation is
authorized by this document.

Current evidence is limited: administrative Dify reads succeeded on 2026-11-08, but
the observed `Unitale [staging]` app has `app:unibase-staging` metadata, not verified
Unitale ownership. Targeted Human Input/Loop/Tool default queries returned empty
objects (Human Input initially had a transient network failure). This does not prove
capability absence or successful execution. Earlier offline checks were blocked by
sandbox `EPERM` and missing dependencies. Environment preparation on 2026-11-08 resolved
the local setup: all 11 existing compatibility tests and typecheck now pass outside
the sandbox. The delivery plan records current tooling/check evidence; none proves
new candidate graphs or deployed composition.

## Open questions and limits

### Implementation-readiness audit

**Status: technical resolutions selected and documented; implementation and target
verification pending.** The selected workflow-first order is
[01-12](implementation-plan.md#issue-10-deliverables-and-dependency-map), replacing the
application-first C0-C10 sequence. 01-06 author/validate candidate workflows against
package-local contracts; 07-12 implement the app and establish integrated/live proof.
This register records design resolution, not completed implementation, executable
schema validation or compatibility evidence. No implementation is authorized by this
update. The [package specification](workflow-package-spec.md#technical-resolutions-for-a01-a22)
is canonical for the detailed resolutions.

A IDs are design findings; G01-G17 remain implementation gaps; E1-E6 remain evidence
and setup gates. A resolved design can still depend on a failed/unrun probe before
its final target binding is usable. Do not describe the entire package as ready for
unattended staging execution solely because this table is populated.

| ID | Original gap and selected resolution | Canonical contract | Implementation / proof |
| --- | --- | --- | --- |
| A01 | Freeze strict v2 envelopes, item/batch status, persisted kinds/subjects, null rules and code-point lettering spans; balanced optional creative detail | [Wire/content](workflow-package-spec.md#a01-a03---wire-storage-and-identity) | 01 contracts; 03-05 workflow fixtures; 07 runtime schemas |
| A02 | Explicit record/index map; separate repeated assessments from unchanged v1 quality uniqueness; versioned reads and rollback | [Storage](workflow-package-spec.md#a01-a03---wire-storage-and-identity) | 01/06 storage proposal; 07 migration/read tests |
| A03 | App-issued stable IDs, local-key remap before persistence, exact canonical projections and Unicode/order vectors | [Identity](workflow-package-spec.md#a01-a03---wire-storage-and-identity) | 01 cross-runtime vectors; 03-05 remap fixtures; 07 persistence |
| A04 | Nineteen v2 tools; dispatch/observation/checkpoint ownership, scoped cursors, permissions and fences | [MCP](workflow-package-spec.md#a04---mcp-transition-ownership) | 01/05 proposed tool fixtures; 09 actual handlers |
| A05 | Idempotent queue-order then production then start/enqueue sequence; existing unbound abandonment and bound release | [Admission](workflow-package-spec.md#a05-a07---admission-and-crash-recovery) | 01/06 admission handoff; 09 boundary fault tests |
| A06 | Lost parent is not terminated; unknown child allows independent same-parent work; partial recovery uses checkpoints, successful-result application remains separate | [Recovery](workflow-package-spec.md#a05-a07---admission-and-crash-recovery) | 05 partial/unknown fixtures; 09-10 actual recovery |
| A07 | Durable dispatching before paid node; late evidence resolves unknown; call/item separation and no blind replay | [Dispatch](workflow-package-spec.md#a05-a07---admission-and-crash-recovery) | 02/05 dispatch fixtures; 09 crash/partial-output tests |
| A08 | Adapter receipts through Manager and verified observer; lost evidence stays unknown, known execution survives retention failure; no durable Dify spool | [Trusted evidence](workflow-package-spec.md#a08-a09---trusted-receipts-and-effective-usage) | 02 receipts/probes; 05 fixture observer; 08-09 verified runtime path |
| A09 | One effective amount per call, actual over estimate, explicit conflicts/currency, late observation lifecycle and active-time union | [Accounting](workflow-package-spec.md#a08-a09---trusted-receipts-and-effective-usage) | 01/05 accounting fixtures; 09 clocks/duplicates/late-cost tests |
| A10 | Target/family/allocation correction roots; dispatch increment, proven no-dispatch release, grouping/candidate/resume rules | [Corrections](workflow-package-spec.md#a10-a12---corrections-revalidation-and-retention) | 01/03-05 counter fixtures; 07/09 durable transactions |
| A11 | Immutable same-content/assets revalidation; new sources/acceptance; no locked creative-change bypass | [Revalidation](workflow-package-spec.md#a10-a12---corrections-revalidation-and-retention) | 01/05 revalidation fixtures; 07/09 source/lock tests |
| A12 | Restricted trusted retention/reconciliation after cancellation/expiry/refund; no new entitlement or revived capability | [Retention](workflow-package-spec.md#a10-a12---corrections-revalidation-and-retention) | 05 restricted-recovery fixtures; 09 capability/cleanup tests |
| A13 | Remove stateful file utility; native MCP image content inbound and restricted Dify downloader outbound | [Files](workflow-package-spec.md#original-byte-transfer-protocol) | 02 provisional probe; 08-09 native bridge; 11-12 final round trip |
| A14 | Explicit candidate 8 MiB image/256 KiB carrier bounds; sectioned JSON, bounded role context and paginated history; transport bytes and model budgets measured separately | [Transport bounds](workflow-package-spec.md#original-byte-transfer-protocol), [context](workflow-package-spec.md#a17-a18---manager-control-and-reviewer-coverage) | 01 bounds; 02/04/06 capacity fixtures; 11-12 target measurement |
| A15 | Immutable suite-specific app/tool identities with explicit publication bindings; check admission/resume, preserve old suites | [Pinning](workflow-package-spec.md#a15-a16---immutable-suite-bindings-and-provenance) | 02 disposable binding probe; 06 slots; 12 paused-old-suite evidence |
| A16 | Narrow provider adapter, reference mapping, zero retries; validate actual graph parameters, empty/native files and credentials; select final answer before validation | [Adapter](workflow-package-spec.md#graph-conventions-and-technical-dependency-boundary), [provenance](workflow-package-spec.md#a15-a16---immutable-suite-bindings-and-provenance) | 02 adapter/ABI; 03-06 actual graphs; 12 installed-host evidence |
| A17 | 64-action/64 KiB bounds and operational-state precedence; reuse by call identity, intentional identical-input candidates allowed; bounded no-progress detection | [Manager](workflow-package-spec.md#a17-a18---manager-control-and-reviewer-coverage) | 01 action table; 05 same-call/candidate/pending-work journeys |
| A18 | Exact artifact/source coverage, per-kind dimensions and cover criteria; four-page windows and recurring-subject comparisons | [Reviewer](workflow-package-spec.md#a17-a18---manager-control-and-reviewer-coverage) | 03-04 calibration fixtures; 05 coverage orchestration; 12 actual pixels |
| A19 | Request/attempt/presentation/revision/form correlation; first valid authentic submission; paged cards and UI states | [Human/UI](workflow-package-spec.md#a19-a20---human-correlation-and-minimal-upstream-seams) | 01/05 correlation fixtures; 10 browser/race tests; 12 actual resume |
| A20 | Minimal optional domain/client/MCP/file/observation seams upstream; Unitale owns booklet routes and policies | [Upstream delta](workflow-package-spec.md#a19-a20---human-correlation-and-minimal-upstream-seams) | 01/06 precise handoff; 08 reviewed import and generic fallback tests |
| A21 | Harness loads seven actual exports/Code nodes; string carrier tests; synthetic v1 harness remains regression-only | [Export verification](workflow-package-spec.md#a21-a22---actual-export-verification-and-configuration-ownership) | 03-06 actual candidate YAML/Code tests; 11 app integration |
| A22 | Separate 02 provisional probes from final reruns; configuration ownership, explicit capacities, numeric live caps | [Configuration](workflow-package-spec.md#a21-a22---actual-export-verification-and-configuration-ownership), [plan](implementation-plan.md#issue-10-deliverables-and-dependency-map) | 02 provisional probes; 06 candidate evidence; 11-12 final gates |

Remaining gates are concrete verification and operator inputs: dependency baseline,
target-runtime behavior, reviewed upstream import, owned Manager registration,
publication readback and finite paid acceptance. Product capacities and deployment IDs
must be supplied/verified at their named gates; this document invents neither launch
packages nor spending authority. Existing model choices, optional human review policy,
Manager-only gateway and safeguard ownership are not reopened.

The [agentic-poc lessons audit](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/LESSONS-LEARNED.md)
refines these selected designs, not the seven-workflow architecture. Reuse Unitale's
terminal-evidence recovery, media retention and success-only result application;
keep partial work in Manager checkpoints. Separate execution, output validity and
retention outcomes. No new scheduler, Dify-local receipt store or app-owned creative routing is
selected. Receipt-loss handling promises safe uncertainty/no replay, not recovery of
data Dify never exposed. The [delivery plan](implementation-plan.md#issue-10-deliverables-and-dependency-map)
assigns targeted probes/regressions to 01-12; compatibility and live acceptance remain
pending, and clean journeys cannot be replaced by repaired historical evidence.

A bounded authorized 02 prototype can obtain missing evidence before production
integration exists. Do not demand final 11/12 evidence to authorize the prototype,
or mistake prototype success for final-target proof. Any discovered incompatibility
must be recorded and resolved before dependent binding work proceeds.

## Sources and maintenance

- [Issue #10](https://github.com/Uniwares-LTD/unitale/issues/10) supplies the original requirements; the explicit replacements above govern this design.
- [Published reference package](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/README.md), [prompt/schema catalog](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/catalog.json) and [migration reference](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/unitale-migration.md) provide reusable creative material, not target graphs or runtime proof.
- [Staging runbook](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/staging-runbook.md) owns reference tooling/provenance. Installed text dev7/image dev3 experiment adapters are not verified Unitale drop-ins.

Keep accepted decisions, proposals, code observations and live evidence distinct.
Record new decisions here and reconcile PRD/contract/model implications. The existing
delivery plan defines 01-12 checkpoints and explicit execution gates. Do not mark G
implementation gaps complete or E evidence gates passed without their required proof. Future exports belong in `workflow-package/` with one current
secret-free DSL and README per workflow plus root README/provenance manifest; no
placeholder export is created during this environment/documentation handoff.
