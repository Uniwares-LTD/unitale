import { namespace } from "@/lib/project";
import { z } from "zod";

import { designStyleSchema } from "./design-styles";
export { designStyleSchema } from "./design-styles";
export const stylePreferenceSchema = z.enum([
  "default",
  ...designStyleSchema.options,
]);
export type DesignStyle = z.infer<typeof designStyleSchema>;
export type StylePreference = z.infer<typeof stylePreferenceSchema>;
export const STYLE_COOKIE = namespace("style");

export function parseStylePreference(value: unknown): StylePreference {
  const result = stylePreferenceSchema.safeParse(value);
  return result.success ? result.data : "default";
}

export function resolveStyle(
  preference: StylePreference,
  fallback: DesignStyle,
) {
  return preference === "default" ? fallback : preference;
}
