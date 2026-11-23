# Reusable backup and migration operations

## Contract and decisions

[Issue #62](https://github.com/Uniwares-LTD/unibase/issues/62) defines the operational
outcome. The current session authorizes complete local implementation and disposable
verification across Unibase, Infrastructure and Handbook. The later session also
authorizes publication/merge and operational setup (controller, executor trust and
isolated restore). Deployment and live migration require their concrete reviewed
action/plan. The accepted design
below was written during the preceding documentation stage; its contract controls the
implementation. [Progress](#implementation-progress-2026-11-21) records current evidence
and remaining operational gates.

The goal is a reusable operator path for backup-only work, migrations on demand,
and migrations required by deployment. Unibase staging is a later acceptance case,
not the source of hard-coded identities or a separate execution path. Manual means
operator-invoked through the restricted interface; it does not mean an ad hoc host
shell sequence.

This plan uses the local implementation-plan starter. The inspected Unibase base
is `2878df4474ecc2b93cbb0f292515c22b1f866a5d`; the inspected Infrastructure base is
`562c1f1168a3147b04c6e363e5f2170e3054c3ae`. Shared guidance is
`Uniwares-LTD/handbook` at revision
`c1b6166437ba729b59723a7dd4066c78e2f15185`. These are planning references, not
approved live operation identities.

### Current capabilities and gaps

| Area | Existing behavior | Proposed capability |
| --- | --- | --- |
| Migrations | `db:migrate` applies all eligible pending core and enabled-module migrations; ledger and renewable lease prevent ordinary duplicate execution | Read-only candidate/target report, release classification and exact approved batch |
| Indexes | `db:indexes` prepares indexes; provisioning runs indexes before migrations | Preserve that ordering inside the approved operation |
| Recovery | Infrastructure prepares approved encrypted MongoDB/GridFS backup and restore operations | Reuse backup creation and verification inside an approved migration operation |
| Approval | Infrastructure binds immutable plans to one-use OIDC approvals and records checkpoints | Add a bounded migration executor and database/batch/backup requirements to the approved identity |
| Deployment | Release checks host compatibility and application readiness; routine release does not execute migrations | Agent reviews requirements before deployment and offers automated or manual migration execution after successful compatible deployment |
| Status | Infrastructure has private operation journals/status; the app has an admin Operations page and authenticated diagnostic reads | Expose recorded outcomes through workflow reports, the existing diagnostics API and the existing admin page |

The migration runner is mutating; it is not a status or dry-run command. A failed
migration can leave partial data changes without its ledger entry. A changed
checksum is currently reported and never rerun. Backup tooling existing in source
does not prove that a target has configured, verified recovery.

### Ownership and reuse

- Unibase owns migration declarations, enabled-module selection, classification,
  existing runner/ledger semantics, application checks, diagnostic status reads/admin
  presentation and derived-project guidance.
- Infrastructure owns restricted dispatch, trusted controller installation, OIDC
  enforcement, host operation locks, backup/recovery execution and private journals.
- Operators approve exact plans and resolve uncertain state; application owners
  accept affected behavior. Neither credentials nor documentation assigns a human
  owner. Unrelated services retain their existing owners.
- Resolve application, environment, database, image and configuration identities
  from the destination's reviewed configuration and observed state. Do not copy
  parent project bindings, credentials or Unibase migration IDs into generic logic.

### Release classification

These are planned policy decisions, not gates installed by this documentation.

| Classification | Release decision | Execution |
| --- | --- | --- |
| Before release | Block candidate activation while required IDs are pending | Backup, indexes, migrations and verification before activation; changes must remain compatible with the serving release |
| After release | Candidate may serve with these IDs still pending | Report the outstanding work and run the same approved workflow separately |
| Bespoke recovery required | Block the generic path | Named owner supplies compatibility, maintenance and recovery acceptance before a separate reviewed procedure |

Migration authors must document classification, compatibility with retained images,
verification and interruption/retry behavior. Unclassified, destructive or incompatible
changes require bespoke review. Checksum drift stops automatic migration approval
and release eligibility until reviewed; it never authorizes rerunning a released ID.
Report ledger entries absent from the candidate without deleting them or assuming
they are corruption: removed modules and newer database history need compatibility
review. Disabled owners are reported and excluded from the eligible batch.

For the inspected Unibase declarations, the three commerce IDs listed in #62 are
before-release work because they establish correctness indexes, including uniqueness
constraints. `runs:0001-domain-references`, `runs:0002-asset-variants` and
`notes:0001-default-pinned` are after-release backfills: legacy Run references have
a runtime fallback, image originals remain usable, and notes add a default field.
Review these decisions against the exact future candidate. They do not establish
which IDs are pending on staging or retroactively invalidate the serving release.

## Proposed operator workflows

The original documentation stage installed no executable commands or workflows. Names
and interfaces are fixed in the implementation contract below. Extend the existing
`deploy:ops`/Infrastructure plan, apply and status interfaces rather than creating a
second approval engine or migration runner. Both operator invocation and deployment
integration use the same reporting, approval, execution and recovery contracts.

For agent-triggered deployment, the agent presents the concrete migration
requirements and asks for user approval before triggering the deployment mutation
(including merging an environment promotion PR). This approval covers the reviewed
deployment and migration ordering; it does not silently authorize a later optional
backup/migration operation. Already explicit approval for that same reviewed action
is reused. A changed revision, target or migration requirement needs renewed review.

After a successful compatible deployment with pending migrations, the agent offers
two choices: approve automated backup-and-migration now, or run the same workflows
manually. "Automatic" means this one approved operation, not future deployments,
scheduled backups or unattended migration permission. Do not ask this second question
when no work is pending or the deployment failed.

### Read-only preflight

Before preparing an operation, read serving revision/image, readiness, configured
database identity, the complete migration ledger and candidate declarations. Report
applied, enabled pending, disabled and changed-checksum IDs, unknown ledger entries,
release eligibility and one next action. Validate declaration ownership and ordering.
Do not acquire the database migration lease, create indexes, update the ledger or
execute migration bodies during reporting. Host serialization and private plan
storage are separate from database mutation.

Use trusted read-only probes and static candidate metadata during preparation;
candidate application code must not execute on the host before approval. Preserve
checksum semantics when defining future source/packaged reporting. Binding the
exact source and image also covers imported helpers that the existing function-body
checksum alone does not identify.

### Backup only

Use the existing approved backup path described in
[Infrastructure recovery](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#manual-encrypted-mongodb-and-gridfs-recovery).
Resolve the configured destination and verify recovery prerequisites. Stop the
previously running application writers, create the whole-database archive including
GridFS, verify the stored snapshot and record its identity before restoring those
writers. Never expose credentials or archive contents in public output.

The proposed verification contract includes retrieving the exact snapshot,
checking application/environment/database metadata and archive hash, and recording
the verification result. A disposable restore rehearsal is required before claiming
that target's recovery is accepted; repository checks alone are not restore evidence.
The local executor implements this contract; target recovery acceptance still requires rehearsal.

### Migration on demand

1. Produce the read-only report and prepare an immutable plan for all eligible
   pending IDs in existing runner order, including enabled module migrations.
   Do not approve only a named subset while invoking a runner that applies more.
2. Review one combined backup-and-migration approval bound to application, target,
   database, source/image/configuration identities, observed ledger, ordered pending
   IDs/checksums and backup requirements. The snapshot does not exist at approval
   time: approval binds its requirements; the executor must bind the resulting exact
   verified snapshot to the operation before any index or migration writes.
3. Under the application operation lock, acquire the existing renewable database
   migration lease, revalidate identities and the batch, then pause previously running
   application writers. Hold both locks through backup and migration so another
   runner cannot change data during the backup. Create and verify the backup, then
   persist its snapshot ID and verification checkpoint. Backup failure stops migration.
4. Invoke the existing migration runner using that same lease. Migrations prepare
   their own prerequisite indexes before dependent writes; the current batch already
   does so and needs no additional blanket index pass. Do not nest lock acquisition,
   introduce a competing lock, or change fresh provisioning's index setup.
5. Verify ledger IDs/checksums and affected data/index invariants, restore the prior
   writer state when safe, and check serving revision, web, dependencies and workers.
   Record applied and remaining IDs, backup identity and health independently.

### Deployment integration

1. Before an agent starts deployment or merges an environment promotion PR, review
   one read-only requirements report and present the exact revision, environment,
   pending batch, ordering and expected interruption. Ask for approval of the concrete
   deployment and any migration prerequisites; do not treat a generic deployment
   instruction as permission for undisclosed database changes.
2. If before-release IDs are pending, the initial review must disclose the combined
   backup-and-migration requirements. Exact execution approval follows preparation
   of the immutable candidate/plan; apply and verify it before activating that
   candidate. If declined or deferred, do not deploy the
   incompatible candidate. This exception preserves correctness; compatible work
   follows the requested deploy-then-migrate path. Because the runner applies all
   eligible pending IDs, include that complete batch in the prerequisite approval.
3. Trigger Release once for the approved environment revision. An environment-branch
   merge still starts its existing automatic workflow; do not also dispatch Release.
   A human-initiated merge has no agent chat step: it keeps the same hard compatibility
   gates and does not grant blanket permission for database mutation.
4. Require terminal deployment success, expected serving revision and health. When
   compatible pending migrations remain, the agent asks whether to approve automatic
   backup-and-migration now or use the manual workflow path. Deployment failure ends
   this sequence; no pending work means no second prompt, backup or migration.
5. Automatic choice: prepare the exact operation against the now-serving revision,
   obtain the combined execution approval, run backup, migration and verification,
   then query status and report the outcome. The post-deployment choice may itself
   approve execution if it presented the exact plan; do not add another agent prompt
   for that same unchanged operation. Existing Infrastructure approval enforcement
   still applies.
6. Manual choice: perform no database writes. Provide the workflow URL, execution
   repository/ref, target, revision, prepare/apply inputs and plan ID when available,
   together with status instructions and expected results. If a plan is not prepared,
   explain how to prepare it first. Generate instructions using the implementation
   contract below and observed values; do not substitute guessed SHAs or plan IDs.
   Explain that backup is part of the migration run and needs no separate dispatch.

Human-triggered releases publish the same pending report and manual next action in
their workflow summary, even with no agent present to ask a question. Users can query
status or resume the manual path later; the release workflow need not wait indefinitely
for a post-deployment response. Deferred compatible migrations remain visible as pending.
An agent can observe the same release's terminal result and continue the conversation;
no new persistent approval or agent-orchestration service is needed.

Recheck approved identities/state under the application lock immediately before
mutation/activation; a changed revision, target or batch needs fresh review. Reuse
the unchanged report rather than repeating the full review. Deployment retry must
not silently repeat a completed migration. A successful deployment and a pending or
failed migration are separate reported outcomes.

### Failure, interruption and recovery

Persist intent before mutation and verified results afterward. Reuse existing private
plan/status storage; sanitize public results. Kill and reap operation child processes
before releasing the host lock on handled interruption. Preserve an abrupt termination
as unknown rather than reporting success or automatically repeating writes.

Read status, full ledger, backup checkpoint and writer/container state before retry.
An applied ID is not rerun. An unrecorded migration may have partially changed data;
inspect its idempotency and invariants before approving the remaining batch. Never
force-delete a live database lease or treat expiry alone as proof a process stopped.
An unverified or uncertain write keeps writers stopped until explicit readback proves
resumption safe. A failure conclusively before data writes may restore the previous
writer state. Do not restart services that were already stopped.

A lost client response is not a second authorization. A completed operation is read
back without repeating mutations; a changed remaining batch needs fresh approval.
Version 1 has no general interrupted-operation resume engine. An unknown outcome
blocks further data operations until the Infrastructure operator inspects the journal,
ledger, backup and process/writer state and establishes a safe baseline. Recover the
original writer set explicitly when safe; never inherit it automatically into a new
plan or force-delete the lease. A known, inspected failure can be retried through the
ordinary flow with fresh backup and approval of the remaining batch. If safe normal
operation cannot be restored, stop for bespoke recovery rather than accepting a new
generic migration request. Record recovery through the root-only
[resolution procedure](#operator-resolution-and-activation-evidence), preserving the
original failed/unknown journal. Readback alone does not clear a block; the checked
resolution record does. It authorizes neither replay nor deployment. Original journals
and backup evidence remain available.
Failed verification remains a failed operation even if all ledger IDs were recorded.
Image/configuration rollback and database restoration are separate decisions. Neither
deployment nor migration failure automatically restores a database.

### Workflow outputs, APIs and admin status

Use the existing host journal and migration ledger as authoritative evidence. Define
one sanitized operation report shared by manual and agent-triggered workflows:
operation/plan ID, application/environment/database identity, reviewed and serving
revision, workflow run URL, execution phase/status, backup verification and snapshot
ID, applied/remaining/changed IDs, health outcome, observation time and next action.
Keep deployment outcome separate from migration outcome: a successful release can
still have pending migrations. Do not expose credentials, raw logs or backup locations.

- Workflows publish bounded machine-readable outputs plus a JSON report artifact and
  readable run summary on success, failure and handled interruption. Include operation
  ID and status-query instructions even when execution did not complete. Host journals
  remain available when an abruptly terminated workflow cannot publish final outputs.
- On a known terminal result, the trusted executor records the allowlisted outcome in
  the target application's MongoDB using existing database access. Record failure or
  unknown outcome during handled finalization when possible; an abrupt kill may leave
  no final report. This is a recorded read model, not another approval engine or
  migration ledger. There are no periodic status writes, status-heartbeat timers or
  checkpoint synchronization to MongoDB; lease renewal remains required and detailed
  in-flight checkpoints remain in the host journal.
  Preflight/status queries themselves must not create report records.
- Extend existing authenticated diagnostic reads with `data-operations.status`
  for agents. The existing admin page calls the same read-only server reader directly,
  using its existing administrator authorization; add no admin REST endpoints.
  Scope all reads to the configured
  application/environment; support latest operation and lookup by exact operation ID.
  Behavior is fixed below; local implementation is recorded in the progress section.
- Add a compact backup/migration section to the existing `/admin/operations` page.
  Reuse its English/LTR primitives, status table and refresh behavior. Show pending
  work, latest recorded outcome, backup result, applied/remaining IDs, observation time and
  workflow link. Provide read-only status and instructions, with no execution buttons
  or separate dashboard in this version.

Reads compare the current deployed catalog with the ledger and attach the latest
recorded terminal report. Mark its revision and observation time; do not present it
as live progress or evidence for an unrelated future candidate. No timer infers a
running or stale state. Missing or interrupted outcomes require workflow/host status;
ledger entries alone mean applied, not verified completion. If recording fails, expose that failure in
the workflow report and use restricted host status for authoritative reconciliation;
do not repeat successful migrations merely to refresh the view. While application
writers/web are stopped, use workflow/host status; the admin view is not an availability
dependency for the migration executor.

### Simplifications and retained gates

- Use one existing approved operation for backup, migration and verification. Do not
  require separate backup approval or manual per-migration commands within that run.
- Run one report for review and one state comparison under locks immediately before
  writes/activation. Reuse unchanged candidate metadata and completed checkpoints;
  status queries do not rebuild images or repeat release acceptance suites.
- Require each migration to prepare its own prerequisite indexes before dependent
  writes. The current batch already does so; omit a blanket `db:indexes` pass from
  the new executor. Fresh provisioning keeps its existing index setup. This proposal
  does not change today's manual operator procedure before the executor ships.
- Rehearse restore recovery on initial environment acceptance and when recovery
  configuration or implementation changes. Do not restore a disposable database on
  every release; each mutating run still verifies its exact backup archive.
- Reuse the existing diagnostics API and one server reader for admin status. Keep
  workflow/host status for active or unknown operations; record terminal results only,
  with no database heartbeat, polling timer or dedicated admin REST routes.
- Keep interrupted-operation recovery manual after readback, then use the normal
  freshly approved retry flow. Defer general predecessor/resume plans and automatic
  writer-state inheritance; retain the existing blocked-Release continuation.
- Use existing workflow dispatch and approval trust. Agent conversation approval is
  user consent, not a replacement for Infrastructure's enrolled-actor/OIDC enforcement.
  If the authenticated workflow actor cannot satisfy that trust, give the enrolled
  operator the exact dispatch link/inputs rather than adding a new approval service.
- Retain identity/batch checks, compatibility gates, backup verification, operation
  serialization, one-use approval, ledger verification and post-release health. Advisory
  quality warnings do not gain new gates. No waiting workflow, automatic resume service,
  recurring jobs or live polling is required: the agent can observe terminal workflow
  status and continue the approved sequence using the same immutable candidate.

### Deployment skills and reference adoption

Add two discoverable deployment skills in the future implementation stage. They
guide agents through the existing operator interfaces; they do not introduce another
runner, deployment platform, approval engine or privileged access path.

| Planned skill | Trigger and responsibility | Required result |
| --- | --- | --- |
| `promote-to-environment` | Prepare or execute an explicitly approved promotion PR from the configured source to one environment branch; inspect its release or route an explicitly approved rollback | Review of the intended merge result, exact approval request when needed, labeled actions/test-flow links, one release invocation and verified outcome, followed by the automatic/manual migration choice |
| `operate-data` | Report, back up, migrate or investigate application database operations; prepare manual instructions or an explicit recovery handoff | Exact target/batch/backup requirements, one approved operation or concrete workflow instructions, shared status readback and a safe next action for failed/unknown state |

Use `promote-to-environment` for promotion/release orchestration and `operate-data` for
the database portion; keep the approval and failure rules in their canonical docs.
The deployment skill invokes the data workflow only when its requirements warrant
it. Both skills distinguish read-only review, authorized mutation and deferred work.
Plan-only requests produce a plan; skill invocation never grants permission to
commit, merge, deploy, migrate, restore or change host configuration. Existing
explicit approval for the same exact action is reused without another prompt.

Keep reusable skill procedures in Handbook, with thin consumer entrypoints and
Unibase adaptations in the repository adapter/source map. Each skill reads only
the relevant sections of the application deployment guide and Infrastructure
operations, resolves the destination's configuration, and calls existing supported
workflows/clients. Keep Unibase database names, host identities and current release
evidence out of the shared skill. Register the skills through reviewed Handbook
discovery/selection metadata and synchronize consumer entrypoints; do not edit managed
wrappers directly or silently expand the installed catalog. Adoption in derived
projects must preserve their own public bindings, credentials and approval boundaries.

The user supplied the `promote-to-environment` skill attributed to
[voxr-ai-app](https://github.com/Jason-Richter-Enterprises/voxr-ai-app), together with
its promotion PR body template. The inspected skill attachment has SHA-256
`df69062aa36da315eecb2b947d951e97ff92387facb991fda4b6c0b7956752a2`.
No upstream commit was supplied. Its linked repository rules, other assets and
implementation were not available and have not been inspected. The supplied skill
and body are sufficient for this documentation adaptation; do not block their use
on repository access or claim the remaining repository was reviewed. External skill
instructions are reference material, not authority to change Unibase's rules.

The following mapping adapts the supplied procedure to existing Unibase contracts:

| Supplied skill/template section | Disposition for Unibase | Owning surface |
| --- | --- | --- |
| One source/target and full reviewed SHA | Retain; source `main`, target `_staging` or `_prod` from repository preferences; record source and target tips and eventual merge/release identities | Promotion skill, preferences and deployment guide |
| Prepare: review the intended merge result | Retain; review the result against the target tip so target-only changes are not mistaken for reversals; stop on an empty promotion | Promotion review and future client verification |
| Included issues and source PR actions | Retain actual references and merged PR evidence, include accepted work without issues, and mark already-delivered items only after verifying they contribute no change | Promotion body template |
| Before/after labels and separate Test flow | Retain `B<number>-<slug>`/`A<number>-<slug>`, owner/location/verification and source PR or `found in diff review`; link test flows separately | PR templates and deployment action records |
| Read action blocks, then inspect diff for omissions | Retain migration, index, configuration, workflow and compatibility review; use one requirements report rather than a second checklist | Promotion/data-operation skills |
| `done` or `skip` for every action, with skip never blocking | Adapt: verify required actions; skip/defer only advisory or compatible post-release work with a reason. A skipped prerequisite blocks activation | Release classification and approval flow |
| Merge pinned to reviewed head; refresh when branches move | Retain merge commits and exact reviewed head; changed source, target merge result or operation batch needs renewed review; do not reuse stale approval | Git client and promotion skill |
| Confirm workflow runs, distinguish merge from deployment | Retain exact expected Release run plus serving identity/health; reject the source rule accepting a later commit's successful run as proof for the reviewed candidate | Workflow outputs and status reader |
| API/frontend workflow selection | Adapt to Unibase's single Next.js application and configured Release workflow; determine triggers from actual workflow files, not VOXR names or guessed path filters | Deployment guide and release client |
| `main` backup branch and Git-revert rollback | Omit automatic backup branches; Unibase `main` is integration. Retained image/config rollback and approved MongoDB/GridFS backup/restore remain distinct | Infrastructure recovery and application rollback |
| Delivery branches, cleanup and direct conflict push | Retain documented conflict review on an isolated work branch; omit automatic supersession/deletion and all direct environment pushes. Stop if resolution needs a product decision; preserve local separate review and publication authority | Work policy and promotion skill |
| Change-log comments and production issue closure | Keep concise promotion outcome/action evidence in the PR body; optional support prose can be included there. Do not add mandatory comments, automatic closure, tracking writes or extra approvals | PR template and local authority rules |
| Parallel targets and fixed background wait | Start with one target per operation and existing app concurrency; use bounded observation of exact workflow IDs, report pending/failed/unknown, and never duplicate dispatch on timeout | Existing operation clients |

For Unibase, `_prod` maps to the configured external target `prod`; production
activation remains separately authorized. An alternative source requires explicit
approval consistent with repository policy. Do not import `_dev`, `_qa`, `_uat`,
`_sandbox`, New York timestamps or the reference repository's broader publication
authority. Build the future skill from Unibase's canonical docs rather than copying
the supplied rules and leaving contradictory exceptions around them.

Apply this adaptation across these surfaces before implementation:

- **Flows:** fit useful review/approval, manual handoff, status and recovery patterns
  into the accepted required-before-release/compatible-after-release sequence.
- **Code:** identify the minimum changes to existing release/preflight clients,
  restricted Infrastructure executors, migration packaging/runner and status reader.
  Retain Next.js, Compose, current configuration contracts, OIDC and backup controls;
  do not import a different hosting stack or add scripts duplicating existing clients.
- **Docs and guidance:** link each skill to canonical runbooks; update the source map,
  adapter routing and agent-tooling guidance rather than copying procedures into
  every skill, AGENTS.md and workflow. Distinguish proposed behavior from shipped
  commands and installed controller capabilities.

Use the adapted [promotion PR starter](../../templates/promotion-pr.md). Source issue
PRs retain the normal template with a separate Test flow section. The promotion body
is the one action inventory: preserve action labels across updates and record approval,
verified completion, optional deferral and pending state there when PR writes are
authorized. Required pre-release actions cannot be completed by a bare `done` answer:
link their verified operation/health evidence. Do not copy that inventory into a second
mandatory comment or ask for individual approval when one exact operation covers it.
Remove placeholders and inapplicable sections before publishing an actual PR body.

After actual skill metadata/routing changes, run the repository's explicit
`handbook:sync` and `handbook:entrypoints` commands against the reviewed Handbook
resources. Review custom content, provenance and integrity hashes before refresh,
then run skill/readiness/docs checks. Do not perform sync or change catalogs during
this documentation-only stage: no deployment skills are installed by this plan.

Validate the future skills with bounded scenarios: ordinary image-only release,
required prerequisite migration, compatible post-release work, manual selection,
already-approved operation, changed target/batch, failed deployment, lost response,
unavailable status and plan-only requests. Require correct authorization and next
action, not matching wording. Verify that neither skill duplicates an approval,
repeats completed writes or invents commands. No live/paid evaluation is required
to validate the instructions.
Include target-only commits, an empty merge result, moved source/target heads, a
required action marked skip, a later unrelated successful release, and documentation-only
changes that still match an environment branch's Release trigger. Migration status
must remain independent of Test flow completion and issue closure.

## Implementation contract

This section specifies future implementation, not actions to execute during the
documentation stage. Unibase and Infrastructure changes are coordinated under #62;
Handbook owns the two shared skills; consumers reuse its existing optional selection.
Preserve the existing working changes and use task branches in each repository.

### Migration declaration, manifest and runner

- Extend `Migration` with optional `releasePhase` (`before-release`, `after-release`,
  `bespoke`) and a read-only `verify(db)` callback. Missing classification or verifier
  on an eligible pending migration blocks the protected executor as bespoke work.
  Set both on the current six
  declarations without editing their released `run` bodies or stored records.
- Verifiers check actual index names/options and relevant data invariants, not merely
  presence of ledger IDs. Domain/notes backfills verify missing metadata is resolved;
  asset variants preserve the existing best-effort/original-image contract and report
  unprocessable assets as warnings instead of silently claiming every image converted.
- Add credential-free manifest emission to the migration entrypoint: `--manifest`
  reads declarations/public project configuration only and does not load `.env`,
  connect to MongoDB or execute migration/verifier bodies. `--status --json` reads
  the database/ledger only. Preserve the existing no-flag local apply command.
- Produce `dist/migration-runner.cjs` and `dist/migration-manifest.json` alongside
  workers and copy them into the runtime image. Manifest version 1 records project,
  enabled owners, ordered IDs/descriptions/phases, legacy source checksums and runner
  SHA-256. Generate source checksums with the existing function-body algorithm in the
  source/tsx execution context before bundling. The packaged runner consumes these
  build-bound checksums rather than hashing esbuild-transformed functions. Never
  accept caller-supplied checksum overrides or rewrite old ledger checksums.
- Protected apply accepts an exact approved batch and manifest identity. Refactor
  lease handling into one reusable internal context used by both legacy apply and
  protected apply; the runner verifies the entire approved pending batch under that
  lease before work, skips applied IDs, stops at first error, and verifies results.
  No new migration engine, second lease or migration-subset selector is introduced.

### Restricted protocol and execution

- Add capability `data-operations-v1` to Infrastructure. Existing v1/v2 operations
  retain their request/response shapes; new data operations require this capability
  explicitly. The application contract update is controller/control impact and must
  precede client activation through a separately approved installation.
- Extend `deploy:ops` with `migrations TARGET [--image IMMUTABLE_IMAGE --commit SHA]`
  for a read-only report and `migrate TARGET --image IMMUTABLE_IMAGE --commit SHA`
  to prepare a plan only. Omitted report image uses the observed current image.
  Preparation accepts `--request-id UUID` for explicit retry; generate and report
  one before transport when omitted. Reuse it for a lost preparation response;
  reject reuse with different inputs.
  Apply still uses Infrastructure's existing approved-plan workflow; status remains
  `deploy:ops status TARGET --plan-id DIGEST`. No CLI apply shortcut or new SSH command.
- Use version-2 fixed actions `migrations` and `migrate`, carrying project/environment,
  exact image/commit and configuration hash. The dispatcher resolves the configured
  database itself. `migrate` stores a `data-migration` plan with `migrationRequest`:
  database, manifest digest, full-ledger digest, ordered `{id, checksum}` pending batch,
  and backup policy `{mode: create, verification: archive}`. Existing plan fields bind
  controller/configuration and observed serving identity; operations are backup,
  migrate and verify checkpoints within one approval. No caller paths, code or shell.
  Reject preparation/application while an earlier data operation for the same database
  has unresolved unknown state, failed data verification or unsafe writer/health recovery.
  Clear that blocker only using the checked root-only resolution record described
  below. Version 1 has no resume field, predecessor plan chain or automatic recovery
  plan. A normal new approval then covers the current remaining batch.
- Add one application workflow `data-operations.yml` with actions `report`,
  `prepare-backup`, `prepare-migration` and `status`. Inputs are environment,
  candidate image/commit when needed, and exact plan ID for status. It invokes the
  same CLI, retains the public report and links to Infrastructure's existing Apply
  deployment plan workflow with project/environment/plan ID/digest. Manual users need
  workflow access, not local SSH keys. There is no second apply workflow or new OIDC trust.
- For explicitly new backup/migration preparations, bind a non-secret `requestId`
  into the new capability's plan identity. Generate it once per prepare workflow
  run or CLI request and retain it with the returned plan; repeating that request
  returns the same plan. A fresh requested backup gets a fresh plan even when release
  and ledger are unchanged. Keep legacy callers' shapes; the new-capability client
  supplies this identity for backup too. Never treat querying/retrying a completed
  plan as a request for a new backup. No-pending migration preparation returns a
  read-only `not-required` report without creating a plan or backup.
  If all IDs are recorded but verification or writer recovery is unresolved, report
  that fact as `blocked-recovery` and direct the operator to the original journal and
  root-only resolution procedure. This check precedes the no-pending fast path.
  Do not return `not-required` or create a verification-only resume operation.
- Anonymous-pull the immutable candidate, verify its repository and OCI source label,
  and extract the static manifest/runner bytes from an unstarted temporary container.
  Verify their digests without executing candidate code. Read the complete ledger
  using an installed trusted probe and private configured MongoDB credentials.
  Canonical ledger identity covers IDs, checksums, timestamps and duration metadata.
  Use an Infrastructure-owned Node/MongoDB probe with an overridden entrypoint in
  the currently approved image, so reporting does not depend on a running web process
  or execute candidate code. Verify its executable/module prerequisite; if unavailable,
  report owner action required rather than adding a driver or arbitrary shell fallback.
- Unresolved changed checksums and unknown ledger IDs block automatic plan/release
  eligibility. Review determines source corrections or a separately authorized bespoke
  reconciliation; version 1 has no force/acknowledgment flag or ledger rewrite path.
- Keep restricted response size limits. Paginate ledger/report details and publish
  the complete reviewed report as an artifact. Never truncate the approved pending
  batch: if a complete plan exceeds transport bounds, stop with owner action required.
  Never emit database URIs, runtime files, dump contents or untrusted raw errors.
- Refactor existing recovery code into reusable backup/verify steps while preserving
  standalone backup and restore behavior. Hold the application lock first. Start the
  approved candidate runner with private stdin/stdout pipes; it acquires/renews the
  database lease and emits `ready`. Only then stop writers and create/verify backup.
  Persist the verified backup checkpoint and application-data write intent before
  sending `backup-verified` with its plan/snapshot identity. Only this acknowledgment
  lets the runner apply the batch. A crash after that intent remains uncertain even
  if the host did not receive the runner's next response; never classify it as a
  harmless backup-only failure from the last completed checkpoint alone.
  This fixed handshake holds the database lease across backup without giving the
  candidate Docker, restic, SSH access or permission to select arbitrary host commands.
- Reuse configured environment/network and private runtime settings for the runner;
  mount no Docker socket or host control directories. Use a fixed non-root entrypoint.
  Keep the Node process alive to renew the lease during host backup work. On any
  timeout/interruption, terminate and reap the process group/container before unlock.
  Journal the writer set before stopping it. A started phase without conclusive
  completion remains unknown. Do not resume writers after uncertain migration writes.
- Bound the entire data operation to 60 minutes and each backup/migration/verification
  phase to 30 minutes, capped by remaining total time. Update the existing shorter
  client/controller timeouts for this capability only. Exceeding that budget requires
  inspected recovery and a bespoke long-running plan; it never causes automatic replay.

### Exact candidate and Release continuation

1. Keep existing source/target/merge-result review and session authorization before
   the agent merges a promotion. This approves requirements and deployment intent.
   The environment merge produces a new SHA; do not pretend its image digest or
   exact execution plan was known before the merge.
2. Keep cheap host-configuration/capability preflight before build. Build/publish once
   at the actual Release SHA and retain its immutable candidate artifact. After
   anonymous pull verification, run the data report for that exact image/SHA.
3. With required pending IDs, prepare the exact data plan and finish Release as
   `blocked-migrations`, without activating the image. Publish plan ID/digest, report,
   candidate and manual next action. Do not hold a workflow open awaiting a person.
4. The agent presents the exact prepared plan for the existing enrolled-actor/OIDC
   approval. This is execution authorization for the now-known identity, not a
   duplicate approval of an unchanged known plan. If the exact plan was already
   approved, reuse that consent; existing one-use host enforcement still applies.
5. After migration verification, resume the original blocked Release using its
   existing run rerun/candidate-restore mechanism. Reuse the same image digest and
   SHA, rerun read-only gates, then activate. A missing artifact or moved reviewed
   state stops continuation rather than rebuilding/reviewing a new candidate silently.
   Initial deployment approval covers this known-blocked continuation; unrelated
   failed/unknown deployment retries require readback and appropriate authorization.
6. If only compatible work is pending, Release succeeds normally and publishes its
   report. The agent then offers the one-run automatic/manual choice. Build the
   post-release data plan against that observed serving revision before asking for
   exact execution approval. Manual instructions use the same prepare/apply/status
   workflows. A human-only merge receives the same report/links without chat automation.

Repeat the candidate/ledger compatibility check under the application lock immediately
before activation, including on the host: bypassing the Actions report cannot bypass
the gate. Check authoritative operation evidence too, using the predicate below.
Empty pending batches do not bypass recovery/verification blocks or create a backup
plan. Failed health verification does not erase completed migration results or trigger
automatic data restore.

### Operator resolution and activation evidence

An operation is unresolved when its host journal records an unknown application-data
write, failed/missing data verification after writes, or unsafe writer restoration or
health. Ledger IDs alone do not clear that condition. A known failure conclusively
before application-data writes, followed by restored writers and healthy serving
state, may finalize as failed-but-safe without operator resolution; required IDs
still pending continue to block release. Do not turn every harmless backup failure
into a privileged recovery task.

Implement one narrow root-only utility, `data-operation-resolution.py`, in the
reviewed Infrastructure controller bundle. It is an inspector/acknowledgment writer,
not a workflow, resume engine or application action:

1. With an explicitly authorized recovery session, invoke it on the host with
   `--project`, `--environment`, `--plan-id` and `--inspect`. It reads registered
   identities and the exact original journal, candidate manifest, ledger, recorded
   backup, lease/process evidence and original/current writer sets. It returns a
   sanitized report and `stateHash`; it performs no migration, restore or restart.
   Refuse arbitrary database names, paths, commands or replacement candidate images.
2. The operator completes any separately authorized manual recovery and repeats
   inspection. Confirm the old child/container is gone, no other runner owns a live
   lease, and the original writer set is deliberately restored or otherwise accounted
   for. Lease expiry alone is not proof. Preserve the original approval/image/backup
   evidence; use existing unresolved-plan image protection until recovery is resolved.
3. Record with the same identity plus `--record --expected-state-hash`,
   `--disposition`, `--operator` and `--reason`. The utility holds the application
   lock, serializes database readback with the existing migration lease, recomputes
   the inspected state and rejects drift. Its lease writes are control metadata;
   it performs no business-data writes or automatic writer recovery. Optional terminal
   status metadata is the only application-database update allowed by resolution.
   Hash durable identities, the journal/ledger/backup evidence, writer/process state
   and verifier results; exclude sampling timestamps and the utility's own lease
   renewal fields so taking its validation lock cannot invalidate its own inspection.
4. Accept only `safe-to-retry` or `verified-complete`. For `safe-to-retry`, require
   that recorded IDs in the original batch pass their read-only verifiers and that
   the operator has established a safe serving baseline for any unrecorded partial
   work. It clears uncertainty for a new approved remaining batch; it does not
   declare the original batch completed. If no IDs remain after a migration write,
   require `verified-complete` instead. For that disposition, require all original
   batch IDs/checksums, read-only data/index verification, recorded backup validation,
   correct writer state and serving health to pass. Use only verifiers from the
   originally approved immutable image; unavailable evidence keeps the block in place.
5. Atomically store a root-owned, mode-0600 `<planId>.resolution.json` beside the
   journal. Bind version, plan/journal digest, project/environment/database, inspected
   state hash and relevant identities, checks/results, disposition, operator, reason
   and timestamp. Keep the original failed/unknown status unchanged. The acknowledgment
   settles that specific journal; it is not a reusable approval or a database restore.
   Retrying an identical acknowledgment reads back the existing record; reject a
   conflicting replacement instead of overwriting recovery history.
   The resolved original plan cannot be reapplied. Any new mutation uses a fresh
   request/plan and approval, with current state and its own verified backup.

The utility may run the original read-only verifiers during explicitly authorized
recovery, without calling migration bodies. No generic verification-only apply plan,
new public API or approval service is introduced. The resolution cannot override
checksum drift, unknown ledger entries, bespoke classification or pending required
IDs. Subsequent state changes create their own checks/operations; a resolution of
one historical failure never acknowledges a different operation.

The host activation predicate, shared by routine and protected deployment, is:

- Existing host configuration/capability checks and exact candidate identity pass.
- Candidate/ledger review has no required pending IDs or unresolved compatibility issue.
- No database operation is active, unknown or verification/recovery-failed without
  matching safe completion or a validated resolution. `safe-to-retry` does not
  satisfy missing verification of required recorded IDs; its verifier checks must
  cover them, and any required unrecorded IDs still fail the pending-ID check.
- Required migrations applied through this new flow have matching successful
  verifier evidence in the host journal or a validated resolution covering those IDs.
  No disposition alone substitutes for those checks. Treat
  pre-existing ledger records as the reviewed legacy baseline; do not invent missing
  historical journals or rewrite them as new-flow operations.

Missing or corrupt required authoritative evidence yields `blocked-recovery`,
even with zero pending IDs. Validate the evidence under the host lock at activation;
do not rely on the earlier Actions summary or the MongoDB report copy. The compact
report adds `activationDecision: proceed | blocked-migrations | blocked-recovery |
owner-action-required` and a single next action. A read-only report leaves deployment
outcome `not-attempted`; a gated Release records `blocked-migrations` or
`blocked-recovery`, both meaning activation was not attempted. Missing report copies
do not fabricate failure of an already verified operation.

A missing/failed final MongoDB report write does not block activation when complete
host verification evidence exists. Conversely, a completed-looking report cannot
override a failed/unknown host journal. Terminal finalization and explicit resolution
may each idempotently update the report's resolution metadata when possible, preserving
its original outcome; no periodic synchronization is added. Workflow status exposes
the validated resolution and decision. The admin/diagnostic read model remains last
recorded evidence and directs users to authoritative status if its copy is missing.

### Shared status contract

- Define a strict version-1 allowlisted data-operation DTO in Unibase contracts and
  mirror its public JSON shape in Infrastructure fixtures. It contains the previously
  listed identities/results, `observedAt`, and separate deployment/migration outcomes.
  Operation state is `prepared`, `running`, `completed`, `failed` or `unknown`; phase
  is null before execution, then backup, migrate, verify or health. Deployment outcome
  is `not-attempted`, `blocked-migrations`, `blocked-recovery`, `succeeded`, `failed` or `unknown`;
  migration outcome is `not-required`, `pending`, `running`, `completed`, `failed` or
  `unknown`. A mutation is `completed` only after ledger,
  data verification, safe writer restoration and health all succeed.
- Publish workflow outputs `operation_id`, `plan_digest`, `source_commit`, `image`,
  `deployment_outcome`, `migration_outcome`, `backup_id`, `report_artifact` and
  `activation_decision`, `next_action`; large details stay in `data-operation-report.json`. Use `always()`
  for bounded finalization, with no fabricated final state after an abrupt kill.
- Store terminal reports in `deploymentOperations`, keyed by plan ID. Writes
  use the existing trusted runner/database configuration, not an HTTP ingestion API.
  Index by observation time for latest-operation lookup; add no TTL or retention job.
  This report does not enter the migration-ledger digest or approval authority.
  Perform an idempotent upsert on terminal finalization or explicit operator resolution
  when possible; preserve the original result and include its
  observation time. Never update it periodically or derive liveness from its age.
  An abrupt interruption or failed upsert leaves the recorded outcome unavailable;
  workflow/host status remains the source for investigation.
  A resolution's non-secret metadata may accompany the original failed/unknown
  result; never rewrite that history to completed merely because the block was cleared.
- Add diagnostics capability `data-operations.status`, using existing grant checks
  and a read-only server reader. Input is optional exact `planId` and bounded paging;
  absent an ID, return the latest 20 recorded outcomes plus the current ledger summary.
  Paginate ID details at 100 entries with explicit continuation metadata. Preserve
  existing diagnostics validation/access errors, scope reads to the configured
  application/environment, and do not expand old grants implicitly.
- Read-only `/admin/operations` calls that same server reader after its existing
  administrator check. Reuse English/LTR components and manual refresh. Show pending
  IDs, last recorded outcome/time/revision, backup verification and workflow/status
  links. Applied ledger IDs with no final report show verification not recorded, not
  completion. Active and unknown operations are investigated through workflow/host
  links. Add no admin REST endpoint, live progress service, app SSH credential or new auth.

### Skills and optional selection

Create the shared `promote-to-environment` and `operate-data` skill bodies in Handbook,
with the supplied-reference mapping above as their design input. Register them in the
shared catalog and select them through the existing `technologySkills` array, whose
current tooling already accepts additional catalog skill names. Document that legacy
field name as the existing selection mechanism; do not add a `workflowSkills` field,
change the configuration schema or expand the default core skill set for this task.
Select both in Unibase; select `operate-data` in Infrastructure with its local operator
boundaries. Update only the required consumer selections and approved skill inventories,
then explicitly sync wrappers/Claude references and review integrity/provenance.
Existing local `build-ui` and all custom suffixes are preserved. Validate catalog and
sync compatibility using existing machinery; no selection-tooling redesign is required.

The skills must use the exact interfaces above, the adapted promotion template and
one PR-body action inventory. They install no hooks or privileges, do not close issues,
do not push directly to durable branches, and never accept optional `skip` as evidence
that a required migration or backup gate passed. Use the normal separate read-only
review and explicit authorization rules for publishing any skill or consumer changes.

### Delivery checkpoints and verification

After explicit implementation authorization, execute these checkpoints in order.
Each has focused checks, documentation reconciliation and a separate read-only review;
do not broaden into live work when a checkpoint passes.

| Checkpoint | Deliverable and acceptance |
| --- | --- |
| 1. Catalog and packaging | Pure manifest/status, classifications/verifiers, packaged runner and preserved checksums. Disposable tests prove zero preflight writes, full ledger reporting, disabled-owner handling, bundle/source parity, tamper rejection and legacy runner compatibility |
| 2. Approved data executor | Capability/protocol, backup verification, one lease across backup/apply, host checkpoints, root-only resolution and terminal reports. Disposable tests cover success, no-op retry, inspected partial-write retry, interruption, lease loss, backup failure and lost response; unresolved state blocks new work; resolution checks identity, evidence, state drift and replay without rewriting history; restore into isolated MongoDB/GridFS and compare bytes/records |
| 3. Release and status | Exact-candidate gate and original-run continuation, workflow outputs, diagnostic capability and existing admin view. Prove zero-pending/failed-verification and unresolved recovery block activation, valid host completion permits it despite a missing report copy, altered resolutions do not pass, immutable digest reuse works, optional work defers safely, and reads remain authorized/bounded |
| 4. Skills and handoff | Shared skills/optional selection, templates, consumer sync and canonical runbooks. Validate plan-only/approval/manual/failure scenarios plus target-only commits, changed heads and exact-run confirmation; perform complete cross-repository diff review |

Final code verification includes affected migration/commerce tests, deployment
integration tests against the real Infrastructure dispatcher in disposable Linux
fixtures, Infrastructure unit tests, typecheck, lint, environment checks and production
build. UI verification uses `build-ui` and the existing admin English/LTR checks with
an Arabic public preference; it includes authorized/unauthorized, no reports, pending,
last recorded failure/completion, no final report and workflow links for active/unknown
operations. Run docs/i18n/skills/readiness,
workflow/shell checks, cross-repository contract fixtures and skill-selection/sync tests.
Warnings remain advisory; missing required runtime evidence is reported as incomplete.

Publication/installation/live gates follow implementation verification: publish approved
Handbook changes, reconcile consumer wrappers from that reviewed revision, then publish
reviewed Infrastructure/application artifacts with pinned workflow compatibility.
Separately approve/install controller and app-control capabilities before enabling new
release clients. Validate actual approval claims and environment recovery prerequisites
before live data use. This is controller/image/data impact; no provider or trust-membership
change is included. Finally, obtain the separate Unibase staging-run authorization,
recheck readiness/serving revision/full ledger, and execute the reviewed flow. Record
backup, operation, ledger, health and affected-flow evidence. Production stays inactive.

## Implementation progress 2026-11-21

All four checkpoints are implemented on local task branches across Unibase,
Infrastructure and Handbook. Publication and merge, plus controller installation/trust validation and isolated
restore setup, were authorized subsequently. Deployment and live migration still
require their concrete reviewed action/plan. The retained Handbook task revision is
`c1b6166437ba729b59723a7dd4066c78e2f15185`.

- Catalog/packaging: pure full-ledger reports, six classified declarations, preserved
  source checksums, bundled integrity checks, exact-batch validation and one lease
  across backup and migration. Disposable MongoDB tests cover read-only preflight,
  real packaged handshakes, verifier failure and inspected partial-write retry.
- Approved executor/recovery: fixed backup/migrate/verify checkpoints, retrieved
  encrypted archive hash/identity checks, bounded process cleanup, authoritative host
  evidence and root-only state-bound acknowledgment. New-capability approvals use
  the existing expected configuration hash to bind protected configuration and
  controller bytes as well as public configuration; no secrets enter reports.
- Release/status: exact retained candidate gating and rerun continuation, manual
  report/prepare/status workflow, paged diagnostics and the existing admin view.
  A complete ledger alone never establishes verified operational completion.
- Shared workflows/docs: optional promote-to-environment and operate-data skills,
  one promotion action inventory, consumer routing, integrity and canonical runbooks.
  Scenario review covers plan-only, unchanged approval reuse, manual/declined work,
  deployment failure, target-only commits, changed heads and exact-run confirmation.

Verification evidence: the full application unit suite passed all 119 tests using
a portable Git 2.47.1 runtime in the ignored cache (system Git 2.27 lacks fixture
`init -b` support; repository sources were not changed for that prerequisite).
Focused MongoDB migration/status/diagnostics suites passed
31 tests with one optional Redis skip; affected commerce/billing/foundation suites
passed 44 tests; packaged integrity passed. Handbook validation passed all 75 tests.
Infrastructure passed 64 tests with four
skips, and Python CLI/contract parity checks passed. Production build and typecheck
passed. Browser checks covered admin/member access, Arabic public preference with
English/LTR admin, empty/pending/completed/failed/unknown/no-final-report states,
manual/keyboard refresh, workflow links, three styles, light/dark and mobile/desktop.
Served-document CSP checks accepted the correct nonce and blocked a missing nonce;
public navigation retained its nonce and restored Arabic/RTL. Enlarged text exposed
pre-existing overflow in older page controls; the new refresh control was corrected
and passed its mobile/doubled-text bounds check. Lint, environment, docs/i18n,
skills/integration readiness, Actionlint and ShellCheck passed.

Two final, separate same-agent read-only review passes checked the cross-repository
contract, newly added files, approval and recovery boundaries, release continuation,
read-model authorization, shared skills and evidence. No additional in-scope blockers
remained. These are separate review passes, not independent-agent reviews.

The user explicitly permits Docker tests to skip when Docker is unavailable. This
machine has no Docker runtime: Linux dispatcher integration and the authored real
restic/MongoDB/GridFS archive-restore fixture are unexecuted, not restore evidence.
An isolated target restore rehearsal remains a required operational gate. Optional
Redis coverage also remains skipped without its test URL.

### Publication and operational resume - 2026-11-23

Handbook PR #22 merged as `3c2b30c071e6eb35dcbcdf4646ff1fd56d5cebd2`.
Both consumers were regenerated/checked against that immutable published snapshot;
the task guidance baseline above remains retained. Infrastructure PR #8 merged as
`8798603fa551ec7331a0c96c8f93e9a928b6e6b6`. Infrastructure PR #9 pins the executor checkout to that source and merged as
`149b02c261e2a41799b8a94e9cb3c9738d16787e`. PR #10 pins the caller and trust
example to that executor and merged as `13c7bda0828fc1bd6c148fe42cfaf19a87d656dd`.
Enrolled actors are unchanged; actual installed trust still needs operator readback.

Unibase implementation is preserved in the isolated `unibase-62-publish` worktree.
Newer main changes (Google popup and template-import policy) were integrated;
both changelog entries and all unrelated source changes were retained. Unit checks
passed 121 tests before the additional mirror-test split. Cross-repository fixture
comparison now compares JSON values across line endings; standalone checkouts always
validate the strict DTO and explicitly skip only absent optional mirror parity.
The Docker recovery fixture installs its pinned MongoDB driver inside its disposable
image rather than relying on workstation node_modules.

Read-only SSH succeeded using the documented existing operator key. The dispatcher
checksum still matches the dated inventory:
`4404fb361f9e99c43c58061202ed8fed16caa5d705fb0c52b48d08a1ac26731a`.
`sudo -n` requires a password. No installation, trust update, writer interruption,
backup or live data change has been executed. Continue repository publication while
preparing a concrete checksum-bound batch for an interactive root operator. Never
request the sudo password or private key in chat. Root setup must preserve enrolled
actors and existing recovery configuration, then verify actual OIDC claims and an
isolated restore before separately approved staging migration. Production stays inactive.

## Acceptance and future execution prerequisites

The original documentation stage was complete when the current/proposed distinction,
ownership, workflows, failure handling, source-map links and future verification
requirements are consistent and pass documentation checks and a separate read-only
review. It does not complete #62's operational acceptance.

Implementation is now authorized and present locally. Before subsequent operational
work, recheck the then-current source against this contract. Reuse the runner, ledger, approval and
recovery controls; no new runtime dependency or external service is planned.
Compatible controller installation and any publication or deployment remain separately
authorized operations. An actual conflict with newer code requires a bounded plan
revision rather than silently changing the contract.
The supplied attachment is the reference baseline for this adaptation. Further
repository comparison is optional until additional source is provided; it must not
be presented as verified evidence for code or assets that were not inspected.

Acceptance scenarios (local coverage above; live acceptance remains separately gated):

- Preflight leaves database collections, indexes and lease state unchanged; reports
  full ledger, module eligibility, checksum drift and each release classification.
- Success verifies backup retrieval/hash, exact batch, index/data invariants and health.
  A second invocation reports no pending work without duplicate effects.
- Changed revision, database, configuration, ledger or batch rejects stale approval;
  approval replay and concurrent runner attempts cannot repeat writes.
- Backup creation/verification failure prevents indexes and migrations. Restore the
  resulting archive into a disposable database and verify records and GridFS bytes.
- A migration that writes partially and then fails retains prior completed IDs;
  after operator readback and safe writer/process recovery, a freshly approved retry
  completes without duplicate accounting effects. Unknown state never auto-resumes.
- Process interruption during backup, migration and verification, plus a lost response
  after completion, preserve checkpoints and require conclusive status/readback.
- Root-only resolution rejects unauthorized use, wrong target/plan, changed state,
  live predecessor/lease, missing backup/verifier proof and replay of a resolved plan.
  Identical acknowledgment retry is idempotent; conflicting replacement is rejected.
  Verified resolution preserves the original failed/unknown record and permits only
  its specified safe next action. No `done` answer or report edit can clear a blocker.
- All IDs recorded followed by verifier or writer/health failure still blocks Release.
  Once authoritative verification/resolution succeeds, a missing MongoDB report does
  not block activation or cause repeated migration writes. Known pre-write backup
  failures with proven healthy recovery remain failed-but-safe, not unknown forever.
- Manual and deployment entrypoints reach the same executor. Required pending work
  blocks activation; optional backfills remain visible; database recovery stays separate.
- Agent-triggered deployment asks for approval of the reviewed requirements before
  its deployment mutation. Successful compatible deployment with pending work offers
  automated execution or manual workflow instructions; decline/deferral causes no
  writes and leaves pending status visible. Failed deployment makes no migration offer.
- Workflow reports, diagnostic status reads and the existing admin view agree on
  operation identity and outcomes. Unauthorized/cross-environment reads are rejected;
  missing terminal reports and interruption cannot be displayed as verified completion.
  The app makes no periodic status writes and exposes no new admin REST routes.
- Deployment/data-operation skills route the scenarios above through the same clients,
  preserve consumer guidance and pass discovery/integrity checks. The reference
  adoption mapping records the supplied evidence and clearly excludes unavailable material.

Unibase staging comes later: after implementation and disposable verification, obtain
separate live authorization, recheck the serving revision and full ledger before
preview, then use this reusable flow for the exact pending batch and record backup,
ledger, health and affected-flow evidence. Do not use the deferred manual host sequence
as a shortcut. Production activation, provider changes, scheduled backups and
retention/pruning are outside #62's present scope.

## Plan outline

After implementation is explicitly authorized:

1. Implement migration metadata/verifiers, pure reporting and checksum-preserving packaging.
2. Extend Infrastructure's approved executor with verified backup, shared lease,
   checked operator acknowledgment and terminal reports; verify on disposable data.
3. Integrate exact-candidate Release blocking/resume, one manual workflow, authenticated
   diagnostic status reads and the existing admin Operations view.
4. Add the two shared deployment skills and optional selection; reconcile consumer
   entrypoints, canonical docs and promotion templates.
5. Complete integrated verification and final read-only reviews across the three repositories.
6. Stop for publication/installation authorization, then separately authorize and
   rehearse Unibase staging after fresh serving-revision/full-ledger readback.

The original documentation stage delivered the specification only. Local implementation
is now authorized; publication, installation and live-operation steps remain separate gates.
