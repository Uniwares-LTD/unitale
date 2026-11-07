# Booklet document model

## Outcome

The accepted model uses a **production document with an embedded content index**.
Subjects and artifacts are nested identities, not independent collections. Immutable
content revisions and growing histories remain separate documents. This decision
selects persistence boundaries; T14 implementation is still pending.

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
assumptions. `I` marks existing Unibase capabilities. Other labels distinguish
accepted-but-unimplemented boundaries, current contracts and later proposals.
The economy view covers domain integration, not every internal Unibase collection.

## Scope

The [PRD](prd.md) governs behavior. This is the selected persistence design, not a
claim that the current [v1 contracts](contracts.md) already implement it. Field lists
are operational summaries, not exhaustive DTOs. Later execution, quality and delivery
proposals retain their review status; accepting the index does not approve all of them.
No migration, production registration or provider call is introduced by these docs.

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
Booklet. Bound choices and rejection tests belong to T14 implementation.

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
are not silently redefined as persistence documents; T14 adds explicit repository
mapping and versioned contracts where a public shape actually changes.

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

## Open questions and limits

Document boundaries are settled; remaining implementation details do not reopen
separate Subject or Artifact collections.

| ID | Status and follow-up |
| --- | --- |
| D01 | Selected: stable subjects embedded per production; cross-production reuse retains explicit source lineage |
| D02 | Selected: artifacts embedded under subjects with independent current/accepted pointers; responsibility variants remain typed |
| D03 | Selected: immutable separate revisions, ordering in plans/manifests; finalize canonical hashing and ordinal allocation in T14 |
| D04 | Embedded operational content and referenced evidence; finalize validated array/string/document bounds |
| D05 | Separate production lifecycle from Run status; finalize state transitions in T15 |
| D06 | Selected: production version/fence governs index changes; verify transaction, lease expiry and stale-writer behavior |
| D07 | Separate customer request, embedded accepted quote, reusable allocations; finalize attempt integration |
| D08 | Explicit reuse decisions and separate platform-funded repair budget; finalize durable accounting |
| D09 | Reuse Unibase order terms and stable IDs; finalize booklet product extension validation |
| D10 | Separate retention and attachment; use expectedProductionVersion and fencing token for attachment admission |
| D11 | Owner-scoped records, embedded deletion/recovery, immediate revocation; implement cleanup protections later |
| D12 | Immutable manifest revision anchors completion and future exports/shares |

### Persistence rules to settle with D01-D12

T14 must define production/owner read indexes, unique revision identity
`(productionId, artifactId, ordinal)`, scoped idempotency and submission identities.
Enforce embedded uniqueness in transactions. Preserve UTC timestamp conventions,
integer credits, precise provider costs and unknown usage instead of zero. Keep
financial transactions authoritative in Unibase and human approval authoritative
in authenticated Run submissions.

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

T14 remains incomplete. Specialists, visual evaluation, Human Input execution,
reader, PDF and sharing remain their assigned delivery tasks.
