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
  product contract and cross-repository dependencies. Its
  [remaining 07-12 plan](features/booklet-generation/implementation-plan.md#remaining-implementation-kickoff-and-ownership)
  maps T18-T21, Unitale/Unibase ownership and approval gates; its
  [retry/reconciliation policy](features/booklet-generation/implementation-plan.md#action-retries-and-automatic-reconciliation)
  owns planned defaults and recovery semantics. The current amendment is documentation
  only at its original checkpoint; 07 storage is now implemented locally and reviewed.
  Shared runtime and application integration remain 08-11.
  [Workflow package design](features/booklet-generation/workflow-design.md) owns
  issue #10's accepted Manager/app/service boundaries, integration gap assessment and
  open contract decisions. It distinguishes the target from current application code.
  The [candidate package](features/booklet-generation/workflow-package/README.md)
  contains readable native Dify YAML, essential inline checks and source provenance;
  its [integration handoff](features/booklet-generation/workflow-package/integration-handoff.md)
  records proposed application deltas without runtime registration.
  Official provider plugins are configuration dependencies; no custom provider package
  or workflow authoring framework is delivered. Target capabilities remain pending.
  The handoff also links the bounded offline-tested upstream patch for demonstrated
  official-plugin gaps, plus isolated test-build evidence and verified cleanup.
  The upstream PR is withdrawn. The handoff owns accepted SDK retry/default-timeout/alias
  tradeoffs; reuse installed shared providers unchanged. Local builds are optional
  historical remediation, not delivery prerequisites or official releases.
  [First-package specification](features/booklet-generation/workflow-package-spec.md)
  owns the detailed operation mapping, proposed contracts, configuration inputs and
  app/MCP/UI change inventory for generating the seven workflows.
  The delivery plan's 01-12 checkpoints own issue #10 sequencing, per-gap coverage,
  exact validation commands and implementation/publication/paid-acceptance gates.
  01-06 deliver a candidate package before application changes; 07-12 are gated
  application integration and staging acceptance. Its execution procedure owns slice
  order, two-pass review, evidence/resume records and dependency reassessment.
  Package boundaries describe the target integration; 07 implements opt-in v2 storage
  in the model docs, with runtime wiring remaining in 08-11. The package integration handoff is created in 01 and
  closed in 06, without a second application implementation queue.
  [Implementation-readiness audit](features/booklet-generation/workflow-design.md#implementation-readiness-audit)
  maps A01-A22 to selected technical resolutions and their remaining verification gates.
  The package specification owns the wire/storage/transport/recovery/UI details;
  design closure is distinct from G implementation gaps and E1-E6 runtime evidence.
  [Contract compatibility](features/booklet-generation/contracts.md) describes the
  opt-in v1 schemas and the distinction between shape validation and service authorization.
  [Model review](features/booklet-generation/model.md) owns the accepted document boundaries, nested JSON example, diagrams and implemented lifecycle/media boundaries;
  Unitale repositories and schemas live in `src/lib/server/booklets`;
  [v2 content boundaries](../src/project/booklets/contracts-v2.ts) and the
  [v2 repository](../src/lib/server/booklets/repository-v2.ts) are opt-in 07 work,
  preserving strict v1 readers and records. V2 work, scoped assessments and Manager
  acceptance use project-owned collections and the index-only 0004 migration; trusted
  runtime/tool wiring remains pending.
  `src/project/booklets/extension.ts` and `server.ts` own registration.
  `npm run test:booklet-repositories` and `npm run test:booklet-lifecycle-media` verify disposable-database behavior.
  `src/lib/server/booklets/mcp-tools.ts` owns the private catalog and
  `mcp-transfers.ts` its bounded staging; `npm run test:booklet-mcp` verifies the
  real MCP handler with disposable persistence. [MCP guidance](mcp.md#unitale-booklet-catalog-t17)
  owns its permissions, transfer protocol and trusted reviewer binding.
  Booklet lifecycle, prepaid Run admission, guards and original-media services are in `src/lib/server/booklets`; the domain adapter is `src/project/booklets/domain.ts`.
  Regenerate the simple/complete Mermaid versions with `npm run docs:booklet-model` whenever model relationships change.
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
  [Run start composition](../src/project/run-start.tsx) and
  [Run detail controls](../src/project/run-detail.tsx) stay inside existing Run pages.
  [Domain hooks](services.md#domain-extensions-and-migration) own private observations
  and non-paid application waits through the existing worker.
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
