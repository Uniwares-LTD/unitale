import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageMessages } from "@/components/page-messages";
import { AppError } from "@/lib/auth-policy";
import { getSession, signInRedirect } from "@/lib/server/session";
import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { BookConversation } from "@/project/booklets/conversation/book-conversation";

// Shared by metadata and the page so one request reads the conversation once.
const load = cache(async (id: string) => {
  const session = await getSession();
  if (!session?.email_verified) return null;
  return requestBookletApplication(session)
    .conversation(id)
    .catch((error) => {
      if (
        error instanceof AppError &&
        (error.status === 404 || error.status === 400)
      )
        notFound();
      throw error;
    });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const data = await load((await params).id);
  return {
    title: data?.title ?? (await getTranslations("ui"))("mdf4bb1fa43af"),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const data = await load((await params).id);
  if (!data) return signInRedirect();
  return (
    <PageMessages path="/books/[id]">
      <BookConversation initial={data} />
    </PageMessages>
  );
}
