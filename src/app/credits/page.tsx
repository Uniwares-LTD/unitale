import { CatalogPurchases } from "@/components/commerce/catalog-purchases";
import { moduleEnabled } from "@/lib/project";
import { PageMessages } from "@/components/page-messages";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-patterns";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { currentCreditAccount } from "@/lib/server/credits";
import { pageSession } from "@/lib/server/session";
import {
  publicCatalog,
  currentSimulatedPurchases,
} from "@/lib/server/purchases";
import { CreditSummary } from "@/components/credit-summary";
import { PurchaseSimulator } from "@/components/purchase-simulator";
import { CreditCheckout } from "@/components/credit-checkout";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ui"))("m2a6b24ad2872") };
}
export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const translate = await getTranslations("ui");

  const { before } = await searchParams;
  const cursor = before === undefined ? undefined : Number(before);
  if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 1))
    redirect("/credits");
  const session = await pageSession();
  const account = await currentCreditAccount(cursor);
  const catalog = await publicCatalog();
  const orders =
    catalog.mode === "simulation" ? await currentSimulatedPurchases() : [];
  return (
    <PageMessages path="/credits">
      <div className="page-stack">
        <PageHeader
          title={translate("m2a6b24ad2872")}
          description={translate("me2c4efc7ff16")}
        />
        <CreditSummary
          account={account}
          historyPath="/credits"
          paged={cursor !== undefined}
        />
        {moduleEnabled("payments") && <CatalogPurchases key={session.uid} />}
        {catalog.mode === "simulation" ? (
          <PurchaseSimulator
            key={session.uid}
            uid={session.uid}
            initialKey={randomUUID()}
            packs={catalog.packs}
            orders={orders}
          />
        ) : catalog.mode === "stripe" && catalog.packs.length > 0 ? (
          <CreditCheckout
            key={session.uid}
            uid={session.uid}
            initialKey={randomUUID()}
            packs={catalog.packs}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate("mdb42aceed2c1")}
          </p>
        )}
      </div>
    </PageMessages>
  );
}
