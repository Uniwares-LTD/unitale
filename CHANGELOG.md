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

- Add upfront consumption orders, revision entitlements, prepaid Run binding and
  audited refunds; add versioned promotions, fenced redemption reservations and
  idempotent verified-payment bonuses. Existing billing remains opt-in and unchanged.

- Add offline Stripe/Play/TWA compatibility checks, durable administrator MCP limits,
  namespaced private MCP extensions, versioned catalog services/product validators,
  and per-call measurements with private redacted evidence and protected cleanup.
- Add opt-in v1 commerce and execution-measurement contracts for immutable catalog terms, consumption orders, entitlements, subscriptions, promotions and provider evidence. Existing runtime behavior and records remain unchanged.

### Upgrade notes

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
