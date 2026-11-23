# Diagnostics API

`POST /api/diagnostics` gives an administrator temporary, read-only access to
investigate any application module, including other accounts' records. Access is
granted from **Administration → Application settings → Diagnostic access**. It is opt-in,
needs Redis, and is never available in production.

It is separate from [MCP](mcp.md): an MCP token represents a service integration,
while a diagnostic grant represents an authenticated operator.

## Enablement

```dotenv
DIAGNOSTICS_ENABLED=true
REDIS_URL=redis://default:GENERATED_BASE64URL_PASSWORD@redis:6379
```

- Allowed only when `APP_ENV` is `local` or `staging`. Both `npm run check:env` and
  runtime code reject `DIAGNOSTICS_ENABLED=true` in production; an invalid value
  leaves the endpoint disabled.
- When disabled, both the endpoint and grant management return 404, and the card
  says diagnostics is disabled.
- Redis is required, including locally. Without `REDIS_URL` the card shows an
  unavailable state and the endpoint returns `DIAGNOSTICS_REDIS_UNAVAILABLE` (503).
  Other local flows keep working without Redis.
- Run `npm run db:indexes` to create the access-retention and durable grant indexes.

## Grants

An administrator with a valid, verified session clicks **Create**; there is no
additional sign-in age restriction. The card sends a duration and an explicit
capability allowlist. Metadata capabilities are preselected; content capabilities
(`run.content`, `artifact.content`) must be selected. Expiry choices are 15 minutes,
1 hour (default), 4 hours, 24 hours, 1 week (7 days) and 1 month (30 days).

The server generates a fresh 32-byte random secret and hashes it with scrypt
(N=2^15, r=8, p=1, 32-byte key, unique 16-byte salt). The creation response returns
the bearer credential once. A popup provides one copy icon for this single string:

```text
Diagnostic endpoint: <configured APP_ORIGIN>/api/diagnostics | Authorization: Bearer <grant ID>.<base64url(secret)>
```

Copy the string and paste it into the diagnostic chat. If clipboard access fails,
the popup selects the text for manual copying. Closing the popup or leaving the
page discards the credential; losing it requires revoking the grant and creating
another. Credentials never appear in list responses, settings, settings history,
audit records, browser storage or logs.

The administration area, including this card and popup, is English-only regardless
of the public-app language preference. Its copy lives in source rather than locale
catalogs.

MongoDB is authoritative for grants. It stores the salt, verifier, issuer UID,
Firebase `auth_time`, access revision, capabilities, cursor-signing key and
timestamps in `diagnosticGrants`, scoped by project and application environment.

- Transactions serialize issuance through a per-issuer fence before counting and
  inserting, limiting each administrator to 20 active grants under concurrency.
- Reads explicitly enforce expiry; a MongoDB TTL index removes expired records
  later. Reading never extends a grant. Revocation deletes the durable record.
- Grants survive application publication/restarts and Redis recreation. Redis
  stores only rate-limit counters and remains required; either dependency being
  unavailable fails closed. Redis eviction no longer removes grants.
- The one-time switch from Redis-only grants deliberately invalidates old grants.
  There is no import or fallback. Create a replacement once after activation.
- `auditEvents` records `diagnostic-grant-requested` before activation, then
  `-activated` or `-failed`. An activation-audit failure withdraws the grant before
  reporting `DIAGNOSTIC_GRANT_UNCERTAIN`. If removal cannot be confirmed, the API
  returns `DIAGNOSTIC_GRANT_OUTCOME_UNKNOWN`; failed creation records include
  `outcome-uncertain` where applicable. Check active grants before retrying.
  Revocation takes effect first; its `-revoked` record follows.

The grant management API is `/api/admin/diagnostics/grants`:

- `GET` lists your active grants (metadata only).
- `POST` with `{ duration, capabilities }` creates a grant and returns
  `{ id, capabilities, issuedAt, expiresAt, credential, endpoint }` once.
- `DELETE` with `{ id }` revokes one of your grants.

All three use the session, same-origin/CSRF checks and request limits.

## Requests

```http
POST /api/diagnostics
Authorization: Bearer <grant ID>.<base64url(secret)>
Content-Type: application/json

{ "capability": "run.diagnose", "payload": { "id": "<logical Run or attempt ID>" } }
```

The base64url encoding is formatting, not encryption; send credentials only over
HTTPS except on loopback development endpoints. The helper reads the complete
copied string from a hidden prompt or a protected file and never prints it:

```sh
npm run diagnostics -- --capability capabilities.list
npm run diagnostics -- --access-file ./diagnostic-access --capability run.diagnose --payload '{"id":"RUN_ID"}'
```

On POSIX systems a credential file must not be readable by group or others. The
legacy `--grant` / `--phrase-file` interface remains available for compatible
credentials, but the popup's complete string uses the new default interface.

Checks run cheapest first:

1. A shared pre-authentication limit (120 attempts per minute).
2. Grant lookup.
3. A per-grant limit (30 requests per minute).
4. Constant-time scrypt verification.
5. Firebase account checks: the account still exists, is enabled and has a verified
   email, and its tokens were not revoked after the grant was issued.
6. Application access checks: the issuer is still an active administrator, its
   `notBefore` is respected, and its access revision is unchanged.
7. The grant's capability allowlist.

Because any access change bumps the revision, demoting and then re-promoting an
administrator does not revive their old grants. Random grant IDs only touch the one
shared limiter key. Anyone can exhaust that shared limit for a minute, which is
accepted for staging.

**Limits.** Requests are capped at 16 KiB, read as they arrive (chunked bodies
included), with a strict `{ capability, payload }` schema and a strict payload per
capability. Search pages hold 25 records. Responses are capped at 512 KiB
(`DIAGNOSTICS_RESPONSE_TOO_LARGE`, 422). The overall deadline is 10 seconds
(`DIAGNOSTICS_TIMEOUT`, 504), measured from request entry and covering
authentication, the body read, capability work and the access record. Capability
work stops 1.5 seconds early so the record can still be written, and its database
operations use driver timeouts.

**Pagination.** Cursors are HMAC-signed with the grant's key. Each cursor is bound
to its grant, capability, normalized criteria and an expiry of at most one hour.

**Responses.** Every response is JSON with `requestId` plus either `data` or a stable
`error.code`. All responses carry `Cache-Control: no-store`. Methods other than POST
return 405, and no CORS headers are sent.

**Access records.** Before any data is returned, a sanitized record is written to
`diagnosticAccess`: operator, grant, capability, outcome, status and affected
account/resource. Records are kept for 30 days. If that write fails, the request
returns `DIAGNOSTICS_AUDIT_UNAVAILABLE` (503) without data. Records never contain
the credential, the request body or returned content.

## Capabilities

`data-operations.status` reads the latest 20 recorded deployment-data outcomes and
current configured ledger summary. Payload is `{}` or an optional exact `planId` and
nonnegative bounded `offset`; ID details return at most 100 entries and explicit
continuation metadata. Reads are scoped to the configured application/environment/
database and use existing grant validation/errors. Existing grants gain no capability
implicitly. The admin Operations page calls the same reader after its administrator
check, without a new admin REST endpoint.

These are last recorded outcomes, never live progress inferred from age. Missing final
reports and active/unknown operations use workflow/host status. A ledger ID alone is
not verified completion. Resolution metadata can accompany the original failed/unknown
outcome without rewriting it. Host activation uses authoritative journal/verifier
proof and does not depend on this report copy. Reads create no indexes, settings,
leases, backups or migrations. See the [operator runbook](deployment.md#reusable-data-operations).

Call `capabilities.list` for the inputs each capability accepts.

| Area | Capabilities |
| --- | --- |
| Runtime | `runtime.status`, `workers.status` |
| Deployment data | `data-operations.status` |
| Configuration | `configuration.check` |
| Reports | `reports.search`, `reports.get` (runtime, audit, diagnostic-access) |
| Runs | `run.search`, `run.get`, `run.diagnose`, `run.content`* |
| Accounts | `account.search`, `account.get` |
| Credits | `credits.get`, `credits.ledger`, `credits.holds` |
| Payments | `payments.search`, `payments.get` |
| Files | `file.search`, `file.get` |
| Artifacts | `artifact.search`, `artifact.get`, `artifact.revisions`, `artifact.content`* |
| Notifications | `notifications.search`, `notifications.get` |
| AI administration | `orchestrator.search`, `orchestrator.get`, `persona.search`, `persona.get`, `settings.get` |

\* Content capability: requires explicit selection and an exact ID.

`run.get` also returns the accepted target, result-application status, owned Run
image metadata and promoted product-image references for its current attempt page.
These bounded projections exclude image bytes, object-store locations and lease
tokens. `resultMetadataTruncated` reports incomplete asset/application metadata;
individual product reference lists also report truncation. This distinguishes a
completed workflow from a completed save that did not attach the expected images.

Readers live in `src/lib/server/diagnostics` and use dedicated projections. They do
not call helpers that write as a side effect: `readSettings` seeds defaults, credit
reads expire lots, admin reports write the access-control fence, and
`capabilityForRun` creates capabilities. Expired lots are reported as
`expiredPendingSettlement`; missing settings are reported as unstored defaults.

Stored text is returned as inert JSON data and is never rendered or executed.
Responses never include:

- credentials, Run capability tokens, ciphertext or key fingerprints;
- server-injected private context or decision tokens (`run.content` also replaces
  any echo of the Run's capability token, matched by its stored hash);
- checkout URLs, raw webhook bodies, file bytes or signed URLs;
- environment dumps.

A key-name deny-list in `shape.ts` backs up the explicit projections.

## Private-context failures

The public failure code stays `private-context-unavailable`. New failed attempts
also store `failureDetail.reason`:

- `mcp-configuration-invalid`
- `mcp-disabled`
- `mcp-client-missing`
- `private-tools-missing`
- `mcp-permissions-missing`
- `encryption-key-missing`
- `encryption-key-invalid`
- `decryption-failed`

`run.diagnose` returns three kinds of evidence, each labelled with its source and
observation time:

- **Recorded:** the reason stored on the attempt.
- **Stored capability:** whether the saved Run context still decrypts, checked in
  memory; only the outcome is returned.
- **Current checks:** checks run now by this web process, plus the latest checks the
  AI worker reported with its heartbeats.

It reports whether the key comes from `DIFY_CREDENTIAL_ENCRYPTION_KEY` or the
`DIFY_MANAGEMENT_KEY` fallback. `APP_ORIGIN` is part of key derivation, so changing
the origin or the key breaks decryption of saved context. Older attempts without a
recorded reason are reported as `unrecorded`. Current checks are never presented as
proof of a historical cause.

## Staging activation

The feature flag is public configuration in `deploy/environments/*.json`, with
staging enabled and local/production disabled. The release image carries only the
allowlisted application flags and preloads them for its selected environment.
Flag changes use normal staging releases with the existing v1 controller; no
privileged controller update is needed for this activation.

1. **Owner:** the authorized application release operator under the
   [shared operations guide](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md).
2. **Install:** use the existing release workflow. Only the diagnostics flag is
   loaded from the image; private runtime settings stay on the host. Staging already
   uses private Redis, and no new secret or controller installation is required.
3. **Order:** install the additive diagnostics indexes, then release the revision
   with `runtime.DIAGNOSTICS_ENABLED` set to `"true"` in
   `deploy/environments/staging.json`. The image snapshots that value and the release recreates
   the web process. The three staging diagnostic indexes were installed and verified
   on 2026-10-29, with the collection empty before creation.
4. **Verify:** the card shows the grant form. Create a 15-minute metadata grant and
   call `capabilities.list`. Confirm a `diagnostic-grant-activated` audit record and a
   `diagnosticAccess` record, then revoke the grant and confirm a 401.
5. **Rotation and revocation:** grants expire by themselves, and administrators
   revoke them in the card. To disable diagnostic access, release `"false"` for the flag.
   Existing MongoDB grants remain stored until expiry or explicit revocation.
6. **Failure and resume:** release `"false"` in the tracked staging JSON or restore
   the previous image/configuration snapshot. Requests retain v1 compatibility;
   the earlier v2 controller package is superseded. Inspect the same release result
   before retrying; do not repeat completed index operations.

### Durable grant rollout

The create/copy and MongoDB persistence change is deployed on staging; see the
[current release](deployment.md#current-staging-release). The three additive grant
indexes were installed and read back on 2026-11-01 at 12:54:28 UTC against an
absent/empty collection, before activation. Installation is complete and must not
be repeated for a documentation-only merge. Application/data impact is limited to
these indexes and the one-time grant-store cutover; host profile/controller and
existing application data were unchanged.

- **Owner/location:** the authorized application release operator, using the
  existing application Node administration environment and its configured database.
- **Order for a new installation:** inspect existing data and take the normal
  operational backup before any change affecting it. Run `npm run db:indexes` from
  the new revision's Node administration environment before activating its web
  image. Publication/release still requires separate session authorization. No grant
  import is performed. Replace old Redis grants once.
- **Verify:** create/copy a short grant, call `capabilities.list`, then confirm it
  works after a later authorized release/Redis recreation. Revoke it and confirm 401.
- **Failure/resume:** inspect index and release outcomes before retrying. Index
  creation is idempotent. An old-image rollback cannot read MongoDB grants; leave
  additive data/indexes intact and issue an old-store grant if needed. Never restore
  a database merely to roll back application code.

## Verification

`tests/accounts/diagnostics.test.ts` covers:

- server-generated credentials, all durations, audit order, the concurrent
  MongoDB 20-grant cap, scope isolation, expiry before TTL cleanup, outages and
  revocation;
- role and Firebase revocation, and both rate limits;
- transport limits, cursor tampering, timeouts, oversized responses and audit
  failures;
- every capability against fixtures seeded with credential-like values, with
  before/after snapshots of business collections, including a wallet with expired
  lots and absent settings;
- each private-context reason, and decryption failure after an origin change.

MongoDB persistence tests use a disposable replica set and replace the limiter/store
instances. The real Redis limiter test runs only when `DIAGNOSTICS_TEST_REDIS_URL`
points at a disposable Redis. Docker being unavailable leaves that test skipped,
not evidence of a real Redis recreation check.

Local verification on 2026-11-01: 23 diagnostics checks passed (one optional real
Redis check skipped), 71 general tests passed, and typecheck, lint, build and
environment/docs/i18n/skill checks passed. English/Arabic desktop and 390px dialog
checks used mocked grant API responses with disposable authentication/MongoDB;
copy, manual fallback, focus, credential cleanup and hydration passed. Real Redis
recreation and published-release persistence remain live acceptance checks.

Staging release and independent deployment check passed on 2026-11-01; public
readiness reported the promoted source and unauthenticated grant management returned
401. Authenticated grant creation/revocation and persistence across a later release
remain functional acceptance. See the current release record above.
