import { NextRequest, NextResponse } from "next/server";
import { moduleEnabled, moduleForPath } from "./lib/project";
import { firebasePopupAuthDomain } from "./lib/config/google-sign-in";

// Sonner 2.0.8 inserts an empty style element before filling it with this stylesheet.
export const sonnerStyleHashes = [
  "'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='",
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
] as const;

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const feature = moduleForPath(path);
  if (
    (path.startsWith("/design-system") &&
      process.env.NODE_ENV !== "development") ||
    (feature && !moduleEnabled(feature))
  )
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const local = !process.env.APP_ENV || process.env.APP_ENV === "local";
  const emulator = local
    ? /^(?:localhost|127\.0\.0\.1):(\d{2,5})$/.exec(
        process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
      )
    : null;
  const emulatorPort = emulator ? Number(emulator[1]) : 0;
  const emulatorSources =
    emulatorPort > 0 && emulatorPort <= 65535
      ? ` http://127.0.0.1:${emulatorPort} http://localhost:${emulatorPort}`
      : "";
  // Match the auth config default: unset AUTH_MODE is real Firebase outside
  // local. An invalid implicit project ID adds no frame source; startup
  // configuration validation rejects it separately.
  const authMode = process.env.AUTH_MODE ?? (local ? "emulator" : "firebase");
  let popupDomain: string | null = null;
  try {
    popupDomain = firebasePopupAuthDomain(
      authMode,
      process.env.FIREBASE_PROJECT_ID,
    );
  } catch (error) {
    if (process.env.AUTH_MODE) throw error;
  }
  const dev = process.env.NODE_ENV === "development";
  const helper = path.startsWith("/__/auth/");
  const csp = [
    "default-src 'self'",
    helper
      ? "script-src 'self' https://apis.google.com https://www.gstatic.com 'unsafe-inline'"
      : path === "/offline.html"
        ? "script-src 'self'"
        : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    helper || path === "/offline.html" || dev
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}' ${sonnerStyleHashes.join(" ")}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com" +
      emulatorSources +
      (dev ? " ws: wss:" : ""),
    "frame-src 'self' https://accounts.google.com" +
      emulatorSources +
      (popupDomain ? ` https://${popupDomain}` : ""),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    helper ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    ...(!local ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("x-pathname", path);
  forwarded.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: forwarded } });
  // HTML must reach React unchanged. Cloudflare email obfuscation otherwise
  // rewrites server-rendered text and injects a decoder without our CSP nonce.
  // Keep personalized documents private and uncacheable as well.
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate, no-transform",
  );
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", helper ? "SAMEORIGIN" : "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|sw.js|icons/|icon.svg|favicon.ico).*)",
  ],
};
