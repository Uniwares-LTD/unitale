import { STYLE_COOKIE, type StylePreference } from "@/lib/appearance";
import { namespace, project } from "@/lib/project";

// This public appearance cookie is read by the server before rendering.
// No credentials or account authority are stored here.
export function writeStyleCookie(value: StylePreference) {
  try {
    document.cookie = `${STYLE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    /* Appearance still works when browser persistence is unavailable. */
  }
}

// Adopt the account's saved look once at sign-in; later browser choices stay local
// until the user saves them again.
export function applyAccountAppearance(appearance: {
  theme: "light" | "dark" | "system";
  style: StylePreference;
}) {
  try {
    localStorage.setItem(namespace("theme"), appearance.theme);
  } catch {
    /* The next document falls back to the system theme. */
  }
  if (!project.theme) writeStyleCookie(appearance.style);
}
