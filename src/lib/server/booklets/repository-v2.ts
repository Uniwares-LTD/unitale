import "server-only";
import { BSON, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import { bookletRetryPolicySchema } from "../../../project/booklets/contracts-v2";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import { bookletRepository } from "./repository";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import {
  id,
  mutationSchema,
  type Mutation,
  type ProductionDocument,
} from "./documents";
import {
  productionV2Schema,
  storedProductionSchema,
  type ProductionV2,
} from "./documents-v2";

type CreateInput = Parameters<
  ReturnType<typeof bookletRepository>["createProduction"]
>[0];
type Receipt = {
  _id: string;
  ownerId: string;
  productionId: string;
  scope: string;
  key: string;
  inputHash: string;
  result: {
    id: string;
    version: number;
    checkpointVersion?: number;
    fence?: number;
  };
  createdAt: Date;
};

// Explicit v2 entry point. Reuse v1 admission validation for newly created records
// inside the same transaction; no existing record is converted or exposed as v1.
export function bookletRepositoryV2(
  db: Db,
  actor: CreditActor,
  now = () => new Date(),
) {
  const base = bookletRepository(db, actor, { now });
  const context = bookletContext(db, actor, now);
  const productions = db.collection<ProductionV2>("bookletProductions");
  const mixedProductions = db.collection<ProductionV2 | ProductionDocument>(
    "bookletProductions",
  );
  const receipts = db.collection<Receipt>("bookletRepositoryWrites");
  async function owned(productionId: string, session: ClientSession) {
    const row = await productions.findOne(
      { _id: id.parse(productionId), ownerId: actor.uid },
      { session },
    );
    if (!row) throw bookletMissing();
    await base.getBook(row.bookletId);
    return productionV2Schema.parse(row);
  }
  function mutable(p: ProductionV2, expectedVersion: number) {
    if (
      p.version !== expectedVersion ||
      ["completed", "closed"].includes(p.lifecycleState) ||
      (p.expiresAt && p.expiresAt <= now())
    )
      throw bookletConflict("Production changed or is not mutable.");
  }
  function fenced(p: ProductionV2, value: Mutation) {
    mutable(p, value.expectedVersion);
    if (
      !p.mutationLease ||
      p.mutationLease.holderId !== value.holderId ||
      p.mutationLease.fence !== value.fence ||
      p.mutationLease.expiresAt <= now()
    )
      throw bookletConflict("Production mutation lease expired or changed.");
  }
  async function save(
    p: ProductionV2,
    previousVersion: number,
    session: ClientSession,
  ) {
    p.version = previousVersion + 1;
    p.updatedAt = now();
    productionV2Schema.parse(p);
    if (BSON.calculateObjectSize(p) > 1024 * 1024)
      throw bookletConflict("Production exceeds its storage limit.");
    const result = await productions.replaceOne(
      { _id: p._id, ownerId: actor.uid, version: previousVersion },
      p,
      { session },
    );
    if (result.modifiedCount !== 1)
      throw bookletConflict("Production changed.");
  }
  async function mutate(
    productionId: string,
    value: Mutation,
    method: string,
    input: unknown,
    effect: (p: ProductionV2) => void,
  ) {
    return context.transaction(async (session) => {
      const p = await owned(productionId, session);
      const identity = fingerprint([
        actor.uid,
        "production-v2",
        p._id,
        value.key,
      ]);
      const inputHash = fingerprint({ method, input });
      const prior = await receipts.findOne({ _id: identity }, { session });
      if (prior) {
        if (prior.inputHash !== inputHash)
          throw bookletConflict("Changed idempotency payload.");
        return prior.result;
      }
      fenced(p, value);
      effect(p);
      await save(p, value.expectedVersion, session);
      const result = {
        id: p._id,
        version: p.version,
        checkpointVersion: p.checkpointVersion,
      };
      await receipts.insertOne(
        {
          _id: identity,
          ownerId: actor.uid,
          productionId: p._id,
          scope: "production-v2:" + p._id,
          key: value.key,
          inputHash,
          result,
          createdAt: now(),
        },
        { session },
      );
      return result;
    });
  }
  return {
    async createProduction(
      input: CreateInput,
      rawRetryPolicy: z.input<typeof bookletRetryPolicySchema> = {},
    ) {
      const retryPolicy = bookletRetryPolicySchema.parse(rawRetryPolicy);
      const creationHash = fingerprint(
        JSON.parse(JSON.stringify({ input, retryPolicy })),
      );
      return context.transaction(async (session) => {
        const existing = await productions.findOne(
          { _id: id.parse(input.id) },
          { session },
        );
        if (existing) {
          const p = await owned(input.id, session);
          if (p.creationHash !== creationHash)
            throw bookletConflict("Changed production creation payload.");
          return { id: p._id, version: p.version };
        }
        if (input.sourceProductionId) {
          const source = await mixedProductions.findOne(
            { _id: input.sourceProductionId, ownerId: actor.uid },
            { session },
          );
          if (
            !source ||
            source.bookletId !== input.bookletId ||
            source._id === input.id
          )
            throw bookletMissing();
          storedProductionSchema.parse(source);
          await base.getBook(source.bookletId);
        }
        // Source ownership was checked with the mixed reader above. V1 validation
        // supplies order/package/brief checks without interpreting a v2 predecessor.
        const { sourceProductionId, ...creation } = input;
        await base.createProduction(creation, session);
        const created = await productions.findOne(
          { _id: input.id, ownerId: actor.uid },
          { session },
        );
        if (!created) throw bookletMissing();
        const p = productionV2Schema.parse({
          ...created,
          documentVersion: 2,
          sourceProductionId: sourceProductionId ?? null,
          creationHash,
          retryPolicy,
          checkpointVersion: 0,
          checkpoint: null,
        });
        const result = await mixedProductions.replaceOne(
          { _id: p._id, ownerId: actor.uid, documentVersion: 1 },
          p,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw bookletConflict("Production creation changed.");
        return { id: p._id, version: p.version };
      });
    },
    getProduction(productionId: string) {
      return context.transaction((session) => owned(productionId, session));
    },
    async acquireLease(
      productionId: string,
      input: {
        key: string;
        holderId: string;
        expectedVersion: number;
        durationMs: number;
      },
    ) {
      const value = z
        .strictObject({
          key: id,
          holderId: id,
          expectedVersion: z.number().int().positive().safe(),
          durationMs: z.number().int().min(1000).max(300000),
        })
        .parse(input);
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const identity = fingerprint([
          actor.uid,
          "production-v2",
          p._id,
          value.key,
        ]);
        const inputHash = fingerprint({ method: "acquireLease", input: value });
        const prior = await receipts.findOne({ _id: identity }, { session });
        if (prior) {
          if (prior.inputHash !== inputHash)
            throw bookletConflict("Changed idempotency payload.");
          return prior.result;
        }
        mutable(p, value.expectedVersion);
        if (p.mutationLease && p.mutationLease.expiresAt > now())
          throw bookletConflict("Production already leased.");
        p.fenceCounter++;
        p.mutationLease = {
          holderId: value.holderId,
          fence: p.fenceCounter,
          expiresAt: new Date(now().getTime() + value.durationMs),
        };
        await save(p, value.expectedVersion, session);
        const result = { id: p._id, version: p.version, fence: p.fenceCounter };
        await receipts.insertOne(
          {
            _id: identity,
            ownerId: actor.uid,
            productionId: p._id,
            scope: "production-v2:" + p._id,
            key: value.key,
            inputHash,
            result,
            createdAt: now(),
          },
          { session },
        );
        return result;
      });
    },
    checkpoint(
      productionId: string,
      input: Mutation & { expectedCheckpointVersion: number; state: unknown },
    ) {
      const value = mutationSchema
        .extend({
          expectedCheckpointVersion: z.number().int().nonnegative().safe(),
          state: z.json(),
        })
        .parse(input);
      return mutate(productionId, value, "checkpoint", value, (p) => {
        if (p.checkpointVersion !== value.expectedCheckpointVersion)
          throw bookletConflict("Checkpoint changed.");
        p.checkpoint = value.state;
        p.checkpointVersion++;
      });
    },
    releaseLease(productionId: string, input: Mutation) {
      const value = mutationSchema.parse(input);
      return mutate(productionId, value, "releaseLease", value, (p) => {
        p.mutationLease = null;
      });
    },
  };
}
