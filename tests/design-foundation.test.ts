import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { designStyleSchema } from "../src/lib/appearance";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const revision = "6d86be7bffc2c8aa0e506489bfc05f8cea05f623";
const colors = read("src/styles/design-system/unibase.css");
const typography = read("src/styles/design-system/tailwind-theme.css");

test("the versioned foundation loads before local effects and Tailwind type roles", () => {
  const imports = Array.from(
    read("src/app/globals.css").matchAll(/^@import "([^"]+)"/gm),
    (match) => match[1],
  );
  assert.deepEqual(imports, [
    "tailwindcss",
    "tw-animate-css",
    "shadcn/tailwind.css",
    "../styles/design-system/unibase.css",
    "../styles/tokens.css",
    "../styles/presets/glass.css",
    "../styles/design-system/tailwind-theme.css",
    "../project/theme.css",
  ]);
  for (const [name, css] of [
    ["unibase.css", colors],
    ["tailwind-theme.css", typography],
  ]) {
    assert.equal(
      css.split(/\r?\n/, 1)[0],
      "/* Source: Uniwares-LTD/unitale-design " +
        revision +
        " docs/design-system/unibase/tokens/" +
        name +
        " */",
    );
  }
});

test("each style has one authoritative light and dark palette and a six-second toast token", () => {
  const selectors = Array.from(
    colors.matchAll(/^([^\s/].*) \{/gm),
    (match) => match[1],
  );
  const presets = designStyleSchema.options.filter(
    (preset) => preset !== "classic",
  );
  assert.deepEqual(selectors, [
    ":root",
    ":root:where(.dark)",
    ...presets.flatMap((preset) => {
      const selector = `html[data-style="${preset}"]`;
      return [selector, selector + ".dark"];
    }),
  ]);
  assert.match(colors, /^  --toast-confirmation-duration: 6000ms;$/m);
});

test("all package typography roles have overridable keys and em tracking", () => {
  const roles = [
    "display",
    "hero",
    "page-title",
    "dialog-title",
    "section-title",
    "card-title",
    "reading",
    "field",
    "body",
    "supporting",
    "label",
    "caption",
  ];
  for (const role of roles) {
    for (const [key, override, unit] of [
      ["", "size", "rem"],
      ["--line-height", "leading", ""],
      ["--font-weight", "weight", ""],
      ["--letter-spacing", "tracking", "em"],
    ]) {
      const pattern = new RegExp(
        `^  --text-${role}${key}: var\\(--text-${role}-${override}, -?\\d+(?:\\.\\d+)?${unit}\\);$`,
        "m",
      );
      assert.match(typography, pattern);
    }
  }
});
