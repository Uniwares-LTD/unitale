# VPS deployment

## Current staging release

Staging runs the latest `main`, promoted through a pull request into `_staging`.
Each promotion's Release workflow run records preflight, build/publication,
deployment and readiness; the separate Check deployment workflow verifies web and
both workers, and `/api/health/ready` reports the deployed source commit. This
guide keeps procedures, not per-release evidence: each pull request's Deployment
section states operator intervention, ordering and post-release checks.
Infrastructure's [host inventory](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/inventory/srv1.md)
owns installed controller and configuration identities. Production remains
inactive.

## Choose an operation

- Existing installation: follow [routine release and protected changes](#repeatable-release-and-protected-change-path).
- New project: use [guided setup](#guided-setup-helper), then Infrastructure's first-installation procedure.
- Failed or uncertain operation: inspect the exact candidate and operation status before retrying.
- Recovery: use the retained image/configuration snapshot for rollback; database restoration is a separate approved operation.
- Diagnose capacity: use [maintenance status](#image-retention-and-disk-headroom); the host owner controls cleanup and enrollment.

Production compatibility is implemented: external target `prod` maps to runtime
`APP_ENV=production`, `NODE_ENV=production` and retained `production` paths. Production
configuration, recovery acceptance and activation remain pending. Shared gateway,
shared Redis and replacement of existing workers remain deferred; documentation does
not activate them or transfer Booklet, Dify or tunnel ownership.

## Deferred compatibility and recovery work

Existing workers, Redis and ingress remain in place. Shared-service consolidation,
app-hosted scheduling, backup/restore rehearsal and production activation are open
items in the [implementation plan](implementation-plan.md#open-work);
Infrastructure owns the shared-service implementation. Use
[manual recovery](#repeatable-release-and-protected-change-path) and
Infrastructure's recovery guide meanwhile.

## Staging execution and acceptance

### Phase 1 — Connect and prepare

For a new installation, Infrastructure owns access and protected credential handoff.
For an existing installation, inspect current state rather than repeating preparation.

### Phase 2 — Bootstrap and deploy

Bootstrap applies only to a new host/application registration. Existing installations
use reviewed controller/configuration updates and the application release path below.

### Phase 3 — Verify and hand off

Verify the selected commit at public readiness and run the separate Check workflow,
which checks web and both workers. Provider and user-journey acceptance are additional
checks; neither a healthy workflow nor old acceptance evidence proves them for a new change.

### Database migrations on existing staging

The reusable flow for [#62](https://github.com/Uniwares-LTD/unibase/issues/62) is
implemented in the local task branches. Publication, compatible controller/app-control
installation, approval-claim acceptance, recovery rehearsal and a separately authorized
staging run remain gates. The existing manual host sequence stays deferred. No live
ledger or serving-release change is claimed here.

Recheck serving revision, readiness and the full ledger before a later staging preview.
The current configured target is `staging`; production remains inactive. Use the exact
source/image retained by Release rather than copying the planning reference identities.

<a id="reusable-data-operations-proposal"></a>

### Reusable data operations

**Before enabling these clients:** publish the reviewed shared skills and regenerate
consumer wrappers from that revision. Publish Infrastructure's controller and executor
sources, pin both the reusable apply workflow and its checkout to the reviewed published
SHAs, and install the compatible controller/app-control capability `data-operations-v1`
under separate operator authorization. Preserve enrolled actors; validate actual OIDC
claims and target recovery credentials/rehearsal before live data execution. Image-only
publication does not install a controller or accept recovery.

Publication uses real, successive revisions; it cannot pre-pin its own future commit.
First publish the reviewed Handbook revision and regenerate/review consumer wrappers
from it. Publish reviewed Infrastructure controller/client source, then update
`.github/workflows/apply-plan-executor.yml`'s checkout `ref` to that source SHA.
After that executor revision is published, update
`.github/workflows/apply-deployment-plan.yml`'s reusable-workflow `uses` to its exact
SHA. A separately authorized Infrastructure operator validates actual OIDC claims and
aligns host `executorRef`/`executorSha` with that same executor revision, preserving
enrolled actors. Publish the reviewed Unibase integration without promoting an
environment. Only after installation/recovery acceptance may an explicitly authorized
staging promotion begin. A moved revision requires review of the resulting changes.

From the repository root in PowerShell, the read-only commands are:

```powershell
npm.cmd run db:migrate -- --manifest
npm.cmd run deploy:ops -- migrations staging
npm.cmd run deploy:ops -- status staging --plan-id $planId
```

`deploy:ops` uses the runbook's configured restricted transport (`RUNNER_TEMP` access
configuration); a workstation without it uses the manual workflow instead. `$planId`
is the exact 64-character ID returned by a preparation or retained Release report.
Reporting acquires no database lease, creates no indexes and executes no candidate code.
It publishes full ledger/declaration details through paged restricted responses and the
complete `data-operation-report.json` artifact. Changed checksums, unknown history or
bespoke declarations require owner review; there is no force/ledger rewrite flag.

Manual Actions entrypoint: [Deployment data operations](https://github.com/Uniwares-LTD/unibase/actions/workflows/data-operations.yml),
reviewed published `main`, environment `staging`. Choose `report`, `prepare-backup`,
`prepare-migration` or `status`. Candidate inputs for migration preparation are the exact
immutable image and full source SHA from the retained Release candidate; status takes
its exact plan ID. Preparation creates no backup or migration. A request UUID is retained
before transport; reuse it for a lost preparation response, never for different inputs.
A fresh requested backup uses a fresh request identity.

Review the returned plan ID/digest, database, source/image/configuration, full-ledger
digest, complete ordered batch and backup policy. Exact execution approval uses the
existing [Infrastructure Apply deployment plan](https://github.com/Uniwares-LTD/infrastructure/actions/workflows/apply-deployment-plan.yml)
on its reviewed published `main`: project `unibase`, environment `staging`, and the same
plan ID and digest. Only enrolled-actor/OIDC approval can execute it. No CLI apply shortcut,
new trust membership or second apply workflow is introduced. The host holds application
lock then the renewable database lease, stops the recorded writers, creates/retrieves/
hashes the encrypted MongoDB/GridFS archive, records write intent, and acknowledges the
private runner before indexes/migrations. Completion requires ledger, data/index
verification, restored writers and serving health.

Release builds/publishes once at the actual environment SHA. After anonymous pull, its
exact-candidate report either proceeds or prepares the required batch and finishes as
`blocked-migrations`, without activation. Recovery uncertainty finishes as
`blocked-recovery`. After exact approved verification, open the **original blocked
Release** and rerun only its `release` job. In GitHub CLI, use
`gh run rerun --repo Uniwares-LTD/unibase --job RELEASE_JOB_ID` with that run's
`release` job ID. GitHub keeps the successful `publish` job and its candidate
artifact on this targeted rerun. A full workflow rerun can remove that artifact.
The `release` job restores the same digest/SHA and both Actions and host
gates run again. Missing artifacts or changed reviewed state stop continuation. The
host repeats authoritative checks immediately before candidate startup under its lock.
Compatible optional backfills may remain visible after a successful release; the agent
then offers one automated approved run or the same manual workflow. Decline/deferral
performs no writes. A failed release makes no optional migration offer.

Unknown writes, missing/failed verification or unsafe writer/health recovery block new
work even with zero pending IDs. Inspect status and original checkpoints; never blindly
repeat apply. Separately authorized root recovery uses Infrastructure's
[checked acknowledgment](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#reusable-backup-and-migration-workflows).
`safe-to-retry` permits a fresh approved remaining batch; `verified-complete` requires
all original IDs, original-image verifier proof, backup, writer/process and health checks.
The acknowledgment preserves the original failed/unknown outcome and prevents original
plan replay. Image rollback never restores business data.

Terminal report copies in `deploymentOperations` are historical evidence, written only
on finalization or explicit resolution when possible. The existing diagnostics capability
`data-operations.status` and `/admin/operations` share a bounded read-only reader with
manual refresh. Existing grants do not gain the capability implicitly. Missing report
copies do not block verified host completion; a completed-looking copy cannot override
an unresolved host journal. No admin REST endpoint, polling/heartbeat or SSH credential
is added to the application. Workflow outputs distinguish deployment and migration
outcomes and retain operation/backup identities plus a single next action.

### Promotion review and action records

Use the [promotion PR starter](templates/promotion-pr.md) for an authorized environment
promotion. Review the intended merge result against the target tip and record full
source/target SHAs, actual expected deployment workflow and included source PRs.
Inspect their deployment requirements and the diff itself for missing migration,
index, configuration or compatibility work. Refresh the review when either branch
changes the intended result. An empty promotion needs no merge or deployment.

Give before-deployment actions readable `B<number>-<slug>` labels and after-deployment
actions `A<number>-<slug>` labels. Include owner, location, verification, failure/resume
and source PR or `found in diff review`. Use one PR-body inventory; required actions
need verified evidence, while optional deferral needs a reason and remains visible.
Do not add per-action approval prompts when the reviewed operation already covers them.
Keep linked source PR Test flows separate from deployment actions and migration state.

For `main` to `_staging`/`_prod`, verify the exact Release workflow run, resulting
serving revision/image and health; a successful unrelated later commit does not confirm
the reviewed release. Current environment-branch pushes trigger Release without path
filters, so a documentation-only promotion still triggers it. PR preparation alone
does not publish, merge or deploy. A Git backup branch does not back up MongoDB/GridFS;
retain the existing image/config rollback and separately approved data recovery paths.

### Follow-up recovery and consolidation

Manual encrypted backup/restore support is implemented; destination configuration and
restore rehearsal remain pending. Production activation, Dify functional acceptance and
shared-service consolidation remain explicit follow-ups. Never restore a database
as an automatic response to failed deployment.

## Restricted first-staging control path

Infrastructure installs a reviewed Git archive under
`/opt/uniwares-control/<slug>/<bundle-sha256>`. Its shared deploy account sends only
versioned JSON selecting staging `deploy`, `check` or `rollback`; host script paths,
Compose files and credentials cannot be uploaded through that account. The request
must match the installed host-configuration hash and image repository using the
existing v1 protocol. `scripts/deploy/release_settings.py` projects the host profile
by excluding only image-owned application flags. Initially this is only
`DIAGNOSTICS_ENABLED`, which was absent from the installed staging host profile.
Credentials, provider bindings, origin, database, ports and every other setting
remain bound to the registered configuration. No runtime settings or executable
host code are uploaded in a release request.

The release image includes an allowlisted flag map generated from all three tracked
environment JSON files. Node preloads the selected map before the web server and
both workers start. Only the diagnostics flag is assigned; private runtime settings
remain host-owned. Flag changes therefore need an ordinary image release and no
controller update. Rollback restores the previous image and its flag map.

**Operator intervention for this compatibility fix: none.** The earlier v2 proposal
is superseded and must not be installed. Existing controller/configuration and
privileges stay in place. New or updated operator control bundles must use the
same host-profile projection (`host_configuration`) when building their environment
documents; otherwise their full configuration hash would include an image-owned
flag. The prepared Infrastructure bundle-builder update handles that projection;
its publication is separate from this existing-host application release.

After host bootstrap and provider bindings, the trusted root operator runs the
installed `scripts/deploy/prepare-host.py --credentials <protected-file>` preview,
then the same command with `--apply --indexes` (add `--migrate` after the
operational backup when upgrade notes require pending data migrations; it runs
index preparation first, with or without `--indexes`). Use `python3 -B` from the reviewed
root-owned bundle. The private JSON contains `firebase` (the existing service-account
object), `firebaseApiKey`, `firebaseAppId`, and the new app user's `mongodbUri`.
This command validates existing credentials, creates private runtime configuration
and optional additive indexes; it creates no cloud resources or app containers.
An interrupted identical setup resumes; differing existing configuration stops for
review. The credential input stays root-readable outside the source bundle.

Repository secrets for first staging: `DEPLOY_SSH_PRIVATE_KEY` (the separate
restricted key), `DEPLOY_SSH_HOST_KEY` (verified public host key), and
`CLOUDFLARE_READ_TOKEN` (owner-account Tunnel Read and zone DNS Read). The workflow
uses its own `GITHUB_TOKEN` to publish. No GHCR pull credential, Google OIDC
provisioner, Atlas administration credential or Firebase private key enters the
release build. Firebase credentials live in private host configuration.

The first GHCR publication can create a private package. Release stops before host
contact until the package owner explicitly makes it public, then the same release
can be retried. Anonymous digest pull is verified after publication. Record the
actual source SHA and digest; never substitute a mutable tag.

Legacy Provision environment and host-directory workflows now return
OWNER_ACTION_REQUIRED before any credentials or host access. Use the guided setup
helper and Infrastructure's reviewed initial installer for either environment;
subsequent protected changes follow the approved-plan path. Legacy provision.sh is
retained as reference/tested provider code, not an authorized routine Actions route.

## Environment flows

| Environment | Entry point | Identity and services |
| --- | --- | --- |
| Local | `npm run dev` | Tracked local defaults, private overrides, Firebase Auth Emulator and local MongoDB; no cloud credentials |
| Staging | `_staging` push or manual Release | Shared staging Firebase account pool, app-specific web registration, database/user, Redis, Nginx port and Compose project |
| Production | `_prod` push or manual Release | App-specific Firebase project, database/user, Redis, Nginx port and Compose project |

All public hostnames use the existing host Cloudflare connector. Staging uses direct SSH to the verified VPS on port 22 with the restricted account.
Production uses the restricted controller and pinned SSH path once its own bindings are configured; it is not activated. This project
does not create, reinstall, restart or own that connector or Dify Community.
`agentic-poc` remains their owner; its Terraform writes the complete tunnel route
list. The first staging route is a reviewed owner-side Terraform change. The application reads
live tunnel/DNS configuration and refuses a missing, shadowed or incorrect route;
it does not write Cloudflare configuration.

Authentication-level account changes/revocations affect the shared staging Firebase
pool; app roles and application data remain isolated in each app database.

The maintenance/payment worker and AI worker are background containers built from
the same image as the web app. The maintenance worker reconciles payments,
maintains credits, delivers queued notifications and cleans up files/assets. The
AI worker executes queued Runs, decisions and result application. They continue
working without a browser. Release/check verify fresh worker progress separately
from web readiness; disabled AI still reports process health.

## Tracked configuration

`deploy/environments/local.json`, `staging.json` and `production.json` own public
application/deployment settings. GitHub configuration variables are no longer
used, including for Android. Staging secrets use repository Actions secrets and private
host files. Dev/start and administration commands load tracked local defaults after
Next.js private env files; explicit process/private values win locally. Live images
use generated runtime files. Builds receive no live credentials or deployment config.

For host-owned settings, non-null tracked `runtime` values override matching
private host values on provisioning and release. To activate an optional integration, update its tracked mode
as well as its private credentials; changing only `runtime.env` cannot override a
tracked disabled mode. Rollback uses the retained release snapshot instead of
merging the current tracked settings.

Image-owned application flags are separate: the image build projects only
`DIAGNOSTICS_ENABLED` from each environment JSON into `runtime-settings.json`.
The runtime Node preload selects by `APP_ENV` and overrides a stale retained value
for that flag. No credentials, origins or provider settings enter this map.

Configure these fields before the first preview:

- `runtime`: exact environment, canonical HTTPS origin, display/style defaults,
  Firebase project ID and app-scoped database name. Keep Dify, payments and MCP
  disabled until their integrations are configured. Firebase browser app ID/API
  key are discovered during provisioning and retained privately as runtime values.
- `deployment`: GHCR repository matching `ghcr.io/<owner>/<repository>` in lowercase
  for this workflow repository (the same in both environments), free loopback port, unused private bridge subnet,
  and verified immutable Redis, Nginx and Node administration-image digests.
- `ssh`: staging uses `transport=direct`, the verified VPS hostname and restricted
  user. Cloudflare transport also requires its pinned client version/checksum.
- `google`: shared staging project ID; distinct production project ID and explicit
  `organizations/ID` or `folders/ID` parent; OIDC provider resource and provisioner
  service-account email. `runtime.FIREBASE_PROJECT_ID` must match `google.projectId`.
- `atlas`: existing project/cluster, environment-scoped user and exact VPS egress
  address (`/32` for IPv4, `/128` for IPv6). No new cluster capacity is provisioned.
- `shared`: owner repository/ref, registered-route workflow, and existing
  tunnel/account/zone identifiers matching the owner registry.
- `ghcr.pullUser`: unused for staging public pulls; legacy production only.
- `android`: production wrapper hostname/package when Android delivery is needed.

Staging public bindings are populated from verified discovery; production remains
unconfigured. Validation names missing
fields before host/provider mutation. Public settings may be committed; credentials
must not be put in these JSON documents. The runtime allowlist remains the
[environment catalog](environment-catalog.md).

For derived projects, `--infrastructure-profile PATH` explicitly selects shared
connections. Without it the initializer clears source SSH/provider/owner connections
and derives fresh project names, databases/users, paths, workflow labels and suggested
ports/subnets. Profiles allow only the documented public connection sections; they
never carry credentials. Review host allocations even when using suggested values.

## Secrets and one-time access bootstrap

### Configuration sources and credential preparation

#### AI activation and acceptance

The AI runtime/control update is installed and Release
[40188936199](https://github.com/Uniwares-LTD/unibase/actions/runs/40188936199)
succeeded on 2026-10-25. Payments remain disabled; Mongo assets, existing workers,
Redis and Nginx are retained. Infrastructure's
[current release record](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#current-unibase-release--2026-10-25)
owns source, image digest and installed control/configuration identity.

| Checkpoint | Verified state | Remaining action |
| --- | --- | --- |
| Provider preparation | Dedicated app `9a7a43be-7513-490b-9cbc-8099f9d0d345`, tag `app:unibase-staging`; staging MCP connection authorized with four read-only tools; published version `e23dcf70-f1a3-464c-9efe-c9c056b24b1b` registered successfully | Recheck affected bindings after provider/configuration changes |
| Private configuration | Dedicated execution/MCP/encryption keys installed; all five protected exports exist and pass format checks | Confirm secure Credentials channel handoff of the new exports |
| Release and access | Restricted check passes for app, Redis and both workers; public readiness returns the expected commit; fresh administrator sign-in verified | No additional release needed for the saved application settings |
| Dify acceptance | One application Run succeeded with a successful MCP reference fetch and persisted summary; `gpt-4.1-mini` output capped at 256 tokens | Revalidate after changes affecting the workflow |
| Persona acceptance | One Parent completion succeeded in the same Run; response persisted, 270 total tokens reported; model output capped at 256 tokens | Revalidate after changes affecting completion settings |

Live acceptance on 2026-10-25 used
[Run 936a7ec8](https://unibase-staging.uniwares.co.uk/runs/936a7ec8978784c6d4a8ba3c97126ede25888dfe25413a8478c490f7b2402359).
Attempt 1 succeeded in 15 seconds. After a full reload, the saved Persona response,
MCP trace and summary remained visible. Two explicitly approved promotional credits
were granted: one main charge and one Persona charge settled; the final account
balance, reserved credits and debt were zero, with no active holds. No payment or
execution retry was submitted. No browser console warning/error was captured.

Runs are enabled at the existing fixed one-credit successful-attempt price. Parent
is enabled at one credit per answer, with one answer maximum per attempt (revision 2).
Other example Personas remain disabled. Shared completion settings use
`gpt-4.1-mini` and `max_completion_tokens=256`. These are saved application settings,
not environment JSON defaults; derived apps must configure their own settings.

For acceptance, refresh administrator authentication before registration/settings or
credit changes. Review the selected workflow, Persona answer limit and total maximum
reservation before submitting once. Preserve leases, idempotency and accounting;
inspect uncertain outcomes before retrying billable work. A healthy release alone
does not replace these application checks. Fresh derived provider-write deployment
and off-host recovery acceptance remain separate milestones.

Use the bundled starter; `DIFY_KEY_TEST` is not an initialization requirement.
Never copy `.env.local` wholesale: local emulator, loopback and payment-simulation
settings are not staging bindings. For updates, use the
[operator procedure](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#optional-ai-configuration-update),
not initial preparation replay. Runtime mode alone does not enable Persona completion.

GitHub Actions configuration variables are unused for application deployment.
Public settings are reviewed in `deploy/environments/*.json`; credentials must not
be committed there. Current staging uses repository Actions secrets
`DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_HOST_KEY` (verified public trust material),
and `CLOUDFLARE_READ_TOKEN`. GitHub supplies `GITHUB_TOKEN` for image publication.
Legacy production/optional workflows mention other secrets; they are not staging inputs.

The canonical [credential inventory and checklist](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/provider-access.md)
defines password-manager names, local exports, acquisition, permissions and rotation.
Use protected references, never chat-based secret handoffs. Preserve working filenames.

For new setup, prompt the operator to retrieve the initialization files from the
secure **Credentials** channel and provide only their protected local directory.
The shared inventory lists exact channel filenames and how to use them. Reuse
shared staging access, but create the child's Firebase web registration/database
user and rebuild its preparation bundle. The supplied `unibase-staging-*` files
are Unibase-specific, not child deployment credentials. Keep public configuration
in tracked environment JSON and public host trust in Infrastructure guidance.

Runtime credentials are currently on the VPS, **not runtime Actions secrets**.
`/etc/<slug>/staging/runtime.env` consumes `MONGODB_URI`, authenticated `REDIS_URL`
and Firebase web identifiers. Sibling `firebase.json` contains the Admin identity;
`redis-password` authenticates app Redis. Compose mounts Firebase JSON read-only and
sets `GOOGLE_APPLICATION_CREDENTIALS` to its container path. Releases retain private
snapshots. `FIREBASE_API_KEY` and `FIREBASE_APP_ID` are public browser identifiers.

Initial `prepare-host.py` expects a protected JSON object with `firebase`
(Admin JSON object), `mongodbUri`, `firebaseApiKey`, `firebaseAppId`, optionally
`redisPassword` and an allowlisted `ai` object. A supplied Redis password must match
any installed password; otherwise initial preparation generates one on the host.
Live AI/MCP requires the retained explicit encryption key and matching public bindings.
This is initial preparation, not a general restore/update command:
existing networks/configuration may reject replay. Missing files require operator
review today. Restricted runtime-secret restoration remains **implementation required**.
The guided helper below automates a subset of initialization; it does not install hosts.

### Publication and operator intervention

Every PR prepared for publication must include **Operator intervention: none**,
or list each action with owner, execution location, ordering relative to release,
verification and failure/resume instructions. An image-only change normally needs
no operator; root-owned control scripts, registered configuration, provider bindings,
credentials and data migrations require explicit impact assessment. An app image
cannot update the registered control bundle or provision resources.

A binding change must identify the operator/control update before release, owner
route change if needed, and checks before resuming. Where tooling is absent, say
**implementation required** with prerequisites and acceptance, not invented commands.
Publication alone does not prove live readiness or authorize data restoration.

### Derived-project deployment initialization

1. **Workstation / project owner:** run the README initializer from a reviewed
   committed revision with a unique identity. Explicitly select shared public
   connections with `--infrastructure-profile`; credentials are excluded. Review
   generated JSON, image namespace, database/user, paths, origin and suggested
   listener/subnet against current host inventory. Suggestions are not allocations.
2. **Workstation / agent and operator:** fill the shared credential checklist with
   protected references. Reuse shared deploy/staging Firebase keys and scoped
   Cloudflare read access; acquire app-specific web registration and MongoDB user.
   Collect missing inputs once. GitHub's secrets API cannot retrieve values; children
   inherit no source-repo secrets. Keep operator/provider administration access separate.
3. **Provider consoles/owner workflows:** register the web app in shared staging
   Firebase; configure authorized domain, sign-in and matching OAuth origin/redirect
   entries without removing existing apps. Create the app database user with scoped
   `readWrite` and approve destination egress. The existing tunnel owner adds the
   hostname pointing to private app Nginx. Select optional integrations explicitly;
   use a separate Dify starter app and per-app/environment credentials for AI.
4. **VPS / authorized operator:** for a new host establish operator access, pin host
   identity and install reviewed restricted tooling/compatible Compose. Existing
   hosts reuse shared accounts. Register the derived app's reviewed immutable control
   bundle/configuration and prepare private files/indexes. Do not replay historical
   Unibase root batches or copy its database, subnet or paths.
5. **GitHub / setup operator or authorized agent:** initialize the destination repo,
   enable public GHCR publication as needed and populate the three staging secrets
   from protected originals, preserving SSH key bytes. The guided helper supports these
   three secrets; it does not change organization publishing policy automatically.
6. **GitHub Actions / application:** release a reviewed `_staging` revision through
   its own build → publish → anonymous digest pull → restricted deploy → health flow.
   Verify login/session persistence, database/Redis and both workers; record release
   identity and handoff. Inspect state and resume the failed checkpoint. A failed
   first release stops only its candidate, preserving config/data; no automatic DB restore.

#### Guided setup helper

Run `scripts/deploy/staging-setup.py` on the operator workstation from the generated
application checkout. Python 3 is required; provider operations additionally require
the `cryptography` package. GitHub setup uses an authenticated `gh` CLI. Retrieve the
named files from the secure **Credentials** channel into an access-restricted directory
outside Git. On Windows, restrict its ACL to the operator and SYSTEM; on Linux use
mode 0700 for the directory and 0600 for private files. Never paste values into chat.

```powershell
$project = (Get-Content project.config.json -Raw | ConvertFrom-Json).slug
$revision = git rev-parse HEAD
$credentials = Join-Path $env:USERPROFILE ".config\$project"
python scripts/deploy/staging-setup.py --project $project --revision $revision --credential-directory $credentials
```

The tracked `deploy/environments/staging.json` is the reviewed public profile.
Preview reports missing/invalid filenames together, destination allocations and
remaining manual checks. It does **not** establish that a proposed port/subnet is free.
Add `--providers` for read-only provider discovery. After reviewing that exact output,
repeat the same command with `--apply-preview <previewDigest>` to reconcile supported
Firebase web registration/authorized-domain and Atlas scoped-user operations. A read
credential may fail on writes; obtain write-capable setup access or perform the named
provider action. Atlas network access is never broadened automatically. OAuth origin,
redirect/consent and tunnel-owner operations remain explicit operator checkpoints.

Provider apply retains destination web/database/host-input files and public operation
markers. Rerun preview without `--providers` to prepare local generated credentials.
With `--github --host-key-file <verified-public-record>` the reviewed apply uploads only
`DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_HOST_KEY`, `CLOUDFLARE_READ_TOKEN`. Do not combine
provider and GitHub apply: provider reconciliation returns first and requires a fresh
preview. No Actions variables or new runtime-secret interfaces are created.

| File in the protected directory | Purpose and reuse |
| --- | --- |
| `firebase-staging-service-account.json` | Shared staging Admin identity; reuse after project/permission checks |
| `atlas-discovery.json` | Atlas API key (`publicKey`/`privateKey`) or service account (`clientId`/`clientSecret`); verify setup permissions |
| `cloudflare-discovery.json` | Scoped read token; never tunnel/DNS write authority |
| `uniwares-deploy-user` | Shared deploy private key; operator private key is not uploaded |
| `<project>-staging-web.json` | Child's own Firebase registration; Unibase preserves `firebase-staging-web.json` |
| `<project>-staging-database.json` | Child database/user/password; never copy Unibase's file |
| `<project>-staging-host-input.json` | Provider-prepared base input; assembled from verified cluster endpoint and app registration |
| `<project>/staging/staging-redis-password.txt` | Generated once for a new app; preserve it and refuse replacement |
| `<project>/staging/staging-mcp-token-dify.txt` | Dedicated generated MCP bearer token |
| `<project>/staging/staging-dify-credential-encryption.txt` | Dedicated 64-hex encryption key; retain with DB backups |
| `<project>/staging/staging-dify-management.txt` | Explicitly selected shared Dify management access |
| `<project>/staging/staging-dify-execution-<project>.txt` | Dedicated app execution key obtained from that app, never `DIFY_KEY_TEST` |
| `<project>/staging/staging-persona-completion.txt` | Selected Persona provider API credential |

Initially preview/apply with optional providers disabled to generate the app's MCP,
encryption and Redis files. Create the dedicated Dify document-summary app, set its
tag `app:<project>-staging`, select an available model, and retain its execution key.
Set the tracked public AI endpoints/workspace/app/key-variable references and MCP
permissions; copy selected management/Persona files into the app's protected subdirectory.
Preview again. The helper supports one starter binding and one MCP client; multiple
bindings require explicit operator preparation. It builds a separate `*-host-input-ai.json`
candidate without overwriting the earlier base input. Dify MCP synchronization and
application Persona settings still require agent/administrator operations after the
endpoint is live; runtime mode alone is insufficient. Application-mode children retain
`examples:false`; a demo starter needing demo references must be deliberately adapted
or tested in an examples-mode child, not silently granted sample data.

For a new app, use the final reviewed private input with initial host preparation in
one reviewed root batch. Existing apps use Infrastructure's operator configuration
update, never initial preparation replay. Generate/checksum the batch only after
provider bindings, allocations, candidate files and tests are concrete. Routine release
remains the existing `_staging` workflow. Save generated private originals back to the
protected store/secure channel; the helper does not publish them there.

On interruption, inspect `provider-progress` and current provider state before retry.
An uncertain create is not retried automatically. Matching existing registrations/users
are reused; conflicting identities/permissions stop. Keep generated secrets unchanged.
After permission changes or successful provider mutations, obtain a new preview digest.
The helper is guided initialization, not an unattended host/provisioning orchestrator.

**Production:** `_prod → prod` compatibility is implemented; activation requires reviewed production configuration and recovery acceptance.
The external `prod` target explicitly maps to retained `production` runtime paths. Select
a separate Firebase project per application, production registration and separate
database/runtime credentials, allocations and recovery policy. Do not activate
`_prod` by copying staging secrets; verify the public-image/restricted path through
the separately reviewed production plan first.

**Relocation/recovery:** credentials do not recreate a host or data. Revalidate host
trust, control registration, networking, egress and tunnel bindings. Preserve the
old destination until acceptance and coordinated cutover. MongoDB/GridFS restoration
requires a separately tested recovery procedure.

Use repository Actions secrets for staging, as listed in
[the restricted control procedure](#restricted-first-staging-control-path).
Infrastructure owns the shared key/account bootstrap and protected credential
handoff. Do not create paid-plan GitHub environment secrets for this private repo.
Preserve the deploy key's complete OpenSSH file bytes, line breaks and final
newline. Upload the existing file through a byte-preserving `gh secret set` stdin
operation or paste it into the repository secret editor; avoid shell text encoding
conversions. A runner `error in libcrypto` before SSH authentication requires
checking secret serialization before changing the working server key.
The admin key stays outside routine workflows. Verify host-key material through
trusted operator access; do not use an unchecked scan as trust evidence.

## First provisioning

For staging, use the reviewed Infrastructure installer and the installed
`prepare-host.py` preview/apply procedure above. Reuse the shared Firebase key;
create only the app-specific Atlas user and add the required hostname through the
provider/tunnel owners. Root-owned configuration changes require an operator;
the deployment account cannot provision resources or upload code.

Use the current initializer/setup helper for production-specific public bindings and
protected credential references. Legacy provisioning assumptions do not authorize
Google administration, private registry access or copying staging resources. Production
activation requires its own reviewed configuration, restricted-host installation and
recovery acceptance.

## Operations

Pushes to `_staging` and `_prod` release automatically. Manual Release must select
the matching branch/environment. It guards branch/current remote commit before
building and again before host access, publishes a commit-tagged GHCR image (public for staging; legacy private production)
and deploys its immutable digest. Build/operational failures stop release; quality
reports remain advisory. No required quality branch checks are added.

Routine staging operations use the Check deployment and Rollback GitHub workflows
on `_staging`. The shared deployment account cannot run arbitrary `sudo bash` or
Setup VPS. Use the installed root-owned control checkout only for explicit operator
maintenance, as described above. The first release requires `prepare-host.py` and
additive indexes beforehand; directory setup alone is not provisioning.

The staging [diagnostics API](diagnostics-api.md#staging-activation) is selected by
`runtime.DIAGNOSTICS_ENABLED` in the tracked environment JSON: `true` for staging,
`false` for local and production. The image preload applies the selected flag on
an ordinary release using the existing v1 controller. It needs no new secret;
grants are later created and revoked in Application settings without restarts. Production
rejects enablement. Published configuration alone is not evidence of live activation.

Operations retain the existing app lock and repository Actions concurrency group.
Use runbooks to coordinate shared maintenance and provider domain changes; there is
no new cross-repository scheduler or host-wide orchestration system.

Releases snapshot private config and merge the selected tracked runtime settings.
Changing infrastructure/provider identity requires provisioning first. Pull and
revision verification precede replacement. Web and both workers use one image;
local and public HTTPS readiness must report the expected commit. Failed candidates
restore the previous image and matching configuration. First-release failure stops
the candidate because no previous release exists. Database rollback is never
automatic, and this single-instance setup permits brief interruptions. Old snapshots
contain secrets; retention cleanup is an explicit operator task.

Nginx is the only app ingress. The shared host connector routes to its loopback
port; Nginx trusts CF-Connecting-IP only from that bridge's host gateway and overwrites
forwarded headers. Redis has no published port. The public production app remains
accessible without the operator SSH Access login.

## Local verification and staging acceptance

Run `npm run build`, `npm run typecheck`, `npm run test:deployment`,
`npm run check:workflows`, `npm run check:shell` and affected account tests.
Deployment tests run in a disposable Linux container with synthetic providers,
SSH, registry and Docker; they never provision production services. Provider tests
cover preview, repeated apply, interrupted configuration, identity conflicts and
secret-safe errors. The owner package has registry tests and mock Terraform tests.

Use the [Phase 3 acceptance record](#phase-3--verify-and-hand-off) for current hosted
results and remaining checks. Earlier isolated tests are historical evidence, not
new live certification. Rehearse image/config rollback when a real compatible
predecessor exists; do not manufacture a release. Recovery and production activation
require their own reviewed scope and acceptance.

## Shared ownership follow-ups

- Transfer the shared tunnel to a dedicated infrastructure owner with Terraform
  state, route registry, credentials, locks and preservation of every SSH/app/Dify
  route. Avoid simultaneous route-list writers during handoff.
- Transfer Dify Community lifecycle separately, retaining installation version,
  private credentials, databases/storage, backups and service continuity. No
  reinstallation or provider activation is included in this change.

## Early host compatibility check

Staging and production Release prepare pinned SSH access and sends a read-only dispatcher
`preflight` before registry login/build/publication. A compatible Infrastructure
dispatcher must be installed first; legacy/invalid replies fail closed with operator
instructions. A hash mismatch identifies requested/installed public configuration
hashes and control revision without exposing private settings. MCP permissions remain
host-owned; image settings retain their existing projection.

The PR advisory report compares projected staging profiles and prints changed setting
names only. It does not prove host installation or replace review of control-script,
provider and credential changes. Quality warnings remain advisory; incompatible host
configuration is an operational blocker.

Release summaries distinguish compatibility, build, publication, deployment and
readiness. Buildx combines build/publication: a failure before its successful return
leaves those two outcomes unknown rather than claiming publication did not occur.
Host-call failures/timeouts likewise remain unknown unless a validated rejection or
readiness result establishes more. Inspect installed state before retrying. A successful
preflight is not a reservation: deployment rechecks the hash.

For a new or unmigrated host, Infrastructure installs compatible tooling before
promotion. On the current staging host this installation and the permission correction
are verified; see [current staging release](#current-staging-release). Do not repeat
installation for a documentation-only merge. A future mismatch requires a fresh
reviewed operator update or approved plan, not another image rebuild.

`npm run test:deployment` mounts a sibling Infrastructure checkout when available
(or the explicit INFRASTRUCTURE_CHECKOUT directory) and exercises the real dispatcher
with synthetic registration/control fixtures. Without it, the harness reports that
cross-repository validation was not run and uses its bounded contract fixture.
The fixture bypasses host ownership checks only for temporary paths; Infrastructure
retains its own trust validation tests. Docker and all application providers are mocked
inside the disposable Linux test container; no live services are used.

### Deployment contract and immutable control bundles

[deploy/contract.json](../deploy/contract.json) classifies public settings. The
[contract interpreter](../scripts/deploy/deployment_contract.py) rejects unclassified
settings and protected credential values. Diagnostics is image-owned; MCP permissions
and provider bindings remain host-owned. Release hashes and advisory impact reporting
use this projection. A new setting needs a contract entry, validation, an update
procedure and compatibility coverage; a new image-owned setting also needs explicit
controller support.

Infrastructure's build-control-bundle.py requires a full reviewed commit containing
the contract. It projects environment JSON before archiving and emits a separate
`.tar.manifest.json` containing source commit, contract version, per-environment
configuration hashes, final archive checksum and required capabilities. Earlier source
commits without the contract are rejected. Do not hand-edit an archive after review.
The builder never runs candidate application code to compute the projection.

Version-2 execution acquires the application operation lock before reading installed
registration and passes its descriptor to compatible control scripts. Direct operator
invocations still acquire their own lock. Version-1 callers retain legacy behavior;
the application clients now request version 2. Install compatible host tooling before promotion. Unknown operation status requires readback
before retry, not an assumption that deployment failed. Infrastructure owns the status
file and privileged recovery procedure.

## Repeatable release and protected-change path

Both `_staging` and `_prod` promote reviewed `main` revisions. Production does not
require a staging release. The external target is `prod`; `production` is a deprecated
CLI alias mapped to existing `production` paths and `APP_ENV=production`. Never rename
existing databases, resource names or snapshots. Production diagnostics remain off.
The old production uploaded-script/general-sudo release route is removed from the
client; verify the restricted controller migration before enabling `_prod` releases.

From the application checkout, `npm run deploy:ops -- doctor staging` validates
public bindings without cloud access. On Windows use `npm.cmd` and ensure Python is
available. Other commands use pinned access prepared by `scripts/deploy/access.sh`;
workstation users supply the same named deployment key/host-key exports as Actions,
set a private RUNNER_TEMP directory, and follow the credential inventory. Never use
the shared admin key in routine workflows.

- Image-only: merge a promotion PR from main into the selected environment branch.
  The push triggers Release automatically; do not also dispatch the same commit. Preflight runs before build/login;
  build and anonymous digest verification precede deployment and readiness.
- Protected change: promote the reviewed revision, run **Prepare protected deployment**
  on the matching branch with target staging/prod, and review the public plan artifact.
  It builds/publishes one immutable candidate and stages the projected bundle without
  applying host changes. An enrolled Infrastructure admin dispatches **Apply deployment
  plan** in Infrastructure on main with application, target, plan ID and the same digest.
  The pinned executor applies supported configuration changes and releases that exact
  image. Missing credential references or unsupported provider/data changes stop at
  OWNER_ACTION_REQUIRED; the owner resolves them before a fresh preview.
- Failed/lost operation: use `npm run deploy:ops -- status staging --plan-id DIGEST`
  with the exact returned digest. A lost connection is unknown, not permission to
  repeat writes. New approval can resume verified checkpoints; uncertain operations
  without conclusive readback require the Infrastructure operator.
- Check/rollback: `npm run deploy:ops -- check staging` and
  `npm run deploy:ops -- rollback staging`. Rollback selects the retained image and
  its private configuration snapshot; it never restores a database. A protected
  host-runtime update retains its separate predecessor for explicit operator recovery.
- Manual recovery: `npm run deploy:ops -- backup staging` prepares an approval plan.
  Restore requires `npm run deploy:ops -- restore staging --backup-id SNAPSHOT --destination DATABASE`
  with an exact full restic snapshot and explicit database. Use the approved configured
  database or its `_rehearsal_NAME` destination; see Infrastructure's recovery procedure.

DIGEST/SNAPSHOT are outputs of the preceding operation, not values inferred from a
hostname. Commands reject missing identities. Source candidate artifacts are retained
per Actions run: a rerun reuses the original digest; unavailable artifacts stop the
rerun rather than silently rebuilding. Begin a new reviewed run only after inspecting
registry and operation status. Quality reports remain advisory; compilation, invalid
configuration, anonymous-pull failure, incompatibility and failed readiness are failures.

### New projects and requirements

Use the existing project initializer and guided setup helper. The initializer carries
the deployment contract, workflows, command entrypoint and deployment-start guide;
it clears parent database/web/host/provider bindings, tracking and credentials.
The setup helper accepts `--environment staging` or `--environment prod` and keeps
separate credentials and operation markers. Production Google project ownership must
match the application's labels and parent before reconciliation. Tunnel/Dify changes
remain with their named owners. Collect missing public bindings and protected
credential references together, preview allocations/provider changes, then apply only
the authorized scope. Never copy staging credentials into production.

New requirements extend the declarative contract plus a bounded planner/executor,
validation, update behavior and tests. Unknown settings and unsupported operations
fail explicitly. Host installation, approval trust, recovery credentials and journal
troubleshooting are owned by the [Infrastructure runbook](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#approved-plan-operations).

## Image retention and disk headroom

New control bundles require `image-retention-v1` in addition to the operation lock. Install compatible Infrastructure tooling and explicitly enroll the application's image repository before installing the application bundle. Preflight binds these capabilities before build/publication; old bundles cannot silently execute the new path. Infrastructure owns [policy, initial cleanup, timer and recovery](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#image-retention).

The root-owned maintenance wrapper shares the application lock, acquires the host image lock and checks Docker's data-root plus release/state filesystems. Pulls require at least 20 GiB available, checked again before replacing containers. `INSUFFICIENT_DISK_SPACE` leaves the existing release running. The policy retains three successful snapshots per environment and fourteen days of activations, plus current/previous, containers and unresolved plans. Private snapshots and databases are not deleted.

After readiness and current selection succeed, record the immutable release in the host ledger. Successful rollback records another activation. Cleanup runs only when explicitly enabled in Infrastructure; failures report `maintenance=warning` without restoring a healthy release. Installation alone enables no timer. Root image maintenance is not a GitHub Actions Docker command.

From the workstation with the existing pinned SSH access prepared, use `npm run deploy:ops -- maintenance staging` (or `prod`) for read-only disk, cached-snapshot and last-maintenance status. `doctor` reports required capabilities and this status command without assuming host installation. Historical snapshots outside retention may need an image pull; inspect availability before planning rollback. New projects receive `deploy/image-retention.proposal.json`, which must be reviewed and enrolled by Infrastructure; it does not inherit the parent's identity or enable cleanup.

Operator intervention: Infrastructure owner, root host session; reviewed maintenance policy/controller first, then application control update, manual cleanup verification, staging release acceptance, and separately authorized timer activation. On uncertain cleanup or ledger state, inspect canonical host status and prepare a new reviewed preview; never delete recovery markers to bypass protection.
