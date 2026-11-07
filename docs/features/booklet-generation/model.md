# Booklet document model

## Outcome

The accepted model uses a **production document with an embedded content index**.
Subjects and artifacts are nested identities, not independent collections. Immutable
content revisions and growing histories remain separate documents. T14 implements these repositories and their transaction boundaries. Lifecycle,
approval, execution and media integration remain later tasks.

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
T14 registers a namespaced index migration and an extension with no routes,
MCP tools, navigation or workers. It introduces no provider calls or charges.

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
- **Operations, revisions, decisions, reviews and measurements** stay separate;
  their history must not accumulate inside Production. Customer revision requests
  are separate records with an embedded accepted quote snapshot. Attempt/budget
  implementation details remain pending lifecycle review.
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
unexpired orders can create productions. T15 must integrate admission/charging;
draft persistence does not authorize generation or spend credits.

Creation can participate in an existing MongoDB transaction. The order must already
have been inserted in that transaction. Unibase's order-creation admission callback
runs before insertion, so T15 must compose at a compatible boundary rather than
assuming the callback can read a not-yet-inserted order. Results are usable only
after the caller commits. Transactions serialize account-access changes.

Every write has a scoped stable key and normalized input hash. Original results
live in `bookletRepositoryWrites`; identical retries return the original result
after current access/ownership checks. Different input conflicts. Receipts are
operational history, not generation operations or customer charges.

A production lease lasts 1?300 seconds. Acquisition/takeover increments a durable
fence; every creative write checks expected version, holder, fence and expiry.
Renewal and release are versioned/idempotent. Revisions and pointer updates commit
together. No API mutates an accepted pointer, stage lock, lifecycle or completion.
T15 owns those transitions and their decision/quality checks.

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
| D05 | Lifecycle transitions remain T15; new productions are drafts |
| D06 | Implemented production version, lease/fence, rollback and replay receipts |
| D07/D08 | Request/attempt/repair orchestration and explicit cross-production reuse remain later work |
| D09 | Implemented owned order association and frozen creative snapshot; no Unibase changes |
| D10 | T14 validates declared asset identities only; T16 verifies retained bytes and ownership |
| D11 | Implemented owner scope and rejection of deleted books; delete/recovery/cleanup services remain later work |
| D12 | Implemented manifest draft checks; approval, quality and completion remain T15/T17 |

Source dependencies are restricted to the same production. V1 aggregate character
and location payloads are rejected by persistence; individual description and roster
variants are explicit. Manifest review/approval IDs and operation/Run/evidence
provenance are claims for future service verification, never authority. A stored
manifest draft cannot complete a production or make content public.

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

T14 persistence is implemented. Specialists, visual evaluation, Human Input execution,
reader, PDF and sharing remain their assigned delivery tasks.
