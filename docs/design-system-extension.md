# Extend the Unibase design in a derived project

## Purpose

Use this guide when your project needs its own visual identity or new UI.
Unibase owns the generated foundation, shared primitives and interaction
patterns. The project owns its theme, additions and product copy. See the
[design package contract](https://github.com/Uniwares-LTD/unitale-design/blob/6d86be7bffc2c8aa0e506489bfc05f8cea05f623/docs/design-system/unibase/extending.md)
and the [Unibase design system](design-system.md).

## Prerequisites

Know the slug in `project.config.json` and the paired foreground and
background colours for both themes. Confirm the licence for any font you ship.

## Steps

1. Set `"theme": true` in `project.config.json`. The document uses
   `data-project="<slug>"` and omits `data-style`. Public preset controls
   are hidden and the admin default-style field is disabled. Light, dark and
   system still work. Set `theme` to `false` to restore the saved preset and cookie.
2. Edit `src/project/theme.css`. It loads after the generated foundation and
   Glass effects. Use the selectors below, replacing `project-slug` with your
   slug. Override semantic colour pairs together in both themes. Other hooks
   include `--radius`, `--page-gap`, `--surface-blur`, `--type-heading` and
   `--type-body`. Override a type role through its `-size`, `-leading`,
   `-weight` and `-tracking` variables.

   ```css
   html[data-project="project-slug"] {
     --primary: #1e3a8a;
     --primary-foreground: #ffffff;
     --text-hero-size: 2.75rem;
   }

   html[data-project="project-slug"].dark {
     --primary: #93c5fd;
     --primary-foreground: #172554;
   }
   ```

3. To use a custom font, save the licensed file under `public/fonts/`, declare
   it with `@font-face` in `theme.css`, and set the heading or body font hook
   in your project selector. For example, with `project-sans.woff2` in the
   font directory:

   ```css
   @font-face {
     font-family: "Project Sans";
     src: url("/fonts/project-sans.woff2") format("woff2");
     font-display: swap;
   }

   html[data-project="project-slug"] {
     --type-heading: "Project Sans", system-ui, sans-serif;
     --type-body: "Project Sans", system-ui, sans-serif;
   }
   ```

   The font policy allows files from the app's origin. Keep files on that origin.

4. Prefix new variables with `--x-<slug>-` and consume them in project
   components. Use the existing Unibase variable names when overriding
   an existing role or semantic pair.
5. Compose the shared Field, SubmitButton, Notice, status badge, toast,
   leave guard, media fallback and primitives in project-owned components.
   Register features through `src/project/extensions.ts`. Style existing
   slots such as `[data-slot="card"]` within the project selector. Use
   logical RTL classes, semantic utility classes and page-scoped typed catalogs.
6. Propose new shared tokens, variants or components in the design package.
   Use them in the project after they have been adopted into Unibase and released.

## Verify

- Measure contrast for every overridden pair in light and dark.
- Follow the [local browser loop](design-system.md#local-test-loop) under the
  project theme. Verify desktop and 390px layouts, keyboard focus, Arabic
  public text and reduced motion.
- Confirm the expected project slug is on the document, the selected colour
  mode persists, and the new font and typography role appear in computed style.
  Check the browser for font status and Content Security Policy violations.

## Template updates

The project owns `src/project/theme.css`, files under `public/fonts/` and
`project.config.json`. See [template updates](template.md#receive-template-updates)
for the remaining ownership rules. Run `npm run template:update -- <version>`
and read its upgrade notes. Recheck contrast when the foundation changes.

## Review checklist

- Scope overrides to the project slug and keep light and dark pairs together.
- Self-host licensed fonts and use the shared type roles and UI primitives.
- Keep the generated foundation and template-owned components intact so future
  template versions can update them.

## Unitale adoption before checkpoint 10

Authorized on 2026-11-22. Unibase's foundation and shared helpers are already imported
from `02517797c9ecd1d8e9696cd1b68c9b976f2105db` (see `project.source.json`).
The Unitale handoff is pinned to `unitale-design` revision
`c95973a138947e1ce9da7165bd562a08643ba2a2`, under
`docs/design-system/projects/unitale/`. Its static examples are design references,
not React components or implemented application behavior.

`project.config.json` now enables `src/project/theme.css`. The project theme adopts
light/dark semantic pairs, radii and typography from `theme/unitale-theme.css`.
Typography declarations are on the project root instead of the specimen-only
`.ub-type-scale`; the handoff's input role maps to Unibase's `field` role.
Existing touch target hooks retain the handoff's 44/52/60px sizes. New project-only
variables use `--x-unitale-`; cards/dialogs consume the project radius through
existing slots. Keep the imported hook-enabled Tailwind adapter; the static
handoff adapter is not a replacement for Unibase's project override hooks.
Other project-only tokens are available for later compositions;
their presence does not implement selection, animation or media behavior.

Fraunces headings and DM Sans body/controls are self-hosted under `public/fonts/`,
with their SIL OFL licenses. The fonts cover Latin; Arabic uses the platform's
fallback fonts. Preserve Arabic/RTL and verify those fallback metrics, rather than
inventing an Arabic brand font. No dependency, CSP change or remote font request is
needed. Font provenance and integrity are in [the font inventory](../../public/fonts/README.md).

The active project theme replaces preset styling while retaining the saved preset
for any future theme disablement. Light/dark/system colour modes remain available.
Admin retains its existing English/LTR boundary. Theme adoption changes no models,
schemas, persistence shapes, workflow YAML, provider bindings or execution gates;
the model guide, JSON example and Mermaid diagrams are unaffected.

### Checkpoint 10 component inventory

These are available building blocks, not a claim that checkpoint 10 is implemented.
Use the [ordered 10.1-10.7 plan](features/booklet-generation/implementation-plan.md)
for behavior, ownership and acceptance criteria.

| Checkpoint need | Already in Unibase / imported Unitale | Handoff reference | Smallest remaining work in 10 |
| --- | --- | --- | --- |
| Page structure and actions | PageHeader, Card, Button, EmptyState | Entry and building-block examples | Compose project pages in existing slots |
| Package and brief form (10.2) | Field, Input, Textarea, Select, RadioGroup, Checkbox; large controls | Entry, choice and styles | Bind owned catalog/quote facade; validation and en/ar copy |
| Paid quote/consent (10.2) | AlertDialog, SubmitButton, pending/error patterns | Dialog and account examples | Show authoritative quote and explicit financial consent |
| Progress and unavailable states (10.3) | Run poller, StatusBadge, Notice, Skeleton, Progress | Waiting examples | Project real statuses; no simulated progress or rotating claims |
| Manager decisions (10.3) | Authenticated native Run response controls | Composer and review examples | Retain one existing control per authentic decision and draft |
| Original image/review (10.3) | ResultImage, MediaFallback, Dialog, owned media readers | Media and review examples | Owned preview/enlargement with keyboard close/focus; target projection |
| Revision and recovery (10.4) | Existing recovery services, Button, Notice action, AlertDialog | Review/journey examples | Wire eligibility, quote and bounded commands; preserve unknown outcomes |
| Leave and feedback states | useLeaveGuard, Field errors, toast confirmation | Input/dialog examples | Apply to meaningful drafts; persistent errors/actions stay in page |
| History (10.5) | Card, Table, Badge, localized dates/numbers; owned readers | Account examples | Minimal owned history projection and links |
| Administration (10.6) | English/LTR admin shell, registry and form primitives | Account/building-block examples only | Bounded settings section using existing policy row |
| Brand and type | Imported foundation, project theme hooks, semantic/type utilities | Generated Unitale theme | Adopted here; no shared component fork |
| Locale, focus and reduced motion (10.7) | Typed en/ar catalogs, logical RTL styles, Radix focus behavior | Specimen keyboard/motion guidance | Verify actual compositions, 390px/desktop, zoom and CSP |
| Voice, mascot, timed reveals, reader/PDF/sharing | Not required by checkpoint 10 | Optional media/delivery/journey concepts | Remain outside 10; no new component or controller now |

Do not copy the specimen localStorage controllers, add a parallel component library,
or build general-purpose composition machinery. No missing shared primitive has
been demonstrated by this inventory. Checkpoint 10 still starts at **10.1 Private
application facade** after the pre-10 local/theme checks.


### Adoption verification (2026-11-22)

Working candidate based on Unitale `59a7d3a`, branch
`feature/10-dify-workflow-design`; retained Handbook baseline
`c1b6166437ba729b59723a7dd4066c78e2f15185`.

- Production build and subsequent typecheck pass. Unit tests: 133/133 pass using
  prepared Git 2.56 (the host default Git does not support the fixture commands).
- Lint: zero errors; one existing unused-expression warning in
  `tests/integration/auth-form-browser-checks.js`. Docs, i18n and skills checks pass.
- All 26 required contrast cases plus six contextual pairs from the pinned
  handoff report pass when recalculated against the adapted theme.
- Production home: eight combinations of en/ar, light/dark and 1440px/390px pass;
  no horizontal overflow or page errors. Both fonts load from the app origin.
  Mobile English/light and Arabic/dark captures were visually reviewed.
- Preferences: keyboard selection, visible focus, reload persistence, System mode
  following both OS modes, 390px reflow and 200% CSS zoom pass. This is CSS zoom
  evidence, not a claim of testing native browser zoom controls. Reduced motion
  was enabled for the public matrix; this change adds no animation.
- Font/style CSP violations: none during the served production checks. Playwright's
  evaluation probe produces a blocked `script-src:eval` observation; no CSP change
  was made or needed. The development-only showcase is correctly absent in production.
- Local production checks used the existing real-Firebase launch workaround,
  loading the private environment before removing the emulator-host default.
  The generic `npm start` loader still reintroduces that documented local default;
  this theme change does not fix the unrelated loader. No shared database mutations.
- Same-agent separate read-only review: no blocking finding. Shared Unibase core,
  providers, models and checkpoint 10 behavior are unchanged. The subsequent
  [pre-10 closeout](features/booklet-generation/implementation-plan.md#pre-10-readiness-closeout-2026-11-22)
  adds 20/20 authenticated admin/settings, public preference restoration and native
  Run decision checks with disposable fixtures. Booklet-specific journeys remain
  in 10.7/11; generic UI readiness does not establish those unimplemented behaviors.

Local captures and browser probe output are under ignored `output/playwright/`;
they are supporting local evidence, not a new application test harness. The
HTTPS development server remains on port 3100 with the existing private settings.
