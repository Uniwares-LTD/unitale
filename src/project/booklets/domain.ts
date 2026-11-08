import "server-only";
import type { DomainAdapter } from "../../lib/server/domains";
import {
  bookletContext,
  bookletConflict,
} from "../../lib/server/booklets/context";
import { validateBookletApproval } from "../../lib/server/booklets/lifecycle";

export const bookletDomain: DomainAdapter = {
  id: "booklet",
  version: "1",
  kind: "booklet-production",
  // The picker route is supplied with the T21 creator UI. No production
  // orchestrator is registered until T20 and no endpoint is installed here.
  picker: { label: "Booklet production", path: "/api/booklets" },
  async own(db, uid, id, session) {
    await bookletContext(db, { uid, authTime: 0 }).owned(id, session);
  },
  async admit(db, uid, id, session) {
    await this.own(db, uid, id, session);
    throw bookletConflict(
      "Start from booklet admission so its paid entitlement is bound to the Run.",
    );
  },
  async apply(db, intent, session) {
    // A terminal orchestrator Run does not itself approve or complete a book.
    await this.own(db, intent.uid, intent.target.id, session);
  },
  approval: validateBookletApproval,
};
