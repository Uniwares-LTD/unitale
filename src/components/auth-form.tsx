"use client";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
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

function message(
  error: unknown,
  translate: ReturnType<typeof useTranslations<"ui">>,
) {
  if (error instanceof ApiError) return error.message;
  const code = (error as { code?: string })?.code;
  if (code === "auth/weak-password") return translate("m3288a64ea288");
  if (code === "auth/too-many-requests") return translate("md1de3635fd27");
  if (code === "auth/network-request-failed") return translate("mc05785000a88");
  return translate("m844d09e89ce4");
}

export function AuthForm({ config }: { config: FirebaseBrowserConfig }) {
  const translate = useTranslations("ui");

  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [pending, setPending] = useState(true);
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
        const result = await redirectCredential(config);
        if (!active) return;
        const startedAt = sessionStorage.getItem(GOOGLE_REDIRECT_KEY);
        const user = redirectUser(
          result?.user ?? null,
          auth.currentUser,
          startedAt,
        );
        if (user) await finish(user);
        else if (
          startedAt ||
          new URL(location.href).searchParams.get("auth") === "google"
        ) {
          sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
          if (auth.currentUser) await signOut(auth);
          setNotice(translate("mc750549e48aa"));
        } else if (auth.currentUser && !auth.currentUser.emailVerified)
          setUnverified(auth.currentUser);
        else if (auth.currentUser) await signOut(auth);
      } catch (error) {
        if (active) setNotice(message(error, translate));
      } finally {
        if (active) setPending(false);
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
    setPending(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(message(error, translate));
    } finally {
      setPending(false);
    }
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
          <h2 className="text-xl font-semibold">
            {mode === "register"
              ? translate("m86033f75a4c0")
              : mode === "reset"
                ? translate("m59fa4379be1f")
                : translate("mbfd402b2f6f3")}
          </h2>
          <form onSubmit={submit} className="space-y-4">
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
            <SubmitButton pending={pending}>
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
              disabled={pending}
              onClick={() =>
                perform(async () => {
                  const auth = await browserAuth(config);
                  await signOut(auth);
                  const provider = new GoogleAuthProvider();
                  provider.setCustomParameters({ prompt: "select_account" });
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
              {translate("mcce937e89144")}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="link"
              disabled={pending}
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setNotice("");
              }}
            >
              {mode === "register"
                ? translate("m0f5b1d1f5fc8")
                : translate("m86033f75a4c0")}
            </Button>
            <Button
              variant="link"
              disabled={pending}
              onClick={() => {
                setMode(mode === "reset" ? "login" : "reset");
                setNotice("");
              }}
            >
              {mode === "reset"
                ? translate("m71fe31ccd37c")
                : translate("m30c1d8d3e912")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
