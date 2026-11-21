import { PageMessages } from "@/components/page-messages";
import { LocalizationPreference } from "@/components/localization-preference";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-patterns";
import type { Metadata } from "next";
import { ThemePreference } from "@/components/theme-preference";
import { StylePreference } from "@/components/style-preference";
import { AppearanceForm } from "@/components/appearance-form";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";
import { NotificationSettings } from "@/components/notification-settings";
import { getSession } from "@/lib/server/session";
import { getMyProfile } from "@/lib/server/profiles";
import { database } from "@/lib/server/mongo";
import { notificationPreferences } from "@/lib/server/notifications";
import { moduleEnabled, project } from "@/lib/project";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ui"))("m66962f72a088") };
}

export default async function PreferencesPage() {
  const translate = await getTranslations("ui");

  const session = await getSession();
  const profile = session?.email_verified ? await getMyProfile() : null;
  const notifications =
    profile && moduleEnabled("notifications")
      ? await notificationPreferences(database(), profile.uid)
      : null;
  return (
    <PageMessages path="/preferences">
      <div className="max-w-3xl page-stack">
        <PageHeader
          title={translate("m66962f72a088")}
          description={translate("m44c5342c3c02")}
        />
        <LocalizationPreference canSave={!!profile} />
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>{translate("m3907fa7f8072")}</CardTitle>
            <CardDescription>{translate("me6ced602ea08")}</CardDescription>
          </CardHeader>
          <CardContent>
            {profile ? (
              <AppearanceForm key={profile.uid} profile={profile} />
            ) : (
              <div className="space-y-8">
                {!project.theme && <StylePreference />}
                <ThemePreference />
              </div>
            )}
          </CardContent>
        </Card>
        {notifications && <NotificationSettings initial={notifications} />}
        <DiagnosticsPanel />
      </div>
    </PageMessages>
  );
}
