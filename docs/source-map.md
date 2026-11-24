# Source map

## Task routing

Read the [repository adapter](../.agents/repository-adapter.md) for local rules,
then use the row matching the task. Shared skills resolve at the retained Handbook
revision; these links provide context, not additional authority.

| Task                                 | Start here                                                                                                                                           | Add when applicable                                                                                                           | Verification                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Guidance and Handbook integration    | [Agent tooling](agent-tooling.md), [handbook.json](../handbook.json)                                                                                 | Generated [bootstrap](../.agents/handbook.md), selected maintain-project skill                                                | handbook:ready, handbook:entrypoints, check:skills, check:docs                                 |
| UI, locale or navigation             | [Design system](design-system.md), [derived-project design](design-system-extension.md), [locale architecture](architecture.md#locale-and-direction) | Local `build-ui` skill; selected Next.js, React and Playwright skills; adapter UI checks                                      | typecheck, lint, check:i18n, build, affected browser journeys; production CSP check for toasts |
| Files, quotas, domains or accounting | [Service contracts](services.md)                                                                                                                     | [Server modules](../src/lib/server), accepted [plan](implementation-plan.md)                                                  | Affected behavior/boundary tests and adapter checks                                            |
| MCP or Dify workflows                | [MCP guidance](mcp.md)                                                                                                                               | [Environment binding](../src/lib/server/runs/environment-binding.ts), [templates](../src/lib/server/runs/templates/README.md) | Affected accounts/MCP tests; typecheck/build for runtime changes                               |
| Diagnostics                          | [Diagnostics API](diagnostics-api.md)                                                                                                                | [Diagnostic server](../src/lib/server/diagnostics), service read-only boundaries                                              | Affected diagnostics tests and inventories                                                     |
| Deployment or provider activation    | [Deployment guidance](deployment.md#choose-an-operation)                                                                                             | Infrastructure owner guidance/inventory linked there; adapter operational boundaries                                          | Impact classification and affected deployment checks; live actions need separate authorization |
| Add a project feature                | [Using the template](template.md#add-a-feature), [project extensions](architecture.md#project-extensions)                                            | [Notes sample](../src/samples/README.md), [project registries](../src/project)                                                | typecheck, lint, check:samples, affected tests, build                                          |
| Data migration                       | [Migrations](architecture.md#extension-conventions)                                                                                                  | [Core migrations](../src/lib/server/core-migrations.ts), server extension `migrations`                                        | Disposable-database tests; [staging operator flow](deployment.md#database-migrations-on-existing-staging) |
| Template updates or releases         | [Using the template](template.md#receive-template-updates), [changelog](../CHANGELOG.md)                                                             | [Update command](../scripts/template-update.mjs), [initializer](../scripts/project-initializer.ts)                            | check:template, test:initializer, test:initialized-projects                                    |
| New documentation or templates       | [Canonical documents](#documentation)                                                                                                                | Selected maintain-docs skill and [local starters](templates)                                                                  | check:docs; opt-in template replacement                                                        |

Command definitions and proportional selection remain in [package.json](../package.json)
and the adapter; the table does not require unrelated suites for every task.

## Components

- [Booklet requirements](features/booklet-generation/prd.md) and
  [delivery plan](features/booklet-generation/implementation-plan.md) own the accepted
  product contract and cross-repository dependencies. Its
  [delivery map](features/booklet-generation/implementation-plan.md#issue-10-deliverables-and-dependency-map)
  owns checkpoint progress, estimates and the resume point. Its
  [post-import design mapping](features/booklet-generation/implementation-plan.md#refreshed-baseline-and-design-handoff-2026-11-21)
  records the design-reference adoption and merge evidence. Its
  [retry/reconciliation policy](features/booklet-generation/implementation-plan.md#action-retries-and-automatic-reconciliation)
  owns accepted defaults and recovery semantics.
  [Workflow package design](features/booklet-generation/workflow-design.md) owns
  issue #10's accepted Manager/app/service boundaries, integration gap assessment and
  open contract decisions. It distinguishes the target from current application code.
  The [candidate package](features/booklet-generation/workflow-package/README.md)
  contains readable native Dify YAML, essential inline checks and source provenance;
  its [integration handoff](features/booklet-generation/workflow-package/integration-handoff.md)
  records implemented local boundaries and the remaining provider acceptance checks.
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
  The model docs own the opt-in v2 storage contract. The provider handoff links back to
  the delivery map for application progress.
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
  runtime/tool wiring is locally verified through 09.6; target execution remains pending.
  `src/project/booklets/extension.ts` and `server.ts` own registration.
  Checkpoint 10's private application facade is `src/lib/server/booklets/application.ts`
  (tested by `npm run test:booklet-application`); its client-safe commands/DTOs are
  `src/project/booklets/application-contract.ts`, served by `src/app/api/booklets`
  (routes build the facade through `application-request.ts`). Booklet Run detail
  redirects to the owned conversation. Recovery and history are available there
  through `book-details.tsx`, `booklet-actions.tsx` and `booklet-history.tsx`.
  Booklet administration is `src/app/admin/booklets`, `src/app/api/admin/booklets`
  and `src/lib/server/booklets/admin.ts`.
  The default conversation package setting is in `src/lib/server/booklets/settings.ts`.
  The conversation turn/reply contract is `src/project/booklets/turn-contract.ts`
  (tested by `tests/booklet-turns.test.ts`); `repository-v2.ts` `requestHuman` binds it.
  The conversation pages are `src/app/books/new` and `src/app/books/[id]`, with booklet
  client components in `src/project/booklets/conversation/` composed from the reusable
  Unitale conversation components in `src/project/components/conversation/`. The facade's `entry`,
  `startIdea`, `conversation` and `reply` serve them, and
  `tests/integration/booklet-chat-manager.ts` is the local preview Manager.
  The project Run start link (`src/project/run-start.tsx`) and
  home (`src/project/home.tsx`) use existing project slots. Browser checks seed the
  disposable fixture with `tests/integration/booklet-fixture-seed.ts` and run
  `booklet-conversation-browser.js`, `booklet-conversation-matrix.js` and
  `booklet-start-recovery.js` in
  `tests/integration` through playwright-cli. The checkpoint 10 form and panel
  scripts are historical. `npm run test:booklet-modules` runs the
  module-disabled test in `tests/booklet-modules` with Node module mocking.
  `npm run test:booklet-repositories` and `npm run test:booklet-lifecycle-media` verify disposable-database behavior.
  `src/lib/server/booklets/mcp-tools.ts` owns the private v1 catalog and
  `mcp-tools-v2.ts` its v2 checkpoint/index/creative-registration handlers and typed-read wrapper;
  `read-v2.ts` owns v2 production/checkpoint/revision/work/assessment/acceptance/execution DTOs, authenticated human-response correlation, bounded typed sections and owned artifact/action/acceptance/human/execution/production history metadata;
  direct owned v2 predecessor reads and exact revalidation copy use the same readers/repository, with verified original attachments and separately selected current candidates;
  `suite-v2.ts` validates server-owned Manager/child-tool mappings and resolves the configured Reviewer policy;
  `usage-v2.ts` reads owned work-attempt totals, native Run costs and execution bounds for context and dispatch guards without adding an accounting ledger;
  `reconcile-v2.ts` supplies one leased, non-paid accepted-work readback per existing AI-worker cycle, including after a parent Run terminates; it retains results/logs without dispatch or successor creation;
  `retry-v2.ts` implements the v2 domain's existing-worker `resumePaused` hook for the call-bound native `retry-wait`; it uses journaled application decisions and cannot answer creator questions or dispatch work;
  `mcp-transfers.ts` owns bounded staging. `npm run test:booklet-mcp` verifies the
  real MCP handler with disposable persistence. [MCP guidance](mcp.md#unitale-booklet-catalog-t17)
  owns its permissions, transfer protocol and trusted reviewer binding.
  Booklet lifecycle, prepaid Run admission, guards and original-media services are in `src/lib/server/booklets`; the domain adapter is `src/project/booklets/domain.ts`.
  The existing admission service selects the stored v1/v2 production and matching
  domain version; both adapters reject generic Run-start admission. V2 financial
  lifecycle calls live in `src/lib/server/booklets/lifecycle-v2.ts` and reuse existing
  commerce quote/allocation journals and shared product revision-scope checks;
  MCP and observer wiring are implemented and locally fixture-tested in 09.
  `src/lib/server/booklets/work-v2.ts` derives creative-text, review and image-action
  registration identity from validated child inputs; preflight binds exact retained preparation.
  Registration records intent without dispatching providers.
  `media.ts` reuses the original byte store for v2 observed Generate outputs, selected
  by a server-only ownership option; `mcp-tools-v2.ts` matches native files before download.
  The same gateway returns ordered original MCP image blocks separately from JSON;
  `repository-v2.ts` publishes one selected original/artifact effect per observed output.
  `observations-v2.ts` retains matching child envelopes through the existing native
  worker hook; raw creative bodies stay separate from redacted diagnostic traces.
  V2 transfer reuses `mcp-transfers.ts` with server-selected versioned ownership.
  `reconcile-v2.ts` performs non-paid accepted-parent readback through existing provider
  retrieval/tracing, without rewriting worker leases or granting dispatch authority.
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
  The [upstream design-system adoption plan](features/design-system-adoption/implementation-plan.md) and its
  [delta ledger](features/design-system-adoption/delta-ledger.md) retain Unibase issue #53's history,
  not Unitale acceptance. Unitale's import state belongs in the [implementation plan](implementation-plan.md).
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

- [Local Google popup plan](features/local-google-popup/implementation-plan.md) owns
  the bounded local auth change and verification; [README](../README.md#local-google-popup-sign-in)
  owns launch and acceptance instructions. The shared pure policy is
  `src/lib/config/google-sign-in.ts`; the existing auth form and session endpoint
  retain their ownership.

- [Unitale popup adoption](features/local-google-popup/adoption.md) owns the project
  import route, prepared local launch and acceptance; the adjacent upstream plan
  retains Unibase implementation history.

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
The [reusable data operations plan](features/deployment-data-operations/implementation-plan.md)
owns #62's proposed backup/migration contract and documentation-stage boundary;
it describes future agent approvals, manual/deployment integration, workflow outputs,
one authenticated diagnostic status capability and the existing admin Operations view, not installed
functionality.
It also specifies [deployment skills and reference adoption](features/deployment-data-operations/implementation-plan.md#deployment-skills-and-reference-adoption);
[agent tooling](agent-tooling.md#optional-deployment-skills) owns future discovery and
integration requirements. These deployment skills are proposed, not installed.
The [promotion PR starter](templates/promotion-pr.md) and
[promotion action guidance](deployment.md#promotion-review-and-action-records) keep
labeled deployment actions separate from linked source PR Test flows.
The plan's [implementation contract](features/deployment-data-operations/implementation-plan.md#implementation-contract)
owns the proposed versioned interfaces and dependency-ordered implementation checkpoints.
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

Migration declarations and the renewable lease live in
[src/lib/server/migrations.ts](../src/lib/server/migrations.ts); pure reporting is in
[migration-report.ts](../src/lib/server/migration-report.ts), read-only invariants in
[migration-verifiers.ts](../src/lib/server/migration-verifiers.ts), and exact approved
identity validation in [approved-migrations.ts](../src/lib/server/approved-migrations.ts).
[scripts/build-migrations.mjs](../scripts/build-migrations.mjs) embeds source checksums
and emits the ignored runtime manifest/runner pair during worker builds. The
[packaging test](../tests/migration-packaging.test.mjs) covers source parity and tamper
rejection. Docker-based deployment tests explicitly skip when Docker is unavailable;
a skip does not establish Linux dispatcher integration coverage.

[data-operations.ts](../src/lib/server/data-operations.ts) is the shared read-only server
model for the diagnostic capability and existing admin Operations panel. Its strict DTO
is [contracts/data-operations.ts](../src/lib/contracts/data-operations.ts).
[The workflow adapter](../scripts/deploy/data-operation-workflow.py) calls the existing
CLI; Release uses the same exact-candidate report and original-run candidate retention.
Optional deployment/data skills are selected through handbook.json's technologySkills;
shared bodies stay in Handbook, while deployment.md owns application runbooks.
