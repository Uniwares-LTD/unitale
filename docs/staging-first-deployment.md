# How to deploy Unitale staging for the first time

## Purpose

Prepares, provisions and releases Unitale on srv1 staging, then hands over to
[checkpoint 12 acceptance](features/booklet-generation/implementation-plan.md#12---final-approvals-and-staging-acceptance)
([#21](https://github.com/Uniwares-LTD/unitale/issues/21)). The steps reuse the existing
helper, workflows and Infrastructure installer. They add no new mechanism.
Procedures stay with their canonical owners and this guide only orders them:
[deployment guide](deployment.md#guided-setup-helper),
[Infrastructure operations](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md),
[credential inventory](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/provider-access.md)
and [Dify procedure](features/booklet-generation/workflow-package/integration-handoff.md#difyprovider-compatibility-procedure).

Operator preferences ([#21](https://github.com/Uniwares-LTD/unitale/issues/21#issuecomment-7194304056)):

- Prefer existing workflows and tunnels, then existing SSH, then copyable checksum-pinned scripts.
- Put manual work at the start and the end.

Three constraints force short middle sittings:

1. Release checks the route and runs host preflight **before** building
   ([release.sh](../scripts/deploy/release.sh)).
2. Package visibility can only be changed in the UI, after the first publish.
3. AI settings are installed through a separate reviewed root update after the base
   release ([deployment guide](deployment.md#guided-setup-helper) and
   [AI configuration update](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#optional-ai-configuration-update)).

Both root steps use the **existing trusted root session**. Broad `sudo` from
`uniwares-ops-admin` is not available, because its password is disabled by design.

| Sitting | When | Duration | Content |
| --- | --- | --- | --- |
| **Gate 0** | Start | ~30 min | Authorizations, OAuth console, Dify management access, budget |
| **Gate 1** | Middle | ~25 min | Root batch 1 (registration and base preparation), then the GHCR visibility switch about 10 minutes later |
| **Gate 2** | End | ~75 min | Root batch 2 (AI update, ~10 min), then real-account acceptance once the agent has released and published the Dify suite |

## Baseline (2026-11-26)

*Configured* facts come from tracked files and are rechecked live at apply time.

| Item | State |
| --- | --- |
| Unitale Firebase web app | Verified marker: `1:870391561828:web:ad66111854ba5233882971`, localhost authorized. Its config is in `.config\unitale\staging-firebase-web.json` (with the `firebaseapp` authDomain) |
| Atlas user `unitale_staging` | Verified marker (cluster `kids-booklet`). Its password is in `staging-mongodb-runtime.json`, which local testing shares. Do not rotate it. Same Atlas project as Unibase, whose egress `51.195.218.185/32` is allowed (*configured*) |
| Database | Disposable (owner, 2026-11-26). The first preparation may apply indexes and migrations without a backup gate |
| Repository secrets, GHCR package, `_staging` | None exist |
| srv1 registration | Unitale is absent from Infrastructure `config/approval-targets.json`, the image-retention policy and the inventory |
| Controller capabilities | Inventory (2026-10-31): `operation-lock-v1`, `plans-v2`, `github-oidc-v1`, `image-retention-v1`. Unitale's [contract](../deploy/contract.json) also requires **`data-operations-v1`**, which is unconfirmed (P0) |
| Subnet `172.23.251.128/28` | **Conflicts** with `minio_default` `172.23.0.0/16`. Proposed replacement: `172.30.243.0/24`. Port `34312`: recheck |
| Public bindings to copy | *Configured* in the [Unibase profile](https://github.com/Uniwares-LTD/unibase/blob/main/deploy/environments/staging.json):<br>• `ssh.host` `vps-ae0a9d01.vps.ovh.net`, `ssh.user` `uniwares-deploy-user`, `ssh.transport` `direct`<br>• `shared.ownerRepository` `karpishe-experiments/agentic-poc`, `shared.ownerRef` `master`, `shared.routeMode` `owner-managed`, `shared.routeWorkflow` `null`<br>• tunnel, account and zone IDs<br>• `atlas.vpsEgressCidr` `51.195.218.185/32`<br>• pinned Redis/Nginx/admin digests |
| Shared credentials on this workstation | `%USERPROFILE%\.config\unibase` holds the Firebase Admin, Atlas, Cloudflare read and deploy key files. The operator key is `%USERPROFILE%\.ssh\uniwares-ops-admin` |
| Tunnel route owner | agentic-poc Terraform (only `unibase_staging_hostname` today). See [related workstream](#related-workstream) |

Target hostname: `unitale-staging.uniwares.co.uk`.

## P0 — agent, read-only, before Gate 0

1. **Controller capabilities.** Send the controller's v2 `capabilities` request
   through the deploy account against the registered `unibase` project. The capability
   set is controller-wide. If `data-operations-v1` is absent, its Infrastructure
   installation (Unibase #62 rollout) is a prerequisite, and the operator is told
   before Gate 0.
2. **Fixed discovery.** Run the operator's passwordless `uniwares-discovery` (containers,
   Docker networks, ufw, cron) as the before-image. Check the networks against
   `172.30.243.0/24`. Listener `34312`, free disk and the installed retention-policy
   checksum need root, so `run.sh` prints them in its preview (Gate 1).

## Gate 0 — operator, start

1. **Authorize in the session** each of the following by name. Merges use normal
   merge commits only ([adapter](../.agents/repository-adapter.md#publication-and-external-actions)).
   - commit, push, create and merge the Unitale, Infrastructure and agentic-poc PRs listed below
   - dispatch agentic-poc **Infrastructure** with `apply=true` after its additive preview
   - setup-helper provider apply (Firebase authorized domain and Atlas readback; no network broadening)
   - upload the three repository secrets
   - create `_staging` and push promotions
   - rerun release jobs, Check workflows, Dify imports and publication
2. **Budget:** give the approved paid cap and test workload (booklets × pages ×
   revision rounds × model settings, plus a retry allowance). This replaces the
   US$3 proposal.
3. **Queue ownership:** confirm that local AI workers against `unitale_staging` stay
   stopped from Gate 1 until acceptance ends. The hosted staging worker then owns the queue.
4. **Google OAuth** (Google Cloud console, project `uniwares-base` → Credentials → the
   Firebase web client): add JavaScript origin `https://unitale-staging.uniwares.co.uk`
   and redirect `https://unitale-staging.uniwares.co.uk/__/auth/handler`. Keep existing entries.
5. **Dify management access.** Save it as a single-line file
   `%USERPROFILE%\.config\unitale\unitale\staging\staging-dify-management.txt`, using one of:
   - **Reuse the shared key** (default): copy
     `%USERPROFILE%\.config\unibase\ai-staging\staging-dify-management.txt` unchanged.
   - **Dedicated key**: in `https://dify.uniwares.co.uk`, as workspace owner, create a
     workspace management/console API credential and save it under the same name.

   Do **not** create the Manager app or its execution key in the console. Unitale imports
   the specialists and Manager through its own import journal and issues its own
   execution key ([credentials.ts](../src/lib/server/runs/credentials.ts)). A console-created
   app would not be adopted. The helper generates the MCP token and the encryption key.
   Persona completion stays disabled.

## Agent phase A — unattended

| Step | Action | Mechanism | Stops on |
| --- | --- | --- | --- |
| A1 | In `.config\unitale`:<br>• copy the four shared files (`firebase-staging-service-account.json`, `atlas-discovery.json`, `cloudflare-discovery.json`, `uniwares-deploy-user`) unchanged from `.config\unibase`<br>• create `unitale-staging-database.json` (`database`, `username`, `password`) from `staging-mongodb-runtime.json`<br>• create `unitale-staging-web.json` from `staging-firebase-web.json` with `authDomain` set to the staging hostname, so the helper reuses the recorded app<br>• save the [srv1 host record](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/provider-access.md#obtain-the-initialization-handoff) as `staging-ssh-host-key.txt`<br>• restrict the ACL and check structure without printing values | Local | Identity or key-pair mismatch |
| A2 | Unitale PR:<br>• fill [staging.json](../deploy/environments/staging.json) with `APP_ORIGIN`, the bindings above and the new subnet; `DIFY_MODE` stays `disabled` and `MCP_ENABLED` stays `false`<br>• record `_staging` in the [branch policy](../.agents/repository.md)<br>• add this guide<br>`deploy:ops -- doctor staging` must pass. Merge | PR | Doctor failure |
| A3 | agentic-poc PR: an optional `unitale_staging_hostname` that mirrors the reviewed Unibase variable (one proxied CNAME and one ingress route to Unitale's loopback listener). Merge, review the automatic preview (additions only, no drift), then dispatch `apply=true` | Existing workflow | Any deletion or drift |
| A4 | Infrastructure PR:<br>• add `unitale.staging` to `config/approval-targets.json`<br>• add Unitale to the image-retention policy, from the [proposal](../deploy/image-retention.proposal.json), automatic cleanup off<br>• add an inventory entry<br>Merge | PR | Review findings |
| A5 | [Setup helper](deployment.md#guided-setup-helper) on the merged commit, with `$cred = "$env:USERPROFILE\.config\unitale"`:<br>1. preview<br>2. `--providers` preview. **Stop unless** `providerObservation.firebaseAppId` equals the marker<br>3. `--providers --apply-preview D` (authorized domain, Atlas readback, `unitale-staging-host-input.json`)<br>4. fresh preview, then `--apply-preview D` (generates Redis, MCP and encryption files and the base host input)<br>5. `--github --host-key-file "$cred\staging-ssh-host-key.txt"` preview, then the same flags with `--apply-preview D` | Existing helper | Write needing broader access: report it as an owner action |
| A6 | Build `output/unitale-operator-package` (ignored):<br>• `build-control-bundle.py` on the merged commit (archive, manifest, SHA-256)<br>• `bootstrap-deploy.py` and `deploy-dispatch.py`<br>• the deploy public key<br>• `image_maintenance.py`, `install-image-maintenance.py` and the policy at the merged Infrastructure revision<br>• `SHA256SUMS`<br>• `run.sh` (see Gate 1)<br>The private host input stays in `.config\unitale` and is transferred separately | Local (Infrastructure tooling) | Builder rejection |
| A7 | `npm.cmd run db:migrate -- --manifest`: record the 10 declared migrations | Local | — |

## Gate 1 — operator, middle

1. Copy from PowerShell. Use `ask` only on a first-ever connection, after comparing the
   fingerprint `SHA256:Jk5pHbF36TXs3PZ+50CuaX074dLjCd4/Gs7uIrU6vyc`.

   ```powershell
   $key = "$env:USERPROFILE\.ssh\uniwares-ops-admin"; $dest = 'uniwares-ops-admin@vps-ae0a9d01.vps.ovh.net'
   $opts = @('-P','22','-i',$key,'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes')
   scp @opts -r .\output\unitale-operator-package "${dest}:~/"
   scp @opts "$env:USERPROFILE\.config\unitale\unitale\staging\unitale-staging-host-input.json" "${dest}:~/unitale-operator-package/private-input.json"
   ```
2. In the **existing trusted root session** on srv1:

   ```bash
   bash /home/uniwares-ops-admin/unitale-operator-package/run.sh          # preview
   APPLY=1 bash /home/uniwares-ops-admin/unitale-operator-package/run.sh  # after review
   ```

   `run.sh` first copies the package into a fresh root-only directory
   (`/root/unitale-install.<time>`, mode 0700), removes the copy in the shared home,
   verifies `SHA256SUMS`, and runs everything from there. The installer refuses
   user-writable parents. The preview prints:
   - the controller, registration and pending-journal readback
   - listener `34312`, routes, Docker networks and free disk
   - the installed retention-policy checksum
   - each tool's own preview

   The apply, in canonical order:
   1. `install-image-maintenance.py --apply --expected-policy-sha256 <observed>`
   2. `python3 -I bootstrap-deploy.py --apply` (registers Unitale; refuses any change to the shared account or dispatcher)
   3. the installed bundle's `python3 -B prepare-host.py --credentials private-input.json --apply --indexes --migrate` (allowed because the database is disposable)
   4. `shred` of the private input

   It prints checksums and status names only.
3. Say "Gate 1 done". Stay for about 10 minutes: the agent pushes `_staging`, and the first
   publish creates the package. Then open GitHub → Uniwares-LTD → Packages → `unitale` →
   **Package settings → Change visibility → Public**.

## Agent phase B — unattended

| Step | Action | Mechanism |
| --- | --- | --- |
| B1 | Create `_staging` from merged `main`. The push runs **Release**. If it stops at the private-package check, wait for the switch, then rerun **only the `release` job**. On `blocked-migrations` or `blocked-recovery`, stop and report the plan ID ([data operations](deployment.md#reusable-data-operations)). Never full-rerun | Existing workflow |
| B2 | Confirm readiness reports the commit, run **Check deployment**, check DNS, tunnel ingress and the authorized domain, and compare against the P0 discovery | Existing workflows, read token |
| B3 | AI preparation:<br>• Unitale PR setting `DIFY_MODE`, `MCP_ENABLED`, Dify endpoints and workspace, `MCP_CLIENTS_JSON` and `RUN_MCP_CLIENT_ID` (as in Unibase's runtime block); merge<br>• new control bundle from that commit<br>• root-only private input with `DIFY_MANAGEMENT_KEY`, `DIFY_CREDENTIAL_ENCRYPTION_KEY` and `MCP_TOKEN_DIFY` from the protected files<br>• `run-ai.sh` that stages the files the same way and runs `update-app-config.py --project unitale --expected-revision <installed> --bundle … --sha256 … --private-input …` as preview, then `APPLY=1` | PR, local |

## Gate 2 — operator, end

1. Copy the B3 package and private input as in Gate 1, then run `run-ai.sh` (preview, then `APPLY=1`) in the trusted root session. Say "AI installed".
2. Wait while the agent runs these (about 30 minutes):
   - promote the AI commit to `_staging` (Release plus Check)
   - sync Dify MCP to the deployed origin
   - import and publish the six specialists, then the Manager, through Unitale's import journal; the app issues the execution key
   - read back identities, tool bindings and permissions
   - record revisions, digest and bindings in #21 and the [delivery map](features/booklet-generation/implementation-plan.md#issue-10-deliverables-and-dependency-map)
3. With real internal accounts at `https://unitale-staging.uniwares.co.uk`, work through the
   [checkpoint 12 list](features/booklet-generation/implementation-plan.md#12---final-approvals-and-staging-acceptance):
   - Firebase sign-in
   - admin credit grant and charge
   - create a booklet; Human Input approval and resume; revision
   - image quality judgement
   - download the original images
   - cross-account denial

   Stay within the cap. On an unknown paid outcome, stop and let the agent reconcile
   before any retry. The agent records spend, G01–G17 and E1–E6.

## Verify

- Release and Check succeed, and readiness reports the `_staging` commit.
- Existing services match P0 discovery.
- Checkpoint 12 evidence is recorded in #21.

## Troubleshooting

- **Unknown or interrupted operation:** read the original run and host state first. Plan-bound operations use `npm.cmd run deploy:ops -- status staging --plan-id <ID>`, or the [Data operations](https://github.com/Uniwares-LTD/unitale/actions/workflows/data-operations.yml) `status` action from a workstation without restricted transport. Never replay bootstrap or retry an uncertain write ([operations](https://github.com/Uniwares-LTD/infrastructure/blob/main/docs/operations.md#prepare-approve-apply-inspect)).
- **Helper "Prior provider operation recorded":** inspect that marker's resource before removing it or retrying.
- **Preflight configuration mismatch after registration:** bootstrap refuses a different revision. Use the reviewed operator configuration update or the approved-plan path, never a rebuilt bootstrap.
- **`update-app-config` interrupted:** inspect, then run the same tool with `--recover --apply` before retrying.
- **Terraform plan shows deletion or drift:** do not apply. Resolve it with the tunnel owner.

## Related workstream

Owner decision (2026-11-26): move server, tunnel, Dify and the other srv1 deployment
management from `karpishe-experiments/agentic-poc` into Uniwares-LTD/infrastructure,
then retire agentic-poc from that role without breaking current services. It runs in
parallel with this runbook as a separate, approval-gated migration
([infrastructure#14](https://github.com/Uniwares-LTD/infrastructure/issues/14)).
Unitale's A3 route is additive and moves with it.
