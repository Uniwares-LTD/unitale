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
shared-runtime integration are implemented in 07-08; v2 runtime registration and
local connected journeys are verified through 09.6, with final 09.7 review complete locally. Existing Dify apps and shared plugins were preserved during disposable probes.

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
No provider patch/release/new installation is required. Blanket Dify node retries
remain disabled; guarded application action retries are locally fixture-tested; SDK attempt counts and complete costs are unknown unless evidenced.
The image candidates omit unsupported retry/timeout configuration fields.

Historical patched-provider probes passed and their disposable resources were removed.
They do not establish execution of the revised shared-provider binding. [Shared-provider import/readback](integration-handoff.md#shared-provider-importreadback-evidence)
now passes for all seven disabled candidates; actual revised-binding execution and
full application integration remain pending.
Activation remains disabled. Scope B for minimal 07-11 implementation is approved;
07-08 and 09.1-09.6 are locally verified; 09.7 is locally complete; 10 creator UI and 11 validation remain. The [approval register](integration-handoff.md#approval-register)
records no tunnel, scope C pending and a future US$3 ceiling (not current spend approval).
The [remaining T18-T21 plan](../implementation-plan.md#remaining-implementation-kickoff-and-ownership)
is being executed under scope B. Its [retry/reconciliation policy](../implementation-plan.md#action-retries-and-automatic-reconciliation)
has local application/native-wait evidence described below. Target execution remains
pending and all execution gates stay disabled. Current candidate hashes are below.
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

The [delivery map](../implementation-plan.md#issue-10-deliverables-and-dependency-map)
records application progress through the conversation checkpoint and the remaining
integration and staging work.
The [delivery plan](../implementation-plan.md#09---unitale-gateway--recovery)
owns exit conditions and application evidence. This summary supersedes earlier slice
counts and pending claims; historical reviews below apply only to their recorded state.

The v2 gateway supplies the sixteen Manager capabilities through actual owned,
fenced handlers. Native Code fixtures cover private Start context, hash-bound
registration/dispatch, large exact-text publication, all six assessment modes,
image preparation/preflight, independently retained originals, immutable revalidation,
authentic human-response correlation, Manager acceptance and selected-manifest
structural completion. Checkpoints retain compact references to authoritative work;
owned histories page beyond previews. Existing v1 behavior remains covered.

Recovery uses existing Run/commerce/worker services: durable action allowances and
eligibility, one journaled extra retry grant after exhaustion, verified-terminal
continuation without another purchase, and bounded accepted-work reconciliation.
A registered retry's native `retry-wait` is resumed by the application when due,
without a creator question, paid polling, another scheduler or an automatic successor.
Creator questions remain separate. Unknown outcomes and unisolatable paid failures
stop deterministically for reconciliation; successful siblings are preserved.

Current checks: **46 compatibility tests** (11 preserved v1 and 35 native), **32 MCP**
and **38 repository tests** pass, plus production build, post-build typecheck,
scoped ESLint, model generation, docs/i18n/skills checks and hash/disabled-gate audit.
Two consecutive clean same-agent read-only whole-package review passes found no
blocking issue at their recorded state; the subsequent reference-funding correction has
fresh focused checks and two read-only passes. Identities and scope are in the [09.7 exit evidence](../implementation-plan.md#097-exit-evidence). The final regression batch also passes 17 lifecycle/media, 31 commerce and 58
generic Run/AI/Dify/MCP tests. Handbook readiness retains pre-existing advisory
tracking/preferences warnings; configuration is unchanged.

These are local handler/worker and isolated YAML Code boundaries with fake providers,
not execution of a Dify graph. The connected Page Composer fixture now publishes
pagination and composition from the retained large Unicode manuscript, and completion
uses that published layout. A separate five-page journey now creates all artifacts
through handlers, including style sample and page originals, then completes across
two whole-book review windows. Its actual prepaid continuation after failed or successful Manager termination
preserves completed work and adds no charge. Failed predecessors retain the logical
Run chain; a successful Manager stop starts a new logical Run on the same production. Checkout, native start/termination, specialist replies and
pixels are synthetic; no artifact/assessment/acceptance/completion state is staged in
that journey. The older structural fixture still stages page metadata. Purchased
revision now also passes through quote/consent, a new logical Run, scoped composition/
generation/review and completion. It records one five-credit fixture revision charge,
preserves the other pages and keeps the previous manifest/original immutable.
Predecessor reuse now passes the connected local journey through exact revalidation,
original storage attachments, inherited compatible body-review provenance and fresh
whole-book coverage. Imported-image context revalidation preserves exact pixels
without inventing producer work. Negative source/asset/canvas checks and the 09.6
local exit audit and final 09.7 reviews pass.
Safe technical failure evidence is explicit in fixtures, not inferred from a provider
error. Hidden SDK attempts/costs and unproved target failure classification remain
accepted limitations; no provider controls or telemetry framework is added. Revised
Dify wait/form readback and original-image conversion remain checkpoint 12 evidence.
The UI for explicit retry, continuation and owned histories remains checkpoint 10.

The managed MCP/tool publication slots and execution gates remain disabled. Activate
only after both web and AI worker use the matching v2 domain registration and the
separately authorized target checks pass. No deployment or paid call is claimed.

Current implementation SHA-256:
`b10028f3205c200e78bae889767cfdfafebc03ad1b51cb540e0cb0268a9cae70`.
The existing 13-path algorithm described below covers native YAML, five fixtures and
the compatibility test; application code and documentation are outside that digest.
Seven YAML files total 253,664 bytes.

Checkpoint 10C.3 adds typed conversation turns to the Manager's existing native
Human Input path. The Manager sends each new question or approval in
`request_human.turn`, renders the form retained by Unitale, and reads authenticated
responses through `human_response`. Compatibility coverage runs the real Manager
Code nodes for the typed request, refreshed fence, retained form and legacy reply.
The six specialist YAML files have the same hashes as before 10C.3. Target import
and execution of this revision remain pending.

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

Checkpoint 09 closure follow-up passes 38 repository and 32 MCP tests, including
dispatch-established revision locks, unresolved-target protection across funding scopes
and JSON-safe lock readback. The [prerequisite report](../implementation-plan.md#checkpoint-10-prerequisite-report)
records readiness for local 10.1; no manual setup is currently required. Checkpoint 10
is unimplemented; live acceptance remains gated at 12.

Current pre-10 readiness and authenticated theme evidence are consolidated in the
[2026-11-22 closeout](../implementation-plan.md#pre-10-readiness-closeout-2026-11-22).
Local 10.1 needs only a subsequent start instruction; live operator inputs remain at 12.
