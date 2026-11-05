import { adminPageSession } from "@/lib/server/admin-view";
import { database } from "@/lib/server/mongo";
import { commerceAdminView } from "@/lib/server/commerce/admin";
import { extensionProductTypes } from "@/lib/server/extensions";
import { serverExtensions } from "@/project/server";
import { moduleEnabled } from "@/lib/project";
import { PageHeader } from "@/components/page-patterns";
import { AdminCommerce } from "@/components/commerce/admin-commerce";
export const metadata = { title: "Commerce" };
export default async function Page() {
  const actor = await adminPageSession();
  const initial = await commerceAdminView(
    database(),
    actor,
    extensionProductTypes(serverExtensions, moduleEnabled),
  );
  return (
    <div className="page-stack">
      <PageHeader
        title="Commerce"
        description="Manage purchase offers, consumption products, coupons and their published versions."
      />
      <AdminCommerce initial={initial} />
    </div>
  );
}
