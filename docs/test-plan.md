# Base full feature test plan

Use this checklist for a full regression and the smoke checklist for everyday
changes. This document describes tests to perform; it does not record a new test
execution. Record results against the actual commit/diff and environment tested.

## Start here before cloning a derived project

Account-initialization guidance updated on 2026-10-25; this is not a new regression run. This is the master
acceptance checklist; linked guides supply detailed setup and troubleshooting.
Earlier recorded passes are historical evidence, not your new acceptance run.

Run this in four sessions:

1. **Local foundation:** setup, accounts, all appearance presets, admin, credit
   adjustments, simulated purchases and reports (sections 1-6).
2. **AI and pricing:** orchestrator Runs and managed files, cancellation/recovery, each
   pricing mode, ledger reconciliation and debt (section 6a).
3. **Production-like local regression:** automated checks and PWA/offline behavior
   (section 7). Stop dev before building; keep emulators running.
4. **Optional external acceptance:** your Stripe sandbox, Dify test instance,
   HTTPS staging and signed Android (sections 8-9). Record missing environments
   as Blocked or Not run; these are not claimed by local simulation.

There is **no shipped password**. A verified `admin@uniwares.co.uk` identity
initializes the first admin only while no admin/initialization marker exists.
For another test identity, explicitly appoint its exact Firebase UID. See the
[current admin contract](architecture.md#administrator-access). Regular verified members can buy simulated credits
and use AI; admin is required only for administration, adjustments and resolutions.
No real money/model calls are needed for the first three sessions.

## Scope and execution order

| Area                                                                       | Available acceptance environment                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Shell, themes, accounts, profiles, diagnostics, PWA                        | Local emulators; repeat identity/offline flows on HTTPS staging                   |
| Admin dashboard, users, reports, wallet, ledger, simulation                | Local emulators and isolated automated tests                                      |
| Dify Runs/personas/files, durable jobs, usage and all credit pricing modes | Fake provider locally; separate owned Dify test-instance acceptance               |
| Stripe payments and maintenance worker                                     | Isolated fixture tests now; own Stripe sandbox for provider acceptance            |
| VPS release, health and rollback                                           | Isolated deployment tests now; authorized staging release for external acceptance |
| Android TWA                                                                | Generated project available; signed build and installed-device acceptance pending |
| Google Play billing (C6)                                                   | Not implemented; wrapper/account-binding decision and build prerequisites pending |

Follow the current state in [foundation milestones](implementation-plan.md) and
[admin/credit milestones](admin-credits-plan.md). Passing mocks is not evidence
that live Firebase, Atlas, Stripe, VPS or Android work.

Recommended order: local setup → browser tests → automated checks → production
build/PWA → Stripe sandbox → staging → signed Android. The final three require
their own configured services. Do not use production accounts or real payments
for regression testing. AI provides a server-priced spending journey. Arbitrary spending UI, subscriptions, transfers,
impersonation and account deletion are not part of the implemented feature set.

## 1. Prepare a local test environment

1. Follow [README setup](../README.md#local-development), including pinned Node/npm
   versions. Use `npm.cmd` in Windows PowerShell. Install with `npm.cmd ci` if needed.
2. Reuse running local services. Otherwise start these in separate terminals:

   ```powershell
   npm.cmd run emulators:auth
   npm.cmd run emulators:mongo
   npm.cmd run dev
   ```

3. If overriding defaults, use `.env.local` copied from `.env.example`. Keep local
   demo Auth, local replica-set MongoDB and `APP_ORIGIN=http://localhost:3000`.
   Optionally set `APP_NAME=Base` for the displayed name.
   Set `PAYMENTS_MODE=simulation`, `DIFY_MODE=fake` and initially leave
   `DIFY_ORCHESTRATORS_JSON` empty. Check that no process-level overrides select live services. Run `npm.cmd run check:env`, then
   `npm.cmd run db:indexes` against this local configuration. Restart the app after
   env changes. Never paste credentials into test results.
   If preserving an older development database, choose a new dedicated database
   name such as `MONGODB_DATABASE=base_acceptance_20261006` in `.env.local`
   **before** index setup and account creation. The runner still listens on 27017;
   the app and workers use your selected database. Do not delete old data. Keep
   the Auth Emulator running throughout this session: restarting it loses identities
   but leaves MongoDB roles, which can prevent bootstrapping a replacement admin.

4. Always start browser journeys at `http://localhost:3000`. The Auth Emulator UI
   is `http://127.0.0.1:4000/auth`. Do not mix app origins or bookmark a Google
   emulator chooser URL: the initiating app tab must establish redirect state.
5. Use fresh test-only accounts for this run. Create a verified **Admin A**, a
   verified **Admin B**, two verified **Members A/B** and an **Unverified member**.
   Use Google for one member to cover both providers. Separate browser profiles
   help keep these sessions distinct.
6. Use the verified first-admin initializer when testing that contract, or obtain
   Admin A's exact UID and run `npm.cmd run admin:bootstrap -- FIREBASE_UID` if
   bootstrap is available. Otherwise use an existing authorized local admin. Bootstrap must refuse to replace an existing admin.
   Admin A can promote Admin B through user management.
7. Use different fresh members for adjustment and purchase arithmetic below.
   Record their starting balances. Auth identities reset when its emulator stops;
   MongoDB persists. Recreating the same email creates a new UID, not the old
   wallet/admin. Do not delete development data to reset a test.

8. Build the worker bundles once with `npm.cmd run worker:build`, then run
   `npm.cmd run worker:ai` in a fourth terminal. For scheduled credit expiry and
   payment maintenance, run `npm.cmd run worker` in a fifth terminal; wallet reads
   also settle ordinary expiry. Both workers use `.env.local` and the configured
   database; they are not disposable test runners. Restart both after env changes;
   rebuild their bundles after worker source changes. Only the AI worker processes
   queued AI jobs. Keep ordinary browser tests on `localhost:3000`.

Detailed verification/reset email instructions and Google troubleshooting are in
[local account testing](local-testing.md); admin setup is in
[admin/credits testing](admin-credits-testing.md).

## 2. Shell, appearance and recovery

Perform browser checks in Chrome and another supported browser, at desktop and
390px mobile width. Check keyboard navigation in light and dark across Classic, Glass and Soft Blue.

| ID    | Test steps                                                                                                                                                   | Expected result                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01 | Open Home/Start run/Runs from desktop/mobile navigation; open Account, Credits, Preferences and eligible Administration/Sign out from the avatar menu.       | Correct destinations, readable layout, no viewport overflow or hydration errors.                                                                                                                               |
| UI-02 | Select light, dark, then system theme; reload; change OS appearance in system mode.                                                                          | Selection persists; system mode follows OS; controls remain readable.                                                                                                                                          |
| UI-03 | Tab through menus, forms and dialogs; use Enter/Escape; open and close confirmations.                                                                        | Visible focus, meaningful labels, usable controls; modal focus returns to trigger.                                                                                                                             |
| UI-04 | Visit an unknown URL and follow the recovery link.                                                                                                           | Safe not-found page returns home. Exercise error retry through automated failure fixtures rather than adding failing production code.                                                                          |
| UI-06 | In Preferences select each style, reload, Save preferences, sign out/in and switch users. Test Application default with `APP_STYLE=glass`, then restore env. | Style and color mode stay independent; saved account choices restore correctly; older profiles inherit the default.                                                                                            |
| UI-07 | With `npm run dev`, open `/design-system`; test sample fields, confirmations and each preset at desktop/390px and 200% zoom.                                 | Usable focus, forms and readable semantic colors. Showcase is 404 in the production build.                                                                                                                     |
| UI-08 | Use the showcase Glass cover controls: valid image, missing/broken image and removal; navigate away. Repeat with reduced transparency/motion.                | Image influences Glass, gradient fallback returns when unavailable, no old cover leaks to the next page; opaque fallback stays readable. See [cover convention](design-system.md#glass-page-cover-convention). |
| UI-05 | Use long test display names and reasons; inspect errors and mobile tables.                                                                                   | Content wraps or scrolls within its region; no hidden actions or secret error details.                                                                                                                         |

## 3. Authentication, profiles and ownership

| ID      | Test steps                                                                                                             | Expected result                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUTH-01 | Explicitly register an email member; open protected pages before verification; resend verification.                    | Verification UI remains available; protected data denied; no automatic credit gift.                                                                                                                                      |
| AUTH-02 | Open the latest emulator verification link; return and select “I've verified my email”.                                | Verified session established; own profile accessible. See linked account guide for obtaining email action links.                                                                                                         |
| AUTH-03 | Sign in with wrong password and an unknown email.                                                                      | Safe failure; login never creates an account.                                                                                                                                                                            |
| AUTH-04 | Start Continue with Google from `/account`; select an emulator account. Log out and repeat with that existing account. | Both attempts reach the signed-in account; no loop back to login.                                                                                                                                                        |
| AUTH-05 | Request password reset; complete the latest emulator reset action using the account guide; try old/new password.       | Old password fails and new password succeeds. Live hosted reset/email delivery is a separate staging check.                                                                                                              |
| AUTH-06 | Save display name in Account and appearance in Preferences independently; reload and sign out/in.                      | Each page saves its own fields without overwriting the other page's changes. Own profile/preferences persist; another member sees their own data.                                                                        |
| AUTH-07 | Open Account/Credits in two tabs; sign out or switch users in one; revisit/reload/back in the other.                   | Old protected data cannot reappear or overwrite the new account.                                                                                                                                                         |
| AUTH-08 | Visit `/api/profile` and `/api/credits` as anonymous, unverified and verified users.                                   | Anonymous denied with 401; unverified with 403; verified responses contain only owned data.                                                                                                                              |
| AUTH-09 | Inspect cookie/storage names and flags in browser devtools without exporting values.                                   | App session is HttpOnly/SameSite=Lax; HTTPS uses Secure. No app session token in local storage. Temporary Firebase tab state is cleared after exchange. Local HTTP is not expected to have a Secure cookie.              |
| AUTH-10 | Run HTTP/security suites below.                                                                                        | Revoked/expired sessions, CSRF/origin failures, submitted ownership fields, stale requests and unauthorized mutations are rejected. Do not wait five days or manually paste session tokens to exercise these boundaries. |

## 4. Admin dashboard and user management

| ID     | Test steps                                                                                                                                  | Expected result                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADM-01 | Open `/admin` as anonymous and as a verified member; request `/api/admin/users` and `/api/admin/reports`.                                   | Anonymous page redirects to Account; member page shows not-found. APIs return 401/403 respectively.                                                                            |
| ADM-02 | Open `/admin` as Admin A; compare labels with known test activity.                                                                          | Counts represent application profiles, active admins, suspended accounts and the labelled last-24-hour runtime errors/audit changes. Profiles are not all Firebase identities. |
| ADM-03 | List users; search exact email and UID; search unknown identity and clear search.                                                           | Correct account, explicit empty result, then normal list. Next-page navigation works with more than 25 identities. Mark pagination Not run if there are too few fixtures.      |
| ADM-04 | Edit a member's application display name with reason; review then cancel; repeat and confirm.                                               | Cancel changes nothing. Confirm persists and creates audit evidence. Firebase email/password/provider identity is not rewritten.                                               |
| ADM-05 | Promote Admin B; demote it from Admin A; retry from B's old tab.                                                                            | Role takes effect on server immediately; old B session loses admin access. Restore B from A if needed.                                                                         |
| ADM-06 | Try self-demotion/self-suspension; run last-admin concurrency tests.                                                                        | Protected operations are rejected; at least one active admin remains.                                                                                                          |
| ADM-07 | Suspend a member with an existing session; try protected access/new sign-in; reactivate.                                                    | Suspension denies access. Reactivation requires a new sign-in; old cookies cannot revive.                                                                                      |
| ADM-08 | Submit omitted, blank or short reason; reject overlong reason; cancel confirmation; try mutation after 30 minutes without signing in again. | Valid changes accept optional reasons and remain audited; invalid/cancelled operations have no effect; an older valid session still works, while expired/revoked sessions are denied. |

## 5. Credits, ledger and simulated purchases

Use a fresh adjustment wallet starting at zero. Admin reasons are visible to the
owner: use non-secret explanations. Reopen the member's Credits after each step.

| ID     | Test steps                                                                                          | Expected result                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CR-01  | Open `/credits` as a newly verified member.                                                         | Available/reserved/debt/net balance start at zero; ledger empty.                                                                     |
| CR-02  | Review a 25-credit promotional grant, cancel, then repeat and confirm with default expiry.          | Cancel leaves zero; confirm gives 25 available, one ledger grant and approximately 90-day expiry.                                    |
| CR-03  | Deduct 10, then attempt to deduct 16.                                                               | Balance becomes 15; excessive deduction fails with no ledger/audit success or balance change.                                        |
| CR-04  | Grant 5 with No expiry; grant 7 with a Specific future UTC date several minutes ahead.              | Available becomes 27. The 5-credit lot has no expiry; the 7-credit lot has the selected UTC expiry.                                  |
| CR-05  | After that expiry, reload/read the wallet (or run local maintenance).                               | Remaining 7 expires once; available becomes 20. History records expiry; repeated reads do not repeat it.                             |
| CR-06  | Try zero, negative, fractional quantity and past expiry; inspect server tests for overflow.         | Rejected without changes; quantities are whole positive safe integers.                                                               |
| CR-07  | Sign in as another member; request own wallet with an extra UID query; switch back.                 | No other member's balance/history is exposed; ownership comes from session.                                                          |
| CR-08  | Inspect available, held, debt and net labels, expiry list, ledger Older/Latest navigation.          | Values agree with events and survive reload. History pages do not repeat/skip records; use automated tests if fewer than 26 entries. |
| SIM-01 | In a separate zero-balance member, create a 100-credit purchase and Keep pending.                   | Clearly labelled simulation; no money charged and no credits yet.                                                                    |
| SIM-02 | Choose Success; replay success and reload.                                                          | Exactly 100 non-expiring credits once, with one purchase grant.                                                                      |
| SIM-03 | Refund all; replay refund and old success.                                                          | Balance returns to zero once; refunded purchase cannot grant again.                                                                  |
| SIM-04 | Create separate Failure and Cancel purchases; try to change closed outcomes.                        | No grants; closed outcomes cannot become successful.                                                                                 |
| SIM-05 | Successfully buy 500 and 1000; refund each order.                                                   | Starting from zero: 1500, then 1000 after refunding 500, then zero after refunding 1000.                                             |
| SIM-06 | Set local `PAYMENTS_MODE=disabled`, restart app, inspect Credits; restore original env and restart. | Simulation disappears; ledger remains. Non-local simulation rejection is covered automatically.                                      |

Use `/runs/new` for priced spending and the debt test in section 6a. Run
`npm.cmd run test:accounts` for deterministic accounting boundaries:

- Concurrent reservations cannot overspend; commit/release retries and cross-user
  access are safe. Earliest expiry is allocated first, then oldest perpetual lots.
- Ordinary holds time out after 15 minutes; managed AI holds do not. A valid reserved lot can commit after expiry;
  releasing an expired lot cannot resurrect expired credits.
- Idempotency keys retain original results; changed payload under the same key is
  rejected. Purchase replay, financial reversal and audit writes are atomic.
- Refunds recover available credits/cancel affected holds; spent shortfall creates
  debt. Debt blocks reservations; subsequent grants repay debt first.
- Wallet balances, reserved amounts, lots and ordered ledger reconcile. Failed
  transactions leave no partial ledger/audit/projection changes.
- Promotional default/custom/perpetual expiry, integer limits and retention are
  checked without waiting months. Ledger/audit/idempotency records remain durable.

## 6. Reports and safe diagnostics

| ID     | Test steps                                                                                       | Expected result                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REP-01 | As admin, grant credits successfully then attempt an excessive deduction; open `/admin/reports`. | Runtime reports include success and warning. Audit contains only the successful adjustment, actor/target, reason and before/after values.                                           |
| REP-02 | Filter runtime event/severity/request ID/UTC dates; audit actor/target/event. Clear filters.     | Correct matching rows; date bounds include selected UTC days; clearing restores list.                                                                                               |
| REP-03 | Open `/admin/reports?from=invalid`; try reversed dates; recover.                                 | Safe validation feedback, no internal details; clear filters recovers.                                                                                                              |
| REP-04 | Use Older/Latest with more than 25 matches; test narrow layout and keyboard controls.            | Stable pagination and usable tables. Equal-timestamp and low-volume cases have automatic coverage.                                                                                  |
| REP-05 | Inspect runtime records and diagnostic export using synthetic test data.                         | Fixed events/status/duration/request ID; no tokens, cookies, raw bodies, query strings or error-message contents. Runtime excludes admin reasons; audit intentionally retains them. |
| DIA-01 | On Account, inspect diagnostics before enabling; enable, navigate within app, then fully reload. | Default off/export disabled; SPA navigation preserves enabled state; full reload clears memory and disables it.                                                                     |
| DIA-02 | With diagnostics on, dispatch the synthetic error below; export JSON; turn off and repeat.       | Enabled event is recorded without the supplied secret text; turning off clears records and stops collection. Export is bounded to 100 memory-only events, with no upload.           |

Synthetic browser-console input (test text only):

```javascript
window.dispatchEvent(
  new ErrorEvent("error", { message: "synthetic-secret@example.test" }),
);
```

Automated tests verify 30-day runtime retention, query exclusion during TTL delay
and bounded best-effort logging failures. Do not wait 30 days or delete financial
records to test retention. Runtime reporting may fall back to sanitized stdout;
required accounting/audit failures must still roll back the transaction.

## 6a. Orchestrator Runs

Use the matrix in [AI testing](ai-testing.md) for pricing, generated decisions, recovery and durable worker acceptance. Configure fake Dify for local tests; use disposable Dify apps for live acceptance.

## 7. Automated regression and production-like PWA

Run commands sequentially and record each outcome. Stop only your dev server
before building/starting the production app so both do not share `.next`. Keep
Auth/Mongo running. Install Docker for deployment-tooling checks.

```powershell
npm.cmd test
npm.cmd run test:accounts
npm.cmd run validate
npm.cmd run build
npm.cmd run test:integration
npm.cmd run test:payments
npm.cmd run test:ai
npm.cmd run test:ai-pricing
npm.cmd run test:health
npm.cmd start
```

| Check                                | Evidence it supplies                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test`                               | Configuration, session policy, safe API client, payment settings, runtime logging                                                                              |
| `test:accounts`                      | Disposable replica-set tests for access, audit, wallet, lots, holds, purchases, debt, reports and worker                                                       |
| `validate`                           | Advisory env/skills/types/lint/format/unit/account/deployment/audit/workflow/shell report; inspect `output/validation/results.json` even if command exits zero |
| `build`                              | Real compilation/bundling and worker build; failures must remain failures                                                                                      |
| `test:integration`                   | Production HTTP account/security behavior with demo Auth and disposable MongoDB                                                                                |
| `test:payments`                      | Signed webhook/checkout HTTP fixtures and bundled worker; fake provider, no Stripe calls                                                                       |
| `test:ai`                            | Workflow/chat/upload, owner/admin boundaries and fixed-price HTTP journeys with fake Dify                                                                      |
| `test:ai-pricing`                    | Current pricing consent, maximum reservations, actual charges and unused-credit release via HTTP                                                               |
| `test:health`                        | Isolated readiness/configuration/database failure and recovery checks                                                                                          |
| `test:deployment` (also in validate) | Docker-isolated release/rollback safeguards with mocked external services; no VPS deployment                                                                   |

Account, payment and both AI HTTP suites all use port 3101; never run them concurrently.
Health tests use 3103. If occupied, stop only a process you own and understand.
The `worker -- --once` command uses the configured database, so it is not a
replacement for isolated tests. Do not point it at production for local testing.
Use `npm start`, not the raw standalone server, to prepare static/public assets.

Quality failures are warnings under the agreed deployment policy, not automatic
deployment gates. Record them for triage; a green advisory wrapper does not make
a broken feature pass. Compilation, startup, readiness and release failures stop
the affected operation.

On the production-like localhost server, follow [M3 testing](m3-testing.md):

| ID     | Test steps                                                         | Expected result                                                                                                 |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| PWA-01 | Inspect manifest/icons; install if supported by browser.           | Correct app identity/start URL; install experience usable. Unsupported install UI is not a failed Android test. |
| PWA-02 | Load online first; inspect service-worker Cache Storage.           | Only public offline fallback cached; no account/API/admin/credit responses.                                     |
| PWA-03 | Go offline and perform full navigation/reload of a protected page. | Public offline message; no protected account data displayed from cache. No mutations queued for later.          |
| PWA-04 | Test an in-app navigation offline; restore network and retry.      | Safe route recovery, no HTML masquerading as API/RSC data; app recovers online.                                 |
| PWA-05 | Exercise update/reload flow with an unsaved form.                  | No forced reload discards edits; web update available on appropriate reload/navigation.                         |

## 8. Stripe sandbox acceptance (separate configuration)

Use [payment setup and acceptance](payments.md) with your own test-mode Price,
secret and webhook secret in env files, a transaction-capable test database and
the maintenance worker running. Fixture tests do not replace this acceptance.
Use Stripe's documented sandbox methods; never real cards or live-mode secrets.

| ID     | Test steps                                                                                                             | Expected result                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-01 | Select a configured pack and complete sandbox Checkout.                                                                | Correct amount/currency; wallet grants saved pack quantity once after worker reconciliation. Returning to app alone never grants.                           |
| PAY-02 | Cancel Checkout; test delayed success/failure if enabled payment methods support it.                                   | Cancel/pending/failure grant nothing; eventual verified success grants once.                                                                                |
| PAY-03 | Resend the same provider event; replay/reorder notifications.                                                          | Durable deduplication; no extra ledger entries or balance changes.                                                                                          |
| PAY-04 | Refund partially, then cumulatively, then fully in the Stripe sandbox console.                                         | Reversal is floor(original credits × cumulative successful refund / original paid amount); full refund reverses all. Pending/failed refunds do not reverse. |
| PAY-05 | Pause only your sandbox worker; complete a payment; restart worker.                                                    | Notification survives; reconciliation eventually grants once. Inspect wallet/ledger and provider console, not a nonexistent app order-status page.          |
| PAY-06 | Exercise disputes where sandbox tooling permits; otherwise mark external check Not run and inspect automated coverage. | Open/lost dispute reverses; won/closed warning restores only credits not already refunded. Debt/recovery scenarios covered by accounting tests.             |
| PAY-07 | Open `/credits?client=play` in a separate test tab, then `/credits`.                                                   | No Stripe purchase buttons in detected Play context; Play billing unavailable until C6. Close that test tab before ordinary web payment tests.              |
| PAY-08 | Run malformed/invalid-signature/wrong-environment/amount/catalog fixture cases.                                        | Safe rejection; no credits from untrusted return URLs or invalid provider evidence. Private provider mappings/secrets never in browser props.               |

## 9. External staging, deployment and Android

For Dify, use an owned test instance and explicit spending limits. Test a model-free
workflow first, then bounded paid calls only when you intend to spend. Bind the
capabilities described in [AI live setup](runs.md#administration-and-setup).

| ID      | Steps                                                                                    | Expected result                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| DIFY-01 | Start/retrieve one deterministic workflow with configured publication and output schema. | Actual transport and saved identities work; output validated, no duplicate generation.                                           |
| DIFY-02 | Exercise chat follow-up and document/image transfer on your supported Dify version.      | Real context/attachments reach the app; output quality evaluated separately from transport.                                      |
| DIFY-03 | Compare completed run/message summary to saved usage for each intended pricing policy.   | Exact tokens/cost/currency available and charges match; missing evidence requires review. Do not sum overlapping node/run costs. |
| DIFY-04 | Restart the AI worker during a controlled task; test failure and cancellation.           | Reconciliation preserves identity and settlement; uncertain outcomes are not resent.                                             |

These are separate acceptance tasks after environment inputs and authorization
exist. Use [deployment procedures](deployment.md) and [Android guide](android.md),
not ad-hoc production commands. Record missing prerequisites as Blocked.

| ID      | Test steps                                                                                                                        | Expected result                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIVE-01 | On isolated HTTPS staging, repeat email registration/verification/reset and Google sign-in in two browsers.                       | Real email delivery, authorized domains, the Google popup on `<projectId>.firebaseapp.com` and secure session work; own Atlas profile persists.                                                                                                    |
| LIVE-02 | Run documented staging release; inspect readiness, public HTTPS, running commit/image and worker.                                 | Matching app/worker/config, usable public app; staging resources isolated from production.                                                                                                                            |
| LIVE-03 | Restart staging services; repeat profile, grant and purchase replay checks.                                                       | Data persists; no duplicate ledger grants; worker recovers pending work.                                                                                                                                              |
| LIVE-04 | On an authorized disposable staging target, exercise failed-candidate rollback using the documented procedure.                    | Prior matching image/config restored; health recovers; wallet/audit data is never rolled back. Local script tests alone do not certify this.                                                                          |
| LIVE-05 | Inspect image, secret handling, registry access and SSH verification.                                                             | No env/service-account files or admin tools in runtime image; private image and pinned host verification; no secrets in logs.                                                                                         |
| AND-01  | Configure owned hostname/package/signing inputs and generate/build as described in Android guide.                                 | Actual signed artifact compiles; generation alone is not a successful APK/AAB build. Do not replace identities with another application's values.                                                                     |
| AND-02  | Verify public `/.well-known/assetlinks.json` against deployed host and installed signing identity.                                | Correct package and fingerprint; no auth redirect. Unconfigured local empty associations are expected.                                                                                                                |
| AND-03  | Install signed test build; exercise auth, profile, credits, preferences, back navigation, network loss and logout.                | Verified TWA without browser URL bar; same owned data and safe offline/logout behavior.                                                                                                                               |
| AND-04  | Publish an authorized web-only staging change and reload installed app.                                                           | Shared web change appears without wrapper reinstall; no forced loss of unsaved edits.                                                                                                                                 |
| PLAY-01 | Future C6: test account-bound purchase, pending/cancel, replay, refund/revocation and consumption on signed internal-track build. | **Blocked/unimplemented now.** Requires accepted wrapper/account-binding solution, compatible resolved billing dependencies and completed server verification. Do not mark this Pass from Stripe or local simulation. |

## 10. Record results and repeat smoke checks

For each run capture environment, commit/diff, date, browsers/device, local env
mode (no secrets), test IDs and results. Use **Pass / Fail / Blocked / Not run**.
Attach safe screenshots and request IDs; avoid raw HAR/cookies/credential exports.
For failure, record steps, expected/actual result and safe error code. An automated
boundary test does not prove the corresponding live provider journey passed.

| Test ID / command | Result  | Expected / actual or evidence      | Follow-up  |
| ----------------- | ------- | ---------------------------------- | ---------- |
| Example: AUTH-04  | Not run | Browser + account alias; no tokens | Owner/date |

Before handing off a change, repeat this short smoke sequence:

1. Home/mobile navigation and persisted theme.
2. Verified email and Google sign-in; profile save/reload; cross-tab logout.
3. Member denied admin; admin can search and safely confirm/cancel an adjustment.
4. Member wallet/ledger matches grant; simulation success/replay/refund remains once.
5. Reports show expected runtime/audit evidence without sensitive runtime text.
6. AI text/chat/file completes, correct charge persists, unused reservation releases.
7. Production build starts; offline fallback exposes no protected data.
8. Run affected automated suites and inspect advisory warnings separately.

Restore any local env changes. Close test Play-context tabs and reset only the
test browser's offline/network overrides or stale service worker if needed.
Stop only services you started and intend to stop; preserve existing developer
accounts/data. Keep Stripe sandbox cleanup separate from application ledger:
refund through the provider and let the worker reconcile rather than editing
balances or deleting ledger records directly.

## 11. Decision before starting a derived project

The general foundation now includes accounts, profiles, appearance presets, admin,
reports, credits/ledger, simulated and opt-in Stripe payments, optional Dify
workflow/chat/files, durable jobs, usage and configurable pricing, plus PWA and
VPS/Android tooling. It also includes reusable generated UI, versioned artifacts,
approvals, private media and durable workflows. PDF/ZIP export services were
removed; product-specific exports remain downstream work. Domain schemas,
provider prompts and product-specific layouts remain downstream features.
See [derived-project setup and identity inventory](../README.md#start-a-derived-project).

- [ ] Complete local sections 1-7 and record real Pass/Fail/Not run results below.
- [ ] Review unresolved failures and advisory warnings; keep build failures real.
- [ ] Preserve separate live Firebase/Atlas, Stripe, Dify, VPS and Android status.
      A locally accepted Base can be created before deployment, but cannot claim
      those integrations have passed live acceptance.
- [ ] Keep optional services disabled by default (`DIFY_MODE=disabled`; payments
      disabled outside local emulator mode). Preserve fake fixtures and their docs.
- [ ] In a clean checkout, verify install, configuration, indexes, admin appointment,
      worker startup, test commands and build without relying on ignored local files.
- [ ] Before publication, review tracked files for identities/credentials and replace
      inherited product branding, package/repository identity, generated Android
      samples and deployment paths deliberately. `APP_NAME` alone is not full
      template renaming. Keep required licenses and skill provenance.
- [ ] Retain architecture/setup/testing docs and record optional product migration
      plans as downstream-product reference rather than Base's implementation backlog.

This checklist does not authorize publication, provider changes or deployment.
Do not copy emulator data, `.env.local`, provider credentials, `.cache`, `output`,
local browser state, signing keys or deployment secret snapshots into it.

Copy this run sheet into an ignored local file such as `output/manual-acceptance.md`
and fill it as you test. Do not overwrite the historical milestone evidence.

```markdown
Date:
Commit + uncommitted diff reference:
Node/npm:
Browsers / OS / device widths:
Environment: local emulator + fake Dify + simulated payments
Database alias (no URI or password):
Worker bundles built from same source: yes/no

| Area / IDs                                  | Pass / Fail / Blocked / Not run | Safe evidence / issue      |
| ------------------------------------------- | ------------------------------- | -------------------------- |
| UI-01-08                                    | Not run                         |                            |
| AUTH-01-10                                  | Not run                         |                            |
| ADM-01-08                                   | Not run                         |                            |
| CR-01-08, SIM-01-06                         | Not run                         |                            |
| REP-01-05, DIA-01-02                        | Not run                         |                            |
| AI-01-10                                    | Not run                         |                            |
| PRICE-01-12                                 | Not run                         |                            |
| Automated commands (record each separately) | Not run                         |                            |
| PWA-01-05                                   | Not run                         |                            |
| PAY-01-08 (provider sandbox)                | Not run                         |                            |
| DIFY-01-04 (owned provider)                 | Not run                         |                            |
| LIVE-01-05                                  | Not run                         |                            |
| AND-01-04, PLAY-01                          | Not run                         | Play billing unimplemented |

Unresolved failures / warnings:
Derived-project readiness decision and explicit unverified integrations:
```

## Operations regression

- On `/runs/new`, detail/history and admin pages, sign out or switch accounts in another
  tab. Verify private content clears and browser Back cannot restore the old data.
  The API unit regression also checks a late response after session invalidation.
- With more than 25 executions, browse history and unresolved admin pages; verify
  stable pagination even with equal timestamps and isolation between owners.
- On `/admin/operations`, preview a small batch of old local fixture content.
  Preview must not change content; execution needs confirmation and
  recent admin access. Verify the report, retained ledger/usage/retry evidence and
  exclusions for active/unknown work. Automated tests cover expiry, demotion,
  changed-target skipping, replay and failed-upload cleanup.
- Exercise manual payment review with isolated Stripe fixtures, including provider
  uncertainty and repeated request keys. No direct grant or refund is offered.
- Stop a test worker; verify missing/stale progress and increasing queue age.
  `test:accounts` checks heartbeat boundaries; `test:deployment` checks restoration
  when a candidate worker probe fails. Live provider/VPS acceptance stays separate.
- Verify the cleanup dialog's keyboard focus/Escape and operations layout at
  desktop/mobile widths. Run the full acceptance sequence for broader accessibility.

## MCP regression

- MCP-01: disabled endpoint returns 404; malformed enabled configuration fails
  validation without reflecting credential values.
- MCP-02: authenticate discovery and calls; deny missing/revoked credentials,
  unapproved Host/Origin, cookie-only access and unauthorized direct invocation.
- MCP-03: official client initializes, discovers and calls both examples over
  HTTP; simultaneous clients cannot inherit each other's permissions.
- MCP-04: malformed/oversized requests, invalid inputs/results and slow tools fail
  safely; cancellation reaches handlers; logs omit tokens and document content.
- MCP-05: Dify fetches the reference before generation, returns its revision/request
  ID, and Unibase persists the successful answer with normal credit settlement.
- MCP-06: update the document/revision and re-run; refresh the catalog after tool
  additions; retain old names until workflows migrate.

Automated MCP checks: `npm run test:mcp` (also included in `test:accounts`). Live
MCP-05/06 acceptance remains environment-specific; follow [the runbook](mcp.md).

## Personas and persistent product integration

Automated boundaries are covered by `tests/accounts/persona-artifacts.test.ts`
with disposable MongoDB, fake Dify and a loopback S3-compatible HTTP fixture.
Verify persona snapshots and availability, automatic continuation with no browser,
invalid/file/oversized-question fallback, takeover and cancellation races, combined
billing after parent failure, and unknown outcome reconciliation without redispatch.
Check wrong client/operation/owner/expired capability rejection, duplicate/conflicting
saves, and exact revision/human-source approval checks. Product application retries
must not generate or charge again. Retained images must survive Run cleanup, remain
owned, and delete their exact S3 object after all references are released.

For browser acceptance use the isolated fixture with
`node --conditions=react-server --import tsx scripts/integration.mjs --ai --browser --personas`.
It seeds shared fake completions and an owned admin session under `output/playwright/runs-state.json`;
no production database/provider is used. Exercise persona administration, Start
selection/maxima, automatic answering, takeover, artifact create/revisions/delete,
associated Runs, desktop/mobile layout, keyboard focus and hydration. Stop the
fixture with Enter after verification. The Auth Emulator defaults to loopback port
9099; use `--auth-port=9199` when running a separate owned emulator on that port.
For actual provider acceptance, separately authorize the direct completion
connection and use a newly owned raw-response Dify workflow with reachable MCP.
Fixture success is not live model/plugin or production S3 evidence.

Persona completion acceptance: shared model/instructions save and Reset to default,
revision conflicts, stale administrator/member rejection, fixed/token/hybrid pricing
without provider-cost options, raw text preservation, bounded HTTP responses,
redirect rejection, unknown dispatch without replay, and saved-result recovery must
pass against fake/local providers. Confirm four Orchestrator templates with no
Persona workflow management. Check 390px English/Arabic layouts and navigation.

Persona administration follow-up: verify the responsive card list, Add/Edit dialogs,
Escape/focus restoration, cancellation without a new card, and saves with blank reasons.
`tests/optional-reasons.test.ts` covers omitted, blank, short and overlong reasons
across admin contracts and retains cleanup/AI release confirmation checks. Account
tests also exercise empty-note cleanup and AI resolution, and omitted-note credit
adjustment with the existing atomic audits.

## Reuse and service-hardening acceptance

Use a reviewed commit and the current manifest. Historical passes in the milestone
plan do not substitute for these checks on the new project.

- Run `npm run test:initializer` for immutable source, private-file exclusions and
  unsafe target rejection. `npm run test:initialized-projects` creates a private
  synthetic source commit and independently installs/builds two application-mode
  projects; it does not commit or change refs in the working repository.
  Add `-- --http` to verify account journeys in each generated project with its
  own project-specific, ephemeral Auth Emulator. Add `--offline` after `--` when
  the pinned dependency cache is already populated. The shared developer Auth
  Emulator is not reused by this option. Fixtures under
  `.cache/initialized-projects/` are deleted after a passing run and kept after
  a failure; add `--keep` to retain a passing run. Each run first removes
  fixtures left by earlier runs.
- Run `npm run test:limits` for two-process Redis limits, expiry, spoofed headers,
  failure and namespace isolation. Run `npm run test:deployment` for ingress,
  readiness, environment isolation and retained-release rollback tooling.
- Run `npm run test:ai-pricing` independently of `npm run test:ai`. Verify wallet
  settlement and permanent retry evidence, including failed and missing usage.
- Exercise more than 100 artifacts/revisions and long histories, equal timestamps,
  separately paged pending decisions and searchable Start Run targets.
- Verify anonymous multipart requests are rejected before body reads; exercise
  size/overhead/deadline/disconnect bounds and competing uploads.
- Files: owned listing/download/deletion, quota races, retry deduplication,
  abandoned stages, referenced-file rejection, terminal cleanup and provider reuse.
- Notifications: source rollback, duplicated events, consumer restart, preferences,
  unread/read-all, expiry, owned links and cross-tab logout.
- English/Arabic: browser/account/header precedence, saved timezone, independent
  appearance changes, unchanged URLs, translated errors/notifications, desktop and
  390px RTL, keyboard focus, hydration, document CSP and offline recovery.
- Run `npm run check:docs`, `npm run check:i18n`, `npm run check:skills` and
  `npm run check:env`. Run a production web/worker build after affected changes.

Live providers, VPS activation and Android/device acceptance require their own
owned environments and explicit session authorization.
