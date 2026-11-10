# Implementation plan

Accepted milestones for Unitale. Accepted milestones authorize
implementation without a new issue; add them here as they are agreed.

## Current state

Created from template 0.4.0.

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
before relying on target bindings; checkpoint 07 is the next application gate.

The current 2026-11-10 run authorizes documentation/planning only, not application or
workflow implementation, commits, pushes or live operations. The
[remaining 07-12 plan](features/booklet-generation/implementation-plan.md#remaining-implementation-kickoff-and-ownership)
aligns T18-T21, fixes Unitale/Unibase ownership and groups approvals at kickoff/final
acceptance. It includes snapshotted action retries (LLM 2, image 0, retriable non-paid 3),
automatic evidence reconciliation, preserved correction counters and explicit retry/
continuation controls. These are planned changes, not current runtime capabilities.
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
Implementation has not started; this turn only reconciles docs. No temporary tunnel
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
