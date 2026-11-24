import { PageMessages } from "@/components/page-messages";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/auth-policy";
import { runIdSchema } from "@/lib/contracts/runs";
import { RunDetail } from "@/components/runs/run-ui";
import { runDetail } from "@/lib/server/runs/service";
import { PageHeader } from "@/components/page-patterns";
import { getSession } from "@/lib/server/session";
import { moduleEnabled } from "@/lib/project";

// Shared by metadata and the page so one request reads the run once.
const load = cache(async (id: string) => {
  const parsed = runIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  return runDetail(parsed.data).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!(await getSession())?.email_verified)
    return { title: (await getTranslations("ui"))("me131648c438d") };
  return { title: (await load((await params).id)).name };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const translate = await getTranslations("ui");

  const data = await load((await params).id);
  if (
    moduleEnabled("booklets") &&
    data.target?.adapter === "booklet" &&
    data.target.version === "2"
  )
    redirect(`/books/${encodeURIComponent(data.target.id)}`);
  return (
    <PageMessages path="/runs/[id]">
      <div className="page-stack">
        <PageHeader
          title={data.name}
          description={translate("m672baa4d7bf4")}
        />
        <RunDetail initial={data} />
      </div>
    </PageMessages>
  );
}
