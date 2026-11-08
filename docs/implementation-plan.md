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
the current ownership decisions and integration gaps. The local environment is prepared
and the plan finalized for a new 01-06 implementation session; the present handoff
creates no package/application implementation.

The user authorized environment preparation, finalizing the issue #10 plan and
supporting docs, and committing/pushing this handoff, without package implementation.
The delivery plan now defines semantic checkpoints 01-12.
01-06 deliver package-local contracts, the provider plugin, focused workflows/Reviewer,
Manager and a locally verified candidate package with an exact application-change
handoff. There is a hard stop after 06: 07-11 require explicit authorization for
Unitale/Unibase runtime contracts, shared seams, gateway/recovery and Run UI integration.
12 is separately gated staging publication and paid acceptance. Earlier live probes
also require exact scoped authorization; authoring is not proof of deployed behavior.
The [A01-A22 register](features/booklet-generation/workflow-design.md#implementation-readiness-audit)
links selected design resolutions to their canonical contracts and required proof.
G implementation gaps and live E1-E5 gates remain pending. E6 has a fresh local
baseline for the current source; each implemented checkpoint still needs its own
checks. Documentation is not permission to implement/publish/run paid calls.
Manager controls paid dispatch; per-production usage ceilings remain app safeguards,
with labelled estimates and independent progress during unresolved child calls.
