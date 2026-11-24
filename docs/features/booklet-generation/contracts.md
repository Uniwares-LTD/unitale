# Booklet contract compatibility

This guide describes the existing v1 contract and implementation boundaries.
The accepted [workflow design](workflow-design.md) changes the target ownership of
human approvals, quality gates and Manager acceptance, and records the required
versioned extensions. The 07.1 [v2 content/assessment/retry parsers](../../../src/project/booklets/contracts-v2.ts)
are implemented. V2 production/checkpoint persistence is implemented with explicit
readers/writers, draft immutable revisions and durable work/assessment/acceptance
records. Correction counts derive from the same work history, separately from retry
ordinals. Trusted observation and tool integration are locally verified through 09.6;
public UI is checkpoint 10 and actual target execution remains checkpoint 12. Preserve v1 parsing and
historical records. The [package specification](workflow-package-spec.md#concrete-runtime-record-and-ui-decisions)
defines the planned v1/v2 compatibility boundary; minimal package boundaries are
checked in the actual workflow YAML and runtime implementation follows 07 in the
[delivery plan](implementation-plan.md#07---application-contracts--persistence).

The target usage policy trusts Manager dispatch controls. App usage tracking and
per-production ceilings are safeguards; signed execution grants and provider-spend
reservations are not required. Reported costs replace labelled estimates for the same
call without double counting. Unknown calls are not replayed, but independent work
may continue. These decisions do not alter existing purchase/credit or entitlement
contracts and are not implemented by the current v1 schemas.

The opt-in v1 schemas in [contracts.ts](../../../src/project/booklets/contracts.ts)
and [workflow-contracts.ts](../../../src/project/booklets/workflow-contracts.ts) are
the project side of T01. Generic commerce and execution measurement schemas originate
in Unibase and are now available through the pinned T03-T06 template import.
T13 local foundation integration is complete; live acceptance remains T28.
The accepted [document model](model.md) embeds subjects and artifact identities in
Production while retaining separate immutable revisions. T14 implements dedicated [persistence schemas](../../../src/lib/server/booklets/documents.ts)
and date-to-ISO views rather than treating database records as v1 DTOs: an artifact DTO is not a collection declaration,
and its revision/version fields must not become an independent artifact write fence.
Production version/fencing governs persistence. No v1 parser changes are made by
T14; any breaking public shape requires explicit versioning.

## V2 boundary implementation status

The [technical resolutions](workflow-package-spec.md#technical-resolutions-for-a01-a22)
freeze v2 envelope/content identities, storage/index deltas, hashing, MCP ownership,
admission/recovery, trusted observations, correction/revalidation and UI correlation.
V1 quality uniqueness and parsing stay unchanged. Content, assessment and retry policy
parsers now exist beside v1; they preserve exact text and creative JSON fields. Structural
parsing grants no execution/quality/usage authority. New assessment storage, Manager acceptance
and correction chains are implemented in 07-09 with local handler/repository/native
Code evidence. Package fixtures do not establish target runtime execution.
The model guide/example/Mermaid diagrams now distinguish unchanged v1 state from
the implemented v2 records and relationships. Checkpoint 10 implements the public
application contract (`src/project/booklets/application-contract.ts`): strict command
schemas and allowlisted response DTOs, version 1 of that contract; a breaking public
shape needs explicit versioning. Target acceptance remains 12.

Checkpoint 10-chat-version adds the client-safe conversation contract
(`src/project/booklets/turn-contract.ts`), version 1. A **turn** is the typed
presentation of one Manager `request_human` call (optional `turn` field). It has 1-20
parts in Manager order and exactly one interaction: a question (`text`, `single` or
`multiple`, with `freeText`), a style choice or an approval of one exact revision. It
may also have prose, overview, synopsis, character, location, image cards and at most one
milestone. A **reply** is `answer {choices, text}`, `approve {target}` or
`changes {target, text}`, checked against its turn and sent as the raw-v1 response
JSON. The repository binds shown revisions to request targets and images to that
revision's retained assets. It derives the generic `unibase-ui` fallback cards, so the
shared Run card registry is unchanged and needs no Unibase extension. The Manager
interprets replies; approval is never purchase consent and the app derives no state
from turn text.

The public application contract (still version 1) gains these additive commands and
reads. `start-idea` is the idea-only start with the same quote and credit consent. The
entry keeps the consented payload in account-scoped tab storage before submitting.
If the response is lost, the owner can retry the same request after reloading, using
its original key and quote.

The production command `reply {key, requestId, reply}` submits a reply to a turn.
`GET /api/booklets?section=default` returns the default package and available
credits. `GET /api/booklets/{id}?section=conversation` returns the turns, their
statuses and their authentic replies.
An in-flight or uncertain native submission is exposed as `confirming` without
a reply. The transcript includes a reply after the recorded submission and any
available native confirmation agree and the reply fits the retained turn.

The conversation response includes an activity derived from the latest owned Run
and dispatched work, plus the delivered reader when a committed manifest exists.
Reader pages use the manifest's exact order and original asset IDs. Lettering comes
from the selected layout when the manifest names it directly. Reader navigation follows
the interface direction, and lettering follows the booklet language. These projections
change neither the stored model nor the JSON example and Mermaid diagrams.

`/admin/booklets` reads the current selection and its version. The administrator
saves a replacement through `PUT /api/admin/booklets` with
`{catalogId, expectedVersion}`. The replacement must be published and usable
under the current workflow policy. A stale selection or quote requires fresh
consent for a new conversation. A saved order resumes with its accepted terms.

## Versioning

Persist `schemaVersion: 1`; catalog/profile/policy revisions identify immutable
accepted snapshots independently of schema versions. Strict schemas reject unknown
fields. A breaking shape needs a new parser and workflow/tool version; adding optional
fields still requires updating strict consumers before producers emit them. Never
reinterpret existing sample artifacts as booklets. No migration or runtime registration
is part of this contract checkpoint.

## Application and workflow boundary

Child inputs carry creative inputs, exact source identities, native file identities and
an application invocation ID. Dify assigns the child workflow ID after dispatch; result
validation compares it with the provider-observed identity, not a guessed input ID.
It also checks operation, invocation, publication and input fingerprint. It does not
establish caller authenticity. The orchestrator retains MCP
credentials/context; services verify the accepted Run and ownership.

Schema validity is necessary, not authorization or transactional enforcement. Future
services must compute hashes, allocate subjects, check all referenced records, validate
human submissions, fence revisions and budget mutations in transactions. MCP must not
accept owner identity or decision provenance merely because a DTO parses. Diagnostics
are references, not arbitrary provider envelopes inside operational content.

Current v1 package capacity validation uses a versioned execution profile; test numbers
are fixtures, not supported production limits. Manifest validation enforces purchased page
counts, order and language. The implemented lifecycle additionally verifies accepted
revisions, quality evidence, original bytes and ownership from durable records. The
target design removes app-enforced human/quality prerequisites, retains structural,
identity, original-byte and product checks, and records Manager acceptance explicitly.

## Immutability and measurements

Readonly DTOs prevent top-level mutation after parsing; durable revision immutability
and frozen nested snapshots are repository responsibilities. Store content identity as
a server-computed hash of a versioned canonical representation, never a model claim.
Provider decimal cost strings preserve precision. Missing usage/cost stays null.
Summary observations are diagnostic only; call observations provide expenditure
coverage. No currency conversion or customer charging is performed by these contracts.

## Verification

`node --import tsx --test tests/booklet-contracts.test.ts` tests package capacity,
manifest completeness, source/lock shape, quality contradictions, credential-free
child envelopes, lineage and recovery windows without providers or databases.
Unibase's `tests/commerce-contracts.test.ts` covers catalog terms, subscriptions,
promotions, order states and measurement coverage. Runtime concurrency/security tests
belong to the dependent service checkpoints, not these pure validation tests.
