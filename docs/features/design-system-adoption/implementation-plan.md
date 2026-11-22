# Design-system adoption implementation plan

[Issue #53](https://github.com/Uniwares-LTD/unibase/issues/53) delivered the Unibase
design handoff. The [delta ledger](delta-ledger.md) maps all 143 package rows to
checkpoints. Derived-product UI work is separate.

**Closeout.** P0 through R3 are complete. The adoption reached staging through
[PR #61](https://github.com/Uniwares-LTD/unibase/pull/61) at `b54562d`.
[Release](https://github.com/Uniwares-LTD/unibase/actions/runs/44891787149) and
[Check deployment](https://github.com/Uniwares-LTD/unibase/actions/runs/44892105878)
passed, and the issue owner reported completing member and admin smoke tests.
Local checkpoint evidence and known limitations are under
[Verified progress](#verified-progress-and-resume).

Template 0.5.0 is prepared and its upgrade rehearsal passed. Publication of
`template-v0.5.0` remains a separate release decision. Pending staging database
migrations are deferred until the operator flow in
[#62](https://github.com/Uniwares-LTD/unibase/issues/62) is complete. See the
[deployment guide](../../deployment.md#database-migrations-on-existing-staging).

The sections below preserve the approved plan and checkpoint evidence. The
[simplified remaining work](#simplified-remaining-work) section governed R1 to
R3 when it differed from the detailed checkpoint reference.

## Contract and decisions

- **Source of truth.** The design package in `Uniwares-LTD/unitale-design`, pinned here at
  `493e13b83635280f74ce97784c25a64d6259ea36` (call it P):
  - [adoption baseline](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/baseline.md): delta rows, D-01 to D-13, checkpoints U0 to U5, the acceptance record;
  - [implementation specifications](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/implementation-specs.md): the foundation migration and §1 to §11;
  - [known gaps](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/known-gaps.md): UG-001 to UG-019;
  - [open decisions](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/decisions.md#open);
  - [Extending Unibase](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/extending.md): the derived-project theme convention;
  - proposals: [design-system documentation](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/proposals/unibase-design-system.md) (DOC-01), [agent guidance](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/proposals/unibase-agent-guidance.md) (AGT-01), [`build-ui` skill](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/proposals/unibase-ui-skill/SKILL.md) (SKL-01);
  - [verification record](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/checklist.md#foundation-verification-record).
- **Accepted revision.** Implementation uses the revision a human records in the package's
  acceptance record. If it differs from P, regenerate the ledger and review the difference before U1.
- **Unibase base.** `main` at `37aac48` (the handoff targets `a7eda79`; `37aac48` adds only the
  merge-commit guidance). Handbook baseline `c1b6166`. Template `0.4.0`.
- **Package decisions carried in.**
  - D-01: vivid preset colours, the status-colour revision, 12 type roles and field density.
  - D-02 and D-08: Sonner as the toast, with a hash-based CSP change.
  - D-03: contrast adjustments of at most two ramp steps.
  - D-04: documentation and guidance are ready-to-apply drafts, applied by this plan.
  - D-05: type roles as additive theme keys.
  - D-06: one additive `lg` field size; the default is unchanged.
  - D-09: Button keeps its `cva` API.
  - D-10: leave-guard scope.
  - D-11: Field from the shadcn registry `field` item.
  - D-12: Lucide stays a separate change; P-28 makes it its own U6 commit.
  - D-13: DTCG tokens are the source.
- **D-07 still holds.** No project's brand is adopted into Unibase (DEF-01). This plan adds U6, which gives any derived project a generic **seam** for its own theme and fonts; the seam names no project.
- **Decided in this plan.**
  1. Copy the two generated stylesheets into `src/styles/design-system/`, unedited, with the revision recorded in each.
  2. Delete `classic.css` and `soft-blue.css` at U4.
  3. One PR per checkpoint, except U3 (one per slice) and U6 (seam and guide, then release), merged with merge commits and revertible on their own (P-03).
  4. **Deviation:** AGT-01 and SKL-01 move from U1 to U5. Their text describes `Field`, `SubmitButton`, the toast and the leave guard, which only exist after U2, U2-S and U4. Recorded in the U5 deviation table.
  5. **Type roles must be overridable by a derived project.** As generated today, `tailwind-theme.css` writes literal values into an `@theme inline` block, so a project theme can't change them. The package's own generated project themes already express role values as `-size`, `-leading`, `-weight` and `-tracking` variables, so that is the convention to support. Decision (a package change made before work starts and included in the revision accepted at the start gate:
     - The package generator emits each role key as a variable with the current value as fallback, for example `--text-hero: var(--text-hero-size, 2.5rem)` and `--text-hero--font-weight: var(--text-hero-weight, 600)`.
     - Unibase renders identically without a project theme; a project overrides the `-size`, `-leading`, `-weight` and `-tracking` variables in its theme.
     - U4 vendors that revision.
     - **Letter-spacing unit** (open package decision), decided here: `em`, which matches the CSS renderer and scales with each role's size. The generator emits `0rem` today while the spec and ledger say `0em`; the same package change switches it. Every value is 0, so nothing renders differently.
  6. **Test method.** Unibase's `npm test` runs `node:test` with no DOM, and this plan adds no test dependency. Pure logic is extracted and tested with `node:test` and fake timers: the toast timer and replacement, the leave-guard outcome table, Field ID derivation and the Notice action states. DOM behaviour (focus, `aria-describedby`, hover pause, focus return) is asserted in the scripted Playwright browser checks and recorded as evidence. Adding jsdom or Testing Library would be a separate dependency decision.
  7. `lg` field size (FLD-02) and the leave guard (LVG-01) are applied to existing screens only where allowed: `lg` needs explicit `visible` approval per screen, and LVG-01 applies only where a feature has real saving or offers Discard alone (spec §6).
- **Not in this issue.** These belong to derived projects or to the features that consume the helpers, and are handled outside Unibase:
  - DEF-01 (a project's own theme), and the remaining application font-consumer mapping from UG-001: each derived project.
  - DEF-05 (service-dependent recovery), DEF-06 (owned history), UG-004 (per-feature submission and limits) and UG-008 (revisions, locks, stale approvals): the consuming feature.
  - UG-009 (commercial policy), UG-010 (prototype scope) and UG-013 (original brief provenance): product owners.

**Known-gap mapping.** Every package gap, UG-001 to UG-019, has a place:

| Gap                                      | Where it's handled                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| UG-001 font hooks                        | TOK-01 at U4; the font path at U6; consumer mapping by each derived project |
| UG-002 retained values and geometry      | KEEP-02, checked at U4 and U5                                               |
| UG-003 Lucide candidate                  | DEF-04, bumped at U6 (P-28)                                                 |
| UG-004 per-feature submission and limits | consuming feature (not this issue)                                          |
| UG-005 simulated recovery                | DEF-05, consuming feature (not this issue)                                  |
| UG-006 confirmation duration             | TOK-02 at U4; TST-01/02 at U2-S                                             |
| UG-007 leave guard                       | LVG-01 at U2 and U3                                                         |
| UG-008 revisions and approvals           | consuming feature (not this issue)                                          |
| UG-009 commercial policy                 | product owners (not this issue)                                             |
| UG-010 prototype scope                   | product owners (not this issue)                                             |
| UG-011 creator UI and history            | DEF-06, consuming feature (not this issue)                                  |
| UG-012 evidence limits                   | U5 evidence classification and human checks                                 |
| UG-013 brief provenance                  | product owners (not this issue)                                             |
| UG-014 RTL fixes                         | RTL-01 to RTL-04 at U2                                                      |
| UG-015 touch sizes                       | TCH-02 at U1; TCH-01 and TCH-03 at U2                                       |
| UG-016 toast CSP                         | U2-S, with security approval on its PR                                      |
| UG-017 missing media                     | MED-01 at U2 and U3                                                         |
| UG-018 project style seam                | U6 theme seam (P-19 to P-22)                                                |
| UG-019 regression tooling                | U0 decision: scripted captures, no new dependency                           |

## Decision register

Every decision this plan relies on. They are approved together at the start gate. Changing one is recorded under "Verified progress" before the checkpoint it affects. Package decisions D-01 to D-13 are listed under "Package decisions carried in" above.

| ID   | Decision                                                                                                                                                                                                                                                                                                                                                                             | Where    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| P-01 | Copy the two generated stylesheets into `src/styles/design-system/` unedited, with the source revision in a header                                                                                                                                                                                                                                                                   | U4       |
| P-02 | Delete `classic.css` and `soft-blue.css`                                                                                                                                                                                                                                                                                                                                             | U4       |
| P-03 | One PR per remaining step (R1, R2, R3), merged with a merge commit and revertible on its own; work inside a step in small commits                                                                                                                                                                                                                                                    | all      |
| P-04 | AGT-01 and SKL-01 move from U1 to U5 (deviation)                                                                                                                                                                                                                                                                                                                                     | U5       |
| P-05 | Variable-backed type roles and `em` letter-spacing, made in the design package by checkpoint P0 before the start gate                                                                                                                                                                                                                                                                | P0, U4   |
| P-06 | Tests: `node:test` for extracted logic, scripted Playwright for DOM behaviour; no test dependency                                                                                                                                                                                                                                                                                    | all      |
| P-07 | `lg` only with per-screen approval; the leave guard only where there's real saving or Discard                                                                                                                                                                                                                                                                                        | U3       |
| P-08 | Browser verification is the committed smoke script `docs/features/design-system-adoption/smoke.mjs`; the U0 captures stay as reference only, with no pixel comparison gate                                                                                                                                                                                                           | all      |
| P-09 | U2-S lands before U4 (P-30), so the toast falls back to `var(--type-body, var(--font-sans))` and a literal 6000 ms; U4 swaps in the tokens                                                                                                                                                                                                                                           | U2-S, U4 |
| P-10 | The SKL-01 install order follows `handbook:sync`, which generates the `.claude` wrapper (deviation from proposal §4)                                                                                                                                                                                                                                                                 | U5       |
| P-11 | No Tailwind theme keys for the touch sizes                                                                                                                                                                                                                                                                                                                                           | U1       |
| P-12 | TCH-01: add `textarea` to the coarse-pointer height rule, plus the spec's horizontal-Field label rule                                                                                                                                                                                                                                                                                | U2       |
| P-13 | TCH-03 selectors: icon buttons via `[data-size^="icon"]`; select and menu items via their `data-slot`; checkbox and radio labels both as wrapping labels (`label:has(> …)`) and as sibling labels (`[data-slot="checkbox"] + [data-slot="label"]`)                                                                                                                                   | U2       |
| P-14 | `StatusBadge` is a composition in `src/components/status-badge.tsx`; `ui/badge.tsx` is unchanged                                                                                                                                                                                                                                                                                     | U2       |
| P-15 | Measure the neutral and error badge pairs; fall back to the error Notice styling below 4.5:1                                                                                                                                                                                                                                                                                         | U2       |
| P-16 | `Notice` gains an optional `action` prop whose state is owned by the feature                                                                                                                                                                                                                                                                                                         | U2       |
| P-17 | Notice action labels name each state                                                                                                                                                                                                                                                                                                                                                 | U2       |
| P-18 | The Notice action uses `aria-disabled` while pending and on success, so focus isn't lost (deviation)                                                                                                                                                                                                                                                                                 | U2       |
| P-19 | A `theme` flag in `project.config.json`; `layout.tsx` reads `project.theme` and `project.slug` from `src/lib/project.ts` and passes them to `StyleProvider` as props; `global-error.tsx`, a client component with its own `<html>` and no `StyleProvider`, imports `project.ts` itself and sets `data-project` directly; `data-project` is the slug. Public settings are not changed | U6       |
| P-20 | A project theme replaces the preset choice; light, dark and system stay                                                                                                                                                                                                                                                                                                              | U6       |
| P-21 | A project theme isn't a new style ID                                                                                                                                                                                                                                                                                                                                                 | U6       |
| P-22 | `src/project/theme.css`, imported after the foundation, project-owned                                                                                                                                                                                                                                                                                                                | U6       |
| P-23 | Fonts through `@font-face` in `theme.css` and `public/fonts/`; no `next/font` hook                                                                                                                                                                                                                                                                                                   | U6       |
| P-24 | Move `designStyleSchema` into a new dependency-free `src/lib/design-styles.ts`; `appearance.ts` re-exports it so existing importers such as `src/lib/config/public.ts` stay unchanged; `appearance.ts`, `project.ts` and `runs/admin-editors.tsx` import it; disable the admin default-style editor under a project theme                                                            | U6       |
| P-25 | Project tokens stay under `x-<id>`; new shared tokens go through the design package                                                                                                                                                                                                                                                                                                  | U6       |
| P-26 | Replace the old Classic primary `#98492f` with the adopted Classic primary `#c2410c` (COL-classic-light-primary) in `layout.tsx`, `manifest.ts`, `scripts/i18n-assets.mjs` (which generates `public/offline.html`), `android-generate.ts`, `generate-icons.mjs` and `icon.svg`; background `#fff9f3` and foreground `#30221d` stay, because no colour row changes them               | U6       |
| P-27 | Template release is a minor version bump before 1.0, with upgrade notes; existing `## Unreleased` entries ship in it                                                                                                                                                                                                                                                                 | U6       |
| P-28 | Lucide 1.75.0 bump deferred (optional under D-12); a later small PR                                                                                                                                                                                                                                                                                                                  | later    |
| P-29 | The derived-project guide is `docs/design-system-extension.md`, Unibase-owned and naming no project                                                                                                                                                                                                                                                                                  | U6       |
| P-30 | Order: P0, U0, U1, U2 (done), then R1 (U2-S with U3), R2 (U4), R3 (U5 with U6). If the toast cannot pass its CSP smoke check, R1 ships the rollout without it and records the toast as deferred                                                                                                                                                                                      | all      |
| P-31 | Leave-guard eligibility follows the U3 form inventory: only forms that edit an existing saved record with an explicit save                                                                                                                                                                                                                                                           | U3       |
| P-32 | Badge contrast was measured at U2 (all tones at least 4.77:1); after R2 it is re-checked once by the smoke run, not as a separate gate                                                                                                                                                                                                                                               | U2, R2   |
| P-33 | The upgrade rehearsal uses a local, unpushed tag and a disposable project created from `template-v0.4.0`                                                                                                                                                                                                                                                                             | U6       |

## Execution prerequisites

**Human gates.** The start gate is met (2026-11-21, issue owner). The only remaining human step is the
**release gate**: authorization to push the `template-v<version>` tag at the end of step R3. PRs merge
with merge commits once their smoke checks pass and one review has looked at the diff (a separate agent
when available; otherwise a recorded self-review). There are no per-PR approval stops.

**Environment.**

- Node 24 with `npm.cmd ci`.
- A local run that works without cloud credentials.
- Headless browser sessions through the Playwright skill, with captures under `output/playwright/`, which is not committed.
- `/design-system` works in development only. Stop the dev server before `npm.cmd run build`, because they share `.next`.

**Network notes (found 2026-11-21).** From the current location, MongoDB's binary download and the
Firebase emulator UI bundle return HTTP 403 (region). With a VPN, `npm.cmd run emulators:mongo` works
(first run downloads about 780 MB). The emulator UI stays blocked, so start the Auth Emulator without its UI:
create a local file (for example `output/firebase.emulator-no-ui.json`, git-ignored) containing
`{"emulators":{"auth":{"host":"127.0.0.1","port":9099},"ui":{"enabled":false},"singleProjectMode":true}}`
and run `node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth --project demo-unibase --config output/firebase.emulator-no-ui.json`.
Note: with a VPN on, Claude subagents may be refused by the API (HTTP 403); do the work in the main session.

**Local run and sign-in** (used by every browser check from U0 on; see `docs/local-testing.md`):

1. Use the local defaults. If `.env.local` exists, it must select the local and demo resources shown in `.env.example`.
2. Start three long-running processes and wait for each to be ready: `npm.cmd run emulators:auth` ("All emulators ready"), `npm.cmd run emulators:mongo` ("Local MongoDB ready") and `npm.cmd run dev` ("Ready"). Use `http://localhost:3000` for the app.
3. **Member account.** On `/account`, register `qa-member-01@example.test` with a 12-character disposable password. Open the verification link from the Auth Emulator's email actions (`docs/local-testing.md`), then choose "I've verified my email".
4. **Admin account.** On a fresh local database, register and verify `admin@uniwares.co.uk` the same way. While no administrator exists, that verified email becomes the first administrator (`docs/architecture.md`, first-administrator rule). If the local database already holds the bootstrap marker, either run `npm.cmd run admin:bootstrap -- <UID>`, with the UID taken from `http://127.0.0.1:4000/auth`, or stop the Mongo runner, rename the data directory it printed at start, and restart. All of this is local data only.
5. Drive the browser with named headless Playwright sessions, one per account, and save captures under `output/playwright/<checkpoint>/`. Emulator accounts are ephemeral, so repeat steps 3 and 4 after restarting the emulators.

**Standing rules** (from Unibase's agent guidance):

- typed catalogs, page-scoped dictionaries and logical RTL;
- admin stays English/LTR;
- CSP nonces are preserved;
- shadcn primitives are added through the CLI;
- semantic theme variables only;
- a `CHANGELOG.md` `## Unreleased` entry for every reusable change, with upgrade notes when derived projects must act;
- behaviour tests, not source-mirroring tests;
- one review of each PR diff before merge (a separate agent when available, otherwise a recorded self-review).

## Budget and risk control

| Step   | Contains                                                                            | PRs             | Approx. files | Status                     |
| ------ | ----------------------------------------------------------------------------------- | --------------- | ------------- | -------------------------- |
| P0     | Design-package type-role change (in `unitale-design`)                               | 1               | ~6            | done (PR #13)              |
| U0     | Baseline capture                                                                    | 0               | 0             | done                       |
| U1     | Touch tokens                                                                        | 1               | ~3            | done (#56)                 |
| U2     | Shared helpers in the showcase                                                      | 1               | ~29           | done (see progress)        |
| **R1** | Toast and CSP (U2-S) **and** rollout of the helpers into feature screens (U3)       | 1               | ~25           | next                       |
| **R2** | Visible foundation (U4)                                                             | 1               | ~11           |                            |
| **R3** | Guidance and skill (U5), derived-project readiness, guide and template release (U6) | 1, plus the tag | ~35           | ends with the release gate |

**Stop rules.**

- Stop and report when any of these happens:
  - the release gate is reached;
  - a check fails twice for the same reason;
  - a checkpoint needs a file outside its listed boundary;
  - the accepted package revision changes mid-way.
- Each step ends with its PR merged and a short evidence comment on #53, so work can pause between steps at no cost.

## Simplified remaining work

**Coding rules** (follow them while writing, so lint, format and type checks are not rerun per step):

- TypeScript without `any` or non-null assertions where a check is possible; client components start
  with `"use client"`; server-only code stays in `src/lib/server`.
- Prettier style as in the surrounding code (two spaces, double quotes, trailing commas, about 80 columns).
- No React refs read during render; no unused imports or variables; `alt` passed explicitly to images.
- User-visible text goes through `useTranslations("ui")` keys (`m` plus the first 12 hex characters
  of the SHA-256 of the English text) in `messages/en.json` and `messages/ar.json`, then
  `node scripts/i18n-client-sections.mjs`. Logical RTL classes (`ms-`, `me-`, `start-`, `end-`,
  `text-start`). Semantic theme variables only; no literal colours in components.
- New CSS for coarse pointers or helpers goes inside `@layer components`, so Tailwind utilities still win.

**Per-step checks (light).** Before each step's PR:

1. `npm.cmd test` passes.
2. With the app running (`npm.cmd run dev` and the local services), run
   `node docs/features/design-system-adoption/smoke.mjs` with `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`
   set. All 38 checks must pass. Inspect each touched page once, using smoke visits where they overlap
   and grouping signed-in pages by account role.
3. Only R1's toast also needs a production build (`npm.cmd run build`, then `npm.cmd start`) to confirm
   one styled toast shows with no CSP error. If the toast is deferred, verify the rollout after reverting it.

On the passing path, R1 through R3 take three unit-suite runs and three smoke runs in total.
R3's final unit and smoke results also satisfy its per-step checks on the same candidate. After a
fix or release metadata edit, rerun the checks whose inputs changed.

No per-step lint, format or type check; no capture matrices, pixel comparisons, contrast recomputation,
per-PR approvals or physical-device checks. Add a unit test only when a step adds pure logic.

**Final gate (once, at the end of R3, before the release).**

1. `npx.cmd eslint --fix` and `npx.cmd prettier --write` on the files changed since `main` at U2's
   merge; commit as "chore: apply lint and format".
2. Then, once: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run check:docs`,
   `npm.cmd run check:i18n`, `npm.cmd run check:skills`, `npm.cmd run test:handbook`,
   `npm.cmd run check:template` and `npm.cmd run build`. `npm.cmd run format:check` may only report
   the 11 files already failing on `main` before this work. Fix anything else.
3. The smoke script passes. If `typecheck` reports errors in `.next/dev/types/validator.ts` after a
   stopped dev server, delete `.next/dev` and rerun; it is a truncated generated file.

**Careful implementation, for every step.**

- Branch from an up-to-date `main` as `task/53-<step>-<slug>`.
- Re-read each file before editing it; change only the files the step names.
- Commit in small, self-contained commits (one concern each).
- Update this plan's "Verified progress" and `CHANGELOG.md` `## Unreleased` in the same PR.
- Merge with a merge commit; post a short evidence comment on #53.
- If a step needs a decision the plan doesn't make, choose the option closest to the spec, record it
  under "Verified progress", and continue.

**R1. Toast and rollout** (U2-S and U3 below). One PR.

1. Toast: follow the U2-S section (Sonner pinned to exactly 2.0.8 through the shadcn CLI, the
   `toast.tsx` wrapper, mounted in the layout, CSP hashes in `src/proxy.ts`, the `Dismiss` key, the
   showcase demo). Keep `tests/sonner-csp.test.ts` (hash and pin). If the production toast check fails,
   revert the toast commits, keep the rollout, and record the toast as deferred.
2. Rollout: follow the U3 form inventory (one commit per area: account and files, credits and commerce,
   admin, runs). Field and `SubmitButton` on the listed forms; the leave guard only on the six editors
   marked "yes"; `ResultImage` and the download-failure Notice at the six named media call sites. Do not
   apply `size="lg"` to existing screens.

**R2. Visible foundation** (U4 below). One PR. The accepted package revision is `unitale-design`
`6d86be7` (P0), which has the variable-backed type roles. Follow the U4 work list (copy the two
stylesheets with a revision header, the `globals.css` import order, trim `tokens.css` and `glass.css`,
delete `classic.css` and `soft-blue.css`, the EmptyState title, the docs that become wrong). Add
`tests/design-foundation.test.ts` (import order, revision headers, one block per preset ID, the 6000ms
token, variable-backed roles). The dark warning surface keeps the package value.

**R3. Guidance, readiness and release** (U5 and U6 below). One PR, then the release gate.

1. Agent guidance and the `build-ui` skill (U5): AGT-01 and SKL-01 in the order recorded under U5
   (`names` entry, `handbook:sync`, `check-skills --write`).
2. Derived-project readiness (U6): the theme seam (P-19 to P-24), fonts (P-23), the project-token rule
   (P-25), the colour mapping (P-26, `#98492f` to `#c2410c`), and the derived-project guide
   `docs/design-system-extension.md` with its starter skeleton (P-29). Tests: the seam cases in
   `tests/config.test.ts` and `tests/template-update.test.ts` only.
3. Record the adopted package version (DOC-01 §5).
4. Run the final gate.
5. Template release: changelog version, `template.json`, `npm.cmd run test:initialized-projects`, and
   one upgrade rehearsal from `template-v0.4.0` (P-33). Stop at the release gate: the tag is pushed only
   after the issue owner authorizes it.

**Deferred as safe simplifications (2026-11-21):** the optional Lucide 1.75.0 bump (P-28; optional
under package decision D-12), the separate docs-consistency test for the guide, and the
`initializer` and integration tests for the seam. Each can be a later small PR.

## Checkpoints

Apply them in this fixed order (P-30): P0, U0, U1, U2, U2-S, U3, U4, U5, U6. Each checkpoint starts only when the one before it is merged. If the U2-S security review rejects the toast, U2-S closes without code and U3 follows.

### P0. Design-package type-role change (in `unitale-design`)

The only checkpoint outside Unibase. It makes decision 5 real, so the start gate can approve a revision that contains it.

- **Requirements.** This plan approved by the issue owner (the rest of the start gate comes after P0).
- **Owner.** The design-package owner. An agent may implement it with session authorization for that repository.
- **Work,** on a `task/` branch of `Uniwares-LTD/unitale-design` from `main`:
  1. In `scripts/design-system/build-tokens.mjs`, where `tailwind-theme.css` is written (the `@theme inline` block, about lines 218-223 at `493e13b`), emit each role key as a variable with the current value as fallback:
     - `--text-<role>: var(--text-<role>-size, <rem>)`;
     - `--text-<role>--line-height: var(--text-<role>-leading, <value>)`;
     - `--text-<role>--font-weight: var(--text-<role>-weight, <value>)`;
     - `--text-<role>--letter-spacing: var(--text-<role>-tracking, <value>em)`.
       These names match the `-size`, `-leading`, `-weight` and `-tracking` variables that generated project themes already emit (`roleDecls`, about line 256).
  2. Letter-spacing is written in `em` in the generated CSS. The DTCG source keeps `rem`, which is all DTCG allows (see the comment at about line 97), and the generator converts it.
  3. Update the TYPE rows' description and spec §1 "Anatomy" to say the keys are variable-backed, and add a changelog entry.
  4. Regenerate with `node scripts/design-system/build-tokens.mjs`, then run the five package checks. Run the browser check with `UNIBASE_ADOPTION_SOURCE` pointing at a Unibase checkout with dependencies installed, so the compiled-Tailwind fixture runs.
- **Acceptance.**
  - Without a project theme, every role computes exactly as before: the browser and adoption checks pass unchanged.
  - With a fixture rule setting `--text-hero-size`, the `text-hero` utility changes size.
  - The PR merges in `unitale-design` with a merge commit.
- **Continuation.** The start gate then approves that merged revision as the accepted one.

### U0. Gate and baseline capture

- **Requirements.** The start gate is met. The accepted revision is recorded under "Verified progress".
- **Work.**
  - Capture the baseline:
    - pages: `/design-system`, Account, Preferences, Credits, Admin, Users, Reports;
    - presets: Classic, Glass, Soft Blue;
    - themes: light and dark;
    - widths: 390px and 1440px.
  - Also capture:
    - one public page in Arabic;
    - Glass with reduced transparency;
    - the error page (no preset attribute).
  - Follow "Local run and sign-in". The member account captures Account, Preferences and Credits; the admin account captures Admin, Users and Reports. Record the exact capture commands and URLs on #53, so U4 and U5 repeat them unchanged.
- **Decision recorded here (UG-019).** Use scripted Playwright-CLI captures, which add no dependency. Regression tooling inside the repository needs its own dependency decision and stays out of scope.
- **Acceptance.** A capture set exists for every combination, with its commands written down. The capture list and location are posted on #53.
- **Continuation.** Automatic once the start gate is met.

### U1. Seams, no visual change

- **Requirements.** U0 complete.
- **Rows.**
  - TCH-02: `--control-touch-sm` 2.75rem, `--control-touch-md` 3.25rem and `--control-touch-lg` 3.75rem in `src/styles/tokens.css`. Nothing uses them until TCH-03.
  - DOC-01 §1: the "Where to change things" rows for files that exist at this point.
- **Decision P-11 (spec §7, TCH-02).** No Tailwind theme keys for the touch sizes; the CSS variables are consumed only by the TCH-03 rules.
- **Boundaries.** No component, preset or visible change.
- **Acceptance.**
  - Every colour and every computed body and heading style is identical to U0.
  - `npm.cmd run typecheck`, `lint`, `test`, `build`, `check:docs` and `check:i18n` pass.
- **Continuation.** Automatic.

### U2. Shared helpers in the showcase

- **Requirements.** U1 merged.

Each item is built once, shown in every state in `/design-system`, and used by no feature
until U3. Spec numbers refer to the package's implementation specifications.

| Rows             | Spec                           | Files                                                                                                                                                                                  | Acceptance and decisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FLD-01           | §2 Field composition           | new `src/components/ui/field.tsx` via `npx shadcn add field` (style `radix-nova`)                                                                                                      | **Decline** the CLI's offer to overwrite `label.tsx` and `separator.tsx`. Add the ID wiring and the two RTL corrections. Wire the form's capture-phase `invalid` handler next to `LocalizedValidation`. Give fields holding mixed-direction values (emails, URLs, codes) `dir="ltr"`, as spec §2 requires. **Acceptance:** submitting a required field empty focuses it and shows the translated message; `aria-describedby` lists the help and error IDs; typing clears the error; values survive a server error; in Arabic the help and error text start at the right.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FLD-02           | §3 Field size                  | `input.tsx`, `textarea.tsx`, `select.tsx`: opt-in `size="lg"`                                                                                                                          | Default fields render pixel-identical to U0. `lg` computes a 48px minimum height and 16px text at 390px and 1440px. Nothing uses `lg` in this checkpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PND-01           | §5 Pending submit              | `page-patterns.tsx` (`SubmitButton`)                                                                                                                                                   | A double-click sends one request. The label stays unchanged. The spinner is static with reduced motion. A failure re-enables the fields with their values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| LVG-01           | §6 Leave guard                 | new `src/components/leave-guard.tsx`; provider in `src/app/layout.tsx`; guarded links in `app-shell.tsx` and `account-menu-controls.tsx`                                               | Each table row's outcome matches for a fixture whose save succeeds, fails or is unknown. A clean form never prompts. Closing the tab while dirty shows the native prompt. Back is documented as unguarded. Initial focus is on Keep editing. Closing the dialog returns focus to the link or menu trigger that started the navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| MED-01           | §8 Missing media and downloads | new `src/components/media-fallback.tsx`                                                                                                                                                | A missing source shows the fallback with text. A blocked URL shows the failed variant. A forced download error shows the Notice and leaves the result untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| RTL-01 to RTL-04 | §7                             | `ui/dialog.tsx` (and remove the patches in `diagnostic-access.tsx` and `runs/workflow-version-picker.tsx`), `ui/alert-dialog.tsx`, `ui/sheet.tsx`, `app/page.tsx`, `app/not-found.tsx` | In Arabic, dialogs and alert dialogs are centred at 390px and 1440px, the sheet's close button is at the inline end, and the arrows mirror. In English nothing moves. `components.json` keeps `rtl: false`, recorded as not assessed (spec §7); this checkpoint doesn't change it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| TCH-01, TCH-03   | §7                             | `src/app/globals.css`, inside the existing `@media (pointer: coarse)` block                                                                                                            | **Decision P-12, TCH-01:** add `[data-slot="textarea"]` to the existing `min-height: 2.75rem` selector, and add the spec's horizontal-Field label rule verbatim. **Decision P-13, TCH-03:** add `[data-slot="button"][data-size^="icon"] { min-width: var(--control-touch-sm); }`, which matches `icon`, `icon-xs`, `icon-sm` and `icon-lg` through the `data-size` attribute that `ui/button.tsx` sets. Add `[data-slot="select-item"], [data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-checkbox-item"], [data-slot="dropdown-menu-radio-item"], label:has(> [data-slot="checkbox"]), label:has(> [data-slot="radio-group-item"]), [data-slot="checkbox"] + [data-slot="label"], [data-slot="radio-group-item"] + [data-slot="label"] { min-height: var(--control-touch-sm); }`. Unibase mostly puts `<Label htmlFor>` beside the control rather than around it (for example `admin-credit-controls.tsx`, `notification-settings.tsx`), so the sibling forms are required. That covers the selectable options and the checkbox or radio labels outside a `Field` (radio groups are used in `appearance-form.tsx`, `admin-credit-controls.tsx`, `admin-user-controls.tsx`, `purchase-simulator.tsx` and `runs/run-start.tsx`). The TCH-03 row's "not yet reviewed" status is settled by the U2 PR approval. **Acceptance on touch:** the label beside a checkbox or radio is at least 44px and toggles the control; every icon button is at least 44px wide; every choice is at least 44px tall. A fine pointer keeps the compact sizes. |
| BDG-01           | §10                            | new `src/components/status-badge.tsx` (a composition outside `ui/`, so the shadcn CLI never overwrites it; `ui/badge.tsx` stays unchanged, like KEEP-01)                               | Decisions P-14 and P-15, below the table. **Acceptance:** each tone reads correctly with icons hidden and in greyscale; long labels wrap; the badge isn't focusable; light and dark in every preset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| NTC-01           | §11                            | `Notice` in `page-patterns.tsx`                                                                                                                                                        | Decisions P-16 to P-18, below the table. **Acceptance:** each state shows its label and receipt; pending and success can't be activated by click or keyboard; failed can be retried by the user only; focus never drops to `<body>`; keyboard and screen-reader announcement in every preset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| (copy)           | §9 Copy                        | `ui` catalog keys (`m` plus a 12-hex SHA-256 prefix) in English and Arabic; regenerate `messages/client-sections.json`                                                                 | Run `node scripts/i18n-client-sections.mjs`, then `npm.cmd run check:i18n`. The Arabic text is a draft until its native review on the U2 PR. The toast's `Dismiss` key ships with U2-S, not here, so it is never unused.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Status badge (BDG-01).**

- **Decision P-14, API:** `StatusBadge({ tone, icon?, children, className? })`, where `tone` is `"neutral"`, `"info"`, `"warning"`, `"success"` or `"error"`.
  - Each tone has its default Lucide icon from §10: BookOpen, LoaderCircle (not animated), TriangleAlert, CircleCheck, CircleX. `icon` overrides it.
  - It renders `Badge` with `variant="secondary"` (neutral), `variant="destructive"` (error), or a tone class using the info, warning and success semantic pairs.
  - It adds `h-auto whitespace-normal [&>svg]:size-3.5!`, so long labels wrap and the icon is 0.875rem despite Badge's `[&>svg]:size-3!`; confirm in the browser check that `cn` lets these override `h-5 whitespace-nowrap`. The icon gets `aria-hidden`.
- **Decision P-15, contrast (method P-32):** measure the neutral and error badges in the showcase in all six preset and theme combinations. In the browser check, read the badge's computed `color` and its effective background (the badge background composited over the card's computed background), compute the WCAG 2 contrast ratio, and record each ratio on the U2 PR. Re-run the same measurement at U4, because U4 changes the colours. If the error pair is below 4.5:1, use the error Notice styling instead: `bg-card text-destructive` with a destructive border.

**Notice with an action (NTC-01).**

- **Decision P-16, props:** `Notice` gains an optional `action?: { state: "available" | "pending" | "success" | "failed"; labels: { available: string; pending: string; success: string }; receipt?: string; onAction: () => void }`. The feature owns the state; the notice never changes it itself, never starts work by appearing, and never retries.
- **Decision P-17, label:** keep §11's state-specific labels (for example "Checking result"). Unlike `SubmitButton`, a notice action isn't a form submit, and the label plus the receipt tell the user what is happening.
- **Decision P-18, focus:** in the pending and success states the button uses `aria-disabled="true"` (plus `aria-busy="true"` while pending, as §11 requires) with its activation ignored, instead of the `disabled` attribute. Focus then stays on the button rather than dropping to `<body>`, and the receipt (`role="status"`) announces the change. This deviates from §11's `disabled`; it is recorded in the U5 deviation table.

- **Docs.**
  - DOC-01 §1 rows for the new files, and DOC-01 §3 "Interaction rules".
  - DOC-01 has no text for BDG-01, NTC-01, TCH-02 and TCH-03. Write local `docs/design-system.md` sections for them: purpose, props, states and touch sizes, with a link to the showcase.
- **Tests** (method: decision 6).
  - Logic tests with `node:test` for:
    - Field ID derivation and the `invalid` handler's state;
    - pending single-submit;
    - leave-guard outcomes;
    - media fallback states;
    - the Notice action state machine.
  - DOM behaviour (focus moves, `aria-describedby`, keyboard) in the browser checks below.
  - `check:i18n`.
- **Merge order.** U2 and U2-S both regenerate `messages/client-sections.json`; merge U2 first and regenerate the file in U2-S after rebasing on it.
- **Browser checks.** Every state in the showcase at 390px and 1440px, English and Arabic, light and dark, keyboard only. No hydration or CSP errors.
- **Continuation.** Automatic. Native Arabic review before merge (PR approval rule).

### U2-S. Toast and CSP (security route)

- **Requirements.** U2 merged. Security approval on the PR (PR approval rule).
- **Rows.**
  - TST-01: `sonner` through the shadcn CLI, as `src/components/ui/sonner.tsx`, then **pinned exactly** as `"sonner": "2.0.8"` in `package.json`, because the CLI installs an unpinned range. Add a `src/components/toast.tsx` wrapper with `confirm`, `info`, `error` and `action` helpers, mounted in `src/app/layout.tsx`.
  - TST-02: two `sha256` sources in production `style-src` in `src/proxy.ts`, with the hash constant exported.
- **Toaster props (spec §4).**
  - `theme` from `resolvedTheme`;
  - position `bottom-right` in LTR and `bottom-left` in RTL;
  - `offset` and `mobileOffset` of 16px;
  - a translated `containerAriaLabel`;
  - inline `fontFamily: var(--type-body)`;
  - mounted inside `ThemeProvider`, next to `LocalizedValidation`.
- **Order dependency on U4.** U2-S lands before U4 (P-30), so neither `--type-body` nor `--toast-confirmation-duration` exists yet. Fall back with `var(--type-body, var(--font-sans))` and a literal 6000 ms, which U4 replaces with the token. `tests/toast.test.ts` covers both cases.
- **Showcase.** Add a toast demo in `src/components/design-showcase.tsx`, needed by DOC-01 §4 step 10.
- **Docs.** DOC-01 §4 local test loop, the toast steps.
- **Copy.** The `Dismiss` key from spec §9, in English and Arabic.
- **Acceptance (§4).**
  - In a production build (`npm.cmd run build`, then `npm.cmd start`), a toast causes no CSP violation and is styled.
  - A confirmation stays while hovered or focused, and goes 6000 ms after both end.
  - An error toast stays until dismissed and is mirrored in a `Notice`.
  - In Arabic, toasts appear bottom-left.
  - Alt+T focuses the toast region.
- **Tests.** `tests/sonner-csp.test.ts`:
  - recomputes both hashes from the installed Sonner and compares them with the exported constant;
  - asserts `package.json` pins `"sonner": "2.0.8"` without a range;
  - asserts the sources appear in production `style-src` only.

  And `tests/toast.test.ts`, a logic test of the wrapper's timer and replacement (decision 6); focus return and hover are asserted in the browser checks:
  - a confirmation pauses while hovered or focused, and restarts the full duration after both end;
  - a new confirmation replaces the previous one through the shared `confirmation` id;
  - an error toast persists until dismissed;
  - the 6000 ms and font fallbacks apply when the tokens are absent.

- **Continuation.** Stop if the security review rejects. Record the alternative (UG-016), remove the toast references from DOC-01, AGT-01 and SKL-01, and continue without a toast.

### U3. Rollout by area

- **Requirements.** U2-S merged or closed.
- **Slices,** one PR each, in this order:
  1. Account, Preferences, Profile and Files.
  2. Credits and commerce.
  3. Admin, which stays English/LTR.
  4. Runs.
- **Form inventory and leave-guard eligibility (P-31).** The leave guard applies only to forms that edit an existing saved record and save it explicitly. One-shot actions (sign-in, search, upload, checkout, grants, starting a run, adding a note) and controls that save immediately are not guarded. Every slice applies Field and `SubmitButton` to the forms that have labelled inputs or a submit action.

  | Slice | Form (file)                                                                                                         | Field       | Pending        | Leave guard |
  | ----- | ------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- | ----------- |
  | 1     | sign-in and registration (`auth-form.tsx`)                                                                          | yes         | yes            | no          |
  | 1     | profile (`profile-form.tsx`)                                                                                        | yes         | yes            | **yes**     |
  | 1     | appearance (`appearance-form.tsx`)                                                                                  | yes         | yes            | **yes**     |
  | 1     | style, theme and language selectors (`style-preference.tsx`, `theme-preference.tsx`, `localization-preference.tsx`) | labels only | no (immediate) | no          |
  | 1     | notification settings (`notification-settings.tsx`, saves on toggle)                                                | labels only | no             | no          |
  | 1     | file upload (`files.tsx`)                                                                                           | yes         | yes            | no          |
  | 1     | notes sample (`samples/notes/notes-panel.tsx`)                                                                      | yes         | yes            | no          |
  | 2     | credit checkout (`credit-checkout.tsx`)                                                                             | yes         | yes            | no          |
  | 2     | purchase simulator, two forms (`purchase-simulator.tsx`)                                                            | yes         | yes            | no          |
  | 2     | commerce admin search (`commerce/admin-commerce.tsx`)                                                               | yes         | yes            | no          |
  | 2     | commerce admin draft editors, "Save draft" (`commerce/admin-commerce.tsx`, `commerce/schema-fields.tsx`)            | yes         | yes            | **yes**     |
  | 3     | user search (`app/admin/users/page.tsx`, GET)                                                                       | yes         | no             | no          |
  | 3     | user role and access controls (`admin-user-controls.tsx`)                                                           | yes         | yes            | no          |
  | 3     | credit grants (`admin-credit-controls.tsx`)                                                                         | yes         | yes            | no          |
  | 3     | report filters (`report-filters.tsx`, GET)                                                                          | yes         | no             | no          |
  | 3     | diagnostic access grants (`diagnostic-access.tsx`)                                                                  | yes         | yes            | no          |
  | 3     | AI and domain settings (`ai-resolution.tsx`, `domain-target-picker.tsx`)                                            | yes         | yes            | no          |
  | 4     | run start (`runs/run-start.tsx`, with `dynamic-field.tsx`, `answerer-select.tsx`, `workflow-version-picker.tsx`)    | yes         | yes            | no          |
  | 4     | registered run card (`runs/registered-card.tsx`)                                                                    | yes         | yes            | no          |
  | 4     | persona editor, "Save persona" (`runs/persona-editor.tsx`)                                                          | yes         | yes            | **yes**     |
  | 4     | completion settings (`runs/persona-completion-editor.tsx`)                                                          | yes         | yes            | **yes**     |
  | 4     | run admin editors with "Save" (`runs/admin-editors.tsx`)                                                            | yes         | yes            | **yes**     |

  A form found during a slice that isn't in this table is classified by the same rule and added here before it is changed.

- **What each slice applies.**
  - FLD-01 and PND-01 to the slice's forms.
  - LVG-01 **only** for the forms marked "yes" in the inventory (spec §6, P-31).
  - MED-01 at the slice's call sites:
    - Files: `src/components/files.tsx`;
    - Admin: `src/components/admin-operations.tsx`, `src/components/diagnostics-panel.tsx`;
    - Runs: `src/app/artifacts/[id]/page.tsx`, `src/components/runs/registered-card.tsx`, `src/components/runs/run-ui.tsx`.
  - FLD-02 `lg` only with explicit approval on that slice's PR.
- **Acceptance per slice.**
  - Invalid submit, retained values, pending state and failure behave as in U2.
  - Screens without an approved change are unchanged against U0 (U4 runs after U3, so U0 is always the baseline here).
  - `npm.cmd run test:integration` passes.
- **Boundaries.** No new helpers. A missing helper state is a U2 fix, not a local workaround.
- **Continuation.** Automatic slice by slice.

### U4. Visible foundation

- **Requirements.** U3 merged. Explicit approval on the PR (PR approval rule), including the dark warning surface. U0 captures exist.
- **Rows.** All 99 colour rows, TOK-01, TOK-02 and TYPE-01 to TYPE-12, following the package's
  [foundation migration](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/adoption/implementation-specs.md#foundation-migration).
  Re-read each Unibase file before editing it.
- **Work.**
  1. Copy `unibase.css` and `tailwind-theme.css` (with variable-backed type roles, decision 5) from the accepted revision into `src/styles/design-system/`, with a header comment naming the source repository, path and revision.
  2. `src/app/globals.css`: set the import order to tailwindcss, tw-animate-css, shadcn/tailwind.css, `../styles/design-system/unibase.css`, `../styles/tokens.css`, `../styles/presets/glass.css`, then `../styles/design-system/tailwind-theme.css`.
     - Remove `--font-heading` and the literal `--font-sans` from `@theme inline`.
     - Keep the semantic colour and radius mappings, `@custom-variant dark`, `.page-title`, `.reading-copy`, `.page-stack`, and the focus and touch rules.
  3. `src/styles/tokens.css`: remove the root heading, blur, edge, solid card and sidebar declarations and page gap, and the dark rule once it's empty. Keep the surface shadow, `--canvas-art`, `--reading-width` and the TCH-02 touch tokens.
  4. `src/styles/presets/glass.css`: remove each root property the generated Glass selectors also declare. Use the package fixture `scripts/design-system/lib/adoption-fixture.mjs` as the exact list. Keep every descendant rule, the `@supports` fallback and the reduced-transparency rule.
  5. Delete `src/styles/presets/classic.css` and `soft-blue.css`.
  6. In `src/components/page-patterns.tsx`, change the EmptyState `CardTitle` to `text-card-title! leading-(--text-card-title--line-height)! font-(number:--text-card-title--font-weight)!`. That's 20px/26px, weight 600.
  7. Replace U2-S's literal 6000 ms and font fallback with the tokens, and update `tests/toast.test.ts` to assert the tokens instead of the fallbacks.
- **Docs made wrong by this change, fixed in the same PR.**
  - `docs/design-system.md:10-13` describe the old preset palettes; update them to the adopted ones.
  - `docs/design-system.md:39` says "Keep brand values in preset files". Brand values now come from the vendored foundation.
  - `docs/design-system.md:88-90`, "To add a future preset… import it after Classic": rewrite it for the vendored foundation. The derived-project part is added at U6, when the seam exists.
  - `docs/architecture.md:31-32` names the three preset files and says `tokens.css` owns typography.
  - DOC-01 §1 table rows for the vendored files, and DOC-01 §2 "Typography roles".
  - Document that the shadcn CLI writes into `globals.css`, and that foundation values belong to the vendored files.
- **Unchanged.**
  - KEEP-01 to KEEP-05.
  - `src/lib/appearance.ts`, `style-provider.tsx` and `theme-provider.tsx`.
  - The cookies and the `src/proxy.ts` CSP. The bundled CSS is served from `'self'` and no fonts are fetched.
  - `components.json`.
- **Tests.** A new `tests/design-foundation.test.ts` checks:
  - the import order;
  - the revision headers on the vendored files;
  - every non-Classic ID in `designStyleSchema` has an `html[data-style="…"]` block, and `:root` is the Classic fallback;
  - `--toast-confirmation-duration` is `6000ms`;
  - each type-role key in the vendored `tailwind-theme.css` is variable-backed with its package value as fallback, and letter-spacing values use `em`.
- **Required cross-check before merge.** Run the package's `scripts/design-system/verify-unibase-browser.mjs` with `UNIBASE_ADOPTION_SOURCE` pointing at this branch. That adds the 9 compiled-Tailwind fixture checks; see the verification record.
- **Browser checks.**
  - The U0 matrix again. Differences must be exactly the approved colour rows.
  - Preset and light/dark/system persistence across navigation and reload.
  - Glass fallback and reduced transparency.
  - Keyboard focus.
  - Arabic public pages, with admin staying English/LTR and the preference restored on leaving admin.
  - No hydration, runtime or CSP errors.
  - The error page keeps the Classic fallback.
  - A temporary `text-body` probe computes 14px / 22.4px / 400. Remove it afterwards.
- **Contrast.** Recompute it for any adopted value that differs from the package.
- **Rollback.** Revert the single U4 commit.
- **Continuation.** Explicit approval on the PR.

### U5. Verification, agent guidance and close of the package adoption

- **Requirements.** U4 merged, and U2-S merged or closed after a rejected security review.
- **AGT-01** (explicit approval on the PR), from the agent-guidance proposal:
  - one bullet under "Decision-point rules" in `AGENTS.md`;
  - two additions to "UI and browser verification" in `.agents/repository-adapter.md`;
  - one change to the "UI, locale or navigation" row in `docs/source-map.md`.
  - If U2-S was declined, drop the toast references.
- **SKL-01** (explicit approval on the PR):
  - In this order (a deviation from proposal §4, because `handbook:sync` generates the `.claude` wrapper itself and would overwrite a hand-written one):
    1. Add the canonical `.agents/skills/build-ui/SKILL.md` from the package.
    2. Add `"build-ui"` to the `names` array in `scripts/check-skills.mjs`; without it, the check fails.
    3. Run `npm.cmd run handbook:sync`, which generates `.claude/skills/build-ui/SKILL.md`.
    4. Run `node scripts/check-skills.mjs --write`, keeping `build-ui` out of `sharedSkills`.
    5. Run `npm.cmd run check:skills` and `handbook:entrypoints`.
  - Refresh `skills-lock.json` and the integrity hashes after review, recording `build-ui` as a local skill, not under the shared Handbook source.
  - The skill's component table lists every helper adopted here: Field, field size, SubmitButton, leave guard, media fallback, status badge, actionable Notice, toast (if adopted) and touch tokens. The theme seam is added to the skill at U6.
  - If SKL-01 is rejected and AGT-01 approved, keep the same text as a document (proposal §4 fallback).
- **Work.**
  - The complete local test loop from `docs/design-system.md`, including the steps DOC-01 §4 adds.
  - A separate read-only review of the integrated diff since the issue base.
  - DOC-01 §5 "Adopted package version": the accepted revision and a Deviation | Reason | Date table, starting with the AGT-01/SKL-01 move.
  - Post the evidence on #53 and unitale-mockup#7.
- **Acceptance.**
  - `npm.cmd run typecheck`, `lint`, `test`, `build`, `check:docs`, `check:i18n`, `check:skills`, `check:template`, `test:handbook` and `test:integration` pass. `test:handbook` runs `check-skills` through `tests/handbook-integration.test.mjs`.
  - KEEP-01 to KEEP-05 are confirmed unchanged.
  - Every ledger row is marked adopted, declined with a reason, or deferred to its named owner.
- **Evidence classification (UG-012).** Record failed inherited behaviour, unavailable evidence and unexercised checks separately. None of them counts as a pass.
- **Human acceptance on physical devices.** These stay human tasks and are recorded as such:
  - a real mobile keyboard;
  - microphone permissions;
  - screen-reader live updates;
  - a 200% zoom review;
  - visual parity sign-off.
- **Continuation.** Explicit approval on the PR for AGT-01 and SKL-01; then automatic to U6.

### U6. Derived-project readiness and template release

This checkpoint makes Unibase ready for any derived project to build its UI on. Its decisions (P-19 to P-29) are approved with the plan.

- **Requirements.** U5 merged.
- **Continuation.** The seam-and-guide PR merges with explicit approval for its agent guidance. The release PR and the tag follow only after the release gate.

- **Theme seam (DEF-03, UG-018).** Today a derived project can only pick one of the three presets (`defaultStyle` in `src/lib/project.ts`, `designStyleSchema` in `src/lib/appearance.ts`). Package themes target `html[data-project="<id>"]`, and the package reference removes `data-style` while a project theme is shown (Extending Unibase; foundation migration). Decisions:
  1. **Decision P-19: who sets `data-project` on `<html>`:** The server, in `src/app/layout.tsx`, from a new optional `theme: true` flag in `project.config.json` (validated in `src/lib/project.ts`). With the flag off, which is Unibase's default, the attribute is absent and nothing changes.
  2. **Decision P-20: presets under a project theme:** The project theme **replaces** the preset choice, matching the package reference, which removes `data-style` while a project theme is shown.
     - The style selector is hidden when `theme: true`.
     - The light/dark/system preference stays.
     - The style cookie and saved profile style are kept but ignored, so turning the flag off restores them.
  3. **Decision P-21: not a new style ID.** A project theme is a project scope, not a `designStyleSchema` value, so the `build-ui` rule on new style IDs doesn't apply. Record this in `docs/design-system.md`.
  4. **Decision P-22: the file.** `src/project/theme.css`, comments only in Unibase (it renders nothing) and imported after the foundation and Glass CSS in `globals.css`. The project's selectors are `html[data-project="<slug>"]` and its `.dark` form, as in Extending Unibase.

  Then build it:
  - Add the `theme` flag to `projectSchema` in `src/lib/project.ts` and to `project.config.json` (`false`).
  - Set `data-project` in `src/app/layout.tsx` when the flag is on. Import `src/project/theme.css` in `src/app/globals.css` after the foundation.
  - Pass the flag and slug to client components as props, not through settings. `src/app/layout.tsx` reads `project.theme` and `project.slug` from `src/lib/project.ts`, which is already client-safe because `appearance.ts` imports it, and passes them to `StyleProvider`. `src/app/global-error.tsx` is a client component with its own `<html>` and no `StyleProvider`: it imports `project.ts` itself and sets `data-project` (and omits `data-style`) on that `<html>` directly. `data-project` takes the value of the slug. `src/lib/config/public.ts`, `src/lib/config/schema.ts` and the persisted base settings are not changed, so no stored settings row can override the project file.
  - Set `data-project` on the `<html>` in `src/app/global-error.tsx` as well, so the error page uses the project theme.
  - **With the flag on, omit `data-style`**, in `src/app/layout.tsx` (server) and `src/components/style-provider.tsx` (client). That way no Glass descendant rule or page-cover watcher applies under a project theme. With the flag off, nothing changes.
  - **Style ID lists (UG-018). Decision P-24:** move `designStyleSchema` into a new dependency-free `src/lib/design-styles.ts` (a direct import from `appearance.ts` into `project.ts` would create an import cycle, because `appearance.ts` already imports `project.ts`). `src/lib/appearance.ts`, `src/lib/project.ts` and `src/components/runs/admin-editors.tsx` then import the list from there, and `appearance.ts` re-exports `designStyleSchema`, so existing importers such as `src/lib/config/public.ts` keep working unchanged. Keep the copies in `scripts/deploy/config.py` and `deploy/contract.json`, with a comment naming the source, because they are deployment contracts outside the TypeScript build. While a project theme is on, the admin "Default style" editor is disabled with an explanation.
  - Hide the style selector in `src/components/style-preference.tsx`, the preferences page and `appearance-form.tsx` when a project theme is active.
  - Add `src/project/theme.css` and `public/fonts/` to `projectOwned` in `scripts/template-update.mjs`, so template updates keep the project's versions. The project initializer (`scripts/project-initializer.ts`) writes `theme.css` with the commented starter skeleton from the derived-project design guide (see below), and leaves `public/fonts/` empty.
  - Tests:
    - `tests/template-update.test.ts` and `tests/initializer.test.ts` for project ownership;
    - `tests/config.test.ts` for the flag;
    - `tests/design-system-extension.test.ts` for the guide, the skeleton and the fixture staying consistent;
    - `tests/integration/auth.test.mjs` for `data-project` rendered by the server, no `data-style` with the flag on, and the selector hidden.
  - Document it in `docs/architecture.md#project-extensions`, `docs/template.md`, and the "Switching and persistence" and "Extension point" sections of `docs/design-system.md`.
  - Document what a project's `theme.css` may contain, following Extending Unibase: type-role values through the `-size`, `-leading`, `-weight` and `-tracking` variables (decision 5), rules that target Unibase slots such as `[data-slot=card]` rather than generic element selectors, and project-prefixed variables for anything Unibase doesn't consume.

- **Type-role overrides.** Verify the decision 5 package change end to end: with the fixture project theme setting `--text-hero-size` and `--text-card-title-weight`, the computed styles change; without it, U4's values hold.
- **Fonts (DEF-02). Decision P-23.** Unibase keeps system fonts. For a derived project: `@font-face` rules in the project-owned `src/project/theme.css`, with the font files under the project-owned `public/fonts/`. They are served from `'self'`, so the CSP doesn't change, and template-owned files such as `layout.tsx` are never edited. The theme sets `--type-heading` and `--type-body` to the new families. (The alternative, a `src/project/fonts.ts` seam using `next/font/local`, is recorded as rejected: it would need a hook in the template-owned layout.)
  - Fonts from third-party hosts are blocked by `font-src 'self'`. The upgrade notes tell projects to self-host.
  - Add a fixture theme with an `@font-face` and both hooks, and assert in the browser checks that the computed font families change and no CSP violation occurs. Fixture themes (fonts and type roles) live under `tests/fixtures/project-theme/` and are applied only by the checks; the shipped `src/project/theme.css` keeps only its commented skeleton.
- **Project-specific tokens.** Following Extending Unibase, a project theme overrides only existing Unibase tokens, and puts any new token under its own `x-<id>` group, which its own code consumes. Unibase adds no consumers for project-specific tokens in this issue. If a derived project later needs a new **shared** token (for example a separate card or dialog radius), it is proposed to the design package as a new delta row and adopted through the normal route. Record this rule in `docs/design-system.md` ("Extension point") and in the upgrade notes.
- **Derived-project design guide** (new `docs/design-system-extension.md`). This is the one place a derived project's developers and agents learn how to define their own theme and extend Unibase's design. It is Unibase-owned and generic: it names no project, and template updates refresh it. Required contents:
  1. **Model.** Unibase owns the foundation, the shared components and the patterns; a project owns its theme, its additions and its product copy. Link the design package's [Extending Unibase](https://github.com/Uniwares-LTD/unitale-design/blob/493e13b83635280f74ce97784c25a64d6259ea36/docs/design-system/unibase/extending.md) as the design-side contract.
  2. **Turning on a project theme.**
     - Set `theme: true` in `project.config.json`.
     - What changes: `data-project="<slug>"` on `<html>`, `data-style` omitted, the style selector and admin default style disabled.
     - What stays: light, dark and system; the cookies.
     - How to turn it off.
  3. **Writing `src/project/theme.css`.**
     - Selectors `html[data-project="<slug>"]` and `html[data-project="<slug>"].dark`, loaded after the foundation.
     - Which existing Unibase tokens a project may override: the semantic colour pairs in both themes (always change a pair together), `--radius`, `--page-gap`, `--surface-blur`, `--type-heading` and `--type-body`, and the type-role `-size`, `-leading`, `-weight` and `-tracking` variables (decision 5).
     - A complete minimal example, kept identical to the initializer's skeleton and to the test fixture.
  4. **Fonts.** `@font-face` in `theme.css`, files in `public/fonts/`, served from `'self'`. Third-party font hosts are blocked by the CSP. Check licences before shipping.
  5. **Project-specific tokens.** A project keeps new tokens under its own `x-<id>` group, emitted as project-prefixed variables, and consumes them only in project-owned code. Unprefixed new tokens are not allowed.
  6. **Extending components and patterns.**
     - Compose Unibase primitives (`src/components/ui`, `page-patterns.tsx`, Field, `SubmitButton`, Notice, status badge, toast, leave guard, media fallback) in project-owned code registered through `src/project/extensions.ts`.
     - Never edit template-owned components or the vendored foundation: changes there are lost or conflict on template updates.
     - Use type roles and semantic tokens, not literal sizes or colours. Use logical RTL classes, typed catalogs and page-scoped dictionaries.
  7. **When the project needs something shared.** A new shared token, variant or component is proposed to the design package as a new delta row. It is adopted into Unibase through the normal route and released, and only then used by the project. Project-only needs stay in the project.
  8. **Verification for a project theme.**
     - Contrast of every overridden pair in both themes (the design package's contrast check, or an equivalent recorded measurement).
     - The browser checks from the local test loop, run under the project theme.
     - Keyboard, RTL and reduced motion.
     - No CSP violations.
  9. **Template updates.**
     - Which files the project owns: `theme.css`, `public/fonts/`, `project.config.json` and the others in `projectOwned`.
     - Run `npm run template:update -- <version>` and read the upgrade notes.
     - Re-check contrast after a foundation change.
  10. **Do and don't summary.** A short checklist for reviews.

  The guide is linked from:
  - `docs/design-system.md` ("Extension point", and a `src/project/theme.css` row in "Where to change things");
  - `docs/template.md` ("First steps in a new project", "Add a feature");
  - `docs/architecture.md#project-extensions`;
  - `docs/source-map.md` (the UI row).

- **Agent guidance for derived projects.**
  - Add a "Derived projects" section to the `build-ui` skill (SKL-01, regenerated through `handbook:sync`): read `docs/design-system-extension.md` first; theme only through `theme.css`; tokens under `x-<id>`; compose rather than edit shared components; propose shared needs to the design package.
  - Add one pointer to the guide in the adapter's "UI and browser verification" section.
  - Both are `configuration` changes and need explicit approval on the U6 PR. If SKL-01 was rejected, the same text goes into the guide's agent section.
- **Starter skeleton.** The initializer's `src/project/theme.css` contains the guide's minimal example as comments only, so it renders nothing until edited. It names the slug, the selectors, the overridable tokens and a link to the guide.
- **DEF-04, Lucide 1.75.0. Decision P-28:** bump `lucide-react` from 1.51.0 to exactly `1.75.0` (the package-verified candidate) in its own U6 commit, so it can be reverted alone. Check icon rendering in the showcase and on the U0 pages; any icon that changes shape is listed in the upgrade notes.
- **Hard-coded colours (P-26).** Replace the old Classic primary `#98492f` with the adopted `#c2410c` (COL-classic-light-primary). Keep `#fff9f3` and `#30221d`, because no colour row changes the Classic background or foreground. Document them as per-project values (see `docs/template.md`, "First steps"). The files:
  - `themeColor` in `src/app/layout.tsx`;
  - `src/app/manifest.ts`;
  - `scripts/i18n-assets.mjs`, which generates `public/offline.html` (regenerate it; never edit the HTML by hand);
  - `scripts/android-generate.ts` (TWA theme, navigation and background);
  - `scripts/generate-icons.mjs` (icon background);
  - `src/app/icon.svg` (fill and background);
  - the generated `public/icons/*.png`, regenerated with `npm.cmd run icons:generate`.
- **Template release (release gate).** `## Unreleased` already contains unrelated reusable changes, which ship in the same release. List them in the release notes too.
  - Make a minor bump (allowed before 1.0), and set `template.json`.
  - Upgrade notes for derived projects:
    - the deleted preset files;
    - the vendored foundation, which must not be edited;
    - the theme seam and `data-project`;
    - variable-backed type roles, and how a project overrides them;
    - self-hosted fonts and the CSP;
    - the toast CSP, if adopted;
    - the new `AGENTS.md` bullet, `build-ui` skill, `skills-lock.json` and `check-skills` changes merging into project guidance;
    - `manifest.ts` and the offline-page colours in `scripts/i18n-assets.mjs` being values projects set themselves.
  - Run `npm.cmd run check:template` and `test:initialized-projects`.
  - Merge, then tag `template-v<version>`.
- **Upgrade rehearsal (P-33).** `test:initialized-projects` builds new projects from the current source and never runs an upgrade, so rehearse the real one before the release gate. Nothing is published.
  1. In the Unibase clone, create a **local, unpushed** tag `template-v<version>` on the release-candidate commit.
  2. Write `rehearsal.manifest.json`: a copy of Unibase's `project.config.json` with `slug` `rehearsal-app` and `displayName` `Rehearsal`.
  3. Create the old project: `npm.cmd run project:create -- --revision <full commit of template-v0.4.0> --destination <temp>/rehearsal-app --manifest <temp>/rehearsal.manifest.json --mode application --image-owner Uniwares-LTD --upstream <path to this Unibase clone>`. Get the commit with `git rev-parse template-v0.4.0^{commit}`.
  4. In `<temp>/rehearsal-app`, run `npm.cmd ci`, then `npm.cmd run template:update -- <version>`.
  5. Then follow `docs/design-system-extension.md` to add a theme: colours, `@font-face` and one type role. Run `typecheck`, `build` and the browser checks under the project theme.
  6. Record conflicts and fix the upgrade notes until a fresh run of steps 3 to 5 passes. Then delete the local tag; the real tag is created only after the release gate.

- **Acceptance.**
  - The rehearsals succeed, or their conflicts are documented with instructions.
  - The seam, font and project-ownership tests pass.
  - `docs/design-system-extension.md` exists with all ten required parts, linked from the four documents above, and `check:docs` passes.
  - Following the guide exactly, a fresh initialized project gets a working theme. A rehearsal applies the guide's example theme, with colours, fonts and one type role changed, to a disposable project; the browser checks pass, with contrast measured and no CSP violation.
  - The `build-ui` skill's "Derived projects" section and the adapter pointer are approved and merged, or their rejection is recorded with the fallback.
  - #53 links the tag.
- **Next step (separate issue).** Derived projects update with `npm run template:update -- <version>` and add their theme through the seam; the Unitale UI implementation starts from this tag.

## Documentation and guidance

| Document                                                                   | Change                                                                                                                     | Checkpoint           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `unitale-design`: TYPE rows, spec §1 "Anatomy", package `CHANGELOG.md`     | variable-backed type roles and `em` letter-spacing                                                                         | P0                   |
| `docs/design-system.md`                                                    | DOC-01 §1, the "Where to change things" table, row by row as files change                                                  | U1, U2, U4           |
| `docs/design-system.md`                                                    | DOC-01 §2, typography roles                                                                                                | U4                   |
| `docs/design-system.md`                                                    | DOC-01 §3, interaction rules                                                                                               | U2                   |
| `docs/design-system.md`                                                    | DOC-01 §4, local test loop steps 9 onward                                                                                  | U2, U2-S             |
| `docs/design-system.md`                                                    | DOC-01 §5, adopted package version and deviations                                                                          | U5                   |
| `docs/design-system.md:10-13`, `:39` and `:88-90`                          | the palette descriptions, brand-values and add-a-preset rules                                                              | U4, U6               |
| `docs/design-system.md` local sections                                     | status badge, actionable Notice, touch tokens and rule (not in DOC-01)                                                     | U2                   |
| `docs/design-system.md` "Switching and persistence", "Extension point"     | the project theme seam, and a link to the extension guide                                                                  | U6                   |
| `docs/design-system-extension.md` (new)                                    | the derived-project design guide: theme, fonts, tokens, extending components, shared needs, verification, template updates | U6                   |
| `build-ui` skill "Derived projects" section; adapter pointer               | agent guidance for derived projects                                                                                        | U6                   |
| `docs/architecture.md:31-32` and `#project-extensions`                     | the preset files, typography owner and theme seam, with a link to the extension guide                                      | U4, U6               |
| `docs/template.md`                                                         | the theme seam, fonts and per-project colours, with links to the extension guide                                           | U6                   |
| `AGENTS.md`, `.agents/repository-adapter.md`, `docs/source-map.md`         | AGT-01                                                                                                                     | U5                   |
| `.agents/skills/build-ui/`, `.claude/skills/build-ui/`, `skills-lock.json` | SKL-01                                                                                                                     | U5                   |
| `CHANGELOG.md`                                                             | an `## Unreleased` entry per checkpoint, then the release                                                                  | every checkpoint, U6 |
| this plan                                                                  | "Verified progress and resume"                                                                                             | every checkpoint     |

## Test plan summary

Each row follows the [simplified remaining work](#simplified-remaining-work). Inspect the touched pages once per step.

| Step | Unit and browser checks                                                                                                      | Additional verification                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | One unit suite including the Sonner pin and CSP hash tests. One 38-check smoke run.                                          | Show a styled toast on the production build with no CSP error. If deferred, verify the rollout candidate.                                                            |
| R2   | One unit suite including the foundation tests. One 38-check smoke run.                                                       | Inspect the visible foundation changes during the touched-page visits.                                                                                               |
| R3   | The final gate supplies the unit suite and 38-check smoke run. New seam cases belong in `config` and `template-update` only. | Complete the final command list above, run `test:initialized-projects`, and rehearse one upgrade from `template-v0.4.0`. Stop at the issue owner's release-tag gate. |

## Verified progress and resume

- 2026-11-21: plan proposed on branch `task/53-adopt-design-system` from `main` `37aac48`. A separate read-only completeness audit against package `493e13b` found missing decisions, files, tests and readiness items; all of them are addressed above. A second audit of commit `43b6422` found six further gaps (type-role overrides, the full unconsumed-token list, the SKL-01 `names` edit, `icon.svg`, docs for the new helpers, and a toast behaviour test) plus smaller items; all are addressed in the next commit. No checkpoint started. Gates G1 to G12 open.
- 2026-11-21: scope narrowed to Unibase only; Unitale's own adoption and UI work is the next, separate issue. Third and fourth audits closed: project-theme `data-style`, public config, fonts, test method, SKL-01 order, style-list deduplication, gate timing (type roles and letter-spacing at G12), and project tokens kept under `x-<id>`. The fourth audit's remaining fixes are applied in this revision. Gates G1 to G12 open; no checkpoint started.
- 2026-11-21: added the derived-project design guide (`docs/design-system-extension.md`), its agent guidance, the starter skeleton and a docs-consistency test to U6.
- 2026-11-21: human gates simplified to a start gate, a release gate and one PR approval rule. Earlier entries name the former gates G1 to G12.
- 2026-11-21: decisions made for every open item (decision register P-01 to P-33); readiness review fixes applied (sibling label selectors, project flag via props, `design-styles.ts` against an import cycle, the offline-page generator and colour mapping, fixed order, PR counts, requirements and continuation rules).
- 2026-11-21: final readiness check passed after fixes: `global-error.tsx` sets `data-project` itself, `appearance.ts` re-exports `designStyleSchema`, the U2-S fallback is unconditional under the fixed order, and U3 compares against U0. The plan is ready for implementation; work starts when the start gate is met.
- 2026-11-21: unattended-readiness gaps closed: P0 checkpoint for the design-package change, local run and sign-in procedure, U3 form inventory (P-31), badge contrast method (P-32) and exact upgrade-rehearsal commands (P-33).
- 2026-11-21: final revision before implementation: P0 added to the test and docs tables; the start gate is placed after P0. Plan state: ready for implementation once the start gate is met.
- 2026-11-21: **P0 done.** Merged in `unitale-design` as `6d86be7bffc2c8aa0e506489bfc05f8cea05f623` (PR #13): type roles are variable-backed with Unibase fallbacks, generated letter-spacing is `em`, and generated project themes write each role under its Unibase key too (`field`). Package checks: tokens, contrast (102/102 and 26/26), adoption (143 rows), handoff (753 links), browser 71/71 with the compiled-Tailwind fixture. Two separate reviews; the second was clean. **Next: start gate (human)** — record `6d86be7` or later as the accepted revision with reviewer, maintenance owner and date; record the engineering handoff review on unitale-mockup#7; approve this plan. U0 starts after that.
- 2026-11-21: **start gate simplified and met.** The issue owner approved the plan and the package in session; accepted package revision `6d86be7`. The gate now needs only the issue owner's approval on #53. U0 starts.
- 2026-11-21: **U0 done.** 88 captures in `output/playwright/u0/` (local): 7 pages × 3 presets × 2 themes × 2 widths, plus Arabic home (rtl), Glass with reduced transparency and the not-found page. All 86 matrix pages returned 200 with the expected `data-style` and `dark`, and there were no console errors; admin pages were reached through the first-admin bootstrap. Deviation: `global-error` can't be captured without forcing a fault, so U0 records the not-found page's Classic fallback, and U4 verifies `global-error` separately. Environment: MongoDB under a VPN; the Auth Emulator with its UI disabled through `output/playwright/firebase.emulator-no-ui.json`. Script: `output/playwright/capture.mjs` (also on #53).
- 2026-11-21: **U1 done.** Touch target tokens (TCH-02, P-11) in `src/styles/tokens.css`, the design-guide file-table row and a changelog entry. Checks: typecheck, lint, test (98/98), `check:docs`, `check:i18n`, build. Visual: the U1 captures match U0 in 72 of 88; the 16 differences are capture noise (live Reports request log, the Next.js dev indicator, fade-in timing, a 2-pixel anti-alias row), and no code reads the new tokens. One separate review: merge-ready.
- 2026-11-21: **U2 implemented** on `task/53-u2-shared-helpers`: Field (`ui/field.tsx` from the shadcn registry; its description and error list already use `text-start` and `ms-4`, so no RTL correction was needed), `size="lg"` on Input, Textarea and SelectTrigger, `SubmitButton`, `LeaveGuardProvider`/`useLeaveGuard`/`useGuardedNavigation` wired into the layout, shell and account menu, `MediaFallback`/`ResultImage`, `StatusBadge`, the `Notice` action, RTL-01 to RTL-04, TCH-01 and TCH-03, ten English and Arabic strings (Arabic is the spec's draft, pending native review), the showcase section `helper-showcase.tsx`, the design-guide interaction rules and local sections, and a changelog entry. Pure logic lives in `src/lib/design-helpers.ts` with 14 tests (P-06). **P-15 applied:** the error badge measured 4.01:1 in Classic light, so the error tone uses the error Notice styling; all tones now measure at least 4.77:1 (`output/playwright/u2/badge-contrast.json`). Checks: typecheck, lint, test 112/112, `check:docs`, `check:i18n`, build; `format:check` shows only the 11 failures already on `main`. Browser: `output/playwright/u2-checks.mjs` 27/27 (Field, sizes, pending, media, badges, Notice action, every leave-guard outcome, Arabic centring and arrows at 1440 and 390, sheet close at the inline end, touch sizes, no unexpected 404s or console errors). Matrix against U0: only the showcase (new section) and the Arabic home (mirrored arrows) changed by design; the other differences are live Reports data, the dev indicator and one U0 capture taken before the Credits page finished loading.
- 2026-11-21: **plan simplified** at the issue owner's request: smoke tests only, no per-PR approval stops, remaining work in three steps (R1 toast and rollout, R2 foundation, R3 guidance, readiness and release), with the committed smoke script `smoke.mjs`. The release tag stays the one human step.
- 2026-11-21: **plan made lightweight**: per step only `npm test` and the browser smoke script; coding rules written down instead of rerunning lint, format and type checks; one final gate at the end of R3 runs and applies them. Deferred: Lucide bump, the guide's docs-consistency test, and the seam's initializer and integration tests.
- 2026-11-21: **U2 review applied.** A separate review found one blocker, now fixed: the coarse-pointer rules were unlayered and overrode larger Tailwind minimums on touch devices (lg fields fell to 44px). They now sit in `@layer components`, and a touch check asserts lg input at least 48px, lg textarea at least 96px and default textarea at least 64px. Also fixed: the leave guard handles each navigation once and ignores a save result after Keep editing; Save & exit uses `SubmitButton`; `beforeunload` sets `returnValue`; the Notice receipt region stays mounted; `ResultImage` resets when `src` changes. Checks: typecheck, lint, test 112/112; U2 browser checks 28/28; committed smoke script 38/38.
- 2026-11-21: **R1 candidate verified locally.** Shared form and media controls are applied across the four rollout areas. Existing-record editors use the leave guard, which tracks each mounted editor separately. Large private downloads keep native streaming. The scoped download Notice covers bounded browser downloads and local report exports. Unit tests passed (114/114 with Git 2.43 on PATH), the public browser smoke passed (38/38), and nine admin and six member routes returned 200 in local emulator sessions. Production build and start passed. With a signed-in local profile, Keep editing retained the draft, Discard and exit left the saved value unchanged, and Save and exit persisted the new value before navigation. A profile save showed a styled Sonner 2.0.8 toast with no additional CSP event. Chromium reported one Zod eval capability probe during sign-in, before the save. No CSP directive was relaxed for that probe. Separate same-agent review checked the candidate against the R1 inventory and verification evidence.
- 2026-11-21: **R2 verified locally.** The two generated stylesheets match the accepted design revision byte-for-byte below their source headers. The Glass effects and fallbacks are retained, the legacy palettes are removed, and toast timing and font now use foundation tokens. Checks: 117 unit tests, 38 browser smoke checks, the rendered EmptyState role (20px / 26px / 600), and the docs check. A separate same-agent review verified the vendor and local CSS diff.
- 2026-11-21: **R1 and R2 merged.** R1 landed in [#58](https://github.com/Uniwares-LTD/unibase/pull/58) at `894bd97` and R2 in [#59](https://github.com/Uniwares-LTD/unibase/pull/59) at `35dab7a`.
- 2026-11-21: **R3 verified and ready for the release gate.** The final gate passed 118 unit tests, 38 browser smoke checks, 14 Handbook tests, lint, typecheck, production build, and the docs, i18n, skills, template and Handbook checks. The nine format findings are on files unchanged since U2. Two fresh initialized projects built offline. A project initialized from template 0.4.0 upgraded to the 0.5.0 candidate while preserving its slug. Regenerating the localized offline page resolved the rehearsal's only merge conflict using the documented command. The production theme check passed at 1440 px in English light mode and 390 px in Arabic dark mode. Both rendered the 44 px hero role and loaded the same-origin font. Contrast was 10.36:1 and 8.15:1 respectively. Both had one blocked Zod eval probe, with no font or stylesheet CSP violations. A separate read-only review reconciled the delta ledger with the accepted design revision. Template 0.5.0 is prepared for the owner's release-tag decision.
