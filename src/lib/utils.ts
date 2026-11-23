import { createCn } from "cn/config";

// The foundation's typography roles (src/styles/design-system/tailwind-theme.css)
// are font sizes. Registering them lets `text-card-title` passed to a primitive
// replace the primitive's own `text-sm`/`text-base` instead of losing to it.
export const typeRoles = [
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
] as const;

// Import `cn` from here (the shadcn `utils` alias), never from the package.
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...typeRoles] }] } },
});
