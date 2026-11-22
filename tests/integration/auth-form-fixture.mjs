// Isolated browser fixture for the real AuthForm. No provider or database access.
// Run after build: node tests/integration/auth-form-fixture.mjs
// Drive /?locale=en|ar&method=popup|redirect&restored=verified|unverified.
import { build } from "esbuild";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const mocks = {
  "firebase/auth": `
    const fixture = () => window.authFixture;
    export class GoogleAuthProvider { setCustomParameters(value) { fixture().provider = value; } }
    export function signInWithPopup(auth) {
      fixture().calls.push(["popup", navigator.userActivation.isActive, auth === fixture().auth]);
      return new Promise((resolve, reject) => { fixture().resolve = resolve; fixture().reject = reject; });
    }
    export async function signInWithRedirect() { fixture().calls.push(["redirect"]); }
    export async function signOut() { fixture().calls.push(["signOut"]); fixture().auth.currentUser = null; }
    export async function reload() {}
    export async function sendEmailVerification() {}
    export async function sendPasswordResetEmail() {}
    export async function signInWithEmailAndPassword() { return { user: fixture().user }; }
    export async function createUserWithEmailAndPassword() { return { user: fixture().user }; }
  `,
  "@/lib/client/firebase": `
    export async function browserAuth() { return window.authFixture.auth; }
    export async function redirectCredential() {
      const f = window.authFixture; f.calls.push(["redirectCredential"]);
      return f.redirectResult;
    }
  `,
  "@/lib/client/session-lifecycle": `
    export const sessionRequestSignal = () => new AbortController().signal;
    export function announceSessionChange(destination) { window.authFixture.calls.push(["destination", destination]); }
  `,
};
const result = await build({
  bundle: true,
  jsx: "automatic",
  write: false,
  format: "iife",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: {
    loader: "tsx",
    resolveDir: process.cwd(),
    contents: `
      import {createRoot} from "react-dom/client";
      import {NextIntlClientProvider} from "next-intl";
      import {namespace} from "./src/lib/project";
      import {GOOGLE_REDIRECT_KEY} from "./src/lib/client/redirect-state";
      import {AuthForm} from "./src/components/auth-form";
      import en from "./messages/en.json";
      import ar from "./messages/ar.json";
      const params = new URL(location.href).searchParams;
      const locale = params.get("locale") === "ar" ? "ar" : "en";
      const calls = [];
      const user = {email: "fixture@example.test", emailVerified: true, providerData: [{providerId: "google.com"}],
        async getIdToken(fresh) {calls.push(["token", fresh]); return "fixture-token";}};
      const restored = params.get("restored");
      const currentUser = restored ? {...user, emailVerified: restored === "verified"} : null;
      window.authFixture = {calls, user, themeKey:namespace("theme"), auth: {currentUser}, redirectResult: null};
      if (restored) sessionStorage.setItem(GOOGLE_REDIRECT_KEY, String(Date.now()));
      const config = {apiKey:"fixture-key", appId:"fixture-app", projectId:"popup-fixture",
        authDomain:"popup-fixture.firebaseapp.com", emulatorUrl:null, googleSignInMethod:params.get("method") || "popup"};
      document.documentElement.lang = locale;
      document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
      createRoot(document.getElementById("root")).render(
        <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en} timeZone="UTC">
          <AuthForm config={config}/>
        </NextIntlClientProvider>);
    `,
  },
  plugins: [
    {
      name: "owned-auth-boundaries",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^(firebase\/auth|@\/lib\/client\/(firebase|session-lifecycle))$/,
          },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: mocks[path],
          loader: "js",
        }));
      },
    },
  ],
});
const cssDirectory = ".next/static/chunks";
const css = (existsSync(cssDirectory) ? readdirSync(cssDirectory) : [])
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(path.join(cssDirectory, name), "utf8"))
  .join("\n");
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/bundle.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(result.outputFiles[0].text);
  } else if (url.pathname === "/style.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(css);
  } else if (url.pathname === "/api/auth/csrf") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ token: "a".repeat(64) }));
  } else if (url.pathname === "/api/auth/session") {
    let body = "";
    for await (const chunk of request) body += chunk;
    if (
      request.headers["x-csrf-token"] !== "a".repeat(64) ||
      JSON.parse(body).idToken !== "fixture-token"
    ) {
      response.writeHead(400);
      response.end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        verified: true,
        appearance: { theme: "dark", style: "glass" },
      }),
    );
  } else {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html data-style="classic"><head><link rel="stylesheet" href="/style.css"></head><body><main id="root" class="mx-auto max-w-lg p-6"></main><script src="/bundle.js"></script></body></html>',
    );
  }
});
server.listen(3102, "127.0.0.1", () =>
  console.log("Owned AuthForm browser fixture: http://127.0.0.1:3102"),
);
