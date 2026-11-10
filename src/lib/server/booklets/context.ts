import "server-only";
import { BSON, type ClientSession, type Db } from "mongodb";
import { AppError } from "../../auth-policy";
import { readWallet } from "../store/credits";
import type { CreditActor } from "../store/credit-types";
import { productionV2Schema, type ProductionV2 } from "./documents-v2";
import { fingerprint } from "../foundation/canonical";
import {
  bookDocumentSchema,
  productionDocumentSchema,
  revisionDocumentSchema,
  type ProductionDocument,
  type RevisionDocument,
  type Mutation,
  type BookDocument,
} from "./documents";

import { consumptionOrderSchema } from "../../contracts/commerce";
type OrderDocument = Awaited<
  ReturnType<typeof import("../commerce/orders").getConsumptionOrder>
>;

export const bookletConflict = (message: string) =>
  new AppError("BOOKLET_CONFLICT", message, 409);
export const bookletMissing = () =>
  new AppError("BOOKLET_NOT_FOUND", "Booklet record not found.", 404);
export function bookletContext(
  db: Db,
  actor: CreditActor,
  now = () => new Date(),
) {
  const productions = db.collection<ProductionDocument>("bookletProductions");
  async function owned(
    productionId: string,
    session?: ClientSession,
  ): Promise<ProductionDocument>;
  async function owned(
    productionId: string,
    session: ClientSession | undefined,
    version: 2,
  ): Promise<ProductionV2>;
  async function owned(
    productionId: string,
    session?: ClientSession,
    version: 1 | 2 = 1,
  ) {
    const row = await productions.findOne(
      { _id: productionId, ownerId: actor.uid },
      { session },
    );
    if (!row) throw bookletMissing();
    const book = await db.collection<BookDocument>("bookletBooks").findOne(
      {
        _id: row.bookletId,
        ownerId: actor.uid,
        "deletion.deletedAt": null,
      },
      { session },
    );
    if (!book) throw bookletMissing();
    bookDocumentSchema.parse(book);
    return version === 2
      ? productionV2Schema.parse(row)
      : productionDocumentSchema.parse(row);
  }
  async function transaction<T>(
    effect: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    let result!: T;
    await readWallet(db, actor.uid, {
      actor,
      persist: async (session) => {
        result = await effect(session);
      },
    });
    return result;
  }
  async function revision(
    p: ProductionDocument,
    revisionId: string,
    session?: ClientSession,
  ) {
    const row = await db
      .collection<RevisionDocument>("bookletRevisions")
      .findOne(
        { _id: revisionId, ownerId: actor.uid, productionId: p._id },
        { session },
      );
    if (!row) throw bookletMissing();
    return revisionDocumentSchema.parse(row);
  }
  function artifact(p: ProductionDocument, artifactId: string) {
    for (const subject of p.subjects) {
      const artifact = subject.artifacts.find((a) => a.id === artifactId);
      if (artifact) return { subject, artifact };
    }
    throw bookletMissing();
  }
  async function entitled(
    p: Pick<ProductionDocument, "_id" | "orderId" | "lifecycleState">,
    session: ClientSession,
  ) {
    const order = await db
      .collection<OrderDocument>("consumptionOrders")
      .findOne(
        {
          _id: p.orderId,
          "value.ownerId": actor.uid,
          "value.targetId": p._id,
          "value.state": "started",
        },
        { session },
      );
    if (
      !order ||
      (order.value.expiresAt && new Date(order.value.expiresAt) <= now()) ||
      p.lifecycleState === "closed"
    )
      throw bookletConflict("Production entitlement is unavailable.");
    consumptionOrderSchema.parse(order.value);
    return order;
  }
  function fence(p: ProductionDocument, value: Mutation, checkState = true) {
    if (
      (checkState && p.lifecycleState !== "in-progress") ||
      p.version !== value.expectedVersion ||
      p.mutationLease?.holderId !== value.holderId ||
      p.mutationLease.fence !== value.fence ||
      p.mutationLease.expiresAt <= now()
    )
      throw bookletConflict("Production changed or mutation lease expired.");
  }
  async function save(
    p: ProductionDocument,
    version: number,
    session: ClientSession,
    mutation?: Mutation,
  ) {
    if (mutation) fence(p, mutation, false);
    p.version = version + 1;
    p.updatedAt = now();
    productionDocumentSchema.parse(p);
    if (BSON.calculateObjectSize(p) > 1024 * 1024)
      throw new AppError(
        "BOOKLET_TOO_LARGE",
        "Production exceeds the storage limit.",
        413,
      );
    if (
      !(
        await productions.replaceOne(
          { _id: p._id, ownerId: actor.uid, version },
          p,
          { session },
        )
      ).modifiedCount
    )
      throw bookletConflict("Production changed.");
  }
  async function write<T>(
    p: ProductionDocument,
    key: string,
    input: unknown,
    session: ClientSession,
    effect: () => Promise<T>,
  ) {
    const rows = db.collection<{
      _id: string;
      ownerId: string;
      productionId: string;
      inputHash: string;
      result: T;
      createdAt: Date;
    }>("bookletServiceWrites");
    const identity = fingerprint([actor.uid, p._id, key]);
    const inputHash = fingerprint(input);
    const prior = await rows.findOne({ _id: identity }, { session });
    if (prior) {
      if (prior.inputHash !== inputHash)
        throw bookletConflict("Changed idempotency payload.");
      return prior.result;
    }
    const result = await effect();
    await rows.insertOne(
      {
        _id: identity,
        ownerId: actor.uid,
        productionId: p._id,
        inputHash,
        result,
        createdAt: now(),
      },
      { session },
    );
    return result;
  }
  return {
    owned,
    transaction,
    revision,
    artifact,
    entitled,
    fence,
    save,
    write,
  };
}
