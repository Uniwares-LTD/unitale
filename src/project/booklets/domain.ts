import "server-only";
import type { DomainAdapter } from "../../lib/server/domains";
import {
  bookletContext,
  bookletConflict,
} from "../../lib/server/booklets/context";
import { validateBookletApproval } from "../../lib/server/booklets/lifecycle";
import { observeBookletNodeV2 } from "../../lib/server/booklets/observations-v2";
import { resumeBookletRetryV2 } from "../../lib/server/booklets/retry-v2";

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

// V2 retains product-only financial admission. Manager selects creative acceptance;
// applying a terminal Run never completes a booklet or applies a v1 approval gate.
export const bookletDomainV2: DomainAdapter = {
  id: "booklet",
  version: "2",
  kind: "booklet-production",
  picker: bookletDomain.picker,
  observeNode: observeBookletNodeV2,
  applicationWaitNodes: ["retry-wait"],
  resumePaused: resumeBookletRetryV2,
  async own(db, uid, id, session) {
    await bookletContext(db, { uid, authTime: 0 }).owned(id, session, 2);
  },
  async admit(db, uid, id, session) {
    await this.own(db, uid, id, session);
    throw bookletConflict(
      "Start from booklet admission so its paid entitlement is bound to the Run.",
    );
  },
  async apply(db, intent, session) {
    await this.own(db, intent.uid, intent.target.id, session);
  },
};
