---
name: build-ui
description: "Builds or changes Unibase user interface with the adopted design system: primitives, field and form states, feedback, leaving, RTL and CSP rules. Use when implementing or changing pages, forms, dialogs or other UI in src/app or src/components; not for review-only requests."
---

# Build Unibase UI

Use this with `work-on-task` when a task adds or changes interface. It routes to Unibase's
design system, `docs/design-system.md`, which owns the rules; this skill says how to apply them.
It grants no authority beyond the task.

## 1. Requirements

- **Inputs:** the task or issue, the page or flow affected, `docs/design-system.md`.
- **Do:** write down the user's goal, every action, and every state the surface must show (use the
  checklist below). Name the real capability behind each action: what the server does, whether saving
  exists, whether an outcome can be unknown.
- **Boundaries:** do not invent a product decision (prices, retry eligibility, approval policy). Mark it
  as an open question.
- **Output:** a short list of states, actions and acceptance checks.
- **Continue when:** every action maps to an existing capability or an explicitly accepted one.

## 2. Planning

- **Inputs:** the requirements list, the current files, `src/components/ui`, `src/components/page-patterns.tsx`.
- **Do:** choose existing primitives from the table below. Keep page reads on the server and interaction
  in small client components. Decide which states reuse existing patterns and which need new ones.
- **Boundaries:** add a shadcn primitive only through the CLI (`npx.cmd shadcn add <name>` on Windows);
  do not add a second component or spacing library; a new dependency or CSP change needs explicit approval.
- **Output:** the files to change, the primitives used, the checks to run.
- **Continue when:** nothing in the plan needs a decision the task does not grant.

## 3. Implementation

- **Do:** build with semantic tokens (`bg-primary`, `text-muted-foreground`, …), never palette classes.
  Cover every state from step 1. Add user-visible strings to both catalogs.
- **Verify:** run the checks below and the design system's local test loop for the affected screens.
- **Output:** the change, the checks run with results, anything not verified and why.
- **Stop and ask when:** a check fails for a reason outside the task, or a state needs an unapproved capability.

## Choose the primitive

| Need | Use | File |
| --- | --- | --- |
| Page title, description, primary action | `PageHeader` | `src/components/page-patterns.tsx` |
| Information, success, warning, error in the page | `Notice` | `src/components/page-patterns.tsx` |
| Nothing to show yet | `EmptyState` | `src/components/page-patterns.tsx` |
| A labelled form control with help and error | `Field` and its parts | `src/components/ui/field.tsx` |
| Submit with pending state | `SubmitButton` | `src/components/page-patterns.tsx` |
| Larger field when the screen specification calls for it | `size="lg"` | `Input`, `Textarea`, `SelectTrigger` |
| Status with icon and semantic tone | `StatusBadge` | `src/components/status-badge.tsx` |
| Inline feedback with a recovery action | `Notice` with `action` | `src/components/page-patterns.tsx` |
| Minimum touch targets | `--control-touch-*` | `src/styles/tokens.css` |
| Brief confirmation after an action | `toast.confirm` | `src/components/toast.tsx` |
| Destructive or paid confirmation | `AlertDialog` | `src/components/ui/alert-dialog.tsx` |
| Unsaved changes before navigation | `useLeaveGuard` | `src/components/leave-guard.tsx` |
| Absent or broken image | `MediaFallback` / `ResultImage` | `src/components/media-fallback.tsx` |
| Dates, numbers, states, sizes | `DateLabel`, `NumberLabel`, `StateLabel`, `BytesLabel` | `src/components/localized-value.tsx` |
| Actions and links | `Button` (with `asChild` for links) | `src/components/ui/button.tsx` |

## State checklist

Every interactive surface covers, where it applies:

- idle, pending, success, known failure, unknown outcome
- empty, no matches, loading, no access, unavailable, disabled (with the reason shown)
- invalid input with the error under the field and focus on the first invalid control
- long text and long identifiers at 390px; 200% zoom
- dirty form when leaving (leave guard only where saving or discarding is meaningful)

## Rules to apply

- **Locale:** public copy uses typed catalogs with `ui` keys `m` + 12 hex of the SHA-256 of the English
  text; add keys to `messages/en.json` and `messages/ar.json`, then run `node scripts/i18n-client-sections.mjs`.
  Administration stays English/LTR.
- **RTL:** use logical classes (`ms-`, `pe-`, `start-`, `text-start`). Mirror directional arrows with
  `rtl:rotate-180`; never mirror status or brand icons. Keep identifiers `dir="ltr"`.
- **CSP:** do not add inline `<style>` or scripts. Pass the existing nonce where a component needs one
  (see `src/app/layout.tsx`). A library that injects styles needs a reviewed CSP change in `src/proxy.ts`.
  Check CSP in a production build: development allows inline styles.
- **Server/client:** keep private access in `src/lib/server` with `server-only`; never pass credentials
  or private configuration to client components.
- **Feedback:** errors and required actions never rely on a toast alone. Unknown outcomes never trigger
  an automatic repeat of paid work. Feedback is not approval.

## Verify

```sh
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run check:i18n
npm.cmd run build
```

Stop the development server before `build`; both use `.next`. Then follow the design system's local test
loop for the affected screens: three presets, light and dark, 390px and 1440px, keyboard, Arabic on public
pages, and reduced motion. Record what you checked.

## Derived projects

Read `docs/design-system-extension.md` before extending the design. Put theme
overrides in `src/project/theme.css`, self-host fonts in `public/fonts/` and
prefix new project tokens with `--x-<slug>-`. Compose the shared controls in
project-owned components. Propose reusable changes to the design package.

## Needs human approval

New dependencies, CSP changes, visible colour or typography changes to existing screens, new style IDs,
and anything the adapter lists under publication and external actions.
