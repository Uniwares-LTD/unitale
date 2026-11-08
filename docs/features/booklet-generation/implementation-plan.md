# Unitale booklet delivery plan

## Contract and decisions

The accepted [R01–R14 PRD](prd.md) and [issue #10 workflow design](workflow-design.md)
define the target. The latter owns current decisions, gaps and unresolved contracts;
it explicitly replaces earlier app/Executor human-approval and quality gates.
Preserve existing records and the single-orchestrator dispatcher. Unibase changes originate in its repository and
reach Unitale through reviewed template integration. No production catalog seeds.
For the current issue #10 design handoff, the Handbook baseline is
`D:\misc\code\uniwares\handbook` at
`71891a9031eeebee1ff8d2a66494bdeb10ad5d3f` (usable cached revision).
Earlier implementation evidence below retains its historical scope.

## Execution prerequisites

**Readiness: checkpoints 01-06 are specified for local candidate implementation;
implementation authorization and runtime evidence remain separate.** The
[A01-A22 register](workflow-design.md#implementation-readiness-audit)
links each resolution to the [package specification](workflow-package-spec.md#technical-resolutions-for-a01-a22).
Checkpoints 01-12 below replace the application-first C0-C10 sequence. Deliver the
candidate workflows/plugin and proposed application changes at 06, then stop before
material application implementation at 07. E1-E6 remain evidence/setup gates, not
assumed successes; candidate validation is distinct from integrated/live acceptance.
A failed probe blocks its dependent binding, not independent schemas/fake-provider work.
No checkpoint starts merely because documentation has been updated.

The user authorized local environment preparation, plan finalization and commit/push
of these planning changes. Package/application implementation does not begin in this
handoff task. An explicit new-session goal may authorize 01-06 within the boundary
below; 07-12 retain their named gates. Merges require separate authorization.
Releases, deployments, provider publications and paid calls
remain separately gated. Use fake providers and disposable databases. Full-product T28
acceptance requires configured Dify publications/plugins/credentials and a finite
approved budget, Stripe test configuration, Play products/notifications/
signing/internal track, Digital Asset Links and an installed Android device. Admin
creates actual offers/packages and enables only accepted languages/capabilities.

## Checkpoints

Every dependency is mandatory for integrated completion. Contract-level fixture work
may proceed before integration; do not report it as a working product. Each checkpoint
requires focused boundary tests and two consecutive clean read-only reviews of the
same state; final review covers the integrated diff. After explicit implementation
authorization, continuation is automatic only through
checkpoints whose dependencies and evidence gates are satisfied; publication/external
acceptance retain separate authorization. No agent delegation is implied.

| ID | Owner | Outcome | Dependencies | State |
| --- | --- | --- | --- | --- |
| T01 | Both | Versioned catalogs, entitlements, operations, booklet/decision/manifest/workflow contracts and fixtures | None | Complete |
| T02 | Unitale | Offline Dify parent/child, Human Input, native files and adapter compatibility harness | None | Complete (offline scope accepted) |
| T03 | Unibase | Stripe/Play and Android bridge compatibility harness | None | Complete in Unibase; imported and verified in Unitale |
| T04 | Unibase | Configurable MCP limits and extensible private authorization | T01 | Complete in Unibase; imported and verified in Unitale |
| T05 | Unibase | Execution measurements, evidence, redaction and cleanup | T01 | Complete in Unibase; imported and verified in Unitale |
| T06 | Unibase | Versioned catalogs and trusted product extensions | T01 | Complete in Unibase; imported and verified in Unitale |
| T07 | Unibase | Upfront consumption, entitlements, concurrency and refunds | T06 | Complete in Unibase; imported and verified in Unitale |
| T08 | Unibase | Promotions, reservations, limits and bonus grants | T06 | Complete in Unibase; imported and verified in Unitale |
| T09 | Unibase | Stripe subscriptions, coupons and catalog publication | T03,T06,T08 | Imported from Unibase; offline verification complete |
| T10 | Unibase | Play verification, acknowledgement, renewals, restore and catalog publication | T03,T06,T08 | Imported from Unibase; offline verification complete |
| T11 | Unibase | Android TWA purchase, restore and deferred changes | T10 | Imported from Unibase; local verification complete |
| T12 | Unibase | Commerce administration, preview/readback and refunds | T07,T08,T09,T10 | Imported from Unibase; local verification complete |
| T13 | Both | Reviewed foundation through normal template integration | T04–T12 | Complete (local foundation integration) |
| T14 | Unitale | Owned book/production/revision repositories with embedded subjects/artifact index | T01 | Implemented; local verification complete |
| T15 | Unitale | Lifecycle, human decisions, locks, entitlements and restart | T13,T14 | Implemented; local verification complete |
| T16 | Unitale | Original media, derivatives, source routing and resumable attachment | T13,T14 | Implemented; local verification complete |
| T17 | Unitale | MCP-only booklet tools | T15,T16 | Implemented; manifest transport-limit review finding remains; verification notes below |
| T18 | Unitale | Source specialist workflows generalized to package inputs | T01,T02 | Pending |
| T19 | Unitale | Versioned quality assessment service and bounded correction contract; issue #10 covers all review modes | T01,T02 | Pending |
| T20 | Unitale | Manager composition, Human Input and durable continuation | T17,T18,T19 | Pending |
| T21 | Unitale | Creator brief, quotes, progress, decisions, revisions and history | T15,T16 | Pending |
| T22 | Unitale | Private reader and image downloads | T15,T16 | Pending |
| T23 | Unitale | Manifest-bound deterministic PDF | T15,T16 | Pending |
| T24 | Unitale | Revocable version-bound sharing and download controls | T22,T23 | Pending |
| T25 | Unitale | Storefront, wallet, offers, coupons and entitlements | T13,T15 | Pending |
| T26 | Both | Integrated simulated journeys and compatibility | T20,T21,T24,T25 | Pending |
| T27 | Both | Migration/recovery rehearsal, documentation and final reviews | T26 | Pending |
| T28 | Both | Authorized real provider/store/device acceptance | T27 + external prerequisites | Gated |

### Issue #10 design and delivery boundary

Deliver the seven workflows together: complete focused services with a simple serial
Manager, rather than incremental user-facing product slices. T18 covers the focused
creative/image services, T19 expands to all independent assessment modes, and T20
owns Manager progression and app integration. Start/review/resume/revision uses the
existing Run UI; no separate booklet pages are included. Contracts must support
Manager-controlled grouping and independent parallel calls, even though the initial
Manager may execute serially. The broader T21 creator workspace and T22-T25 features are not pulled in.
Booklet-only staging acceptance is part of issue #10 and does not wait for unrelated
Stripe/Play/device acceptance or imply completion of the full T28 milestone.

The user selected workflow-first delivery, including a narrow provider plugin, with
a hard application-code gate after 06. This handoff prepares the local environment
and finalizes the plan/supporting documentation; it does not begin package implementation. The checkpoints refine
T18-T20 and the minimum Run integration, without replacing the historical milestone
table or pulling in the broader product. [Workflow design](workflow-design.md) owns
accepted policy; the [package specification](workflow-package-spec.md) owns service
contracts. Later recorded decisions supersede older issue wording concerning
mandatory human approvals, Executor quality gates and hard provider-spend limits.

Latest decisions: Manager controls paid dispatch; app usage ceilings are safeguards
per production, shared across continuation/corrections. Include labelled estimates
until reported costs arrive, avoid double counting, and allow independent work while
an unknown item is reconciled without replay. Signed grants, provider-spend reservations
and executor-level replay protection are not required. Purchase/credit, entitlement
and product-lock rules remain hard app boundaries.

No package implementation has begun. The local Node/Python/Dify tooling is prepared;
the current compatibility baseline and typecheck pass as recorded below. Historical
foundation results retain their original scope and are not new v2 package evidence.

### Issue #10 deliverables and dependency map

The accepted order is workflow-first. Checkpoints 01-06 deliver a complete **candidate**
package and exact application-change handoff. They do not require the future Unitale
MCP handlers or Unibase extensions to exist. Checkpoints 07-12 implement/integrate that
handoff and obtain staging acceptance. Historical T01-T28 scope/evidence stays intact.

| Checkpoint | Deliverable | Prerequisites | Exit / next gate |
| --- | --- | --- | --- |
| 01 - Contracts & Orchestration Design | Package-local v2 contracts, fixtures, Manager outline and initial application handoff | Explicit package implementation authorization; local baseline | Shared interfaces executable in tests; continue to 02 |
| 02 - Provider Adapter & Compatibility | Narrow Dify provider plugin and boundary evidence | 01 adapter ABI | Local adapter tests pass; live-only bindings explicitly pending |
| 03 - Story & Art Specialists | Planner, Manuscript, Art Director and text/specification/correction Reviewer branches | 01-02 | Actual graphs pass scoped fixtures; continue to 04 |
| 04 - Page & Image Services | Page Composer, Image Executor and completed Reviewer | 03 specimens; 02 image ABI | Six focused workflows complete locally; continue to 05 |
| 05 - Manager Workflow | Minimal complete serial Manager against the proposed app contracts | 01-04 | Seven candidate graphs pass fixture journeys; continue to 06 |
| 06 - Candidate Package & Integration Handoff | Reviewed package, manifest, evidence and exact Unitale/Unibase change specification | 01-05 | **Stop: application changes require explicit authorization** |
| 07 - Application Contracts & Persistence | Runtime v2 schemas, storage/index changes and compatible readers | Accepted 06 handoff; application implementation authorization | Persistence and v1 regression checks |
| 08 - Shared Runtime Extensions | Minimal Unibase changes and reviewed import | 07 interfaces; relevant 02 evidence | Upstream tests and reviewed integration |
| 09 - Unitale Gateway & Recovery | Admission, nineteen MCP tools, usage, media and recovery | 07-08; verified target file/receipt bindings | Real handler/repository boundary tests |
| 10 - Run UI Integration | Existing Run create/review/continue/revise surfaces | 09 and 05 contracts | Browser and authentic-decision tests |
| 11 - Integrated Verification | Actual candidate package against implemented app contracts | 07-10 and 06 package | Offline integrated checks and two clean reviews |
| 12 - Staging Publication & Acceptance | Publication readback, approved paid acceptance and final exports | 11; E4/E5; exact live authorization | Staging acceptance only; human closure remains separate |

Earlier C0 documentation work is retained. C1 probes move to 02 (local setup starts
in 01); C2 splits into package-only 01 and application 07; C3=08; C4=09;
C5 splits across 02-04; C6 spans 03-04; C7=05; C8=10; C9 splits into 06/11; C10=12.
The superseded C0-C10 and P0-P8 sequences are navigation history, not parallel plans.
A01-A22 remain design findings, G01-G17 implementation gaps, E1-E6 evidence gates;
none is renamed to a checkpoint.

### Execution boundary and artifact layout

This handoff authorizes environment/plan preparation and its commit/push only.
Once the user authorizes 01-06 execution,
the permitted implementation is Dify plugin/workflow code, package-local contracts,
offline fixtures/tests and supporting docs. It is not permission to change Unitale or
Unibase application code. A later instruction to execute the accepted package phase
covers its automatic internal continuation; do not ask again at every checkpoint.

During 01-06, allow changes only in the package folder below,
`dify/plugins/provider-execution/`, `tests/booklet-compat/` and the canonical
booklet docs/source map. Preserve existing v1 tests; add v2 tests alongside them.
Do not edit `src/`, application registries, runtime schemas, database migrations,
root dependency manifests/lockfiles, deployment configuration or copied Unibase core.
If a package change needs any of those paths, document the required application delta
and use a contract fixture; do not implement a workaround inside a child or plugin.
Local dependency installation/caches are allowed after execution authorization; no
dependency upgrade or persistent environment setting change is implied.

Package root: `docs/features/booklet-generation/workflow-package/`.
Create artifacts only in their assigned checkpoint, not empty future placeholders:

| Artifact | Introduced / contents |
| --- | --- |
| `contracts/contracts.ts`, `contracts/export.ts`, exported `contracts/*.schema.json` | 01: standalone Zod v2 wire shapes and JSON Schema export; no imports from application contracts |
| `fixtures/` | 01 onward: synthetic requests, expected results/control traces and small original images; no customer data |
| `integration-handoff.md` | 01 onward: proposed app changes, exact contracts and evidence gates; final at 06 |
| `README.md`, `manifest.json` | 01 skeleton with real available metadata; progressively completed, finalized at 06 |
| `story-planner/`, `manuscript/`, `art-director/` | 03: each has README and one current `workflow.yaml` |
| `quality-reviewer/` | 03 scoped working branches; 04 completes all modes in the same workflow |
| `page-composer/`, `image-executor/` | 04: each has README and one current `workflow.yaml` |
| `manager/` | 05: README and one complete current `workflow.yaml` |
| `validation.md` | 06: exact package identity, local/probe evidence, remaining gates and publication/readback procedure |

The package contracts are a testable proposal, not runtime registration. Use the locked
Zod 4 dependency and its [JSON Schema exporter](https://zod.dev/json-schema), targeting
draft 2020-12. Keep structural schemas exportable; put cross-record checks (source
tuples, text coverage, hashes and applicability) in explicit pure validators tested
alongside them. Do not silently erase a refinement in the export. Provider-specific
structured-output restrictions are adapter/request mapping concerns and get separate
tests; do not weaken the canonical service schema to satisfy one provider.

Use JavaScript for authored Dify Code nodes so the existing harness's isolated
JavaScript execution pattern can be reused. Nodes carry self-contained validation/
serialization logic; no filesystem/network access or runtime import of package Zod
code. Test their behavior against the same canonical fixtures. Extend only the small
set of graph-node behaviors these seven graphs use. Do not build a general Dify
emulator or duplicate Manager decisions in a handwritten test-only orchestrator.
Fakes replace external provider/MCP/Human Input boundaries, not the actual Code nodes,
selectors or routing predicates under test.

### Local commands and evidence levels

Run from the Unitale root using Node 24 and the repository-pinned npm 12.0.1.
The prepared local launcher is
`node output/tooling/npm/node_modules/npm/bin/npm-cli.js`; use it in place of `npm.cmd`
in the script examples below. On implementation entry verify the recorded worktree,
lockfile/runtime identity and baseline; reuse current evidence when inputs are unchanged.
Run `ci --cache .npm-cache --no-audit --no-fund` through that launcher only when
installation is absent/stale; never upgrade the lockfile to repair setup. Existing v1
harness results prove their own scope, not the unimplemented v2 package.

Prepared workspace tooling on 2026-11-08 (all under ignored `output/`):

| Tool | Verified version / invocation |
| --- | --- |
| Node / pinned npm | Node 24.21.0; local npm 12.0.1 via the launcher above; global npm is unchanged |
| Python runtime | `output/tooling/python312/python.exe` is 3.12.10; `py -3.12` resolves it; pip/SSL/venv smoke checks pass |
| Dify SDK preflight | `output/tooling/python312-smoke/Scripts/python.exe` imports `dify-plugin==0.11.0` and its Tool/Plugin/Env classes; `pip check` passes |
| Dify Plugin CLI | `output/tooling/dify/dify.exe` reports v0.6.15; `plugin package --help` works; SHA-256 `28fd1f5826e3b9ae924ad180cd6c2087966aafa9b2af96f5cf2610f09ad504aa` matches the official release asset |

Python came from the [signed official installer](https://www.python.org/downloads/release/python-31210/);
the CLI came from the [official 0.6.15 release](https://github.com/langgenius/dify-plugin-daemon/releases/tag/0.6.15).
Global PATH and tracked dependency versions are unchanged; no live Dify installation
was performed.
The ignored preflight environment is a setup check, not 02's reviewed hashed lock or
proof of Dify daemon compatibility. Its package inventory is retained locally at
`output/tooling/provider-preflight-packages.json`; 02 must create/test its own plugin
lock and artifact. These ignored tools are not delivered by Git; another machine must
provision equivalent versions before using the commands.

On this Windows sandbox, run `test:booklet-compat` and `typecheck` outside the sandbox
from the first attempt: subprocess spawning/native SWC cache access otherwise fail.
Both commands pass outside it. npm 12 blocked several dependency lifecycle scripts,
but the required native bindings/test commands work; do not approve every script or
rewrite package policy without a demonstrated need. Record any new runtime failure
separately rather than masking it with a dependency upgrade.

The following file/commands are **planned deliverables**, not commands that exist today:
01 introduces `tests/booklet-compat/v2-contracts.test.ts`; 02 introduces
`v2-provider.test.ts`; 03 `v2-specialists.test.ts`; 04
`v2-images-review.test.ts`; 05 `v2-manager.test.ts`; 06 `v2-package.test.ts`.
For the 01 focused slice run
`node --conditions=react-server --import tsx --test tests/booklet-compat/v2-contracts.test.ts`.
For later slices replace only the final filename with the introduced filename above.
At each checkpoint exit run the existing `npm.cmd run test:booklet-compat`, which
includes these top-level tests, plus `npm.cmd run check:docs`,
`npm.cmd run check:i18n`, `npm.cmd run check:skills` and `git diff --check`.
Run the schema export check and test-local type-check below at every checkpoint exit;
rerun Python/plugin packaging checks when plugin inputs changed and always at 06.
Git and any Git-invoking helpers run outside the sandbox. Run
`npm.cmd run handbook:ready` at planning/final handoff; existing preference/tracking
warnings are advisory, not permission to invent organization configuration.

01 supplies exporter modes `--write` and read-only `--check`, invoked as
`node --import tsx docs/features/booklet-generation/workflow-package/contracts/export.ts --check`.
Run `--write` only for intentional schema changes; review the generated diff.
Its check covers every exported schema and fails on stale/missing outputs.
Type-check the new test/contracts slice using a test-local `v2/tsconfig.json` and
`node node_modules/typescript/bin/tsc --noEmit -p tests/booklet-compat/v2/tsconfig.json`;
01 creates that config without changing the app tsconfig.

02 supplies a Python 3.12 environment, hashed dependency lock and standard-library
`unittest` tests under the plugin. Exact setup/test commands are:
`py -3.12 -m venv dify/plugins/provider-execution/.venv`,
`dify/plugins/provider-execution/.venv/Scripts/python.exe -m pip install --require-hashes -r dify/plugins/provider-execution/requirements.lock`,
and `dify/plugins/provider-execution/.venv/Scripts/python.exe -m unittest discover -s dify/plugins/provider-execution/tests -p "test_*.py"`.
Plugin-local ignore rules exclude its environment, caches, credentials and build output.
Keep downloaded tools/build artifacts under ignored `output/` as needed; they are
local tooling, not tracked application changes. Use the official Windows Plugin CLI
as a workspace-local `dify.exe`, not a global PATH/configuration change. Run
`dify.exe version` and, from `dify/plugins`,
`dify.exe plugin package ./provider-execution`, substituting the absolute CLI path
if needed. Record the actual CLI version/hash and generated package hash. The
[official CLI](https://docs.dify.ai/en/develop-plugin/getting-started/cli) and
[packaging guide](https://docs.dify.ai/en/develop-plugin/publishing/marketplace-listing/release-by-file)
define the tool; validate manifest/provider author identity and package contents.
Remote debugging, installation and signing-policy changes are live actions, not
implied by local packaging. Label a locally packaged artifact as a candidate until
installation/engine evidence exists; never disable signature checks to make it pass.
Freeze the tested dependency resolution in 02; do not claim an untested lock is known
now. Candidate Dify SDK/Python versions remain those in the package specification.

Evidence has three levels: local fixture/static validation; actual Dify engine probe;
paid provider/quality acceptance. Record each separately with version, input, expected/
observed result, artifact hashes and limitation. Offline graph tests must never mark
E1-E5 passed. Missing live evidence does not block a candidate checkpoint when its
local contract is complete and the exact unresolved deployment dependency is recorded.
A known contradiction that makes the candidate contract impossible does block it:
resolve the affected contract before advancing, rather than hiding it as a caveat.

### How to execute, checkpoint, review and revise

1. **Resume from evidence.** Read this plan/spec, current status below, actual worktree,
   previous package hashes and test outputs. Preserve unrelated edits. Establish a
   checkpoint-start diff/file-hash inventory; do not require a commit to create one.
   The issue base remains the recorded commit, with pre-existing planning edits noted.
2. **Take one bounded slice.** Use the slice order inside each checkpoint. Implement
   its tests and outcome, then run focused checks. Sol/medium is the intended executor;
   the slice is one contract family, service, reviewer mode or Manager scenario.
   A slice is not a new approval gate or permission to enlarge the architecture.
3. **Validate the checkpoint.** Run its focused commands and common exit checks.
   Prove negative paths as well as success. Record blocked/unrun checks honestly;
   do not replace missing integration evidence with a passing fake.
4. **Review read-only, twice.** Apply review-change in two separate passes on the same
   implementation state. First inspect the checkpoint diff and affected dependencies;
   second check contract/fixture completeness, failure paths and scope boundaries.
   Each pass must have no confirmed blocking findings and current required local
   verification. No delegation is authorized; label same-agent fallback reviews.
   06 covers the entire package diff against the issue base, not only its last slice.
5. **Fix outside review.** Fix confirmed in-scope findings, rerun affected checks, and
   reset the two-clean-pass count when reviewed implementation changes. Preserve
   unrelated valid evidence. An evidence-only progress entry does not change the
   reviewed implementation identity. Do not stop after an arbitrary number of fixes;
   repeated failure of the same fix requires diagnosis under repository guidance.
6. **Persist a resumable checkpoint.** Update the single current-status section below:
   checkpoint/slice, outcome, base and changed-file/hash identity, artifact/manifest
   hashes, exact checks and results, two review outcomes/identity, open evidence gates,
   remaining work and exact next command/action. Keep canonical decisions in the spec
   and package evidence in validation docs; no parallel work-log or second task queue.
   Commit/push only when explicitly authorized; uncommitted reviewed state is valid.
7. **Reassess the next step.** Compare its inputs with the completed artifacts. Routine
   field/selector corrections within accepted policy update the schema, examples, all
   affected graphs, handoff and tests together. Reopen affected earlier checkpoint
   evidence and rerun it before continuing. A change to ownership, product limits,
   spending/review policy, service scope, new infrastructure or the app-code boundary
   requires a concrete proposal and user decision before dependent work.
8. **Continue within authority.** If the next prerequisites pass, proceed automatically
   within authorized 01-06. If a live binding is missing, continue only independent
   local work and leave that probe pending. For unknown live outcomes inspect the same
   execution/operation; never repeat paid dispatch to discover its state. At 06 stop
   and present the reviewable application handoff; 07 requires explicit authorization.

### 01 - Contracts & Orchestration Design

**Outcome:** executable package-local contract proposal and Manager outline, sufficient
for adapter and focused-service authoring. No runtime app/schema change. Covers A01-A04,
A10-A12,A17,A19-A22 and the interface portion of G01-G17.

**Entry and slices:** after package authorization and local baseline, (a) shared envelope/
identity/receipt schemas, (b) operation content and review schemas, (c) nineteen proposed
MCP contracts and Manager action/checkpoint fixtures, (d) handoff inventory/export check.
Use the source catalog at `587f1b7775e316f4c58461dd3fda773af6d5dc2e`; record source paths,
selectors and hashes. Current v1 contracts are reference evidence, never v2 imports.

**Concrete decisions/deliverables:**

- Implement the package spec's strict v2 string `request`/`result` carriers with native
  `references`/`files` separate. Specify every operation's create/revise required
  fields, optional fields, null rules, input/result examples and cross-record checks.
  Preserve balanced creative detail, Unicode spans, stable/local IDs, partial outcomes,
  call/item separation and independent future parallel calls.
- Define the adapter ABI in the package contracts: tools `text_execute` (text/vision)
  and `image_execute`, each taking a JSON `request` plus native `references`.
  Requests include call/input/config identities, the Dify-authored provider payload and
  expected output schema/keys. JSON results carry parsed output, bounded diagnostic
  and deterministic receipt; image files are separate native outputs keyed to receipts.
  No Unitale URL/credential/private context or creative prompt template in the plugin.
- Define proposed schemas for all nineteen MCP tools from A04, including each union's
  success/error responses, scoped IDs/fences, idempotency and who writes what.
  Include native image metadata/content behavior, transport/section bounds and
  authentic human-response correlation. Fixtures cannot invent app next-action fields.
- Record a Manager action table for `invoke/review/repair/revalidate/accept/ask/pause/complete`:
  prerequisites, exact tool/service interaction, durable change, error/partial handling
  and next observable state. Outline creation, continue and paid customer revise
  journeys; do not create the Manager YAML yet.
- Start `integration-handoff.md` from the local feature-spec template conventions.
  For each app delta record current code symbol/path, proposed signature/payload,
  owner (Unitale/Unibase), permissions, transaction/fence/idempotency, storage/index
  change, v1 compatibility, UI consequence, acceptance test and target checkpoint
  07-10. Cover A20 hooks, not a generic framework. No application implementation.
- Seed deterministic fixtures: no optional subjects/no cover; multi-subject/multi-page
  with cover; Arabic/RTL and mixed Unicode; grouped partial results; actual file
  identity/order; changed source tuples; each error class and correction limits.
  Fixture capacities are test data, not launch product defaults.

**Verification/exit:** `v2-contracts.test.ts`, export `--check`, slice type-check and
common checks pass. Every J01-J13 operation and all Reviewer modes have a positive
and invalid/missing-input contract example. Include canonical hash vectors, exact
lettering/splits, same-call retry versus new-candidate identity and v1/v2 separation.
Two reviews confirm no required public field, status, mutation owner or error path is
left as "implementer decides"; known live binding assumptions have explicit gates.
Continue to 02. An app change discovered here is a handoff item, not a prerequisite
to constructing the candidate package.

### 02 - Provider Adapter & Compatibility

**Outcome:** real narrow plugin with a tested local ABI and explicit target-runtime
compatibility report. Covers A08,A13-A16,A21-A22; E1-E3 remain live evidence gates.

**Slices:** (a) plugin metadata/tool ABI and injected HTTP boundary, (b) text/vision
mapping, final-answer/receipt handling, (c) image generation/edit/native files,
(d) packaging and individually scoped engine probes where authorized.

Implement under `dify/plugins/provider-execution/` using the candidate Python 3.12 /
`dify-plugin==0.11.0` baseline. Use published Responses and image generation/edit
request mappings with standard-library HTTP/multipart handling and no additional
provider SDK/retry framework. Keep HTTP injection small for tests. Dify credentials
configure the provider privately; child requests carry configuration identities only.
Honor 120/270-second text/image deadlines and zero automatic retries. The plugin
accepts Dify-authored creative payloads, does deterministic validation/execution/
receipt packaging, and makes no Unitale calls.

Preserve usage before subsequent local packaging when possible, but promise no
durability beyond the established receipt channel. Distinguish proven non-dispatch,
provider failure/refusal, incomplete/invalid output, uncertain transport and native-file
packaging failure. No receipt store/spool; no blind replay. Select final structured
output, preserve attributable usage and label calculated costs as estimates.
Image calls preserve reference order and original bytes, actual dimensions/settings
and per-output keys. Do not resize originals or substitute thumbnails.

Local Python tests inject provider responses/timeouts and file-emission failures.
`v2-provider.test.ts` validates tool declarations and shared request/receipt fixtures
against the 01 ABI; run Python tests separately, not an imitation in JavaScript.
Package tests must not need credentials or access a live provider. Build a local
candidate plugin artifact with the official Dify packager; record the verified
CLI version, exact command and output hash in the plugin README before exit.
Installation/publication is a different action; a source ZIP is not proof of a valid
plugin package. If the packaging toolchain is unavailable, do not mark 02 complete.

**Probe protocol:** for each authorized engine probe record target app/workspace and
versions, input and expected result, allowed writes, numeric paid caps if applicable,
cleanup/retention and stop condition before execution. Use disposable apps; preserve
unknown executions. Cover empty FILES conversion, credential binding, request/schema
parameters, actual Workflow Tool wrappers/system IDs, JSON carrier capacity, native
files up to the candidate bound, receipt loss, nested timeouts, Human Input/Loop and
paused-parent publication binding. Group free deterministic probes before any paid
case. Do not modify the observed staging Manager/shared experiment plugin.

**Exit:** local ABI, failure/receipt/file tests, local package verification and
two reviews pass; each live capability is evidenced or explicitly pending. Known host
incompatibilities must be resolved before dependent final selectors; unresolved
installation IDs may remain deployment slots. Continue local 03 work against the
validated ABI without claiming E1-E3 passed.

### 03 - Story & Art Specialists

**Outcome:** three complete focused graphs and the working text/specification/text-
correction branches of the single Reviewer graph. Covers J01-J10 and related A18.

**Slices in order:** (a) Story Planner concept/outline/cast/locations; (b) text Reviewer;
(c) Manuscript write/reconcile_characters/reconcile_locations; (d) Art Director style/
sample_spec/character_spec/location_spec; (e) specification and text-correction review.
Each service slice includes its create/revise fixtures before advancing.

Use the published prompt/schema selectors and migrate creative construction into Dify.
Remove experiment persona/fixed-count assumptions and callbacks. Use explicit scoped
inputs, established-fact provenance, bounded context and structured outputs; return
proposals, not app mutations. Preserve exact text and local-key remap requirements.
Only Manager selects calls and corrections; children cannot ask humans or invoke peers.
Load actual authored YAML and execute its JavaScript nodes/selectors with fake tool
responses, not the old synthetic `candidates()` graphs.

Reviewer shares the 01 assessment envelope: exact targets/sources, inspected coverage,
pass/repair/inconclusive/blocked, stable findings, evidence and limitations. Operational
failure is not an invented quality defect. Unimplemented visual branches at this
intermediate checkpoint are explicitly unsupported and cannot return pass; 04 must
replace them with working branches before the Reviewer is declared complete.

**Verification/exit:** `v2-specialists.test.ts` plus common checks; variable/zero
optional subject counts, grouped/out-of-order proposals, scoped revise, hard fact
conflicts, bounded context, source mapping, Unicode/RTL, missing input, incomplete
output and meaningful privacy canaries. Reviewer fixtures cover good output,
confirmed defect, advisory-only and insufficient evidence. No provider SDK/HTTP/node
retry or undeclared call. Two clean reviews; reconcile contracts/handoff if concrete
service needs changed them, then continue to 04.

### 04 - Page & Image Services

**Outcome:** Page Composer and Image Executor complete; the same Reviewer now supports
all six modes. Covers J11-J13, reference serializers and A13-A18.

**Slices:** (a) paginate/compose and routing/spec review; (b) deterministic Image Executor
prepare and image-request review; (c) generate/native output handling and image review;
(d) visual correction and whole-book coverage. Contract changes propagate back to 03
fixtures before exit, not as incompatible special cases.

Page Composer routes all required manuscript text exactly once, using code-point spans,
explicit reading order, cover/story roles, ordered panels and explicit no-text. New
dialogue requires a manuscript revision. Image prepare includes immutable style,
exact lettering, actual reference order and meaningful settings in the request hash.
Generate validates that exact request but has no Reviewer-pass gate inside Executor.
Manager's 05 preflight policy is mandatory; no duplicate app/executor quality gate.

Complete Reviewer `text/specification/image_request/image/whole_book/correction`.
Use actual pixel inputs for image modes and explicit missing-pixel outcomes. Whole-book
aggregation uses up to four-page windows with one-page overlap and the specified
recurring-subject pairs; Manager schedules windows, Reviewer only evaluates supplied
scope. Aggregation cannot manufacture coverage. Fixture-based pixel plumbing is not
evidence of model visual quality.

**Verification/exit:** `v2-images-review.test.ts`, Python image tests, all earlier
package tests and common checks. Include title-only cover, inherited non-editable
facts, lettering omission/duplication/RTL spans, stale request/reference order, missing
bytes, per-kind dimensions, unsupported final size, two different originals,
multiple outputs/partial results, absent pixels, cross-window continuity defects,
and re-review after correction. Failed structural validation dispatches zero provider
calls. No app overlay/crop workaround. Six focused YAMLs and complete Reviewer mode
coverage pass two reviews; continue to 05.

### 05 - Manager Workflow

**Outcome:** seventh candidate graph: complete minimal serial orchestration against
the proposed nineteen-tool app interface. Covers A04-A12,A17,A19.

**Slices:** (a) creation happy path and service wiring; (b) review/preflight/correction/
selection; (c) optional authentic human input and continuation/customer revision;
(d) partial results, storage recovery, unknown calls and budgets.

Use one bounded serial Loop (64 actions per attempt), explicit service branches and
one converged app-facing End `result` compatible with the existing v1 Run envelope.
Manager's own paid reasoning is registered before dispatch. Direct Start private
context binds only to managed MCP nodes; never through Code or a child. Child tool/
publication dependencies are manifest binding slots until real IDs are available.

Build the actual graph from 01's action table, updating it when implemented details
clarify ordering. Before paid work read authoritative app facts, reconcile observations,
register calls and persist dispatch intent; release short mutation leases across paid
calls and human waits. Retain originals/proposals and fresh-fenced selections before
downstream use. Mandatory exact image preflight, output and whole-book review remain
Manager policy; human checkpoints remain optional and interruptions minimized.

Test-boundary doubles return contract-valid app facts and enforce scripted
identity/fence/counter effects; they are not a second production backend, scheduler or
billing engine. Fixtures assert Manager's actual action trace: reuses the same call
identity, permits deliberate new candidates under the same chain, never replays unknown
dispatch, does independent work while permitted, stops new paid work at a ceiling,
retains in-flight evidence, and records unknown cost rather than zero. Success-only
Run application stays separate from Manager partial/checkpoint recovery and `complete`.

**Verification/exit:** `v2-manager.test.ts` runs actual graph predicates/Code selectors
with injected boundary outputs for create, continue, revise, optional/grouped human
questions, duplicate/stale answers, correction exhaustion, changed sources, retained
output after failed attachment, cancelled/expired work, no-progress and 64-action
exhaustion. Assert child/private-context isolation and exact input/output bindings.
No live app/tool dependency is contacted. Two reviews confirm no functional placeholder
branches; continue to 06 with all seven candidate YAMLs.

### 06 - Candidate Package & Integration Handoff

**Outcome:** reviewable local candidate release plus decision-complete proposed
application changes. This is the pre-application-code gate, not staging acceptance.

Complete `v2-package.test.ts`: load exactly the seven YAMLs, validate nodes/edges/
selectors and required adapter parameters, exercise actual Code behavior, detect
missing operation/mode coverage, illegal child MCP/Human Input, enabled paid retries,
secret/private-context leakage and mismatched contracts. Validate source mappings,
exported schema parity, plugin/build identity and raw file hashes. The manifest must
identify candidate status, all seven roles, configuration slots, plugin/dependency
versions, source selectors/hashes and evidence references. Undeployed identities stay
explicitly unbound; no invented working app IDs or credentials.

Close the integration handoff against current code, not memory: every required field,
status, tool, event hook, Run card/action and persistence change has a concrete owner,
signature/example, validation/failure behavior, compatibility rule and test. Cover all
nineteen tools, admission/consumption sequence, v2 collections/indexes, call/output
mapping, observer/measurement trust, late usage, file downloader/MCP image extension,
restricted post-termination retention, authentic Human Input and result application.
Include proposed UI action/state mapping and extension callbacks/call sites. Unibase
changes originate upstream; no copied-core workaround. Map each delta to 07-10 and
name any target capability it depends on. "Implement later" is not a contract.

README/validation include dependency installation/import order, non-secret binding
slots, configuration ownership, safe recovery, local commands and the separately gated
publication/paid runbook. Candidate imports may require binding substitutions; identify
their exact graph selectors and expected shapes. Do not call an unbound candidate an
installed or publication-matched export. Keep clean and repaired/recovered journeys
separate. No new app UI is delivered at this checkpoint.

**Verification/exit:** all introduced Node tests, plugin Python/package checks, schema
export parity, type-check and common checks pass. Two clean read-only reviews cover
the full package/plan/handoff against the issue base and accepted policy, including
source provenance and proposed app changes. Record E1-E5 pending where unproven,
without downgrading known incompatibility to a mere missing test. Produce a precise
resume entry and present the package plus app-change scope. **Stop before 07** until
the user explicitly authorizes material Unitale/Unibase application implementation.

### 07 - Application Contracts & Persistence

After the 06 gate, implement its v2 shapes/validators, storage/index changes and
compatible readers. Preserve v1 contracts/quality uniqueness and accepted bindings;
no automatic creative migration. Update model guide, JSON example and both Mermaid
versions with executable changes. Test migration/rollback reads, hash vectors,
immutable writes, partial outputs, revalidation, locks and correction chains.
Run `test:booklet-repositories`, `test:booklet-lifecycle-media`,
`node --import tsx --test tests/booklet-contracts.test.ts`, `typecheck`,
`docs:booklet-model` and `check:docs` (npm scripts via `npm.cmd run`).
Two reviews; continue to 08.

### 08 - Shared Runtime Extensions

Implement only the reviewed 06 interface delta in Unibase: optional domain hooks,
Run client registrations, MCP image content, restricted downloader extraction and
verified observations. Include upstream changelog/tests and preserve generic behavior
when hooks are absent. External reads stay outside transactions. Import a reviewed
pinned revision into Unitale; record actual source/import evidence. Two reviews and
affected upstream/import checks; continue to 09. Target-specific bindings need
relevant 02 engine evidence, not only local ABI fixtures.

### 09 - Unitale Gateway & Recovery

Implement the nineteen v2 tools, idempotent admission sequence, dispatch/accounting,
media retention and recovery from the 06 handoff. No v1 catalog on the new Manager.
Test actual handlers with disposable databases: every admission/dispatch interruption,
same-call/no blind replay, unknown-child progress, late/conflicting receipts and
currency, ceiling overage, multiple outputs, per-kind canvas, transaction retries,
multi-batch history and retained results after cancellation/expiry. Reuse existing
abandonment, verified release and successful-result application. Run booklet
repository/lifecycle/media/MCP/contract suites and typecheck. Two reviews; continue to 10.

### 10 - Run UI Integration

Implement existing Run start/list/detail/decision surfaces and proposed booklet cards/
authorized paginated media resolvers. Test authentic first-response wins, duplicate/
changed/stale submissions, raw 4,000-character bound, partial continuation, application
retry and unknown reconciliation as distinct actions. Browser checks: desktop and
390px English/Arabic, keyboard/bidi, public preference restoration, hydration and
served-document CSP nonces. No new workspace/reader/PDF/share UI. Two reviews; continue
to 11.

### 11 - Integrated Verification

Replace boundary fakes at application integration seams with actual handlers/services
in disposable tests; retain focused fixture coverage. Load the seven delivered YAMLs,
rerun relevant 02 probes on final bindings and verify admission, human resume, revision,
accounting, files and recovery. A passing fake cannot substitute for actual app behavior.
Run booklet compatibility/repository/lifecycle-media/MCP and standalone contract tests,
`typecheck`, `lint`, `build`, `check:env`, `check:docs`, `check:i18n`,
`check:skills` and `handbook:ready` (npm scripts via `npm.cmd run`), plus affected
upstream checks. Advisory readiness warnings stay separate. Reconcile docs/model and
run two clean reviews of the integrated diff. Stop before live 12 without its authority.

### 12 - Staging Publication & Acceptance

Require exact workspace/import/plugin installation/publication/registration/deployment
authority. Verify owned Manager journal, publish children, create immutable suite tools,
bind/publish Manager and read back all identities; never mutate accepted tools in place.
Paid authority names exact package/brief/languages/cases/settings, numeric money/call
caps and stop conditions. Verify smallest/largest enabled packages, maximum references,
actual-pixel review, creation/revision/human resume, usage and a clean approved journey.
Recovery evidence is separate; induce paid faults only within explicit scope.
Rerun final file/receipt/binding/Human Input evidence; unknown calls are not replayed.

On failure disable new candidate admission, preserve old suites, originals and
unresolved records; roll back admission selection without deleting v2 readers/recovery.
After acceptance export all seven actual publications, update hashes/evidence and
distinguish implementation, installation, publication, deployment, activation and
paid acceptance. Production promotion, commits/pushes/PRs and human issue closure
retain their separate authority.

### Verified progress and resume for issue #10

| Item | Current evidence / next action |
| --- | --- |
| Source baseline | Issue diff base `07e5af655052473c5e112927cfcb84e3071dc1b8`; finalized handoff is on `feature/10-dify-workflow-design`; inspect actual branch HEAD/worktree at implementation entry |
| Handbook | `D:\misc\code\uniwares\handbook` at `71891a9031eeebee1ff8d2a66494bdeb10ad5d3f`, usable cached revision |
| Current deliverable | Finalized 01-12 plan and prepared local tooling; no package/plugin/app implementation created |
| Documentation verification | 2026-11-08: `check:docs` (73 docs and both unchanged diagrams), `check:i18n`, `check:skills` and `git diff --check` pass; 12 labels/22 readiness mappings/01-06 exit coverage checked |
| Review evidence | Two separate same-agent read-only plan consistency passes found no confirmed defects; final handoff review covers the complete documentation diff; no independent-agent review claimed |
| Verification limits | `handbook:ready` retains advisory tracking/issue-language/integration-branch warnings; new v2 tests/plugin/workflows do not exist yet; E1-E5 remain unproven |
| Checkpoints 01-06 | Planned and locally executable in order after package implementation authorization; none implemented |
| Checkpoints 07-12 | Deferred behind 06 app-code gate; publication/paid gate remains separate |
| Local runtime baseline | Locked npm install complete; all 11 existing `test:booklet-compat` tests and full `typecheck` pass outside the sandbox; Zod JSON Schema/YAML preflight passes; Python/SDK/CLI checks above pass |
| Live evidence | E1-E5 pending; operator identities and finite paid scope are not fabricated |
| Next executable action | In the new authorized session: inspect branch HEAD/worktree and prepared tools, reuse/revalidate the baseline as needed, then begin 01's shared-contract slice |

During implementation replace the current row with the active checkpoint/slice and
the evidence fields required by the execution procedure. Keep only the current resume
state plus concise completed checkpoint evidence, not an append-only activity log.
This documentation revision leaves the implemented model guide/example/diagrams
unchanged; 07 owns their synchronized update with executable persistence changes.

### New-session goal prompt

Select GPT-6.1 Sol with Medium reasoning in the new session, then use this prompt.
The prompt authorizes package implementation only when the user starts that session;
it does not start implementation as part of this environment/plan handoff.

```text
Create and pursue a goal to complete checkpoints 01-06 in
docs/features/booklet-generation/implementation-plan.md on
feature/10-dify-workflow-design, using the accepted package specification and decisions.

I authorize the full local candidate-package implementation: package-local contracts,
the narrow Dify provider plugin, all seven workflows, fixtures/tests and documentation.
Follow AGENTS.md and the recorded execution/review procedure. Inspect the actual
worktree and prepared local tools; reuse valid baseline evidence. Work in small slices,
run the required checks, obtain two clean read-only reviews per checkpoint, record
resumable evidence and revise affected next steps when verified findings require it.
Continue automatically through 06; pause only for a genuine blocker or a material
decision outside the accepted plan. Keep the solution practically simple.

Deliver the complete locally validated candidate package and exact Unitale/Unibase
application-change handoff. Preserve Manager-only app access and all accepted policies.
Stop after 06. Unitale/Unibase application code and runtime schemas, migrations,
live Dify writes, deployment, paid calls, commits and pushes require separate
authorization. Keep unproven live capabilities explicitly pending; do not substitute
fixture results for live evidence.
```

## Foundation import

Unibase PR #44 merged T03-T06 at `327bc01ed1ec4ca1dfbacd8ca7cdd64118a5f1b1`.
The template update imports that pinned revision, including the shared T01 commerce
and measurement contracts, while retaining Unitale booklet contracts and the T02
Dify harness. Template version remains 0.4.0; this is a main-commit import, not a
new template release. At this checkpoint, T13 awaited T07-T12 integration.
See [foundation services](../booklet-foundation/services.md) and
[billing compatibility](../booklet-foundation/billing-compatibility.md).

Import verification: 65 focused TypeScript tests pass across the foundation, Dify,
booklet and payment suites (the affected payment suite was rerun after correcting
its hardcoded template namespace). All 12 deployment configuration tests pass after
making their database fixtures project-aware. Typecheck, lint, build, docs, i18n,
skills, template and environment checks pass. No dependency versions changed.
The full deployment suite and live provider acceptance were not run for this import.

## Orders and promotions import

Unibase PR #45 merged accepted T07-T08 at
`b2fb215496f2ff6dfcab6f2dd33e4e0b7bd30907`. Unitale imports that exact revision
through the template helper, retaining project contracts, Dify fixtures and the
project-aware payment/deployment tests. See [orders and promotions](../booklet-foundation/orders-promotions.md).
At this checkpoint, T13 awaited T09-T12; no live provider activation or deployment was included.
The combined commerce, wallet, Run, payment, booklet-contract and Dify suites pass
98 tests. The disposable MongoDB fixture required forced shutdown during teardown;
the runner completed successfully. Typecheck/build and repository checks are recorded
in the integration PR.

## Provider billing import

Unitale imports Unibase PRs #46 and #47 at
`4760ecacda76df55c2836cb370a2db77990b4ab5` using the template helper. The import
includes T09/T10 and the audited fixes for checkout return routes, resumable Stripe
recovery, Play cancellation during pending plan changes and unpaid coupon release.
Template version remains 0.4.0. Unitale's configuration, booklet contracts, Dify
harness and prior project-specific test adaptations are retained.

The combined provider, commerce, wallet, legacy payment, booklet-contract and
Dify suites pass 102 tests. Deployment checks cover configuration and the provider
credential boundary; the contract test uses synthetic MCP metadata rather than
assuming a staging installation. Typecheck, lint, build and repository check
results are recorded at handoff. See [provider billing](../booklet-foundation/provider-billing.md).

The imported `core:0003-provider-billing` migration adds billing indexes when a
separately authorized installation runs migrations. No existing database was
changed, and no providers, purchase catalogs or subscriptions were activated.
This checkpoint supplied the prerequisites for the T11/T12 import below.
Live Stripe/Play and Android acceptance remains T28.

## Commerce administration and Android import

Unitale imports [Unibase PR #48](https://github.com/Uniwares-LTD/unibase/pull/48)
at `cee55c143c9f19a3e2a454c087b7d6fefe9d20dc` through `template:update`.
The import adds T11 native catalog purchases, restore/deferred changes, and T12
commerce administration. Template version remains 0.4.0. Project identity,
booklet contracts, the offline Dify harness and prior project-specific tests are
preserved. No new dependency version or database migration is introduced.

The imported foundation passes disposable-database commerce, billing, MCP,
migration, wallet, Run and project contract/payment checks. Unitale Android
regeneration and offline `:app:assembleDebug` pass with all 31 tasks executed,
using the verified SDK/cache and fixture identity `test.unitale.billing`.
See [Android verification](../../android.md#verification-status) for artifact
identity and remaining real-device gates. Web/build and repository check results
are recorded in the integration PR. Two same-agent read-only reviews cover the
final integrated state; no independent-agent review is claimed.

T13's template integration and local compatibility are complete. This does not
activate providers, create production purchase offers, apply migrations to an
existing installation or complete the booklet-specific T14-T27 work. Operator
installation and live acceptance remain separately authorized.

## Verification and review scope

T02 implements offline candidate graphs, deterministic fake providers, executable
Code-node/adapter checks and existing-transport integration tests. It requires no
environment file, database, Dify instance or paid calls. No production registrations,
endpoints or dispatcher changes are included. Dify engine/plugin and real-provider
acceptance remain T28 gates. T18–T20 reuse the candidate contracts and checks.

Use focused tests plus `npm.cmd run typecheck`, `npm.cmd run lint`, and
`npm.cmd run build` for runtime changes. Run applicable `check:docs`, `check:i18n`,
`check:skills`, `check:env` and migration tests. Verify ownership, full encoded MCP
bounds, duplicate starts/payments/revisions, immutable snapshots, stage-lock races,
unknown-outcome reconciliation, repair exhaustion, original hashes, generated workflow
parameters, varied/RTL packages, subscription/coupon races, share revocation and cleanup.
UI acceptance includes desktop/390px, keyboard, en/ar and English/LTR administration.
Preserve old sample Runs, purchases, credits and artifact history. Offline results
cannot stand in for T28. Same-agent read-only reviews must be identified as such.

## Verified progress and resume

T01 work branches were Unitale `task/booklet-generation` and Unibase
`task/booklet-foundation`; both were merged into their respective main branches.
T02 work branch: Unitale `task/booklet-dify-compatibility`. Accepted PRD and
dependency graph are persisted. T01 and offline T02 were implemented at this checkpoint; the table above records
subsequent foundation progress.

T02 adds [candidate graphs, fake adapters and the compatibility report](dify-compatibility.md).
`npm.cmd run test:booklet-compat` passes eleven tests. The affected existing Dify
transport and T01 suites pass 22 tests. Full `typecheck`, lint, `check:docs`,
`check:i18n` and `check:skills` pass; final test-support fixes also pass typecheck
and focused lint. No build was required: only test support, a test command and
documentation changed, with no production imports or dependency changes.
`handbook:ready` retains the pre-existing unset tracking, issue-language and
integration-branch warnings. Two consecutive final read-only reviews use the
same-agent cold-review fallback; no independent reviewer or delegation is claimed.
The user accepted T02's offline scope on 2026-11-03. Publication remains separate.
T28 retains actual Dify engine,
plugin, native-file delivery, live image quality and provider-cost acceptance.

T01 now has opt-in Zod contracts and fixtures for catalog terms, consumption orders,
subscriptions/promotions, measurements, booklets, productions, immutable revisions,
decisions, operations, original receipts, quality, manifests and specialist envelopes.
No runtime registration, database migration, billing service or workflow is implemented.
See [compatibility](contracts.md) for the boundary between parsing and authorization.

Validation of the working changes:

- Unibase: seven contract tests, `typecheck`, full lint, build, `check:docs`,
  `check:i18n`, `check:skills` and `handbook:ready` passed. Final contract changes
  were also checked with focused lint and typecheck. The final review corrected
  publication audit UID validation to match existing account UIDs and added a
  regression test. The application build evidence remains applicable: these opt-in
  contracts have no runtime importers, and the correction changes no bundled module.
- Unitale: nine contract tests passed with its own installed dependencies; full
  `typecheck`, lint and build passed. `check:docs`, `check:i18n` and `check:skills`
  passed. Handbook readiness reports pre-existing unset tracking, issue-language and
  integration-branch preferences; those settings were not changed.
- Early Unitale checks during dependency extraction failed on missing packages and
  native-file locks. Installation subsequently completed offline from Unibase's cache.
  The final typecheck and build ran outside the sandbox because SWC's user-owned
  native cache rejects the sandbox identity. No dependency versions or install-script
  permissions changed.
- Same-agent read-only inspection found and corrected ambiguous creative identities,
  inadequate initial-image budgets, quality contradictions, preallocated child
  workflow identity and publication audit UID compatibility. Following the final
  correction, two consecutive same-agent read-only passes found no blocking issues
  in the unchanged source/test state. This was not an independent-agent review.
- The prior approval-review timeout is resolved. User-authorized `gh repo view`
  verified both repository identities/access; local Git status, complete tracked
  diff, untracked source inventory and `diff --check` succeeded. The generated
  Unibase `.npm-cache/` directory is outside the product change and must not be staged.

Bases: Unitale `446a6c3a3412a45680e4aa6d996d7ca89986d0b0`; Unibase
`7b6086ca2c3f368fe934bbec0afafde9d4292dba`. T01 changes are maintained on the
work branches above; publication and live acceptance remain separate gates.

Current resume: T01-T13 foundation work and T14 repository implementation are
locally verified. T15 (lifecycle) and T16 (original media) can now proceed in parallel;
T18/T19 remain independently available. The integrated product is incomplete and
real provider/store/device acceptance remains T28.

### T14 repository checkpoint

Implemented four Unitale-owned collections: `bookletBooks`, `bookletProductions`,
`bookletRevisions` and `bookletRepositoryWrites`. The production embeds subjects
and artifact pointers; there are no separate subject/artifact collections or
independent artifact versions. Strict persistence schemas are separate from v1
workflow DTOs. See the [model and remaining integration work](model.md#implemented-and-remaining-decisions).

Owned reads, scoped cursor pagination, order-bound creation, mutation leases,
monotonic fencing and transactional revision/pointer/idempotency writes are implemented.
Production/revision BSON defaults are 1 MiB/4 MiB. Manifest records remain unapproved
drafts; there is no API for approval, charging, stage transitions or completion.
Creation accepts an existing transaction containing its order. The namespaced
`booklets:0001-repositories` migration only creates indexes; no existing data is
converted. No Unibase change/import or live migration was performed.

Verification on 2026-11-07:

- `npm run test:booklet-repositories`: 16 tests pass, including the canonical JSON
  example, concurrent writes, rollback, replay, ownership, bounds and fencing.
- Existing booklet contracts, offline compatibility, MCP foundation, migration and
  legacy artifact revision suites: 32 tests pass.
- Typecheck, lint, build, documentation, environment, i18n and skill checks pass.
- Broader `npm test`: 106/107 pass. The pre-existing auth-policy test expects
  `demo-unibase` instead of Unitale's `demo-unitale`; its source is unchanged from
  HEAD. This is a baseline test expectation, not a T14 regression.
- Handbook readiness retains the existing tracking/preference warnings.
- Final review uses two consecutive same-agent read-only passes; no independent
  reviewer or delegated review is claimed. Commit/merge remain separately authorized.

### T15/T16 service checkpoint

Implemented Unitale lifecycle services, prepaid Run admission and the booklet domain
adapter. Production start/continuation/revisions reuse Unibase commerce transactions;
no second Run charge is permitted. Exact-revision human approvals, stale-source
checks, stage locks, paid source-production reuse, quality evidence gates, bounded
repair admission and manifest completion are covered by disposable-database tests.

Original image bytes are retained unchanged in local private binary parts or the
existing configured private object store. Immutable receipts, separate derivatives,
atomic revision attachment, ordered subject-specific reference routing and reviewer
input assembly preserve hashes and ownership. Storage response loss retries the
same receipt without generating another image. Migration
`booklets:0002-lifecycle-media` creates indexes only, including repeated-run tests.

The canonical [model](model.md), JSON examples and both Mermaid views reflect actual
collections and embedded fields. The new command is
`npm run test:booklet-lifecycle-media`. No Unibase edits/import, public routes, MCP
tools, production workflow registration, provider generation, live migrations or
publication were performed. Existing interfaces remain unchanged.

Local verification on 2026-11-07: the new service suite has 12 passing tests;
the combined repository, contract, offline Dify, commerce, evidence, MCP, migration
and legacy artifact suites have 80 passing tests. Typecheck, lint, build, documentation,
environment, i18n and skill checks pass. The parallel combined test run required
MongoMemoryServer's forced-stop fallback for two disposable fixture processes;
a serial rerun passed all 80 tests without cleanup warnings. Focused regressions also verify logical-Run evidence protection and display derivatives after entitlement expiry. Final read-only reviews are
reported in the implementation handoff; no independent reviewer is claimed.

Verification on 2026-11-08 after recovery, revision-continuation, repair-allocation and successive-reuse
corrections: all 16 lifecycle/media tests and all 84 tests in the combined affected
suite pass. Regressions cover retained-output attachment from a verified terminal
Run (including an unknown image outcome), no duplicate charge/generation, an
allocation's inability to reset its repair budget, and original/derivative access
through three explicitly accepted paid productions. Revision continuations retain
their original allocation scope without another charge, respect revocation, and
cannot reset repair budgets; a new revision request replaces the scope. The focused
and combined runs passed with MongoMemoryServer's forced-stop cleanup warning.
Typecheck, lint, build,
documentation, environment, i18n and skill checks pass. Typecheck and build run
outside the sandbox because SWC's native cache rejects the sandbox user.

T17 consumes this service checkpoint. T18/T19 remain independently
available; T20 wires actual specialist/reviewer publications and enforces provider
spending, text-call, elapsed-time and workflow-step limits. T21 supplies the creator
workspace and rich image review presentation. These server-service results are not
live Dify, visual-quality or end-user journey acceptance; those remain their assigned
tasks and T28. Commit, merge and deployment still require explicit authorization.

### T17 MCP checkpoint

The `booklets` extension registers fifteen versioned tools through `/api/mcp`.
The [catalog guide](../../mcp.md#unitale-booklet-catalog-t17) documents permissions,
automatic Run scope, version/fence checks, exact human decisions, bounded transfers,
quality evidence and manifest completion. There are no additional tool endpoints,
dispatcher changes, provider calls or Unibase edits/imports.

Private transfer metadata, parts, cumulative budgets and server-owned reviewer
bindings are reflected in the model guide, JSON example and regenerated diagrams.
Migration `booklets:0003-mcp` adds indexes only. Diagnostic transfer completion
retains its idempotency receipt and discards raw staging bytes; remaining staging
cleanup belongs to the later retention work. T19/T20 must provision verified
reviewer bindings and trusted measurements before quality calls can succeed.

Local verification on 2026-11-08: `npm run test:booklet-mcp` passes seven tests.
The combined repository, lifecycle/media, contract, offline Dify, commerce, evidence,
MCP, migration and legacy artifact suites pass all 98 tests. Typecheck, lint, build,
documentation, environment, i18n and skills checks pass. An initial combined run
emitted MongoMemoryServer's forced-stop warning; the final 98-test run passed.
Two consecutive same-agent read-only reviews are reported in the handoff, with no
independent reviewer claimed.

Additional existing Dify registration coverage is not green: nine subtests plus
their parent fail with `DIFY_ENVIRONMENT_OWNERSHIP` (five tests pass). The same
failures reproduce in a disposable detached worktree at unchanged base
`ad8dd8fe736823b757da3d6701785b2cd3a567f8`. This is a pre-existing registration-fixture
or environment-binding issue, not evidence of live Dify compatibility. T17's new
catalog uses the real MCP handler with a fake identity provider and disposable
database; T28 still owns real provider/Dify acceptance.

T18 specialists and T19 visual reviewer are next and may proceed independently.
T20 manager composition requires both plus T17. Commit, merge, publication and
deployment remain separate authorized actions; no live configuration was changed.

Review follow-up: original-image MCP reads now reuse a bounded cache of fully
verified bytes and recheck authorization for every chunk. The focused lifecycle/media
and MCP suites pass 24 tests, including local/object storage read counts, fresh Db
handles, idle expiry, foreign ownership and deletion after cache population. The
Mongo fixture emitted its forced-stop cleanup warning. This correction adds no
persistence fields. The separate 100-item manifest source/asset transport limit
finding remains unchanged, as requested; it still needs resolution before accepting
larger packages through the complete MCP production path.
