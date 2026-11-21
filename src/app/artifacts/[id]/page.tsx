import { PageMessages } from "@/components/page-messages";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { AppError } from "@/lib/auth-policy";
import { notFound } from "next/navigation";
import { getSession, signInRedirect } from "@/lib/server/session";
import { ResultImage } from "@/components/media-fallback";
import { uuidSchema } from "@/lib/contracts/runs";
import { artifactDetail } from "@/lib/server/runs/artifacts";
import { ArtifactControls } from "@/components/runs/artifact-controls";
import { PageHeader } from "@/components/page-patterns";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

// Shared by metadata and the page so one request reads the artifact once.
const load = cache(async (id: string, cursor?: string) => {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();
  return artifactDetail(parsed.data, cursor).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}): Promise<Metadata> {
  if (!(await getSession())?.email_verified)
    return { title: (await getTranslations("ui"))("ma90ed5ef7cec") };
  const row = await load((await params).id, (await searchParams).cursor);
  return { title: row.title };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const translate = await getTranslations("ui");

  if (!(await getSession())?.email_verified) return signInRedirect();
  const { cursor } = await searchParams;
  const row = await load((await params).id, cursor);
  return (
    <PageMessages path="/artifacts/[id]">
      <div className="page-stack">
        <PageHeader
          title={row.title}
          description={
            row.approvedRevision == null
              ? translate("m0f92483ffd11", { revision: row.revision })
              : translate("maa78ecbee3b8", {
                  revision: row.revision,
                  approved: row.approvedRevision,
                })
          }
          actions={
            <Button asChild>
              <Link href={`/runs/new?artifactId=${row.id}`}>
                {translate("meeac60ddb135")}
              </Link>
            </Button>
          }
        />
        <Accordion
          type="multiple"
          defaultValue={
            row.revisions.rows.length
              ? [String(row.revisions.rows[0].revision)]
              : []
          }
        >
          {row.revisions.rows.map((r) => (
            <AccordionItem value={String(r.revision)} key={r.revision}>
              <AccordionTrigger>
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {translate("mb50cf17142a3", { revision: r.revision })}
                  </span>
                  {r.revision === row.revision && (
                    <Badge variant="secondary">
                      {translate("m8730d3c2022a")}
                    </Badge>
                  )}
                  {r.approvalSource && (
                    <Badge variant="outline">
                      {translate("m87b42e40c2a2")}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                <p className="whitespace-pre-wrap break-words">{r.text}</p>
                {r.approvalSource && (
                  <p className="text-sm text-muted-foreground">
                    {r.approvalSource.type === "persona"
                      ? translate("m7d27a307d119", {
                          revision: r.approvalSource.personaRevision ?? "",
                        })
                      : translate("mac408f9af0dc")}
                  </p>
                )}
                <Link
                  className="underline underline-offset-4"
                  href={`/runs/${r.logicalId}`}
                >
                  {translate("mf8cecbf46477")}
                </Link>
                {r.assets.map((id, index) => (
                  <ResultImage
                    aspectRatio="1 / 1"
                    key={id}
                    src={`/api/run-assets/${id}?size=thumb`}
                    alt={translate("m91bff16ba87b", {
                      revision: r.revision,
                      index: index + 1,
                    })}
                    width={400}
                    height={400}
                    unoptimized
                    className="h-auto max-w-full rounded-lg"
                  />
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {(row.revisions.next || cursor) && (
          <div className="flex flex-wrap gap-2">
            {cursor && (
              <Button asChild variant="outline">
                <Link href={`/artifacts/${row.id}`}>
                  {translate("madaa78841690")}
                </Link>
              </Button>
            )}
            {row.revisions.next && (
              <Button asChild variant="outline">
                <Link
                  href={`/artifacts/${row.id}?cursor=${encodeURIComponent(row.revisions.next)}`}
                >
                  {translate("m11ad78ef6152")}
                </Link>
              </Button>
            )}
          </div>
        )}
        <ArtifactControls id={row.id} />
      </div>
    </PageMessages>
  );
}
