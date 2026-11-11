import "server-only";
import type { Db } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import {
  startConsumption,
  continueConsumption,
  finishConsumptionWorkflow,
  quoteRevision,
  startRevision,
  getConsumptionOrder,
} from "../commerce/orders";
import { bookletContext, bookletConflict } from "./context";
import { id } from "./documents";
import {
  revisionRequestSchema,
  validateBookletRevisionScope,
  type RevisionRequest,
} from "./lifecycle";

// Financial/lifecycle facts only. Manager owns creative acceptance and next actions.
// Existing commerce journals supply charge/continuation idempotency and verified
// termination. No provider dispatch or second scheduler lives in this service.
export function bookletLifecycleV2(
  db: Db,
  actor: CreditActor,
  now = () => new Date(),
) {
  const c = bookletContext(db, actor, now);
  const owned = (productionId: string) =>
    c.transaction((session) => c.owned(id.parse(productionId), session, 2));
  async function releasePrevious(productionId: string, orderId: string, requestedWorkflowId: string) {
    // Exact repeats belong to the existing commerce journal. They must never
    // release a newer flow, including an unbound or still-running successor.
    if (await db.collection("consumptionWorkflows").findOne({
      _id: requestedWorkflowId as never, uid: actor.uid, orderId,
    })) return;
    const order = await getConsumptionOrder(db, actor, orderId);
    if (order.value.targetId !== productionId) throw bookletConflict("Run target mismatch.");
    if (order.activeWorkflow && order.activeWorkflow !== requestedWorkflowId)
      // Existing service rechecks terminal job evidence atomically. Unknown or
      // unbound predecessors remain busy; no provider call or new queue is used.
      await finishConsumptionWorkflow(db, actor, orderId, order.activeWorkflow);
  }
  return {
    async start(productionId: string) {
      const p = await owned(productionId);
      return startConsumption(
        db,
        actor,
        p.orderId,
        "booklet-initial",
        async (session, order) => {
          const live = await c.owned(productionId, session, 2);
          if (live.lifecycleState !== "draft")
            throw bookletConflict("Production already started.");
          live.lifecycleState = "in-progress";
          live.expiresAt =
            order.value.terms.entitlementDays === null
              ? null
              : new Date(
                  now().getTime() +
                    order.value.terms.entitlementDays * 86400000,
                );
          await c.save(live, live.version, session);
        },
      );
    },
    async continue(productionId: string, requestId: string) {
      id.parse(requestId);
      const p = await owned(productionId);
      await releasePrevious(productionId, p.orderId, fingerprint([p.orderId, "continue", requestId]));
      return continueConsumption(
        db,
        actor,
        p.orderId,
        requestId,
        fingerprint([productionId, requestId]),
        async (session) => {
          const live = await c.owned(productionId, session, 2);
          await c.entitled(live, session);
          if (
            live.lifecycleState !== "in-progress" ||
            (live.expiresAt && live.expiresAt <= now())
          )
            throw bookletConflict("Only unfinished production can continue.");
          await c.save(live, live.version, session);
        },
      );
    },
    async finishRun(productionId: string, workflowId: string) {
      const p = await owned(productionId);
      return finishConsumptionWorkflow(db, actor, p.orderId, workflowId);
    },
    async quoteRevision(productionId: string, raw: RevisionRequest) {
      const value = revisionRequestSchema.parse(raw);
      const p = await c.transaction(async (session) => {
        const p = await c.owned(productionId, session, 2);
        await c.entitled(p, session);
        validateBookletRevisionScope(p, value);
        return p;
      });
      const { expectedVersion, ...request } = value;
      return quoteRevision(db, actor, p.orderId, {
        ...request,
        inputHash: fingerprint([request.inputHash, expectedVersion]),
      });
    },
    async startRevision(
      productionId: string,
      raw: RevisionRequest,
      quoteHash: string,
      credits: number,
    ) {
      const value = revisionRequestSchema.parse(raw);
      const p = await owned(productionId);
      await releasePrevious(productionId, p.orderId, fingerprint([p.orderId, "revision", value.requestId]));
      const { expectedVersion, ...request } = value;
      return startRevision(
        db,
        actor,
        p.orderId,
        {
          ...request,
          inputHash: fingerprint([request.inputHash, expectedVersion]),
        },
        quoteHash,
        credits,
        async (session) => {
          const live = await c.owned(productionId, session, 2);
          await c.entitled(live, session);
          validateBookletRevisionScope(live, value);
          live.revisionChargeId = fingerprint([
            live.orderId,
            "revision",
            request.requestId,
          ]);
          live.lifecycleState = "in-progress";
          await c.save(live, live.version, session);
        },
      );
    },
  };
}
