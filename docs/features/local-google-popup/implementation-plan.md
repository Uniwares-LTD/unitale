# Local Google popup sign-in

## Contract and boundaries

Accepted for implementation on 2026-11-21. User requested a minimal standalone
Unibase change before the Unitale import. Branch `task/local-google-popup`, existing clone
`D:/misc/code/uniwares/unibase`, base
`2878df4474ecc2b93cbb0f292515c22b1f866a5d` (fetched origin/main, 2026-11-21).
Target is Unibase main through a normal merge PR. Preserve the unrelated dirty
`feature/62-deployment-data-operations` work; include none of its changes.
Handbook: `D:/misc/code/uniwares/handbook`, revision
`c1b6166437ba729b59723a7dd4066c78e2f15185`; follow the existing clone's guidance.

Goal: local real-Firebase Google login uses the hosted Firebase popup helper and
creates the existing application session, without a localhost OAuth callback.
Emulator/staging/production behavior stays unchanged. No new dependency, environment
setting, database field/migration, auth framework or provider edit. The sole CSP delta
is the exact-host local frame source below; no other CSP relaxation,
visual redesign or deployment. This task is separate from Booklet checkpoint 10.

## Prerequisites and approvals

**Approved local-only CSP change:** permit only the exact validated hosted Firebase
origin in `frame-src` when APP_ENV is local and AUTH_MODE is firebase. Current CSP
allows self/accounts.google.com, so the popup SDK's hosted helper iframe is otherwise
blocked. This replaces the earlier no-CSP-change assumption. No wildcard, script-src,
connect-src, nonce, production or emulator relaxation is allowed. The user explicitly authorized this exact change in the implementation kickoff.

Implementation and scoped publication/import are authorized by the kickoff.
Use the pinned Node/npm versions and existing clone-local install/cache. All automated tests use disposable fixtures, never Unitale's
shared staging database. Real popup acceptance uses the user's approved staging
Firebase registration and user-performed sign-in; do not copy credential values into
Git or logs. Local real Firebase must not inherit an emulator host.
The existing local loader injects emulator defaults, so use the direct existing Next
CLI and a complete private environment for that acceptance; fixing the loader is
outside this task. Hosted Firebase auth domain must already be authorized. Report a
provider gate if it is not; do not edit shared OAuth settings automatically.
Publication/import requires applicable session authorization and passing checks;
operator acceptance comes at the end. No new issue or project metadata change implied.

## Existing-clone preparation

Use `D:/misc/code/uniwares/unibase` only; do not create a worktree. This handoff is
stored in ignored `output/local-google-popup-implementation-plan.md` to avoid adding
popup files to the active deployment-data change. At kickoff:

1. Confirm deployment-data work is paused and preserve its tracked/untracked changes
   through the owner's chosen commit or named stash. Do not reset, clean, silently
   stash active work, or combine its files into this task. A dirty/active clone blocks
   branch switching, not planning. Record the saved identity and restoration command.
2. Once clean, fetch origin and switch to `task/local-google-popup`, based on main
   `2878df4474ecc2b93cbb0f292515c22b1f866a5d`. If main advanced, merge origin/main
   normally and recheck the narrow auth/CSP scope; never rebase unrelated work.
3. Copy this handoff into `docs/features/local-google-popup/implementation-plan.md`
   on the task branch and link it from the root plan/source map. Publish only this task
   through its own normal merge PR. The prior temporary worktree is not required.

| Step                   | State                       | Smallest change and exit                                                                                                                                   |
| ---------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 existing clone      | Complete                    | Preserve deployment work, switch to the task branch and obtain the local-only CSP approval above.                                                          |
| P1 configuration       | Implemented                 | Add the public enum below; test mode/domain selection.                                                                                                     |
| P2 Google button       | Implemented                 | Reuse the current form and finish/session exchange; test success, cancellation and blocking.                                                               |
| P3 verification/review | Checks pass | Run affected checks and two clean same-state read-only passes; prepare exact revision handoff.                                                             |
| P4 Unitale consumption | Pending external dependency | After reviewed upstream integration, import exact main revision from a clean Unitale issue branch, then verify local popup and preserved booklet behavior. |

### P1 - one public configuration field

In the existing `src/lib/config/auth.ts` output, add
`googleSignInMethod: "popup" | "redirect"`. Compute on the server:

| Environment / auth mode           | Method   | authDomain                              |
| --------------------------------- | -------- | --------------------------------------- |
| APP_ENV local, AUTH_MODE firebase | popup    | `<validated-projectId>.firebaseapp.com` |
| Local emulator                    | redirect | Existing origin-derived domain          |
| Staging/production Firebase       | redirect | Existing origin-derived domain          |

Reuse existing validated project ID and server parser. Do not expose APP_ENV or
private config to the browser.
Use the same validated domain-selection logic in `src/proxy.ts` to append only
`https://<projectId>.firebaseapp.com` to `frame-src` in local real-Firebase mode.
Factor only that small pure policy if needed to keep auth configuration and CSP in
agreement; do not introduce a configurable allowlist or import server-only modules
into the Edge proxy. No other CSP directive or environment changes. Test exact-host
inclusion, malformed project-ID rejection and unchanged hosted/emulator policies.
Extend existing config tests, including localhost HTTP/HTTPS and non-default port, emulator behavior and hosted behavior.

### P2 - reuse the current session flow

In `src/components/auth-form.tsx`, retain the initialized auth instance from the
existing initialization effect. Keep controls disabled until initialization finishes.
For popup mode, the click handler calls `signInWithPopup` directly with that instance
and the existing Google provider/account-selection prompt, before any awaited sign-out
or network work that could lose user activation. Pass `result.user` to existing
`finish`; preserve email verification, fresh token, CSRF/session exchange, sign-out,
appearance and return-path handling. No new session endpoint or policy.

The popup path writes no redirect marker and does not alter the account URL. In its
initialization, do not run redirect-result recovery; preserve the existing cleanup of
stale browser auth state. Hosted/emulator redirect code and its recovery remain intact.
A closed/cancelled popup restores the form quietly. A blocked popup gets inline English
and Arabic guidance to allow popups or use a normal browser. Other errors use current
sanitized feedback. Pending state rejects a second click. Never automatically retry or
fall back to redirect. Reuse installed controls and build-ui; add no settings surface.

## Verification and completion

- Extend existing unit/config tests and the existing browser/integration approach;
  do not add a test framework or source-pattern tests. Test method/domain matrix,
  hosted redirect recovery, scoped frame-src admission, popup success reaching the existing session exchange,
  cancellation, blocking, duplicate clicks and existing verified-user/session guards.
- Run `npm.cmd test` and `npm.cmd run test:integration -- --owned-auth` with their
  disposable database/auth fixture. Run scoped ESLint, `npm.cmd run build`, then
  `npm.cmd run typecheck` sequentially, plus docs/i18n/skills checks. Stop any task dev
  server before build; preserve unrelated services. A real build failure remains open:
  do not expand this task into an unrelated instrumentation/runtime repair.
- Browser checks: real local popup reaches Google's ordinary sign-in page using
  hosted Firebase helper; popup close/block leaves a usable form. Check new feedback
  and focus in English/Arabic at desktop/390px. A user completes one real session
  acceptance at the end. Built-in browser popup/embedded-agent restrictions are a
  reported limitation, not a reason for a new workaround or weaker security settings.
- Add the normal Unibase Unreleased note and concise local-auth documentation. No
  template version bump. Perform two separate clean read-only reviews of the same
  final diff against the base; label same-agent reviews accurately.
- Publish only through the authorized task branch/PR (explicitly `origin HEAD:task/local-google-popup`, never main). After upstream integration,
  give Unitale the exact reviewed main commit and update/import instructions. Never
  manually copy shared core files into Unitale.
- Before Unitale `template:update`, preserve/commit its existing setup/docs under
  authorization and verify a clean tree. Preview the exact import and preserve its
  identity, config, booklet hooks and private environment. Run affected auth/config,
  template and booklet regressions; verify local sign-in again. No automatic TLS
  simplification: prove plain localhost HTTP works first, then update local instructions
  and origin under existing setup authority. Removing the approved CA is a separate
  explicit operator choice. Stop before implementing checkpoint 10.

## Handoff and progress

P0-P2 are implemented. On 2026-11-21, `npm test` passes 120 tests and
`npm run test:integration -- --owned-auth` passes 10 tests plus bundled worker and
readiness/liveness checks. Build, subsequent typecheck, full lint, docs/i18n/skills
checks pass. Tests use Node 24.16.0, npm 12.0.1, existing MinGit 2.56 and the cached
MongoDB 8.2.6 executable with disposable data; system Git 2.27 cannot run the
initializer fixtures' `git init -b` and is not used for those tests.

The real form's isolated browser fixture verifies direct popup user activation,
initialized auth reuse, duplicate-click blocking, fresh token and existing CSRF/session
exchange, account appearance/return path, unverified users, sanitized feedback, quiet
cancellation, stale SDK cleanup and preserved redirect recovery/initiation. Feedback,
keyboard focus and reduced motion pass at 1440px/390px in English/Arabic across the
three presets and light/dark (24 combinations). Reproduce with:

```powershell
node tests/integration/auth-form-fixture.mjs
# In another terminal; use the existing local CLI cache when available:
npx.cmd --yes --package @playwright/cli playwright-cli -s=popup-form open http://127.0.0.1:3102
npx.cmd --yes --package @playwright/cli playwright-cli -s=popup-form run-code --filename=tests/integration/auth-form-browser-checks.js
```

An isolated production app with disposable MongoDB and the approved public Firebase
registration reached Google's ordinary sign-in page from plain localhost HTTP via
the hosted Firebase helper. The exact hosted iframe origin is admitted by served
CSP; closing the real popup restores the unchanged account page quietly. No account
was signed in. Publication requires two consecutive clean same-agent read-only reviews of
the final diff. Unitale exact adoption follows integration; real-account session acceptance
remains a final manual action. No provider settings, dependencies, credentials,
deployment or Booklet checkpoint 10 implementation are included.
