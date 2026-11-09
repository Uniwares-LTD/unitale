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

### Supported provider path assessment

Read-only investigation on 2026-11-09 rechecked official plugin HEAD at
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
The fixes are submitted as [upstream PR #4238](https://github.com/langgenius/dify-official-plugins/pull/4238),
head `3326464451bbbb6d2060ef6645d826b6f82aa15b`. The PR is open; no upstream CI check
runs were reported at readback. It is not an accepted official release. The table above
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
Maintainer acceptance/release and application-bound E1-E5 proof remain pending.
Source/fake-transport tests, effective zero-retry configuration and single observed
native provider nodes support retry control; no live retryable-failure injection or
invoice reconciliation is claimed. Production execution stays disabled.

Future integration requires separate authorization and a supported release or reviewed
test installation. After secure configuration, set text provider **and any
custom-model** credentials to `max_retries=0` and an agreed finite `request_timeout`;
set those controls on both image tool nodes, with the exact dated model. Keep Dify
node and outer retries disabled. Re-export actual bindings and record the installed
hashes and effective settings. A network timeout is not a total workflow deadline;
measure tool/packaging overhead and align parent deadlines before paid acceptance.
The current probe scope is complete; do not spend the remaining allowance or implement
application integration automatically. If upstream
fixes are declined, explicitly amend the accepted provider
requirements or wait for a supported release. Activation stays disabled throughout.

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

| Stage | Progress | Next action and exit evidence | Unattended work and preparation |
| --- | --- | --- | --- |
| 01-06: local package | Complete locally | Seven candidates, focused checks and two clean same-agent read-only passes; current digest in README | Local checks can run unattended; no further implementation is needed for this handoff |
| Provider/composition feasibility | Passed for the isolated candidate; official release/activation pending | Actual Luna structured output, Sol vision, dated Sunburst Generate/Edit and original downloads pass after the documented DSL fixes. Preserve the US$1 cap and shared experiment plugins; retain the rejected-request hold | Read-only upstream status checks can run unattended. Maintainers own acceptance/release; installation needs a reviewed package identity and an authorized isolation/upgrade scope. Billing reconciliation requires account usage/invoice access |
| 07: application contracts/persistence | Not started; separate authorization required | Implement only consumed v2 boundaries, preserve v1 and update model/example/both diagrams | Can proceed unattended after explicit application authorization and selection of the work branch; use disposable local persistence for verification |
| 08: shared runtime seams | Conditional; not started | Inspect existing extension points; change Unibase only for a demonstrated missing generic capability, then import through review | Inspection can be local/read-only. Any required implementation needs authorization for Unibase and template integration, plus its repository access; omit this work if existing seams suffice |
| 09: Unitale gateway/recovery | Not started | Wire Manager-only MCP, admission, usage, per-output originals and durable recovery; verify partial/unknown outcomes without paid replay | Local implementation/tests can run unattended once authorized and 07/necessary 08 seams are ready; target MCP credentials and environment identity are needed only for later live proof |
| 10: existing Run UI | Not started | Wire start/review/continue/revise and authenticated human responses; verify races, media ownership and English/Arabic layouts | Can run unattended after application authorization and 09 readiness, using local test accounts/fixtures; real customer decisions remain authenticated human actions |
| 11: integrated validation | Not started | Exercise implemented application boundaries and complete two clean integrated reviews; preserve separate labels for mocks and real Dify evidence | Local integration checks can run unattended after 07-10. Real target checks require authorized access, working bindings and explicit live scope |
| 12: staging/paid acceptance | Provider probes complete; full acceptance not authorized | Import/publish children, synchronize tools, bind the owned Manager, apply/read back the documented names/tags and record secret-free exports; prove integrated journeys | Needs separate staging/publication/cleanup authorization, exact environment and provider package identities, privately configured credentials, application deployment readiness, test account/entitlement fixtures and a new finite paid budget. Then bounded probes can run unattended; human acceptance and production activation remain separate |

Current stop: deliver the validated Dify/provider handoff and retain the evidence.
Checkpoint 07 requires separate application authorization. If granted later, reuse the
verified provider/structured-output behavior and existing services. A compatibility failure narrows or revises
the affected step; it does not authorize a new plugin or framework. Keep all seven
execution switches disabled until the activation prerequisites above are satisfied;
scoped paid probes use separately authorized disposable copies.
