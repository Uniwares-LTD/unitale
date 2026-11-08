# First Dify package specification

## Outcome

Define the seven-workflow staging package and the app changes needed to generate
and integrate it. This is a documentation-only requirements specification, not workflow
DSL, executable schemas or proof of live compatibility. The accepted
[workflow design](workflow-design.md) owns policy decisions; this document owns
the detailed proposed contracts and configuration inputs. This document records
requirements and decisions; the [delivery plan](implementation-plan.md#issue-10-deliverables-and-dependency-map)
owns sequencing, checkpoints and verification. Package release 1 uses new v2
contracts where necessary; package version and wire-schema version are independent.

## Scope

Seven workflows: Manager, Story Planner, Manuscript Writer/Editor, Art Director,
Page Composer, Image Executor and Quality Reviewer. Existing Run UI is the only
initial user surface. Children expose focused services, have no Unitale access,
and do not control the production journey. No implementation, publication, paid
calls or shared-plugin changes are authorized by this document.

## Acceptance

The [readiness register](workflow-design.md#implementation-readiness-audit) maps
A01-A22 to the technical resolutions below. These are selected implementation
requirements, not executable schemas or evidence that staging compatibility passed.
The environment/plan handoff does not start package implementation. Checkpoints 01-12 in the
[delivery plan](implementation-plan.md#issue-10-deliverables-and-dependency-map)
deliver the local candidate package at 06, then gate application changes at 07 and live acceptance at 12.

- [x] Service boundaries, technical decisions and verification gates recorded.
- [x] Every reference responsibility has a target operation or explicit exclusion.
- [x] Manager owns orchestration, quality policy and optional human checkpoints.
- [ ] Package-local schemas, provider plugin and seven candidate workflows implemented (01-06).
- [ ] Application contracts, migrations, gateway and Run UI integrated (07-11).
- [ ] Actual provider/file/child/Human Input feasibility verified on the target.
- [ ] Current secret-free exports match publications and paid acceptance evidence.

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
`succeeded`, `partial`, `needs_input`, `invalid_input`, `failed`, `unknown`. Missing scope is
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

Returning to a paused Run resumes its existing Dify execution when valid. Only verified
termination/release permits a successor attempt with the same production, accounting
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

For source changes, retain old content/provenance. The planned representation is a
new revision with unchanged content hash but explicit new source identities and a
`revalidatedFrom` link to the original revision; Manager acceptance selects it.
Manager supplies the revalidation reason and evidence. This avoids retroactive
lineage edits and works with immutable revision readers. A11 below fixes the same-content/
asset and lock rules for its v2 implementation. Platform correction/revalidation does
not consume customer revision allocations; app checks locks/funding, not creative impact.

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
| `execution_status` | Incomplete | Read observer-recorded step/time consumption and execution facts; no writes or scheduling |

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

A13-A14 select native MCP image content and the existing restricted Dify downloader;
there is no stateful chunk-materialization plugin or eighth workflow.

Inbound: Manager calls `sources` for one exact original; Unitale returns metadata
and MCP image content, which Dify materializes as a native file. Manager supplies
files to children in the recorded order. Outbound: Manager passes the returned native
Dify tool-file handle to `retain_original`; Unitale verifies its configured origin,
restricted path, signature fields, MIME, byte length, dimensions and hash before
retention. No arbitrary URL fetch, child callback or normalized substitute is allowed.
The reusable MCP content extension and downloader extraction originate in Unibase.

Dify 1.17.1's [MCP implementation](https://raw.githubusercontent.com/langgenius/dify/1.17.1/api/core/tools/mcp_tool/tool.py)
converts image content into blob messages. This is source evidence for the design,
not a successful deployed round trip. Metadata may appear in structured/text output;
do not duplicate image base64 in both representations when accounting response bytes.

| Candidate transport bound | Value |
| --- | --- |
| Inbound original per MCP response | One image, 8 MiB |
| MCP request / tool result / total response | 1 / 16 / 24 MiB |
| Child request or result JSON carrier | 256 KiB UTF-8 |
| Document/evidence transfer chunk | 64 KiB decoded |
| Persisted revision | Existing 4 MiB |
| Manager checkpoint | 64 KiB |

These are explicit candidate execution-profile settings, not current deployed
configuration or universal product limits. Preserve the existing larger storage
capability; enable only package/profile combinations proven to fit transport and
provider capacity. Never shrink an accepted package or resize originals to fit.

Large documents use ordered sections with an assembly identity, section position,
content hash and a final complete-part manifest. Manager supplies bounded sections;
Unitale assembles and validates the full revision, including sources/assets/provenance.
Only ordered sequence fields such as manuscript units, outline beats and layout pages
are partitioned; a scalar field must fit its field/carrier bounds. No partial assembly
becomes an accepted revision. Dify never reconstructs a 4 MiB document in one Code
output. Retain bounded transfer for JSON; do not use thousands of 8 KiB image calls.

Recreate expired inbound handles from retained original bytes. Retain generated
originals before human waits. After generation/storage failure, save the execution and
file identities and retry retention only; unavailable evidence becomes unresolved,
never permission to regenerate. E2 measures two distinct PNGs, configured maximum
reference sets, 8 MiB boundary files, large JSON sections and over-limit rejection.
Require exact hash/order preservation and completion within configured step/time
limits before enabling capacity. No throughput or 64 MiB transport claim is made.

### Operation lifecycle and error handling

Paid-call state is separate from item outcomes and production/Dify Run state:
`registered -> dispatching -> succeeded | failed | unknown`. Persist dispatching before
the paid node; registered work may be cancelled before dispatch. A timeout is unknown unless trusted
evidence establishes a terminal failure. Output retention and revision attachment
are separately idempotent steps after execution. Result success does not imply
creative acceptance, and attachment failure does not imply provider failure.

Keep execution outcome, output validity and retention outcome distinct within these
existing contracts, not a new generalized state machine. Dify workflow success alone
does not establish usable content. Select the provider's final answer before schema
validation; do not concatenate commentary/reasoning or salvage truncated JSON. Preserve
verified usage and refusal/incomplete diagnostics even when no usable proposal exists.

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

### Graph conventions and technical dependency boundary

Use a JSON string named `request` and an explicitly ordered native-file collection
named `references` for child Start inputs; End returns JSON string `result` plus
native `files`. This is the chosen transport encoding, not a model-specific service
schema. Pair each file position with its immutable manifest entry and every output
with its unique output key. Validate and unpack only fields needed at a node; keep
large nested content in the bounded JSON carrier. Do not depend on undocumented
automatic nested-object coercion in Workflow Tools. Checkpoint 02 probes actual wrappers and
records the selectors needed to carry these values without altering their semantics.

Use native structured model output where supported and validate the parsed result
against the operation schema. Provider/model compatibility includes that capability;
do not interpret an arbitrary free-text answer as a trusted result. Dify Code nodes
perform pure validation, hashing, routing and serialization. They are not file or
network workers. The official [Code documentation](https://docs.dify.ai/en/cloud/use-dify/nodes/code)
describes sandbox restrictions and output bounds; verify the deployed bounds instead
of copying cloud limits into a product contract.

Use [Iteration](https://docs.dify.ai/en/cloud/use-dify/nodes/iteration) for explicit
independent item sets, serial initially. Preserve failed-item slots and pack explicit
outcomes; never use removal of failed results to make a partial group look complete.
Use [Loop](https://docs.dify.ai/en/cloud/use-dify/nodes/loop) only in Manager for
dependent progression/correction, with both an explicit stop condition and a maximum
count. Checkpoint before reaching the bound and return partial with a resume reason.
Loop bounds protect execution; durable correction counters separately protect the
creative task across Runs. Do not use the documentation's example quality score as
a quality policy. These are design choices based on official node semantics, not
proof that the installed version executes the proposed composition.

The selected execution dependency is a separately owned
`unitale/provider-execution` plugin, initial version `0.1.0`, under
`dify/plugins/provider-execution/`. Its text/vision and image tools accept plain
Dify-authored requests/native files and return parsed content, original native files
and deterministic receipts. No creative templates, Unitale endpoints, private Run
context, progression or automatic paid retries belong in it. Do not modify the
installed experiment packages. This selects a narrow adapter rather than leaving
an implementer to choose a provider framework.

Candidate build baseline: Python 3.12, `dify-plugin==0.11.0`; lock transitive
dependencies during the authorized build and prove compatibility before installation.
[SDK metadata](https://pypi.org/pypi/dify-plugin/json) establishes package availability,
not compatibility with the target daemon. Text uses the published Responses request
mapping; images use the published generation/edit mapping. Preserve the selected
reference models/settings below as configuration, not service-contract enums.
HTTP/SDK/node retries are zero. Initial text/image request deadlines are 120/270
seconds; configured Dify tool/parent deadlines must accommodate them and packaging.

Before paid journeys, validate actual generated graph parameters against the installed
adapter/host: required request and structured-output settings, JSON carriers, ordered
native files, empty reference conversion and credential-provider binding. Cover every
operation, including Reviewer and report-producing paths; a successful first image
does not prove the later nodes. Checkpoint 02 establishes disposable bindings where authorized; 06 checks candidate exports and 11/12 repeat
the checks on actual candidate/publication exports. Record version-specific findings;
do not hard-code an experiment's provider-type workaround as a portable contract.

Adapter receipts contain call/input/request IDs and hashes, dispatch state,
requested/observed model, nullable provider request ID, usage and its basis, timing,
output keys/hashes and sanitized failure information. Provider usage plus calculated
pricing is an estimate, not provider-reported cost. Model-written content cannot
populate the receipt. Each adapter execution handles its explicit call; focused
workflows can execute several Manager-supplied calls without changing contracts.

Each model/tool call carries a Manager-assigned work identity. Observed execution
identity comes from Dify/provider execution evidence, not an LLM echo. A child may
return several call receipts and several output items; they are separate arrays.
Invocation/result input hashes and item IDs prevent accidental cross-assignment.
Disable automatic retries at every paid layer, including provider SDK settings,
tool nodes, HTTP nodes and outer workflow retry policy. Known failure can return to
Manager; lost dispatch remains unknown. Infrastructure may redeliver an observation,
but must not turn that redelivery into another paid call.

Manager supplies the permitted call scope/settings in `executionConstraints` before
invocation. Children do not invent an unbounded paid plan: an operation exceeding
that scope returns a capacity/missing-scope result to Manager. The first package
normally uses one paid execution for a scoped item, while the envelope permits
multiple explicitly authorized calls and output items. Manager reasoning and review
are also registered paid work; bootstrap/context retrieval and deterministic routing
do not require an unrecorded planning call. This is Manager policy and call accounting,
not a permanent one-call service restriction.

### Concrete runtime record and UI decisions

- Keep v1 and v2 domain bindings distinct. Select the parser/catalog from the accepted
  binding, not from whichever schema is newest. V2 records use a version discriminator;
  application-phase migrations (07) create indexes/optional storage fields without changing v1
  acceptance history. A user returning to v1 uses its original contract; creating a
  new v2 production from owned old sources requires explicit validated copying and
  provenance, not reinterpreting v1 JSON as v2. Automatic conversion is not required.
- Store usage evidence append-only. The effective-cost projection groups by production
  and stable call identity, selects reported cost when available, else an estimate
  using the snapshotted pricing basis, else unknown. A09 defines conflicts and refinement.
  A receipt duplicate with the same hash
  is a no-op; the same evidence identity with changed bytes is a conflict. A later
  observation has a new evidence ID linked to the same call. Parent summary amounts
  remain diagnostic when their leaf calls are included. Use decimal currency amounts,
  never floating point; reject mixed-currency addition rather than inventing exchange
  rates. Store estimate basis/pricing revision and reported currency explicitly.
- Booklet admission exposes `create`, `continue` and `revise` intents through the
  existing Run start/detail surface. `create` supplies the brief and a published
  booklet consumption product identified by `catalogId`, `revision` and the confirmed
  `quoteHash`, plus an idempotency key. Purchase offers fund credits and are not
  booklet admission inputs. Revalidate the publication and capacity server-side
  through existing `queueConsumption` admission before charging/dispatch;
  `continue` supplies an owned production; `revise` additionally supplies the scoped
  user request and existing purchased allocation/quote confirmation as applicable.
  Browser-supplied order/owner/price/allowance claims are not authority. Repeated
  idempotency keys must return the original result or conflict on different inputs.
- Readable review cards identify exact revision/request IDs and load bounded pages
  through authorized server resolvers. A display page cursor is bound to owner and
  immutable revision so edits cannot silently change the reviewed content. Keep raw
  human response separate from Manager interpretation and actual financial consent.
  No extra chatbot, editor, gallery workspace or arbitrary component execution.
- Short leases protect mutation only. Never hold a lease across provider work or
  human waits. Register dispatch/source identities under the fence, release, then
  reacquire and compare before attachment/selection. Retain stale outputs as evidence;
  Manager decides whether to reuse/revalidate. This supports future independent
  concurrency without adding parallel scheduling in v1.
- V2 names its duration allowance `maxActiveExecutionSeconds`. Accumulate trusted
  active parent-execution intervals across attempts, excluding recorded Human Input
  waits and durable pauses; do not sum nested child durations again. Unknown interval
  boundaries remain unresolved, not zero. A new attempt does not reset consumption.
  Product `expiresAt` remains the separate entitlement wall-clock boundary; do not
  invent a new mandatory expiry. Provider request deadlines and per-attempt Dify
  node/loop limits remain distinct suite settings. Preserve v1 `maxElapsedSeconds`
  semantics for v1 bindings; no silent reinterpretation of purchased snapshots.
  Verify long human waits, resumed active time, unknown termination and overlapping
  child calls with fake clocks before live acceptance.

Each child graph follows Start -> validate operation/input -> scoped branch -> Dify
prompt/request construction -> authorized execution where paid -> validate and pack
result -> End. Manager alone contains human interaction, scheduling and correction
loops. Disable automatic retries around paid nodes; retained-byte storage retries are
separate. Disable HTTP-node default retries explicitly if that node is used for paid
dispatch. Never send private `runContext` through a code node or child parameter.

Use the JSON-string envelope plus separate native-file input/output collections
defined above. Canonical envelope semantics stay the same across this transport
encoding. Verify actual wrapper output
types, file propagation and size limits before freezing DSL node selectors.

Reuse the existing app-facing Run result envelope independently of the child v2
contract: version 1, success/partial/failed outcome, bounded text/cards, optional
checkpoint and failure. Manager's End output reports retained manifest/result
identities, not an inline book or duplicate base64 originals. A partial/paused outcome
must not falsely call `complete`. Use one converged End node with the app parser's
`result` name; internal branches produce the same discriminated result shape.

For Human Input, the current [JSON Run templates](../../../src/lib/server/runs/templates/README.md)
are the canonical local source; historical YAML is not a new binding authority.
Use the verified node shape: WebApp delivery, one paragraph
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

## Technical resolutions for A01-A22

This section freezes the technical choices requested after the readiness audit.
The sections above own creative semantics and source mapping; these definitions own
wire precision, state transitions and integration deltas. All are proposed v2 behavior,
not descriptions of existing v1 code. E1-E6 remain unpassed until actual evidence exists.

### A01-A03 - Wire, storage and identity

Strict v2 request fields are `contractVersion: 2`, `service`,
`serviceContractVersion`, `invocationId`, `operationId`,
`publicationBinding`, `inputHash`, `items`, `sources`,
`references` and `executionConstraints`. Existing ID syntax remains
ASCII, 1-128 characters; hashes are lowercase 64-character SHA-256. Schema versions
are positive integers; deployment/configuration revisions remain distinct identities.

Each item has a unique `itemId`, operation, `intent: create | revise`,
subject/target binding, typed operation input, constraints and feedback. Revision
intent additionally requires its baseline revision and scoped feedback. Required
source roles are those in the source-to-service table; missing roles produce
`invalid_input` or `needs_input`, never implicit current/latest lookup.
`executionConstraints.calls` declares call IDs, covered item IDs, configuration
binding and permitted output counts. Children may execute several explicit calls;
they cannot invent additional calls or downstream services.

Result fields echo invocation/input binding and contain separate item outcomes,
proposals, call receipts, file/output keys and limitations. Exactly one outcome is
required per input item; duplicate, missing or unknown item IDs fail validation.
Item statuses are `succeeded | partial | needs_input | invalid_input | failed | unknown`.
Batch status is the common status when all items agree, otherwise `partial`.
Every returned original maps to one call/output key; each selected image revision
identifies exactly one original. A call can return multiple outputs; item success
requires its requested output scope, not merely one successful sibling.

Omitted optional fields mean not supplied; null is reserved for explicitly unavailable
execution facts. Empty lists are meaningful, not absent data. Retain the existing
65,536-character individual text bound and enforce aggregate byte limits separately.
Do not trim exact visible text. Text-span offsets are zero-based half-open Unicode
code-point offsets. Required spans cover source text once, in order, with no gaps or
duplication. Lettering aliases migrate to existing `sound-effect`/`in-scene`.
Optional regions use integers on a normalized 10,000-unit canvas with positive width/
height and no overflow; preserve v1 float-region parsing separately.

| Persisted v2 kind | Subject | Required content |
| --- | --- | --- |
| concept | book | title, premise, audience, tone, requirements |
| outline | book | summary; ordered beat IDs, descriptions, subject references |
| description | character/location | name, narrative role/purpose, description, established facts, continuity constraints |
| roster | book | ordered character IDs and location IDs |
| manuscript | book | ordered unit IDs, action, subjects, exact text items with IDs/kind and applicable speaker |
| style | book | direction, reusable style text, lettering direction, exclusions, continuity constraints |
| image-spec | sample/character/location | image kind, purpose, required features, style/source bindings |
| book-layout | book | ordered page/panel IDs, text routing, canvas, reading direction |
| page-spec | page | layout binding, ordered compositions, subjects, exact lettering or no-text |
| reference | sample/character/location | prepared-request identity and one retained original |
| page-image | page | prepared-request identity and one retained original |
| book-manifest | book | title/language, ordered selected pages, Manager acceptance references |

Use existing subject kind `style-sample` for samples; only `page` has a
cover/story role. Optional palette, lighting, emotional beats and similar creative
fields remain optional. Do not add print/bleed units or mandatory design taxonomies.

| Collection/record | V2 change and uniqueness |
| --- | --- |
| Existing books/productions/revisions/assets | Version-discriminated readers; retain embedded subject/artifact index and immutable revisions/originals |
| bookletGenerations | V2 per-call dispatch/item/output bindings and effective-usage projection; unique owner/production/operation/call |
| bookletReviewRequests | Versioned request/presentation and authentic decision correlation; unique request identity |
| bookletServiceWrites | Idempotency receipts including admission recovery; same key/input returns original result |
| Production checkpoint/current pointers | Bounded checkpoint under production version/fence; history remains separate |
| New bookletAssessments | Immutable repeated scoped assessments; unique owner/production/assessment ID; indexed target history |
| New bookletAcceptances | Immutable Manager selections; unique owner/production/acceptance ID |
| New bookletCorrectionChains | Durable target/family/allocation counters; unique owner/production/target/family/allocation |

Keep v1 `bookletQualityReviews` and its unique target index unchanged. Add indexes
for unresolved calls, target history and request state. New unique indexes on shared
collections use v2 partial filters, so missing v2 keys on historical v1 records do not
collide. Receipt plus associated
pointer/counter updates are atomic. Do not add a generic event store or group collection.
Readers choose versions from accepted bindings; no in-flight migration or automatic
v1 creative conversion. Rollback disables new v2 admission but retains v2-capable
read/recovery code. Existing model guide/example/diagrams remain implemented-v1
references until 07 updates application code and documentation together; 01's package-local
schemas remain proposals for the app.

Unitale issues persisted IDs from stable idempotency registrations; children emit
invocation-local keys only. Validate local keys, register stable subject/artifact IDs,
remap all references, hash, then persist. Changed inputs under a reused key conflict.

Canonical encoding: UTF-8, sorted ASCII property names, preserved array order, no
insignificant whitespace, no Unicode normalization. Reject invalid Unicode, unsafe
integers and non-finite numbers. Monetary decimals are strings; v2 regions are integer
units. Preserve exact prompt/lettering bytes. Hash projections are:

- Content: versioned typed content only; exclude provenance and selected source metadata.
- Input: service/operation, meaningful item inputs, selected identities, ordered references
  and execution configuration; exclude self-hash, transient handles and transport timestamps.
- Image request: exact prompt, meaningful settings/configuration, ordered reference hashes
  and specification/source identities; exclude expiring file URLs.
- Presentation: exact question, response contract, displayed revisions and presentation data.

Cross-runtime fixtures include omitted/null fields, reordering, changed settings,
remapping and Unicode. Canonical `{"a":1,"b":"é"}` with literal UTF-8 e-acute
hashes to `09ad9fd2fb648cb2f62141215828ea00a62c299db05d20aa9ade2f527a301cc6`.
Canonical `{"references":["a","b"],"settings":{"n":1}}` hashes to
`1e85a602fa45e8de0fffa55164950fea6f696d180cc15dcdbffeb7754fd5a764`;
reversing that array hashes to
`c94655b531ae23e5fc86c32ce358bf3cf84dd6e169ffe9371e3437055606ce0a`.
These are encoding vectors, not a claim that Dify's implementation has been tested.

### A04 - MCP transition ownership

All names are `booklet_<name>_v2`. Common results use a success/error union;
errors distinguish invalid input, conflict, stale fence, unavailable source, capacity,
entitlement, limit and unknown outcome. Owner/production come from private context,
not browser/model claims. Read tools require read permission; all mutations require
write permission. Bind Start context directly to managed MCP nodes, never via Code.

| Tool | Inputs beyond private context | Result / sole transition responsibility |
| --- | --- | --- |
| context | optional summary cursors | product/locks/policy/usage/checkpoint summary |
| read_document | immutable revision and section/cursor | bounded content, hash and completeness metadata |
| list_records | record type/filter/cursor | scoped history page |
| lease | acquire/renew/release | short Run-owned fence |
| index | local keys and subject/artifact definitions, fence | stable ID map |
| begin_work | register descriptors or mark selected call IDs dispatching, fence | durable operation/call identity; no spending reservation |
| transfer | begin/write/finalize bounded document/evidence parts | verified transfer receipt |
| retain_original | call/output key and restricted native handle | verified asset receipt |
| save_revision | typed content or complete transfer, sources/provenance, fence | immutable revision |
| request_human | question/presentation/targets/response contract, fence | request ID and presentation hash |
| read_human_response | request ID | pending/submitted/stale/closed/reconciling and authentic response |
| record_evidence | diagnostic body or transfer receipt | non-authoritative evidence reference |
| record_assessment | assessment plus verified execution reference | immutable assessment, no acceptance side effect |
| sources | exact selected revision/asset identities | source metadata and native-file material |
| reconcile_work | operation/call and execution locator | observer-verified outcomes/effective usage |
| record_acceptance | exact selection/evidence references, fence | immutable Manager selection/current pointer |
| checkpoint | expected version/fence and bounded state | checkpoint version, not execution fact |
| complete | selected manifest identity, fence | structural/product completion only |
| execution_status | optional operation IDs/cursor | observed execution/limit facts; never scheduling |

Cursors bind owner, production, filter and revision/snapshot. Size accounting includes
encoded binary and JSON overhead. Immutable evidence/retention use scoped idempotency;
attachment/selection reacquire the short fence. Never hold a lease during provider work.
`begin_work` owns dispatch transitions; observers own measured outcomes;
`checkpoint` stores Manager intent. `execution_status` is read-only, replacing
its earlier ambiguous description as a writer of step/time or pause/terminal intent.

Active entitled Manager capabilities permit the corresponding tools, subject to
locks/limits. At the ceiling, new paid dispatch is blocked but read, retention,
attachment and reconciliation remain available. Cancellation/expiry/refund recovery
uses the restricted trusted path in A12, not a revived Manager capability.

### A05-A07 - Admission and crash recovery

Persist the admission input hash and deterministic book/order/production/workflow/job
identities in idempotency receipts before advancing. Use existing service transactions,
not one database transaction spanning provider calls.

| Intent | Ordered sequence |
| --- | --- |
| create | validate confirmed consumption-product quote/capacity; create/reuse book; queue order; create production; start consumption; enqueue bound Manager |
| continue | inspect/resume existing valid parent, otherwise verify termination and release; continue consumption; enqueue successor sharing production/checkpoint/accounting |
| revise | validate scope/locks; obtain and confirm existing revision quote/allocation; start revision; enqueue bound Manager |

`queueConsumption` calls admission before order insertion; that callback validates
eligibility and must not create the production. Production creation follows the
committed queued order. Revalidate quote/capacity before charging. Changed quotes
require refreshed confirmation. Queued unstarted cancellation stays free. Failure
after debit retries enqueue with the same IDs, never another charge. Deliberately
abandoned unbound work uses `abandonUnboundWorkflow`; bound work uses verified
termination/release. No automatic refund or changed customer-rights policy is added.

| Observed state | Recovery |
| --- | --- |
| Parent running/paused | reconnect/resume that parent |
| Parent lost/unobservable | reconcile; no competing successor |
| Parent verified terminal | release, then admit successor |
| Operator-resolved parent | existing audited resolution/release rules |
| Child unknown | preserve uncertainty; independent work may continue under the same parent |
| Generation succeeded, retention failed | retry retention/attachment only |

Paid-call sequence is `registered -> dispatching -> succeeded | failed | unknown`.
Durably mark `dispatching` before invoking any provider-capable node. Lost
acknowledgement thereafter is unknown, not permission to replay. Repeated dispatch
requests return existing state without authorizing another call. Registration alone
is not proof of a paid call. Proven adapter rejection before provider dispatch may
become `not_dispatched`. Track item outcomes separately, retain partial successful
outputs, and allow verified late evidence to resolve unknown without overwriting
conflicts. A stale checkpoint cannot roll execution state backwards.

Recovery reuses three existing mechanisms with different responsibilities:
`ai/worker.ts` recovers saved terminal execution evidence without redispatch;
booklet media retention/attachment retries preserve existing call/output identities;
`domain-results.ts` and the Run `retry-application` command apply saved successful
results. The latter is not a partial-work recovery queue: it requires a succeeded job,
and application is queued only for a successful Run result. Partial booklet work stays
in retained artifacts and Manager checkpoints. Manager's idempotent `complete` tool
does not become implicit in Run application, and neither path regenerates content.

Prepare bounded external reads and downloads outside MongoDB transactions; commit
short fenced writes with fresh authorization. Preserve existing immutable-byte caches
and their fresh access checks. Keep provider execution, observation and application
budgets separate; verify nested Dify deadlines accommodate the selected provider call
and packaging. Do not increase every timeout or add a second recovery scheduler.

### A08-A09 - Trusted receipts and effective usage

The selected channel is deterministic adapter receipt -> child system execution IDs
-> Manager Workflow Tool output -> Unitale server observer -> measurement/assessment.
The observer corroborates the actual Manager node execution against its pinned graph,
input hash, tool binding and receipt. It never dispatches a child or accepts an LLM's
claimed usage. Dify [node response fields](https://raw.githubusercontent.com/langgenius/dify/1.17.1/api/fields/workflow_run_fields.py)
include inputs, outputs, execution metadata and truncation flags; E1/E3 must verify
the deployed response and selectors. Missing/truncated data stays unverified.

Receipt delivery is not guaranteed before native-file storage succeeds. If Dify loses
the receipt and output after possible provider dispatch, preserve durable dispatch
intent and classify the unavailable execution evidence as unknown. Never infer zero
cost, authorize replay or invent an original. Persist any independently verified
receipt even if retention fails; retry retention only while the original is available.
Known execution remains known when only retention is uncertain. Later trusted evidence
may reconcile the record; independent work follows existing Manager/ceiling policy.
The first package does not guarantee recovery of bytes or usage Dify never durably exposed.
Do not add a Dify-local receipt store, spool, file-storage plugin or child callback.
Checkpoint 02 fault probes prove safe classification/no replay, not guaranteed receipt survival.

Booklet attempt IDs remain distinct from logical Run IDs used by execution evidence.
Retain both plus observed parent node and child workflow/run identities. Provider
request IDs may be null. Authoritative assessment storage requires matching input/
output evidence and the measured reviewer call; diagnostics alone cannot establish it.
Redact credentials, private context, signed URLs and opaque provider reasoning.

Stable call key is production + operation + call ID. Keep append-only observations
and one effective amount per call. Actual provider-reported cost supersedes an estimate;
provider token usage with calculated pricing is still a versioned estimate. Identical
evidence is a no-op. Conflicting actual values require reconciliation: use the larger
amount once for the safeguard until resolved, never sum both. Parent summaries remain
diagnostic when leaf calls are counted. Missing cost is unknown; currencies are never
silently added or converted. Estimate basis/pricing revision is snapshotted; improved
usage can refine that estimate without silently choosing a new price table.

Late observations have their own execution-evidence operation lifecycle linked to
the original call, so closed creative work need not reopen. Persist observation and
projection idempotently before closing that evidence operation; unresolved execution
retains its existing holds. Trusted observations count Manager/Reviewer/text/image
calls and workflow steps. Active seconds are the union of active parent intervals
across attempts, excluding recorded human waits/pauses; do not add child duration again.
Unknown boundaries remain unresolved. Reconcile at each Manager iteration/dispatch;
limits are safeguards, not atomic provider-spend reservations.

### A10-A12 - Corrections, revalidation and retention

Chain key: production, stable target, work family and customer allocation (if any).
The policy snapshot retains three text/request corrections and one image correction
after the initial attempt. Increment on durable dispatch intent, then release the
increment only on trusted proof that no provider dispatch occurred.

| Event | Counter treatment |
| --- | --- |
| Initial execution | initial attempt |
| Text / prepared-request / image correction | increment the corresponding counter |
| Review only | no correction increment |
| Proven pre-provider rejection | no correction consumed |
| Provider refusal or invalid output | attempted call consumed |
| Unknown | consumed pending proof; no blind replay |
| New candidate/resume/split/merge | preserve existing target chain |
| Confirmed new customer revision | new allocation-bound chain |

One grouped call increments each affected target once; multiple outputs from that
call do not multiply the increment, additional calls do. Manager selects affected
targets; app checks existing chains/funding/limits, not semantic creative impact.

Revalidation creates a new immutable same-artifact revision with identical content
and asset hashes, explicit new sources, `revalidatedFrom`, reason/evidence and
new Manager acceptance. Changed creative content is not revalidation. Preserve product
locks; locked creative changes follow existing new-production rules where required.
Revalidation cannot erase a lock, reset allowances or reuse an inapplicable assessment.
Check ownership, source identity/freshness, acyclicity and the existing bounded
source traversal. For example, unchanged page pixels may gain a new source binding
only through explicit Manager revalidation; changed dialogue requires manuscript and
page revisions, not relabelling old pixels as a content-identical correction.

After cancellation/expiry/refund, trusted recovery may retain/reconcile outputs only
for recorded prior dispatches. It may not generate, select new creative results or
complete a production without entitlement. Revoked Manager capabilities stay revoked;
server recovery observes the recorded Manager execution and uses operation-scoped
retention rights. Existing owner-visible history, deletion/recovery rules and holds
remain. No new customer entitlement or paid-call authority is created by retention.

### A15-A16 - Immutable suite bindings and provenance

Use suite-specific app/tool identities with explicit published-version bindings.
Never update a tool registration used by accepted work in place. Dify's
[Workflow Tool provider](https://raw.githubusercontent.com/langgenius/dify/1.17.1/api/core/tools/workflow_as_tool/provider.py)
passes the stored workflow version into execution; a mutable registration still needs
operational protection. Check effective bindings at registration, admission and resume.
Missing/changed bindings block paid dispatch rather than falling back to latest.

Publish children, create versioned tools, compose Manager, then register. Rollback
changes new-admission selection and preserves old resources for accepted/unresolved
work. The manifest uses explicit package/contract versions, source commit/path/hash
entries, seven role/app/publication/tool/schema bindings, plugin package/build hashes,
configuration/policy snapshots and evidence IDs. IDs/hashes are strings; versions and
limits are integers; monetary values are decimal strings. Unknown deployment IDs stay
absent in authoring metadata, not fabricated published identities.

Hash raw exported files separately from canonical graph/features/non-secret
configuration projections. Record each redacted field path; exclude secret values,
private context, user artifacts and signed URLs. Distinguish authoring source,
candidate exports and publication-matched exports; bind prompts to source selectors
and current graph nodes. Exact build/export hashes are execution outputs, not values
to invent during documentation.

### A17-A18 - Manager control and Reviewer coverage

Initial serial loop maximum is 64 actions per attempt. Checkpoint and return partial
before exhaustion. This is a versioned Manager setting, not a service/app one-call rule.
Action union: `invoke | review | repair | revalidate | accept | ask | pause | complete`.
Each variant has explicit target IDs and its typed payload; no arbitrary tool names or
application endpoints. Manager reasoning is registered paid work before the LLM node.

Deterministic order: prevent new paid work on cancellation/expiry/limits; reconcile
and retain available outputs; resolve authentic human responses; repair stale/invalid
prerequisites or pause; perform the selected action; complete only after Manager
policy and structural requirements. Review precedes acceptance/downstream use.
Mandatory exact-request image preflight, actual-pixel review and whole-book review
remain Manager policy. Ask only when needed or explicitly requested; group questions.
An inconclusive result seeks evidence or pauses, not automatic regeneration.

Checkpoint: version, suite/policy hashes, intent, selected revision/acceptance IDs,
pending work/human IDs and chain references, bounded to 64 KiB with history cursors.
It never contains full history or app-interpreted scheduling instructions. Operational
records win on disagreement. Persist around dispatch/result retention and human waits.

Reuse is keyed by stable production/operation/call identity, not input hash alone.
Manager may deliberately register a new candidate with identical inputs under the
existing allowances and durable correction chain; changing candidate/call IDs cannot
reset those limits or disguise replay of an uncertain call. Keep a small checkpoint
marker for the last attempted action, its relevant target/source state and outcome.
If Manager repeats an ineffective action with no relevant state change, checkpoint
and return partial with a recovery reason. Pending observation and intentional new
candidates are not accidental repetition. Proven pre-provider preparation failures
consume no creative correction; a possibly dispatched call retains its counter until
trusted non-dispatch evidence. Keep the 64-action bound; add no retry engine or
mandatory human checkpoint, and do not let the app choose creative next actions.

Supply each service only its task, exact required text, current relevant sources and
applicable findings. Use bounded projections and paginated history/section reads, not
full historical prompts or proof records. Acknowledgements carry identities/status,
not duplicate documents. Measure serialized transport bytes (including escaping and
base64) separately from model input/output budgets. Reject insufficient capacity
explicitly rather than truncate. This does not expand mandatory creative fields.

Reviewer assessments bind exact targets/request/sources, reviewer/policy publication,
coverage, findings, limitations and measured execution. Display precedence is blocked,
repair, inconclusive, pass; completeness is independently required. Advisory findings
are not confirmed defects. Changed relevant sources/settings invalidate applicability;
old reports remain historical. No pass covers omitted pixels, text spans or criteria.

Whole-book windows contain up to four consecutive pages with one-page overlap. Add
explicit comparisons between consecutive appearances of recurring subjects and between
the first and each later appearance; deduplicate identical pairs. Supply actual pages
and relevant reference pixels for every comparison. The coverage certificate lists
all required pages, text spans and continuity comparisons with their assessment IDs.
Aggregation cannot claim unseen-image inspection. Calibration fixtures include exact
lettering defects, identity drift, missing pixels, unresolved ambiguity, advisory-only
findings and corrected targets with regression checks; expected Manager action is part
of each fixture, not an arbitrary quality score.

Validate complete target/source/asset relationships, not separate ID allowlists.
Distinguish inherited context from editable content and cover requirements from story
page requirements; a title-only cover must not acquire a dialogue requirement from
another artifact. Compare actual retained image dimensions to the approved request
and per-kind canvas. Reviewer prose cannot override measurable mismatches or claim
coverage of unseen artifacts. Record clean acceptance journeys separately from runs
that succeeded after repair or recovery.

### A19-A20 - Human correlation and minimal upstream seams

Human correlation is request ID + attempt ID + presentation hash + displayed revision
IDs. Put it in validated native-form UI metadata and bind it to the observed Dify
form/node plus existing `runDecisions`. The first valid authenticated submission
wins; identical retries return it, changed retries conflict. Changed targets are stale.
Manager reads the authentic stored response; interpretation never replaces the record.

Use versioned booklet cards carrying production/request/revision IDs with authorized
paged content/media resolvers. Read cursors bind immutable displayed revisions. Keep
raw response at 4,000 characters and financial confirmation separate. Pending shows
response controls; submitted shows the recorded response; reconciling offers safe
recovery without regeneration; stale loads the replacement request; exhausted shows
findings and permitted continuation/revision paths. No new creator workspace.

Minimal reusable Unibase delta: optional versioned domain hooks for pre-dispatch
binding validation, verified execution observations, domain-aware commands and decision
correlation; client registration for domain admission/detail/cards; bounded MCP image
content; restricted downloader extraction; bounded execution-observation/measurement
linkage. Registry key remains adapter ID/version, duplicates rejected. Generic domains
retain current behavior when hooks are absent. Call hooks from the existing dispatcher,
verified event/recovery path, Run command handler and decision validation respectively;
perform external observation outside MongoDB transactions and persist idempotently.

Unitale owns booklet admission endpoints, card/media resolvers and these domain
implementations. No copied-core patch, generic creative scheduler, new dispatcher or
new billing engine. Exact upstream commit identity is later reviewed-import evidence.

### A21-A22 - Actual-export verification and configuration ownership

The v2 harness reads the seven delivered candidate/current DSL files, inspects their
selectors and runs their actual Code-node logic against expected fixtures. Existing
self-generated v1 graphs remain labelled regression tests. Test JSON-string carriers
as strings, native files separately, and preserve engine/paid-quality evidence as
separate gates. Every operation/revision intent and cross-cutting failure below needs
an expected result/control decision, including provider-independent replacement.

| Configuration owner | Values and snapshot rule |
| --- | --- |
| Product | explicit purchased counts, canvas pixels, languages, allowances, entitlement and execution capacities; frozen at admission |
| Manager policy | optional human checkpoints, review policy, three/one correction defaults, 64-action attempt bound; versioned and preserved across continuation |
| Dify provider | reference model/settings, 120/270-second text/image deadlines, zero retries; slot/configuration binding snapshot |
| Unitale | auth, identity, structural checks, per-production usage safeguard and retention; accepted terms remain stable |
| Operator | actual environment/app/tool/plugin identities, credentials and numeric paid-test caps; verified before activation |

Checkpoint 02 live probes are disposable, provisional and separately authorized. Repeat file,
receipt, child-binding and human
correlation checks against 11/12's final integration. Test the smallest/largest enabled
package and maximum configured references; no invented launch package, limit or budget.
An acceptance request must name target operations, exact fixtures/settings, numeric
money/call caps and stop/pass criteria. Stop paid replay of unknown items; independent
work remains subject to remaining approved scope. Preserve E1-E6 until evidence exists.

## Validation requirements

These acceptance requirements will be implemented and verified through the delivery
plan's 01-12 checkpoints. Documentation/planning authority does not authorize execution.

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

The selected design resolutions are recorded above; executable schemas and
target-runtime proof remain deliverables.
Human checkpoint policy and initial model-selection approach are settled above.
Remaining technical evidence: compatible execution and usage reporting, native file bridge, actual
Workflow Tool shapes, Human Input/loop composition and effective publication pinning.
No live probe or installed-plugin mutation is authorized in this session. Record any
failed capability as a concrete dependency rather than fabricating a working DSL.

The candidate package can be authored after package implementation authorization,
using package-local contracts and fixture app responses. Checkpoints 01-06 may finish
without application implementation or live acceptance, but must disclose unresolved
deployment bindings. Final executable target bindings still need the configuration/
probe evidence above; known incompatibilities must be resolved, not hidden. App updates
in 07-11 remain necessary for the integrated journey. Candidate completion at 06 is not
completion of the issue or permission to start those application changes.

### Remaining evidence gates

| Gate | Concrete evidence needed | Work blocked |
| --- | --- | --- |
| E1 execution and usage | Compatible reference-model tool/adapter, per-call usage evidence and estimates, disabled automatic retries, Manager-mediated results | Runtime compatibility and usage-safeguard verification; no executor-level guarantee required |
| E2 native files | Manager-only byte round trip, identical hashes/order, practical size/rate bounds, expiry/recovery behavior | Final file-node bindings and accepted package capacity |
| E3 composition | Actual child input/result wrapper, observed execution identity, Human Input resume, bounded control and tool publication behavior | Claims that candidate graphs execute correctly on staging |
| E4 app ownership | Unitale staging identity, owned Manager import journal, managed MCP permissions and suite/reviewer bindings | Registration and environment activation |
| E5 acceptance configuration | Exact package/brief/languages/cases, reference-model settings and finite call/money cap | Paid end-to-end acceptance |
| E6 local baseline | Current-source setup/compatibility/typecheck pass; fresh affected checks and separate reviews remain required for new implementation (see delivery plan) | New-code verification claims |

These gates are explicit missing evidence, not unanswered product-preference questions.
Do not mark them passed from inventory or source inspection. Signed grants and
atomic executor claims are explicitly excluded from these evidence requirements.
A16 selects the isolated provider-execution adapter; E1 must prove that candidate on the target.

### Feasibility evidence requirements

The scenarios below define provisional 02 evidence and final 11/12 reruns. Live writes/publications and paid
calls require separate approval; use isolated
apps rather than changing the observed staging app or shared plugins.

| Probe | Procedure | Pass evidence |
| --- | --- | --- |
| Structured child | Publish a deterministic echo child; expose/synchronize its Workflow Tool; invoke it from a parent with two independently identified items | Exact fields and Unicode preserved; effective tool/publication and observed child Run identity recorded; no model required |
| Bounded control | Execute finite iteration over successful/failed item fixtures, then exercise a bounded pause/continuation path | Termination and partial results preserved; no unbounded loop or repeated completed item |
| Human Input | Present existing Run cards with exact request/target IDs; submit once and repeat the same submission request | One authenticated response, same target binding, successful resume and no synthetic approval |
| Files | Round-trip two distinct original PNGs through app MCP image content, native files, child echo and restricted app retention; repeat at the maximum proposed size | Byte hashes, lengths, MIME and reference order identical; measured call/step count and time; failed attachment retries do not invoke generation |
| Publication binding | Capture child/tool binding, change only a disposable child publication and inspect/update its tool | Detection of changed effective binding; accepted/in-flight suite cannot silently switch |
| Usage safeguards | Exercise repeated measurement receipts, estimated then reported cost, ceiling reached during in-flight work and an unknown child alongside independent work | No accounting duplication; estimate replaced; new paid work blocked at ceiling; retention allowed; overage visible; no replay of uncertain item; independent work allowed below ceiling |
| Model compatibility | Separately approve one bounded text call, one image generation/edit path and one actual-pixel review with the selected reference models | Trusted usage/request identities, declared settings honored, original bytes retained and no extra hidden paid calls |

No-money probes can still require live write approval. A proposed
price table or token estimate is not actual cost evidence. Persist a concise report
with timestamps, exact bindings, sanitized inputs/results, checksums and measured
limits. Record failures without changing the requirements to match them.

Package sizes must fit proven limits; do not infer support for arbitrary long books
from pagination. The delivery plan owns the task breakdown.

Environment handoff on 2026-11-08: locked Node dependencies, Python 3.12 and the local
Dify tooling are prepared. Documentation/model-diagram, i18n and skill checks pass;
the existing 11-test compatibility baseline and full typecheck pass outside the sandbox.
The delivery plan owns exact versions, commands and limitations. No new v2 candidate
or deployed Dify compatibility is claimed by this setup evidence.
