import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, BookOpen, Map } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A missing or foreign book leads back to the library first, then home. */
export default function BookNotFound() {
  const translate = useTranslations("ui");

  return (
    <section className="reading-surface mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <Map className="mb-6 size-10 text-muted-foreground" aria-hidden="true" />
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {translate("ma469ab4ca4e5")}
      </p>
      <h1 className="font-heading text-4xl tracking-tight">
        {translate("m90658efc1182")}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {translate("m857fa734453b")}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild className="h-11">
          <Link href="/books">
            <BookOpen aria-hidden="true" />
            {translate("m1ad84286274b")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/">
            <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
            {translate("m76c5505ff2e2")}
          </Link>
        </Button>
      </div>
    </section>
  );
}
