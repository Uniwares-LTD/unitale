import { notFound } from "next/navigation";
import { adminPageSession } from "@/lib/server/admin-view";
import { database } from "@/lib/server/mongo";
import { moduleEnabled } from "@/lib/project";
import { bookletAdminView } from "@/lib/server/booklets/admin";
import { PageHeader } from "@/components/page-patterns";
import { AdminBooklets } from "@/project/booklets/admin-booklets";

export const metadata = { title: "Booklets" };

export default async function Page() {
  if (!moduleEnabled("booklets")) notFound();
  const actor = await adminPageSession();
  const initial = await bookletAdminView(database(), actor);
  return (
    <div className="page-stack">
      <PageHeader
        title="Booklets"
        description="Choose the package for new conversations and manage retry defaults for new productions."
      />
      <AdminBooklets initial={initial} />
    </div>
  );
}
