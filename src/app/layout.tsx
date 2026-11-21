import { project } from "@/lib/project";
import { AppToaster } from "@/components/toast";
import { LocalizedValidation } from "@/components/localized-validation";
import { getLocale, getTranslations } from "next-intl/server";
import english from "../../messages/en.json";
import { requestLocale } from "@/lib/server/locale";
import { clientMessages } from "@/lib/server/client-messages";
import { ApplicationLocale } from "@/components/application-locale";
import type { Metadata, Viewport } from "next";
import { BrowserRuntime } from "@/components/browser-runtime";
import { SessionBoundary } from "@/components/session-boundary";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { StyleProvider } from "@/components/style-provider";
import {
  STYLE_COOKIE,
  parseStylePreference,
  resolveStyle,
} from "@/lib/appearance";
import { viewerState } from "@/components/account-menu";
import { AccountMenuControls } from "@/components/account-menu-controls";
import { AppShell } from "@/components/app-shell";
import { LeaveGuardProvider } from "@/components/leave-guard";
import { ThemeProvider } from "@/components/theme-provider";
import { publicSettings } from "@/lib/server/settings";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const { appName } = await publicSettings();
  return {
    title: { default: appName, template: `%s · ${appName}` },
    description: (await getTranslations("common"))("description", {
      name: appName,
    }),
    appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read allowlisted configuration at runtime, not frozen into a build.
  await connection();
  const publicConfig = await publicSettings();
  const viewer = await viewerState();
  const { locale: preferenceLocale, timeZone } = await requestLocale();
  const locale = await getLocale();
  const preferred = (await import(`../../messages/${preferenceLocale}.json`))
    .default;
  const englishMessages = clientMessages(english, "__shell__");
  const messages =
    preferenceLocale === "en"
      ? englishMessages
      : clientMessages(preferred, "__shell__");
  const preference = parseStylePreference(
    (await cookies()).get(STYLE_COOKIE)?.value,
  );
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-project={project.theme ? project.slug : undefined}
      data-style={
        project.theme
          ? undefined
          : resolveStyle(preference, publicConfig.defaultStyle)
      }
      suppressHydrationWarning
    >
      <body className="min-h-svh font-sans antialiased">
        <ApplicationLocale
          preference={preferenceLocale}
          timeZone={timeZone}
          messages={messages}
          englishMessages={englishMessages}
        >
          <ThemeProvider nonce={(await headers()).get("x-nonce") ?? undefined}>
            <StyleProvider
              initialPreference={preference}
              defaultStyle={publicConfig.defaultStyle}
              projectTheme={project.theme ? project.slug : null}
            >
              <BrowserRuntime preferredLocale={preferenceLocale} />
              <LocalizedValidation />
              <AppToaster />
              <SessionBoundary>
                <LeaveGuardProvider>
                  <AppShell
                    appName={publicConfig.appName}
                    signedIn={viewer.hasSession}
                    accountMenu={<AccountMenuControls {...viewer} />}
                  >
                    {children}
                  </AppShell>
                </LeaveGuardProvider>
              </SessionBoundary>
            </StyleProvider>
          </ThemeProvider>
        </ApplicationLocale>
      </body>
    </html>
  );
}
