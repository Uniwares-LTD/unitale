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
registrations, migrations and live Dify are unchanged.

## Configuration and limits

All model execution defaults to disabled through `execution_ready=false`. Prepare is
unpaid and can run independently. Manager's managed MCP and six Workflow Tool provider
IDs contain explicit `BINDING_REQUIRED` slots. These are local candidates, not actual
Dify UI exports or installed/import-verified publications. The empty DSL dependency
arrays do not mean dependency-free: install/configure and pin the official plugins
listed in the manifest before an authorized import, then export their real identifiers.
No package hashes or installation identities are invented here.

The inspected official image tools do not explicitly disable OpenAI SDK retries and
reject the accepted dated Sunburst model. Disabling Dify node retries does not fix
those gaps. Activation remains blocked; do not silently use an unversioned alias or
reintroduce a custom plugin. Native structured-output compatibility, file wrappers,
Loop/Assigner execution, Human Input and trusted observations remain E1-E5 pending.

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
This is not integrated/live acceptance: all E1-E5 gates remain pending.

| Checkpoint | Verified local outcome | Reviews |
| --- | --- | --- |
| 01 | Minimal consumed boundaries, seven roles, 48-selector provenance and official-provider capability findings | Two clean same-agent read-only passes |
| 02 | Source-pinned official plugin configuration and explicit retry/dated-model incompatibilities; no custom adapter | Two clean same-agent read-only passes; target compatibility pending |
| 03 | Planner, Manuscript, Art Director and scoped Reviewer native YAML; structured-output configuration, scoped content checks and immutable-fact fixtures | Two clean same-agent read-only passes |
| 04 | Page Composer, deterministic Prepare/Generate candidate and all six Reviewer modes; exact text/source/coverage, partial and unknown fixtures | Two clean same-agent read-only passes; actual pixels/native transport pending |
| 05 | Bounded native serial Manager, direct private MCP binding, explicit children, checkpoint/preflight/correction/unknown guards and actual presentation binding | Two clean same-agent read-only passes; Dify journeys/resume pending |
| 06 | Seven hashed candidates, configuration/binding manifest, integration handoff and current local evidence | Two clean integrated same-agent read-only passes against 713da2d |

Final affected suite: **33/33 pass** (11 preserved v1 tests and 22 native-package tests).
Full typecheck, scoped test-file ESLint, check:docs, check:i18n and check:skills pass.
handbook:ready exits successfully with pre-existing advisory tracking/preferences
warnings; no project configuration was changed. No application build was needed
because application/runtime/dependency inputs are unchanged. The connector validator
was not executed: automatic approval review rejected external source transmission;
local structure/selectors/branch checks and isolated Code execution were used instead.

Reviewed implementation SHA-256: `b530d4ef25a61aa1647b8843311920951cdb9a248c98a05d31516f915b2e9991`.
Identity covers seven YAML files, five fixtures and the new test file: sort repository-
relative paths, concatenate each path + NUL + its lowercase SHA-256 + LF, then SHA-256
the concatenation. Documentation and manifest evidence fields are outside this digest.
The manifest separately records every workflow/fixture hash. YAML totals 235,134 bytes.

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

Handbook: `D:/misc/code/uniwares/handbook` at
`0048c32a98060bb094eb3010aa0f4f407e97796e`, explicitly refreshed for this session.

Next, follow the compatibility procedure before relying on target bindings; checkpoint
07 remains the application authorization gate. Keep activation disabled. No application
changes, live operations or paid calls are included. Candidate commit/push and issue
progress publication were separately authorized on 2026-11-09.

For the ordered remaining work and prerequisites, follow the
[next-step runbook](integration-handoff.md#next-step-runbook).
