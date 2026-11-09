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

The current session authorizes DSL-first workflows, essential inline checks,
fixtures/tests and documentation. The custom Python plugin, TypeScript authoring
framework and graph interpreter are withdrawn. The delivery plan's necessity and
simplicity gate applies to every further change.

Checkpoints 01-06 deliver seven readable YAML workflows, a locally validated candidate
and the minimum application integration handoff. Stop before 07. Application changes,
live operations and paid calls require separate authorization. The user authorized
committing/pushing this candidate and updating issue #10 on 2026-11-09; that does
not authorize merging, deployment or provider activation.
Current replacement evidence is in the candidate README; superseded completion claims
and test counts do not carry forward. Unverified live capabilities remain pending.
Authorized no-money staging probes now establish disposable import/readback and native
child/file/control/Human Input behavior. Provider calls and application integration
remain pending; the README records the two corrected import/runtime defects and cleanup.
The separately authorized [upstream provider patch](features/booklet-generation/workflow-package/integration-handoff.md#prepared-upstream-patch)
is prepared and passes offline tests. It changes the existing official plugins only;
upstream submission, release/installation and provider execution remain pending.

Manager controls paid dispatch; per-production usage ceilings remain app safeguards,
with labelled estimates and independent progress during unresolved child calls.
