# Reusable services

`project.config.json` selects modules at project creation. Accounts, administration,
preferences, diagnostics and persistence remain core. Navigation and admission
checks use the typed descriptors in `src/lib/project.ts`; their configuration
requirements also select the setup validator checks. Hiding a link never
replaces service ownership checks. Runtime configuration separately controls live
provider admission. Existing accepted work and financial evidence remain readable.

## Private files

`/files` and `/api/files` provide owned upload/list/download/deletion and usage.
Metadata/deletion use `/api/files/[id]`; bytes use its `/content` endpoint. Requests
authenticate before multipart reads, enforce origin/CSRF and shared limits, and
bound body consumption to the configured file size plus 1 MiB overhead and 30
seconds. Readers are cancelled on overflow, disconnect or timeout.

New accounts default to 20 MiB per file, 100 files and 100 MiB total; saved limits
are preserved. The existing image/document/audio/video allowlist applies. Images
are normalized; other files download as attachments with safe filenames and
nosniff. Local files use GridFS; configured private S3 storage retains digest and
version checks. Provider-only legacy uploads are not listed as downloadable files.

Quota is reserved transactionally before finalization. The account/upload retry
key deduplicates retries and rejects changed content. Maintenance reclaims stages
after 24 hours and retries fenced deletions. Quota is released only after confirmed
storage deletion. `409 FILE_IN_USE` protects retained product references and active
or uncertain Runs; eligible terminal-history cleanup releases its references.
Run inputs can reuse managed files with cached provider uploads per file/binding.

### Resumable uploads

Non-image files larger than one 8 MiB part use resumable uploads, up to the
`runs.fileBytes` setting (default 20 MiB, at most 1 GiB). Administrators raise it,
together with `filesPerAccount` (at most 100,000) and `uploadBytesPerAccount` (at
most 1 TiB), for products such as long meeting recordings. Images keep the single
request path because they are normalized as a whole.

- `POST /api/files/uploads` with `{ key, name, mime, bytes }` validates the name,
  type and size and reserves the declared size against the quota. Repeating the
  same key and file resumes it and reports the stored parts; another file under that
  key is an idempotency conflict.
- `PUT /api/files/uploads/[id]/parts/[n]` sends one part as
  `application/octet-stream`; every part except the last is exactly 8 MiB. The
  session is verified before the body is read, which is bounded to one part and 30
  seconds. A stored part with identical bytes is a no-op; different bytes conflict.
  A short per-part lease rejects concurrent writes of the same part with
  `409 UPLOAD_PART_BUSY`.
- `GET /api/files/uploads/[id]` returns the stored parts;
  `POST /api/files/uploads/[id]/complete` verifies every part, records the
  whole-file SHA-256 and marks the file ready.
- `DELETE /api/files/[id]` also abandons an unfinished resumable upload.

Parts are stored separately (GridFS files or private S3 objects) at locations
derived from the file and part number, so deletion also removes bytes from writes
that never recorded their part. Unfinished resumable uploads are reclaimed after
24 hours without a stored part. Downloads stream verified parts one at a time; a
part that fails verification ends the response before its declared length.
Buffered consumers, including Run inputs, accept part files up to 64 MiB; provider
uploads keep their own 20 MiB and `uploadBytes` limits, so larger recordings need
product-side processing such as chunked transcription.

## Notifications

The owned `/notifications` inbox and `/api/notifications` support paged reads,
unread summaries and read/read-all. Category preferences cover Runs, credits and
account changes, defaulting on. Human decisions, final parent Run outcomes,
confirmed purchase/reversal changes and administrative access changes enqueue a
notification intent in the originating MongoDB transaction.

The maintenance worker uses a fenced idempotent outbox consumer. Inbox retention
is 90 days; minimal event tombstones prevent replay after inbox expiration. Stored
template keys and bounded parameters render in the current locale. Links are
allowlisted internal destinations with ownership rechecked on opening. The visible
tab refreshes unread state every 30 seconds; session boundaries abort and clear
private client state after account changes.

## Security and deployment

The canonical environment catalog is `scripts/deploy/environment-catalog.json`.
Application validation, deployment validation and generated setup documentation
share accepted names. Deployment keeps staging and production credentials,
databases, origins and ingress networks separate; errors suppress secret values.

MongoDB stores durable, project/environment-scoped [diagnostic grants](diagnostics-api.md); Redis holds only their rate-limit counters. Publishing or recreating Redis preserves grants; unavailable dependencies fail closed. Diagnostic readers are read-only by construction and must not reuse service methods that seed settings, expire credit lots, refresh access fences or create Run capabilities.

Redis uses atomic counters with 60-second expiry, scoped to project/environment
and verified account or MCP client. Defaults per minute are 120 reads, 30 ordinary
mutations, 10 uploads, 240 resumable upload parts, 10 Run admissions and 120 MCP
calls. Policies are validated
server configuration. Limit failures return 429/Retry-After; dependency failures
return safe 503 responses. Local development may omit Redis. Deployment uses
private authenticated Redis and Nginx as the only application ingress.

Documents use nonce CSP passed to Next.js, next-themes and Radix styles, with
framing, content-type, referrer and permissions protections. Firebase helper and
public offline routes have explicit policies. Production excludes script
unsafe-eval. See [deployment](deployment.md) and [MCP](mcp.md) for operational setup.

## Domain extensions and migration

Register trusted adapters through `src/project/server.ts` (core adapters live in
`src/lib/server/domains.ts`), with a stable ID/version,
reference kind, ownership validation, target-picker metadata and transactional
result application. Register orchestrators against allowlisted adapters. Browser
and provider output cannot select handlers or owners. Preserve registered versions
for accepted attempts; the artifact adapter reads legacy records.

An optional adapter `prepare` hook may stage private, idempotent data before the
publish transaction. It must not publish references, charge credits or bypass the
current ownership/target checks in `apply`. Artifact preparation copies ready Run
images within MongoDB; unreferenced copies stay inaccessible through product reads.
Application failures retain an allowlisted code, phase and timestamp rather than
raw exception text. Failed saves still require the owner's explicit retry.

An optional `observeNode(db, job, node, session)` adapter hook receives bounded,
private provider observations through the existing AI worker. Registering the hook
opts that domain's accepted jobs into node-output/retry observations from live streams,
reconnect and terminal tracing. Other domains retain metadata-only behavior. Node
identity, retry index, parent iteration/loop identity, outputs, provider error and
execution metadata are supplied only when reported; missing values stay null and
`outputsTruncated` must be checked before treating output as complete. Inputs and
process data are excluded. Each normalized observation is capped at 1 MiB; console
readback retains its existing 1 MiB response and 1,000-row bounds.

The hook runs in the same transaction as the worker lease fence and receives the
fresh server-owned job identity. It must be idempotent, use the supplied session,
perform no external I/O and retain/reconcile only accepted work. It grants no new
dispatch or account-ownership authority. This allows restricted retention while
cancellation is pending; ordinary publication/dispatch checks still apply. Hook
failures roll back and propagate rather than becoming a successful observation.
Private node observations are never written to public `runEvents` or usage summaries.

Opt-in native node observers receive a running execution observation with the actual
publication from `workflow_started` before node events. Missing legacy identities are
not inferred; publication mismatches stop observation without retrying dispatch.
Reconnect does not replay this historical running state over newer evidence. No
provider inputs are included, and initial usage remains unknown until reported.

Keep raw outputs/errors out of logs and user DTOs; use the existing redacted private
evidence writer for diagnostic retention, passing the supplied session as the optional
fourth `retainEvidence` argument so evidence and the hook transaction commit/roll back
together. Existing callers retain their own transaction behavior. Derive immutable
evidence identities from the accepted Run, native execution, status/retry identity
and payload hash; Dify can reuse a native execution ID across retry observations.
Loop/Iteration metadata repeats accumulated child usage; the adapter excludes those
aggregates from additive node prices/tokens and retains their native identity and
duration. Parent execution totals remain available. This follows the engine
[Loop metadata](https://github.com/langgenius/graphon/blob/v0.7.0/src/graphon/graph_engine/loop_container_handler.py);
existing ledger records are not rewritten. Reported node durations are retained in
the existing usage field, including when activity logs are cleaned.

Node retry indexes are Dify's reported values, not a count of hidden provider SDK attempts. This seam does not itself
implement action retry policy, scheduling or recovery.

For non-paid internal waits, a domain may declare fixed `applicationWaitNodes`
(native Human Input node IDs) and `resumePaused(db, job)`. These declarations belong
to that adapter version, not model output or browser configuration; retain accepted
versions when changing node identities. The registry rejects duplicate/invalid IDs
or declarations without a resume hook. The existing worker invokes the hook only for
an application wait on a paused Run with a live lease, current account authorization,
no cancellation and time remaining in the existing reconciliation window. Returning
a future Date sets eligibility using the same worker queue; normal poll/reconciliation
bounds remain in force. Do not sleep, dispatch paid work, create a successor or add a
scheduler in this hook. Revalidate the actual owned action and its due time/counters
before responding; declaration of a node alone is not business authorization.

Internal waits retain the existing `runDecisions` submission journal but do not send
creator notifications or appear in public decision pages/events or persona answering.
The Run displays reconciliation progress instead of requesting user input. Genuine
human decisions retain their normal behavior, including when another branch has an
internal wait. Use `submitAuthorizedDecision` with application provenance, the matching
adapter ID/version and current worker job. It checks the owned stored wait, active
worker fence and existing account/admission guards; user/persona answers cannot resume
an internal wait, and application answers cannot approve any approval form. A lost
submission response stays unknown in the same journal and is reconciled by existing
native event/readback; repeating the intent does not submit again. No provider-attempt
count, automatic successor or creative policy is added by this generic seam.

A server extension may supply `reconcile(db, now)` for one bounded pass over
already accepted unresolved work, such as late child results after a parent Run
terminates. The existing AI worker calls it after normal Run/decision/result work;
its existing mode switch, heartbeat and cycle timing remain authoritative. Unlike
new admission, this callback is not filtered by module visibility/enabled state.
It must claim/fence its own existing work records, perform only bounded non-paid
readback/retention, preserve current ownership for publication, and return whether
it did work. Do not dispatch paid actions, create a successor, add a queue/scheduler,
or keep a verified stopped Run active just to poll its unresolved children. Errors
use the existing worker error path; raw evidence stays private and redacted.

After reviewing the target database and taking the normal operational backup,
`npm run db:migrate` applies the `runs:0001-domain-references` migration, which
adds reference metadata idempotently. It does not rename or rewrite accounting
collections. `npm run db:indexes` adds the new collection indexes. These commands
operate on the explicitly configured database; local tests use disposable stores.

See [locale architecture](architecture.md#locale-and-direction) and the
[acceptance checklist](test-plan.md#reuse-and-service-hardening-acceptance).
