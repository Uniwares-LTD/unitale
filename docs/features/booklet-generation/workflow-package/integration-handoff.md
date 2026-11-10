# Candidate application integration handoff

## Outcome and scope

Integrate the seven native workflow candidates with Unitale's existing Run and booklet
services only after separate checkpoint 07 authorization. The user explicitly stopped
at the validated Dify/provider handoff. This document is a package-local
interface proposal. It does not register tools or change application code. The
[specification](../workflow-package-spec.md) owns behavior; the [candidate](README.md)
owns current local evidence. Preserve v1 schemas, records, registrations and in-flight
publications. New incompatible semantics use v2 bindings.

## Naming and tagging conventions

Display names use `Unitale: <Readable Role>` in title case. Include the feature when
needed for clarity, as in **Unitale: Booklet Manager**. The [package reference table](README.md)
lists the seven exact display names. Keep versions, environments, dates and deployment
status out of display names. Preserve existing directory slugs, service IDs and
workflow-tool identifiers; a display-name change must not rename machine references.

Apply exactly these four package tags to each workflow:

- `app:unitale`
- `feature:booklet`
- `contract:v2`
- `role:<existing-service-slug>`

Use the existing service slug for the role value: `manager`, `story-planner`,
`manuscript`, `art-director`, `page-composer`, `image-executor` or `quality-reviewer`.
For example, Story Planner receives `role:story-planner`. Tag prefixes and values
are lowercase; multiword values use kebab-case. `contract:v2` denotes the interface
contract, not package version `0.2.0`.

Dify tags are workspace metadata, separate from the exported workflow YAML. During
a future authorized import, reuse exact-name tags, create missing tags, bind all
four package tags to each workflow and verify readback. Preserve unrelated tags.
These conventions govern this workflow package only; do not rename or retag
existing unrelated apps. This repository update does not apply live names or tags.

## Workflow boundary

Manager Start inputs: public `request` JSON (create/continue/revise/recover intent and
owned production/user scope) and private `runContext`. Bind the capability directly
from Start to every managed MCP node. Never pass it through Code, model prompts,
children, output JSON, logs or durable checkpoints. Unitale invokes only Manager.
Children have no app provider, private context, peer dispatch or callback.

Children Start inputs: `request` JSON and ordered native image `references`; End returns
`result` JSON and native `files` for image execution. Each child request has:

- `contractVersion:2`, stable `invocationId`, `callId`, `service`, `operation`, `intent`.
- `items:[{itemId,input,targetId?,targetIds?,baseline?,feedback?}]`, with explicit scope.
- `sources:[{artifactId,revisionId,contentHash,content}]`; content includes artifact kind.
- `references:[{assetId,sha256,bytes,nativeFileId,...immutable source identity}]`.
- `constraints`, including product counts, digital canvas and reading direction as needed.

Results echo identity, report every requested item and distinguish succeeded, partial,
needs_input, invalid_input, failed and unknown. Creative proposals have `kind`,
`subjectId`, typed `content` and exact source tuples. Cast/locations produce individual
descriptions and a roster, never a new aggregate persistence type. Manager registers
local subject keys before saving or downstream dispatch. Do not treat echoed/model
identity as observed publication or provider evidence.

Use recursive key-sorted JSON, preserved arrays and UTF-8 SHA-256 for meaningful
request/content identity. Object keys in these contracts are ASCII; exact user text
remains Unicode and unnormalized. Exclude native reference IDs/URLs from dispatch
hashing. Do not omit ordered original hashes or meaningful image settings.

### Content and image preparation

For character_spec/location_spec, item.input.descriptionRevisionId selects the immutable
subject description; every established fact/continuity statement is preserved verbatim.
Role operations and required meaningful content are in the specification and actual
YAML prompts/checks. For Page Composer supply one selected manuscript and, for compose,
one selected layout. Pagination routes code-point text spans exactly once, preserving
kind, speaker, whitespace and reading order. Requested pageIds constrain composition.

Prepare input contains exact selected source `specification` and `style` content,
`imageKind`, `settings:{mode,model,count,canvas:{width,height},quality,background,format}`
and exact layout lettering spans. Include selected book-layout for pages. Prepare
returns a deterministic prepared object/requestHash; Generate receives that unchanged
object under `input.prepared`, with the same planned generation callId. No hidden paid
preparation call. One provider call may yield several separately keyed originals.

Reviewer input includes `targetIds`, `targetHash`, `referencePositions` and required
continuityPairs. Whole-book adds pageIds; image_request adds prepared; correction
adds before, after, original findings and visual when applicable. Pass cannot omit
requested coverage. Output asset IDs are derived from attached reference positions.
Record actual inspected coverage and trusted execution identity independently.

## Minimum Manager/application interface

Current v1 MCP operations are in [MCP guidance](../../../mcp.md#unitale-booklet-catalog-t17).
They cannot satisfy the accepted changes unchanged: they retain human/quality gates,
image-only operations and insufficient checkpoint/recovery state. The native Manager
consumes the sixteen v2 capabilities below. Reuse their current services rather than
building a new gateway or scheduling layer. History, human responses and execution
observations share bounded read_document; no separate list/status/response tools.

Each v2 tool accepts private `runContext` directly plus a bounded JSON **string**
`request`. This carrier lets native tool branches bind validated action arguments
without executing networking in Code. Parse and validate operation-specific fields
server-side; do not expose a generic transaction/action executor. Return one explicit
JSON object in native tool `json`, with `result` containing the object/string when the
installed MCP wrapper requires it. Error/isError/ok:false cannot be a success. Prove
that exact wrapper before binding; unexpected wrappers fail closed.

V2 read_document returns decoded, typed JSON sections with completeness/cursor metadata.
Reuse existing bounded storage reads, but keep byte/base64 transport outside the model:
Manager must not reconstruct base64 chunks or invent content from an incomplete section.
The local `booklet_read_document_v2` now reads owned revision, work and assessment DTOs.
Small values return `type:value`, `value`, `complete:true`. Larger objects/arrays return
ordered `sections` with a key and either a complete value or a child cursor; a top-level
cursor continues that node's page. Large text returns decoded `text` with code-point
`offset`, `end`, `total` and a continuation cursor. Every response identifies its path
and document hash. `complete` means the response contains the whole selected path;
a final page/fragment alone does not imply the earlier pieces were read. Follow all
necessary cursors and retain exact text; do not interpret the opaque cursor. Cursors
bind owner/production/kind/id/document hash and reject a changed document. They grant
no access beyond the allowlisted DTO. History, human responses and execution reads
remain pending.

| Capability | Request arguments / result | Existing service to reuse or extend |
| --- | --- | --- |
| context | `{}` -> bounded facts below | existing context + owned production/read services |
| read_document | kind,id,cursor? -> immutable body or bounded history page | existing chunked reads; add human_response/work/assessment/execution kinds |
| lease | action,fence -> current Run-owned fence | existing acquire/renew/release |
| index | subjects,artifacts,fence -> stable ID map | existing embedded production index |
| begin_work | register: childRequest,requestHash,targets,retryOf?,correction?,fence; dispatch: callId,requestHash,fence -> callId,requestHash,status,fence | derive identity/category/sources from the complete validated child request; durable correction/usage checks |
| transfer | action,key and bounded parts -> verified transfer receipt | existing transfer storage/integrity/capacity |
| retain_original | callId,outputKey,nativeFile,fence -> verified asset receipt | existing restricted Dify downloader and original-media service; per-output identity |
| save_revision | artifactId,content,sources,assets,evidence,mutationKey,fence,revalidatedFrom? -> immutable revision | existing revision writer; complete metadata transfer and new content kinds |
| request_human | question,targets,responseContract,presentation,fence -> requestId,presentationHash,formContent | existing review forms/Run cards; optional Manager policy |
| record_evidence | key,content -> diagnostic evidence reference | existing redacted evidence; no measurement authority |
| record_assessment | assessment,executionLocator,fence -> immutable assessment | existing trusted reviewer binding; all six modes and repeatable assessments |
| sources | sources,references -> ordered immutable reference manifest plus native files | existing source authorization + native image bridge |
| reconcile_work | callId,executionLocator? -> trusted per-item state/effective usage | existing terminal recovery and measurements; never paid replay |
| record_acceptance | revisionId,contentHash,targetIds,assetIds,sources,evidence,fence -> Manager selection | separate Manager selection from authenticated human apply_decision |
| checkpoint | expectedVersion,fence,state -> checkpointVersion,fence | small opaque CAS record on owned production; return authoritative post-write fence; no scheduling |
| complete | manifest,fence -> status complete only after structural/product checks | existing completion, removing app quality/human-policy gates for v2 |

This is a versioned boundary proposal, not a demand to replace all v1 handlers. Keep
v1 tools on old bindings; register only v2 on this Manager. Preserve catalog bounds,
service credential permissions and per-request owned Run checks. Bind deployment
identity from server context, never from model claims.

### Checkpoint 07 storage boundary

V2 storage now exists in the project repository; MCP/observer/lifecycle wiring
remains 09 work. Generic 08 seams are imported; v2 prepaid Run binding passes local
ownership, race and one-charge continuation checks. Work records use distinct call IDs, a server action identity,
request hash and retry ordinal. Automatic retries require the latest confirmed
retryable failure of that same action; unknown or terminal success cannot be replayed.
Correction roots bind production/task/targets/funding, with distinct corrective
actions counted once even when technically retried. Assessments and Manager selections
have separate immutable records; human responses remain in existing Run decision storage.

The 09 gateway must construct actionKey and category from the selected service and
trusted task/target/funding context; never accept a model-supplied action key, retry
category, usage, completeness or provider outcome as authority. Normalize retry
identity by removing only invocation/call/item carrier IDs and transient native handles
from the validated child request, preserving ordered inputs, source/asset identities,
meaningful settings, feedback and constraints. Changed meaningful payload starts a
new creative/corrective action only under its existing funding/correction authorization;
it cannot masquerade as another technical attempt. requestHash still binds the exact
per-attempt envelope as the native graph expects. Manual retry authorization, runtime
observation, restricted reconciliation and financial checks remain 09 obligations.

The local `registerBookletCreativeWorkV2` service now validates the actual creative-text
child envelope for Planner, Manuscript, Art Director and Page Composer, checks exact
source content and the declared hash, and derives normalized retry identity/category.
Active registration rechecks the owned native Manager Run and its actual consumption
workflow/job binding in the mutation transaction. Registration records intent only.
Dispatch now rechecks that active binding, cancellation and native execution status;
registered unsubmitted work binds to its actual dispatching parent on continuation.
The local project registry now exposes `booklet_checkpoint_v2` and creative-text
registration through `booklet_begin_work_v2`, using the candidate's JSON-string
request carrier and explicit `result` wrapper. Both require a current private native
Manager capability and owned prepaid workflow/job binding. Checkpoints accept the
initial fence zero; subsequent atomic writes return the advanced fence. Exact retries
reuse existing receipts, including after later mutations. Other MCP capabilities,
paid dispatch, image/review registration, trusted outcomes and runtime recovery remain
pending; no workflow is activated by these handlers.

This storage slice is not proof of real provider execution, effective retries or
application-connected recovery. The existing candidate still has retries/activation
disabled and remains unchanged until the separately checked 09 integration slice.

### Context and transition facts

Context supplies `checkpointVersion`, `checkpoint` (opaque saved intent/result), current
`fence`, `sources` (available immutable artifactId/revisionId/contentHash identities),
`work`, `assessments`, `corrections`, `usage:{canDispatch,...}`, `policyBinding`,
`reviewerBinding`, cancellation and product/lock/allowance facts. Supply bounded summaries
and cursors rather than complete history. Model/transport capacity is distinct from
product capacity; use bounded reads, never truncation or invented success.

Work entries bind callId/requestHash/status and any correction root/family/findingIds.
Dispatch is a compare-and-set from registered to dispatching after current ownership,
locks, allowance, counters and usage checks. Return explicit matching identity/status
before the child node can execute. Repeated dispatch after uncertainty never replays.

Assessment summaries contain mode,targetHash,disposition,complete,policyBinding,
reviewerBinding,coverage and findings. The observer validates their origin and exact
inputs. Record native Manager reasoning and all specialist/Reviewer provider steps by
observed run/node/iteration identity; do not double-count parent summaries or assume
that only image calls cost money. Preserve complete successful/partial child outputs
in existing bounded evidence storage so later retention does not depend on the most
recent checkpoint result alone. For image_request targetHash is the prepared hash; other modes bind exact
content/window/manifest identities. Whole-book windows share the selected manifest hash
and expose actual page/asset/continuity coverage. Do not let an LLM assert trusted cost,
provider success or a publication identity through this tool.

Correction summaries contain rootId,family,used,limit,targetIds. App keys durable chains
by actual task/target/funding, preventing new invocation/candidate/root IDs from resetting
allowances. Manager chooses confirmed scoped repairs; app enforces stored limits.
Reviews consume no correction. Customer revision allocations remain separate.

### Checkpoints, leases and recovery

The [accepted action retry/reconciliation policy](../implementation-plan.md#action-retries-and-automatic-reconciliation)
is the canonical 07-11 target: paid LLM retries 2, paid image retries 0, retriable
non-paid retries 3; non-retriable errors stop. App reconciliation automatically checks
trusted Dify evidence using existing worker scheduling. Unknown outcomes never permit
blind redispatch. Explicit Retry failed step grants one attempt without resetting
counters; Continue booklet requires verified termination and reuses saved work.
Current candidate retries remain disabled; implementation and fresh proof are pending.


Checkpoint writes atomically compare version/fence and persist opaque bounded state.
Before an action it contains pending action/call/item/source identities and request hash/reason;
large request bodies stay outside the checkpoint. Preserve the prior opaque state while
recording pending intent. Afterward it preserves that state and updates lastAction,
lastResult and pending:null. The checkpoint fence always comes from the fresh
authoritative context, never a child/document result field.
Do not replace authoritative work facts with intent.
Durably save partial outputs and original receipts before selecting a manifest.

Keep leases short. Gateway-local mutations check the expected production version and
existing fence, advance the fence and leave no lease in the same database transaction.
The creative-text registration service now uses this atomic repository mode; other
facades remain pending. No transaction or lease spans model/tool/Human Input waits.
Re-read current context for a valid mutation fence after external waits. On a version
race stop and recover from authoritative facts.
The pre-action checkpoint receipt must return its authoritative `fence` alongside
`checkpointVersion`. Manager's existing `saved` node validates both, then binds that
fence into the selected action and paid-dispatch arguments; action branches use these
confirmed arguments. Read-only payloads remain unchanged. The root MCP `fence` is a
concurrency token, excluded from the opaque pending action's meaningful hash. Child
request/content identities remain unchanged by this token refresh.

Same-run Human Input resumes the same Dify execution. Run UI authenticates and stores
request/attempt/presentation/target correlation independently of native form text;
read_document human_response returns pending/submitted/stale/closed/reconciling.
First valid submission wins. Never use the model to fabricate a response or skip
financial consent. After a timeout/cancel/expired capability, restricted observer
recovery retains already-paid evidence without authorizing new dispatch.

A successor Run requires verified termination, original production/accounting scope,
prepaid booklet admission and the saved checkpoint. Reuse known results; reconcile
unknown calls; independent work may continue below applicable safeguards. Storage
retry reuses retained bytes. Preserve oversized results in existing bounded evidence
storage through trusted observation/transfer; a 64 KiB checkpoint is not an artifact
store. If that observer path is unavailable, stop before activating a capacity that
would lose results. Do not invent a Dify-local receipt/file store.

## Application changes after 06

Unitale owns booklet contracts/content, new acceptance/assessment/correction/checkpoint
semantics, product registration/admission, media per-output/per-kind canvas validation,
MCP handlers and existing Run integration. Keep the single application dispatcher;
no app-owned creative eligible routes. Preserve upfront consumption/idempotency, locks,
immutable history and original bytes. Changes to runtime schema/persistence at 07 must
update the model guide, JSON example and both Mermaid versions together.

Unibase changes originate in Unibase and enter Unitale through reviewed template
integration. Extend generic MCP native-file, observed child execution or Run card/Human
Input seams only where the current implementation demonstrably lacks them. Do not
implement the old preselected upstream feature list. Existing exact-publication import
journals, environment-owned MCP provider and restricted downloads are reuse candidates,
not evidence of deployed capability. The candidate Manager finish node preserves its
domain envelope under `booklet_result` and supplies the existing Run `result` view:
confirmed `complete` maps to success, `failed`/`invalid_input` to failure and all other
states to partial. The public view uses fixed summaries and sanitized failure codes,
empty cards/images and no checkpoint; domain evidence stays outside it. The existing
worker additionally requires native execution success. Booklet state/assets remain
authoritative; terminating a workflow does not itself complete a book. Application
registration and v2 domain wiring remain checkpoint 09 work.

## Provider and deployment handoff

Inspected official sources: [OpenAI plugin](https://github.com/langgenius/dify-official-plugins/tree/18663b9e723c345fed4c7450a3f925c583fa7064/models/openai),
[image tools](https://github.com/langgenius/dify-official-plugins/tree/18663b9e723c345fed4c7450a3f925c583fa7064/tools/openai).
Manifests report `langgenius/openai` 1.1.0 and `langgenius/openai_tool` 0.2.2.
Text/vision/native structured output and GPT Image 2/2.5 generation/edit are advertised.
Source metadata is not installed/runtime evidence. Image generation/edit yields native
files and usage JSON when available; the call total is not charged once per image.

The installed providers' SDK retries, default network timeout and undated Sunburst
alias are now explicitly accepted tradeoffs. They no longer block delivery or require
provider code changes. Keep Dify node retries and Manager redispatch disabled in the current 01-06 candidate;
the planned bounded action retry policy above requires separate implementation.
Retain unknown outcomes for reconciliation. The
[accepted tradeoffs](#accepted-provider-tradeoffs) define the limits of admin evidence.
Activation still requires application integration and separate approval.

Follow the [compatibility procedure](#difyprovider-compatibility-procedure) below.
Disposable platform probes do not establish Unitale ownership or application integration.

### Official provider release gate

**Withdrawn as a delivery dependency.** At the user's request on 2026-11-09,
[PR #4238](https://github.com/langgenius/dify-official-plugins/pull/4238) was closed;
readback confirms `closed` and `merged:false`. No upstream branch was deleted or
merged. The patch, source commit and review remain provenance, not an official release.
Stop waiting for upstream approval and do not reopen or pursue publication implicitly.

The [author-account review](https://github.com/langgenius/dify-official-plugins/pull/4238#pullrequestreview-5825532091)
found no blocking issue at `3326464451bbbb6d2060ef6645d826b6f82aa15b` against base
`18663b9e723c345fed4c7450a3f925c583fa7064`. Fresh frozen-lock runs passed 94 image
and 407 non-live model tests, with existing model warnings. Both packages built;
archive audits verified source identity and excluded environment files/caches.
This remains candidate evidence. The account has no upstream merge permission, and
the closed PR is not independent approval, a merge or Marketplace publication.

### Installed-provider no-money audit

Read-only inventory on 2026-11-09 confirms the shared text `1.0.7-dev7` and image
`0.2.2-dev3` installations. Original local archives were located in the reference
experiment's `output/m5-diagnostics-provider-candidates/`. Recomputing Dify's sorted
entry-name/content hash matched the complete installed identifiers exactly:

| Package | Installed content hash | Archive SHA-256 |
| --- | --- | --- |
| Text dev7 | `aa245c63d95bee61fbd250e86b5ab7da4accec08144e075e4a4d8dd94bf5eba2` | `a4eb441d0ac3ca84ccbe18b0f0be93b20c088ed6740a486dc490e66f14d24d53` |
| Image dev3 | `8a7f865a47ce9e25260bd7d7cade70d4712506d945a7a2a66607f9f324160f05` | `5f34caaee4b58e672eb3117ad0eb39fb4905049487844609c0b60d681a3a68ef` |

The extracted source was executed with dummy credentials, socket connections denied
and SDK HTTP requests handled entirely by in-memory transports. Five text tests and
four image tests pass; their retry checks cover twelve model/operation/failure
combinations. Audit code and extracted packages remain ignored under
`output/tooling/installed-provider-audit/`; no production framework/test suite was added.

The following table records the former strict requirements and optional remedies;
the accepted amendment below replaces their blocking status.

| Former requirement | Verified installed behavior | Optional remedy |
| --- | --- | --- |
| No hidden SDK retries | Ordinary Luna/Sol Responses and standard image Generate/Edit each make three attempts on HTTP 429, HTTP 500 and read timeout. Supplying `max_retries=0` is ignored by existing credential/tool construction | Forward optional retry controls through existing native client paths |
| Finite selected network timeout | The same calls ignore `request_timeout=12.5` and retain the SDK's 600-second read timeout | Forward optional timeout through those client paths; keep Manager's separate operation deadline |
| Exact dated Sunburst model | Installed `_image_utils.build_image_args` rejects `gpt-image-2.5-sunburst-2026-09-08`; the alias passes | Extend the existing Generate/Edit selectors and validator |
| Native text/vision prompts | The bounded text branch rejects native image message parts before client construction and requires the digest of its exact provider payload. The separate Real-report branch requires an experiment carrier | Preserve these legacy branches; add controls to the ordinary native text/vision path rather than reconstructing carriers in workflows |
| Manager-only application communication | Installed `booklet_real_image.deliver` requires a direct evidence callback to the old experiment; its success path also uploads originals there | Use the standard image tools with the small controls/model patch; leave the experiment tool unchanged |

Text checks pass with both OpenAI SDK 3.26.0 (the text package's requirements pin)
and 3.37.0; image checks pass with its pinned 3.37.0. Dify SDK is 0.10.2. These are
local SDK/source checks, not an inspection of the daemon's resolved environment or a
live workflow failure injection. Existing gevent import warnings remain advisory.
An initial audit fixture omitted the SDK-required image MIME type; it was corrected
before the complete passing run. No provider requests, credential changes, plugin
installations or application changes occurred.

The audit above tested the former strict requirements. Its findings remain valid,
but the user subsequently accepted these differences under the amendment below.

### Accepted provider tradeoffs

The user accepts the installed shared providers unchanged. No provider patch, new
plugin installation, upstream release or local-build adoption is required to continue.
This changes provider requirements only; checkpoint 07 implementation remains gated.

| Tradeoff | Accepted behavior and minimum integration handoff |
| --- | --- |
| Automatic SDK retries | Accept the installed SDK defaults (two retries, up to three attempts in the mocked failure cases). Keep Dify node and Manager retries off in the current candidate; the 07-11 action-retry amendment above governs future implementation. Admin evidence must distinguish workflow dispatch count from SDK attempt count; record actual retries only when independently evidenced, otherwise explicitly unknown. Preserve available workflow/node IDs, timestamps, errors, plugin identity and provider request/response IDs. Final returned usage may omit costs from preceding uncertain attempts; report it as incomplete and reconcile with provider billing. A per-dispatch estimate is not a hard total spend guarantee. No new retry telemetry is implemented in 01-06. |
| Default network timeout | Temporarily accept the observed 600-second SDK read timeout; it is neither a total workflow deadline nor proof the provider stopped. Manager/application timeout leaves the call unknown, with unresolved liability and no automatic redispatch. Inspect the existing Dify run/node result and retain any late outcome before reconciliation; absence of a result is not proof of no execution. |
| Sunburst alias | Use `gpt-image-2.5-sunburst`. The dated snapshot is no longer mandatory. Record the requested alias, exact plugin package and returned model identity when available; never invent a resolved snapshot or promise reproducibility across alias updates. Keep quality, canvas, count, background, original bytes and output format unchanged. |

**Future improvement, not a current gate:** investigate status reconciliation using
existing Dify execution retrieval first. For provider lookup,
[OpenAI background Responses](https://developers.openai.com/api/docs/guides/background)
support polling when the caller retains the response ID, through
[response retrieval](https://developers.openai.com/api/reference/resources/responses/methods/retrieve).
The current native provider does not establish durable early-ID capture/background
execution. A timeout before receiving an ID cannot be repaired merely by querying
with a workflow or request ID. The installed image tools use synchronous
[image Generate](https://developers.openai.com/api/reference/resources/images/methods/generate)
and Edit; no image-job retrieval path was established for these calls. Any future
background mode, retention, polling or webhook change needs capability verification
and a bounded plan amendment; implement none in this package.

The nine no-money installed-source audit tests establish these accepted differences.
Earlier paid success evidence belongs to the removed isolated patched providers,
not to a newly executed shared-provider suite. Current-provider no-money configuration/import/export
readback passes as recorded below; actual revised-binding execution and integrated
acceptance remain pending. The acceptance amendment itself made no paid calls or
live mutations; subsequent disposable imports are recorded below. Application model/schema/example/diagrams are
unaffected because no application persistence or runtime interface was implemented.

### Shared-provider import/readback evidence

On 2026-11-09, all seven exact repository YAML files imported into disposable disabled
apps against the existing shared dev7/dev3 providers. Every draft and secret-free
export preserved all graph nodes/edges exactly. All activation variables remained
`false`; all LLM/tool node retries remained disabled. Six native LLM nodes retained
the shared provider identity and enabled structured output. Luna and Sol model
inventory status is `active`, with load balancing disabled. Standard Generate/Edit
declarations include `gpt-image-2.5-sunburst`; the image nodes retain their variable
model selector and omit unsupported SDK retry/timeout fields. No credential values
were inspected or changed; no provider credential validation request was made.

| Role | Disposable app ID (deleted) | Nodes |
| --- | --- | --- |
| manager | `5fb0bdf9-3f1d-4418-98f4-baf72fcd4a37` | 53 |
| story-planner | `d64a45a6-e8b3-4467-83ff-9244147c05aa` | 7 |
| manuscript | `0e9a6b6b-7e16-4c49-a7b0-cac956a44543` | 7 |
| art-director | `c0cd6954-3a47-48e8-8042-08c7b055f38b` | 7 |
| page-composer | `5bcdd8cd-d6ac-47e4-9cc4-02439ff0ba34` | 7 |
| image-executor | `a8cb792d-ffc2-4870-bde9-ee1e05eec23f` | 16 |
| quality-reviewer | `9b59c9ee-0988-459d-9192-79c8afdeb7f2` | 7 |

All seven apps were deleted and absence verified. Before/after inventory matches the
original 32 app IDs, names and update timestamps and both plugin installation IDs and
package hashes. Two earlier diagnostic Manager copies were also deleted: the probe's
YAML serializer unquoted `yes`, causing Dify YAML 1.1 coercion to booleans. Importing
the exact repository text, which already quotes those scalars, resolves the mismatch;
no candidate change was needed. Future imports must preserve that quoting.

The ignored journal is `output/tooling/dify-shared-provider-readback-v3.json`, with
separate failed-attempt journals retained. These checks prove import/configuration
persistence and export fidelity only. No workflow was executed or published; Manager
application/child binding placeholders remain intentionally unresolved. Shared-provider
paid execution, model-account access, production credentials and application integration
are not proved by import. No paid calls, application changes or checkpoint 07 work
occurred. The next application step remains separate checkpoint 07 authorization.

### Proposed local provider solution

**Superseded optional remediation.** The previous proposal used isolated locally
owned builds of the existing plugins plus the [prepared patch](#prepared-upstream-patch).
The accepted SDK retry/default-timeout/alias tradeoffs remove its necessity. Do not
build, install or upgrade providers as a delivery prerequisite. Retain the patch and
prior probe identities as historical provenance only. Revisit controls only for a
concrete operational need and explicit scope approval, preserving shared consumers.

### Supported provider path assessment

Historical assessment against the former strict requirements; the accepted
tradeoffs above supersede its delivery decisions. Read-only investigation on
2026-11-09 rechecked official plugin HEAD at
`18663b9e723c345fed4c7450a3f925c583fa7064`, unchanged from the earlier inspection.
No compliant drop-in was established among the paths below. This is a bounded source
assessment, not a claim that every Marketplace plugin has been audited.

| Path inspected | Finding | Decision |
| --- | --- | --- |
| Official OpenAI image tools | The [argument helper](https://github.com/langgenius/dify-official-plugins/blob/18663b9e723c345fed4c7450a3f925c583fa7064/tools/openai/tools/_image_utils.py) allows three undated models; generate/edit construct the SDK without a retry override. The credential schema exposes key/base URL/organization only | Existing configuration cannot satisfy exact snapshot plus no SDK retries |
| Official OpenAI text provider | The [credential builder](https://github.com/langgenius/dify-official-plugins/blob/18663b9e723c345fed4c7450a3f925c583fa7064/models/openai/models/common_openai.py) passes key/base URL/organization; the LLM constructs its SDK client from those fields. No retry/timeout override is threaded through | Retry gap applies to text/Reviewer/Manager calls too, not only images |
| Official OpenAI-compatible text provider | Its [LLM client factory](https://github.com/langgenius/dify-official-plugins/blob/18663b9e723c345fed4c7450a3f925c583fa7064/models/openai_api_compatible/models/llm/llm.py) also creates the SDK without a retry override | Switching text providers alone does not resolve the safeguard |
| Existing abesticode image plugin, `35e32c9f44235d9fc2602bf0a02951f21565b228` | [Source](https://github.com/abesticode/dify-plugin-openai-api-compatible-image/blob/35e32c9f44235d9fc2602bf0a02951f21565b228/tools/image_generate.py) accepts a free model string and uses direct requests, but routes image inputs through generations/chat rather than OpenAI multipart edits; lacks required count/background/output-format forwarding and usage output; quality selector is standard/HD | Does not preserve the accepted Generate/Edit request contract |
| Existing StormXX image plugin, `d90f46abcd57ae0c18078760c9cae604846ca10f` | [Source](https://github.com/StormXX/dify-gpt-image-generator/blob/d90f46abcd57ae0c18078760c9cae604846ca10f/tools/gpt_image_2_edit_args.py) fixes the model to gpt-image-2; only an edit tool is supplied and its SDK client has no retry override | Does not supply the required model, operations or retry behavior |

[OpenAI's model documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
explicitly permits the dated Sunburst snapshot. The dated-model failure is the plugin
whitelist, not evidence that the API rejects the accepted model. Documentation does
not prove this account's access. Using the alias would still amend the accepted binding.

Offline execution of the pinned official image argument helper confirmed snapshot
rejection and alias acceptance while preserving the prompt. An isolated execution of
the official text credential builder confirmed that supplied max_retries/timeout
fields are ignored. These tests made no HTTP or paid calls. SDK source inspection
confirms that omitting the retry override retains SDK defaults; disabling Dify node
retries cannot change those client settings.

The user authorized bounded upstream fix preparation on 2026-11-09. The resulting
[upstream patch](../dify-provider-upstream.patch) modifies the existing official plugins;
it adds no Unitale production plugin, gateway, workflow framework or application code.
The fixes were submitted as [upstream PR #4238](https://github.com/langgenius/dify-official-plugins/pull/4238),
head `3326464451bbbb6d2060ef6645d826b6f82aa15b`. The PR is now closed at the user's
request; no upstream merge/release is claimed. The table above
describes unmodified upstream source, not the experiment-specific installed code.

#### Prepared upstream patch

Apply against official repository base `18663b9e723c345fed4c7450a3f925c583fa7064`.
Patch SHA-256: `216f9ff782ae9f9209abae6807d46e50db5efb8f603a8bccb4c563ae95ebcec4`.
The submitted patch passes `git apply --cached --check` against a separate index of
that exact base. It includes required release metadata and packaging exclusions, for
nineteen paths.
Versions are 1.1.1/0.2.3; `uv lock` changes only the root project version in each lock.
Dependency versions and application/workflow contracts are unchanged. The image plugin
now excludes local bytecode caches, matching the existing model plugin exclusions.

| Accepted need | Smallest change | Offline evidence |
| --- | --- | --- |
| Exact dated Sunburst binding | Add `gpt-image-2.5-sunburst-2026-09-08` to the two selectors and existing validator | Actual SDK requests preserve the selected ID, Unicode prompt, canvas/count/quality/background/format |
| No hidden SDK retries | Optional `max_retries` in both text credential forms and both GPT Image 2/2.5 tool forms; forward explicit zero | Fake HTTP 429/500/read-timeout failures make one attempt for Responses, Chat Completions, generation and edit |
| Configurable finite network timeout | Optional positive finite `request_timeout`, forwarded as SDK `timeout` | Actual SDK requests carry the configured timeout; invalid/bool/non-finite values fail locally |
| Preserve existing users and image transport | Omit unset options; reuse existing image API requests and output handling | Text default/one-retry cases retain three/two attempts; image unset controls omit overrides; edit keeps original byte order and outputs/usage |

Fresh isolated environments from each unchanged dependency lock validate Python
3.12.10, `openai` 3.37.0, `dify_plugin` 0.10.2, `httpx` 0.28.1, pytest 9.1.1 and
pytest-mock 3.17.0. Earlier tests also pass with OpenAI 3.46.0/pytest 9.2.0.
From the upstream root, using the respective environment:

```powershell
python -m pytest -q tests/tools/openai/test_openai_tool.py
cd models/openai
python -m pytest -q tests --ignore=tests/live -m "not live"
```

Results: **94 image tests and 407 non-live model tests pass**. Run the suites in
separate processes because the existing image harness stubs Dify modules. The model
suite reports existing gevent SSL/Pydantic warnings. Sandbox temp/cache permissions
caused an intermediate run to fail; the complete outside-sandbox rerun passes.
The provider and both tool declarations also validate with the real Dify SDK schema.
Tests use dummy credentials and local fake HTTP transports; they make no paid calls.
Two separate same-agent read-only passes (cold-review fallback, not independent-agent
review) cover defaults, validation, SDK forwarding, original bytes, scope and handoff.
No blocking finding remains in the prepared patch's offline scope.

To inspect/apply in a clean checkout of the official repository:

```powershell
git switch -c fix/booklet-provider-controls 18663b9e723c345fed4c7450a3f925c583fa7064
$patchPath = "C:/path/to/dify-provider-upstream.patch"
git apply --check $patchPath
git apply $patchPath
```

Both official-identity candidates package with the prepared Dify CLI v0.6.15, and the
Community server accepts their upload/decode. They are unsigned candidates, not signed
Marketplace releases, and were not installed over the shared experiment plugins.

#### Isolated target compatibility progress

The user authorized continued full compatibility with a **US$1 total probe cap** on
2026-11-09 and proposed isolation from the shared plugins. Necessity: the installed
text dev7 build exposes Booklet-specific bounded/report/request-digest controls used
by existing consumers, absent from the upstream candidate. A wholesale upgrade is
not established safe. The workspace has 32 existing apps and no second accessible
Community workspace. Do not remove those capabilities as part of this task.

The bounded plan amendment is two **temporary test-only namespaced builds** of the
submitted code, rather than a permanent Unitale provider fork. Only author/display
metadata in `manifest.yaml` and `provider/openai.yaml` differs per package. Of 134
packaged files, 130 are byte-identical, including all 41 Python files.
No new runtime code, dependency, generator or application contract is introduced.
Production YAML keeps official bindings; test copies alone use `unitalecompat`.

Historical installation task `01a1bfad-5035-7e34-88e0-22d3eb9c72cf` succeeded for both
test builds; both installations are now removed:

| Temporary package | Installed identifier |
| --- | --- |
| Text, installation `01a1bfad-69dc-7dda-97a2-1c7925e1218c` | `unitalecompat/openai:1.1.1@398e48b59a3920b57627d0f13aa831303ce612c9f820db205380e1847fc86bff` |
| Images, installation `01a1bfad-6842-7e31-bd3d-f4610e6af114` | `unitalecompat/openai_tool:0.2.3@ddce7c0bd034f79461b9f22e6e9f3155b5d244af13910a814d99beff68f7d353` |

Target readback proves dated Sunburst and both transport controls in the tool forms,
and both controls in provider/custom-model credential forms. Disabled disposable
Image Executor (`8c4409be-6b8e-4363-9857-64f875d8dd37`) and Story Planner
(`ab313c30-e948-4988-a709-f78fbd2abf5d`) imports/readbacks/secret-free exports pass.
Explicit numeric zero retries and 120-second image network timeouts survive readback.
This proves configuration persistence, not provider execution or a suitable final deadline.
The original 32 app IDs/names/update times and shared dev7/dev3 plugin identities are
unchanged. No host signature policy, original credentials or application code changed.

The user privately configured both test credentials. Allowlisted readback confirms
Responses API, `max_retries=0`, `request_timeout=120`, metadata disabled and no custom
base URL for text; image credential metadata is present. The probes logged, stored
and changed no key values.
Text credential validation sends a `ping` capped at 20 output tokens; its invoice
amount is unavailable, so US$0.01 remains reserved. Image validation lists models.

#### Paid provider feasibility results

Six distinct provider attempts were made under the US$1 total authorization; no
uncertain call was replayed. The original failed attempts remain evidence.

| Probe / run | Verified outcome | Declared or token-based USD estimate |
| --- | --- | --- |
| Planner `9d5724b1-e06d-42f2-b195-e7dbffff671a` | Luna returned text, but pack failed because native structured output was absent | 0.0002172 |
| Structured Planner `bd0f1c89-9985-4a32-92dc-7510ebee7a30` | Provider rejected the open-object schema with HTTP 400; workflow returned unknown through its failure branch | No usage reported; retain US$0.02 hold |
| Corrected Planner `20270f1a-6e19-4fa2-a8df-e1d359c4c557` | Actual creative workflow succeeds; exact Arabic/combining-character/emoji/whitespace/newline title preserved | 0.0001506 |
| Reviewer `be87aa56-a5fb-4e14-9248-f48fcaca4130` | Actual Sol vision workflow succeeds on both ordered original PNGs, with exact target/reference coverage | 0.01089 |
| Generate `10970f43-e110-4d41-9a8a-76bc71491e6c` | Native Prepare then one dated Sunburst call; one original high/opaque/PNG, 1024×1536 | 0.04179 |
| Edit `18684311-dacc-4805-b6eb-ef1a018f1f04` | Native Prepare then one edit call using the two existing originals in order; one original at the same exact settings | 0.067071 |

Live findings corrected in the actual DSLs:

- The target DTO requires `structured_output_enabled`; `structured_output_switch_on`
  alone imports but silently leaves structured output disabled. Six LLM nodes now
  carry both supported names. The [Graphon v0.7 DTO](https://github.com/langgenius/graphon/blob/v0.7.0/src/graphon/nodes/llm/entities.py)
  declares the former as the wire alias; newer DTOs migrate it. Node outputs now
  contain actual structured data rather than an unconstrained text fallback.
- OpenAI strict output rejects `content.additionalProperties=true`. Five specialist
  model schemas use a JSON string for internal proposal content; two inline lines
  decode it before existing operation/scope checks. External workflow results retain
  content objects. This avoids generated per-operation schema inventories or a new
  application contract. Manager already uses a closed `request_json` string carrier.
  Model guide/example/Mermaid persistence schemas are unaffected: this changes only
  the internal model-response carrier; decoded workflow/application objects are unchanged.
- Both image tool nodes explicitly configure zero SDK retries and 120-second network
  timeouts. The deterministic validator now permits the accepted dated snapshot when
  the separate execution gate is enabled; all repository execution gates remain false.
- LLM nodes explicitly select Standard (`service_tier=default`), matching the measured
  probes and pricing basis rather than relying on an account-level automatic tier.

Completed calls report US$0.0112578 of text estimates and US$0.108861 of image
token-based estimates: **US$0.1201188 combined, not invoice-verified spending**.
The [current pricing](https://developers.openai.com/api/docs/pricing) and
[model-specific image calculator](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)
were checked before calls. The current calculator explicitly supports GPT Image 2.5;
its high/1024×1536 estimate is 1,372 output tokens (US$0.04116), matching both actual
responses. Generate used 126 text input tokens; edit used 267 text and 3,072 image
input tokens. This is the 2.5 formula, not the older GPT Image 2 estimate. The API
does not expose a per-request dollar cap. Conservative reservations total US$0.67
(including validation/rejected-request holds), leaving US$0.33 unallocated. No more
paid calls are necessary for this feasibility slice.

Downloaded originals are valid 1024×1536 PNGs: generation 734,307 bytes,
SHA-256 `d3ea1b93bfda7de15aa39cd6acccb862611300eff73bd1840516d1e723f441cc`;
edit 1,094,445 bytes, SHA-256
`766a513590aa7b593a790fc3280011369d8c845376f90db430d62f4c92c132d5`.
Visual inspection confirms the requested orange triangle and peach-left/blue-right
edit. This is limited compatibility evidence, not complete booklet image-quality
acceptance. Original downloads and raw probe journals remain ignored under `output/tooling`.

All eight disposable apps (the two import-only copies and six paid-probe copies)
were deleted with absence verified. The original 32 app IDs/names/update timestamps
remain unchanged. After the user chose the provider-only handoff, both namespaced
test plugin installation IDs listed above were uninstalled and absence verified.
Only the original dev7/dev3 plugin identifiers and installation IDs remain; the original
text provider is still active. No shared credential, plugin or application was changed.
Two newly uploaded nonsensitive fixtures remain:
`55739584-ce38-4f8b-8a8b-311c81e2ae38` and
`2273d0da-d184-45e1-9443-74f3c72ad745`; Edit reused these uploads.
Generated tool-file IDs are `3c9bba46-cc7f-4848-8339-ed05e7052ad6` and
`6aaec7e0-c17a-4a52-83a8-81aad963162a`.
Uploaded package caches and stored files have no inspected deletion API; do not
claim physical cache/file cleanup. The earlier two fixture uploads remain historical
retention evidence in the README; no host/storage deletion was attempted.
Application-bound E1-E5 proof remains pending. Earlier zero-retry evidence applies
to the removed isolated candidates; the current shared-provider SDK defaults are
accepted under the amendment above. No live retryable-failure injection or invoice
reconciliation is claimed. Production execution stays disabled.

Future integration reuses the installed shared provider identities recorded by the
audit. Use ordinary text/vision and image tools, leaving legacy experiment paths and
shared credentials intact. Remove unsupported SDK-control fields from candidate image
nodes; keep Dify node/outer retries disabled. Re-export actual bindings and record
plugin hashes and effective settings. SDK retries and network timeouts remain as
installed. The completed probes do not authorize spending the remaining historical
allowance or implementing application integration automatically.

Reference slots: Manager/creative gpt-6-luna (4096/8192 output tokens), independent
review gpt-6-sol (8192), Sunburst alias (high, opaque PNG). Preserve exact image
canvas/count/settings in preflight. Record available usage and incomplete retry/billing
evidence for admin reconciliation; do not claim each dispatch is one provider attempt.

## Acceptance probes and stop conditions

E1: accepted model/settings, structured result, no blind or whole-flow replay; verify
planned bounded action retries when implemented. SDK retries,
default timeout and incomplete usage explicitly reported under the accepted tradeoffs.
E2: two distinct originals through Manager/MCP/child/retention with identical bytes,
hashes, MIME, dimensions/order and practical limits; repeat expiry and storage failure.
E3: actual serial Loop branches, child wrappers, partial/unknown outputs, authenticated
Human Input and durable resume; continuation keeps correction roots and call identities.
E4: owned Manager registration, least-permission managed MCP, suite/observer/reviewer binding.
E5: exact brief/languages/products/configuration and approved finite paid cap.

Pending target probes are not local failures or successes. Do not activate while they
are unresolved. Local evidence is in the candidate README; checkpoint 07 remains
gated on separate application authorization despite established provider feasibility.

## Dify/provider compatibility procedure

This stage has an early feasibility result and a later integrated result. Before 07,
prove platform/provider capabilities without claiming that proposed v2 application
handlers exist. E2-E4 cannot close in full until the necessary application integration
is implemented. Record partial evidence against each gate, not a single blanket pass.

1. **Agree the probe scope and target.** Obtain explicit authorization for read-only
   inventory and named disposable staging apps/imports/publications. Confirm the Dify
   endpoint, workspace and permitted disposable app names from the owner/current
   inventory. Issue #10's earlier host/app observations are historical, not ownership
   proof. Use existing secure credentials; never put keys in docs, DSL or issue comments.
   Application changes, shared-plugin changes and paid calls are separate scopes.
2. **Inspect installed capability without spending.** Record the Dify version, exact
   installed plugin identifiers/hashes, available model IDs, supported parameters and
   retry/timeout configuration. Check both official text and image paths. Resolve the
   accepted alias and SDK defaults separately from Dify node/outer retries. Source
   inspection must cover each retry layer; node flags alone are insufficient.
   Prefer an existing supported version/configuration. If no supported path exists,
   report the exact gap and seek a bounded plan amendment; do not patch shared plugins,
   invent model equivalence or build a custom replacement.
3. **Run disposable no-money Dify probes.** Import/read back the native node shapes;
   use isolated deterministic echo/Code fixtures for child request/result wrappers,
   nested Loop/Assigner branches, failure routing and Human Input resume. Pass the two
   distinct original PNG fixtures through native child inputs/outputs and compare
   original bytes/order/hashes. Prove child publication/Workflow Tool binding behavior.
   These fixtures are probes, not replacement workflows or an execution framework.
   Native Human Input alone does not prove authenticated Unitale response correlation.
4. **Run bounded provider probes only with paid approval.** Agree exact models/settings,
   prompts/languages, maximum calls, total money cap and stop conditions first (E5).
   Use disposable copies with only approved nodes enabled; keep the delivered seven
   candidates disabled. Exercise text/structured output, vision review, one generate
   and one edit scenario, adding multi-output coverage only within the approved cap.
   Verify effective settings, originals, execution IDs and available usage. Test uncertain
   outcomes/retry behavior with a no-charge controlled failure where supported; do not
   deliberately repeat billable calls. Stop on an unknown outcome and reconcile it.
5. **Complete application-dependent proof after authorized integration.** Import/publish
   the six specialists and synchronize/pin their Workflow Tools. Bind Manager's six
   child slots and managed MCP to verified IDs. Register Manager through Unitale's owned
   import journal; read back ownership, permissions and exact suite bindings. Exercise
   the actual Manager/MCP/child/retention byte round trip, authenticated Run UI resume,
   durable continuation/correction counters, unknown-call recovery and trusted usage
   observations. A mock application or echo tool cannot close these E2-E4 checks.
6. **Record evidence and decide activation.** For each probe retain sanitized input,
   expected/observed result, workflow/publication/plugin identities, execution locator,
   original hashes, measured limits and costs or explicit unknowns. Update the manifest,
   pending-gate table and current secret-free exports; rerun affected local checks and
   reviews. Enable the production candidates only after applicable E1-E5 evidence and
   separate activation approval. Preserve accepted/in-flight suites and remove only
   disposable resources explicitly included in the authorized cleanup scope.

Early exit: a documented supported provider path and successful native composition
probes sufficient to guide 07. Full exit: effective provider behavior plus actual
Unitale integration evidence. Failed/unverified requirements remain explicit blockers;
successful installation or a single happy-path model call does not establish full compatibility.

## Pre-kickoff capability verification and approval review

Read-only audit on 2026-11-10, before application implementation. Community connector
resolved `https://dify.uniwares.co.uk`, workspace
`ffac910f-2786-490e-90d8-07243d49741b`; inventory returned 32 apps and the same two
shared provider identifiers listed above. No apps, plugins, credentials or workflows
were changed and no execution/provider call was made in this audit.

| Capability | Verified evidence | Remaining proof / implementation implication |
| --- | --- | --- |
| Shared provider availability | Live inventory matches recorded openai 1.0.7-dev7 and openai_tool 0.2.2-dev3 identities | No replacement needed; inventory does not verify execution or credentials |
| Child composition/files/control | Prior deterministic run IDs and byte comparisons are recorded in the candidate README | Reuse this evidence; it excludes application MCP/native conversion and realistic capacity |
| Human Input | Prior Console submission resumed the same run; Unitale source has form retrieval/submission and event handling | Authenticated booklet target correlation remains application integration work; one earlier published-human helper failed and is not success evidence |
| Run observations | Unitale adapter handles identity, stage, usage and terminal events; worker retrieves/reconciles existing executions | `tracingForRun` currently keeps only node identity/status/time, discarding outputs. Per-call/iteration evidence and crash recovery need a bounded shared extension and target proof |
| MCP native file conversion | Unitale handler currently emits JSON/text only. Upstream Dify MCP tool source converts ImageContent/embedded blobs into blob messages | Source is upstream main, not deployed-build proof. Test exact installed conversion, order, byte hashes, wrapper and bounds before selecting the implementation |
| Retry wait/reentry | Live HTTP-request defaults expose retry configuration; prior Loop/Assigner execution proved serial control | No generic timer/resume proven. Live requests for wait, loop and human-input defaults each returned an empty object, which proves neither support nor absence. Do not use this as a reason to add HTTP calls or another retry layer |

Source reference for the proposed MCP conversion:
[Dify MCP tool implementation](https://github.com/langgenius/dify/blob/main/api/core/tools/mcp_tool/tool.py).
This is source-level feasibility only; the exact deployed Dify build remains unresolved.
The generic installed-tools guide is not a complete deployed node-capability inventory.
Full E2-E4 still requires implemented application integration; pre-kickoff probes can
close platform feasibility only. No claim that all technical gates are cleared.

### Approved minimal capability probe results

Scope A was exercised on 2026-11-10 with **one disposable app, one deterministic
run, no tool/provider bindings, no publication and no uploaded files**. No application
or candidate YAML was changed. This is a platform probe, not implementation of 07-11.

- App: `42318aaf-9b51-4b7f-a8f9-cd81fa1fe2b6`,
  `unitale10_capability_20261110_control` (deleted; absence verified).
- Run: `bf200d3c-e685-4a7a-9e0a-e6cbdf0c8351`, partial-succeeded, zero tokens.
- Graph: Start -> successful synthetic Code output -> deliberately failing Code node
  with two native retries and failure branch -> End retaining the successful output.
- `retry_config` readback: enabled, max_retries 2, retry_interval 1000. Stream contained
  exactly retry_index 1 and 2 for the failed node. Observed intervals were approximately
  1.16 and 1.12 seconds. Successful predecessor executed once; no whole-flow replay.
- Separate run/node retrieval after execution retained the earlier synthetic output,
  final error and retry rows with distinct `:retry:1` / `:retry:2` identities.
- Before/after comparison: all 32 original app IDs/names/update timestamps and both
  installed plugin identifiers unchanged. No paid node, external HTTP node, provider
  credential validation or model invocation occurred.
- Ignored local evidence/helper: `output/tooling/dify-capability-20261110.json` and
  `output/tooling/dify-capability-20261110.mjs`. Assertions verify counts, output,
  zero tokens and cleanup; the helper refuses silent replay of its existing journal.

This establishes native failed-action retry with delay and post-run node-output
readback. It does not establish selective paid-error retry, per-production dynamic
configuration, durable app counters, surviving Dify/worker crashes, nested child/loop
identity recovery, or a general asynchronous timer/reentry API. The test deliberately
retried a Code exception to exercise the engine, not the product error classifier.
Do not enable blanket native retries on paid nodes on the strength of this result.

Concrete upstream needs are now clearer: the Unitale stream adapter does not consume
`node_retry`; `tracingForRun` drops retry/exception rows and output bodies. Extend
trusted bounded observation in Unibase only as required, preserving default behavior.
Native retry can be considered as the sole executor only if the accepted classification,
app-authorized counters and settings snapshot can be enforced without stacking retries;
otherwise keep it disabled and use explicit failure routing.

MCP-native-file conversion remains unverified. The user accepted the simpler path:
**no temporary tunnel or standalone reachable fixture**. Verify response shape, order,
hashes and bounds locally in 08-09; test actual Dify conversion through the real staging
application endpoint in 12. This is an accepted evidence deferral, not removal of the
original-image requirement or a claim that deployed conversion passes. Application
recovery proof remains in 09-12.

### Approval register

Scope A approved on 2026-11-10. User response: "I approve but it's important to keep them at minimum reasonable." Use one reusable disposable app where practical; three is a ceiling, not a target. Scope B was subsequently approved separately as recorded below; scope C remains pending.

| Scope | Agreed scope | Current status / exclusions |
| --- | --- | --- |
| A: zero-cost feasibility probes | Up to three disposable `unitale10_capability_20261110_*` apps and their test-only workflow-tool/MCP bindings; deterministic nodes and synthetic PNG fixtures; import/publication/execution/readback, disconnect/retrieval and cleanup of those resources. Probe ordered MCP image conversion, retained node/iteration evidence, and safe action retry delay/reentry. Any fixture endpoint must use an already approved reachable route; no new host/network setup | Approved 2026-11-10 with minimum reasonable resource use. US$0; no LLM/image/provider calls, production app changes, shared plugin changes, application implementation or commits. If a reachable fixture route is absent, stop that probe and report it |
| B: implementation kickoff | Checkpoints 07-11 in Unitale; demonstrated bounded generic changes in Unibase; local fixtures/checks, scoped commits/pushes/PRs/normal merges and reviewed exact template imports after required reviews | Approved 2026-11-10: "I approve with this note: keep everything simple and minimal, do not over-engineer". Reuse existing services/worker/Run UI; no new framework, scheduler, plugin or dashboard. No deployment, release/tag, new dependency, paid call, production migration or bypass of branch protections. External required reviews may still block; 07-08 complete locally; continuing at 09 |
| C: staging acceptance | Exact reviewed application deployment/migration, specialist-first Dify publication/bindings, named test package/accounts, cleanup and finite paid acceptance | Pending by explicit choice "Keep C pending". User selected US$3 total for future provider acceptance; no spending until C approval. Review exact artifacts, deployment/configuration/migration, secure inputs and resource identities after 11; historical US$1 cap is not renewed |

Scope A is closed for the minimum feasible probe; MCP live proof is deferred to 12.
Retain only sanitized evidence: source/build identity where obtainable,
resource inventory, fixture hashes, run/node/iteration IDs, wrapper shape, counters,
timestamps, statuses and cleanup readback. No credentials or customer payloads.
Reconcile failed probes into the existing plan; do not quietly downgrade automatic
retries to manual continuation or promise output recovery that observations cannot supply.
Scope B approval is recorded here; no repeated kickoff approval is needed for the same
scope. The user subsequently requested committing the changes and executing B. Proceed
through satisfied 07-11 dependencies; return for decisions only if findings change accepted behavior/scope or cross
an approval boundary. No technical approval establishes unverified capabilities.

## Next-step runbook

| Stage | Progress | Next action and exit evidence | Unattended work and preparation |
| --- | --- | --- | --- |
| 01-06: local package | Complete locally | Seven candidates, focused checks and two clean same-agent read-only passes; current digest in README | Local checks can run unattended; no further implementation is needed for this handoff |
| Provider/composition feasibility | Isolated probes and installed-source audit complete; SDK retries/default timeout/alias accepted | Reuse shared providers unchanged; current-provider configuration and all seven secret-free candidate import/readbacks now pass; actual execution of this revised binding and application acceptance remain unverified | No-money checks can run unattended with authorized staging access. No plugin installation or upstream release required; any further paid probes need a newly agreed finite scope/cap. Billing reconciliation needs account usage/invoice access |
| 07: application contracts/persistence | Complete locally; two clean same-agent reviews | Follow the [bounded slices](../implementation-plan.md#07---application-contracts--persistence); v2 compatibility, action/assessment/checkpoint facts and retry snapshots | Kickoff approval covers 07-11 and scoped cross-repository publication; disposable local persistence only |
| 08: shared runtime seams | Complete locally at Unitale `2873e60`; two clean same-agent reviews | Unibase PRs #49/#50 imported at `98b77fd1926bc38cefa172a1c90e4735597ca6db`; image transport, private observations, internal waits, Run UI slots and existing-worker late reconciliation pass local checks | No provider release dependency; project wiring remains 09-11 and live MCP conversion remains 12 |
| 09: Unitale gateway/recovery | In progress: Manager terminal view validated offline | Wire versioned Manager MCP, prepaid admission, per-output retention, bounded retries, automatic evidence reconciliation and explicit continuation | Reuse existing worker/commerce; no new scheduler or blind replay; fake-provider tests unattended after dependencies |
| 10: existing Run UI / T21 | Not started | Brief, quote/consent, progress, decisions, revisions and accessible history; retry settings/evidence in existing admin | Local browser fixtures; en/ar public and English/LTR admin; no standalone creator workspace |
| 11: integrated validation | Not started | Actual boundaries, failure/recovery/race tests and two clean reviews; distinguish offline from Dify evidence | Local tests unattended under kickoff approval; final handoff records exact revisions and pending gates |
| 12: staging acceptance | Integrated acceptance pending | Publish specialists then Manager, verify bindings/tags, execute T18-T21 journeys and retain secret-free evidence | Final grouped approval: deployment/migration/publication, secure inputs, package/capacity, test accounts and selected US$3 total cap (no spend until approval); real staging MCP image proof; human consent remains human |


Current execution: 07-08 are complete locally; scope B continues at 09. Retain the
validated candidate and local storage evidence.
Scope B is approved for 07-11 with minimal implementation; scope C stays pending.
Reuse the verified provider/structured-output behavior and existing services when
implementation starts. No temporary tunnel is planned. A compatibility failure narrows or revises
the affected step; it does not authorize a new plugin or framework. Keep all seven
execution switches disabled until the activation prerequisites above are satisfied;
scoped paid probes use separately authorized disposable copies.
