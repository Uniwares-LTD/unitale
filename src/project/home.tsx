import type { ComponentType } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BookOpen, Palette, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { moduleEnabled } from "@/lib/project";
import { signInPath } from "@/lib/return-path";

// Project-owned home page. Set a Server Component here to replace the template's
// default home at "/"; null keeps the default. It renders inside the page's
// message scope, so translated copy uses literal t("m…") calls as elsewhere.
export type ProjectHomeProps = { appName: string; hasSession: boolean };

// Unitale home: book entry points only (links; no booklet data is read here).
async function UnitaleHome({ appName, hasSession }: ProjectHomeProps) {
  const translate = await getTranslations("ui");
  const books = moduleEnabled("runs") && moduleEnabled("booklets");
  const arrow = <ArrowRight aria-hidden="true" className="rtl:rotate-180" />;
  return (
    <div className="space-y-10">
      <section className="reading-surface relative overflow-hidden rounded-2xl border bg-secondary/45 px-6 py-10 sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="absolute -top-20 -end-20 size-72 rounded-full border-[32px] border-primary/5"
        />
        <div className="relative max-w-lg">
          <span className="mb-6 flex size-12 items-center justify-center rounded-2xl border bg-background">
            <BookOpen className="size-6 text-primary" aria-hidden="true" />
          </span>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <bdi>{appName}</bdi>
          </p>
          <h1 className="font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
            {translate("mbd18803e1bf7")}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            {translate("m982946f7aa68")}
          </p>
          {hasSession ? (
            books && (
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild className="h-11">
                  <Link href="/books/new">
                    {translate("ma0c29655f13c")}
                    {arrow}
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-11">
                  <Link href="/books">{translate("mde63e03a3514")}</Link>
                </Button>
              </div>
            )
          ) : (
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="h-11">
                <Link href={books ? signInPath("/books/new") : "/account"}>
                  {books
                    ? translate("m91ad161d3a0e")
                    : translate("mbfd402b2f6f3")}
                  {arrow}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>
      {hasSession && (
        <section aria-labelledby="explore-title">
          <div className="reading-surface glass-inset mb-5">
            <h2
              id="explore-title"
              className="text-lg font-semibold tracking-tight"
            >
              {translate("mea7552207078")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {translate("mc146e2f33b3e")}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader>
                <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary">
                  <UserRound className="size-5" aria-hidden="true" />
                </span>
                <CardTitle>{translate("mdbb5f6371b6a")}</CardTitle>
                <CardDescription>{translate("mb72bfd6ac61e")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild className="h-10">
                  <Link href="/account">
                    {translate("m4071433234fe")}
                    {arrow}
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary">
                  <Palette className="size-5" aria-hidden="true" />
                </span>
                <CardTitle>{translate("m22c0f0a23168")}</CardTitle>
                <CardDescription>{translate("mb44f7b018207")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild className="h-10">
                  <Link href="/preferences">
                    {translate("m2521a1a3a4a5")}
                    {arrow}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}

export const projectHome: ComponentType<ProjectHomeProps> | null =
  UnitaleHome as unknown as ComponentType<ProjectHomeProps>;
