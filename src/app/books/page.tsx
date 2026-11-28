import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageMessages } from "@/components/page-messages";
import { moduleEnabled } from "@/lib/project";
import { pageSession } from "@/lib/server/session";
import { requestBookletApplication } from "@/lib/server/booklets/application-request";
import { BookLibrary } from "@/project/booklets/book-library";
import { conversationPaused } from "@/project/booklets/application-contract";

/** Bounds one library render to 10 picker pages (200 books). */
const maxPages = 10;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ui"))("m1ad84286274b") };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; pages?: string }>;
}) {
  if (!moduleEnabled("runs") || !moduleEnabled("booklets")) notFound();
  const app = requestBookletApplication(await pageSession());
  const query = await searchParams;
  const search =
    typeof query.search === "string" ? query.search.slice(0, 80) : "";
  // "More books" asks for one more page; earlier pages stay on screen.
  const pages = Math.min(
    Math.max(Number.parseInt(String(query.pages), 10) || 1, 1),
    maxPages,
  );
  const rows = [];
  let next: string | null = null;
  for (let index = 0; index < pages; index++) {
    const page = await app.picker({ search, cursor: next });
    rows.push(...page.rows);
    next = page.next;
    if (!next) break;
  }
  const books = [];
  // The picker bounds each page and checks ownership. Reuse its conversation
  // read for the current cover/status; no second persistence or library model.
  for (const row of rows) {
    const conversation = await app.conversation(row.id);
    const cover = conversation.reader?.pages[0];
    books.push({
      ...row,
      completed: conversation.completed,
      paused: conversationPaused(conversation),
      cover: cover
        ? `/api/booklets/${encodeURIComponent(row.id)}/assets/${encodeURIComponent(cover.assetId)}`
        : null,
    });
  }
  return (
    <PageMessages path="/books">
      <BookLibrary
        books={books}
        search={search}
        nextPages={next && pages < maxPages ? pages + 1 : null}
      />
    </PageMessages>
  );
}
