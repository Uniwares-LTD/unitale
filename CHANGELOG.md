# Template changelog

Base is versioned as a template with [semantic versioning](https://semver.org/).
`template.json` holds the current version. Derived projects keep their own product
version in `package.json`; their `template.json` records the template release they
last merged.

- Major: derived projects must act during the update (data, configuration or
  extension changes). The upgrade notes say what to do.
- Minor: new reusable behavior that derived projects receive without action.
- Patch: fixes only.

Until 1.0.0 the extension contract may still change in minor releases; the upgrade
notes say when it does. Release tags are named `template-v<version>`.

Every version section has **Changes** and **Upgrade notes**. Write "None." when a
release needs no action. Keep unreleased work under `## Unreleased` until release.

## Unreleased

### Changes

- Defer domain lookup until Run event handling so project extensions may import
  AI job services during registration without a module initialization cycle.

- Map Dify handled node exceptions to failed activity stages, preserving private
  error bodies in opt-in observations instead of labelling the stage successful.

- Add an optional bounded reconciliation callback to the existing AI worker for
  accepted unresolved work after its parent terminates; no new scheduler or dispatch.

- Add project-owned Run start composition and a detail control slot using the existing
  Run DTO/poller. Prepaid Runs omit generic restart controls and use product admission.

- Add opt-in application wait nodes and paused-Run resume hooks on versioned domains,
  reusing worker scheduling and the existing uncertain-decision journal. Internal
  waits suppress creator prompts/notifications and persona responses; application
  provenance cannot approve human or quality decisions.

- Add optional private, bounded domain node observations under the existing AI
  worker fence, including Dify retry/exception output readback. Existing domains
  without the hook retain metadata-only behavior; public Run events stay unchanged.

- Add optional ordered native MCP image results for project tools, preserving JSON/
  text behavior, permission checks and encoded-response limits.

- Add an opt-in official Google Maven hostname fallback for Android builds,
  preserving dependency versions and normal repository defaults.

- Add English/LTR commerce administration for versioned purchase, consumption and
  promotion catalogs, provider previews/publication/readback and audited refunds.
- Add localized catalog purchases and subscription management, Play context guards,
  explicit native store quotes/account binding and deferred replacement. Legacy
  Stripe pack seeds are optional when using administrator-published catalogs.

- Fix provider-catalog checkout return routes, resumable Stripe checkout recovery,
  Play cancellation during a pending deferred change, and idempotent coupon
  capacity release after verified unpaid termination.

- Add opt-in provider catalog checkout, recurring Stripe/Play verification,
  subscription exclusion, expiring renewal grants, refund/bonus reconciliation,
  authenticated notifications and journalled provider publication/readback.

- Add upfront consumption orders, revision entitlements, prepaid Run binding and
  audited refunds; add versioned promotions, fenced redemption reservations and
  idempotent verified-payment bonuses. Existing billing remains opt-in and unchanged.

- Add offline Stripe/Play/TWA compatibility checks, durable administrator MCP limits,
  namespaced private MCP extensions, versioned catalog services/product validators,
  and per-call measurements with private redacted evidence and protected cleanup.
- Add opt-in v1 commerce and execution-measurement contracts for immutable catalog terms, consumption orders, entitlements, subscriptions, promotions and provider evidence. Existing runtime behavior and records remain unchanged.

### Upgrade notes

- Server extensions needing late-result readback may opt into `reconcile(db, now)`.
  The callback must fence its own accepted work and cannot dispatch paid actions.
  Existing worker mode controls remain in force; no migration is required.

- `src/project/run-start.tsx` and `src/project/run-detail.tsx` contain optional
  client-safe Run UI composition points. Defaults preserve existing rendering;
  projects can add controls without editing shared Run pages. See [adding a feature](docs/template.md#add-a-feature).

- Domains may opt into fixed native `applicationWaitNodes` with `resumePaused`;
  see [domain extensions](docs/services.md#domain-extensions-and-migration). Existing
  workflows are unchanged. Retain accepted adapter versions when changing wait IDs.
  No migration, provider change or new scheduler is required.

- Domains needing private execution evidence may opt into `observeNode`; see
  [domain extensions](docs/services.md#domain-extensions-and-migration). Callbacks
  must be idempotent transactional retention only. No migration is required.

- Existing MCP tools need no changes. Image-producing tools can opt into `images`
  as documented in [MCP guidance](docs/mcp.md#native-image-results). Administrators
  must size existing MCP result/response limits for base64 overhead before using
  large originals; defaults are unchanged. No migration or live activation is needed.

- Android consumers must regenerate and rebuild the wrapper to receive the custom
  billing activity and Digital Goods service. Minimum Android API is now 24;
  Billing Client 8.3.0 and Android Browser Helper billing 1.2.0 must resolve.
  Installed-device/store acceptance remains required before enabling purchases.

- Apply `core:0003-provider-billing`. Optional Play credentials and host-owned push
  audience/email settings are documented in
  [provider billing](docs/features/booklet-foundation/provider-billing.md).
  No live provider or catalog is enabled by the migration.

Apply `core:0002-consumption-promotions` through `npm run db:migrate`. Promotion
definitions extend the catalog union; consumers must narrow its kind before reading
purchase/product credits. See [orders and promotions](docs/features/booklet-foundation/orders-promotions.md).

Run `npm run db:migrate` to install additive commerce/execution indexes. Existing
settings retain prior MCP defaults; raw evidence retention defaults to 90 days.
Private extension tools declare `runContext: true` and its input; their handlers
bind project targets to the supplied owned Run. New project permissions use
`extension:<module>:read|write`. See [foundation services](docs/features/booklet-foundation/services.md).
No existing financial/Run records are migrated and no provider activation is performed.

## 0.4.0 — 2026-11-03

### Changes

- Resumable private file uploads (`/api/files/uploads`) in 8 MiB parts on GridFS
  or private S3, with quota reserved up front, idempotent resumption, streamed
  verified downloads and reclamation of idle uploads. The Files page uses them for
  non-image files over 8 MiB and shows progress.
- New `runs.fileBytes` setting (default 20 MiB, at most 1 GiB). The maxima of
  `filesPerAccount` and `uploadBytesPerAccount` rise to 100,000 and 1 TiB; usage
  is counted with an aggregation instead of a 101-row read.
- New `part` rate-limit policy (default 240 per minute) for upload parts.
- Optional `limits` in `project.config.json`: `artifactTextChars` (default 8,000,
  at most 100,000) and `runImages` (default 10, at most 50).

### Upgrade notes

- None required: defaults keep 0.3.0 behavior. To accept large files, raise
  `fileBytes` and the account quota in administration settings. Set `part` in
  `RATE_LIMITS_JSON` only to change its default.
- Projects that raise `limits` also update their orchestrator templates' own
  bounds and the destination Dify limits.

## 0.3.0 — 2026-11-03

### Changes

- Local MongoDB data moves to `.cache/mongodb/<slug>`; the earlier
  `.cache/mongodb-data` is left untouched.
- `MCP_CONNECTION_NONBLOCKING` is a declared tooling variable, so agent hosts
  that set it no longer fail application environment validation.
- Run result images get WebP `thumb` and `preview` variants; the asset route
  serves `?size=`, verifies the session once, and caches privately for five
  minutes with digest ETags.
- `endpoint()` passes its verified session to request actions.
- Template readiness polish: installation history removed; derived projects get
  an empty implementation plan and no template planning documents; generic
  agent guidance with template rules and routing; `docs/template.md`.
- Initializer: `--image-owner`, and the `ssh.transport`, `shared.routeMode` and
  `google.oauthClientId` profile fields. `template:update` keeps the project's
  version of project-owned installation files on conflict.
- Neutral product copy; Runs administration follows the runs module;
  `src/project/home.tsx` replaces the home page; unused catalog keys, dead
  deployment scripts and the tracked generated Android project removed.

### Upgrade notes

- Optional: after the operational backup, `npm run db:migrate` applies
  `runs:0002-asset-variants` to pre-generate variants. Without it, variants are
  created on first request.

## 0.2.0 — 2026-11-02

### Changes

- Template versioning: `template.json`, this changelog and the recorded
  `templateVersion` in derived projects' `project.source.json`.
- Project extension registry: `src/project/extensions.ts` and
  `src/project/server.ts` contribute modules, links, administration sections,
  MCP tools, domain adapters and indexes without editing core files.
- Forward-only database migrations: `npm run db:migrate`, server extension
  `migrations`, and migrations during new-environment provisioning. Replaces
  `scripts/migrate-domain-references.ts` with `runs:0001-domain-references`.
- Removable samples: `samples.json`, `npm run samples`, `check:samples` and
  `samples:remove`. The notes sample is the reference project extension.
- Extension links name a Lucide icon (`icon`) instead of a component (`Icon`).
- History-preserving initializer: derived projects share template history with
  one initialization commit and an `upstream` remote; revisions whose history
  touched private paths are refused. `npm run template:update -- <version>`
  merges a release and prints its upgrade notes.

### Upgrade notes

- After the operational backup, run `npm run db:migrate` (or
  `prepare-host.py --apply --migrate`) once. It records
  `runs:0001-domain-references`, which is idempotent for databases that already
  ran the retired domain-reference script.

## 0.1.0 — 2026-11-02

### Changes

- First versioned baseline of the reusable services: accounts and administration,
  credits and payments, private files, notifications, rate limits, diagnostics,
  MCP and the sample Runs stack.

### Upgrade notes

None. Projects created before versioning should compare against this release.
