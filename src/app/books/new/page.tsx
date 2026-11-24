import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageMessages } from "@/components/page-messages";
import { moduleEnabled } from "@/lib/project";
import { getSession } from "@/lib/server/session";
import { BookEntry } from "@/project/booklets/conversation/book-entry";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ui"))("m74dc5b13b682") };
}

// Conversation entry. Signed-out visitors may write their idea; starting a
// book requires sign-in (the idea is kept across the sign-in round trip).
export default async function Page() {
  if (!moduleEnabled("runs") || !moduleEnabled("booklets")) notFound();
  const session = await getSession();
  const ownerId = session?.email_verified ? session.uid : null;
  return (
    <PageMessages path="/books/new">
      <BookEntry key={ownerId} ownerId={ownerId} />
    </PageMessages>
  );
}
