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
        description="Action retry defaults for new booklet productions. Existing productions keep the defaults they started with."
      />
      <AdminBooklets initial={initial} />
    </div>
  );
}
