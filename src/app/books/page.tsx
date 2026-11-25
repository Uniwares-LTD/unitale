import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageMessages } from "@/components/page-messages";
import { moduleEnabled } from "@/lib/project";
import { pageSession } from "@/lib/server/session";
import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { BookLibrary } from "@/project/booklets/book-library";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ui"))("m1ad84286274b") };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; cursor?: string }>;
}) {
  if (!moduleEnabled("runs") || !moduleEnabled("booklets")) notFound();
  const app = requestBookletApplication(await pageSession());
  const query = await searchParams;
  const search =
    typeof query.search === "string" ? query.search.slice(0, 80) : "";
  const page = await app.picker({ search, cursor: query.cursor });
  const books = [];
  // The picker bounds this page and checks ownership. Reuse its conversation
  // read for the current cover/status; no second persistence or library model.
  for (const row of page.rows) {
    const conversation = await app.conversation(row.id);
    const cover = conversation.reader?.pages[0];
    books.push({
      ...row,
      completed: conversation.completed,
      cover: cover
        ? `/api/booklets/${encodeURIComponent(row.id)}/assets/${encodeURIComponent(cover.assetId)}`
        : null,
    });
  }
  return (
    <PageMessages path="/books">
      <BookLibrary books={books} search={search} next={page.next} />
    </PageMessages>
  );
}
