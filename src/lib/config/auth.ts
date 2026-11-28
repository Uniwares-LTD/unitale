import { project } from "../project";
import { z } from "zod";
import {
  firebaseProjectIdSchema,
  firebasePopupAuthDomain,
} from "./google-sign-in";

const schema = z.object({
  mode: z.enum(["emulator", "firebase"]),
  projectId: firebaseProjectIdSchema,
  apiKey: z.string().min(1),
  appId: z.string().min(1),
  origin: z.url(),
  emulatorHost: z
    .string()
    .regex(/^(localhost|127\.0\.0\.1):\d{2,5}$/)
    .optional(),
});

export function parseAuthConfig(
  input: Record<string, string | undefined>,
  environment: string,
  origin: string,
) {
  const local = environment === "local";
  const mode = input.AUTH_MODE ?? (local ? "emulator" : "firebase");
  const emulator = mode === "emulator";
  const result = schema.safeParse({
    mode,
    projectId:
      input.FIREBASE_PROJECT_ID ??
      (emulator ? `demo-${project.slug}` : undefined),
    apiKey: input.FIREBASE_API_KEY ?? (emulator ? "demo-api-key" : undefined),
    appId: input.FIREBASE_APP_ID ?? (emulator ? "demo-app-id" : undefined),
    origin,
    emulatorHost:
      input.FIREBASE_AUTH_EMULATOR_HOST ??
      (emulator ? "127.0.0.1:9099" : undefined),
  });
  if (!result.success) {
    const names: Record<string, string> = {
      mode: "AUTH_MODE",
      projectId: "FIREBASE_PROJECT_ID",
      apiKey: "FIREBASE_API_KEY",
      appId: "FIREBASE_APP_ID",
      emulatorHost: "FIREBASE_AUTH_EMULATOR_HOST",
      origin: "APP_ORIGIN",
    };
    throw new Error(
      `Invalid authentication configuration: ${[...new Set(result.error.issues.map((i) => names[String(i.path[0])]))].join(", ")}.`,
    );
  }
  const config = result.data;
  if (
    (!local && emulator) ||
    (!emulator && config.emulatorHost) ||
    (emulator && !config.projectId.startsWith("demo-"))
  ) {
    throw new Error(
      "Invalid authentication configuration: AUTH_MODE, FIREBASE_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST. Emulators require a local demo project.",
    );
  }
  const browserEmulator = emulator
    ? new URL(`http://${config.emulatorHost}`)
    : null;
  const appHost = new URL(origin).hostname;
  // Keep local OAuth helper storage on the app's site. localhost and 127.0.0.1
  // are different sites even though they reach the same machine.
  if (browserEmulator && ["localhost", "127.0.0.1"].includes(appHost))
    browserEmulator.hostname = appHost;
  const popupDomain = firebasePopupAuthDomain(config.mode, config.projectId);
  return {
    public: {
      apiKey: config.apiKey,
      projectId: config.projectId,
      appId: config.appId,
      authDomain: popupDomain ?? new URL(origin).host,
      googleSignInMethod: popupDomain
        ? ("popup" as const)
        : ("redirect" as const),
      emulatorUrl: browserEmulator ? browserEmulator.origin : null,
    },
    server: {
      mode: config.mode,
      emulatorHost: config.emulatorHost,
    },
  };
}

export type FirebaseBrowserConfig = ReturnType<
  typeof parseAuthConfig
>["public"];
