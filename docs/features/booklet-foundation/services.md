# Use the commerce and execution foundation

## Purpose

T03-T06 add reusable services for Unitale and other derived projects. Existing
Run settlement, purchase history and artifact records retain their prior behavior.
[Consumption orders and promotions](orders-promotions.md) implement T07-T08.
Live subscription/provider services (T09-T10), Android purchase UI (T11), and
commerce administration (T12) remain subsequent tasks.

## Prerequisites

Use the locked Node/npm dependencies and MongoDB with transaction support.
Local evidence uses private MongoDB collections and needs no cloud credentials.
New indexes are installed by the forward-only
`core:0001-commerce-execution-indexes` migration or `npm run db:indexes`.
The tests use disposable MongoDB replica sets and fake providers.

## MCP configuration and extensions

Application settings now include `mcp.requestBytes`, `responseBytes`,
`toolResultBytes` and `timeoutMs`. Existing settings decode to the original
64 KiB request/response, 31 KiB tool result and 10-second defaults. Settings use
the existing administrator authorization, optimistic revision, history and audit.
Every authenticated MCP request loads durable settings, so replicas do not keep
a private stale cache. Missing settings storage fails closed.

The request ceiling is 16 MiB and timeout ceiling 120 seconds, below the checked-in
Nginx 21 MiB request limit and 180-second read timeout. External ingress and Dify
hosts still need their own compatibility checks. Tool output and the entire
encoded response (structured output plus escaped text fallback) are checked
separately. Oversized results fail; they are never truncated. AbortSignals cannot
undo side effects or preempt synchronous code.

Server extensions may mark an MCP tool `runContext: true` and declare its
`runContext` input. The handler checks the existing owned, active Run capability
before calling the tool and supplies `context.ownedRun`. The project handler must
also bind its product target to that Run; a service credential never establishes
an end-user identity. Workflow inspection, capability permission checks and
diagnostics include enabled extensions. Disabled modules do not contribute tools.

Namespaced permissions use `extension:<module>:read` or
`extension:<module>:write`; application and deployment validation agree.
A single configured service credential can carry all required catalog permissions.
No core permission list edit or new REST tool endpoint is needed.

## Catalog lifecycle

Register trusted `productTypes` in the project server extension. Each entry has
`id`, `schemaVersion` and a Zod `fields` validator. Use
`extensionProductTypes(serverExtensions, moduleEnabled)` to obtain enabled types.
Duplicate type versions fail explicitly. Keep old validators available while
their product definitions need editing; accepted published snapshots remain readable.

The server-only catalog service accepts a verified administrator identity
(`uid`, `auth_time`) and rechecks current administrative access transactionally:

1. `saveCatalogDraft` validates purchase/consumption terms and project fields
   against an expected revision. Each save advances the draft revision.
2. `previewCatalog` returns the validated definition and its canonical hash.
3. `publishCatalog` requires that exact revision/hash, journals an audit entry,
   stores an immutable version and verifies readback.
4. `publishedCatalog` reads the current published version or an explicitly
   accepted historical revision.

Editing drafts never changes a published version. Provider product/price/offer
mappings cannot be assigned to another catalog identity. No launch products or
prices are seeded. Local catalog publication does not create a Stripe/Play
product: remote publication journals and provider verification belong to T09/T10.
No public/browser endpoint is added here; T12 builds the administration on these
services and T25 builds the storefront.

## Measurements and private evidence

Use `recordMeasurement` with the server-derived owner and the T01 measurement
contract. Its immutable identity binds operation, Run, model/provider, publication,
request, usage, separate reported/estimated costs, timing, outcome and evidence.
A repeated identical write returns the original effect; changed data conflicts.
Measurement envelopes are limited to 1 MiB and 256 evidence references. Callers must label authority from trusted provider/adapter observations, never from
model assertions. These APIs are opt-in; historical Run observations are not
reinterpreted or copied, and customer credit settlement is unchanged.

`retainEvidence` stores redacted JSON separately from operational measurements.
Each record is at most 1 MiB and is stored in bounded chunks; split larger traces
into separate evidence records. Credentials in recognized keys, authorization
headers and signed query fields are redacted. Callers must additionally supply
their known secret values for free-text redaction and must not send arbitrary
environment dumps. Hashes cover the retained redacted bytes.

Owner-scoped reads verify the retained byte count and hash. Measurement attachment
checks owner, operation, Run, kind, hash and length. Raw evidence is held by default
while an operation is active or unresolved. Trusted completion code calls
`releaseOperationEvidence`; active Runs block release, and unknown measurements
require a retained provider receipt and explicit reconciliation reason. Release closes the operation against new writes
and records an audit entry. This is not a model-callable approval mechanism.

Administration controls `execution.rawLogRetentionDays` (default 90). New evidence
snapshots that retention period. The existing maintenance worker removes expired,
unheld evidence and its chunks transactionally in bounded batches. Measurements,
operation tombstones and financial/audit data are not removed by raw-log cleanup.
`measurementsForOperation` returns bounded owned measurements and expenditure
coverage; summary rows are excluded from call counts and missing costs stay unknown.

## Verify

```powershell
npm.cmd run test:billing-compat
npm.cmd run test:booklet-foundation
```

The [billing compatibility report](billing-compatibility.md) owns provider/bridge
coverage and external acceptance limits. The [implementation plan](../../implementation-plan.md)
owns task state and final verification evidence.
