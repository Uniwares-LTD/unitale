# MCP implementation and maintenance

## Environment-owned Dify apps

Creation/copying manage a deterministic `<project_with_underscores>_managed_<environment>`
MCP provider in the configured Dify workspace. Setup verifies authenticated
`get_connection_info_v1` identity and current tools, installs only this server's
selected Run-client credential and refreshes discovery from Dify. An unrelated
provider occupying the identifier is rejected; rename it explicitly before retrying.
Managed Dify URLs add a public `connection=<managed identifier>` query discriminator
because Dify requires endpoint URLs to be unique as well as connection identifiers.
The canonical endpoint remains unchanged for identity probes and configuration.
The query grants no access; service credentials and owned Run capabilities remain
mandatory. Existing manual providers using the same endpoint are left untouched.
Local tunnels use local-only `MCP_PUBLIC_URL`; hosted deployments use `APP_ORIGIN`.
Redirects, foreign identity, missing permissions and unreachable endpoints fail closed.

`difyAppOwnership` records the journaled import, environment and optional exact source
publication. App names end in `[local]`, `[staging]` or `[production]` with the
`app:<project>-<environment>` tag. Names/tags alone never confer ownership. Registration
requires the stored import and matching remote metadata; it cannot adopt an app.
Copying exports an exact publication without secrets into a new destination app,
preserving the source draft, publications, credential and MCP connection.

Published-version registration validates bindings without rewriting them. Explicit
draft registration may bind known Unibase tools and publish the owned draft.
Third-party MCP nodes require destination mappings in Application settings. Missing models,
knowledge bases, builtin-tool authorization and secret variables block registration;
configure the destination and resume. No models or workflow tools are invoked.

`environmentMcpSetups` leases/journals provider setup and retains provider UUIDs to
detect replacement/collision. App imports retain the creation journal; unknown imports
are never repeated. Registration snapshots environment/endpoint identity with the
definition, and live new Run admission rejects missing/foreign bindings. Existing
unmanaged registrations are removed manually; no migration is performed.

The identity tool requires `server:read` and returns only project, environment and
configured origin. No environment dump, tokens or user data are exposed. Validation
does not execute arbitrary Code nodes or certify external services' runtime behavior.

Unibase exposes optional, authenticated, bounded tools at `/api/mcp` inside the
existing Next.js Node application. No separate server or AI worker is required
to call MCP. A Dify workflow invoking it still uses the normal Run attempt/credit flow.

## Setup

Generate a separate random credential for each trusted client:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Store the generated value privately in `.env.local` or deployment secrets:

```dotenv
MCP_ENABLED=true
MCP_CLIENTS_JSON='[{"id":"dify","tokenEnv":"MCP_TOKEN_DIFY","permissions":["server:read","reference:read","demo:read"]}]'
MCP_TOKEN_DIFY=replace-with-generated-token
# Only when using an additional externally reachable hostname:
MCP_ALLOWED_HOSTS_JSON='["your-tunnel.example.com"]'
```

The placeholder is not a valid credential. Tokens must be 43–256 base64url
characters; generate at least 32 random bytes. Never reuse a Dify app key, Firebase
credential, or browser session. Run `npm run check:env`, then restart the web
process. MCP is disabled by default and returns 404 without requiring credentials.

`APP_ORIGIN` is the primary allowed host/origin. Additional hosts are exact
hostnames with optional ports, not URLs or wildcards. Their permitted Origin is
HTTPS. Clients without an Origin header are supported. Headers claiming an
unapproved Host or Origin are rejected; forwarded host headers are not trusted.
There is no browser CORS integration. Configure the reverse proxy to preserve the
public Host, forward Authorization, disable caching on this endpoint, and apply
appropriate per-client/IP rate limits. Do not expose your whole local development
server unnecessarily when creating a tunnel; route only the intended endpoint.

## Protocol and security boundary

The implementation pins official `@modelcontextprotocol/server` and test client
`@modelcontextprotocol/client` to 2.3.1. It uses SDK protocol negotiation and
stateless Streamable HTTP with JSON responses. Local compatibility tests cover
the SDK client and explicit `2025-03-26` negotiation. Initialization, tool discovery and
tool invocation use POST. GET streaming and DELETE sessions are unsupported (405);
there are no persistent MCP sessions, subscriptions, resources or prompts.

Every request requires `Authorization: Bearer <token>`. Discovery is filtered by
the authenticated client's permissions, and execution rechecks permission. Each
request has a separate server/transport and actor context. This is a trusted-service
token integration, **not** an OAuth authorization server or an end-user consent
flow. Clients must support custom authorization headers. A service credential
does not establish an application's end-user identity.

Request bodies and serialized MCP responses default to 64 KiB. Tool output is
limited to just under 32 KiB because the response includes structured content and
a JSON text fallback. Execution defaults to a 10-second timeout. Administrators can change these durable limits in Application settings; see [foundation configuration](features/booklet-foundation/services.md#mcp-configuration-and-extensions). Handlers must honor
the supplied AbortSignal: the timeout ends the response but cannot preempt
synchronous CPU loops or undo side effects in an uncooperative handler.

Configuration is private and validated at startup and by `check:env`. There is no
anonymous tool catalog, arbitrary filesystem access, arbitrary URL fetch, or raw
database query tool. HTTP credentials never reach tool arguments or LLM prompts.

## Included tools

| Tool                        | Permission       | Input and result                                                                                                                  |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `get_server_info_v1`        | `server:read`    | Empty object → public app name and catalog version.                                                                               |
| `get_reference_document_v1` | `reference:read` | `documentId: "unibase-demo"` → synthetic visitor guide, revision and request ID.                                                  |
| `get_demo_catalog_v1`       | `demo:read`      | `category: "all", "equipment" or "guides"` → three or fewer synthetic products and prices in USD cents.                           |
| `calculate_demo_quote_v1`   | `demo:read`      | Allowlisted `itemId`, integer `quantity: 1..20`, `delivery: "standard" or "express"` → subtotal, delivery and total in USD cents. |

Catalog version 1.1.0 adds the demo tools. Grant `demo:read` explicitly to intended
clients, restart the web process, and refresh Dify tools. Existing reference-only
clients retain their original tool access. Quote calculation and approval do not
create orders, payments, inventory reservations or user records. The demo tools
remain available for custom workflows. The Admin Create dropdown
offers Document summary, Saved artifact, Unitale and Case preparation as samples.
Templates are JSON DSL in `src/lib/server/runs/templates`; configure their LLM
nodes in Dify before running them.

The example document is bundled server data, not a real venue or user record.
It intentionally contains information a workflow should fetch rather than infer.
These tools change no data and charge no credits. MCP results include
`structuredContent` and a text block containing the same JSON object.

## Native image results

Project tools can optionally define `images(result)` on `RegisteredTool`. It is a
synchronous projection of bytes already fetched and authorized by `run`; do not
perform more I/O there. Return ordered `{ data: Uint8Array, mimeType }` values.
PNG, JPEG, WebP, GIF and AVIF MIME types are supported. The transport preserves the
bytes without resizing or re-encoding and emits standard MCP image content blocks
following the existing JSON text fallback. `structuredContent` still contains only
the parsed `output` object. Keep binary carriers out of that schema, for example
with a stripping `z.object(...)` output schema. Never expose raw bytes/base64 in
public JSON fields, credentials, arbitrary fetch URLs or private Run capabilities.

Tools retain responsibility for ownership, original integrity and ordered metadata
that identifies each image. This transport does not fetch URLs or authorize assets.
Empty/unsupported image payloads fail with the existing sanitized tool error. The
sum of JSON text bytes and serialized image blocks must fit `toolResultBytes`;
base64 overhead counts. The complete serialized response, including duplicate
structured JSON and protocol overhead, must also fit `responseBytes`. Defaults are
unchanged and intentionally too small for most generated originals; configure both
limits for the intended bounded payload before activation. Do not increase them
without considering the existing 16 MiB tool / 32 MiB response maxima.

Local tests use the official MCP client to prove byte identity/order and limits.
They do not establish a particular Dify deployment's conversion to native files;
verify that end to end in the target environment before relying on it.

## Connect Dify and extend the test workflow

1. Make `/api/mcp` reachable from the Dify server over HTTPS, using staging or a
   tunnel. Dify's localhost is not your development computer. Verify ingress and
   Dify's outbound network policy allow this destination; do not disable SSRF
   protections globally.
2. In Dify **Integrations → Tools → MCP**, add the full endpoint URL, name, and a
   stable server identifier such as `unibase_test`. Set the custom header
   `Authorization: Bearer <your MCP token>`. This server does not offer OAuth;
   do not configure it as an OAuth client. Connect and refresh the tools.
3. In the existing Unibase Test workflow, insert a Tool node selecting
   `get_reference_document_v1` before the LLM. Set `documentId` to the constant
   `unibase-demo`, not a value chosen by the model.
4. Connect **Start → Tool → LLM → End**. Use Start's `prompt` only if this workflow declares it; inline instructions need no input.
   In the LLM user message, insert Start's `prompt` and the Tool node's structured
   `title`, `body`, `revision` and `requestId` outputs using Dify's variable picker.
   Dify converts JSON text blocks into its `json` output, so the tool's `text`
   output can be empty even after a successful call. Tell the LLM to answer using
   the reference document as data and include its revision and request ID. Map the LLM output into End; Unibase normalizes ordinary outputs.
   Use a versioned envelope only for rich cards/images or business failure outcomes.
5. Test: “When does the observatory open and what is the visitor password?” Expect
   Friday at 19:30 and silver-lantern, with revision/request ID from the tool.
   Inspect the Tool node's result as well as the answer; model text alone is not
   proof of a callback. Publish the updated workflow in the same Dify app.
6. Register the current published workflow in Administration, then submit the same question through Unibase `/runs/new`. Confirm successful completion,
   saved result after reload, and normal credit settlement. Correlate the tool's
   returned request ID with server logs.
7. For update acceptance, change the synthetic document and increment its revision
   in code, deploy/restart, and run again. Confirm the new revision and content.

Dify output labels can vary by version; inspect the Tool node's output and prefer
the structured fields from its output schema. If a version only exposes `json`,
serialize that output through a Template node before passing it to the LLM; do
not assume `text` contains the JSON. Once connected, export the working DSL from that instance.
Preserve its MCP server identifier; when importing into another Dify workspace,
create a server with that same identifier and configure credentials there. Inspect
exports for secrets before sharing. The sanitized `dify/orchestrators/mcp-reference.yaml` template uses `unibase_test`;
rebind its Tool node and inspect structured outputs after importing.

Registration checks the stored MCP provider authorization and selected tool names
without invoking them. It does not configure providers, credentials or writes.
External MCP servers may provide read/write tools under their own permissions.
Public examples remain read-only. Private artifact tools require explicit
permissions and an owned Run capability independent of the service token.

### Unitale staging permissions

Unitale's registered snapshot uses `get_run_context_v1`, `read_artifact_v1`,
`save_artifact_draft_v1` and `approve_artifact_v1`. Its selected Run client (`dify`
in staging) therefore needs `run:read`, `artifact:read` and `artifact:write` in
addition to its existing public-tool permissions. The tracked staging profile
selects these permissions explicitly; local and production defaults are unchanged.
The service token alone still cannot read another account's artifacts: private
tools also validate the separate owned Run capability.

The 2026-10-29 diagnostic check found these three permissions missing in both the
web process and active AI worker. The affected attempt was never dispatched and
charged zero credits; it predates detailed failure reasons, so the exact historical
cause is not recorded. The permission correction is prepared, not evidence of live
installation. Apply the matching protected host profile/control bundle before
release under [operator reporting](deployment.md#publication-and-operator-intervention),
then refresh Dify's MCP tool catalog. Confirm no missing permissions in both web
and the active worker before restarting one failed Run as a new attempt. Preserve
the original attempt and accounting; do not retry every failed Run automatically.

## Add and update tools

The registry is in `src/lib/server/mcp/tools.ts`; transport and execution boundaries
are in `handler.ts` alongside it. Keep all handlers under server-only modules.

To add a read-only `get_catalog_item_v1` tool:

1. Implement a server service accepting a validated item ID and authorized actor
   context. Return an explicit DTO, never a database document or environment map.
2. Add a registry entry with a unique stable name, precise description, strict Zod
   object input/output schemas, required permission, and async handler. Call the
   service directly and propagate `context.signal`. Register operation-specific permissions and write annotations for mutations;
   annotations describe behavior, not authorization.
3. Add the permission to the configuration allowlist. Grant it explicitly to
   intended client entries; never give new tools implicit access through wildcards.
4. Test valid results, invalid arguments, denied discovery/direct invocation,
   result validation/size, cancellation, and safe failures. Increment catalog
   version. Do not add the example above without a real feature requirement.
5. Deploy, refresh Dify's catalog, then add/update affected workflow nodes and
   publish. Discovery refresh does not rewrite workflows or enable agent tools.

Keep compatible additions under the same tool name. For required parameter
changes, renamed fields, or incompatible result/behavior changes, add a `_v2`
tool and retain `_v1` until consumers migrate. Roll back by restoring the earlier
deployment while preserving old contracts. Remove tools only after confirming
their consumers have migrated. Stateless v1 does not push catalog-change events;
refresh is an explicit operator step.

Private tools use verified Run authorization and operation-specific services;
never trust a model-supplied UID or Run ID. New writes must include transactional
idempotency, ownership, approval and durable operation evidence.
OAuth, arbitrary remote plugins, and an admin catalog are outside this version.

## Operations, verification and troubleshooting

`npm run test:mcp` uses the official client over a local HTTP fixture, synthetic
credentials, and no paid providers. The tests also run with `test:accounts`.
Run affected tests, `typecheck`, lint and build after SDK or tool changes. Review
official SDK release notes and verify negotiation against your installed Dify
version before updating the pinned dependency. Test across deployment replicas;
no in-memory session affinity should be required.

Runtime events `mcp-request` and `mcp-tool` use the existing logging infrastructure
and 30-day retention. Metadata is limited to safe identifiers, outcome, status,
duration and generated request ID. Headers, arguments, returned content and raw
exceptions are excluded. Tool failures can have HTTP 200 with MCP `isError`;
inspect `mcp-tool` outcome as well as HTTP status. Logging failures remain advisory.

| Symptom                      | Check                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| 404                          | MCP_ENABLED and whether the web process restarted.                                 |
| 401                          | Separate MCP credential, exact Bearer header, rotation and current process config. |
| 403                          | Host/Origin allowlist and reverse-proxy Host preservation.                         |
| Missing tool / unknown tool  | Client permissions, deployed registry, Dify catalog refresh.                       |
| 405 on GET                   | Use Streamable HTTP POST; legacy SSE is unsupported.                               |
| Protocol error               | Client protocol compatibility and JSON/Accept headers; use the official client.    |
| 413 / bounded-output failure | Request/result size; return a smaller DTO.                                         |
| Timeout                      | Handler cancellation, dependency timeout, network path and correlated logs.        |
| Queued AI job                | Check AI worker independently; MCP does not dispatch the original job.             |

Rotate by adding a new client ID/token with the same permissions, restart all web
replicas, update Dify's credential, verify it, then remove the old entry and restart
again. Removal revokes subsequent requests; an already executing read may finish.
Emergency disable uses `MCP_ENABLED=false` and restarts all replicas. Tokens and
deployment URLs must not be copied into downstream template repositories.

The Unibase starter exercised a live Dify MCP read through an authenticated
temporary tunnel, then Human Input continuation and a native text result.
Temporary tunnels depend on their local proxy and tunnel processes. Expose only
`/api/mcp`; all other paths must return 404. Use a stable reachable endpoint for
ongoing use. General deployment/plugin acceptance remains installation-specific.

Cloudflare Tunnel requires outbound port 7844: UDP for QUIC or TCP for HTTP/2.
If QUIC disconnects repeatedly, test `--protocol http2`; TCP connectivity must
still pass. Cloudflare API access over HTTPS port 443 does not prove tunnel edge
connectivity. Check cloudflared's startup connectivity results before updating a
Dify provider URL; keep the same authenticated MCP-only proxy behind the tunnel.
With the locally verified cloudflared 2026.10.0 client, connectivity prechecks can
abort an explicitly selected QUIC connection because TCP/HTTP2 is blocked, even
when the UDP check succeeds. In that situation, `--protocol quic --no-prechecks`
was verified to establish a real QUIC connection. Require the subsequent
`Registered tunnel connection` log, authenticated public MCP checks and successful
Dify tool refresh before switching provider URLs. A generated quick-tunnel URL
alone is insufficient evidence. Keep the tunnel process running during Runs;
quick-tunnel addresses can change after restart.

A running process and an old registration log do not prove current connectivity.
If current reconnect attempts report `Unauthorized: Tunnel not found`, the quick
tunnel is no longer usable. Restart that tunnel, verify the new public endpoint
and refresh the existing Dify providers before starting another Run. Preserve
in-flight Run identities; a tunnel outage does not prove execution stopped.

When updating an existing Dify MCP connection, preserve its provider UUID, server
identifier, credentials and settings. Management responses mask the endpoint path;
verify the saved host and actual tool discovery rather than comparing the masked
display URL byte-for-byte. Distinct providers require distinct URLs in Dify. A
local MCP-only proxy may allow explicit connection-label query values while
forwarding only the authenticated `/api/mcp` endpoint. Verify unknown paths remain
404 and unauthenticated MCP requests remain 401.
See [Cloudflare tunnel firewall requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/).

References: [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[Dify tool configuration](https://docs.dify.ai/en/cloud/use-dify/workspace/tools).

## Private Run and artifact tools

Catalog 1.2.0 adds `get_run_context_v1` (`run:read`), `read_artifact_v1`
(`artifact:read`), and `save_artifact_draft_v1` / `approve_artifact_v1`
(`artifact:write`). Explicit grants are required; public-only clients retain their
previous catalog. Writes use the same request/output/time bounds and cancellation
signal, and their discovery annotations reflect mutation behavior.

Catalog 1.2.1 returns `draftText` from `read_artifact_v1`, alongside `artifactId`,
`title` and `revision`. Artifact storage and the draft-save input still use `text`.
Dify reserves the top-level structured tool output names `text`, `json` and
`files`; use other field names or nest those values. After changing a tool output
schema, restart the web server if it uses a production build and refresh the MCP
provider's tools in Dify. Existing sample graph bindings use `read.json` and its
revision, so this correction does not require republishing the workflow.

Set `RUN_MCP_CLIENT_ID` (default `dify`) to the dedicated trusted Dify client. Run
capabilities use the existing encryption-secret configuration, with a separate
HKDF purpose. Enable the same MCP permissions/configuration on the web and worker
processes. Provision indexes before use; `runCapabilities.jobId` is unique.

New workflows opt in with required text Start input `context`. Bind it directly
as a variable to private tools' `runContext` argument. Registration hides this
system field from user controls and rejects using it in other nodes/arguments.
No workflow graphs are rewritten. This bearer capability is visible to trusted
Dify execution storage and must stay out of LLM prompts and shared DSL/log exports;
Dify does not automatically forward an authenticated Unibase Run identity.

Registration treats `context` as private when the graph calls private MCP tools,
so ordinary/public persona context keeps its normal meaning. Each registration
snapshots `contextInputName`; older `unibase_context` publications remain valid,
and accepted snapshots with only `contextInput: true` continue using that legacy
name. The worker injects only the snapshot's selected name. Public history,
idempotency/restart inputs and persona context exclude the private field by that
same name. Rename an existing Dify graph explicitly and re-register it; no
published graphs or accepted Runs are migrated automatically.

Each request needs both the service credential and capability. The capability
resolves the accepted attempt, verified user, allowed client/operations, optional
artifact and deadline. Cancelled/terminal/expired or currently unauthorized access
fails closed; pause and human takeover retain the owned context. Tools return
bounded allowlisted context and entity DTOs, never database documents or tokens.

Draft saves use `operationKey`, `expectedRevision` and bounded text. Approval uses
`operationKey`, revision and content hash; a persisted matching decision must be
submitted with the required action. Human-only approvals reject persona sources.
In `raw-v1`, a submitted persona `continue` may supply approval evidence after the
workflow's prompted interpretation. Its recorded persona ID/revision must match
the accepted snapshot and the approval must permit personas. Raw human text does
not supply approval evidence: a User must click the explicit approval action.
Transactional `productOperations` records make identical retries return the first
result and reject changed payloads. A timeout cannot undo a committed save; callers
retry the same operation key to reconcile it. No arbitrary URL/image fetch or raw
query endpoint is added.


## Project selection and shared limits

MCP is an optional project module and remains runtime-disabled until configured.
Application-mode projects omit synthetic reference/catalog/quote tools and artifact
example tools. Example mode makes them available only under their explicit grants.
Run tools still require owned Run capabilities; service credentials never confer
end-user ownership. Registered clients share Redis-backed request limits scoped to
project/environment/client. Exceeded limits return 429 with Retry-After; Redis
failure returns a safe 503. The environment catalog and deployment validation use
the same strictly named `MCP_TOKEN_*` credentials and Run client selection.

## Unitale booklet catalog (T17)

Checkpoint 09 now adds versioned project tools alongside the v1 catalog:
`booklet_checkpoint_v2`, atomic fence refresh through `booklet_lease_v2`, and
specialist registration and guarded text/image/preparation dispatch
through `booklet_begin_work_v2`.
Each accepts private `runContext` plus a bounded JSON-string `request` and returns
an explicit `result` object. They require an owned native v2 Manager Run and its current
prepaid workflow/job binding, use atomic version/fence checks and leave no lease across
calls. Exact retries replay existing receipts. Initial atomic checkpoints accept fence
zero. The core catalog version is unchanged; these project-extension contracts are
versioned in their names. Dispatch accepts registered creative text, image generation,
all six review modes and unpaid preparation with bounded owned original references. Paid work checks
configured suite, ownership, funding, locks, attempts, reported cost and native execution
bounds; unpaid preparation uses the same durable dispatch and native-result retention.
Image-request review must match an exact retained preparation, including target, source
tuples and ordered original identities; image generation uses that same retained
preparation guard. Context separates text (`canDispatch`) and image (`canDispatchImage`)
call eligibility. All six assessment modes, original retention/publication,
corrective generation and revalidation are locally verified. Whole-book inputs bind
the selected immutable manifest and actual page-image sources/originals. Registered
Generate work summaries expose exact preflight facts outside the recent assessment
preview; correction finding lineage is verified at registration. The acceptance
gateway records the current Manager's exact owned revision/source/original selection
with admission, lock, funding and evidence checks. It grants no human or quality
authority. The bounded reader supports owned `acceptance` records. Human decisions,
manifest publication and completion remain 09.4 work. The candidate execution switch stays disabled.
No Dify binding, credential, shared provider or live configuration changes are included.
`booklet_sources_v2` verifies owned immutable source tuples and requested original
identities, returning `{references:[{assetId,sha256,bytes}]}` plus ordered native MCP
image blocks. Binary carriers are excluded from JSON. Every image is read with owned
byte/hash verification; derivatives, changed identities and foreign assets fail.
References have a maximum of 16 entries and an 8 MiB aggregate transfer allowance;
capacity failure never drops references or resizes originals. See the handoff's
existing MCP-limit configuration for base64/response capacity. Actual Dify conversion
of these blocks into native files remains checkpoint 12 evidence.
`booklet_retain_original_v2` accepts `{callId,outputKey,nativeFile,fence}` and returns
`{asset:{id,sha256,bytes,mime,width,height,...},fence}`. It matches the exact observed
Generate output, refreshes the mutation fence with a replay receipt, and uses the existing
restricted first-party downloader (8 MiB) and verified original-media store. Stored
receipt replays perform no download. Canvas/format changes, forged files and unobserved
outputs fail. It makes no generation call. Expired native URLs remain an explicit
unresolved retention gap; no redispatch or provider renewal machinery is added.
`booklet_record_assessment_v2` accepts `{assessment,executionLocator:{runId,nodeId:"child-quality-reviewer",executionId},fence}`.
It derives policy/Reviewer identities from the originating Run's server configuration,
matches an exact retained native proposal, and returns `{assessmentId,complete,fence}`
through the existing atomic receipt path. It cannot fabricate execution or coverage.
`booklet_read_document_v2` additionally exposes owned production/checkpoint/revision/work/assessment DTOs
under `extension:booklets:read`. Its existing `{kind,id,cursor?}` request returns whole
small JSON values or bounded typed sections, array pages and decoded text fragments.
Each response identifies its path, hash and completeness; cursors reject changed or
different documents. Follow child and page cursors without decoding them. No base64
content reconstruction is required. Artifact history reads return at most 20 metadata
items with an initial ordinal snapshot; later appends require a fresh read and bodies
are fetched separately by immutable revision ID. Human-response and execution reads
remain pending. These reads share the same private native Manager and prepaid binding checks.
`booklet_transfer_v2` reuses bounded staging with server-selected v2 ownership. Its
request is `{action:"open",key,kind,bytes,sha256}` or
`{action:"part",transferId,index,data}`. Parts use the returned decoded chunk size and
canonical base64. Changed metadata/bytes, incomplete payloads and private context
spanning adjacent chunks are rejected. This stores bytes only; it does not publish a
revision, authorize generation or alter the production fence. Existing v1 callers
retain strict v1 ownership. Work reads also expose retained meaningful request and
observed result bodies through the existing typed paging protocol.
`booklet_reconcile_work_v2` accepts `{callId,executionLocator?}`. An optional locator
contains the stored parent Manager's native `runId`, plus optional `nodeId` and
`executionId` to constrain its child-node tracing. It cannot select a provider/app;
changed run/node identities fail. The app derives the authoritative parent from work,
retrieves that execution and verifies its accepted workflow before retaining matching
child observations. Known results and undispatched registrations need no provider call.
Replies expose status, result availability and a typed work-document locator; they
do not copy large bodies into the Manager checkpoint. Missing/uncertain evidence never
grants safe replay. This is non-paid readback, not automatic worker recovery or cost
settlement. The native transport is locally tested with deterministic readback only.
`booklet_index_v2` atomically registers subject/artifact entries, returns stable ID maps
and an advanced fence, and reuses matching entries without changing their revision
pointers. Purchased capacity and one responsibility per subject are enforced. Changed
identity metadata/reparenting and invalid batches fail without partial index writes.
`booklet_save_revision_v2` publishes retained text proposals or selected observed originals. Its
arguments are `{artifactId,content,sources,assets,evidence,mutationKey,fence}`. Prefer
`content:{callId,itemId,proposalIndex}` to select an exact retained successful proposal;
no creative text is copied through the model. Typed content or `{transferId}` containing
a complete revision JSON payload is also accepted and must match the retained proposal.
The server derives producer/Run provenance, checks the current prepaid Manager, funding,
target scope, evidence, locks and product limits, then atomically advances the pointer.
Replies contain actual revision/hash/fence identities. Cast/location roster deltas merge
structurally while preserving the other kind and their previous-roster source lineage.
For images supply `content:{kind:"reference"|"page-image",asset:{assetId,sha256}}`
and exactly that single identity in `assets`, using the originating Generate evidence
and sources. Each original/artifact publishes once; other returned originals can have
separate candidate revisions without another generation. Revalidation accepts
`revalidatedFrom` with unchanged assets, replacement sources and retained producer
or exact-context review evidence; content can be omitted for server-side reuse.
It writes immutable lineage and grants no acceptance or new provider dispatch.
Final acceptance remains pending.

The `booklets` server extension registers these private v1 tools on the existing
`/api/mcp`. One service credential with `extension:booklets:read` and
`extension:booklets:write` covers the catalog. Each invocation also requires the
automatically injected `runContext`; it is not a second operator-managed credential.
The accepted capability must allow that tool. The server derives account, production,
order, workflow and Run attempt identities; callers cannot override them. Only an
active, owned booklet orchestrator Run without a persona can use these tools.
No browser upload route, parallel REST tools, provider dispatch or production
workflow registration is introduced.

| Tool (all prefixed `booklet_`, suffixed `_v1`) | Behavior |
| --- | --- |
| `context` | Small production/version/lease summary |
| `read_document` | Hash-bound JSON or original-image chunks for production, revision, operation, review form, evidence or asset |
| `lease` | Acquire, renew or release a versioned mutation lease owned by this Run attempt |
| `index` | Add stable subjects and embedded artifact responsibilities |
| `begin_generation` | Authorize an image operation and enforce stage locks and source prerequisites |
| `transfer` | Open immutable metadata or send one base64 chunk |
| `retain_original` | Verify and retain an uploaded generated original for its authorized operation |
| `save_revision` | Validate transferred typed content and atomically append a revision/advance its pointer |
| `request_review` | Prepare exact-revision Human Input; retrieve the unchanged form with `read_document` |
| `apply_decision` | Apply an existing authenticated human answer; never manufacture one |
| `record_evidence` | Retain redacted diagnostics, without provider-measurement authority |
| `record_quality` | Apply trusted measured reviewer evidence under a server-owned publication binding |
| `sources` | Hash-bound JSON chunks describing exact original/source identities for generation or review |
| `reconcile_generation` | Inspect trusted execution evidence to resolve an existing operation, without replay |
| `complete` | Verify the accepted manifest, required quality and original bytes |

`context`, `read_document` and `sources` require read permission; the others require
write permission. Results use `result`, except chunk reads, whose structured output
contains `sha256`, `bytes`, `offset`, `nextOffset` and base64 `data`. Transfer chunks
carry at most 8 KiB of decoded bytes. Start reads at offset zero and use the returned
hash on subsequent chunks; changed documents fail explicitly. Read a revision to get
its content and each original separately after resolving source identities. These
responses fit the default MCP bounds, including text fallback; smaller administrator
limits can reject them explicitly. There is no content truncation.

Original-image chunk reads reuse verified immutable bytes in a process-local cache
shared by Mongo client and isolated by database/asset/hash/storage identity. It holds
at most 64 MiB and 32 entries, with 60-second idle expiry and least-recently-used
eviction. A cold read verifies the full original once; subsequent chunks avoid full
storage downloads and hashing. Every request still checks account, ownership and
deletion before and after accessing bytes. Replicas and expired/evicted entries
independently reverify storage; cached bytes never cache authorization.

Upload metadata specifies a stable key, kind, byte count and SHA-256. Images are
bounded at 64 MiB, revision JSON at 4 MiB and diagnostic JSON at 1 MiB. The final
media/repository validators may reject tighter pixel, BSON or package limits.
Each production also has a transactionally reserved cumulative transfer budget:
64 MiB per allowed image call plus 4 MiB per allowed text call. Failed or abandoned
reservations remain counted; reuse the original key and chunks after interruption.
Active Run capabilities are rejected from transferred bytes, including across chunk
boundaries. Never send credentials or private context in creative/diagnostic payloads.

Creative writes supply stable mutation keys, expected production versions and lease
fences. Identical retries return the saved effect; changed payloads conflict. A
successful generation authorization is not permission to replay a provider request:
inspect its operation after uncertain outcomes. Diagnostic evidence is not a trusted
measurement and cannot approve a book or establish costs. Trusted adapters must
record per-call measurements and reviewer input/output evidence using the existing
execution service; the tools cannot create adapter/provider authority.

T19/T20 must provision a verified `bookletWorkflowPolicies` binding for the frozen
execution profile/revision and accepted orchestrator/configuration revision. Its
`reviewer {id, revision, publicationId}` is immutable operational configuration;
there is no MCP write tool or seeded default. Missing bindings fail closed. Only the
parent orchestrator receives the catalog/context; specialist and reviewer workflow
composition remains T18–T20. Existing private Start-input registration rules apply.

Migration `booklets:0003-mcp` adds indexes without changing existing records. The
[model guide](features/booklet-generation/model.md#t17-mcp-storage) describes private
staging and receipts. `npm run test:booklet-mcp` uses the real handler, fake identity
provider and disposable MongoDB replica set (cached test binary required), with no
secrets or paid calls. Live Dify acceptance remains T28.
