# Booklet contract compatibility

The opt-in v1 schemas in [contracts.ts](../../../src/project/booklets/contracts.ts)
and [workflow-contracts.ts](../../../src/project/booklets/workflow-contracts.ts) are
the project side of T01. Generic commerce and execution measurement schemas originate
in Unibase and are now available through the pinned T03-T06 template import.
Full T13 integration still depends on the remaining commerce services.

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

Package capacity validation uses a versioned execution profile; numbers in tests are
fixtures, not supported production limits. Manifest validation enforces purchased page
counts, order and language. Completion must additionally verify accepted revisions,
quality evidence, original bytes and ownership from durable records.

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
