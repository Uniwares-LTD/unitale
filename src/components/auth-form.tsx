"use client";
import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  type Auth,
  signOut,
  type User,
} from "firebase/auth";
import type { FirebaseBrowserConfig } from "@/lib/config/auth";
import { browserAuth, redirectCredential } from "@/lib/client/firebase";
import { GOOGLE_REDIRECT_KEY, redirectUser } from "@/lib/client/redirect-state";
import { api, ApiError } from "@/lib/client/api";
import { announceSessionChange } from "@/lib/client/session-lifecycle";
import { safeReturnPath } from "@/lib/return-path";
import { sessionResultSchema } from "@/lib/contracts/profile";
import { applyAccountAppearance } from "@/lib/client/appearance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/page-patterns";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Google's standard multi-colour "G" at its fixed 20px size; the button text
// names it. https://developers.google.com/identity/branding-guidelines
function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function message(
  error: unknown,
  translate: ReturnType<typeof useTranslations<"ui">>,
) {
  if (error instanceof ApiError) return error.message;
  const code = (error as { code?: string })?.code;
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  )
    return "";
  if (code === "auth/popup-blocked") return translate("m749038b5c762");
  if (code === "auth/weak-password") return translate("m3288a64ea288");
  if (code === "auth/too-many-requests") return translate("md1de3635fd27");
  if (code === "auth/network-request-failed") return translate("mc05785000a88");
  return translate("m844d09e89ce4");
}

export function AuthForm({ config }: { config: FirebaseBrowserConfig }) {
  const translate = useTranslations("ui");

  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [pending, setPending] = useState(true);
  const [initializedAuth, setInitializedAuth] = useState<Auth | null>(null);
  const busy = useRef(true);
  const [notice, setNotice] = useState("");
  const [unverified, setUnverified] = useState<User | null>(null);

  async function finish(user: User) {
    if (!user.emailVerified) {
      setUnverified(user);
      return;
    }
    const auth = await browserAuth(config);
    const session = await api("/api/auth/session", sessionResultSchema, {
      method: "POST",
      body: { idToken: await user.getIdToken(true) },
    });
    await signOut(auth);
    sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
    if (session.appearance) applyAccountAppearance(session.appearance);
    announceSessionChange(
      safeReturnPath(new URL(location.href).searchParams.get("next")),
    );
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const auth = await browserAuth(config);
        const redirect = config.googleSignInMethod === "redirect";
        const result = redirect ? await redirectCredential(config) : null;
        if (!active) return;
        const startedAt = redirect
          ? sessionStorage.getItem(GOOGLE_REDIRECT_KEY)
          : null;
        if (!redirect) sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
        const user = redirect
          ? redirectUser(result?.user ?? null, auth.currentUser, startedAt)
          : null;
        if (user) await finish(user);
        else if (
          redirect &&
          (startedAt ||
            new URL(location.href).searchParams.get("auth") === "google")
        ) {
          sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
          if (auth.currentUser) await signOut(auth);
          setNotice(translate("mc750549e48aa"));
        } else if (auth.currentUser && !auth.currentUser.emailVerified)
          setUnverified(auth.currentUser);
        else if (auth.currentUser) await signOut(auth);
        if (active) setInitializedAuth(auth);
      } catch (error) {
        if (active) setNotice(message(error, translate));
      } finally {
        if (active) {
          busy.current = false;
          setPending(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
    // Configuration is supplied once by the server for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  async function perform(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(message(error, translate));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function switchMode(next: "login" | "register" | "reset") {
    setMode(next);
    setNotice("");
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    await perform(async () => {
      const auth = await browserAuth(config);
      if (mode === "reset") {
        try {
          await sendPasswordResetEmail(auth, email, {
            url: `${location.origin}/account`,
          });
        } catch (error) {
          if ((error as { code?: string }).code !== "auth/user-not-found")
            throw error;
        }
        setNotice(translate("me1deafa6ebd6"));
        return;
      }
      const result =
        mode === "register"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
      if (mode === "register") {
        setUnverified(result.user);
        await sendEmailVerification(result.user, {
          url: `${location.origin}/account`,
        });
        setNotice(translate("m2b5af1798fc1"));
      }
      await finish(result.user);
    });
  }

  return (
    <div className="space-y-6">
      {notice && (
        <Alert>
          <AlertDescription role="status">{notice}</AlertDescription>
        </Alert>
      )}
      {unverified ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {translate("mbb265946234f")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate("m7e9fca60d938")} <bdi>{unverified.email}</bdi>
            {translate("m3250ca735f0f")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={pending}
              onClick={() =>
                perform(async () => {
                  await reload(unverified);
                  if (!unverified.emailVerified) {
                    setNotice(translate("m6ba8e2330b43"));
                    return;
                  }
                  await finish(unverified);
                })
              }
            >
              {translate("mbc76912b1498")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                perform(async () => {
                  await sendEmailVerification(unverified, {
                    url: `${location.origin}/account`,
                  });
                  setNotice(translate("mf4193da7febb"));
                })
              }
            >
              {translate("m4f44603ef678")}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                perform(async () => {
                  await signOut(await browserAuth(config));
                  setUnverified(null);
                  setMode("login");
                })
              }
            >
              {translate("mfdce40f79716")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {mode !== "reset" && (
            <div
              role="tablist"
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                  return;
                event.preventDefault();
                const next = mode === "login" ? "register" : "login";
                switchMode(next);
                document.getElementById(`auth-tab-${next}`)?.focus();
              }}
            >
              {(["login", "register"] as const).map((tab) => (
                <Button
                  key={tab}
                  id={`auth-tab-${tab}`}
                  role="tab"
                  type="button"
                  variant={mode === tab ? "secondary" : "ghost"}
                  aria-selected={mode === tab}
                  aria-controls="auth-panel"
                  tabIndex={mode === tab ? 0 : -1}
                  disabled={pending}
                  className={cn(mode === tab && "bg-background shadow-sm")}
                  onClick={() => switchMode(tab)}
                >
                  {tab === "register"
                    ? translate("m86033f75a4c0")
                    : translate("mbfd402b2f6f3")}
                </Button>
              ))}
            </div>
          )}
          <h2
            className={cn(
              "text-xl font-semibold",
              mode !== "reset" && "sr-only",
            )}
          >
            {mode === "register"
              ? translate("m86033f75a4c0")
              : mode === "reset"
                ? translate("m59fa4379be1f")
                : translate("mbfd402b2f6f3")}
          </h2>
          <form
            id="auth-panel"
            role={mode === "reset" ? undefined : "tabpanel"}
            aria-labelledby={mode === "reset" ? undefined : `auth-tab-${mode}`}
            onSubmit={submit}
            className="space-y-4"
          >
            <Field>
              <FieldLabel htmlFor="email">
                {translate("m969ccbd3cf63")}
              </FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={pending}
              />
            </Field>
            {mode !== "reset" && (
              <Field>
                <FieldLabel htmlFor="password">
                  {translate("me7cf3ef4f17c")}
                </FieldLabel>
                <Input
                  id="password"
                  aria-describedby={
                    mode === "register" ? "password-description" : undefined
                  }
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={128}
                  required
                  disabled={pending}
                />
                {mode === "register" && (
                  <FieldDescription id="password-description">
                    {translate("m618b57689fc1")}
                  </FieldDescription>
                )}
              </Field>
            )}
            <SubmitButton pending={pending} className="w-full">
              {pending
                ? translate("m4660a983366f")
                : mode === "register"
                  ? translate("m798ca2ce18bf")
                  : mode === "reset"
                    ? translate("m708c5d67ba8e")
                    : translate("mbfd402b2f6f3")}
            </SubmitButton>
          </form>
          {mode !== "reset" && (
            <Button
              variant="outline"
              // Google's required button colours (light and dark themes), not
              // the app palette, per its Sign in with Google branding rules.
              className="w-full gap-2.5 border-[#747775] bg-white px-3 text-[#1F1F1F] hover:bg-[#F2F2F2] hover:text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#202124] dark:hover:text-[#E3E3E3]"
              disabled={pending || !initializedAuth}
              onClick={() =>
                perform(async () => {
                  const provider = new GoogleAuthProvider();
                  provider.setCustomParameters({ prompt: "select_account" });
                  if (config.googleSignInMethod === "popup") {
                    const result = await signInWithPopup(
                      initializedAuth!,
                      provider,
                    );
                    await finish(result.user);
                    return;
                  }
                  const auth = await browserAuth(config);
                  await signOut(auth);
                  sessionStorage.setItem(
                    GOOGLE_REDIRECT_KEY,
                    String(Date.now()),
                  );
                  const returnUrl = new URL(location.href);
                  returnUrl.searchParams.set("auth", "google");
                  history.replaceState(history.state, "", returnUrl);
                  await signInWithRedirect(auth, provider);
                })
              }
            >
              <GoogleLogo />
              {translate("mcce937e89144")}
            </Button>
          )}
          {mode !== "register" && (
            <div className="flex justify-center">
              <Button
                variant="link"
                disabled={pending}
                onClick={() => switchMode(mode === "reset" ? "login" : "reset")}
              >
                {mode === "reset"
                  ? translate("m71fe31ccd37c")
                  : translate("m30c1d8d3e912")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
