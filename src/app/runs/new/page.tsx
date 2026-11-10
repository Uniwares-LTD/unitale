import { PageMessages } from "@/components/page-messages";
import { getTranslations } from "next-intl/server";
import { ProjectRunStart } from "@/project/run-start";
import { orchestrators } from "@/lib/server/runs/orchestrators";
import { listRuns } from "@/lib/server/runs/service";
import { PageHeader } from "@/components/page-patterns";
import { personaChoices } from "@/lib/server/runs/personas";
import { listArtifacts, ownedArtifact } from "@/lib/server/runs/artifacts";
import { database } from "@/lib/server/mongo";
import { requireSession } from "@/lib/server/session";
import type { Metadata } from "next";
import { terminalRunStatuses, uuidSchema } from "@/lib/contracts/runs";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/auth-policy";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ui"))("m9f88e18da1c5") };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ artifactId?: string }>;
}) {
  const translate = await getTranslations("ui");

  const actor = await requireSession();
  const query = await searchParams;
  const parsed = query.artifactId
    ? uuidSchema.safeParse(query.artifactId)
    : null;
  if (parsed && !parsed.success) notFound();
  const artifactId = parsed?.success ? parsed.data : undefined;
  const [choices, runs, personas, savedArtifacts, initialArtifact] =
    await Promise.all([
      orchestrators(false, true),
      listRuns(),
      personaChoices(),
      listArtifacts(),
      artifactId
        ? ownedArtifact(database(), actor.uid, artifactId).catch((error) => {
            if (
              error instanceof AppError &&
              error.code === "ARTIFACT_NOT_FOUND"
            )
              notFound();
            throw error;
          })
        : Promise.resolve(null),
    ]);
  const artifactRows =
    initialArtifact &&
    !savedArtifacts.rows.some((a) => a.id === initialArtifact.id)
      ? [initialArtifact, ...savedArtifacts.rows]
      : savedArtifacts.rows;
  return (
    <PageMessages path="/runs/new">
      <div className="page-stack">
        <PageHeader
          title={translate("m9f88e18da1c5")}
          description={translate("mbe8f030087bf")}
        />
        <ProjectRunStart
          key={artifactId ?? "new"}
          choices={choices}
          personas={personas}
          artifactId={artifactId}
          artifactsNext={savedArtifacts.next}
          artifacts={artifactRows.map(({ id, title, revision }) => ({
            id,
            title,
            revision,
          }))}
          unfinished={runs.rows.filter(
            (r) => !terminalRunStatuses.includes(r.status),
          )}
        />
      </div>
    </PageMessages>
  );
}
