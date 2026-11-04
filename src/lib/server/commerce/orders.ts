import "server-only";
import { z } from "zod";
import type { Db, ClientSession } from "mongodb";
import type {
  ConsumptionOrder,
  EntitlementAllocation,
} from "../../contracts/commerce";
import { consumptionOrderSchema } from "../../contracts/commerce";
import { accessTransaction } from "../store/access";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";
import { readWallet, spendCredits, adjustCredits } from "../store/credits";
import type { CreditActor } from "../store/credit-types";
import {
  publishedCatalog,
  type ProductType,
  validateDefinition,
} from "./catalogs";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const fail = (message: string) =>
  new AppError("CONSUMPTION_CONFLICT", message, 409);
type Order = {
  _id: string;
  value: ConsumptionOrder;
  fields: Record<string, z.infer<ReturnType<typeof z.json>>>;
  locks: string[];
  activeWorkflow: string | null;
};
type Workflow = {
  _id: string;
  orderId: string;
  uid: string;
  inputHash: string;
  state: "active" | "finished";
  jobId: string | null;
  outcome?: string;
};
type Charge = {
  _id: string;
  uid: string;
  orderId: string;
  kind: "package" | "revision";
  amount: number;
  refunded: number;
  ledgerId: string | null;
};
type Allocation = EntitlementAllocation & {
  _id: string;
  chargeId: string;
  revoked: boolean;
};
export type Admission = (
  session: ClientSession,
  order: Readonly<Order>,
) => Promise<void>;
const orders = (db: Db) => db.collection<Order>("consumptionOrders");
const flows = (db: Db) => db.collection<Workflow>("consumptionWorkflows");
const charges = (db: Db) => db.collection<Charge>("consumptionCharges");
const allocations = (db: Db) =>
  db.collection<Allocation>("consumptionAllocations");
async function owned(
  db: Db,
  uid: string,
  orderId: string,
  session?: ClientSession,
) {
  id.parse(orderId);
  const row = await orders(db).findOne(
    { _id: orderId, "value.ownerId": uid },
    { session },
  );
  if (!row) throw new AppError("ORDER_NOT_FOUND", "Order not found.", 404);
  return row;
}
function usable(row: Order, now: Date) {
  if (
    row.value.state !== "started" ||
    (row.value.expiresAt && Date.parse(row.value.expiresAt) <= now.getTime())
  )
    throw fail("This entitlement is closed or expired.");
}
export async function getConsumptionOrder(
  db: Db,
  actor: CreditActor,
  orderId: string,
) {
  let result: Order | undefined;
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      result = await owned(db, actor.uid, orderId, session);
    },
  });
  return result!;
}
// Admission must fence owned target, configuration and capacity in the same transaction.
// It is trusted product code, not a flag or callback received from an HTTP/MCP payload.
export async function queueConsumption(
  db: Db,
  actor: CreditActor,
  raw: {
    key: string;
    targetId: string;
    catalogId: string;
    revision: number;
    quoteHash: string;
    inputHash: string;
  },
  types: readonly ProductType[],
  admission: Admission,
) {
  const input = z
    .strictObject({
      key: id,
      targetId: id,
      catalogId: id,
      revision: z.number().int().positive(),
      quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
      inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .parse(raw);
  const orderId = fingerprint([actor.uid, "consumption", input.key]);
  const requestHash = fingerprint(input);
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const prior = await orders(db).findOne({ _id: orderId }, { session });
      if (prior) {
        if (prior.value.inputHash !== requestHash)
          throw fail("Changed order retry.");
        return;
      }
      const publication = await publishedCatalog(db, input.catalogId);
      if (
        !publication ||
        publication.revision !== input.revision ||
        publication.hash !== input.quoteHash
      )
        throw fail("Quote is unavailable.");
      const definition = validateDefinition(publication.definition, types);
      if (definition.kind !== "consumption")
        throw fail("Choose a consumption product.");
      if (
        await orders(db).findOne(
          { "value.ownerId": actor.uid, "value.targetId": input.targetId },
          { session },
        )
      )
        throw fail(
          "This production already has an order. Continue that order.",
        );
      const row: Order = {
        _id: orderId,
        fields: definition.fields,
        locks: [],
        activeWorkflow: null,
        value: consumptionOrderSchema.parse({
          schemaVersion: 1,
          id: orderId,
          ownerId: actor.uid,
          targetId: input.targetId,
          idempotencyKey: input.key,
          inputHash: requestHash,
          terms: definition.terms,
          state: "queued",
          chargedCredits: 0,
          refundedCredits: 0,
          chargeLedgerId: null,
          startedAt: null,
          expiresAt: null,
          createdAt: new Date().toISOString(),
        }),
      };
      await admission(session, row);
      await orders(db).insertOne(row, { session });
    },
  });
  return getConsumptionOrder(db, actor, orderId);
}
export async function startConsumption(
  db: Db,
  actor: CreditActor,
  orderId: string,
  workflowId: string,
  admission: Admission,
) {
  id.parse(workflowId);
  const row = await getConsumptionOrder(db, actor, orderId);
  const flowId = fingerprint([orderId, workflowId]);
  await spendCredits(
    db,
    actor,
    "consumption:" + orderId,
    row.value.terms.credits,
    orderId,
    {
      persist: async (session, result) => {
        const current = await owned(db, actor.uid, orderId, session);
        const prior = await flows(db).findOne({ _id: flowId }, { session });
        if (prior) return;
        if (current.value.state !== "queued" || current.activeWorkflow)
          throw fail("Order cannot start.");
        await admission(session, current);
        const now = new Date();
        current.value = consumptionOrderSchema.parse({
          ...current.value,
          state: "started",
          chargedCredits: current.value.terms.credits,
          chargeLedgerId: result.ledgerId,
          startedAt: now.toISOString(),
          expiresAt:
            current.value.terms.entitlementDays === null
              ? null
              : new Date(
                  now.getTime() +
                    current.value.terms.entitlementDays * 86400000,
                ).toISOString(),
        });
        current.activeWorkflow = flowId;
        await orders(db).replaceOne({ _id: orderId }, current, { session });
        await charges(db).insertOne(
          {
            _id: orderId,
            uid: actor.uid,
            orderId,
            kind: "package",
            amount: current.value.chargedCredits,
            refunded: 0,
            ledgerId: result.ledgerId!,
          },
          { session },
        );
        await flows(db).insertOne(
          {
            _id: flowId,
            uid: actor.uid,
            orderId,
            inputHash: fingerprint(["initial", workflowId]),
            state: "active",
            jobId: null,
          },
          { session },
        );
      },
    },
  );
  return {
    order: await getConsumptionOrder(db, actor, orderId),
    workflowId: flowId,
  };
}
export async function continueConsumption(
  db: Db,
  actor: CreditActor,
  orderId: string,
  requestId: string,
  inputHash: string,
  admission: Admission,
) {
  id.parse(requestId);
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(inputHash);
  const flowId = fingerprint([orderId, "continue", requestId]);
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const row = await owned(db, actor.uid, orderId, session);
      const prior = await flows(db).findOne({ _id: flowId }, { session });
      if (prior) {
        if (prior.inputHash !== inputHash)
          throw fail("Changed continuation retry.");
        return;
      }
      usable(row, new Date());
      if (row.activeWorkflow) throw fail("Production is busy.");
      await admission(session, row);
      await flows(db).insertOne(
        {
          _id: flowId,
          uid: actor.uid,
          orderId,
          inputHash,
          state: "active",
          jobId: null,
        },
        { session },
      );
      await orders(db).updateOne(
        { _id: orderId },
        { $set: { activeWorkflow: flowId } },
        { session },
      );
    },
  });
  return flowId;
}
const revisionSchema = z.strictObject({
  requestId: id,
  category: id,
  subjects: z.array(id).max(100),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
});
async function revisionQuote(
  db: Db,
  row: Order,
  raw: z.infer<typeof revisionSchema>,
  session?: ClientSession,
) {
  const input = revisionSchema.parse(raw);
  const terms = row.value.terms.allowances.find(
    (a) => a.category === input.category,
  );
  if (!terms || row.locks.includes(input.category))
    throw fail("Revision category is unavailable or locked.");
  if (
    new Set(input.subjects).size !== input.subjects.length ||
    (terms.unit === "subject"
      ? !input.subjects.length
      : input.subjects.length !== 0)
  )
    throw fail("Provide distinct subjects for subject allowances only.");
  const subjects: (string | null)[] =
    terms.unit === "request" ? [null] : [...input.subjects].sort();
  const units = [];
  let credits = 0;
  for (const subject of subjects) {
    const used = await allocations(db).countDocuments(
      {
        orderId: row._id,
        category: input.category,
        subjectId: subject,
        "funding.kind": "included",
        revoked: false,
      },
      { session },
    );
    const included = used < terms.included;
    if (!included && terms.extraCredits === null)
      throw fail("No revisions remain.");
    credits += included ? 0 : terms.extraCredits!;
    units.push({ subject, included, ordinal: used + 1 });
  }
  if (!Number.isSafeInteger(credits))
    throw fail("Revision quote exceeds supported limits.");
  return {
    input,
    units,
    credits,
    hash: fingerprint([row._id, input, units, credits]),
  };
}
export async function quoteRevision(
  db: Db,
  actor: CreditActor,
  orderId: string,
  input: z.infer<typeof revisionSchema>,
) {
  const row = await getConsumptionOrder(db, actor, orderId);
  usable(row, new Date());
  return revisionQuote(db, row, input);
}
export async function startRevision(
  db: Db,
  actor: CreditActor,
  orderId: string,
  raw: z.infer<typeof revisionSchema>,
  expectedQuoteHash: string,
  acceptedCredits: number,
  admission: Admission,
) {
  const input = revisionSchema.parse(raw);
  z.number().int().nonnegative().safe().parse(acceptedCredits);
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(expectedQuoteHash);
  const flowId = fingerprint([orderId, "revision", input.requestId]);
  const hash = fingerprint([input, expectedQuoteHash, acceptedCredits]);
  await spendCredits(db, actor, "revision:" + flowId, acceptedCredits, flowId, {
    persist: async (session, result) => {
      const row = await owned(db, actor.uid, orderId, session);
      const prior = await flows(db).findOne({ _id: flowId }, { session });
      if (prior) {
        if (prior.inputHash !== hash) throw fail("Changed revision retry.");
        return;
      }
      usable(row, new Date());
      if (row.activeWorkflow) throw fail("Production is busy.");
      const quote = await revisionQuote(db, row, input, session);
      if (quote.hash !== expectedQuoteHash || quote.credits !== acceptedCredits)
        throw fail("Refresh the revision quote.");
      await admission(session, row);
      for (const unit of quote.units) {
        const allocationId = fingerprint([flowId, unit.subject]);
        await allocations(db).insertOne(
          {
            _id: allocationId,
            schemaVersion: 1,
            id: allocationId,
            orderId,
            ownerId: actor.uid,
            requestId: input.requestId,
            category: input.category,
            subjectId: unit.subject,
            funding: unit.included
              ? { kind: "included", ordinal: unit.ordinal }
              : { kind: "paid", orderId: flowId },
            inputHash: input.inputHash,
            createdAt: new Date().toISOString(),
            chargeId: flowId,
            revoked: false,
          },
          { session },
        );
      }
      await charges(db).insertOne(
        {
          _id: flowId,
          uid: actor.uid,
          orderId,
          kind: "revision",
          amount: acceptedCredits,
          refunded: 0,
          ledgerId: result.ledgerId ?? null,
        },
        { session },
      );
      await flows(db).insertOne(
        {
          _id: flowId,
          uid: actor.uid,
          orderId,
          inputHash: hash,
          state: "active",
          jobId: null,
        },
        { session },
      );
      await orders(db).updateOne(
        { _id: orderId },
        { $set: { activeWorkflow: flowId } },
        { session },
      );
    },
  });
  return flowId;
}
// Called by trusted generation admission, before the first downstream dispatch.
export async function lockRevisionCategories(
  db: Db,
  actor: CreditActor,
  orderId: string,
  workflowId: string,
  categories: string[],
) {
  z.array(id).max(100).parse(categories);
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const row = await owned(db, actor.uid, orderId, session);
      usable(row, new Date());
      if (row.activeWorkflow !== workflowId)
        throw fail("Workflow is no longer active.");
      if (
        categories.some(
          (c) => !row.value.terms.allowances.some((a) => a.category === c),
        )
      )
        throw fail("Unknown category.");
      await orders(db).updateOne(
        { _id: orderId },
        { $addToSet: { locks: { $each: categories } } },
        { session },
      );
    },
  });
}
// Runs call this inside their existing admission transaction. One workflow binds one job.
export async function bindConsumptionJob(
  db: Db,
  uid: string,
  orderId: string,
  workflowId: string,
  jobId: string,
  targetId: string | undefined,
  session: ClientSession,
) {
  const row = await owned(db, uid, orderId, session);
  usable(row, new Date());
  if (row.value.targetId !== targetId || row.activeWorkflow !== workflowId)
    throw fail("Run target mismatch.");
  const flow = await flows(db).findOne(
    { _id: workflowId, orderId, uid, state: "active" },
    { session },
  );
  if (!flow || (flow.jobId && flow.jobId !== jobId))
    throw fail("Workflow already has an execution.");
  await flows(db).updateOne(
    { _id: workflowId },
    { $set: { jobId } },
    { session },
  );
  // Fence refunds/closure against binding.
  await orders(db).updateOne(
    { _id: orderId },
    { $set: { activeWorkflow: workflowId } },
    { session },
  );
}
// A retained verified terminal job is required; unknown outcomes keep the workflow busy.
async function releaseWorkflow(
  db: Db,
  uid: string,
  orderId: string,
  workflowId: string,
  mode: "bound" | "unbound" | "either",
  session: ClientSession,
) {
  const row = await owned(db, uid, orderId, session);
  const flow = await flows(db).findOne(
    { _id: workflowId, uid, orderId },
    { session },
  );
  if (!flow) throw fail("Workflow not found.");
  if (flow.state === "finished") return false;
  let outcome = "not-dispatched";
  if (flow.jobId) {
    if (mode === "unbound")
      throw fail("Bound workflows require verified termination.");
    const job = await db
      .collection<import("../ai/jobs").AiJob>("aiJobs")
      .findOne({ _id: flow.jobId, uid }, { session });
    if (
      !job ||
      !["succeeded", "failed", "cancelled"].includes(job.status) ||
      (!job.operatorResolved &&
        (!job.terminationEvidence || job.terminationEvidence === "unverified"))
    )
      throw fail("Reconcile the provider outcome first.");
    outcome = job.status;
  } else if (mode === "bound")
    throw fail(
      "Unbound workflow requires explicit abandonment before dispatch.",
    );
  if (row.activeWorkflow !== workflowId) throw fail("Workflow changed.");
  await flows(db).updateOne(
    { _id: workflowId },
    { $set: { state: "finished", outcome } },
    { session },
  );
  await orders(db).updateOne(
    { _id: orderId },
    { $set: { activeWorkflow: null } },
    { session },
  );
  return true;
}
export async function finishConsumptionWorkflow(
  db: Db,
  actor: CreditActor,
  orderId: string,
  workflowId: string,
) {
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      await releaseWorkflow(
        db,
        actor.uid,
        orderId,
        workflowId,
        "bound",
        session,
      );
    },
  });
}
export async function abandonUnboundWorkflow(
  db: Db,
  actor: CreditActor,
  orderId: string,
  workflowId: string,
) {
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      await releaseWorkflow(
        db,
        actor.uid,
        orderId,
        workflowId,
        "unbound",
        session,
      );
    },
  });
}
// Administrative recovery remains possible when the owner's session is revoked.
// This cannot bypass uncertain provider outcomes or refund the charge by itself.
export async function resolveConsumptionWorkflow(
  db: Db,
  admin: CreditActor,
  uid: string,
  orderId: string,
  workflowId: string,
  reason: string,
) {
  z.string().trim().min(1).max(300).parse(reason);
  await accessTransaction(
    db,
    admin.uid,
    async (session) => {
      if (
        await releaseWorkflow(db, uid, orderId, workflowId, "either", session)
      )
        await db
          .collection("auditEvents")
          .insertOne(
            {
              event: "consumption-workflow-release",
              actorUid: admin.uid,
              targetUid: uid,
              orderId,
              workflowId,
              reason,
              timestamp: new Date(),
            },
            { session },
          );
    },
    admin.authTime,
  );
}
export async function closeConsumption(
  db: Db,
  actor: CreditActor,
  orderId: string,
) {
  await readWallet(db, actor.uid, {
    actor,
    persist: async (session) => {
      const row = await owned(db, actor.uid, orderId, session);
      if (row.activeWorkflow) throw fail("Resolve active work before closing.");
      if (["closed", "cancelled", "refunded"].includes(row.value.state)) return;
      await orders(db).updateOne(
        { _id: orderId },
        {
          $set: {
            "value.state":
              row.value.state === "queued" ? "cancelled" : "closed",
          },
        },
        { session },
      );
    },
  });
}
export async function refundConsumption(
  db: Db,
  admin: CreditActor,
  uid: string,
  chargeId: string,
  key: string,
  amount: number,
  reason: string,
) {
  id.parse(chargeId);
  id.parse(key);
  z.string().trim().min(1).max(300).parse(reason);
  const refundId = fingerprint([uid, "consumption-refund", key]);
  const hash = fingerprint([chargeId, amount, reason]);
  await adjustCredits(
    db,
    admin,
    uid,
    "refund:" + refundId,
    { amount, direction: "grant", reason, expiresAt: null },
    {
      persist: async (session) => {
        const refunds = db.collection<{
          _id: string;
          hash: string;
          chargeId: string;
          amount: number;
        }>("consumptionRefunds");
        const prior = await refunds.findOne({ _id: refundId }, { session });
        if (prior) {
          if (prior.hash !== hash) throw fail("Changed refund retry.");
          return;
        }
        const charge = await charges(db).findOne(
          { _id: chargeId, uid },
          { session },
        );
        if (!charge || charge.refunded + amount > charge.amount)
          throw fail("Refund exceeds the original charge.");
        const row = await owned(db, uid, charge.orderId, session);
        if (row.activeWorkflow)
          throw fail("Resolve active work before refunding.");
        const refunded = charge.refunded + amount;
        await charges(db).updateOne(
          { _id: chargeId },
          { $set: { refunded } },
          { session },
        );
        if (charge.kind === "package")
          await orders(db).updateOne(
            { _id: row._id },
            {
              $set: {
                "value.refundedCredits": refunded,
                ...(refunded === charge.amount
                  ? { "value.state": "refunded" as const }
                  : {}),
              },
            },
            { session },
          );
        else if (refunded === charge.amount)
          await allocations(db).updateMany(
            { chargeId },
            { $set: { revoked: true } },
            { session },
          );
        await refunds.insertOne(
          { _id: refundId, hash, chargeId, amount },
          { session },
        );
      },
    },
  );
}
export async function createConsumptionIndexes(db: Db) {
  await orders(db).createIndex(
    { "value.ownerId": 1, "value.targetId": 1 },
    { unique: true },
  );
  await allocations(db).createIndex({ orderId: 1, category: 1, subjectId: 1 });
  await charges(db).createIndex({ uid: 1, orderId: 1 });
}
