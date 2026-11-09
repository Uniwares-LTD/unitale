# First Dify package specification

## Outcome

Deliver seven readable Dify workflows and a precise application integration handoff.
[Workflow design](workflow-design.md) owns accepted behavior and boundaries;
[delivery plan](implementation-plan.md#necessity-and-simplicity-gate) owns sequencing,
necessity/simplicity checks, reviews and authority. Dify/YAML is the source of truth.
The 2026-11-09 simplification replaces the custom provider, generated schema inventory,
TypeScript authoring framework and graph interpreter. Their removal does not reduce
accepted booklet behavior. Application contracts below are proposals until 07.

## Scope

Manager, Story Planner, Manuscript Writer/Editor, Art Director, Page Composer, Image
Executor and Quality Reviewer. All creative prompts, preparation and orchestration
live in Dify. Only Manager receives private Run context or calls application MCP.
Children return proposals, assessments, files or explicit operational outcomes.
No child callbacks, application creative serializers or additional workflows.
Use existing Run UI; no separate creator workspace. No application implementation,
live operation, paid call, commit or push is authorized by this document.

## Acceptance

- Seven secret-free native-node YAML candidates, essential inline checks and focused fixtures.
- Every accepted operation maps to a role. No fixed persona, subject or panel counts.
- Manager owns quality, exact preflight, optional humans, correction and completion policy.
- Exact text, original images, explicit partial/unknown outcomes and durable continuation.
- Local evidence and pending target-runtime evidence clearly distinguished.
- Minimum necessary application changes specified, without implementing them before 07.

## Source-to-service mapping

Pinned source: [published catalog](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/catalog.json).
The retained selector fixture records 48 selectors, source hashes and both publication
and extraction commits. Six tester selectors are excluded from production. The
reference's callbacks, patched plugins and fixed persona counts are not target requirements.

| Reference | Role / operations | Meaningful output |
| --- | --- | --- |
| J01-J04 | Story Planner: concept, outline, cast, locations | Story direction, ordered beats, individual subject descriptions and roster |
| J05-J07 | Manuscript: write, reconcile_characters, reconcile_locations | Ordered units, exact renderable text, sourced narrative facts |
| J08-J10 | Art Director: style, sample_spec, character_spec, location_spec | Reusable style and targeted image specifications |
| J11-J12 | Page Composer: paginate, compose | Ordered layout, panels, exact text routing, page/cover specifications |
| J13 / serializers | Image Executor: prepare, generate | Deterministic final request; exact provider execution and original files |
| Judges | Reviewer: text, specification, image_request, image, whole_book, correction | Scoped coverage, findings, disposition and limitations |
| Manager | create, continue, revise, recover | Serial coordination, app communication and checkpointed intent |

Every creative operation supports scoped revise with explicit baseline and feedback.
Existing IDs remain stable. New subjects use local keys until Manager registers IDs.
Do not copy missing facts into invented established constraints. Useful creative detail
is retained where downstream generation, review or revisions consume it.

## Shared wire contract

Children use Start `request` (bounded JSON string) and ordered native `references`.
End exposes `result` (JSON string) and native `files` where applicable. The minimal
versioned envelope binds invocation/call identity, role/operation, intent, identified
items, target scope, explicit sources with content hashes, constraints and feedback.
Reference manifest entries bind position, immutable asset/source identity and native
handle. Temporary URLs/file IDs are transport, not content identity.

Results echo request identity and enumerate each requested item's outcome. Supported
statuses are succeeded, partial, needs_input, invalid_input, failed and unknown.
Missing items never imply success. Model content cannot assert observed publication,
provider execution, authenticated human response, retained original or actual cost.

Keep schemas beside their actual consumers in YAML. Do not generate a parallel
inventory of every internal type. Structural validation does not establish source
truth, exact text coverage, actual image pixels or provider provenance.

### Balanced content contracts

Concept contains title, premise, audience, tone and constraints. Outline contains an
ordered story and stable beat IDs. Subject descriptions distinguish sourced established
facts from proposed design. Manuscript separates non-rendered action from ordered
visible text items with IDs, kinds and speakers. Style includes reusable direction,
native typography and exclusions. Specifications identify purpose, subjects, style,
required features and source bindings. Layout identifies ordered page/panel roles,
canvas, reading direction and exact manuscript spans. Page specifications preserve
that routing and add composition/action. No-text panels have no lettering.

Preserve Unicode, whitespace and reading order exactly. Span offsets count Unicode
code points. Every required text span is routed once; explicit splits retain order.
Covers use applicable title/credit text. New dialogue requires manuscript revision.
Digital canvas dimensions are product facts; do not require print/trim/binding fields.

## Image Executor and Reviewer

Prepare is deterministic and unpaid: assemble supplied specification, immutable style,
exact lettering and ordered reference manifest. Hash meaningful request content and
settings; exclude transient handles. Generate executes that exact request, without
rewriting prompts, dropping references, changing settings or resizing original outputs.
Executor validates its inputs and has no independent quality-policy gate.

A paid call and its output images are separate identities. Retain originals individually;
multiple/partial outputs never collapse into a fictitious single success. Record
unknown when dispatch/result evidence is insufficient. Missing usage is unknown, not zero.

Reviewer supports all six modes. It inspects supplied text/specification, final image
request, actual original pixels, ordered whole-book windows or before/after correction
pairs as applicable. Whole-book windows cover at most four pages plus explicit
cross-window continuity comparisons. A pass requires complete requested coverage.
Findings identify criterion, target, expected/observed evidence and confirmed/advisory/
uncertain classification. Dispositions: pass, repair, inconclusive, blocked. Operational
failures are not invented quality defects. Reviewer never dispatches a correction.

## Minimal Manager behavior

Use native bounded serial control and explicit service branches. Read authoritative
app state before deciding; durable operation facts override checkpoint intent. Default
journey: brief, concept/outline/subjects, manuscript/reconciled facts, style/samples,
subject references, layout, pages, whole-book assessment, selected manifest.

Manager checks artifacts before accepting/downstream use. Before image Generate,
require a pass for the exact prepared prompt, settings, sources, ordered originals
and reviewer/policy binding. Meaningful changes invalidate preflight. Review every
image kind after generation. Whole-book acceptance covers all ordered actual pages
and continuity comparisons. Aesthetic advice/inconclusive evidence does not trigger
regeneration. Correct only confirmed defects, selecting the smallest affected scope.

Persist correction roots and counters: three text/request corrections and one image
correction after the initial attempt. Reviews consume no correction. Continuation,
candidate IDs and transport retries do not reset counters. Exhaustion pauses with
findings and a resolution path. Customer revisions retain separate purchased allowances.

Human checkpoints are optional Manager policy; group material questions and honor
explicit user review/autonomy preferences. Financial consent remains app-owned.
Checkpoint intent before human waits/dispatch and after retained results. Same-run
Human Input resumes the existing execution. A successor requires verified termination
and app admission. Never replay unknown paid work; independent work may continue.
Retain partial results and stale outputs as evidence; revalidate unchanged content with
new source identities rather than editing immutable history.

### Acceptance and revalidation records

Separate Manager acceptance, immutable Reviewer assessment and authenticated human
response. New acceptance binds exact revision/hash/sources and policy/publication.
Revalidation preserves content/assets with new source bindings and lineage. App checks
ownership, identity, locks and funding, without deciding creative impact or quality.

## App, MCP and UI change inventory

The [integration handoff](workflow-package/integration-handoff.md) owns exact proposed
boundary fields and the mapping to current application interfaces. Reuse existing
MCP services and stateless transport. Add only capabilities actually consumed by the
candidate Manager; do not require a wholesale 19-tool catalog replacement. Keep v1
readers, tools and in-flight bindings unchanged. No parallel REST tool surface.

### Usage accounting and safeguards

Trusted Dify/provider observations establish execution identity and usage. Model content
and diagnostic tool output do not. One effective cost per call: reported cost replaces
a labelled versioned estimate; missing evidence remains unknown. Do not sum parent
summaries and their leaf calls. Production-wide ceilings include continuation/corrections;
reads, retention and reconciliation remain available at the ceiling. Already-dispatched
work may exceed it. No signed spend grants, provider reservations or hard-spend guarantee.

### Original-byte transfer protocol

Prefer existing managed MCP native-image content inbound and restricted Dify file
retention outbound. Verify actual bytes, hash, MIME, dimensions, order and expiry. No
stateful file plugin or child-to-app callback. Do not reconstruct large image bytes
in Code nodes or substitute thumbnails. Pending native-file mapping blocks activation.
Candidate JSON carriers are bounded at 256 KiB and originals at 8 MiB pending measured
target capacities; fail explicitly without truncation or silently limiting the product.

### Operation lifecycle and error handling

Register stable work/request identities before paid dispatch. Checkpoint intent is not
proof of execution. Known success, output validity and retention are separate facts.
Reconcile uncertain work before replay; known storage failure retries retention only.
Cancel stops new dispatch. Expiry/refund/cancel recovery may retain already-paid evidence
through a restricted trusted path without reviving a Manager capability or entitlement.

## Dify construction and configuration inputs

### Graph conventions and technical dependency boundary

Dify/YAML is authoritative. Maintain seven workflow files in the UI and export/review
changes. No generator, bundled dependency runtime or custom provider package. Code
nodes contain only essential validation, routing, hashing and deterministic serialization.
Use native Loop for bounded Manager control and native Iteration for explicit batches
where needed. Preserve failed slots; do not remove failed outputs to fabricate completeness.

Default dependencies: official `langgenius/openai` for text/vision/structured output and
`langgenius/openai_tool` for image generation/edit. Pin actual installed package hashes
at activation. Source reviewed at official repository commit
`3326464451bbbb6d2060ef6645d826b6f82aa15b` in the now-withdrawn PR #4238; candidate manifests
report 1.1.1 and 0.2.3 respectively. These are tested candidates, not accepted
official releases or production installation identities.

Required gates: exact configured models/settings, native structured output, ordered
originals, useful execution/usage observations, disabled paid-call retries and bounded
timeouts. Unmodified upstream source at `18663b9e723c345fed4c7450a3f925c583fa7064`
omits SDK overrides and rejects the dated model. The submitted fixes address those
gaps; activation remains blocked on approved provider adoption/integration acceptance. Do not infer SDK
retry behavior from Dify-node retry flags or substitute an alias for the dated model.
The [provider path assessment](workflow-package/integration-handoff.md#supported-provider-path-assessment)
records checked alternatives and the authorized, offline-tested upstream patch to
the existing official plugins. It is a bounded exception for demonstrated gaps,
not a new Unitale production plugin. The subsequent full-compatibility authorization
permitted temporary namespaced test builds to preserve the shared experiment plugins.
Upstream submission, isolated installation and no-money declaration/DSL checks are
verified. Subsequent actual Luna structured-output, Sol vision and dated Sunburst
Generate/Edit probes pass; the handoff records failed probes, minimal DSL corrections,
usage estimates and retained liabilities. The [local provider proposal](workflow-package/integration-handoff.md#proposed-local-provider-solution)
replaces waiting for official release with a proposed isolated build of the same
plugins/patch; it does not authorize adoption or installation. Application integration
remains pending. The user explicitly stopped at the validated provider handoff;
temporary apps/plugins are removed and checkpoints 07-11 require separate authorization.
The US$1 total cap does not clear activation gates.

Native model schemas use closed objects. Specialist proposal content is a JSON string
only inside the model response, decoded by the inline pack node before existing
content/scope validation. Workflow and Manager/application results still use content
objects. Keep both target-compatible structured-output switch names in each LLM node;
do not silently substitute plain-text parsing for native structured output.

### Concrete runtime record and UI decisions

Keep v1 semantics and records. Necessary v2 boundaries are proposals; do not design
all collections/indexes before the workflows establish their need. Reuse existing
production/revision/original-media, consumption, execution and Run services. Human
cards identify exact request/presentation/targets; authenticate and correlate submissions.
App stores Manager intent opaquely and enforces fences, ownership, entitlement,
product locks and durable counters. It supplies facts, never creative eligible routes.
Implemented model documents/JSON example/both Mermaid versions remain unchanged because
this package does not change application schemas or persistence. Update all at 07.

Initial model slots retain reference choices: `gpt-6-luna` for Manager/creative work,
`gpt-6-sol` for independent review, `gpt-image-2.5-sunburst-2026-09-08` for images.
Defaults are configuration, not service enums. Never silently substitute models.

## Technical resolutions for A01-A22

These anchors retain links from earlier design material; implementation prescriptions
were simplified on 2026-11-09. Accepted behavior remains in the sections above.

### A01-A03 - Wire, storage and identity

Keep essential versioned boundaries, exact Unicode, stable IDs and immutable provenance.
Defer executable application schema/storage changes to 07; omit generated type inventories.

### A04 - MCP transition ownership

Manager-only managed MCP. Minimum actual operations and fields are in the handoff.
Reuse bounded reads for history, human responses and observations where possible.

### A05-A07 - Admission and crash recovery

Reuse prepaid admission, Run-owned fencing and trusted terminal recovery. Unknown is
not terminated and never permits blind paid replay. Keep completed siblings.

### A08-A09 - Trusted receipts and effective usage

Use verified native execution/provider observations. No custom receipt ABI or Dify-local
spool. Missing evidence remains pending/unknown; never promote model JSON to authority.

### A10-A12 - Corrections, revalidation and retention

Preserve durable limits, immutable lineage, product locks and restricted recovery.

### A15-A16 - Immutable suite bindings and provenance

Pin Manager, each child publication/tool, provider versions, policies and configuration.
Official plugins first; a proven gap requires a plan amendment before custom code.

### A17-A18 - Manager control and Reviewer coverage

Bound Manager to 64 actions per execution and its checkpoint to 64 KiB. Do not let a
continuation reset durable correction limits. Check exact scope and actual pixel coverage.

### A19-A20 - Human correlation and minimal upstream seams

Authentic request/attempt/presentation/target correlation; only demonstrated generic
seams originate in Unibase. Booklet policy remains Unitale/Dify-owned.

### A21-A22 - Actual-export verification and configuration ownership

Test actual YAML structure and essential inline code, without an engine emulator.
Operator supplies credentials, installed identifiers, capacities and finite paid caps.
Record source inspection, local tests, import, execution and acceptance separately.

## Validation requirements

Follow the delivery plan. Focus on exact text, source/original identity, incomplete
coverage, partial/unknown results, correction limits, continuation and privacy. Static
checks must not be reported as Dify journeys. Two clean read-only reviews per checkpoint.

## Open questions and limits

### Remaining evidence gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| E1 | Exact models/settings, structured output, original image calls, no automatic retries and trusted usage | Provider feasibility verified on isolated candidates; local provider adoption and application-bound observations pending |
| E2 | Manager-only native-file byte round trip, order, hashes, practical capacity and expiry/recovery | Partial: two small originals passed native parent/child byte comparison; application path, capacity and expiry pending |
| E3 | Real child wrappers, nested control, partial failures, Human Input and durable resume | Partial: deterministic child, Loop/Assigner, failure branch and same-run native Human Input resume proved; Manager/application journeys pending |
| E4 | Owned Manager import, managed MCP permissions, suite/observer/reviewer bindings | Pending |
| E5 | Exact briefs/languages/products, configured prices and finite approved paid cap | Pending |
| E6 | Current local checks/reviews at the candidate identity | Recorded in candidate evidence |

### Feasibility evidence requirements

When separately authorized, use disposable apps to prove deterministic child echo,
finite control, authentic Human Input/resume, two-original byte round trip, publication
pinning and usage reconciliation. Paid text/image/edit/pixel-review probes additionally
need a finite approved budget. Capture exact versions, sanitized results, hashes and
measured limits. A failure blocks its dependent binding, not independent local work.
