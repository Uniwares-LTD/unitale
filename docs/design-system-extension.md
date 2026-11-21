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
