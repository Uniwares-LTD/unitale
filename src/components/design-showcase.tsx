"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import { ThemePreference } from "./theme-preference";
import { StylePreference } from "./style-preference";
import { EmptyState, Notice } from "./page-patterns";
import { toast } from "./toast";
import { HelperShowcase } from "./helper-showcase";
import { CreditSummary } from "./credit-summary";

const sampleWallet = {
  balance: 125,
  available: 125,
  reserved: 0,
  debt: 0,
  upcoming: [],
  holds: [],
  nextBefore: null,
  history: [
    {
      id: "sample",
      sequence: 1,
      kind: "grant",
      delta: 125,
      reservedDelta: 0,
      balanceAfter: 125,
      debtAfter: 0,
      timestamp: "2026-10-05T10:00:00.000Z",
      reason: "Sample promotional grant",
    },
  ],
};

export function DesignShowcase() {
  const translate = useTranslations("ui");

  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [toastError, setToastError] = useState(false);
  return (
    <div className="page-stack">
      <Notice title={translate("mbad95ad3aed2")}>
        {translate("m6bf93533a449")}{" "}
      </Notice>
      <Card>
        <CardHeader>
          <CardTitle>{translate("m3907fa7f8072")}</CardTitle>
          <CardDescription>{translate("m5fb6d2daa0b0")} </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            <StylePreference />
            <ThemePreference />
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {translate("m455ef101ffd7")}{" "}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" asChild>
                  <Link href="/design-system" scroll={false}>
                    {translate("m497a0675e0eb")}{" "}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/design-system?cover=none" scroll={false}>
                    {translate("mb2ec3181b360")}{" "}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/design-system?cover=broken" scroll={false}>
                    {translate("mcafbb4effbf9")}{" "}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <section
        aria-labelledby="tokens-title"
        className="reading-surface glass-inset space-y-4"
      >
        <h2 id="tokens-title" className="text-xl font-semibold">
          {translate("m6a2d703a4db0")}{" "}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            "bg-background text-foreground",
            "bg-primary text-primary-foreground",
            "bg-secondary text-secondary-foreground",
            "bg-success text-success-foreground",
            "bg-warning text-warning-foreground",
            "bg-info text-info-foreground",
          ].map((style, index) => (
            <div key={style} className={`rounded-lg border p-5 ${style}`}>
              <p className="font-medium">
                {
                  [
                    translate("m3824a9f4dafe"),
                    translate("mda2eb576b5f6"),
                    translate("m62f2ccfffcc5"),
                    translate("mc88a0b907419"),
                    translate("me981ddae45d8"),
                    translate("m1cb0ba125f84"),
                  ][index]
                }
              </p>
              <p className="mt-1 text-sm">{translate("md9d3428ceb63")}</p>
            </div>
          ))}
        </div>
        <p className="font-heading text-3xl">{translate("ma3a363c066e5")} </p>
        <p className="reading-copy">{translate("m62e660019c67")} </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{translate("mdf0ca460d71d")}</CardTitle>
          <CardDescription>{translate("m385bdd598428")} </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => setSaved(true)}>
              {translate("m16f1de31e216")}{" "}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setSaved(false);
                setConfirmed(false);
              }}
            >
              {translate("mf0ca41b33f7d")}{" "}
            </Button>
            <Button variant="outline" disabled>
              {translate("mca1844969742")}{" "}
            </Button>
            <Button disabled aria-busy="true">
              {translate("m23e39291d613")}{" "}
            </Button>
          </div>
          <form
            className="max-w-md space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const valid = name.trim().length > 0;
              setError(!valid);
              setSaved(valid);
            }}
            noValidate
          >
            <Label htmlFor="sample-name">{translate("mc3f5e1b78a94")}</Label>
            <Input
              id="sample-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              aria-invalid={error}
              aria-describedby="sample-help"
            />
            <p
              id="sample-help"
              className={
                error
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {error ? translate("me81bdf743a28") : translate("mff140e9ca92c")}
            </p>
            <Button type="submit">{translate("m39a454bb496f")}</Button>
          </form>
          {saved && (
            <Notice tone="success" title={translate("m3acde0d57c44")}>
              {translate("m89cc53951f40")}{" "}
            </Notice>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">{translate("m0421b63627df")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {translate("maa83c299a26a")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {translate("m68d071d19283")}{" "}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {translate("m19766ed6ccb2")}
                </AlertDialogCancel>
                <AlertDialogAction onClick={() => setConfirmed(true)}>
                  {translate("m6b1ddf13bf87")}{" "}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {confirmed && (
            <Notice tone="success" title={translate("m66f0a92a9bc8")} />
          )}
        </CardContent>
      </Card>
      <section aria-labelledby="states-title" className="space-y-4">
        <h2 id="states-title" className="text-xl font-semibold">
          {translate("m8c4a38d9f275")}{" "}
        </h2>
        <Notice tone="warning" title={translate("m8802ea90e287")}>
          {translate("m960ff4cc2272")}{" "}
        </Notice>
        <Notice tone="info" title={translate("m60745a887977")}>
          {translate("m94cc5ffdae70")}{" "}
        </Notice>
        <Notice tone="error" title={translate("m16efcd21d74f")}>
          {translate("m215dabb95bd2")}{" "}
        </Notice>
        <EmptyState
          title={translate("m77313c35ad1b")}
          description={translate("m2ec672a7aff5")}
        />
      </section>
      <section aria-labelledby="wallet-title" className="space-y-4">
        <h2 id="wallet-title" className="text-xl font-semibold">
          {translate("mdd077a0d1f27")}{" "}
        </h2>
        <CreditSummary account={sampleWallet} historyPath="/design-system" />
      </section>
      <section aria-labelledby="preview-title" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="preview-title" className="text-xl font-semibold">
            {translate("m368ca89d45a5")}{" "}
          </h2>
          <Badge variant="outline">{translate("m30b3d85de4d4")}</Badge>
        </div>
        <div className="grid gap-5 lg:grid-cols-[12rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {translate("m4ac990270cec")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <li className="font-semibold text-primary">
                  {translate("mf8d586965237")}{" "}
                </li>
                <li>{translate("m33269fcb29a1")}</li>
                <li>{translate("m4d400a893f71")}</li>
                <li>{translate("mbb3ad68143c0")}</li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate("mf4d9529d8a97")}</CardTitle>
              <CardDescription>{translate("mef7763c1eef0")} </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="reading-copy font-heading text-lg">
                {translate("m7a8277dc03b5")}{" "}
              </p>
              <Notice title={translate("maaa8bab5ae3f")}>
                {translate("mca0163ddf92e")}{" "}
              </Notice>
              <div className="flex flex-wrap gap-3">
                <Button disabled>{translate("mdb3ffc1d8bef")}</Button>
                <Button variant="outline" disabled>
                  {translate("m0bf92c49028d")}{" "}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {translate("mf67641bc6467")}{" "}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
      <HelperShowcase />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => toast.confirm(translate("m0c8209e72ec8"))}>
          {translate("m1624662d1977")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setToastError(true);
            toast.error(translate("m05d879f29687"));
          }}
        >
          {translate("mf2ec9eadf023")}
        </Button>
      </div>
      {toastError && <Notice tone="error" title={translate("m05d879f29687")} />}
    </div>
  );
}
