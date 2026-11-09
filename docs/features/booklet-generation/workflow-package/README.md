# Booklet native workflow candidate

## Outcome and scope

Seven readable Dify YAML candidates implement the local workflow-first proposal.
Dify/YAML is authoritative: edit workflows in Dify, export without secrets, and review
the YAML diff. No generator, custom Python plugin, bundled runtime, generated schema
inventory or Dify-engine emulator is delivered.

| Role | Candidate |
| --- | --- |
| Manager | [workflow.yaml](manager/workflow.yaml) |
| Story Planner | [workflow.yaml](story-planner/workflow.yaml) |
| Manuscript | [workflow.yaml](manuscript/workflow.yaml) |
| Art Director | [workflow.yaml](art-director/workflow.yaml) |
| Page Composer | [workflow.yaml](page-composer/workflow.yaml) |
| Image Executor | [workflow.yaml](image-executor/workflow.yaml) |
| Quality Reviewer | [workflow.yaml](quality-reviewer/workflow.yaml) |

The [specification](../workflow-package-spec.md) owns accepted behavior. The
[integration handoff](integration-handoff.md) defines the proposed application boundary,
configuration/bindings, failure handling and target probes. Application schemas,
registrations and migrations are unchanged; existing Dify apps and shared plugins
were preserved during the disposable probes.

## Configuration and limits

All model execution defaults to disabled through `execution_ready=false`. Prepare is
unpaid and can run independently. Manager's managed MCP and six Workflow Tool provider
IDs contain explicit `BINDING_REQUIRED` slots. Disposable copies have passed import
and semantic graph readback; these are not integrated or paid-accepted publications.
The empty DSL dependency
arrays do not mean dependency-free: install/configure and pin the official plugins
listed in the manifest before an authorized import, then export their real identifiers.
No package hashes or installation identities are invented here.

The unmodified upstream base tools omitted SDK retry controls and rejected the
accepted dated Sunburst model. Disabling Dify node retries cannot fix those gaps.
An [offline-tested upstream patch](integration-handoff.md#prepared-upstream-patch)
is submitted in upstream PR #4238. Test-only namespaced copies passed installation,
configuration and provider probes, then were removed at handoff. Shared experiment plugins remain
unchanged. [Current target evidence and probe limits](integration-handoff.md#isolated-target-compatibility-progress)
record successful paid feasibility probes, the two corrected native structured-output
defects, US$1 cap and cleanup inventory. Full application integration remains pending.
Activation remains blocked; do not silently use an unversioned alias or
reintroduce a custom production plugin. Full suite acceptance, application MCP wrappers,
trusted observations and integrated journeys remain pending. Native Loop/Assigner,
child wrappers, file transport and Human Input evidence is recorded below.

Local capacities: child JSON 256 KiB; original 8 MiB; one to sixteen explicit creative
items per call; one scoped image call with multiple output slots; whole-book windows
of one to four pages; Manager at most 64 actions; checkpoint/context 64 KiB. These
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

## Checkpoint evidence

Local candidate checkpoints 01-06 are complete under the revised DSL-first plan.
This is not integrated/paid acceptance: E1-E5 remain open, with partial no-money
target evidence recorded below.

| Checkpoint | Verified local outcome | Reviews |
| --- | --- | --- |
| 01 | Minimal consumed boundaries, seven roles, 48-selector provenance and official-provider capability findings | Two clean same-agent read-only passes |
| 02 | Source-pinned official-plugin fixes, isolated installation and actual text/vision/Generate/Edit feasibility; no new runtime adapter | Two clean same-agent read-only passes; release and application acceptance pending |
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

Reviewed implementation SHA-256: `42e6cfbc2b42f499b649babb2ca0ca9f5b31e036c8f00797fcb7208875715b64`.
Identity covers seven YAML files, five fixtures and the new test file: sort repository-
relative paths, concatenate each path + NUL + its lowercase SHA-256 + LF, then SHA-256
the concatenation. Documentation and manifest evidence fields are outside this digest.
The manifest separately records every workflow/fixture hash. YAML totals 236,894 bytes.

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

Next, follow the compatibility procedure before relying on target bindings; checkpoint
07 remains the application authorization gate. Keep activation disabled. No application
changes or paid calls are included. Candidate commit/push and issue
progress publication were separately authorized on 2026-11-09.

For the ordered remaining work and prerequisites, follow the
[next-step runbook](integration-handoff.md#next-step-runbook).

## Authorized no-money staging evidence

Observed on 2026-11-09 at `https://dify.uniwares.co.uk`, workspace
`ffac910f-2786-490e-90d8-07243d49741b`, against the corrected package identity above.
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

The installed image tool declarations offer the unversioned Sunburst alias, not the
accepted dated ID; no-retry support remains unproved. No shared plugin was changed.
The [provider path assessment](integration-handoff.md#supported-provider-path-assessment)
records the subsequent official-source and existing-plugin investigation, including
the text-provider retry gap and the bounded upstream remedy proposed for approval.
The prepared connector also has gaps: its Loop validator rejects self-variable break
conditions that Dify executes, updating an existing draft sends an unsupported empty
environment_variables field, and its Human Input submit endpoint only simulates form
outputs. Source-verified prepared Console client calls and disposable DSL imports
established the native results above. OpenAPI run/form attempts returned HTTP 500;
they do not prove that Dify lacks Human Input. An initial file-run stream failure was
inspected before a deterministic retry. No paid execution occurred.

Keep E1-E5 open: provider execution/settings/retries/usage, realistic native-file
capacity and expiry, real Manager journeys, owned Unitale registration/observations,
authenticated UI and durable recovery, and finite paid acceptance remain unverified.

Cleanup readback: all 15 disposable apps and their one Workflow Tool were deleted;
the original 32 app IDs/names/update timestamps and installed plugin identifiers are
unchanged. Two nonsensitive fixture uploads remain under Dify retention because the
prepared tools and inspected Console/service upload APIs expose no file-delete action:
`6e5ccd9f-0d73-4e66-9099-459c7cb53fe1` (original-a) and
`1205f691-e853-4010-90db-fbc206aa9310` (original-b). Their physical removal is unverified;
no host/storage mutation or shared-plugin change was attempted. Probe apps/runs were
deleted after observation, so the run IDs above are historical evidence locators.
