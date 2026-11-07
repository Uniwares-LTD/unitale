# Source map

## Task routing

Read the [repository adapter](../.agents/repository-adapter.md) for local rules,
then use the row matching the task. Shared skills resolve at the retained Handbook
revision; these links provide context, not additional authority.

| Task | Start here | Add when applicable | Verification |
| --- | --- | --- | --- |
| Guidance and Handbook integration | [Agent tooling](agent-tooling.md), [handbook.json](../handbook.json) | Generated [bootstrap](../.agents/handbook.md), selected maintain-project skill | handbook:ready, handbook:entrypoints, check:skills, check:docs |
| UI, locale or navigation | [Design system](design-system.md), [locale architecture](architecture.md#locale-and-direction) | Selected Next.js, React and Playwright skills; adapter UI checks | typecheck, lint, check:i18n, affected browser journeys |
| Files, quotas, domains or accounting | [Service contracts](services.md) | [Server modules](../src/lib/server), accepted [plan](implementation-plan.md) | Affected behavior/boundary tests and adapter checks |
| MCP or Dify workflows | [MCP guidance](mcp.md) | [Environment binding](../src/lib/server/runs/environment-binding.ts), [templates](../src/lib/server/runs/templates/README.md) | Affected accounts/MCP tests; typecheck/build for runtime changes |
| Diagnostics | [Diagnostics API](diagnostics-api.md) | [Diagnostic server](../src/lib/server/diagnostics), service read-only boundaries | Affected diagnostics tests and inventories |
| Deployment or provider activation | [Deployment guidance](deployment.md#choose-an-operation) | Infrastructure owner guidance/inventory linked there; adapter operational boundaries | Impact classification and affected deployment checks; live actions need separate authorization |
| Add a project feature | [Using the template](template.md#add-a-feature), [project extensions](architecture.md#project-extensions) | [Notes sample](../src/samples/README.md), [project registries](../src/project) | typecheck, lint, check:samples, affected tests, build |
| Data migration | [Migrations](architecture.md#extension-conventions) | [Core migrations](../src/lib/server/core-migrations.ts), server extension `migrations` | Disposable-database tests; db:migrate locally |
| Template updates or releases | [Using the template](template.md#receive-template-updates), [changelog](../CHANGELOG.md) | [Update command](../scripts/template-update.mjs), [initializer](../scripts/project-initializer.ts) | check:template, test:initializer, test:initialized-projects |
| New documentation or templates | [Canonical documents](#documentation) | Selected maintain-docs skill and [local starters](templates) | check:docs; opt-in template replacement |

Command definitions and proportional selection remain in [package.json](../package.json)
and the adapter; the table does not require unrelated suites for every task.

## Components

- [Booklet requirements](features/booklet-generation/prd.md) and
  [delivery plan](features/booklet-generation/implementation-plan.md) own the accepted
  product contract and cross-repository dependencies. Implementation is in progress.
  [Contract compatibility](features/booklet-generation/contracts.md) describes the
  opt-in v1 schemas and the distinction between shape validation and service authorization.
  [Model review](features/booklet-generation/model.md) owns the proposed overview, detail diagrams and T14 decision agenda;
  regenerate all SVGs and the simple/complete Mermaid versions with `npm run docs:booklet-model` whenever model relationships change.
  The [offline Dify harness](features/booklet-generation/dify-compatibility.md) owns
  candidate graph/adapter compatibility evidence and `test:booklet-compat`;
  its fixtures live in [tests/booklet-compat](../tests/booklet-compat), outside production registries.

- [Consumption orders and promotions](features/booklet-foundation/orders-promotions.md)
  describe prepaid Run binding, revision allocations, refunds and verified coupon benefits.
  Implementations: [orders](../src/lib/server/commerce/orders.ts),
  [promotions](../src/lib/server/commerce/promotions.ts); verify with `test:commerce`.

- [Foundation services](features/booklet-foundation/services.md) own T03-T06 commerce catalogs,
  private execution evidence and MCP settings. [Billing compatibility](features/booklet-foundation/billing-compatibility.md)
  owns offline provider/Android bridge evidence. Server implementations are in
  [commerce](../src/lib/server/commerce/catalogs.ts) and [execution](../src/lib/server/execution/measurements.ts).

- [Commerce contracts](../src/lib/contracts/commerce.ts) and [execution measurements](../src/lib/contracts/execution-measurements.ts) define opt-in v1 foundation DTOs. Reusable persistence and catalogs are described in [foundation services](features/booklet-foundation/services.md); [contract tests](../tests/commerce-contracts.test.ts) cover validation boundaries.

- Runs module (planned sample): [environment binding](../src/lib/server/runs/environment-binding.ts) owns Dify app
  ownership, managed MCP setup, endpoint identity, graph binding and destination
  prerequisites. [Creation](../src/lib/server/runs/creation.ts) journals exact-version
  copying; [binding contracts](../src/lib/contracts/environment-binding.ts) expose
  allowlisted identity/provenance. Browsers never receive MCP credentials.

- [Application routes](../src/app) own layouts, pages, Server Actions and HTTP entrypoints.
- [UI](../src/components) and [design system](design-system.md) own reusable primitives and interaction.
- [Server modules](../src/lib/server) own authorization, persistence, provider adapters and workers;
  [service contracts](services.md) define ownership, quotas and transaction boundaries.
- Runs module, story-panel sample: [image renewal](../src/lib/server/runs/image-renewal.ts) verifies original
  story-panel file identities and the bundled Code validator before renewing expired Dify links.
  [Media retention](../src/lib/server/runs/media.ts) stages owned bytes before settlement.
- [Project extensions](../src/project) are project-owned registrations of features and
  samples; core reads them through [the contract](../src/lib/extensions.ts).
- [Samples](../src/samples/README.md) are removable reference features declared in
  [samples.json](../samples.json); [the samples script](../scripts/samples.mjs) checks and removes them.
- [Configuration](../project.config.json) owns project identity/modules; [pure parsers](../src/lib/config)
  separate public settings from private server configuration.
- [Scripts](../scripts) own local checks, initialization and operator commands.
- [Template version](../template.json) and the [changelog](../CHANGELOG.md) own template
  release identity and upgrade notes; [the check](../scripts/template-version.mjs) validates them.
  [The update command](../scripts/template-update.mjs) merges template releases into derived projects.
- [Deployment](../deploy) owns application configuration/templates; [MCP](mcp.md) and
  [Dify integration](../dify) describe application transport and workflow contracts.
  The [host projection](../scripts/deploy/release_settings.py) separates image-owned
  flags from the host profile; [runtime settings](../scripts/runtime-settings.cjs)
  validate the image flag map. Infrastructure owns the shared v1/v2 request dispatcher and approval engine.

- [Diagnostic grants](../src/lib/server/diagnostics/grant-store.ts) own durable
  MongoDB verifiers and per-issuer issuance fences; Redis owns only shared counters.
  The [diagnostics API](diagnostics-api.md) owns one-time credential delivery and rollout.

## Documentation

Administration uses English source copy and `src/lib/admin-labels.ts` for data labels.
`src/components/application-locale.tsx` switches shared shell language/direction at
the admin boundary; public-page catalogs remain in `messages/`.

[README](../README.md) owns setup; [architecture](architecture.md) owns current behavior;
[implementation plan](implementation-plan.md) owns accepted milestones and remaining acceptance.
[Deployment](deployment.md) owns application operations; [agent tooling](agent-tooling.md)
owns integration procedures and provenance; the [repository adapter](../.agents/repository-adapter.md)
owns local constraints and Handbook exceptions. Root [instructions](../AGENTS.md)
own task-start routing and short decision-point reminders; this map owns navigation.
Dated evidence lives in Git history, not in a docs folder.
Repository [preferences](../.agents/repository.md) own issue language and durable branches;
[tracking metadata](../.agents/tracking.json) records this repo's selection when configured.
[Document starters](templates), [issue forms](../.github/ISSUE_TEMPLATE) and the
[PR template](../.github/PULL_REQUEST_TEMPLATE.md) are permissive project-owned copies.
Large-work starters include the [PRD](templates/prd.md) and
[checkpoint implementation plan](templates/implementation-plan.md); they do not replace
the accepted project implementation plan.

## Commands

[package.json](../package.json) is the command authority. [Validation](../scripts/validate.mjs)
collects advisory checks; compilation/bundling failures remain build failures.
[Tests](../tests) use local/disposable fixtures. Handbook readiness and entrypoint drift
checks run offline; setup and lazy refresh use the separately authorized Handbook clone.

## Generated areas

Next.js output, dist, caches and browser artifacts are ignored; do not edit them as sources.
[Translation assets](../scripts/i18n-assets.mjs), [environment docs](../scripts/environment-docs.mjs),
icons and Android wrappers are generated by their package commands from reviewed sources.
The local [Handbook bootstrap](../.agents/handbook.md) and Codex/Claude skill entrypoints
are explicitly synchronized from the reviewed Handbook snapshot;
custom content is reconciled manually. skills-lock.json records reviewed local hashes.
The [gate list](../.agents/gated-commands.json) feeds generated Claude ask/deny rules
through handbook:sync; other client settings are preserved. handbook:templates previews
starters and copies missing files; existing templates require a named update.
Application source, project configuration, this map and canonical guidance remain project-owned.

## Ownership

This repository owns application behavior and local facts; Handbook owns shared procedures.
Infrastructure owns shared hosts/access and inventory, as linked from [deployment](deployment.md).
No host, Dify or tunnel ownership transfers through these references. The user's assignment
identifies the accountable member; credentials do not. Accepted milestone authority and
advisory validation remain as defined in [AGENTS.md](../AGENTS.md) and the adapter.

Deployment compatibility is checked by scripts/deploy/preflight.py using the restricted
Infrastructure protocol. scripts/deploy/configuration-impact.py supplies an advisory
PR host-setting report; canonical ownership and rollout remain in deployment.md.

The [deployment contract](../deploy/contract.json) owns configuration classification;
its [interpreter](../scripts/deploy/deployment_contract.py) is mirrored in Infrastructure
for privileged-free bundle preparation. The cross-repository parity test detects drift.
[Inherited lock validation](../scripts/deploy/verify-operation-lock.py) belongs to
application control; Infrastructure owns lock acquisition, lifetime and status.

Deployment changes require configuration ownership classification and operator-impact reporting. The deployment/operations guide owns plan approval, status and recovery; contract changes require validation, update behavior and compatibility coverage.

The [host release script](../scripts/deploy/vps.sh) delegates disk protection and image maintenance to Infrastructure's installed controller. [The initializer](../scripts/project-initializer.ts) generates a project-specific retention enrollment proposal, never host authorization.

Dated evidence lives in Git history and pull requests, not in current documents.

[Provider billing](features/booklet-foundation/provider-billing.md) owns the catalog
purchase API, verified Stripe/Play adapters, subscription exclusion, renewal lots,
provider-action journals and notification/worker reconciliation. Sources live in
`src/lib/server/commerce/billing*.ts`, `*-billing.ts`, `provider-*.ts` and
`google-auth.ts`; offline checks are `npm run test:provider-billing`.

Commerce administration lives in `src/lib/server/commerce/admin.ts`,
`src/app/admin/commerce` and `src/components/commerce`. Public purchase DTOs are
`src/lib/contracts/purchase-client.ts`; the browser/native boundary is
`src/lib/client/play-billing.ts` and `android/billing/CatalogPaymentActivity.java`.
The [provider billing guide](features/booklet-foundation/provider-billing.md) owns
setup and recovery. `npm run test:commerce-ui` verifies service and fake-client paths;
`scripts/android-generate.ts` owns copying the native activity into generated output.
`android/google-maven.init.gradle` is the opt-in official Google Maven hostname
fallback; [native build prerequisites](features/booklet-foundation/provider-billing.md#native-build-prerequisites)
own its invocation and limitations.
