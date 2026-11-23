# Base design system

## Purpose and audience

Base serves end users of AI-enabled web applications and operators managing
accounts, credits and execution. Its reusable UI covers forms, Runs, results,
tables and reports. A downstream product defines its own audience and content
experience; each application defines its own audience and content requirements.

Classic pairs a warm canvas with burnt orange in light mode, apricot in dark
mode and serif headings. Glass pairs frosted gradients with forest green or
mint actions and sans-serif headings. Soft Blue pairs opaque lavender or navy
surfaces with blue actions and sans-serif headings. The foundation uses system
fonts.
Classic, Glass and Soft Blue are independent of light, dark and system mode. All presets
share semantic tokens and the same application behavior.

## Where to change things

| File                                          | Change here                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/styles/design-system/unibase.css`        | Vendored preset palettes, font roles, page gap and toast duration                      |
| `src/styles/design-system/tailwind-theme.css` | Vendored Tailwind typography roles                                                     |
| `src/project/theme.css`                       | Optional project-owned palette, type roles and font faces                              |
| `src/styles/tokens.css`                       | Local effect defaults, reading width and touch targets                                 |
| `src/lib/page-cover.ts`                       | Metadata observation, image URL validation and loading cleanup                         |
| `src/styles/presets/glass.css`                | Glass gradients, panel effects and opaque fallbacks                                    |
| `src/lib/appearance.ts`                       | Supported style/preference values and cookie resolution                                |
| `src/components/style-provider.tsx`           | Browser selection and public appearance cookie                                         |
| `src/components/style-preference.tsx`         | Shared shadcn radio selector                                                           |
| `src/app/globals.css`                         | Tailwind token mappings, fonts, page typography, focus, reduced motion and touch rules |
| `src/components/page-patterns.tsx`            | Page headers, notices (with optional action), empty states and `SubmitButton`          |
| `src/components/status-badge.tsx`             | Status badge with icon and tone                                                        |
| `src/components/leave-guard.tsx`              | Unsaved-changes guard for in-app navigation                                            |
| `src/components/media-fallback.tsx`           | Fallback for absent or broken images                                                   |
| `src/lib/design-helpers.ts`                   | Pure, unit-tested logic behind the shared helpers                                      |
| `src/components/helper-showcase.tsx`          | Synthetic examples of the shared helpers in the showcase                               |
| `src/components/ui`                           | Installed shadcn primitives; use the shadcn CLI for additional primitives              |
| `src/components/app-shell.tsx`                | Desktop/mobile navigation, account menu, skip link and the focused frame               |
| `src/components/theme-toggle.tsx`             | Compact light/dark toggle used by the focused frame                                    |
| `src/components/design-showcase.tsx`          | Synthetic interactive examples and static feature preview                              |
| `src/app/design-system/page.tsx`              | Development-only route guard                                                           |
| `src/proxy.ts`                                | Showcase-only production 404 before page streaming starts                              |

Change a semantic pair together, for example `--warning` and
`--warning-foreground`, in both themes. Prefer `bg-warning`/`text-warning-foreground`
over a literal palette in a feature component. Update shared palette values in the design package and vendor the generated foundation. The shadcn CLI writes to `globals.css`, where Unibase keeps its local mappings and rules.
Spacing inside components uses Tailwind's existing scale; page separation and
reading width use the shared tokens. Avoid a second spacing or control library.

Use `PageHeader` for one page title and concise guidance, `Notice` for information,
success, warning or error, and `EmptyState` to explain what is missing and what to
do next. These are application compositions, not replacements for shadcn controls.
Use existing Button, Input, Label, Card, Badge, Table, Sheet and AlertDialog
primitives. Keep page reads on the server and interactive state in small client
components. Do not move a page into a client component merely to style it.

## Typography roles

The foundation supplies 12 Tailwind roles: display, hero, page title, dialog
title, section title, card title, reading, field, body, supporting, label and
caption. Apply the approved role as a `text-*` utility. For example,
`text-card-title` pairs 20px text with a 26px line height at weight 600.
`font-heading` and `font-sans` use the preset's heading and body font hooks.

## Switching and persistence

With `theme: true` in the project manifest, the document uses
`data-project="<slug>"` and omits `data-style`. Preferences retains
light, dark and system. The saved preset and cookie resume when the flag is
turned off. A project theme is a separate scope from preset IDs.

Open Preferences and choose Classic, Glass or Soft Blue under Design style. Appearance changes
immediately. Light/dark/system mode is a separate choice; it does not replace the
selected style. The showcase exposes the same selector for visual testing.

Visitors remember a selection in a host-only, one-year style cookie (its key is defined in `src/lib/appearance.ts`).
The server validates it and writes `data-style` onto the initial HTML, so the
saved style is present before hydration. Invalid/missing values use Application
default. No authentication or authorization comes from this public cookie.
If cookie storage is unavailable, changes still work for the current page session.

Signed-in users can click Save preferences on Preferences to save their style to
the account. Preferences loads that saved style and updates the browser appearance
cookie. An unsaved preview may be replaced by the saved style when revisiting
Preferences. Account only edits display name and does not apply appearance settings.
Older profiles inherit Application default. Older API updates omitting `style`
preserve an existing saved style; no database rewrite is needed.

Preferences color-mode selection also previews immediately; Save preferences persists
the choice to the account. Restore the saved theme only on appearance-form mount or a changed
saved value. Do not depend on the identity of `next-themes`' `setTheme` callback:
it changes with the browser theme and would overwrite previews and cross-tab changes.

Set `APP_STYLE=classic`, `APP_STYLE=glass` or `APP_STYLE=soft-blue` in `.env.local` to change the
application default, then restart the server. Choose Application default in the
selector to follow it; explicit style choices take precedence. Only this
validated public setting crosses the server boundary.

Glass uses clear tinted cards and shell chrome with page artwork or gradients,
24px panel blur, enhanced saturation, diagonal highlights and bright inset edges.
Light cards are 46% opaque; dark cards are 64%. Nested appearance choices stay
clear instead of stacking another opaque panel. Forms and table surfaces are
denser (84% light / 90% dark); fields remain solid. Portalled menus/dialog surfaces stay solid for readability. Unsupported
backdrop filtering and requested reduced transparency use opaque panel colors in
both modes. Reduced motion remains independent. Use Classic whenever an opaque,
quiet canvas is preferred.

To add a preset, approve its palette and font roles in the design package.
Vendor the updated foundation, add the approved ID to `src/lib/appearance.ts`,
and add an option to StylePreference. Verify it in the same showcase.

## Glass page-cover convention

Declare a page's main image with the standard Open Graph tag:

```html
<meta property="og:image" content="https://your-host.example/covers/main.jpg" />
```

In Next.js, export page metadata (or use generateMetadata for a dynamic cover):

```tsx
export const metadata = {
  openGraph: { images: ["https://your-host.example/covers/main.jpg"] },
};
```

Next generates the tag; do not add duplicate manual tags. Use the actual cover as
**the first og:image**, rather than a promotional sharing banner. Covers are
page metadata, independent of the saved appearance preference. Avoid a cover in
root layout metadata unless it should apply to all pages, since Next inherits
metadata. Use absolute URLs, or configure metadataBase for relative metadata URLs.
See [Next metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

Glass observes tags including streamed metadata and client-side navigation. It
loads artwork only while Glass is selected and keeps gradients until the image
succeeds. Missing, invalid, blocked or broken URLs and loads exceeding ten seconds
use the original gradients. HTTP(S) image URLs are supported; credentials,
executable/data URLs and HTTP on HTTPS pages are rejected. Removing or changing
the tag clears old artwork and cancels the previous load. Switching to another
style removes the effect. No background choice is stored on the user account.
Use approved public image hosts and avoid putting private credentials in metadata.

The background is decorative, centered and cropped to cover the viewport. It
has a 42% mode-specific wash, allowing much more of the cover color to show
through. Protect text locally: PageHeader carries the page-header class;
reading-surface marks prose/hero blocks; glass-inset adds optional Glass-only
padding. Standalone page-stack paragraphs receive local scrims.
These classes have no effect in Classic or Soft Blue. Forms inside cards use one
stronger surface; standalone forms and table containers get their own.
Tune --cover-wash, --card, --reading-surface, --form-surface, --surface-sheen
and --surface-shadow in glass.css. Recheck text and control contrast over both
black and white cover extremes before reducing opacity. The original image should still appear normally in the page content, with
appropriate alt text; the background is not a substitute for that image.

Test at /design-system: select Glass and use **Sample cover**, **No cover** and
**Broken cover**. Those links change real page metadata through client navigation.
Check light/dark, reload, back/forward, navigation to Preferences (no cover), then
return. Confirm gradients for missing/broken artwork and no previous-page image
leaking into the next page. Change to Soft Blue and verify its selection persists
through reload/account save. The local sample artwork lives in
public/design-system/cover.svg; the showcase remains development-only.

## Interaction rules

- Give inputs visible labels and connect help/errors with `aria-describedby`.
  Preserve typed values when an operation fails. Show pending and disabled states
  without removing the action's name.
- **Validation.** Build fields with `Field`, `FieldLabel`, `FieldDescription` and `FieldError`. Show a
  field's error under the field after a submit attempt, set `aria-invalid` on the control and focus the
  first invalid control. Typing clears that field's error. Task-level failures go in a `Notice` near the
  task, not in a field. Fields holding mixed-direction values (emails, URLs, codes) use `dir="ltr"`.
- **Pending.** Use `SubmitButton`: it keeps its label, is disabled and `aria-busy` while pending, and
  ignores a second activation. Hold submitted text fields read-only until the outcome is known. This is
  not server idempotency; keep existing idempotency keys.
- **Known failure versus unknown outcome.** A known failure keeps inputs and successful work and offers
  retry only where the operation supports it. An unknown outcome says so plainly, keeps everything,
  offers status checking where it exists, and never repeats paid work automatically.
- **Feedback versus approval.** Sending feedback or requesting a change does not approve the displayed
  output. An approval names the exact output and version. Approval is not purchase consent.
- **Toast versus Notice.** A toast is a brief
  confirmation of something the user just did; it lasts `--toast-confirmation-duration` (6 seconds),
  pauses while hovered or focused and restarts in full when both end. Errors and required actions never
  expire and always also appear in a `Notice` in the page.
- **Leaving.** Forms with unsaved changes use the leave guard (`useLeaveGuard` from
  `src/components/leave-guard.tsx`): Keep editing (initial focus), Save & exit only where saving exists,
  and Discard & exit. Discard drops only local edits. Browser Back is not intercepted; tab close shows the
  browser's own warning. Use it only where the feature has real saving or offers Discard.
- **Selection.** A simple reversible choice may apply on tap. Multi-select, optional-detail, consequential
  or paid choices need an explicit submit. At a selection limit, unselected options are disabled and
  selected ones stay deselectable. Submitting selected options without typed text is valid when the
  options are a complete answer. Selecting a paid or destructive option does not authorise it.
- Pair status colors with text and, for notices, an icon. Errors use an alert;
  ordinary feedback uses a status region. Do not rely on color alone.
- Keep credit balances, reservations and debt distinct. Label local simulation
  explicitly. Keep existing confirmation, authorization and idempotency behavior.
- Future paid generation must state its credit cost before confirmation. An
  uncertain result must not encourage an automatic duplicate paid request.
- Future approvals must identify the exact version. Review suggestions remain
  advisory. Stage labels describe real states; do not invent percentage progress.
- Use one main next action per task. Administration can be denser, with readable
  tables that scroll inside their container rather than widening the page.
- Keep visible keyboard focus and the shell's skip link. Respect reduced motion.
  Coarse-pointer buttons, inputs, selects and textareas have a minimum height of 44px; the label
  beside a checkbox or radio in a horizontal `Field` is 44px tall and toggles the control.
- **Missing media.** Replace an absent or broken image with `MediaFallback` or `ResultImage`
  (`src/components/media-fallback.tsx`). A failed download never offers to regenerate content.

### Status badge

`StatusBadge` (`src/components/status-badge.tsx`) is a non-interactive status label built on Badge.
Props: `tone` (`neutral`, `info`, `warning`, `success` or `error`), optional `icon` (a Lucide icon
that replaces the tone's default), `children` (the status text) and `className`. The text alone carries
the meaning; the icon is decorative and hidden from assistive technology. Long labels wrap. The error
tone uses the error Notice styling (card surface, destructive text and border), because destructive text
on its 10% tint measured 4.01:1 in Classic light; every tone measures at least 4.5:1 in all presets. Status changes
are announced by the containing workflow, not by the badge. Examples: the showcase's "Status badges".

### Notice with an action

`Notice` accepts an optional `action`: `{ state, labels, receipt?, onAction }`, where `state` is
`available`, `pending`, `success` or `failed` and `labels` names the available, pending and success
states. The feature owns the state; the notice never starts work by appearing and never retries. While
pending or after success the button is `aria-disabled` (it keeps focus) and ignores activation; pending
also sets `aria-busy`. The receipt is a polite `role="status"` line under the action. Examples: the
showcase's "Notice with an action".

### Touch targets

`src/styles/tokens.css` defines `--control-touch-sm` (2.75rem), `--control-touch-md` (3.25rem) and
`--control-touch-lg` (3.75rem). Under `@media (pointer: coarse)`, `globals.css` gives icon buttons at
least `--control-touch-sm` width and gives selectable options (select and menu items) and the label
beside a checkbox or radio at least `--control-touch-sm` height. A fine pointer keeps the compact sizes.
Fields have an opt-in `size="lg"` (48px minimum height, 16px text) on `Input`, `Textarea` and
`SelectTrigger`; the default size is unchanged.

## Page frame conventions

- Pages use `page-stack` with `PageHeader` (title, description, and `actions`
  for the page's primary button) from `src/components/page-patterns.tsx`, and set
  a `generateMetadata` title; detail pages use the entity name.
- Empty lists use `EmptyState`; success and error feedback use `Notice` rather
  than bare status paragraphs.
- Show dates with `DateLabel`, numbers with `NumberLabel` or the formatter,
  enum values with `StateLabel`, and file sizes with `BytesLabel`
  (`src/components/localized-value.tsx`). Never show raw ISO strings, codes or JSON.
- Write each visible sentence as one ICU message with placeholders and plurals;
  do not join translated fragments or embed English in components.
- Paginated lists render "Newest" next to "Older …" once a cursor is active,
  after the list and its empty state.
- Destructive or paid actions confirm in an `AlertDialog` that states the change.
- Immersive task pages (for example a conversation) may opt into the **focused frame**
  through an extension's `focusedRoutes`. It keeps only Back and `ThemeToggle`, a
  2.75rem icon button whose name describes the next mode ("Switch to dark theme").
  The page then owns its own `h1`, and the skip link and main landmark are retained.
  See [project extensions](architecture.md#project-extensions).

These are presentation conventions. The feature preview does not add models,
schemas, persistence, approval operations, generation or Dify integration.

## Local test loop

Follow [README setup](../README.md) and [account emulator testing](local-testing.md)
for the existing application. Start `npm run dev`, then open
<http://localhost:3000/design-system>. No sign-in is needed for the showcase.
Account, Credits and Admin still use their normal access controls and local
emulator fixtures; follow [admin and credits testing](admin-credits-testing.md).

The showcase form, sample confirmation and sample wallet are synthetic. They
never call mutation endpoints. The appearance selectors change this browser's
real style and color-mode preferences. Reloading resets the form/confirmation examples. Feature
approval/revision buttons are intentionally disabled and labelled as a static
concept. They are not testable business features yet.

After changing a token or pattern:

1. Inspect Classic, Glass and Soft Blue in light and dark mode, then system mode with each OS
   preference. Reload and check the persisted appearance without hydration errors.
2. Switch styles with the mouse and radio arrow keys. Reload to check persistence.
   With a local account, select Glass, save the profile and reload. An older account
   must still load and an update omitting style must preserve its saved choice.
   Set APP_STYLE to glass, restart and choose Application default; restore your
   previous environment value after testing.
3. Submit an empty sample title; check the visible error and invalid field. Enter
   a title and save; check success. Open the sample confirmation, cancel with
   Escape, confirm, and verify focus returns to the trigger.
4. Use only the keyboard: skip to content, navigate links/controls, open/close the
   mobile menu and account menu, and check visible focus and dialog focus trapping.
5. Check at 1440px and 390px widths and 200% browser zoom. Long text should wrap;
   ledger/report tables should scroll locally. The page should not scroll sideways.
6. Check normal text/foreground pairs at a contrast ratio of at least 4.5:1,
   large text at 3:1, and meaningful control/focus boundaries at 3:1. Include muted
   text and all feedback pairs in both themes. Recheck after changing colors.
7. With local test accounts, inspect Account, Preferences, Credits, Admin, Users
   and Reports. Exercise empty/search/filter errors and the existing confirmation
   dialogs. For mutations, use disposable local fixtures, never live services.
   Keep signed-in Preferences open beside a design-system tab. Selecting Dark in
   either tab must update both without reverting to the saved account mode. Verify
   immediate appearance preview, Save preferences/reload, and System following the device.
8. Enable reduced motion and check menus/dialogs remain usable. Request reduced
   transparency and check Glass cards/sidebar become opaque in both color modes. Check the browser
   console for runtime/hydration errors. Automated checks supplement this manual
   accessibility pass; they do not establish complete accessibility conformance.

9. In the showcase, open a confirmation. Check that a second confirmation replaces
   it, and that the full six seconds restart after hover and keyboard focus leave.
   Press Alt+T to focus the toast region. Check that Dismiss returns focus and that
   dismissing the sample error leaves its inline Notice visible. In Arabic, check
   the bottom-left position.
10. In a served production build, sign in with a local emulator account and save
    a profile change. Check that the confirmation is styled and the browser
    reports no Content Security Policy violation. The production policy permits
    only the pinned Sonner stylesheet and its empty initial style element by hash.

Run affected checks separately:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration
```

Stop the development server before the production build; both share `.next`.
The integration runner needs the local Auth Emulator and owns its disposable
MongoDB/application process; it does not use the persistent development database.
It includes a production HTTP assertion that `/design-system` returns 404 and
does not expose the showcase. The route is available only with `next dev`, not
`next start`, regardless of `APP_ENV`. Restart `npm run dev` after those checks.
Quality checks remain advisory; compilation/bundling errors still fail the build.

## Adopted package version

Unibase vendors the generated foundation at
[unitale-design 6d86be7](https://github.com/Uniwares-LTD/unitale-design/tree/6d86be7bffc2c8aa0e506489bfc05f8cea05f623).

| Deviation                                | Reason                                             | Date       |
| ---------------------------------------- | -------------------------------------------------- | ---------- |
| Land agent guidance and `build-ui` in R3 | The skill depends on the already available helpers | 2026-11-21 |
| Keep the existing Lucide version         | The package permits a separate icon update         | 2026-11-21 |

## Extension point

Follow the [derived-project design guide](design-system-extension.md) to add a
project theme. Scope overrides to the project slug, and reserve new variables
under `--x-<slug>-` for the project components that use them.

Use this showcase to review new UI states before connecting a downstream feature. Add a real feature's examples
only when its behavior is agreed. Keep previews labelled and static until the
corresponding milestone is implemented and verified.
