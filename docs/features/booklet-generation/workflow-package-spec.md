# First Dify package specification

## Outcome

Define the seven-workflow staging package and the app changes needed to generate
and integrate it. This is a documentation-only requirements specification, not workflow
DSL, executable schemas or proof of live compatibility. The accepted
[workflow design](workflow-design.md) owns policy decisions; this document owns
the detailed proposed contracts and configuration inputs. This document records
requirements and decisions, not an implementation plan; sequencing is deferred. Package release 1 uses new v2
contracts where necessary; package version and wire-schema version are independent.

## Scope

Seven workflows: Manager, Story Planner, Manuscript Writer/Editor, Art Director,
Page Composer, Image Executor and Quality Reviewer. Existing Run UI is the only
initial user surface. Children expose focused services, have no Unitale access,
and do not control the production journey. No implementation, publication, paid
calls or shared-plugin changes are authorized by this document.

## Acceptance

- [x] Every reference responsibility has a target operation or explicit exclusion.
- [x] Structured content, identities, review coverage and execution outcomes have
  defined semantics, including parallel-compatible item accounting.
- [x] Manager behavior is specified for creation, clarification, review, correction,
  resume, revision and recovery; execution is not yet implemented.
- [x] App updates and candidate reusable Unibase dependencies are identified.
- [ ] Actual provider/file/child/Human Input feasibility is recorded separately.
- [ ] Generated exports have exact bindings, secret-free provenance and acceptance
  fixtures; configured publications and paid acceptance require separate approval.

## Source-to-service mapping

Source: the [published catalog](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/catalog.json).
Its 48 selectors comprise 36 specialist selectors, three Manager selectors, six
tester selectors and three judge selectors. Persona variants are source fixtures,
not three production personas or separate target services.

| Source | Target operation | Selected inputs | Output responsibility |
| --- | --- | --- | --- |
| J01 | Story Planner `concept` | Brief, package constraints, scoped feedback | Concept |
| J02 | Story Planner `outline` | Concept, brief | Outline and provisional subject mentions |
| J03 | Story Planner `cast` | Concept, outline, existing subject map | Individual character descriptions and roster delta |
| J04 | Story Planner `locations` | Concept, outline, existing subject map | Individual location descriptions and roster delta |
| J05 | Manuscript `write` | Selected story and subject descriptions | Ordered manuscript units and exact renderable text |
| J06 | Manuscript `reconcile_characters` | Manuscript, current characters | Updated narrative facts with manuscript-unit evidence |
| J07 | Manuscript `reconcile_locations` | Manuscript, current locations | Updated setting facts and continuity anchors |
| J08 | Art Director `style` and `sample_spec` | Story, manuscript, subjects, visual preferences | Style and package-sized sample specifications |
| J09 | Art Director `character_spec` | Character facts, style, selected feedback | Character reference specification |
| J10 | Art Director `location_spec` | Location facts, style, selected feedback | Location reference specification |
| J11 | Page Composer `paginate` | Manuscript, selected references, package canvas/count/language | Book layout and exact text routing |
| J12 | Page Composer `compose` | One or more explicit layout pages, style and relevant sources | Page/cover specifications with exact lettering |
| J13 and reference serializers | Image Executor `prepare` / `generate` | Explicit image-kind specification and ordered original references | Final request / original images and trusted execution receipts |
| Judge reports | Reviewer `whole_book` plus new scoped modes | Actual selected artifacts and pixels | Assessment with inspected coverage and limitations |
| Manager selectors | Manager graph and configuration | App facts and durable Manager checkpoint | Orchestration; remove app-supplied eligible-route logic |
| Tester decisions/reports | Excluded as production services | Retain only useful synthetic acceptance scenarios | Real humans answer through Run UI; Reviewer supplies independent assessment |

Every creative operation also accepts a `revise` intent with explicit targets,
baseline content and scoped feedback; it returns replacement proposals, never
silently mutates a source. Grouping several capabilities is Manager-selected work,
not permission for a child to initiate downstream services.

Remove fixed two-character, persona-location, sample-slot, page/panel and expression
counts. Counts derive from the purchased package and explicit Manager request.
Reference-view defaults live in Art Director policy, not application schemas.
Do not preserve source tester approval/delegation machinery, application creative
serializers, callbacks or experiment-specific prepared carriers.

## Shared wire contract

The following field definitions are the proposed schema source for implementation.
Use strict discriminated unions; keep optional fields genuinely optional. Do not
copy internal database documents or Dify credentials into child inputs.

| Field | Meaning and constraint |
| --- | --- |
| `contractVersion` | Explicit v2 envelope discriminator; reject unsupported versions |
| `invocationId`, `operationId` | Stable app/Manager-bound identities; do not regenerate on transport retry |
| `service`, `serviceContractVersion` | Requested role and supported capability version |
| `publicationBinding` | Opaque service binding ID and contract/schema identity; resolve provider-specific deployment metadata and compare trusted observed execution |
| `items[]` | Unique `itemId`, operation, intent, subject/target, source selection, content input, constraints and feedback per work item |
| `sources[]` | Artifact/revision/content-hash plus supplied typed content; no implicit current/latest lookup |
| `references[]` | Ordered subject/revision/asset/hash/byte-count/MIME/dimension identities with transient native-file handles |
| `inputHash` | Canonical hash of meaningful request content, excluding transient transport handles |
| `executionConstraints` | Manager-selected call/settings limits and operation identities; no signed spending grant, Unitale credential or private Run context |

The result echoes invocation and input binding, then returns item outcomes with
`itemId`, `status`, proposals, evidence/receipt references and limitations. Statuses:
`succeeded`, `needs_input`, `invalid_input`, `failed`, `unknown`. Missing scope is
explicit; a batch envelope cannot turn absent items into success. `needs_input`
describes missing facts/conflicts for Manager, not a child-issued human question.
Errors include machine-readable code and a bounded diagnostic; no automatic retry
instruction that overrides Manager policy.

Proposals carry artifact kind, subject, proposed content and exact source identities.
An existing target preserves artifact/subject IDs. New entities may use invocation-
local keys; Manager registers stable IDs and remaps references deterministically
before persistence or downstream dispatch. The model does not invent persisted IDs.
Group membership is not a new aggregate database collection. Each saved artifact
gets its own revision and provenance; a roster records selected membership.

Results may arrive out of order. App operation records and receipts are per item under
an optional group identity. Parallel children do not each acquire a production
mutation lease; Manager owns persistence and resolves fencing conflicts. Independent
paid dispatch must not be serialized by a global single-operation guard.

### Balanced content contracts

Every content kind has a version and stable item identities where it contains a
sequence or cross-reference. Empty optional lists mean no supplied constraints,
not an invitation to fabricate details. Exact visible text preserves whitespace
and Unicode; ordinary explanatory prose may be normalized separately.

| Kind | Required meaningful content | Optional, only when used |
| --- | --- | --- |
| Concept | Title, premise, audience/reading needs, tone, requirements/constraints | Theme, emotional promise, unresolved decisions |
| Outline | Summary, ordered beats with IDs, subject mentions | Emotional arc, unresolved details; no mandatory five-act taxonomy |
| Character description | Name/role, narrative description, established facts and continuity constraints | Appearance, clothing/accessories, acting/personality details with source evidence |
| Location description | Name, narrative purpose, description, established anchors/features | Atmosphere, accessibility/world notes relevant to the story |
| Roster | Ordered character/location IDs | None required beyond membership |
| Manuscript | Ordered units with IDs, action/scene description, subject references, exact renderable text items with IDs/kind/speaker | Continuity notes, open facts; distinguish non-rendered prose from visible narration/dialogue |
| Style | Coherent visual direction, reusable style module, typography/bubble direction, exclusions/continuity constraints | Palette, texture, lighting as fields only where downstream use benefits |
| Image specification | Kind, subject, purpose, required features, style/source bindings | Views/expressions, scene composition and permitted design choices; no image asset required yet |
| Book layout | Ordered page IDs/roles, ordered panel IDs, manuscript/text routing, package canvas and reading direction | Page-turn intent, safe regions and text-capacity guidance |
| Page specification | Layout/page binding, ordered panels, composition/action, subjects, exact lettering or explicit no-text | Emotional beat, typography/placement overrides and safe regions when useful |
| Image result | Exact request identity, retained original asset(s), source/specification references | Separate display derivatives; never substitute them for originals |
| Manifest | Title/language, ordered selected page revisions/assets, Manager acceptance references | Human-response and assessment references as evidence, not mandatory app approval gates |

Manuscript renderable text is the authoritative source for routing. Page Composer
assigns every required text item to its intended page/panel without omission or
duplication; explicit splits retain source text spans and order. Authoring a new
caption or editing dialogue requires a manuscript revision through Manager. Covers
may use title/credit items without inheriting unrelated story dialogue. A `noText`
panel has no lettering; generation must not add IDs, labels or reference-sheet text.
Use existing lettering-kind names consistently, with an explicit source migration
map for `sound_effect`/`diegetic` versus `sound-effect`/`in-scene`.

Canvas dimensions and output format are product facts. Do not require trim, bleed,
binding or physical print units for this digital package. Optional normalized regions
use top-left coordinates, positive dimensions and remain within the canvas. Reading
order is explicit, including RTL; array order is never inferred from x coordinates.

Do not copy inherited facts into editable design fields without provenance. A missing
story detail is not a prohibition on Art Director filling it; an established hard
constraint is. Conflicts return to Manager for clarification/upstream revision.

## Image Executor and Reviewer

Prepare migrates the source's creative serializers into Dify. It serializes supplied
specifications, immutable style text, exact lettering and scoped feedback into a final
request. The default implementation is deterministic; any added creative model call
requires explicit Manager dispatch and usage evidence like other paid work.

The prepared request contains kind, prompt, provider/model/configuration identity,
generate/edit mode, output settings/count, ordered reference manifest, source/spec
identities and request hash. Deduplicate references by exact subject/revision/asset
identity while retaining first occurrence in panel reading order. Reject missing
bytes, unknown subjects and inconsistent generate/edit inputs. Do not silently drop
references to fit provider capacity; report the limit to Manager.

Separate a paid provider call from its output items. A call may produce several
images, each with a unique output key, target and retention receipt; each selected
image revision still identifies one original. Current media retention's one-original-
per-generation rule needs an item-aware replacement, not merely a grouped envelope.
Likewise, package canvas governs final pages, while sample/reference canvases belong
to the validated execution profile for those kinds. Current attachment/reuse guards
apply the page canvas to all originals and must be updated. Reject unsupported final
page sizes before dispatch; do not resize or crop originals to conceal a mismatch.

Manager requests preflight assessment of the final prompt, actual ordered references
and meaningful settings. A pass binds request hash, source scope, reviewer publication
and policy snapshot. Regeneration after changed content/settings requires fresh
preflight. Generate validates the exact authorized request but has no quality-policy
gate. It cannot silently rewrite prompts or substitute reference bytes. All returned
images retain individual identities and actual settings; ambiguous partial outputs
remain explicit. Default output is native generated lettering, not app-overlaid text.

| Reviewer mode | Required evidence | Main checks |
| --- | --- | --- |
| `text` | Selected text and relevant source facts | Required content, coherent narrative, consistency and language |
| `specification` | Style/reference/layout/page spec and source facts | Completeness, constraints, exact routing and feasibility |
| `image_request` | Complete final prompt, settings and actual ordered image references | Fidelity to specification, reference applicability and lettering instructions |
| `image` | Actual output pixels, request/spec and applicable reference pixels | Lettering, content, identity continuity, layout and output integrity |
| `whole_book` | Manifest order, all page pixels, required text/source context | Page coverage, cross-page continuity and complete story/lettering |
| `correction` | Original findings, before/after targets and affected sources | Resolution of named defects and relevant regressions |

Assessment fields: immutable assessment ID; mode; exact target/request/source scope;
reviewer/policy binding; inspected coverage; disposition; findings; limitations;
execution/evidence references. Dispositions: `pass`, `repair`, `inconclusive`,
`blocked`. A finding includes stable ID, criterion, confirmed/advisory/uncertain
classification, target/page/panel/text span where applicable, expected versus observed
content and smallest suggested correction. It never dispatches a correction.

Operational failure is not an invented quality finding. A pass cannot cover omitted
pixels or pages. Whole-book calls may be partitioned by Manager into bounded page
windows plus cross-window checks; final coverage explicitly records every page and
required continuity relationship. A textual aggregation cannot claim to inspect
images it did not receive. App validates recorded identities and evidence, not pass
as a condition of generation/completion.

## Minimal Manager behavior

The initial graph uses a bounded serial control loop and explicit service branches.
Future Manager versions may change grouping/concurrency without changing service or
app contracts. Each iteration reads authoritative state, reconciles outstanding
operations, selects work, checks applicable usage safeguards, invokes a focused
service, validates results, retains evidence/proposals and checkpoints intent.
No app-supplied eligible-route or creative-next-action field is required.

Default journey: brief -> concept/outline/subjects -> manuscript and reconciled facts
-> style and sample specifications/images -> subject reference specifications/images
-> layout -> page specifications/images -> whole-book review -> selected manifest.
Each arrow is Manager policy. App product locks still apply at authorized image
dispatch boundaries; a failed image attempt does not reopen purchased story/style
revision permissions. Review precedes Manager acceptance/downstream use. Human
checkpoints are optional Manager choices, with a preference for fewer interruptions.

Common human checkpoints: material brief ambiguity; story/manuscript before image
spend; style/sample direction; subject references before page generation; final book;
and requested revisions or unresolved conflicts. None is a mandatory creative approval.
Manager groups questions and skips checkpoints when intent and constraints are clear.
Ask when a missing fact or consequential choice cannot reasonably be resolved from
context. Preserve explicit user requests for a review or delegated autonomy. App-owned
financial consent remains separate and cannot be skipped by creative policy.

On clarification, child `needs_input` becomes Manager's decision to ask, supply
context or revise upstream. On confirmed defects, Manager selects the smallest scoped
correction, keeping durable correction chains and the accepted three-LLM/one-image
defaults. On inconclusive evidence, seek sufficient evidence or pause; do not
regenerate automatically. Exhaustion records the findings and available resolution.

Checkpoint fields: version, suite/policy binding, current intent, selected revision
and acceptance IDs, outstanding item IDs, human request IDs and correction-chain IDs.
The app stores it opaquely with revision/fence checks. Operational records remain
authoritative when checkpoint intent and execution state differ. Checkpoint before
human waits and after irreversible dispatch/result retention.

A correction chain binds its root task/target, funding purpose, policy snapshot and
separate text/request/image counters. A candidate revision or invocation ID cannot
create a fresh allowance for the same correction task. Manager selects the affected
targets; app verifies the existing chain and remaining limit. A genuinely new customer
revision has its own purchased allocation, not a disguised platform correction.
For grouped work, retain per-target coverage and counters rather than resetting the
whole group after one failed item. Do not interpret a reviewer score as authorization.

Returning to a paused Run resumes its existing Dify execution when valid. A terminal
or lost workflow requires a new bound attempt with the same production, accounting
scope and durable checkpoint, using booklet admission rather than generic restart.
Unknown paid work is reconciled before replay. Cancellation stops new dispatch and
requests provider/Dify cancellation where supported; already incurred costs and
uncertain calls are retained. Run termination alone never marks a book complete.

### Acceptance and revalidation records

Manager acceptance binds selected revision/hash, source set, Manager publication,
policy/checkpoint and optional assessment/human references. It asserts a creative
selection, never a human approval. Store immutable decisions and a current selection
pointer. Human responses retain authenticated actor, request/presentation identity,
displayed revisions, raw response and submission timestamp independently.

For source changes, retain old content/provenance. Recommended representation is a
new revision with unchanged content hash but explicit new source identities and a
`revalidatedFrom` link to the original revision; Manager acceptance selects it.
Manager supplies the revalidation reason and evidence. This avoids retroactive
lineage edits and works with immutable revision readers. It still needs an explicit
v2 schema and rules allowing platform correction/revalidation without customer
revision consumption. App checks product locks and funding, not creative impact.

## App, MCP and UI change inventory

Proposed v2 MCP catalog below has 19 tools, within the current 20-tool private catalog
limit. Names express capabilities; final parameter schemas must follow the shared
contracts. Keep v1 tools for bound history/in-flight use, but do not register both
catalogs on the new Manager merely for convenience. No new public tool endpoint.

| Proposed capability | Existing foundation | Required change |
| --- | --- | --- |
| `context` | context | Bounded allowances/locks/suite/policy/checkpoint summary |
| `read_document` | read_document | v2 bodies and complete transferred metadata; paginated/bounded reads |
| `list_records` | Missing | Cursor reads for operations, decisions, reviews and acceptance |
| `lease` | lease | Preserve Run-owned fences; renew after waits |
| `index` | index | Stable individual subjects and all new artifact kinds |
| `begin_work` | begin_generation | Register text/review/image/group operations, exact request binding, counters and current usage-safeguard checks; no provider-spend reservation |
| `transfer` | transfer | Complete revision/evidence payloads and negotiated transfer sizing |
| `retain_original` | retain_original | Bind verified original to exact execution item/request |
| `save_revision` | save_revision | v2 typed content, full transferred metadata and revalidation lineage |
| `request_human` | request_review | Manager-selected question/action/targets; typed Run cards |
| `read_human_response` | Missing | Authentic request-scoped response lookup with race-safe states |
| `record_evidence` | record_evidence | Diagnostics remain non-authoritative |
| `record_assessment` | record_quality | All review modes, coverage, repeated assessments; no acceptance side effect |
| `sources` | sources | Exact selected content/originals without app quality/human prerequisites |
| `reconcile_work` | reconcile_generation | Trusted receipt verification and per-item outcome/cost reconciliation |
| `record_acceptance` | apply_decision conflates approval | Explicit Manager selection; no human fabrication |
| `checkpoint` | Missing | Opaque versioned Manager state with fencing |
| `complete` | complete | Structural manifest, selected revisions, ownership and bytes; remove pass/approval gates |
| `execution_status` | Incomplete | Record bounded step/time consumption and pause/terminal intent without scheduling work |

### Usage accounting and safeguards

Accepted policy: trust Manager controls for paid execution. The app records usage,
identifies over-limit usage and may block new paid work at a configured ceiling. It
does not reserve provider spending, issue signed grants or require executor-level
replay protection. Existing customer purchase/credit, entitlement and product-lock
rules remain hard app boundaries. No new infrastructure is required for this safeguard.

The ceiling is per paid production/version; continuation and corrections share it,
while a new paid production gets its own ceiling. Include Manager reasoning, Reviewer,
specialist and image calls. Use reported cost when available, otherwise a clearly
labelled estimate with versioned pricing. Reconciliation replaces the estimate for
that call, without double counting parent summaries or repeated receipts. Preserve
unknown coverage; missing cost is not known zero. A model-written claim does not
establish provider authority. Existing provider/adapter/estimate measurement categories
remain useful and must retain their actual evidence basis.

At an enabled ceiling, block new paid operations while permitting retained-result
storage, attachment, reconciliation and reads. Calls already dispatched may finish
and exceed the ceiling; record the overage. Manager may continue independent work
while another call is unknown, subject to this safeguard and other product rules.
It must not replay the uncertain item. Disable automatic paid-call retries.

A narrow adapter may still be needed for compatible reference-model execution,
Dify-owned request construction, native files and usage evidence without Booklet
callbacks. Signed grants, atomic executor claims and receipt-signing infrastructure
are no longer requirements. The earlier SDK atomic-storage investigation therefore
does not constitute a v1 readiness blocker under the accepted policy.

### Original-byte transfer protocol

Keep app calls in Manager and binary conversion in a deterministic file utility
with no application credentials. Proposed inbound path: Manager resolves exact
sources, reads verified chunks through MCP, passes bytes plus manifest to the
utility, verifies whole-file hash/length, then supplies resulting Dify native files
to children in the recorded order. Outbound path: child returns native output files
and receipts; Manager's utility reads original bytes and hashes them, Manager writes
the chunks through MCP and obtains verified retention/attachment receipts.

The utility never generates images and never fetches arbitrary model-selected URLs.
It must support bounded buffering/staging and retryable materialization by immutable
hash. Dify file IDs/URLs are transient handles, not source identities. Expired handles
are recreated from retained bytes; they do not trigger regeneration. Persist generated
originals promptly before optional human waits and do not assume provider files live
as long as the production. If byte retention fails after generation, checkpoint the
original execution/file handles and reconcile; never repeat generation to fix storage.

Existing limits are 8 KiB chunks, 4 MiB revision JSON, 1 MiB per evidence record and
64 MiB image transfer. The revision transfer must include all source/asset metadata.
Negotiate larger chunks only within verified MCP/Dify payload and memory limits;
no hardcoded 100-item manifest cap. Until changed, account for actual chunk overhead:
1 MiB needs 128 data calls each direction, and 64 MiB needs 8,192. This affects step,
time and rate budgets and may make current transport infeasible for a package.
Record an empirical maximum and reject unsupported packages before purchase/admission;
never truncate data. Existing generic Run image download supports a restricted Dify
tool-file path but is not yet an intermediate booklet native-file bridge.

### Operation lifecycle and error handling

Work item state is separate from the production and Dify Run state:
`registered -> dispatched -> succeeded | failed | unknown`. Registered work may
be cancelled before dispatch; a timeout after dispatch is unknown unless trusted
evidence establishes a terminal failure. Output retention and revision attachment
are separately idempotent steps after execution. Result success does not imply
creative acceptance, and attachment failure does not imply provider failure.

| Condition | Contract response | Manager behavior |
| --- | --- | --- |
| Invalid fields, missing required source, unsupported operation | `invalid_input` before paid call | Repair context/contract; no provider retry |
| Creative ambiguity or conflicting established facts | `needs_input` with precise missing facts | Resolve from context, ask if necessary, or revise upstream |
| Model refusal or invalid/truncated structured answer | Known paid failure with retained evidence | Decide bounded correction, alternative configuration or pause; count the original paid call |
| Timeout/lost response after possible dispatch | `unknown` with original item identity | Reconcile; never replay that item blindly; independent work may continue |
| Stale fence or source pointer at persistence | Conflict with current identity/version | Reload and assess applicability; retain output without regeneration |
| Missing pixels or incomplete review scope | `inconclusive` assessment | Supply missing evidence or pause |
| Configured usage ceiling reached or product lock violated | App rejection with authoritative reason | Stop new paid work under that safeguard; retain results and reconcile; product/financial resolution remains separate |
| Storage retry after known generation | Existing operation/original receipt | Retry bytes/attachment only |

User cancellation and terminal workflow release must respect verified parent termination.
The existing commerce release service protects uncertain parent Run termination; retain
that protection without treating an unknown child item as a global stop for independent
work. A durable pause releases short leases but preserves operation and purchase history.

| Area | Concrete affected files/services | Needed outcome |
| --- | --- | --- |
| Contracts | `src/project/booklets/contracts.ts`, `workflow-contracts.ts`; server `booklets/documents.ts` | v2 content/envelopes, grouped outcomes, assessments, acceptance, usage/checkpoints |
| Persistence | `src/lib/server/booklets/repository.ts`, `lifecycle.ts`, `guards.ts` | Immutable records, separate selection, source revalidation, correction funding, concurrent item accounting |
| MCP | `src/lib/server/booklets/mcp-tools.ts`, `mcp-transfers.ts`, `media.ts` | New bounded catalog, native-file bridge, complete transfers and integrity |
| Product admission | `src/project/booklets/server.ts`, `domain.ts`; `src/lib/server/booklets/runs.ts`; `src/lib/server/commerce/orders.ts` | Register product fields, bind entitled start/continue/revision, idempotent release |
| Trusted execution | `src/lib/server/execution/measurements.ts`; Dify execution adapter | Trusted per-call receipts and summary deduplication; provider uncertainty retained |
| Run integration | `src/lib/server/runs/service.ts`, `src/lib/server/domains.ts` | Domain-aware start/restart/terminal hooks where missing; upstream reusable changes |
| Run rendering | `src/lib/runs/cards.ts`, `src/components/runs/registered-card.tsx` | Readable bounded text/specification review and original/derivative media resolution |
| Media route | `src/app/api/run-assets/[id]/route.ts` and project routes | Authorized booklet asset support through explicit extension or project resolver |
| Suite provisioning | Existing Run creation/journal and Dify capability inspector | Verified owned Manager and child/tool bindings, no name-based adoption |

Reusable core changes originate in Unibase and are imported through reviewed template
integration. Project-specific semantics stay in Unitale extensions. Update model guide,
JSON example and both diagrams when persistence is implemented; none is changed by
these proposed fields. Existing v1 productions are not silently migrated.

Run UI entry collects the brief and selects an eligible package/production through
existing controls plus necessary booklet integration. The app handles financial
confirmation with existing commerce services. Manager handles creative questions.
Return/resume uses the existing Run list/detail. Cards bind exact displayed revisions,
support long content without truncation and use authorized booklet media. No raw JSON
review or new creator workspace. Generic restart must not bypass booklet admission.
Current `DomainTargetPicker` only searches existing `{id,title}` targets with a cursor;
it cannot create a production or quote a purchase. Add a trusted domain-specific
admission/action extension to the existing Run surface, reusing form/select controls,
with an idempotent request and server-derived owner/order/production binding. Do not
pretend the missing `/api/booklets` picker route alone supplies new-production flow.
Existing `enqueueBookletRun` preserves logical Run identity for a predecessor and
suppresses duplicate generic Run billing through the consumption binding; adapt its
explicit domain-version check for v2 instead of bypassing that service.

## Dify construction and configuration inputs

Each child graph follows Start -> validate operation/input -> scoped branch -> Dify
prompt/request construction -> authorized execution where paid -> validate and pack
result -> End. Manager alone contains human interaction, scheduling and correction
loops. Disable automatic retries around paid nodes; retained-byte storage retries are
separate. Disable HTTP-node default retries explicitly if that node is used for paid
dispatch. Never send private `runContext` through a code node or child parameter.

Use a JSON-string envelope plus separate native-file input/output collections if the
deployed Workflow Tool cannot preserve nested structured values. Canonical envelope
semantics stay the same across this transport encoding. Verify actual wrapper output
types, file propagation and size limits before freezing DSL node selectors.

Reuse the existing app-facing Run result envelope independently of the child v2
contract: version 1, success/partial/failed outcome, bounded text/cards, optional
checkpoint and failure. Manager's End output reports retained manifest/result
identities, not an inline book or duplicate base64 originals. A partial/paused outcome
must not falsely call `complete`. Choose one converged End node or globally unique
output names compatible with the existing parser.

For Human Input, the local [UI decision example](../../../dify/orchestrators/ui-decision.yaml)
and Run templates provide a concrete node shape: WebApp delivery, one paragraph
input named `response`, `continue` action and the literal output placeholder used
by the Generative UI envelope. `raw-v1` accepts at most 4,000 response characters;
long displayed artifacts use bounded views, not an enlarged reply blob. Manager
interprets the raw response, then looks up the authenticated persisted submission;
an LLM interpretation is not the human record. The private Start context input binds
directly to each managed MCP node's `runContext` according to the capability inspector;
it is never part of child envelopes, logging or file conversion.

Suite manifest must record package/contract versions; source commits and prompt/schema
hashes; each app/publication/graph hash; synchronized Workflow Tool identity/schema;
plugin identifiers/hashes; model/configuration and correction-policy snapshots;
MCP catalog hash; file/call/cost/timeout limits and compatibility evidence. Secrets
are external bindings, never export contents. Pinning Manager alone does not pin
children: read back and compare effective child/tool bindings before registration.

Configuration slots: Manager reasoning, creative text, vision review, image generation;
per-operation token/deadline/output settings; profile language/canvas/reference/file
capacities; Manager human-review policy; correction snapshot; usage ceilings and versioned estimate-pricing configuration.
The user selected published reference models for the first package. Keep these in
deployment configuration, not service-operation enums or creative content schemas.
Changing a model/workflow implementation preserves the contract and creates a new
binding/configuration revision; in-flight work retains its original binding. A changed
model or meaningful setting changes the execution request hash and requires applicable
fresh preflight. Replacement must pass the same contract/capability fixtures.

Inspected reference DSL uses the following baseline:

| Slot | Initial model | Reference settings |
| --- | --- | --- |
| Manager interpretation | `gpt-6-luna` | 4,096 output tokens; reasoning none/standard |
| J01–J12 creative operations | `gpt-6-luna` | 8,192 output tokens; reasoning low/standard; default tier |
| Independent review | `gpt-6-sol` | 8,192 output tokens; reasoning low/standard |
| Image generation/edit | `gpt-image-2.5-sunburst-2026-09-08` | Reference uses high quality, opaque PNG and orientation-based sizes; bounded timeout and no automatic retries |

Use these as initial configuration inputs, not architectural maxima. Grouped requests
must fit the effective model context/output budget or return a capacity failure for
Manager to repartition. Do not truncate a structured result to make it fit. The image
reference's one-image count is an initial setting, not a contract-wide count limit.
The source uses 128,000 input-token ceiling and 32,000 warning threshold; evaluate
these against the target tool and approved cost ceiling before activation.

The image settings and reference handling are documented in the
[image request source](https://github.com/karpishe-experiments/agentic-poc/blob/587f1b7775e316f4c58461dd3fda773af6d5dc2e/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/image-requests.md).
Image model availability and compatible target adapter execution remain unproven.
Do not silently substitute another model if the reference model is unavailable.
The
workspace model catalog read on 2026-11-08 lists active text/vision/structured-output
entries, including `gpt-6-astra`, `gpt-6-sol` and `gpt-6-luna`; this is metadata only,
not runtime, image-tool compatibility or pricing proof.

Read-only node defaults on 2026-11-08 expose iteration configuration with
`is_parallel=false`, configurable `parallel_nums`, and HTTP retry enabled by default.
That supports a candidate graph design, not proof of nested execution. Human Input,
Loop and Tool targeted defaults previously returned empty objects. Local Human Input
examples resolve the candidate node shape, but deployed execution still needs proof.
Retrieve actual Loop/Workflow Tool schemas before freezing their node selectors.
Read-only Workflow Tool lookup for the reference J01 app on 2026-11-08 returned
`NOT_FOUND` (Tool not found). This aligns with the reference's external orchestration;
it supplies no existing nested-tool schema to copy and does not prove that Dify
cannot expose the target service as a Workflow Tool.

## Validation requirements

These are acceptance requirements, not an implementation sequence. The user has
requested decision documentation only; a package/app implementation plan is deferred.

Fixtures must cover zero optional subjects, package maxima, cover/no cover, multiple
panels, explicit no-text, English/Arabic reading order and exact text, grouped partial
results, out-of-order results, conflicting duplicate keys, stale references, request
hash changes, reviewer missing pixels, three/one correction exhaustion, policy-bound
continuation, expired entitlement, cancellation after dispatch, response-loss retries,
unknown costs with independent progress, per-production ceiling scope, estimate
replacement, recorded overages and manifests beyond 100 items. Zero optional subjects does not imply
zero story pages. Validate source coverage and Unicode preservation deterministically.

Paid acceptance requires a named package/brief, exact models/settings, numeric money
and call ceilings, allowed cases and target staging suite. Do not invent those launch
values. Synthetic parallel fixtures prove contract compatibility; the initial Manager
does not need production parallel orchestration to pass its serial journey tests.

## Open questions and limits

Design details above are ready for review; they are not all user-approved wire fields.
Human checkpoint policy and initial model-selection approach are settled above.
Remaining technical evidence: compatible execution and usage reporting, native file bridge, actual
Workflow Tool shapes, Human Input/loop composition and effective publication pinning.
No live probe or installed-plugin mutation is authorized in this session. Record any
failed capability as a concrete dependency rather than fabricating a working DSL.

The package can be authored only after implementation authorization; final executable
node bindings additionally need the configuration/probe evidence above. App updates
are necessary for the target journey: generating seven YAML files alone cannot meet
the agreed requirements.

### Remaining evidence gates

| Gate | Concrete evidence needed | Work blocked |
| --- | --- | --- |
| E1 execution and usage | Compatible reference-model tool/adapter, per-call usage evidence and estimates, disabled automatic retries, Manager-mediated results | Runtime compatibility and usage-safeguard verification; no executor-level guarantee required |
| E2 native files | Manager-only byte round trip, identical hashes/order, practical size/rate bounds, expiry/recovery behavior | Final file-node bindings and accepted package capacity |
| E3 composition | Actual child input/result wrapper, observed execution identity, Human Input resume, bounded control and tool publication behavior | Claims that candidate graphs execute correctly on staging |
| E4 app ownership | Unitale staging identity, owned Manager import journal, managed MCP permissions and suite/reviewer bindings | Registration and environment activation |
| E5 acceptance configuration | Exact package/brief/languages/cases, reference-model settings and finite call/money cap | Paid end-to-end acceptance |
| E6 local baseline | Locked dependency setup, fresh affected checks and separate reviews | Fresh runtime verification claims |

These gates are explicit missing evidence, not unanswered product-preference questions.
Do not mark them passed from inventory or source inspection. Signed grants and
atomic executor claims are explicitly excluded from these evidence requirements.
Read-only investigation has not established a compatible off-the-shelf adapter.

### Feasibility evidence requirements

The scenarios below define needed evidence, not scheduled work or an implementation
plan. Live writes/publications and paid calls require separate approval; use isolated
apps rather than changing the observed staging app or shared plugins.

| Probe | Procedure | Pass evidence |
| --- | --- | --- |
| Structured child | Publish a deterministic echo child; expose/synchronize its Workflow Tool; invoke it from a parent with two independently identified items | Exact fields and Unicode preserved; effective tool/publication and observed child Run identity recorded; no model required |
| Bounded control | Execute finite iteration over successful/failed item fixtures, then exercise a bounded pause/continuation path | Termination and partial results preserved; no unbounded loop or repeated completed item |
| Human Input | Present existing Run cards with exact request/target IDs; submit once and repeat the same submission request | One authenticated response, same target binding, successful resume and no synthetic approval |
| Files | Round-trip two distinct original PNGs through app MCP, Manager file utility, child echo and app retention; repeat at the maximum proposed size | Byte hashes, lengths, MIME and reference order identical; measured chunk count/time; failed attachment retries do not invoke generation |
| Publication binding | Capture child/tool binding, change only a disposable child publication and inspect/update its tool | Detection of changed effective binding; accepted/in-flight suite cannot silently switch |
| Usage safeguards | Exercise repeated measurement receipts, estimated then reported cost, ceiling reached during in-flight work and an unknown child alongside independent work | No accounting duplication; estimate replaced; new paid work blocked at ceiling; retention allowed; overage visible; no replay of uncertain item; independent work allowed below ceiling |
| Model compatibility | Separately approve one bounded text call, one image generation/edit path and one actual-pixel review with the selected reference models | Trusted usage/request identities, declared settings honored, original bytes retained and no extra hidden paid calls |

No-money probes can still require live write approval. A proposed
price table or token estimate is not actual cost evidence. Persist a concise report
with timestamps, exact bindings, sanitized inputs/results, checksums and measured
limits. Record failures without changing the requirements to match them.

Package sizes must fit proven limits; do not infer support for arbitrary long books
from pagination. No implementation sequence or task breakdown is adopted here.

Documentation verification on 2026-11-08: local links/commands/model diagrams and
skill checks pass. The i18n check cannot start because `typescript` is absent; prior
runtime compatibility execution likewise lacks `tsx`. Dependencies were not installed
in this documentation-only session. No runtime pass is claimed from these doc checks.
