<!-- Promotion starter adapted from the user-supplied promote-to-environment template.
Fill the body, then remove comments, placeholders and inapplicable sections before publication.
Use main -> _staging (staging) or main -> _prod (prod), unless another source is explicitly approved.
This template does not authorize publication, merge, deployment or database work. -->

Promotes `<source>` to `<target>` (`<environment>`).

- Reviewed source or approved delivery-branch head: `<full SHA>`
- Reviewed target head: `<full SHA>`
- Expected deployment workflow: `<actual workflow name and link; explain if none>`
- Candidate image: `<immutable digest when available, otherwise not built>`

## Conflict resolution

<!-- Remove if there are no conflicts. State each conflicting file, the resolution
and any retained text from the other side. Link review of the resolved result.
Changes to the reviewed head or intended merge result require renewed review. -->

## Included issues

<!-- Use actual issue/PR references, not inferred issue numbers from titles.
Keep accepted work with no issue. Mark "already on target" only after verification. -->

- #<issue> — <short title> (#<PR>, #<PR>)
- No issue — <short title> (#<PR>)

## Before deployment

<!-- Write None, or one action per line. Include required/advisory classification,
owner, execution location, verification evidence, failure/resume and runbook link.
Attribute the source PR or "found in diff review". Required actions block activation
until verified; done/skip answers alone are not execution evidence. -->

- `B1-<slug>` — <requirement, owner/location, verification, recovery, source and runbook>

## After deployment

<!-- Write None, or actions in the same format. For compatible pending migrations,
record the approved automatic run or manual-workflow handoff. Deferred compatible
work stays pending with a reason; a successful release does not complete it. -->

- `A1-<slug>` — <action, owner/location, verification, recovery, source and runbook>

## Test flows

<!-- Write None, or link each source PR's Test flow. These are user/QA acceptance
scenarios, not deployment actions; do not ask done/skip for each flow. -->

- #<issue> — <link to Test flow in source PR>
- No issue — <link to Test flow in source PR>

## Deployment and migration results

<!-- Before merge, state Not run. Update only with verified results after authorized
operations. Record the merge SHA, exact workflow run and serving revision/image,
health, labeled action state and outstanding acceptance. A later unrelated successful
run does not confirm this candidate. Link migration operation/plan status and the
verified database backup ID when applicable; Git branches are not data backups.
Exclude credentials, raw logs and private backup locations. No issue closure is implied. -->
