# Design-system adoption: delta ledger

Every Unibase delta from the design package, assigned to a checkpoint of the
[implementation plan](implementation-plan.md). Generated from the
[adoption baseline](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/baseline.md) at package revision `6d86be7`
by parsing every row of its delta and colour tables (decision rows D-01 to D-13 excluded).
Keep it identical to the baseline: if the accepted package revision differs, compare that
revision's baseline row by row (ID, files, change, status, risk and approval), update the rows
here, assign any new row a checkpoint, and review the difference on #53 before continuing.

143 rows: 99 colour rows and 44 others. Nothing is left unassigned.

The Status column copies the baseline. Where it still reads as open, the [implementation plan](implementation-plan.md) resolves it: TST-02 "blocked pending decision" by the U2-S security review, BDG-01's file "to confirm at adoption" by P-14, and DEF-04's "optional" bump by P-28.

| Checkpoint | Rows |
| --- | --- |
| Consuming feature (not this issue) | 2 |
| Derived project (not this issue) | 1 |
| U1 + with each row | 1 |
| U1 | 1 |
| U2, rolled out at U3 | 2 |
| U2 | 8 |
| U2-S (security approval) | 2 |
| U2; U3 only where real saving or Discard | 1 |
| U2; call sites at U3 | 1 |
| U2; existing screens only with explicit approval (U3) | 1 |
| U4 check, U5 confirm | 5 |
| U4 | 113 |
| U5 (configuration approval; moved from U1) | 2 |
| U6 (P-19 to P-23) | 2 |
| U6 (P-28) | 1 |

## Foundations, compositions, fixes, documentation and deferrals

| ID | Subject | Unibase files | Change | Status | Risk | Approval | Decision | Spec | Checkpoint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TOK-01 | Body font hook | `src/styles/design-system/unibase.css` (vendored), `src/app/globals.css` | `--type-body` holds the same stack; `--font-sans: var(--type-body)` | adopt | none | with normal review | PLAN §4 | [typography](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/foundations/typography.md#documentation-only-adaptation) | U4 |
| TOK-02 | Toast duration token | `src/styles/design-system/unibase.css` (vendored) | `--toast-confirmation-duration: 6000ms` | adopt | none | with normal review | PLAN §4 | [toast](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#4-toast) | U4 |
| TYPE-01 | Type role `display` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-display: var(--text-display-size, 3rem)` (variable-backed; same for leading, weight and tracking), line-height 1.12, weight 600, tracking 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-02 | Type role `hero` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-hero: var(--text-hero-size, 2.5rem)` (variable-backed; same for leading, weight and tracking), 1.15, 600, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-03 | Type role `page-title` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-page-title: var(--text-page-title-size, 2.25rem)` (variable-backed; same for leading, weight and tracking), 1.2, 600, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-04 | Type role `dialog-title` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-dialog-title: var(--text-dialog-title-size, 2rem)` (variable-backed; same for leading, weight and tracking), 1.2, 600, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-05 | Type role `section-title` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-section-title: var(--text-section-title-size, 1.5rem)` (variable-backed; same for leading, weight and tracking), 1.25, 600, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-06 | Type role `card-title` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-card-title: var(--text-card-title-size, 1.25rem)` (variable-backed; same for leading, weight and tracking), 1.3, 600, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-07 | Type role `reading` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-reading: var(--text-reading-size, 1.125rem)` (variable-backed; same for leading, weight and tracking), 1.75, 400, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-08 | Type role `input` (key `field`) | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-field: var(--text-field-size, 1rem)` (variable-backed; same for leading, weight and tracking), 1.5, 400, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-09 | Type role `body` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-body: var(--text-body-size, 0.875rem)` (variable-backed; same for leading, weight and tracking), 1.6, 400, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-10 | Type role `supporting` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-supporting: var(--text-supporting-size, 0.8125rem)` (variable-backed; same for leading, weight and tracking), 1.7, 400, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-11 | Type role `label` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-label: var(--text-label-size, 0.75rem)` (variable-backed; same for leading, weight and tracking), 1.5, 400, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| TYPE-12 | Type role `caption` | `src/styles/design-system/tailwind-theme.css` (vendored) | `--text-caption: var(--text-caption-size, 0.6875rem)` (variable-backed; same for leading, weight and tracking), 1.6, 400, 0em | adopt | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 |
| FLD-01 | Field composition | new `src/components/ui/field.tsx` (shadcn `field`) | Registry Field with ID wiring and two RTL corrections | adopt | low | with normal review | D-11 | [Field](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#2-field-composition) | U2, rolled out at U3 |
| FLD-02 | Field size `lg` | `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx` | opt-in `size="lg"`; default unchanged | adopt | low | with normal review | D-06 | [field size](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#3-field-size) | U2; existing screens only with explicit approval (U3) |
| TST-01 | Toast component | new `src/components/ui/sonner.tsx`, `src/components/toast.tsx`, `src/app/layout.tsx`, `package.json` (`sonner@2.0.8`) | Sonner Toaster with Unibase tokens and the confirmation timer wrapper | adopt | security | explicit approval before merge | D-02 | [toast](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#4-toast) | U2-S (security approval) |
| TST-02 | CSP for Sonner styles | `src/proxy.ts` | adds `'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='` (`sonner@2.0.8` stylesheet) and `'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='` (empty block) | blocked pending decision | security | explicit approval before merge | D-08 | [toast CSP](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#csp-proposal) | U2-S (security approval) |
| PND-01 | Pending submit | `src/components/page-patterns.tsx` | one composition: label kept, `disabled`, `aria-busy`, optional loader | adopt | low | with normal review | PRD U05 | [pending submit](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#5-pending-submit) | U2, rolled out at U3 |
| LVG-01 | Leave guard | new `src/components/leave-guard.tsx`; `src/app/layout.tsx` (provider); `src/components/app-shell.tsx` and `src/components/account-menu-controls.tsx` (guarded links) | hook, `<Link onNavigate>` guard, navigation helper, `beforeunload` while dirty | adopt | low | with normal review | D-10 | [leave guard](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#6-leave-guard) | U2; U3 only where real saving or Discard |
| MED-01 | Missing-media fallback | new `src/components/media-fallback.tsx`; three `next/image` and three download call sites at U3 | shared fallback for absent or failed images | adopt | low | with normal review | PRD U05 | [media](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#8-missing-media-and-downloads) | U2; call sites at U3 |
| RTL-01 | Dialog centring | `src/components/ui/dialog.tsx`; remove patches in `src/components/diagnostic-access.tsx`, `src/components/runs/workflow-version-picker.tsx` | `left-1/2 -translate-x-1/2` | adopt | low | with normal review | PRD U07 | [RTL fixes](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U2 |
| RTL-02 | AlertDialog centring | `src/components/ui/alert-dialog.tsx` | `left-1/2 -translate-x-1/2` | adopt | low | with normal review | PRD U07 | [RTL fixes](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U2 |
| RTL-03 | Sheet close button | `src/components/ui/sheet.tsx` | `end-3` | adopt | low | with normal review | PRD U07 | [RTL fixes](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U2 |
| RTL-04 | Directional arrows | `src/app/page.tsx`, `src/app/not-found.tsx` | `className="rtl:rotate-180"` (existing admin convention) | adopt | low | with normal review | PRD U07 | [RTL fixes](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U2 |
| TCH-01 | Coarse-pointer targets | `src/app/globals.css` | adds textarea; the label beside a checkbox or radio in a horizontal `Field` is 44px tall | adopt | low | with normal review | PRD U07 | [touch](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U2 |
| TCH-02 | Touch size scale as tokens | `src/styles/tokens.css` | `--control-touch-sm: 2.75rem`, `--control-touch-md: 3.25rem`, `--control-touch-lg: 3.75rem`; nothing consumes them until TCH-03 | adopt | none | with normal review | PRD U07 | [touch](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U1 |
| TCH-03 | Touch rule for icon buttons and choices | `src/app/globals.css` (`@media (pointer: coarse)` rule) | icon buttons at least `--control-touch-sm` wide; choices (selectable options and the label beside a checkbox or radio) at least `--control-touch-sm` high | adopt | low | with normal review | PRD U07 | [touch](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#7-rtl-and-touch-fixes) | U2 |
| BDG-01 | Status badge with icon and tone | `src/components/ui/badge.tsx` or a composition beside it (to confirm at adoption) | opt-in status badge: decorative Lucide icon, text, tone neutral, info, warning, success or error from the existing semantic pairs | adopt | low | with normal review | PRD U07 | [status badge](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#10-status-badge-with-icon-and-tone) | U2 |
| NTC-01 | Notice with an action | `src/components/page-patterns.tsx` (`Notice`) | opt-in action with available, pending, success and failed states and a status receipt | adopt | low | with normal review | PRD U05 | [notice action](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#11-notice-with-an-action) | U2 |
| DOC-01 | Design-system documentation | `docs/design-system.md` | proposed sections applied with the rows they describe | adopt | none | with normal review | D-04 | [documentation proposal](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/proposals/unibase-design-system.md) | U1 + with each row |
| AGT-01 | Agent-guidance text | `AGENTS.md`, `.agents/repository-adapter.md`, `docs/source-map.md` | one bullet, two adapter additions, one source-map row | adopt | configuration | explicit approval before merge | D-04 | [agent-guidance proposal](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/proposals/unibase-agent-guidance.md) | U5 (configuration approval; moved from U1) |
| SKL-01 | Local `build-ui` skill | new `.agents/skills/build-ui/SKILL.md` and `.claude/skills/build-ui/SKILL.md`; `scripts/check-skills.mjs` (`names`); `skills-lock.json` | adds one local skill to the approved set; fallback: the same text as a document | adopt | configuration | explicit approval before merge | D-04 | [installing the skill](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/proposals/unibase-agent-guidance.md#4-installing-the-skill) | U5 (configuration approval; moved from U1) |
| KEEP-01 | Button API | `src/components/ui/button.tsx` | unchanged; `--ub-button-*` not adopted | retain | none | with normal review | D-09 | [Button](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/components/buttons.md) | U4 check, U5 confirm |
| KEEP-02 | Spacing, radius, surfaces | `src/styles/tokens.css`, presets, `globals.css` | unchanged | retain | none | with normal review | PLAN §4 | [geometry](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/foundations/spacing-surfaces.md) | U4 check, U5 confirm |
| KEEP-03 | Notice, EmptyState, PageHeader | `src/components/page-patterns.tsx` | unchanged, except the EmptyState title, which takes the `card-title` role in the U4 [consumer mapping](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#foundation-migration) | retain | none | with normal review | PLAN §4 | [surfaces](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/components/surfaces-navigation.md) | U4 check, U5 confirm |
| KEEP-04 | Appearance persistence | `src/lib/appearance.ts`, providers | unchanged | retain | none | with normal review | PLAN §4 | [colors](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/foundations/colors.md) | U4 check, U5 confirm |
| KEEP-05 | Existing text consumers | feature components | unchanged by the package; the named consumer migration is reviewed at U4 | retain | none | with normal review | D-05 | [type roles](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/implementation-specs.md#1-type-roles) | U4 check, U5 confirm |
| DEF-01 | Unitale reference preset | — | not proposed for Unibase | deferred | none | with normal review | D-07 | [appearance](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/components/appearance.md) | Derived project (not this issue) |
| DEF-02 | Brand fonts | — | not proposed; `font-src 'self'` would need self-hosting | deferred | none | with normal review | D-07 | [typography](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/foundations/typography.md) | U6 (P-19 to P-23) |
| DEF-03 | Downstream style seam | `src/lib/appearance.ts`, `src/lib/project.ts` | not designed | deferred | none | with normal review | D-07 | [UG-018](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/adoption/known-gaps.md#ug-018) | U6 (P-19 to P-23) |
| DEF-04 | Lucide 1.75.0 | `package.json` | optional separate bump | deferred | none | with normal review | D-12 | [icons](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/foundations/icons.md) | U6 (P-28) |
| DEF-05 | Service-dependent recovery | feature code | stays with the consuming feature | deferred | none | with normal review | PLAN §4 | [loading](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/patterns/loading.md) | Consuming feature (not this issue) |
| DEF-06 | Owned history | feature code | stays with the consuming feature | deferred | none | with normal review | PLAN §4 | [results](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/guides/patterns/results-access.md) | Consuming feature (not this issue) |

## Colour rows

All 99 rows are `visible` risk, need explicit approval before merge, and ship together at U4
through the vendored foundation. "Adjusted" rows moved along their hue ramp to pass contrast (D-03).
The preset files named in the source column are deleted at U4; their values come from the foundation.

| ID | Source file at pin | Current | Adopted | Preset, theme | Status |
| --- | --- | --- | --- | --- | --- |
| COL-classic-light-accent | `src/styles/presets/classic.css` | `oklch(0.97 0 0) (#f5f5f5)` | `oklch(0.9015 0.0729 70.7) (#fed7aa)` | classic, light | adopt |
| COL-classic-light-accent-foreground | `src/styles/presets/classic.css` | `oklch(0.205 0 0) (#171717)` | `oklch(0.4084 0.1165 38.17) (#7c2d12)` | classic, light | adopt |
| COL-classic-light-destructive | `src/styles/presets/classic.css` | `oklch(0.577 0.245 27.325) (#e7000b)` | `oklch(0.5054 0.1905 27.52) (#b91c1c)` | classic, light | adopt |
| COL-classic-light-info | `src/styles/presets/classic.css` | `#edf3fc` | `oklch(0.9514 0.025 236.82) (#e0f2fe)` | classic, light | adopt |
| COL-classic-light-info-foreground | `src/styles/presets/classic.css` | `#254c7c` | `oklch(0.5 0.1193 242.75) (#0369a1)` | classic, light | adopt |
| COL-classic-light-primary | `src/styles/presets/classic.css` | `oklch(0.48 0.11 38) (#90442c)` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | classic, light | adopt |
| COL-classic-light-primary-foreground | `src/styles/presets/classic.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(1 0 0) (#ffffff)` | classic, light | adopt |
| COL-classic-light-ring | `src/styles/presets/classic.css` | `oklch(0.55 0.1 38) (#a35b45)` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | classic, light | adopt |
| COL-classic-light-secondary | `src/styles/presets/classic.css` | `oklch(0.955 0.018 65) (#f9eee4)` | `oklch(0.9542 0.0372 75.16) (#ffedd5)` | classic, light | adopt |
| COL-classic-light-secondary-foreground | `src/styles/presets/classic.css` | `oklch(0.205 0 0) (#171717)` | `oklch(0.4084 0.1165 38.17) (#7c2d12)` | classic, light | adopt |
| COL-classic-light-sidebar-accent | `src/styles/presets/classic.css` | `oklch(0.935 0.025 55) (#f8e6da)` | `oklch(0.9542 0.0372 75.16) (#ffedd5)` | classic, light | adopt |
| COL-classic-light-sidebar-accent-foreground | `src/styles/presets/classic.css` | `oklch(0.4 0.09 38) (#6f3421)` | `oklch(0.4084 0.1165 38.17) (#7c2d12)` | classic, light | adopt |
| COL-classic-light-sidebar-primary | `src/styles/presets/classic.css` | `oklch(0.205 0 0) (#171717)` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | classic, light | adopt |
| COL-classic-light-sidebar-primary-foreground | `src/styles/presets/classic.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(1 0 0) (#ffffff)` | classic, light | adopt |
| COL-classic-light-sidebar-ring | `src/styles/presets/classic.css` | `oklch(0.708 0 0) (#a1a1a1)` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | classic, light | adopt |
| COL-classic-light-success | `src/styles/presets/classic.css` | `#edf7f0` | `oklch(0.9505 0.0507 163.05) (#d1fae5)` | classic, light | adopt |
| COL-classic-light-success-foreground | `src/styles/presets/classic.css` | `#1d5735` | `oklch(0.5081 0.1049 165.61) (#047857)` | classic, light | adopt |
| COL-classic-light-warning | `src/styles/presets/classic.css` | `#fff4dd` | `oklch(0.9796 0.0158 73.68) (#fff7ed)` | classic, light | adopt |
| COL-classic-light-warning-foreground | `src/styles/presets/classic.css` | `#754500` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | classic, light | adopt |
| COL-classic-dark-accent | `src/styles/presets/classic.css` | `oklch(0.269 0 0) (#262626)` | `oklch(0.4698 0.143 37.3) (#9a3412)` | classic, dark | adopt |
| COL-classic-dark-accent-foreground | `src/styles/presets/classic.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(0.9796 0.0158 73.68) (#fff7ed)` | classic, dark | adopt |
| COL-classic-dark-destructive | `src/styles/presets/classic.css` | `oklch(0.704 0.191 22.216) (#ff6467)` | `oklch(0.7106 0.1661 22.22) (#f87171)` | classic, dark | adopt |
| COL-classic-dark-info | `src/styles/presets/classic.css` | `#1b2d45` | `oklch(0.2935 0.0632 243.16) (#082f49)` | classic, dark | adopt |
| COL-classic-dark-info-foreground | `src/styles/presets/classic.css` | `#b9d4fa` | `oklch(0.7535 0.139 232.66) (#38bdf8)` | classic, dark | adopt |
| COL-classic-dark-primary | `src/styles/presets/classic.css` | `oklch(0.78 0.09 48) (#e7a685)` | `oklch(0.7576 0.159 55.93) (#fb923c)` | classic, dark | adopt |
| COL-classic-dark-primary-foreground | `src/styles/presets/classic.css` | `oklch(0.205 0 0) (#171717)` | `oklch(0.2659 0.0762 36.26) (#431407)` | classic, dark | adopt |
| COL-classic-dark-ring | `src/styles/presets/classic.css` | `oklch(0.78 0.09 48) (#e7a685)` | `oklch(0.7576 0.159 55.93) (#fb923c)` | classic, dark | adopt |
| COL-classic-dark-secondary | `src/styles/presets/classic.css` | `oklch(0.27 0.02 55) (#2e241d)` | `oklch(0.4084 0.1165 38.17) (#7c2d12)` | classic, dark | adopt |
| COL-classic-dark-secondary-foreground | `src/styles/presets/classic.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(0.9542 0.0372 75.16) (#ffedd5)` | classic, dark | adopt |
| COL-classic-dark-sidebar-accent | `src/styles/presets/classic.css` | `oklch(0.29 0.03 48) (#38271e)` | `oklch(0.4084 0.1165 38.17) (#7c2d12)` | classic, dark | adopt |
| COL-classic-dark-sidebar-accent-foreground | `src/styles/presets/classic.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(0.9542 0.0372 75.16) (#ffedd5)` | classic, dark | adopt |
| COL-classic-dark-sidebar-primary | `src/styles/presets/classic.css` | `oklch(0.78 0.09 48) (#e7a685)` | `oklch(0.7576 0.159 55.93) (#fb923c)` | classic, dark | adopt |
| COL-classic-dark-sidebar-primary-foreground | `src/styles/presets/classic.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(0.2659 0.0762 36.26) (#431407)` | classic, dark | adopt |
| COL-classic-dark-sidebar-ring | `src/styles/presets/classic.css` | `oklch(0.556 0 0) (#737373)` | `oklch(0.7576 0.159 55.93) (#fb923c)` | classic, dark | adopt |
| COL-classic-dark-success | `src/styles/presets/classic.css` | `#183326` | `oklch(0.2621 0.0487 172.55) (#022c22)` | classic, dark | adopt |
| COL-classic-dark-success-foreground | `src/styles/presets/classic.css` | `#acdfbd` | `oklch(0.7729 0.1535 163.22) (#34d399)` | classic, dark | adopt |
| COL-classic-dark-warning | `src/styles/presets/classic.css` | `#392b17` | `oklch(0.2659 0.0762 36.26) (#431407)` | classic, dark | adopt |
| COL-classic-dark-warning-foreground | `src/styles/presets/classic.css` | `#f6d494` | `oklch(0.7576 0.159 55.93) (#fb923c)` | classic, dark | adopt |
| COL-glass-light-destructive | `src/styles/presets/glass.css` | `#7a1812` | `oklch(0.5054 0.1905 27.52) (#b91c1c)` | glass, light | adopt |
| COL-glass-light-info | `src/styles/presets/glass.css` | `#edf3fc` | `oklch(0.9514 0.025 236.82) (#e0f2fe)` | glass, light | adopt |
| COL-glass-light-info-foreground | `src/styles/presets/glass.css` | `#254c7c` | `oklch(0.5 0.1193 242.75) (#0369a1)` | glass, light | adopt |
| COL-glass-light-primary | `src/styles/presets/glass.css` | `#173f33` | `oklch(0.4318 0.0865 166.91) (#065f46)` | glass, light | adopt (adjusted) |
| COL-glass-light-ring | `src/styles/presets/glass.css` | `#173f33` | `oklch(0.4318 0.0865 166.91) (#065f46)` | glass, light | adopt (adjusted) |
| COL-glass-light-sidebar-primary | `src/styles/presets/glass.css` | `oklch(0.205 0 0) (#171717)` | `oklch(0.4318 0.0865 166.91) (#065f46)` | glass, light | adopt (adjusted) |
| COL-glass-light-sidebar-primary-foreground | `src/styles/presets/glass.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(1 0 0) (#ffffff)` | glass, light | adopt |
| COL-glass-light-sidebar-ring | `src/styles/presets/glass.css` | `#173f33` | `oklch(0.4318 0.0865 166.91) (#065f46)` | glass, light | adopt (adjusted) |
| COL-glass-light-success | `src/styles/presets/glass.css` | `#edf7f0` | `oklch(0.9505 0.0507 163.05) (#d1fae5)` | glass, light | adopt |
| COL-glass-light-success-foreground | `src/styles/presets/glass.css` | `#1d5735` | `oklch(0.5081 0.1049 165.61) (#047857)` | glass, light | adopt |
| COL-glass-light-warning | `src/styles/presets/glass.css` | `#fff4dd` | `oklch(0.9796 0.0158 73.68) (#fff7ed)` | glass, light | adopt |
| COL-glass-light-warning-foreground | `src/styles/presets/glass.css` | `#754500` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | glass, light | adopt |
| COL-glass-dark-destructive | `src/styles/presets/glass.css` | `#ffe0db` | `oklch(0.8077 0.1035 19.57) (#fca5a5)` | glass, dark | adopt (adjusted) |
| COL-glass-dark-info | `src/styles/presets/glass.css` | `#1b2d45` | `oklch(0.2935 0.0632 243.16) (#082f49)` | glass, dark | adopt |
| COL-glass-dark-info-foreground | `src/styles/presets/glass.css` | `#b9d4fa` | `oklch(0.7535 0.139 232.66) (#38bdf8)` | glass, dark | adopt |
| COL-glass-dark-primary | `src/styles/presets/glass.css` | `#d0f4e1` | `oklch(0.7729 0.1535 163.22) (#34d399)` | glass, dark | adopt |
| COL-glass-dark-primary-foreground | `src/styles/presets/glass.css` | `#142622` | `oklch(0.2621 0.0487 172.55) (#022c22)` | glass, dark | adopt |
| COL-glass-dark-ring | `src/styles/presets/glass.css` | `#d0f4e1` | `oklch(0.7729 0.1535 163.22) (#34d399)` | glass, dark | adopt |
| COL-glass-dark-sidebar-primary | `src/styles/presets/glass.css` | `oklch(0.78 0.09 48) (#e7a685)` | `oklch(0.7729 0.1535 163.22) (#34d399)` | glass, dark | adopt |
| COL-glass-dark-sidebar-primary-foreground | `src/styles/presets/glass.css` | `oklch(0.985 0 0) (#fafafa)` | `oklch(0.2621 0.0487 172.55) (#022c22)` | glass, dark | adopt |
| COL-glass-dark-sidebar-ring | `src/styles/presets/glass.css` | `#d0f4e1` | `oklch(0.7729 0.1535 163.22) (#34d399)` | glass, dark | adopt |
| COL-glass-dark-success | `src/styles/presets/glass.css` | `#183326` | `oklch(0.2621 0.0487 172.55) (#022c22)` | glass, dark | adopt |
| COL-glass-dark-success-foreground | `src/styles/presets/glass.css` | `#acdfbd` | `oklch(0.7729 0.1535 163.22) (#34d399)` | glass, dark | adopt |
| COL-glass-dark-warning | `src/styles/presets/glass.css` | `#392b17` | `oklch(0.2659 0.0762 36.26) (#431407)` | glass, dark | adopt |
| COL-glass-dark-warning-foreground | `src/styles/presets/glass.css` | `#f6d494` | `oklch(0.7576 0.159 55.93) (#fb923c)` | glass, dark | adopt |
| COL-soft-blue-light-accent | `src/styles/presets/soft-blue.css` | `#dce3ff` | `oklch(0.8823 0.0571 254.13) (#bfdbfe)` | soft-blue, light | adopt |
| COL-soft-blue-light-accent-foreground | `src/styles/presets/soft-blue.css` | `#253777` | `oklch(0.3791 0.1378 265.52) (#1e3a8a)` | soft-blue, light | adopt |
| COL-soft-blue-light-destructive | `src/styles/presets/soft-blue.css` | `#b42318` | `oklch(0.5054 0.1905 27.52) (#b91c1c)` | soft-blue, light | adopt |
| COL-soft-blue-light-info | `src/styles/presets/soft-blue.css` | `#edf3fc` | `oklch(0.9514 0.025 236.82) (#e0f2fe)` | soft-blue, light | adopt |
| COL-soft-blue-light-info-foreground | `src/styles/presets/soft-blue.css` | `#254c7c` | `oklch(0.5 0.1193 242.75) (#0369a1)` | soft-blue, light | adopt |
| COL-soft-blue-light-primary | `src/styles/presets/soft-blue.css` | `#2d55e7` | `oklch(0.4882 0.2172 264.38) (#1d4ed8)` | soft-blue, light | adopt |
| COL-soft-blue-light-ring | `src/styles/presets/soft-blue.css` | `#2d55e7` | `oklch(0.4882 0.2172 264.38) (#1d4ed8)` | soft-blue, light | adopt |
| COL-soft-blue-light-secondary | `src/styles/presets/soft-blue.css` | `#dfe5ff` | `oklch(0.9319 0.0316 255.59) (#dbeafe)` | soft-blue, light | adopt |
| COL-soft-blue-light-secondary-foreground | `src/styles/presets/soft-blue.css` | `#253777` | `oklch(0.3791 0.1378 265.52) (#1e3a8a)` | soft-blue, light | adopt |
| COL-soft-blue-light-sidebar-accent | `src/styles/presets/soft-blue.css` | `#dce3ff` | `oklch(0.9319 0.0316 255.59) (#dbeafe)` | soft-blue, light | adopt |
| COL-soft-blue-light-sidebar-accent-foreground | `src/styles/presets/soft-blue.css` | `#253777` | `oklch(0.3791 0.1378 265.52) (#1e3a8a)` | soft-blue, light | adopt |
| COL-soft-blue-light-sidebar-primary | `src/styles/presets/soft-blue.css` | `#2d55e7` | `oklch(0.4882 0.2172 264.38) (#1d4ed8)` | soft-blue, light | adopt |
| COL-soft-blue-light-sidebar-ring | `src/styles/presets/soft-blue.css` | `#2d55e7` | `oklch(0.4882 0.2172 264.38) (#1d4ed8)` | soft-blue, light | adopt |
| COL-soft-blue-light-success | `src/styles/presets/soft-blue.css` | `#edf7f0` | `oklch(0.9505 0.0507 163.05) (#d1fae5)` | soft-blue, light | adopt |
| COL-soft-blue-light-success-foreground | `src/styles/presets/soft-blue.css` | `#1d5735` | `oklch(0.5081 0.1049 165.61) (#047857)` | soft-blue, light | adopt |
| COL-soft-blue-light-warning | `src/styles/presets/soft-blue.css` | `#fff4dd` | `oklch(0.9796 0.0158 73.68) (#fff7ed)` | soft-blue, light | adopt |
| COL-soft-blue-light-warning-foreground | `src/styles/presets/soft-blue.css` | `#754500` | `oklch(0.5534 0.1739 38.4) (#c2410c)` | soft-blue, light | adopt |
| COL-soft-blue-dark-accent | `src/styles/presets/soft-blue.css` | `#354575` | `oklch(0.4244 0.1809 265.64) (#1e40af)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-accent-foreground | `src/styles/presets/soft-blue.css` | `#f1f4ff` | `oklch(0.9705 0.0142 254.6) (#eff6ff)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-destructive | `src/styles/presets/soft-blue.css` | `#ffb4ab` | `oklch(0.7106 0.1661 22.22) (#f87171)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-info | `src/styles/presets/soft-blue.css` | `#1b2d45` | `oklch(0.2935 0.0632 243.16) (#082f49)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-info-foreground | `src/styles/presets/soft-blue.css` | `#b9d4fa` | `oklch(0.7535 0.139 232.66) (#38bdf8)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-primary | `src/styles/presets/soft-blue.css` | `#b2c2ff` | `oklch(0.7137 0.1434 254.62) (#60a5fa)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-primary-foreground | `src/styles/presets/soft-blue.css` | `#17244b` | `oklch(0.2823 0.0874 267.94) (#172554)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-ring | `src/styles/presets/soft-blue.css` | `#b2c2ff` | `oklch(0.7137 0.1434 254.62) (#60a5fa)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-secondary | `src/styles/presets/soft-blue.css` | `#303d68` | `oklch(0.3791 0.1378 265.52) (#1e3a8a)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-secondary-foreground | `src/styles/presets/soft-blue.css` | `#e1e7ff` | `oklch(0.9319 0.0316 255.59) (#dbeafe)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-sidebar-accent | `src/styles/presets/soft-blue.css` | `#354575` | `oklch(0.3791 0.1378 265.52) (#1e3a8a)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-sidebar-accent-foreground | `src/styles/presets/soft-blue.css` | `#f1f4ff` | `oklch(0.9319 0.0316 255.59) (#dbeafe)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-sidebar-primary | `src/styles/presets/soft-blue.css` | `#b2c2ff` | `oklch(0.7137 0.1434 254.62) (#60a5fa)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-sidebar-primary-foreground | `src/styles/presets/soft-blue.css` | `#17244b` | `oklch(0.2823 0.0874 267.94) (#172554)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-sidebar-ring | `src/styles/presets/soft-blue.css` | `#b2c2ff` | `oklch(0.7137 0.1434 254.62) (#60a5fa)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-success | `src/styles/presets/soft-blue.css` | `#183326` | `oklch(0.2621 0.0487 172.55) (#022c22)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-success-foreground | `src/styles/presets/soft-blue.css` | `#acdfbd` | `oklch(0.7729 0.1535 163.22) (#34d399)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-warning | `src/styles/presets/soft-blue.css` | `#392b17` | `oklch(0.2659 0.0762 36.26) (#431407)` | soft-blue, dark | adopt |
| COL-soft-blue-dark-warning-foreground | `src/styles/presets/soft-blue.css` | `#f6d494` | `oklch(0.7576 0.159 55.93) (#fb923c)` | soft-blue, dark | adopt |
