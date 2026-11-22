# Implementation plan

Accepted milestones for Unitale. Accepted milestones authorize
implementation without a new issue; add them here as they are agreed.

## Current state

Created from template 0.4.0.

## Unibase 0.5.0 candidate import

Accepted for local implementation on 2026-11-21, based on Unitale
`d78ad24b1d95205592b37b92c9b2a181a72fc288`. The exact upstream candidate is
`2c13d814c02f512edd9acbd3a27a41f530b0aec5`; no `template-v0.5.0` release tag
was available at selection. The task branch is `task/update-unibase-0-5`, targeting
Unitale `main`. Preserve the separate Booklet work branch.

The local import includes the optional runtime/MCP extension seams, generated
design foundation, shared UI helpers, Sonner 2.0.8 and its exact stylesheet CSP
hashes. Unitale identity, modules, tracking and deployment bindings are retained;
project theming remains disabled. The offline page is regenerated from its source.
No Booklet model, schema, storage or persistence contract changes, so its model
guide, JSON example and Mermaid diagrams are unaffected. No new migration or
provider activation is required by this delta.

Local implementation and verification are complete. The import also corrects
test fixtures that assumed Unibase's identity: authentication defaults, MCP
identity probes, environment tags and the private-context provider now follow
the project configuration. Application authorization is unchanged.

Verification on 2026-11-21:

- Clean lockfile installation, typecheck, lint, build and `check:env` pass.
- Unit tests: 128 passed. Account tests: 351 passed, with the optional Redis
  diagnostic-limiter test skipped because no disposable Redis was configured.
  Booklet compatibility: 11 passed. Handbook tests: 14 passed.
- Docs, i18n, skills, template, samples, Handbook readiness and entrypoints pass;
  Handbook sync reports no drift. Both disposable initialized projects build
  independently with isolated namespaces.
- Production-browser checks cover all 24 public preset/theme/width/locale
  combinations, member profile/leave-guard/preference/file journeys, Run and
  credits pages, and nine administrator routes at desktop and 390px. English/LTR
  administration restores Arabic/RTL public presentation without changing its
  preference. Keyboard focus, RTL dialogs/sheets and reduced motion pass.
- A profile save renders a styled toast. Navigation preserves the document nonce;
  injected served-document scripts execute with its nonce and are blocked without
  one. The documented upstream Zod eval capability probe remains blocked; no CSP
  relaxation was added for it.

Tests use installed Git 2.43 and the repository-cached MongoDB 8.2.6 binary.
Python-backed fixtures use `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` on Windows.
PR verification also exposed inherited deployment fixtures that assumed Unibase's
slug and activation defaults. They now derive project identity and establish their
own synthetic MCP/settings scenarios. Portable deployment verification passes 63
tests; 25 host tests require the CI runner's owned Linux container. Deployment
configuration is unchanged. The client-message generator sorts normalized page
paths, with literal routes before dynamic routes, so Windows and Linux produce
the same inventory. All 24 route selections are preserved, including `/runs/new`;
a runtime regression test checks its start action messages. Verification also
passes with reversed directory enumeration. CI's disposable deployment container
passes 86 tests; two tests requiring an Infrastructure checkout are skipped there
and pass in the local portable suite against the available checkout.
Two consecutive same-state, same-agent read-only review passes accompany the
final handoff; no delegation was authorized. Local evidence is under ignored
`output/unibase-import/`.

Commit, push and PR publication for this reviewed import were authorized on
2026-11-21. Integration targets Unitale `main` through a PR; PR merge and deployment
remain separate decisions. Upstream adoption records are historical evidence,
not Unitale verification. Operator intervention: none for this local import.
No live operations, provider activation or Booklet checkpoint implementation are
included.

Handbook baseline: `D:\misc\code\uniwares\handbook` at
`c1b6166437ba729b59723a7dd4066c78e2f15185`.

## Local Google popup sign-in

The [Unitale adoption record](features/local-google-popup/adoption.md) owns the
main-first import of exact reviewed Unibase `02517797c9ecd1d8e9696cd1b68c9b976f2105db`,
local setup and acceptance. The popup runtime retains existing session handling and
emulator/staging/production redirects. Upstream implementation evidence remains in
the adjacent Unibase plan. Active issue branches receive the import by merging
Unitale `main`; their Booklet implementation is outside this import.

## Open work

Booklet generation is accepted for implementation. The [PRD](features/booklet-generation/prd.md)
owns requirements; the [delivery plan](features/booklet-generation/implementation-plan.md)
owns task dependencies, verification and the resume point. No production packages
are seeded. Publication, provider activation and paid acceptance remain separate gates.
