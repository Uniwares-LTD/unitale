import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResultImage } from "@/components/media-fallback";

export async function BookLibrary({
  books,
  search,
  nextPages,
}: {
  books: {
    id: string;
    title: string;
    completed: boolean;
    /** Expired or stopped: the card says so instead of "In progress". */
    paused: boolean;
    cover: string | null;
  }[];
  search: string;
  /** Page count for "More books"; null when everything is shown. */
  nextPages: number | null;
}) {
  const t = await getTranslations("ui");
  const more = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(nextPages ? { pages: String(nextPages) } : {}),
  });
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-lg space-y-3">
          <p className="text-label text-muted-foreground">Unitale</p>
          <h1 className="font-heading text-page-title">{t("m1ad84286274b")}</h1>
          <p className="text-body text-muted-foreground">
            {t("m93d6c7a1115c")}
          </p>
        </div>
        <Button asChild className="min-h-11 rounded-full">
          <Link href="/books/new">
            <Plus aria-hidden="true" />
            {t("ma0c29655f13c")}
          </Link>
        </Button>
      </header>
      <form action="/books" className="flex max-w-xl items-center gap-2">
        <label htmlFor="library-search" className="sr-only">
          {t("mbb8b8340acfa")}
        </label>
        <Input
          id="library-search"
          name="search"
          defaultValue={search}
          maxLength={80}
          // Typed text sets its own direction (Arabic in the English page, and back);
          // the empty box keeps the page direction so its hint stays on the start side.
          dir="auto"
          placeholder={t("mbb8b8340acfa")}
          className="min-h-11 rounded-full placeholder-shown:[direction:inherit]"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          aria-label={t("mbb8b8340acfa")}
        >
          <Search aria-hidden="true" />
        </Button>
      </form>
      {books.length ? (
        <ul className="grid gap-6 min-[600px]:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <li key={book.id}>
              <Link
                href={`/books/${encodeURIComponent(book.id)}`}
                className="group flex overflow-hidden rounded-(--x-unitale-radius-card) bg-card shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring min-[600px]:block"
              >
                {/* Phones: a small cover beside the title so several books fit on one screen. */}
                <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden bg-muted/30 p-2 min-[600px]:aspect-[4/3] min-[600px]:h-auto min-[600px]:w-auto min-[600px]:p-5">
                  {book.cover ? (
                    <ResultImage
                      src={book.cover}
                      alt={book.title}
                      width={256}
                      height={384}
                      unoptimized
                      className="h-full w-auto rounded-sm object-contain shadow-md"
                    />
                  ) : (
                    <BookOpen
                      className="size-10 text-muted-foreground min-[600px]:size-16"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 p-4 min-[600px]:space-y-2 min-[600px]:p-5">
                  <p className="text-caption text-muted-foreground">
                    {book.completed
                      ? t("me87c89d0003f")
                      : book.paused
                        ? t("me159b06187d3")
                        : t("mc1f88e9d6c41")}
                  </p>
                  <h2
                    dir="auto"
                    className="font-heading text-card-title [overflow-wrap:anywhere]"
                  >
                    {book.title}
                  </h2>
                  <p className="pt-1 text-supporting text-primary min-[600px]:pt-2">
                    {book.completed
                      ? t("m920487473fe6")
                      : book.paused
                        ? t("mf7a90ea11a44")
                        : t("mb82ec4ab9b03")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-(--x-unitale-radius-card) bg-muted/20 px-6 py-12 text-center">
          <BookOpen
            className="mx-auto mb-4 size-10 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="font-heading text-section-title">
            {search ? t("m1ec415261fe5") : t("mf8806e8297c6")}
          </h2>
          <p className="mt-3 text-body text-muted-foreground">
            {search ? t("m8d9a6f305128") : t("m93d6c7a1115c")}
          </p>
        </div>
      )}
      {nextPages && (
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`/books?${more}`} scroll={false}>
            {t("mc309b48f250f")}
          </Link>
        </Button>
      )}
    </div>
  );
}
