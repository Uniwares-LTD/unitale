# Implementation plan

Accepted milestones for Unitale. Accepted milestones authorize
implementation without a new issue; add them here as they are agreed.

## Current state

Created from template 0.4.0; current exact template adoption is recorded in
`project.source.json` (0.5.0).

## Unibase 0.5.0 candidate import

Accepted for local implementation on 2026-11-21, based on Unitale
`d78ad24b1d95205592b37b92c9b2a181a72fc288`. The exact upstream candidate is
`2c13d814c02f512edd9acbd3a27a41f530b0aec5`; no `template-v0.5.0` release tag
was available at selection. The task branch is `task/update-unibase-0-5`, targeting
Unitale `main`. Preserve the separate Booklet work branch.

The local import includes the optional runtime/MCP extension seams, generated
design foundation, shared UI helpers, Sonner 2.0.8 and its exact stylesheet CSP
hashes. Unitale identity, modules, tracking and deployment bindings are retained;
project theming remains disabled. The offline page is regenerated from its source.
No Booklet model, schema, storage or persistence contract changes, so its model
guide, JSON example and Mermaid diagrams are unaffected. No new migration or
provider activation is required by this delta.

Local implementation and verification are complete. The import also corrects
test fixtures that assumed Unibase's identity: authentication defaults, MCP
identity probes, environment tags and the private-context provider now follow
the project configuration. Application authorization is unchanged.

Verification on 2026-11-21:

- Clean lockfile installation, typecheck, lint, build and `check:env` pass.
- Unit tests: 128 passed. Account tests: 351 passed, with the optional Redis
  diagnostic-limiter test skipped because no disposable Redis was configured.
  Booklet compatibility: 11 passed. Handbook tests: 14 passed.
- Docs, i18n, skills, template, samples, Handbook readiness and entrypoints pass;
  Handbook sync reports no drift. Both disposable initialized projects build
  independently with isolated namespaces.
- Production-browser checks cover all 24 public preset/theme/width/locale
  combinations, member profile/leave-guard/preference/file journeys, Run and
  credits pages, and nine administrator routes at desktop and 390px. English/LTR
  administration restores Arabic/RTL public presentation without changing its
  preference. Keyboard focus, RTL dialogs/sheets and reduced motion pass.
- A profile save renders a styled toast. Navigation preserves the document nonce;
  injected served-document scripts execute with its nonce and are blocked without
  one. The documented upstream Zod eval capability probe remains blocked; no CSP
  relaxation was added for it.

Tests use installed Git 2.43 and the repository-cached MongoDB 8.2.6 binary.
Python-backed fixtures use `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` on Windows.
PR verification also exposed inherited deployment fixtures that assumed Unibase's
slug and activation defaults. They now derive project identity and establish their
own synthetic MCP/settings scenarios. Portable deployment verification passes 63
tests; 25 host tests require the CI runner's owned Linux container. Deployment
configuration is unchanged. The client-message generator sorts normalized page
paths, with literal routes before dynamic routes, so Windows and Linux produce
the same inventory. All 24 route selections are preserved, including `/runs/new`;
a runtime regression test checks its start action messages. Verification also
passes with reversed directory enumeration. CI's disposable deployment container
passes 86 tests; two tests requiring an Infrastructure checkout are skipped there
and pass in the local portable suite against the available checkout.
Two consecutive same-state, same-agent read-only review passes accompany the
final handoff; no delegation was authorized. Local evidence is under ignored
`output/unibase-import/`.

Commit, push and PR publication for this reviewed import were authorized on
2026-11-21. Integration targets Unitale `main` through a PR; PR merge and deployment
remain separate decisions. Upstream adoption records are historical evidence,
not Unitale verification. Operator intervention: none for this local import.
No live operations, provider activation or Booklet checkpoint implementation are
included.

Handbook baseline: `D:\misc\code\uniwares\handbook` at
`c1b6166437ba729b59723a7dd4066c78e2f15185`.

## Local Google popup sign-in

The [Unitale adoption record](features/local-google-popup/adoption.md) owns the
main-first import of exact reviewed Unibase `02517797c9ecd1d8e9696cd1b68c9b976f2105db`,
local setup and acceptance. Unitale [PR #15](https://github.com/Uniwares-LTD/unitale/pull/15)
merged it into `main` at `528d0a1cf340bad28369bc467776492f2ade6b12`; this normal main
merge brings it into issue #10. The earlier PR #14 import and its Booklet regression
evidence remain [historical adoption evidence](features/booklet-generation/implementation-plan.md#local-google-popup-adoption).
Existing session handling, emulator/staging/production redirects, private configuration
and the separately preserved setup baseline `141eb33` remain unchanged.
Checkpoint 10 remains unimplemented.

## Open work

Booklet generation is accepted for implementation. The [PRD](features/booklet-generation/prd.md)
owns requirements; the [delivery plan](features/booklet-generation/implementation-plan.md)
owns task dependencies, verification and the resume point. No production packages
are seeded. Publication, provider activation and paid acceptance remain separate gates.
Issue #10's [workflow design](features/booklet-generation/workflow-design.md) records
the current ownership decisions and integration gaps. The authorized 01-06 package
local candidate is complete on `feature/10-dify-workflow-design` from `713da2d`.
The [candidate README](features/booklet-generation/workflow-package/README.md)
records current checks/reviews. Follow the
[compatibility runbook](features/booklet-generation/workflow-package/integration-handoff.md#difyprovider-compatibility-procedure)
before relying on target bindings; checkpoint 09 is Verified locally.

The user subsequently requested committing the reviewed candidate/plan and executing
approved scope B. Baseline committed as `2dc7b8c`; 07 local storage is complete and reviewed,
with reviewed 08 imports through Unibase `a7eda79b0f7c77732913e3a6b82a6eab3f6485fe`.
Tasks 09.1-09.7 are Verified locally; checkpoint 10 remains unimplemented.
The active goal stops before checkpoint 10 implementation.
Live operations, scope C and paid calls remain gated. The
[remaining 07-12 plan](features/booklet-generation/implementation-plan.md#remaining-implementation-kickoff-and-ownership)
aligns T18-T21, fixes Unitale/Unibase ownership and groups approvals at kickoff/final
acceptance. It includes snapshotted action retries (LLM 2, image 0, retriable non-paid 3),
automatic evidence reconciliation, preserved correction counters and explicit retry/
continuation controls. The local backend/native Code boundaries are implemented and
fixture-tested; creator controls/admin settings remain checkpoint 10, target execution 12.
T18-T20 candidates are locally implemented; integration/acceptance remains pending.
T21 includes all six creator outcomes through existing Run UI, including quote/consent
and accessible history. Earlier authorization covered DSL-first workflows, essential
inline checks, fixtures/tests and documentation. The custom Python plugin, TypeScript authoring
framework and graph interpreter are withdrawn. The delivery plan's necessity and
simplicity gate applies to every further change.

Checkpoints 01-06 deliver seven readable YAML workflows, a locally validated candidate
and the minimum application integration handoff. The user explicitly confirmed the
initial stop at the validated Dify/provider handoff. Scope B for minimal checkpoints
07-11 is now approved, including scoped commits/pushes/PRs/merges/imports after checks.
Checkpoint 07 v2 content/revision/work/assessment/acceptance/checkpoint storage is
complete locally, with unchanged v1 behavior. Checkpoint 08 imports reviewed Unibase
PRs #49/#50/#52 through exact revision `a7eda79b0f7c77732913e3a6b82a6eab3f6485fe`;
local gateway/recovery and final 09.7 reviews pass, with 10-12
creator UI/integration/acceptance remaining. No temporary tunnel
is planned: local MCP contract checks precede live conversion proof in 12. Scope C
remains pending, with a selected US$3 future provider cap and no spending approval. The user authorized
committing/pushing this candidate and updating issue #10 on 2026-11-09; that does
not itself authorize merging, deployment or provider activation; later B covers only
scoped code merges, while deployment/provider activation remain C.
Current replacement evidence is in the candidate README; superseded completion claims
and test counts do not carry forward. Unverified live capabilities remain pending.
Authorized no-money staging probes now establish disposable import/readback and native
child/file/control/Human Input behavior. Those probes did not establish provider
execution or application integration; the README records their corrected defects and cleanup.
The separately authorized [upstream provider patch](features/booklet-generation/workflow-package/integration-handoff.md#prepared-upstream-patch)
passes frozen-lock tests/packaging. PR #4238 was closed at the user's request;
the user now accepts SDK retries, default timeout and the Sunburst alias under the
[provider tradeoffs](features/booklet-generation/workflow-package/integration-handoff.md#accepted-provider-tradeoffs).
Reuse the installed shared providers unchanged; isolated local builds are optional historical remediation. The user's earlier
full-compatibility authorization covered compatibility work and US$1 total probe
spending; it is historical evidence, not a new spending allowance. Temporary namespaced test copies preserve the shared experiment
plugins; actual Luna structured output, Sol vision and dated Sunburst Generate/Edit
probes pass after two native DSL corrections. Provider feasibility is established for
the isolated candidate. The handoff records US$0.1201188 in usage-based estimates,
retained liabilities and the US$1 cap. All eight disposable apps and both test plugin
installations have been removed; the original apps/shared providers remain unchanged.
The historical provider authorization did not authorize application work; current B
approval is recorded above. Upstream release is withdrawn as
a dependency; shared-provider import/readback passes; actual application bindings and integrated
acceptance remain pending, and
production activation remains disabled.

Manager controls paid dispatch; per-production usage ceilings remain app safeguards,
with labelled estimates and independent progress during unresolved child calls.

## Booklet plan refresh after Unibase 0.5.0 merge

On 2026-11-21 issue branch merge `dfa8d30` incorporated main `99cb6b5`.
The [remaining Booklet plan](features/booklet-generation/implementation-plan.md#refreshed-baseline-and-design-handoff-2026-11-21)
now maps the pinned Unitale design reference to the existing 10.1-10.7 tasks and
11/12 verification/approval gates. It reuses adopted UI helpers without enabling a
project theme or implementing a new chat/product flow. The local-popup adoption now supplies passing production build, subsequent
typecheck and lint results; current checks and their limits are recorded there. This is a planning update; checkpoint 10 remains unimplemented.
