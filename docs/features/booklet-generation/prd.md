# Unitale booklet generation requirements

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

The dispatcher calls only the orchestrator. The orchestrator calls text/image
specialists and a separate visual reviewer, requests human input and accesses MCP.
Children have no MCP credential or private Run context. All workflow tools use
`/api/mcp`; ordinary browser/admin routes and payment webhooks remain ordinary APIs.

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
Reused creative content requires explicit acceptance. Test concurrent starts and stale tabs.

### R03 — Operational schema

Persist Booklet, Production, Artifact, immutable Artifact revision, authenticated
Decision, Operation, Execution measurement and Quality review. Stable subjects identify
book/character/location/physical page. A completed book is a book-manifest artifact
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
become stale when targets change and cannot be fabricated by tools. No fixed review
mode or personas. Prove generated parent/child, bounded loops and Human Input against
the deployed Dify version; offline fixtures alone do not prove live compatibility.

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
apply already-persisted human decisions, inspect operations and complete manifests.
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

A separate versioned visual-review workflow blocks missing/wrong/unreadable lettering,
missing story content, material character/location inconsistency and unusable layout.
Unitale checks evidence/target/policy identity and enforces disposition, not visual logic.
Aesthetic preference is human revision. Platform-funded repairs default to one/output,
obey finite package budgets and never use customer allowances. Exhaustion stops for
admin resolution. Human approval cannot bypass a failed required review.

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

Accepted implementation request is the authority for R01–R14. Use
[agentic-poc at the pinned revision](https://github.com/karpishe-experiments/agentic-poc/tree/baa9dda25c041b2d7a77853f9f6c3daa73161217),
not story-panel. Source Real acceptance was incomplete; it is not Unitale acceptance.
Unibase owns reusable transport, execution evidence, commerce, wallet and admin frameworks;
Unitale owns book-specific rules, workflows and experiences.

## Dependencies and constraints

See the [delivery plan](implementation-plan.md). T01–T27 establish implementation;
T28 additionally requires authorized Dify/provider, Stripe, Play and installed-device
acceptance. No publication, live configuration or paid calls follow from plan approval.

## Open decisions and readiness

Product decisions are closed. Admin values, environment provisioning and live evidence
are explicit release prerequisites, not permission to invent launch configuration.
