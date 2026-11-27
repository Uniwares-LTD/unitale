<!-- Large-work starter: use the repository's canonical location; omit irrelevant sections. -->

# <Feature name> implementation plan

## Contract and decisions

Link the accepted PRD and issue. Record scope/exclusions, relevant repository revision,
Handbook baseline for handoff, and resolved implementation choices. Cover interfaces,
data, compatibility, failures and migration/rollout only where relevant.
Identify any explicitly accepted open decision and the boundary it blocks.

## Execution prerequisites

Required environment and checks, existing implementation authority, and missing
approvals/manual actions. Identify human gates while the plan is reviewable; do not
treat plan acceptance as publication or deployment authority.

## Checkpoints

Repeat for each cohesive, verifiable outcome. Prefer automatic continuation.

### <Checkpoint and outcome>

- Requirements and prerequisites:
- Implementation boundaries, decisions and exclusions:
- Acceptance, verification commands and manual evidence:
- Review scope: two clean read-only reviews of the same state. The final checkpoint covers
  the complete integrated diff against the issue base.
- Continuation: automatic, or a named human gate with reason and required action.

## Verified progress and resume

Record the approved plan and governing PRD fingerprints using the large-work
handoff procedure. Keep all approved instructions above this final heading.

Update this section during execution, not as a speculative work log. Record completed
checkpoints, source/diff identity, current validation, review results, remaining gates
and next action. Relevant changes reset review counts and stale affected evidence.
Inspect actual state before resuming or retrying an operation with an unknown result.
