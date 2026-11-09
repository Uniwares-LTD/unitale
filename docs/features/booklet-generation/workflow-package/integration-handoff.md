# Candidate application integration handoff

## Outcome and scope

Integrate the seven native workflow candidates with Unitale's existing Run and booklet
services after separate checkpoint 07 authorization. This document is a package-local
interface proposal. It does not register tools or change application code. The
[specification](../workflow-package-spec.md) owns behavior; the [candidate](README.md)
owns current local evidence. Preserve v1 schemas, records, registrations and in-flight
publications. New incompatible semantics use v2 bindings.

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

| Capability | Request arguments / result | Existing service to reuse or extend |
| --- | --- | --- |
| context | `{}` -> bounded facts below | existing context + owned production/read services |
| read_document | kind,id,cursor? -> immutable body or bounded history page | existing chunked reads; add human_response/work/assessment/execution kinds |
| lease | action -> current Run-owned fence | existing acquire/renew/release |
| index | subjects,artifacts,fence -> stable ID map | existing embedded production index |
| begin_work | action register/dispatch; callId,requestHash,service,operation,targets,sources,correction?,fence -> callId,requestHash,status,fence | extend image begin_generation to text/review/image and durable correction/usage checks |
| transfer | action,key and bounded parts -> verified transfer receipt | existing transfer storage/integrity/capacity |
| retain_original | callId,outputKey,nativeFile,fence -> verified asset receipt | existing restricted Dify downloader and original-media service; per-output identity |
| save_revision | artifactId,content,sources,assets,evidence,mutationKey,fence,revalidatedFrom? -> immutable revision | existing revision writer; complete metadata transfer and new content kinds |
| request_human | question,targets,responseContract,presentation,fence -> requestId,presentationHash,formContent | existing review forms/Run cards; optional Manager policy |
| record_evidence | key,content -> diagnostic evidence reference | existing redacted evidence; no measurement authority |
| record_assessment | assessment,executionLocator,fence -> immutable assessment | existing trusted reviewer binding; all six modes and repeatable assessments |
| sources | sources,references -> ordered immutable reference manifest plus native files | existing source authorization + native image bridge |
| reconcile_work | callId,executionLocator? -> trusted per-item state/effective usage | existing terminal recovery and measurements; never paid replay |
| record_acceptance | revisionId,contentHash,targetIds,assetIds,sources,evidence,fence -> Manager selection | separate Manager selection from authenticated human apply_decision |
| checkpoint | expectedVersion,fence,state -> checkpointVersion | new small opaque CAS record on owned production; no scheduling |
| complete | manifest,fence -> status complete only after structural/product checks | existing completion, removing app quality/human-policy gates for v2 |

This is a versioned boundary proposal, not a demand to replace all v1 handlers. Keep
v1 tools on old bindings; register only v2 on this Manager. Preserve catalog bounds,
service credential permissions and per-request owned Run checks. Bind deployment
identity from server context, never from model claims.

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

Checkpoint writes atomically compare version/fence and persist opaque bounded state.
Before an action it contains pending action/call/item/source identities and request hash/reason;
large request bodies stay outside the checkpoint. Preserve the prior opaque state while
recording pending intent. Afterward it preserves that state and updates lastAction,
lastResult and pending:null. The checkpoint fence always comes from the fresh
authoritative context, never a child/document result field.
Do not replace authoritative work facts with intent.
Durably save partial outputs and original receipts before selecting a manifest.

Keep leases short. Mutation facades acquire/validate and release existing Run-owned
leases around their local transactions; no database transaction or lease is held across
model/tool/Human Input waits. Re-read current context and reacquire a valid mutation
fence after external waits. On a version race stop and recover from authoritative facts.

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
not evidence of deployed capability. No application changes are included in this package. The booklet domain adapter must
map Manager status complete/partial/unknown into the existing Run result/card contract,
without equating a terminated workflow with a completed book.

## Provider and deployment handoff

Inspected official sources: [OpenAI plugin](https://github.com/langgenius/dify-official-plugins/tree/18663b9e723c345fed4c7450a3f925c583fa7064/models/openai),
[image tools](https://github.com/langgenius/dify-official-plugins/tree/18663b9e723c345fed4c7450a3f925c583fa7064/tools/openai).
Manifests report `langgenius/openai` 1.1.0 and `langgenius/openai_tool` 0.2.2.
Text/vision/native structured output and GPT Image 2/2.5 generation/edit are advertised.
Source metadata is not installed/runtime evidence. Image generation/edit yields native
files and usage JSON when available; the call total is not charged once per image.

Confirmed gaps: image helpers reject the accepted dated model string; their OpenAI
client construction omits explicit max_retries=0. No retry-free execution guarantee is
established. Keep activation disabled. Do not silently substitute the Sunburst alias,
patch installed/shared plugins or add another custom package. Resolve through an
existing supported configuration/upstream version or an explicit bounded plan amendment.

Follow the [compatibility procedure](#difyprovider-compatibility-procedure) below.
Disposable platform probes do not establish Unitale ownership or application integration.

Reference slots: Manager/creative gpt-6-luna (4096/8192 output tokens), independent review
gpt-6-sol (8192), dated Sunburst image model (high, opaque PNG). Preserve exact image
canvas/count/settings in preflight. Default paid-layer retries must be disabled;
provider/parent deadlines must fit measured tool and packaging overhead. Record effective
provider/model settings rather than assuming completion_params were honored.

## Acceptance probes and stop conditions

E1: exact model/settings, structured result, no SDK/node/outer retries, trustworthy usage.
E2: two distinct originals through Manager/MCP/child/retention with identical bytes,
hashes, MIME, dimensions/order and practical limits; repeat expiry and storage failure.
E3: actual serial Loop branches, child wrappers, partial/unknown outputs, authenticated
Human Input and durable resume; continuation keeps correction roots and call identities.
E4: owned Manager registration, least-permission managed MCP, suite/observer/reviewer binding.
E5: exact brief/languages/products/configuration and approved finite paid cap.

Pending target probes are not local failures or successes. Do not activate while they
are unresolved. Local evidence is in the candidate README; checkpoint 07 remains gated.

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
   accepted dated image model and retry-free execution before paid image probes. Source
   inspection must cover SDK, Dify node and outer retries; node flags alone are insufficient.
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

## Next-step runbook

| Stage | Progress | Next action and exit evidence |
| --- | --- | --- |
| 01-06: local package | Complete locally | Seven candidates, focused checks and two clean same-agent read-only passes; current digest in README |
| Provider/composition feasibility | Pending; activation blocked | Separately authorize a scoped target check. Resolve dated-model and no-retry support through an existing supported configuration/version or an explicit plan amendment. Prove import, wrappers, native files and control with disposable no-money probes before relying on these interfaces |
| 07: application contracts/persistence | Not started; authorization required | Implement only consumed v2 boundaries from this handoff, preserve v1, update model/example/both diagrams and test storage/identity races |
| 08: shared runtime seams | Conditional; not started | Inspect existing extension points; change Unibase only for a demonstrated missing generic capability, then import through review |
| 09: Unitale gateway/recovery | Not started | Wire Manager-only MCP, admission, usage, per-output originals and durable recovery; verify partial/unknown outcomes without paid replay |
| 10: existing Run UI | Not started | Wire start/review/continue/revise and authenticated human responses; verify races, media ownership and English/Arabic layouts |
| 11: integrated validation | Not started | Exercise implemented application boundaries and complete two clean integrated reviews; preserve separate labels for mocks and real Dify evidence |
| 12: staging/paid acceptance | Not started; separate authorization required | Pin owned publications/configuration, approve finite paid cap, execute accepted journeys, reconcile usage and export secret-free verified DSLs |

Recommended immediate action: resolve the provider/composition feasibility questions
before committing to dependent application interfaces. Checkpoint 07 may then proceed
under explicit application authorization. A compatibility failure narrows or revises
the affected step; it does not authorize a new plugin or framework. Keep all seven
execution switches disabled until the activation prerequisites above are satisfied;
scoped paid probes use separately authorized disposable copies.
