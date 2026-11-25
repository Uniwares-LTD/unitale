<!-- Fill in what you know; delete sections that don't apply. -->

## Outcome

What changed and why. Link related work with ordinary references (for example
"Related to #123"), not closing keywords.

## Verification

Run `npm run validate:changed -- --base origin/main --head HEAD` on the clean PR head.
Paste the concise local report from the directory printed by the command. Include
the tested SHA, scope, commands, durations, outcomes, manual verification and
material skips. Refresh affected evidence when the PR head changes.

## Template changelog

In the template, the `Unreleased` entry in CHANGELOG.md, or "None". Derived projects delete this section.

## Deployment

Operator intervention: None, or list owner, location, ordering, verification and
failure/resume steps. Do not repeat completed installations for documentation-only changes.

Before deployment: "None", or `B<number>-<slug>` actions with required/advisory
classification, owner/location, verification and failure/resume. Required actions
cannot be skipped to proceed.
After deployment: "None", or `A<number>-<slug>` actions in the same format.
Merging is not deployment; link the exact release and migration status evidence.

## Test flow

"None", or the role, starting state, actions and expected result for acceptance.
Keep these scenarios separate from deployment actions. Promotion PRs link back here.

<!-- For an environment promotion, use docs/templates/promotion-pr.md instead. -->
