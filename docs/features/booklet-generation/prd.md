# Unitale booklet generation requirements

The [workflow design](workflow-design.md) records the accepted issue #10 delivery
and ownership decisions. It supersedes the earlier application-enforced human/quality
gates for the target design. Existing T14-T17 code still implements those older guards;
v1 behavior remains unchanged. The DSL-first local candidate through 06 and local
v2 storage/runtime integration through 09.7 are implemented and locally reviewed. Current verification is in the candidate README. Creator UI is 10,
integrated validation 11 and authorized target acceptance 12.

The [A01-A22 technical resolutions](workflow-package-spec.md#technical-resolutions-for-a01-a22)
and [01-12 checkpoints](implementation-plan.md#issue-10-deliverables-and-dependency-map)
record workflow-first delivery: complete the candidate package and application-change
handoff at 06, then require explicit authorization before app implementation at 07.
Scope B subsequently supplied that authorization; the active goal stops before 10.
The first phase uses official Dify plugins and native YAML with essential inline code,
without a custom plugin or Unitale/Unibase runtime changes.
These checkpoints do not
mark G implementation gaps or E evidence gates complete. Native MCP image transfer
replaces the proposed stateful file utility; a lost parent must be reconciled before
successor admission. These refinements preserve the accepted product boundaries.

## Outcome and users

Registered creators buy configurable booklet production using credits, guide the
orchestrator through authenticated human decisions, and receive an accepted book
with a private reader, images, PDF and revocable sharing. Administrators manage
purchase offers, consumption packages, provider publications and failed production.

## Scope and flows

Web and Android TWA share one account wallet. Web uses Stripe and Android uses
Google Play. A persistent booklet has multiple paid production versions; continuing
a version does not repurchase it. Preserve existing Runs, purchases and artifacts.
Exclude iOS, uploads, manuscript imports, discovery, printing and persona creation.

The dispatcher calls only Manager. Manager calls the focused narrative, art, page,
image and independent quality services, manages human interaction and accesses MCP.
Children have no MCP credential or private Run context. All workflow tools use
`/api/mcp`; ordinary browser/admin routes and payment webhooks remain ordinary APIs.
Issue #10 uses the existing Run UI for start/review/resume/revision, with necessary
booklet integration and no separate booklet pages. Manager owns call grouping and
parallelism; the initial serial strategy is not an app or service-contract restriction.
The full creator workspace and delivery features remain their
separate milestones; the seven-workflow package is one integrated staging delivery.

## Requirements and acceptance

### R01 — Configurable creation

Published packages define story-page/cover counts, character/location and panel
limits, style samples, canvas/output settings, languages, credit prices, included
and extra revisions, repair limit (default one/output), finite execution and spending
ceilings and optional entitlement expiry (default none). No predefined launch
packages. Validate against execution-profile capacity and reject unsupported
combinations without truncation. Input is a text brief, audience, descriptions and
preferences. Preserve en/ar UI; book languages require separate lettering/RTL acceptance.

### R02 — Persistent productions

Each version snapshots its package/order, source production, locks, entitlements,
artifacts and execution history. Allow one active mutation workflow per production.
New paid versions reopen story/references and preserve completed predecessors.
Reused creative content requires explicit Manager acceptance with exact provenance;
Manager decides whether to ask the human. Test concurrent starts and stale tabs.

### R03 — Operational schema

Persist Booklet and Production documents. Production embeds a bounded subject roster
with nested artifact identities and current/accepted revision pointers; there are no
separate Subject or Artifact collections. Keep immutable Artifact revisions, authenticated
Decisions, Operations, Execution measurements and Quality reviews as separate records.
Use production version/fencing for nested index mutations. Stable subjects identify
book/character/location/physical page. See the [document model](model.md). A completed book is a book-manifest artifact
revision containing exact accepted content and ordered cover/page assets, not an Edition
collection. Store raw prompts, large envelopes and traces in referenced evidence
storage; no ownership, billing, approval or completion fact may depend on log searches.

### R04 — Measurements

Per-call records retain provider/model, workflow/publication/request IDs, input/output
and additional usage, reported cost/currency, separate estimated cost/pricing provenance,
queued/start/end times and duration, outcome and evidence references. Missing is unknown.
Do not double-count parent summaries and children. Model claims are not billing evidence.
Customer credits and provider expenditure are separate.

### R05 — Orchestration and human decisions

Adapt source J01–J12 text and J13 image responsibilities. The manager sequences work,
clarifications, reviews and continuation. Unitale validates state without scheduling
specialists. Human decisions come from authenticated Run UI, bind exact revisions,
become stale when targets change and cannot be fabricated by tools. Manager alone
decides whether human approval is needed, what to ask and when/how to ask. The app
records authentic answers but does not require approval for generation, downstream
use or completion. Manager acceptance, human responses and quality assessments are
separate records/concepts. No fixed review mode or personas. Prove generated
parent/child, bounded loops and Human Input against the deployed Dify version;
offline fixtures alone do not prove live compatibility.

Common human-review checkpoints remain optional Manager policy. Prefer fewer
interruptions, combine related questions and ask only when context or the user's
requested control warrants it. Financial consent remains an app responsibility.
Use the published reference models initially, with model-independent service
contracts and replaceable versioned model/workflow bindings.

### R06 — Revision gates

| Category | Allowance unit | Lock boundary |
| --- | --- | --- |
| Story | Requested revision round | First reference generation |
| Style | Affected style reference images | First character/location sheet generation |
| Character/location | Stable reference-image identity | First page or cover generation |
| Page/cover | Selected physical page | Entitlement expiry/closure |

Extra paid revisions obey the same locks. Shared-style changes quote all affected
samples. Consume once per request, never per retry. Clarifications and automatic
repairs do not consume customer revisions. Page edits preserve locked sources.
Lock transactionally before downstream authorization; failure/unknown does not unlock.

### R07 — MCP security and operations

One configured service credential covers the catalog; automatic scoped Run context
still enforces ownership and allowed operations. Versioned tools read context, begin
operations, save revisions, record evidence, retain/read original assets, record quality,
retrieve already-persisted human decisions, record Manager acceptance, inspect
operations and complete structurally valid manifests. These are target capabilities;
the preserved v1 T17 catalog follows its earlier approval contract; the opt-in v2
Manager catalog implements the new boundary with local evidence through 09.6.
Stable idempotency keys and expected revisions make identical retries return the first
effect and changed payloads conflict. Keep secrets out of prompts, outputs and logs.

### R08 — MCP limits

Unibase admin configures request, fully serialized response, tool-result bytes and
execution timeout, preserving existing defaults. Include both structured and text
fallback in response bounds. Use bounded transfers, not long-running generation inside
MCP or silent truncation. Settings must apply consistently across replicas and fit ingress.

### R09 — Original images

Retain immutable provider bytes with hash, dimensions, MIME and provenance, separate
from display derivatives. Record exact approved sources and route only relevant refs.
Durable steps: retain/verify bytes, receipt, attachment, review/approval. Storage and
attachment retries reuse receipts without paid regeneration. Support private local
storage and configured private object storage without requiring cloud credentials.

### R10 — Quality

A separate versioned Reviewer assesses text, specifications, final image requests,
generated images, whole-book output and targeted corrections. Findings distinguish
confirmed repairable defects, advisories, inconclusive evidence and blocked execution.
Manager owns every quality gate, including exact-request preflight for all image kinds,
output review and whole-book coverage. Reviewer reports; Manager coordinates the next
action. Neither Unitale nor Image Executor independently requires a quality pass for
progression. Unitale still verifies evidence authenticity and integrity.

Review criteria include missing/wrong/unreadable lettering, missing required story
content, material character/location inconsistency and unusable layout. Manager
reviews artifacts before acceptance/downstream use, not every temporary draft.

Manager must not substitute human approval for a required pass or regenerate from
aesthetic advice or inconclusive evidence. Platform-funded corrections never consume
customer revision allowances. Manager's Dify configuration defaults to three LLM
corrections after the initial attempt and one image correction after the initial image.
App-enforced counters and product ceilings survive continuation. Exhaustion pauses
with findings and a resolution path. See the [ownership decisions](workflow-design.md#decision-and-enforcement-ownership).

### R11 — Purchases, subscriptions and promotions

Admin purchase offers are separate from consumption products. Define money, credits,
channel, interval, eligibility, discounts and expiry. One active subscription/account,
including pending cross-store transition. Monthly credits follow verified payment and
expire in 90 days; top-ups never expire. Cancel at period end; change plans at renewal
without proration; switch stores only after old subscription ends. Grandfather accepted
terms until explicit change. Verify, acknowledge/consume, restore and reconcile reversals
server-side with idempotent grants.

Provider catalog workflow is draft, preview, explicit publish, verified readback with
partial/unknown journals. Scheduled offers/codes support applicability, dates, global and
per-account limits and duration. One promotion/purchase. Common codes give bonus credits
after verified payment on either store; first subscription payment unless terms say otherwise.
Stripe supports monetary coupons; Play discounts require actual supported store offers.
Reserve redemption during checkout, finalize once after verified payment.

### R12 — Consumption

Trusted product extensions define packages/allowances. Charge upfront after configuration,
ownership, entitlement and capacity checks and before dispatch. Queue cancellation before
start is free. Continuation, internal calls, repairs and generic Run settlement cannot
charge again. Failed/cancelled started production retains charge pending admin refund.
Audited adjustments link original charges; fully refunded entitlements cannot continue.
Unknown provider outcomes require reconciliation, not automatic paid replay. Snapshot and
disclose optional expiry. Numerical examples are fixtures only.
Manager controls paid dispatch. Unitale records usage and overages, and can block new
paid work at a configured per-production ceiling as a safeguard, not a hard spending
guarantee. Continuations and corrections share the production's usage; a new paid
production has its own ceiling. Use reported cost when available, otherwise labelled
estimates with versioned pricing; replace estimates without double counting. Unknown
usage remains visible. Manager may continue independent work while reconciling an
unknown call, but must never replay that call blindly. Already-dispatched work may
finish and produce a recorded overage; retention, reconciliation and reads remain
available. Signed execution grants, provider-spend reservations and executor-level
replay protection are not v1 requirements. Existing hard customer-credit, purchase,
entitlement and product-lock rules remain app-owned.

### R13 — Delivery

Private ordered reader, accepted image downloads and deterministic cover-first PDF
preserve native lettering. Shares are unlisted, revocable and bind one completed manifest;
public downloads default off. Authorize every asset/PDF read, with no permanent public
object URL. Never expose prompts, costs, intermediate references or future versions.

### R14 — Retention and compatibility

Keep content/originals until owner deletion, revoke shares immediately and allow 30-day
recovery without restoring shares. Raw evidence defaults to 90 days, admin-configurable;
protect active/unknown-operation evidence. Retain metrics and financial audit separately.
Use forward-only namespaced migrations; do not reinterpret sample records. Admin remains
English/LTR and includes catalogs, publication status, failures/refunds, metrics, repair
budgets, MCP and retention settings.

## Decisions and sources

Accepted product requirements and the [workflow design decisions](workflow-design.md)
govern R01–R14. Local package completion does not establish live acceptance. The original
foundation used [agentic-poc at its pinned revision](https://github.com/karpishe-experiments/agentic-poc/tree/baa9dda25c041b2d7a77853f9f6c3daa73161217).
Issue #10 uses the newer published package pinned in the
[workflow design sources](workflow-design.md#sources-and-maintenance), not story-panel.
Source Real acceptance was incomplete; it is not Unitale acceptance.
Unibase owns reusable transport, execution evidence, commerce, wallet and admin frameworks;
Unitale owns book-specific rules, workflows and experiences.

## Dependencies and constraints

See the [delivery plan](implementation-plan.md). T01–T27 establish implementation;
T28 additionally requires authorized Dify/provider, Stripe, Play and installed-device
acceptance. No publication, live configuration or paid calls follow from plan approval.

## Open decisions and readiness

The original product baseline is accepted. Issue #10's workflow ownership changes are
accepted as documented in [workflow design](workflow-design.md). The
[package specification](workflow-package-spec.md) defines the planned service,
usage-evidence, compatibility and minimum UI contracts; the
[delivery plan](implementation-plan.md#issue-10-deliverables-and-dependency-map)
defines implementation checkpoints and unpassed technical/live evidence gates. Admin values,
environment provisioning and live evidence are explicit release prerequisites, not
permission to invent launch configuration.
The [readiness register](workflow-design.md#implementation-readiness-audit) maps each
A01-A22 resolution to its contract and required proof. Selected design decisions do
not establish runtime compatibility or authorize implementation.
