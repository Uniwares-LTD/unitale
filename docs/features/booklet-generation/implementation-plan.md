# Unitale booklet delivery plan

## Contract and decisions

Implement the accepted [R01–R14 PRD](prd.md). Preserve existing records and the
single-orchestrator dispatcher. Unibase changes originate in its repository and
reach Unitale through reviewed template integration. No production catalog seeds.
Handbook baseline: `D:\Projects\handbook` at
`6205b01d94153824f02b678957ef51af18419015`.

## Execution prerequisites

Local implementation is authorized. No issues, commits, pushes, releases, deployments,
provider publications or paid calls are authorized. Use fake providers and disposable
databases. Live acceptance requires configured Dify publications/plugins/credentials
and a finite approved budget, Stripe test configuration, Play products/notifications/
signing/internal track, Digital Asset Links and an installed Android device. Admin
creates actual offers/packages and enables only accepted languages/capabilities.

## Checkpoints

Every dependency is mandatory for integrated completion. Contract-level fixture work
may proceed before integration; do not report it as a working product. Each checkpoint
requires focused boundary tests and two consecutive clean read-only reviews of the
same state; final review covers the integrated diff. Continuation is automatic except
publication/external acceptance gates. No agent delegation is implied.

| ID | Owner | Outcome | Dependencies | State |
| --- | --- | --- | --- | --- |
| T01 | Both | Versioned catalogs, entitlements, operations, booklet/decision/manifest/workflow contracts and fixtures | None | Complete |
| T02 | Unitale | Dify parent/child, Human Input, native files and adapter compatibility harness | None | Pending |
| T03 | Unibase | Stripe/Play and Android bridge compatibility harness | None | Pending |
| T04 | Unibase | Configurable MCP limits and extensible private authorization | T01 | Pending |
| T05 | Unibase | Execution measurements, evidence, redaction and cleanup | T01 | Pending |
| T06 | Unibase | Versioned catalogs and trusted product extensions | T01 | Pending |
| T07 | Unibase | Upfront consumption, entitlements, concurrency and refunds | T06 | Pending |
| T08 | Unibase | Promotions, reservations, limits and bonus grants | T06 | Pending |
| T09 | Unibase | Stripe subscriptions, coupons and catalog publication | T03,T06,T08 | Pending |
| T10 | Unibase | Play verification, acknowledgement, renewals, restore and catalog publication | T03,T06,T08 | Pending |
| T11 | Unibase | Android TWA purchase, restore and deferred changes | T10 | Pending |
| T12 | Unibase | Commerce administration, preview/readback and refunds | T07,T08,T09,T10 | Pending |
| T13 | Both | Reviewed foundation through normal template integration | T04–T12 | Pending |
| T14 | Unitale | Owned book/production/revision repositories, subjects and indexes | T01 | Pending |
| T15 | Unitale | Lifecycle, human decisions, locks, entitlements and restart | T13,T14 | Pending |
| T16 | Unitale | Original media, derivatives, source routing and resumable attachment | T13,T14 | Pending |
| T17 | Unitale | MCP-only booklet tools | T15,T16 | Pending |
| T18 | Unitale | Source specialist workflows generalized to package inputs | T01,T02 | Pending |
| T19 | Unitale | Versioned visual reviewer and bounded repair contract | T01,T02 | Pending |
| T20 | Unitale | Manager composition, Human Input and durable continuation | T17,T18,T19 | Pending |
| T21 | Unitale | Creator brief, quotes, progress, decisions, revisions and history | T15,T16 | Pending |
| T22 | Unitale | Private reader and image downloads | T15,T16 | Pending |
| T23 | Unitale | Manifest-bound deterministic PDF | T15,T16 | Pending |
| T24 | Unitale | Revocable version-bound sharing and download controls | T22,T23 | Pending |
| T25 | Unitale | Storefront, wallet, offers, coupons and entitlements | T13,T15 | Pending |
| T26 | Both | Integrated simulated journeys and compatibility | T20,T21,T24,T25 | Pending |
| T27 | Both | Migration/recovery rehearsal, documentation and final reviews | T26 | Pending |
| T28 | Both | Authorized real provider/store/device acceptance | T27 + external prerequisites | Gated |

Independent starts: T01/T02/T03. After T01: T04/T05/T06/T14. After T01+T02:
T18/T19 alongside foundation. After T06: T07/T08. After billing prerequisites:
T09/T10, then T11. After T13: T15/T16; after both: T17/T21/T22/T23/T25.
T20 runs alongside reader/PDF/sharing/storefront. T26 is convergence.

## Verification and review scope

Use focused tests plus `npm.cmd run typecheck`, `npm.cmd run lint`, and
`npm.cmd run build` for runtime changes. Run applicable `check:docs`, `check:i18n`,
`check:skills`, `check:env` and migration tests. Verify ownership, full encoded MCP
bounds, duplicate starts/payments/revisions, immutable snapshots, stage-lock races,
unknown-outcome reconciliation, repair exhaustion, original hashes, generated workflow
parameters, varied/RTL packages, subscription/coupon races, share revocation and cleanup.
UI acceptance includes desktop/390px, keyboard, en/ar and English/LTR administration.
Preserve old sample Runs, purchases, credits and artifact history. Offline results
cannot stand in for T28. Same-agent read-only reviews must be identified as such.

## Verified progress and resume

Work branches: Unitale `task/booklet-generation`, Unibase `task/booklet-foundation`.
Accepted PRD and dependency graph persisted. T01 is implemented and reviewed; later
tasks are not complete.

T01 now has opt-in Zod contracts and fixtures for catalog terms, consumption orders,
subscriptions/promotions, measurements, booklets, productions, immutable revisions,
decisions, operations, original receipts, quality, manifests and specialist envelopes.
No runtime registration, database migration, billing service or workflow is implemented.
See [compatibility](contracts.md) for the boundary between parsing and authorization.

Validation of the working changes:

- Unibase: seven contract tests, `typecheck`, full lint, build, `check:docs`,
  `check:i18n`, `check:skills` and `handbook:ready` passed. Final contract changes
  were also checked with focused lint and typecheck. The final review corrected
  publication audit UID validation to match existing account UIDs and added a
  regression test. The application build evidence remains applicable: these opt-in
  contracts have no runtime importers, and the correction changes no bundled module.
- Unitale: nine contract tests passed with its own installed dependencies; full
  `typecheck`, lint and build passed. `check:docs`, `check:i18n` and `check:skills`
  passed. Handbook readiness reports pre-existing unset tracking, issue-language and
  integration-branch preferences; those settings were not changed.
- Early Unitale checks during dependency extraction failed on missing packages and
  native-file locks. Installation subsequently completed offline from Unibase's cache.
  The final typecheck and build ran outside the sandbox because SWC's user-owned
  native cache rejects the sandbox identity. No dependency versions or install-script
  permissions changed.
- Same-agent read-only inspection found and corrected ambiguous creative identities,
  inadequate initial-image budgets, quality contradictions, preallocated child
  workflow identity and publication audit UID compatibility. Following the final
  correction, two consecutive same-agent read-only passes found no blocking issues
  in the unchanged source/test state. This was not an independent-agent review.
- The prior approval-review timeout is resolved. User-authorized `gh repo view`
  verified both repository identities/access; local Git status, complete tracked
  diff, untracked source inventory and `diff --check` succeeded. The generated
  Unibase `.npm-cache/` directory is outside the product change and must not be staged.

Bases: Unitale `446a6c3a3412a45680e4aa6d996d7ca89986d0b0`; Unibase
`7b6086ca2c3f368fe934bbec0afafde9d4292dba`. T01 changes are maintained on the
work branches above; publication and live acceptance remain separate gates.

Dependency installation and validation processes have finished; do not reinstall or
rerun passing checks unless their inputs change. T02 and T03 are the next independent
compatibility checkpoints. T04, T05, T06 and T14 now have their T01 prerequisite met.
The full product remains unimplemented beyond these contracts; no publication has occurred.
