# Booklet document model

This guide, its JSON example and both Mermaid views describe implemented persistence.
The accepted [workflow design](workflow-design.md) owns target acceptance/quality
boundaries; the explicit v2 section below records implemented storage and remaining
wiring. Update all model artifacts together for concrete schema changes; do not relabel
existing approval/quality records as Manager acceptance.

## Version 2 storage boundary

The explicit [v2 schemas](../../../src/lib/server/booklets/documents-v2.ts) and
[v2 repository](../../../src/lib/server/booklets/repository-v2.ts) reuse the existing
collections and owned transaction/admission validation. New v2 production creation is
atomic; existing v1 records are never converted. Strict v1 readers remain unchanged;
mixed readers discriminate documentVersion. Production v2 adds creation identity,
a snapshotted retry policy and a versioned opaque checkpoint capped at 64 KiB.
The JSON example includes an independent v2 draft beside unchanged v1 examples.

V2 content preserves exact manuscript text and useful JSON creative fields. It adds
native image-spec/book-layout/page-spec variants and source contentHash identities;
v1 sources retain sha256. Assessment parsers support six modes without granting
quality or execution authority. Draft v2 revisions now write atomically with their production index pointer, preserve
exact text and verify local immutable source/owned original identities. Their contentHash
is SHA-256 of canonical content, matching the Manager source contract; v1 keeps its
hashVersion-1 wrapper. Active creative-text writes now require a current owned prepaid
Manager and a unique retained native proposal, exact evidence/sources and matching
funding. Stage locks and purchased page/canvas/panel limits remain server enforced.
The same text producer/artifact publishes once, including across continuation.
Image writes now match a selected original from observed Generate work, using its
exact sources, funding and evidence. Each original/artifact publishes once; several
returned originals may have distinct candidate revisions without another generation.
Acceptance wiring remains checkpoint 09 work; revalidation is locally verified below.

V2 revisions gain optional `revalidatedFrom`
lineage to an owned revision of the same artifact. The write preserves exact
content/assets and records replacement sources. Manager may reuse retained producer
evidence; when new review evidence is supplied, it must identify that exact context,
including original pixels for images. MCP may omit content when this reference
is supplied, allowing server-side reuse of large retained text. This path is verified
locally; it is not a completed checkpoint claim.

Request-backed corrections now bind confirmed findings to exact selected baseline
revision identities and reviewed targets. Correction review preserves the original
finding body and before/after source identities. These guards reuse existing work,
assessment and revision fields; the JSON example and both Mermaid views are unchanged.

V2 Manager manifest assembly now reuses the immutable revision writer. Each page
binds an owned page-image source and its exact original attachment. Provenance uses
the admitted Manager Run and a `manifest:` snapshot operation ID; it does not claim
a specialist execution or create a work attempt. Unchanged manifests can retain
`revalidatedFrom` with replacement dependency sources. These use existing content,
source, asset and provenance fields, so the JSON example and both diagrams remain
structurally unchanged. Draft publication and Manager selection do not complete a
production or change its final manifest pointer.

V2 structural completion is now locally implemented. An explicit selected manifest
revision binds the owned accepted dependency graph and purchased layout/page structure;
full original-byte verification happens before the short atomic metadata write.
The existing production fields become `lifecycleState:completed` and
`currentManifestRevisionId:<selected revision>`. The receipt reuses its existing
`revisionId` field, and exact replay precedes byte I/O. Manager owns whole-book quality
policy using exact-revision full-history coverage facts; no human/quality prerequisite
is added to the application lifecycle. Native Run termination is separate. This adds
behavior over existing fields, so JSON and both diagrams remain structurally applicable.

V2 image registration/dispatch now consumes the exact retained preparation, preserving
its call ID/hash, target and source identities. Image eligibility uses its own configured
call ceiling; Manager retains preflight policy ownership. Partial native image results
are retained as work before media storage. The existing media service accepts an internal
v2 ownership option and checks each observed outputKey, original canvas and format.
It preserves complete bytes and supports several independently keyed originals from one
Generate, including retention after cancellation; it does not authorize redispatch or
revision publication. The asset format stays at version 1: operationId is the v2 work
callId and sourceRevisions.sha256 stores each source contentHash. No collection, index or
field is added. The JSON example records this interpretation and both diagrams show
the v2 work relationship. The MCP retention gateway matches the exact observed native
file and uses the existing restricted downloader; fixture HTTP responses are synthetic.
MCP source delivery now returns ordered verified original pixels separately from JSON
identity metadata; the local fixture binds synthetic native handles to the actual
Manager/Reviewer Code nodes and records exact visual coverage of a published image.
Actual Dify file conversion is unverified. This uses existing work/revision/asset fields
and relationships; the JSON example and both Mermaid versions remain structurally valid.
This is local service verification, not provider execution.

Planner cast/location roster proposals are deltas for their respective subject kinds.
The revision writer preserves the other kind's current IDs and records the preceding
roster revision as a source when merging. Unregistered or wrong-kind subjects and a
stale explicitly selected roster source fail. The raw child delta remains unchanged in
work retention; the saved revision/hash describe the combined roster. Initial roster
work may publish its observed descriptions after their stable subjects are indexed.
These are guarded writes using existing fields; the JSON example and both diagrams
remain structurally unchanged.
V2 work, assessment and Manager acceptance storage is implemented alongside v1.
Work uses registered/dispatching/succeeded/partial/failed/unknown states; only confirmed
retryable failure permits a new attempt, bounded by the production snapshot. Unknown
results remain unresolved until server observation. Creative-text registration now
derives action identity from the validated full child request and exact source content;
active registration checks the native parent Run and consumption workflow/job binding
inside its transaction. Dispatch repeats the same checks, including cancellation and
native execution status, before changing a registered intent to dispatching. A registered,
unsubmitted intent may bind to the current admitted successor; its work `runId` then
records that dispatching parent. Previously dispatched work remains non-replayable.
Dispatch usage/lock checks and trusted provider outcomes remain pending.
Work may additionally retain `requestPayload`, the exact meaningful request JSON,
capped at 256 KiB and verified against `requestHash`. Creative registration stores
it in the same transaction as intent, excluding only renewable reference URLs/native
file handles. Owned work reads expose it through the existing bounded typed reader.
This preserves text and extension fields without diagnostic redaction, so restart
does not require reconstructing a request from a hash. Older records may omit it;
their missing body is not proof that dispatch can resume. No new collection or index.
The JSON example and both diagrams include this optional field. Reviewer registration
now retains each item's immutable target scope in that same request body. Reviews can
compare distinct revisions of one artifact; duplicate source tuples fail. Request-backed
assessment writes match the selected item's scope and exact retained native proposal.
Legacy metadata-only server records retain their existing behavior. No persisted fields
changed, so the JSON example and both diagrams remain structurally unchanged. Image
registration, the assessment MCP gateway and complete runtime wiring remain 09 work.
Native Manager `decide` observations also use the existing work fields for durable
paid LLM attempt facts. Their request body is unobserved; the metadata hash is not a
prompt hash. Successful complete bounded outputs may be retained; failed reasoning
stays unknown until trusted success updates the same attempt. Retention remains valid
after cancellation and changes no production fence/version. These are new uses of
existing fields, so the JSON example and both diagrams remain structurally unchanged.

The native v2 observer now retains matching complete child envelopes in optional
`resultPayload` (at most 1 MiB), with `resultObservation` carrying native execution,
node, retry and loop identities. These fields share the work record and its 4 MiB
BSON bound; no separate output collection. The observer requires the accepted Manager
workflow ID, native run, fixed child node and registered call/invocation/item identities.
It uses the existing worker transaction and redacted trace storage. Exact creative
bodies stay separate from diagnostic redaction. Truncated or unrelated output does
not establish a terminal result. Duplicate observations are idempotent; conflicting
terminal bodies fail. Retention may finish after cancellation, without granting
dispatch, publication, acceptance or retry authority. Failure classification,
reconciliation and integration proof remain checkpoint 09 work.
Correction roots bind task, target
and funding identity. Counts derive from distinct dispatched corrective actions;
technical retries reuse an action key. No separate correction-budget collection.
Dispatch requires correction metadata for a changed request on an already attempted
creative task/target in the same funding scope. Counts are per target, across target
regrouping; independent targets do not spend each other's allowance. Other specialist
operations remain separate tasks. Historical funding resolves through retained commerce
receipts. Only dispatched attempts count; technical retries count once. This changes
enforcement, not fields or relationships, so the JSON example and both Mermaid views
are unaffected.
Completed productions permit only final checkpoint and short-lease acquisition/release
metadata. Creative mutations remain closed; metadata still requires ownership, a fresh
version/fence and an unexpired production. Checkpoint receipts include their confirmed
fence. No state field or relationship changes; the JSON example and diagrams are unchanged.
Gateway-local mutations can check and advance the existing production fence in their
database transaction, leaving `mutationLease` null. Creative-text registration uses
this atomic mode. A live lease blocks it; stale versions/fences fail, failed writes
roll back the fence, and exact receipt replay does not perform another mutation.
The existing explicit lease API retains its behavior. This adds no storage fields.
The v2 MCP checkpoint and creative-text register handlers use these atomic writes.
An initial expected fence of zero is valid in atomic mode; returned fences advance
from it. Gateway receipt replay retains the original CAS version. The explicit lease
and v1 mutation parsers still require positive fences. No example/diagram field changes.
V2 document reads expose allowlisted revision/work/assessment DTOs. Large values use
typed sections, ordered array pages and decoded Unicode text fragments with explicit
completeness. Cursors bind the owned document hash and reject changes; they do not
grant access to private database fields. This read projection adds no storage fields,
so the JSON example and both Mermaid views remain unchanged.
Artifact history reads page existing immutable revision metadata with an initial
ordinal snapshot. Later appends do not change that cursor's window. This query uses
the existing revision index and adds no collection, index or model field.
V2 index batches register subjects/artifact slots in one version/fence transaction.
Matching entries retain their pointers and IDs. Existing capacities and per-subject
responsibilities are reused; another candidate ID cannot create a duplicate artifact
responsibility. This restores the documented uniqueness invariant in v2 insertion
without changing stored fields; the example and diagrams remain applicable.
Creative registration targets resolve to actual artifact responsibilities for the
native operation and subject kind. Child selectors retain subject IDs and must belong
to those artifact parents. This distinction closes subject-alias accounting resets
without changing the stored schema or native wire fields; grouped revisions remain
supported. New local subject keys during initial roster creation stay under the roster
artifact's accounting scope. The example and diagrams need no field/relationship changes.
Assessments bind observed review scope and evidence, coexist per revision, and derive
completeness independently of model fields. Acceptance updates the exact revision
pointer atomically without adding an app human/quality-policy gate.

`booklets:0004-manager-state` creates the three new collection indexes, with no data
conversion. These are storage services, not dispatch authority: trusted observer,
prepaid admission, human correlation, MCP and Run UI wiring remain in 08-10. Existing
review-request/runDecisions fields are reused for human correlation; no new human
response collection or fabricated decision is introduced. No workflow is activated.
The existing v1 service descriptions below retain their version-1 scope.

## Outcome

The accepted model uses a **production document with an embedded content index**.
Subjects and artifacts are nested identities, not independent collections. Immutable
content revisions and growing histories remain separate documents. T14 implements these repositories; T15 and T16 add lifecycle transactions, exact-revision approvals and private original-media services.

- [Simple Mermaid schema](model-core-mermaid.md)
- [Complete Mermaid schema](model-complete-mermaid.md)
- [Concrete JSON example](model-document-example.json)

The example is a partial production with two manuscript revisions, a character
and a page plan containing panels and lettering. Its `collections` wrapper groups
separate documents for reading; it is not a stored parent document or a seed file.
External order, Run and evidence references are explicitly identified.

The simple diagram shows core document boundaries. The complete diagram expands
nested content, lifecycle, economy and media fields, including labeled future
export/share references. Both are generated from the same maintained definitions.

Boxes show document boundaries or explicitly labeled existing service views.
Indented `{}` objects and `[]` arrays stay inside their owning document. References
between documents use stable IDs, not relational joins or collection-per-object
assumptions. `I` marks implemented capabilities in the named owner. Other labels distinguish
current contracts and later proposals.
The economy view covers domain integration, not every internal Unibase collection.

## Scope

The [PRD](prd.md) governs behavior. Dedicated persistence schemas are separate from the unchanged
[v1 workflow contracts](contracts.md). Field lists
are operational summaries, not exhaustive DTOs. Later execution, quality and delivery
proposals retain their review status; accepting the index does not approve all of them.
The booklets extension registers namespaced index migrations, a Run domain adapter
and the T17 MCP catalog. It has no routes, navigation or workers. Lifecycle services
use existing Unibase charging and enqueue only the parent orchestrator; they make
no generation calls.

## Approach

### Document boundaries

- **Booklet** owns identity, owner, current-production pointer and nested deletion/
  recovery metadata. Paid productions remain separate documents.
- **Production** embeds the brief, frozen creative configuration, stage locks,
  mutation lease and bounded `subjects[]`. Each subject contains `id`, `kind`,
  `label`, optional page role and `artifacts[]`. Each artifact entry contains its
  stable `id`, responsibility `kind`, `currentRevisionId` and `acceptedRevisionId`.
  There is no independent artifact version or Subject/Artifact collection.
- **Artifact revision** is a separate immutable document with `productionId`,
  `artifactId`, `subjectId`, kind, ordinal, content hash and operation provenance.
  Its typed content embeds panels and lettering, story units, or accepted manifest
  entries. Sources and asset identities are bounded embedded references. Raw prompts
  and provider envelopes stay in evidence storage.
- **Generation admissions**, review requests and quality reviews stay outside Production. Human submissions remain in existing `runDecisions`; revision requests, allocations and charges reuse commerce documents. Repair usage is derived from generation records grouped by `repairRoot`, bounded by the frozen package limit. For v1 no separate attempt, repair-budget or attachment collection is introduced;
  v2 uses the Work attempt records described above.
- **Manifest** is a revision kind, not an Edition collection. Its nested page
  entries bind order, exact image revisions, original assets, quality and approval.
- **Economy** reuses existing Unibase documents. Production references its order;
  it does not embed a second mutable wallet, charge journal or entitlement balance.

### Identity, concurrency and growth

Stable subject and artifact IDs are scoped to a production. Revision reads resolve
`productionId` first and validate `subjectId` and `artifactId` against its embedded
index, owner and artifact kind. Current/accepted pointers must refer to revisions
of that same artifact. Artifact IDs are unique within the production; subject IDs
are unique in the roster; an artifact responsibility is unique within its subject.
These nested-array uniqueness checks require service validation, not an assumed
MongoDB unique index on elements of a single document.

All index/pointer mutations use the production's expected version and active mutation
fence. There is one active mutation workflow per production. Insert an immutable
revision and advance the corresponding pointer transactionally; never hold the
transaction open while calling a provider. Stage locks and downstream authorization
must be atomic. Unknown provider outcomes need reconciliation, not automatic replay.

Enforce package-derived subject/artifact counts and encoded document-size bounds
before persistence. Never silently truncate content or split a production into a
second implicit index. Large content, revision histories, raw evidence and media
bytes stay outside the index. Production versions themselves are not embedded in
Booklet. Default BSON ceilings are 1 MiB per production and 4 MiB per revision;
trusted server options may override them within 1 KiB?8 MiB. These are storage
safeguards, separate from package capacity.

### Unibase compatibility

Read-only inspection of Unibase's `src/lib/server/commerce/orders.ts`, commerce
contracts and execution evidence services found no requirement for standalone
booklet artifacts. Orders address an opaque `targetId`; allocations retain stable
`subjectId` values; the admission hook accepts the existing database transaction.
Unitale can resolve those IDs into its embedded production index without changing
Unibase's finance, Run or measurement storage.

**No Unibase change or template import is required for this boundary decision.**
Any later discovered shared-contract change must first be implemented and reviewed
in Unibase, then imported into Unitale after the user's review. Existing T01 DTOs
are not silently redefined as persistence documents; T14 uses separate persistence schemas and explicit date-to-ISO views without
changing public v1 payloads or exposing a new API.

## Maintenance and validation

[booklet-model-review-data.mjs](../../../scripts/booklet-model-review-data.mjs)
owns document fields, nesting and cross-document references.
[booklet-model-diagram.mjs](../../../scripts/booklet-model-diagram.mjs) generates
both Mermaid views through the [Mermaid renderer](../../../scripts/booklet-model-mermaid.mjs).
Both views share the same document definitions. Update the canonical definitions,
this guide and the JSON example when model boundaries or fields change.

```sh
npm run docs:booklet-model
npm run check:docs
```

The check rejects stale generated views and references to unknown diagram documents.
It does not infer semantic changes from runtime schemas. Inspect Mermaid previews for readable labels, nesting and relation clarity. Fixed
colors preserve label contrast. Code generation requires no network or renderer.

## Repository interfaces and limits

[bookletRepository](../../../src/lib/server/booklets/repository.ts) takes a database,
verified server actor and optional trusted clock/storage limits. It exposes owned
book/production/artifact/revision reads; bounded lists; createBook/createProduction;
addSubject/addArtifact; appendRevision; and acquire/renew/releaseLease.

`createProduction` reads an existing owned `consumptionOrders` record with matching
`targetId` and product type `booklet`. Creative fields come from the frozen order
extension; authoritative terms supply package identity and validation allowances.
The trusted caller supplies matching execution capacity. Only queued/started,
unexpired orders can create productions. `bookletLifecycle.start` charges once and transitions the draft in the commerce admission transaction; draft persistence alone never authorizes generation or spends credits.

Creation can participate in an existing MongoDB transaction. The order must already
have been inserted in that transaction. Unibase's order-creation admission callback
runs before insertion. Production is created against an existing queued order, then paid admission uses the start callback, where that order already exists. Results are usable only
after the caller commits. Transactions serialize account-access changes.

Every write has a scoped stable key and normalized input hash. Original results
live in `bookletRepositoryWrites`; identical retries return the original result
after current access/ownership checks. Different input conflicts. Receipts are
operational history, not generation operations or customer charges.

V2 `requestHuman` receipts additionally retain `result.humanRequest`: request ID,
original Manager Run, immutable target tuples, `{mode:"raw-v1"}` response contract,
exact native form body and presentation hash. The question card's metadata
ID identifies the request without displaying technical IDs. The form reserves the
existing native response placeholder; its hash includes that placeholder exactly
once. This reuses the receipt rather than adding another request collection. Actual
answers remain in `runDecisions`; owned reads match the original Run, native `human`
node and exact presentation. Only a submitted authenticated user intent is returned
as an answer. Unknown submissions remain pending, and changed targets are stale.
Manager acceptance remains separate. The JSON example and complete diagram include
this optional receipt result. The core diagram excludes operational receipts; its
structure is unchanged and its acceptance status is refreshed. Both generated views
are checked. These are local checks, not live Dify form evidence.

A production lease lasts 1?300 seconds. Acquisition/takeover increments a durable
fence; every creative write checks expected version, holder, fence and expiry.
Renewal and release are versioned/idempotent. Revisions and pointer updates commit
together. Dedicated lifecycle methods own accepted pointers, stage locks and completion; there is no general-purpose patch endpoint.

Lists accept 1?100 items (default 25). Book/production pages use stable ID order;
revision history uses increasing ordinal. Cursors are query/account scoped and
never substitute for ownership filters. Completed/closed/expired productions reject
new mutations; committed idempotent retries remain readable with authorization.

### Implemented and remaining decisions

| ID | Status |
| --- | --- |
| D01/D02 | Implemented embedded identities and per-subject responsibilities; no separate artifacts collection |
| D03 | Implemented immutable revisions, transactional ordinals and canonical hashVersion 1 over content/identity/sources/assets |
| D04 | Implemented package counts, strict payload validation and BSON size ceilings; raw evidence remains external |
| D05 | Implemented paid start/continuation/revision reopening and manifest completion; new productions are drafts |
| D06 | Implemented production version, lease/fence, rollback and replay receipts |
| D07/D08 | Implemented exact human approvals, explicit reuse acceptance, generation locks and bounded repair admission; workflow scheduling remains T20 |
| D09 | Implemented owned order association and frozen creative snapshot; no Unibase changes |
| D10 | Implemented original-byte verification, durable retention/attachment and approved source routing |
| D11 | Implemented owner scope and rejection of deleted books; delete/recovery/cleanup services remain later work |
| D12 | Implemented manifest checks and evidence-bound completion; MCP exposure remains T17 |

Same-production dependencies are the default. A new paid production can reference its declared source production only after a persisted exact-revision human reuse approval. Reused content is copied into an empty matching responsibility with the same stable subject identity; the source remains immutable. V1 aggregate character
and location payloads are rejected by persistence; individual description and roster
variants are explicit. Once admitted, image appends require a matching generation authorization and retained original receipt. Completion verifies current accepted revisions, human decisions, passing quality evidence and original bytes. A stored draft alone cannot complete a production or make content public.

Indexes cover owner reads, unique order association, unique production/artifact/
ordinal, source lookups and scoped idempotency. The forward-only migration is
`booklets:0001-repositories`; it converts no old records and creates no sample data.
Run `npm run test:booklet-repositories` for disposable replica-set tests.

### Existing sources to reuse

- [Booklet contracts](../../../src/project/booklets/contracts.ts) and
  [workflow contracts](../../../src/project/booklets/workflow-contracts.ts).
- [Commerce contracts](../../../src/lib/contracts/commerce.ts),
  [orders](../../../src/lib/server/commerce/orders.ts),
  [catalogs](../../../src/lib/server/commerce/catalogs.ts),
  [billing](../../../src/lib/server/commerce/billing.ts),
  [promotions](../../../src/lib/server/commerce/promotions.ts) and
  [wallet types](../../../src/lib/server/store/credit-types.ts).
- [Measurements](../../../src/lib/contracts/execution-measurements.ts) and
  [evidence service](../../../src/lib/server/execution/measurements.ts).

Repositories, lifecycle and media services are implemented. Specialist/reviewer workflows, orchestration, MCP exposure, creator UI, reader, PDF and sharing remain their assigned tasks. Offline service tests are not live Dify acceptance.

## Lifecycle and media service boundaries

`bookletLifecycle` starts/continues paid production, quotes and starts revisions (bound to the expected production version),
requests/applies human reviews, authorizes and inspects image generation, reconciles
failed/unknown outcomes and completes a manifest. All service mutations use owned
transactions and receipts in `bookletServiceWrites`. Mutations with a caller lease
recheck its fence/expiry before persistence. An authorization receipt identifies an
operation; it is **not** permission to replay a provider call. T20 must inspect the
operation and reconcile uncertain execution before dispatching again.

`enqueueBookletRun` binds an active consumption workflow to an existing Run with
zero generic Run credits. It accepts only a validated booklet orchestrator, no
persona and no uploaded files. Generic Run-start admission rejects booklet targets
to prevent bypassing the prepaid binding. A paused Run is answered through the
existing authenticated Human Input UI. A new continuation requires verified prior
termination; it does not buy another package. T20 supplies the actual orchestrator
publication. The picker endpoint remains a T21 integration, not a route added here.

Checkpoint 09 extends this admission boundary to explicit v2 productions. Both
`booklet@1` and `booklet@2` remain registered; the selected orchestrator and successor
must match the stored production's version. V2 ownership uses the same owned book
check inside the caller transaction; default v1 readers still reject v2 records.
Admission increments only the production version/update time, preserving checkpoint,
work, retry snapshots and immutable content, and reuses the existing consumption/job
binding. The v2 adapter rejects generic Run admission and does not apply v1 creative
approval gates. `bookletLifecycleV2` starts and continues that production through the
existing consumption journals, and finishes a workflow only with verified termination.
Shared version-aware persistence validates the selected schema and fences the stored
document version, preventing conversion through a save. These calls preserve opaque
checkpoints, retry policy and content; the service does not dispatch providers. V2
revision quote/start uses the same subject/stage-lock checks and quote/allocation
journals as v1. Quotes bind the exact production version and accepted amount; a new
revision records its funding origin and reopens working state without changing old
revisions or the selected manifest. MCP and automatic recovery wiring remain
subsequent work; no orchestrator is activated here.

No document field, relationship, index or migration changes in this admission slice;
the JSON example and both Mermaid schema versions remain applicable unchanged.

Production's nullable `revisionChargeId` retains the originating revision charge
and allocation scope across continuation workflows. It is set atomically by
revision admission, replaced only by a new revision request, and defaults to null
for existing drafts. Text and image writes resolve non-revoked allocations through
this identity while still requiring the current active Run. Continuing does not
create allocations or charges and cannot reset an image allocation's repair budget.

`bookletReviewRequests` stores exact targets, group hash, presentation hash, Run,
optional reuse source and applied decision identity. The returned bounded native
form must be used unchanged. It uses the existing summary cards (up to 20 targets,
10,000 characters per card); oversized groups fail explicitly. Rich image previews
remain the T21 workspace task. Approval requires an authenticated submitted user
answer, matching presentation and still-current targets. Image approval also
requires passing quality; a human cannot override a failed required review.

`bookletQualityReviews` embeds the validated v1 review under `value`. It is immutable
per target revision. `recordBookletQuality` requires verified original bytes,
matching input/output evidence, an observed successful reviewer measurement and a
trusted server-supplied policy/publication. T19 owns visual evaluation and policy
publication; this service performs identity and disposition checks only.

`bookletGenerations` stores one image authorization per stable operation identity:
owner/production/Run/artifact, ordered exact sources, state, resulting revision and
optional `repairRoot` and `revisionAllocationId`. An image allocation binds one
output root per artifact. A new operation may retry a verified provider failure,
but an unresolved or attached output cannot start another root on that allocation.
Subsequent quality repairs must name the current revision and obey the root's
repair limit, even when a customer revision workflow is active.
Story/style/reference locks commit before authorization is
returned. Source selection checks manuscript, style, subject descriptions and page
plan references, rejecting unrelated subjects. Repairs count against their original
output and the total image-call ceiling; they never allocate customer revisions.
Provider spending, text-call/time limits and workflow step scheduling remain T20
execution admission requirements; these services make no provider calls.

`bookletAssets` stores originals and derivatives as separate records. Metadata
includes hash, byte count, MIME, dimensions, generation/source provenance, durable
storage choice, staging/ready state, revision attachments and a reference fence.
Original bytes are never normalized. Local bytes live in 1 MiB binary parts in
`bookletAssetBytes`; configured private S3 storage uses the existing object-store
adapter. Retention accepts a complete bounded buffer (default 64 MiB and 16 million
pixels), verifies decoding and hash, and resumes the same immutable storage key.
A generation has one original receipt. Display derivatives retain `originalAssetId`
and never substitute for source images. Owned display derivatives remain available after revision entitlement expiry. There is no upload or URL-fetch endpoint.

Revision insertion, original attachment and generation completion commit together.
A failed attachment leaves the retained original reusable without generation.
A new continuation may reconcile unfinished generation and attach its retained
original after the originating paid workflow has verified termination. The
generation keeps its original Run identity; the revision records the active
attaching Run. Sources, operation and original receipt must still match exactly.
Unresolved operations continue to block another generation for the same artifact.
`references` and `reviewerInputs` return verified originals in the authorized source
order; reviewer inputs include the generated target and approved source content.
Aggregate image transfers are bounded by the trusted media byte limit. All reads
recheck account/ownership and deleted-book access, including after storage IO.
Deletion/recovery cleanup remains later lifecycle administration work; no TTL deletes
accepted originals or unresolved staging records.

`bookletReuseAcceptances` records the authenticated acceptance of exact source
revisions in a new production. Shared originals acquire the new revision attachment;
financial entitlements remain separate for each paid production. The source and its
completed manifest never change. A reused image must pass review for its new context.
Reuse can span successive paid productions: the original receipt keeps its initial
production identity while each explicitly accepted copy adds an immutable revision
attachment. Asset reads validate the owned target attachment and hash, rather than
requiring the original to belong to the immediate source production. Derivatives
use their original's attachment authorization.

Migration `booklets:0002-lifecycle-media` adds indexes only. Run
`npm run test:booklet-lifecycle-media` with the cached disposable MongoDB binary;
no credentials, live services or paid calls are required.

Booklet `runId`/revision provenance refer to the specific `aiJobs._id` attempt.
Execution measurement/evidence `runId` uses `aiJobs.run.logicalId`, preserving
Unibase active-Run evidence holds across attempts. Services resolve that mapping
through the owned production/order binding; IDs are not interchangeable.

## T17 MCP storage

The [MCP catalog](../../mcp.md#unitale-booklet-catalog-t17) adds bounded private
transfer bookkeeping; production document boundaries and embedded artifacts are
unchanged. The simple diagram retains those core boundaries; the complete diagram
also shows these internal collections:

- `bookletMcpTransfers`: deterministic owner/production/key identity, immutable
  kind/bytes/hash, creation Date and a transaction fence. Evidence transfers bind
  `evidenceInputHash` before use and retain `completedEvidence {inputHash, result}`
  for response-loss retries.
- `bookletMcpTransferParts`: deterministic transfer/index identity, SHA-256 and
  optional BSON Binary `data` of at most 8 KiB. Completing diagnostic retention
  removes raw `data` atomically with its receipt; hashes remain for retry checks.
  Redacted logs then live only in the existing execution-evidence store.
- `bookletMcpTransferBudgets`: one deterministic owner/production row with cumulative
  reserved `bytes`. Concurrent reservations serialize on this row and cannot
  exceed the frozen execution-derived budget.
- `bookletWorkflowPolicies`: a unique execution profile/revision and orchestrator/
  configuration-revision binding to `reviewer {id, revision, publicationId}`.
  Trusted T19/T20 integration owns publication verification and immutable provisioning;
  no workflow tool may edit it.

These records are not customer orders, creative revisions or provider measurements.
Interrupted transfers survive continuation; no TTL erases unresolved work. Image and
revision staging, abandoned reservations and part hashes currently remain retained;
deletion/recovery cleanup must include these collections in the later retention task.
Migration `booklets:0003-mcp` provisions indexes only. Dates in the JSON example are
ISO representations of database Dates; binary bytes are illustrative Extended JSON.

Original MCP chunk reads use a bounded in-memory cache of fully verified bytes,
with authorization checked on every request (including cache hits). See the
[MCP guide](../../mcp.md#unitale-booklet-catalog-t17) for limits and expiry. This
optimization adds no persistent fields or relations; the JSON example and both
schema diagrams are unaffected.
