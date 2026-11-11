# Booklet native workflow candidate

## Outcome and scope

Seven readable Dify YAML candidates implement the local workflow-first proposal.
Dify/YAML is authoritative: edit workflows in Dify, export without secrets, and review
the YAML diff. No generator, custom Python plugin, bundled runtime, generated schema
inventory or Dify-engine emulator is delivered.

| Role | Dify display name | Candidate |
| --- | --- | --- |
| Manager | Unitale: Booklet Manager | [workflow.yaml](manager/workflow.yaml) |
| Story Planner | Unitale: Story Planner | [workflow.yaml](story-planner/workflow.yaml) |
| Manuscript | Unitale: Manuscript Writer | [workflow.yaml](manuscript/workflow.yaml) |
| Art Director | Unitale: Art Director | [workflow.yaml](art-director/workflow.yaml) |
| Page Composer | Unitale: Page Composer | [workflow.yaml](page-composer/workflow.yaml) |
| Image Executor | Unitale: Image Executor | [workflow.yaml](image-executor/workflow.yaml) |
| Quality Reviewer | Unitale: Quality Reviewer | [workflow.yaml](quality-reviewer/workflow.yaml) |

The handoff owns the [naming and tagging conventions](integration-handoff.md#naming-and-tagging-conventions),
including workspace tags to apply during a future authorized import.

The [specification](../workflow-package-spec.md) owns accepted behavior. The
[integration handoff](integration-handoff.md) defines the proposed application boundary,
configuration/bindings, failure handling and target probes. Application storage and
shared-runtime integration are implemented separately in 07-08; v2 runtime registration
remains 09. Existing Dify apps and shared plugins were preserved during disposable probes.

## Configuration and limits

All model execution defaults to disabled through `execution_ready=false`. Prepare is
unpaid and can run independently. Manager's managed MCP and six Workflow Tool provider
IDs contain explicit `BINDING_REQUIRED` slots. Disposable copies have passed import
and semantic graph readback; these are not integrated or paid-accepted publications.
The empty DSL dependency
arrays do not mean dependency-free: reuse/configure and verify the installed providers
listed in the manifest before an authorized import, then export their real identifiers.
No package hashes or installation identities are invented here.

The installed shared text dev7/image dev3 providers are selected in the manifest.
The user accepts their automatic SDK retries, existing network timeout and Sunburst
alias under the [provider tradeoffs](integration-handoff.md#accepted-provider-tradeoffs).
No provider patch/release/new installation is required. Dify node and Manager retries
remain disabled; SDK attempt counts and complete costs are unknown unless evidenced.
The image candidates omit unsupported retry/timeout configuration fields.

Historical patched-provider probes passed and their disposable resources were removed.
They do not establish execution of the revised shared-provider binding. [Shared-provider import/readback](integration-handoff.md#shared-provider-importreadback-evidence)
now passes for all seven disabled candidates; actual revised-binding execution and
full application integration remain pending.
Activation remains disabled. Scope B for minimal 07-11 implementation is approved;
07 storage and 08 shared-runtime import are complete locally; 09-11 application integration remains. The [approval register](integration-handoff.md#approval-register)
records no tunnel, scope C pending and a future US$3 ceiling (not current spend approval).
The [remaining T18-T21 plan](../implementation-plan.md#remaining-implementation-kickoff-and-ownership)
is being executed under scope B. Its [retry/reconciliation policy](../implementation-plan.md#action-retries-and-automatic-reconciliation)
requires future application and bounded YAML changes with fresh evidence; existing
candidate retries remain disabled. The 09 Manager result-view slice below has fresh hashes.
The retained upstream patch and isolated-build proposal are optional historical evidence.

Local capacities: child JSON 256 KiB; original 8 MiB; one to sixteen explicit creative
items per call; one scoped image call with multiple output slots; whole-book windows
of one to four pages; Manager at most 64 actions; checkpoint 64 KiB and context 128 KiB. These
bounds fail explicitly without truncation. Grouping and capacity are initial workflow
choices, not permanent product or application schema restrictions.

## Verification

From the repository root with Node 24 and locked dependencies:

```powershell
node --conditions=react-server --import tsx --test tests/booklet-compat/*.test.ts
node output/tooling/npm/node_modules/npm/bin/npm-cli.js run typecheck
node output/tooling/npm/node_modules/npm/bin/npm-cli.js run check:docs
node output/tooling/npm/node_modules/npm/bin/npm-cli.js run check:i18n
node output/tooling/npm/node_modules/npm/bin/npm-cli.js run check:skills
node output/tooling/npm/node_modules/npm/bin/npm-cli.js run handbook:ready
```

On this Windows machine run tsx/typecheck/Git helpers outside the sandbox. The new
native-package test reads actual YAML, checks private bindings and executes isolated
Python Code functions. It uses `BOOKLET_PYTHON`, the prepared local runtime if present,
or `python3`. Only Python's standard library is needed; no package/venv is delivered.
The preserved v1 harness remains regression evidence for its own scope.

Local parsing/static checks/pure-function fixtures do not execute a Dify graph or
prove a complete journey, image quality, observed usage or durable native resume.
Do not report mock execution as live evidence. Current results and read-only review
scope are recorded below; review/test evidence from the removed framework is historical.

## Source provenance

[Source selectors](fixtures/source-selectors.json) preserve all 48 published selectors
and their hashes. Six tester selectors are excluded from production; the remaining
material is adapted into role prompts, without fixed personas/counts or callbacks.
Publication commit: `587f1b7775e316f4c58461dd3fda773af6d5dc2e`; extraction commit:
`1d4cc02307edad21aadefc244bcc4e286396b88f`. Two original PNG fixtures and correction
scenarios are retained. The superseded implementation has an ignored recovery archive
at `output/tooling/booklet-before-simplification.zip` with all 356 source hashes verified
before 348 individually inventoried source/generated/test files were removed.

## Current integration slice

Checkpoint 09 preserves the Manager domain outcome as `booklet_result` and returns
an existing sanitized Run UI `result`. Confirmed structural completion becomes success;
unknown/partial outcomes stay partial. Pre-action checkpoint receipts supply the
confirmed fence to action/dispatch arguments, and registration supplies the complete
hash-bound child envelope. Provider bindings and execution switches remain disabled.

Local v2 checkpoint, index, transfer, native reconciliation, creative-text publication,
document/history reads, text-source verification and creative-text registration/dispatch
handlers now exist. Registration binds actual artifact responsibilities while native
child selectors retain subject IDs and grouped revisions. Reviewer intent registration
is now available. Text dispatch checks configured suite identity, current ownership,
locks, funding, attempts and reported cost/execution bounds. Image references, image
dispatch, remaining capabilities and complete recovery integration remain
pending. The [delivery plan](../implementation-plan.md#09---unitale-gateway--recovery)
owns application checks and progress; the package digest below covers only native
YAML, fixtures and their focused compatibility test.
Registered work now retains exact meaningful request bodies and matching native child
results for bounded owned readback after restart. The existing worker transaction
fences retention; it does not authorize publication, retries or another paid call.
The separate publication guard now saves retained creative proposals by reference,
avoiding exact-text copying. Current Manager/funding, scope, sources, locks and product
limits are checked. Images, changed-source revalidation and final acceptance remain
pending, along with native large-body hydration and the remaining runtime integration.

Story Planner now permits a character/location description-only revision without an
unrequested roster proposal. Initial creation still requires its roster; product
capacity, duplicate and revision-scope checks remain. The regression failed against
the prior exported pack node, then passed with the focused fix. No target-environment
import or execution of this revised candidate is claimed.

Manager now uses the existing Run runtime's required private Start `context` text
input, bound directly to MCP `runContext` arguments. The public request limit matches
Run metadata (4,000 characters); authoritative brief/configuration stay in app context.
The regression failed on the prior export and passes through the actual capability
inspector with the supported Start metadata. This isolated binding check does not
prove full registration while the remaining v2 tools and Human Input wiring are pending.

Manager context is now bounded at 128 KiB, independently of the unchanged 64 KiB
checkpoint cap. It preserves the entire checkpoint alongside bounded facts instead
of introducing partial-state merging. Actual Code-node tests cover preservation and
oversize rejection; the application transport fixture uses the existing configurable
MCP limits documented in the handoff. Installed-plugin and remote binding readback
remain distinct pending evidence.

Paid child checkpoints now store references to exact retained work rather than copying
full responses. Fresh work facts must confirm retention before pending intent is
cleared. The real MCP fixture checks exact large-text publication and two successive
checkpoint actions, including lost-reply replay. The latest fixture uses actual
Manager/Manuscript Code nodes, guarded dispatch, native worker retention and exact
revision publication. The package execution switch remains disabled; this is local
boundary verification, not target Dify or provider execution.

Current slice: 41/41 compatibility tests pass (11 preserved v1 and 30 native-package
tests), plus 18 MCP and 30 repository tests. Build, typecheck, scoped test lint, docs/i18n/skills checks and an
independent hash audit pass. A separate same-agent read-only review (cold-review fallback)
found and corrected container-usage normalization through Unibase PR #52; its exact
reviewed merge is imported. Task 09.2 is locally Verified; 09.3 is In progress.
Provider visibility/SDK and target-environment gaps remain accepted, labelled limits.
Current
implementation SHA-256:
`f553145a9fe6fa96a3a056f1085528fc5f91e559e63b774d7f2d092611cd2188`.
The digest uses the existing 13-path algorithm described below; seven YAML files total
241,285 bytes. Earlier 01-06 reviews remain historical, and checkpoint-wide 09 reviews
and application-connected execution remain pending.

## Checkpoint evidence

The following evidence records the historical 01-06 candidate before 09 integration.

Local candidate checkpoints 01-06 are complete under the revised DSL-first plan.
This is not integrated/paid acceptance: E1-E5 remain open, with partial no-money
target evidence recorded below.

| Checkpoint | Verified local outcome | Reviews |
| --- | --- | --- |
| 01 | Minimal consumed boundaries, seven roles, 48-selector provenance and official-provider capability findings | Two clean same-agent read-only passes |
| 02 | Source-pinned official-plugin fixes, isolated installation and actual text/vision/Generate/Edit feasibility; no new runtime adapter | Two clean same-agent read-only passes; application acceptance pending; provider release no longer required |
| 03 | Planner, Manuscript, Art Director and scoped Reviewer native YAML; structured-output configuration, scoped content checks and immutable-fact fixtures | Two clean same-agent read-only passes |
| 04 | Page Composer, deterministic Prepare/Generate candidate and all six Reviewer modes; exact text/source/coverage, partial and unknown fixtures | Two clean same-agent read-only passes; generated pixels and application-native transport pending |
| 05 | Bounded native serial Manager, direct private MCP binding, explicit children, checkpoint/preflight/correction/unknown guards and actual presentation binding | Two clean same-agent read-only passes; integrated Manager journeys/durable continuation pending |
| 06 | Seven hashed candidates, configuration/binding manifest, integration handoff and current local evidence | Two clean integrated same-agent read-only passes against 713da2d |

Final affected suite: **34/34 pass** (11 preserved v1 tests and 23 native-package tests).
Full typecheck, scoped test-file ESLint, check:docs, check:i18n and check:skills pass.
handbook:ready exits successfully with pre-existing advisory tracking/preferences
warnings; no project configuration was changed. No application build was needed
because application/runtime/dependency inputs are unchanged. Before staging authorization,
automatic approval review rejected external source transmission, so only local checks
were used. Subsequently authorized connector/import/runtime results are recorded below.

Reviewed implementation SHA-256: `1cef1f643dd8a043a46eb52fb74c88a8978127de21d8b0a3f369405467e18df3`.
Identity covers seven YAML files, five fixtures and the new test file: sort repository-
relative paths, concatenate each path + NUL + its lowercase SHA-256 + LF, then SHA-256
the concatenation. Documentation and manifest evidence fields are outside this digest.
The manifest separately records every workflow/fixture hash. YAML totals 236,584 bytes.

Reviews are separate same-agent cold-review fallbacks, not independent-agent reviews.
Both cover all six checkpoint scopes and the complete integrated change: first behavior,
private boundaries, source/request identity, checkpoint/correction/partial handling;
second native graph/bindings, source provenance, retained v1 scope, necessity/simplicity,
configuration, handoff and evidence accuracy. The full-package follow-up review fixed
loss of saved Manager intent, an untrusted result fence overriding authoritative context,
unchecked additional pagination proposals/page roles/duplicate panel IDs, absent image
handles passing validation, and a preflight target differing from its prepared hash.
Regression coverage now uses the application's existing canonical hash implementation.
Stale PRD/custom-plugin and per-role README instructions were reconciled. Two fresh
clean same-agent read-only passes cover the corrected implementation above; prior
31-test results and earlier review identities are historical, not current evidence.
Authorized Dify probes subsequently found and fixed the Human Input delivery UUID and
ambiguous unquoted `yes` branch scalars. Both have focused regressions; fresh read-only
review passes apply to the corrected digest above.

Handbook: `D:/misc/code/uniwares/handbook` at
`0048c32a98060bb094eb3010aa0f4f407e97796e`, explicitly refreshed for this session.

The compact-name update changes only the seven quoted `app.name` values; prompts,
graphs, contracts, bindings and disabled execution gates are unchanged. The naming/tag
conventions are documented in the handoff; tags have not been applied live. Fresh
validation passes: 34/34 compatibility tests, check:docs, check:i18n, check:skills,
workflow/fixture hash audit and git diff --check. Two separate same-agent read-only
passes found no actionable issues. Those naming reviews cover the preceding
display-only candidate; the current
digest also includes the provider-tradeoff amendment. Prior live probes exercised
the isolated patched-provider binding. Model/persistence documentation was unaffected
by that display-only change.

Provider feasibility passed for the isolated candidate; see the
[current provider handoff](integration-handoff.md#paid-provider-feasibility-results).
Checkpoint 09 is the current implementation step under approved scope B. Keep live
activation disabled pending scope C and application acceptance.
This naming/documentation update includes no application changes or paid calls.

For the ordered remaining work and prerequisites, follow the
[next-step runbook](integration-handoff.md#next-step-runbook).

### Provider-tradeoff amendment verification

The accepted SDK retry/default-timeout/alias amendment uses the installed shared
providers. Image nodes omit unavailable transport controls; the existing focused
fixture verifies the alias survives Prepare/Generate validation unchanged. All 34
compatibility tests, full typecheck, scoped test ESLint, check:docs, check:i18n,
check:skills and the workflow/fixture/digest audit pass. Two separate same-agent
read-only passes cover the amended candidate and handoff; no blocking issue remains
in this local scope. Subsequent disposable shared-provider imports/readbacks pass as recorded in the
handoff, with verified cleanup. No paid call or checkpoint 07 implementation was
performed. Admin retry reporting and direct provider-status reconciliation are
handoff requirements/future improvements, not implemented application capabilities.

## Historical no-money staging evidence

Observed on 2026-11-09 at `https://dify.uniwares.co.uk`, workspace
`ffac910f-2786-490e-90d8-07243d49741b`, before the subsequent provider and naming fixes.
The table records that earlier probe scope, not the current provider status; later
provider results and remaining gates are consolidated in the handoff linked above.
Only disposable `unitale10_compat_20261109_*` apps/tools were written. These probes
exercise Dify itself; they do not establish Unitale integration or provider quality.

| Probe | Observed result | Boundary of proof |
| --- | --- | --- |
| Installed providers | `openai` 1.0.7-dev7 (`aa245c63…5eba2`) and `openai_tool` 0.2.2-dev3 (`8a7f865a…60f05`); full identifiers below | Patched experiment packages, not the official release versions inspected earlier |
| Text model catalog | `gpt-6-luna` and `gpt-6-sol` active with vision/structured-output advertised | No provider call, credentials validity or effective settings proved |
| Seven candidate imports | All imported; node/edge readback matches, corrected Manager separately reimported; execution remains false | Server reports DSL 0.7.0, candidate 0.6.0 accepted with version warning; exact deployed build version unresolved |
| Echo + Workflow Tool | Publication, export/import and parent-to-child JSON wrapper succeeded; Unicode/whitespace retained | Run `538c476e-0253-49af-97e6-323b1ed25172`; deterministic child only |
| Ordered originals | Two native PNGs passed parent/child/output and downloaded byte-for-byte unchanged; 24,041/24,039 bytes, hashes match retained fixtures | Run `5adab356-2a90-4938-9c92-aecd9a103b85`; no application MCP/retention, 8 MiB capacity or expiry proof |
| Native serial control | Loop/Assigner performed two child calls and stopped at count 2 | Run `6976166f-0725-43bc-a233-92ef9aecfeb0`; no full Manager journey |
| Native failure branch | Intentional Code failure routed to explicit unknown result; workflow partial-succeeded, one exception | Run `11c049a0-474c-471b-8d1e-5f8973e0b97c`; no provider failure simulated |
| Human Input | Native pause, actual Console form submission and successful resume under the same run ID | Run `26803273-6a73-4d92-bd60-02c8515ae65d`; no authenticated Unitale response/continuation proof |
| Publication synchronization | After child republication, Workflow Tool reported synced=false; explicit refresh restored true | Manager publication does not independently pin an unchanged child tool |

Installed identifiers:

- `langgenius/openai:1.0.7-dev7@aa245c63d95bee61fbd250e86b5ab7da4accec08144e075e4a4d8dd94bf5eba2`
- `langgenius/openai_tool:0.2.2-dev3@8a7f865a47ce9e25260bd7d7cade70d4712506d945a7a2a66607f9f324160f05`

The [installed-source audit](integration-handoff.md#installed-provider-no-money-audit)
matches both original archives to the live installed hashes. Mocked calls confirm
three SDK attempts on retryable failures in the ordinary text and image paths,
ignored timeout controls, dated-image-model rejection and incompatible legacy
carrier/callback paths. These differences are now explicitly accepted under the provider tradeoffs.
No shared plugin was changed.
The [provider path assessment](integration-handoff.md#supported-provider-path-assessment)
records the subsequent official-source and existing-plugin investigation, including
the text-provider retry gap and the historical optional upstream remedy.
The prepared connector also has gaps: its Loop validator rejects self-variable break
conditions that Dify executes, updating an existing draft sends an unsupported empty
environment_variables field, and its Human Input submit endpoint only simulates form
outputs. Source-verified prepared Console client calls and disposable DSL imports
established the native results above. OpenAPI run/form attempts returned HTTP 500;
they do not prove that Dify lacks Human Input. An initial file-run stream failure was
inspected before a deterministic retry. No paid execution occurred.

At this earlier probe stage, provider execution/settings/retries/usage, realistic
native-file capacity and expiry, real Manager journeys, owned Unitale registration/
observations, authenticated UI and durable recovery, and finite paid acceptance were
unverified. Subsequent provider feasibility evidence does not close E1-E5 as a whole.

Cleanup readback: all 15 disposable apps and their one Workflow Tool were deleted;
the original 32 app IDs/names/update timestamps and installed plugin identifiers are
unchanged. Two nonsensitive fixture uploads remain under Dify retention because the
prepared tools and inspected Console/service upload APIs expose no file-delete action:
`6e5ccd9f-0d73-4e66-9099-459c7cb53fe1` (original-a) and
`1205f691-e853-4010-90db-fbc206aa9310` (original-b). Their physical removal is unverified;
no host/storage mutation or shared-plugin change was attempted. Probe apps/runs were
deleted after observation, so the run IDs above are historical evidence locators.
