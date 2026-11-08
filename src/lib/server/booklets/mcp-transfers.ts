import "server-only";
import { Binary, type Db } from "mongodb";
import { createHash } from "node:crypto";
import { z } from "zod";
import { fingerprint } from "../foundation/canonical";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import type { CreditActor } from "../store/credit-types";
import { id } from "./documents";

export const chunkBytes = 8192;
export const transferSchema = z.strictObject({
  key: id,
  kind: z.enum(["image", "revision", "evidence"]),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(64 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
type Transfer = z.infer<typeof transferSchema> & {
  _id: string;
  ownerId: string;
  productionId: string;
  createdAt: Date;
  fence: number;
  evidenceInputHash?: string;
  completedEvidence?: { inputHash: string; result: unknown };
};
type Part = {
  _id: string;
  transferId: string;
  index: number;
  sha256: string;
  data?: Binary;
};
type Budget = {
  _id: string;
  ownerId: string;
  productionId: string;
  bytes: number;
};
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

export async function createBookletMcpIndexes(db: Db) {
  await db
    .collection("bookletMcpTransfers")
    .createIndex({ ownerId: 1, productionId: 1 });
  await db
    .collection("bookletMcpTransferParts")
    .createIndex({ transferId: 1, index: 1 }, { unique: true });
  await db.collection("bookletWorkflowPolicies").createIndex(
    {
      profileId: 1,
      profileRevision: 1,
      orchestratorId: 1,
      configurationRevision: 1,
    },
    { unique: true },
  );
}

// Private bounded staging; never fetches a URL or invokes a generation provider.
// Receipts survive Run continuation. No TTL can erase unresolved work.
export function bookletTransfers(
  db: Db,
  actor: CreditActor,
  productionId: string,
) {
  const c = bookletContext(db, actor);
  const records = db.collection<Transfer>("bookletMcpTransfers");
  const parts = db.collection<Part>("bookletMcpTransferParts");
  const budgets = db.collection<Budget>("bookletMcpTransferBudgets");
  async function owned(transferId: string) {
    await c.transaction((s) => c.owned(productionId, s));
    const row = await records.findOne({
      _id: transferId,
      ownerId: actor.uid,
      productionId,
    });
    if (!row) throw bookletMissing();
    return row;
  }
  return {
    async open(raw: z.input<typeof transferSchema>) {
      const input = transferSchema.parse(raw);
      if (input.kind !== "image" && input.bytes > 4 * 1024 * 1024)
        throw bookletConflict("JSON transfer exceeds 4 MiB.");
      if (input.kind === "evidence" && input.bytes > 1024 * 1024)
        throw bookletConflict("Split evidence into records of at most 1 MiB.");
      const transferId = fingerprint([actor.uid, productionId, input.key]);
      await c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        await c.entitled(p, s);
        const old = await records.findOne({ _id: transferId }, { session: s });
        if (old) {
          if (
            old.kind !== input.kind ||
            old.bytes !== input.bytes ||
            old.sha256 !== input.sha256
          )
            throw bookletConflict("Changed transfer identity.");
          return;
        }
        // A finite per-production staging budget prevents unbounded upload keys.
        const budgetId = fingerprint([actor.uid, productionId]);
        const used = await budgets.findOne({ _id: budgetId }, { session: s });
        const budget =
          p.creativeConfigSnapshot.execution.maxImageCalls * 64 * 1024 * 1024 +
          p.creativeConfigSnapshot.execution.maxTextCalls * 4 * 1024 * 1024;
        if ((used?.bytes ?? 0) + input.bytes > budget)
          throw bookletConflict("Production transfer budget exceeded.");
        // Every reservation writes the same row, preventing concurrent write skew.
        await budgets.updateOne(
          { _id: budgetId },
          {
            $setOnInsert: { ownerId: actor.uid, productionId },
            $inc: { bytes: input.bytes },
          },
          { upsert: true, session: s },
        );
        await records.insertOne(
          {
            ...input,
            _id: transferId,
            ownerId: actor.uid,
            productionId,
            createdAt: new Date(),
            fence: 0,
          },
          { session: s },
        );
      });
      return {
        transferId,
        chunkBytes,
        parts: Math.ceil(input.bytes / chunkBytes),
      };
    },
    async put(
      transferId: string,
      index: number,
      encoded: string,
      signal: AbortSignal,
      secret: string,
    ) {
      signal.throwIfAborted();
      const row = await owned(transferId);
      const data = Buffer.from(encoded, "base64");
      if (
        data.toString("base64") !== encoded ||
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= Math.ceil(row.bytes / chunkBytes) ||
        data.length !== Math.min(chunkBytes, row.bytes - index * chunkBytes)
      )
        throw bookletConflict("Invalid transfer chunk.");
      await c.transaction(async (s) => {
        signal.throwIfAborted();
        await c.entitled(await c.owned(productionId, s), s);
        await records.updateOne(
          { _id: transferId },
          { $inc: { fence: 1 } },
          { session: s },
        );
        const neighbors = await parts
          .find(
            { transferId, index: { $in: [index - 1, index + 1] } },
            { session: s },
          )
          .toArray();
        const before = neighbors.find((p) => p.index === index - 1)?.data;
        const after = neighbors.find((p) => p.index === index + 1)?.data;
        if (
          Buffer.concat([
            before ? Buffer.from(before.buffer) : Buffer.alloc(0),
            data,
            after ? Buffer.from(after.buffer) : Buffer.alloc(0),
          ]).includes(Buffer.from(secret))
        )
          throw bookletConflict("Private Run context cannot be transferred.");
        const key = fingerprint([transferId, index]);
        const old = await parts.findOne({ _id: key }, { session: s });
        if (old) {
          if (old.sha256 !== digest(data))
            throw bookletConflict("Changed transfer chunk.");
        } else
          await parts.insertOne(
            {
              _id: key,
              transferId,
              index,
              sha256: digest(data),
              data: new Binary(data),
            },
            { session: s },
          );
      });
      return { transferId, index };
    },
    async evidenceReceipt(transferId: string, inputHash: string) {
      return c.transaction(async (s) => {
        await c.entitled(await c.owned(productionId, s), s);
        const row = await records.findOne(
          { _id: transferId, ownerId: actor.uid, productionId },
          { session: s },
        );
        if (!row || row.kind !== "evidence") throw bookletMissing();
        if (row.evidenceInputHash && row.evidenceInputHash !== inputHash)
          throw bookletConflict(
            "Evidence transfer already consumed with different input.",
          );
        await records.updateOne(
          { _id: transferId },
          { $set: { evidenceInputHash: inputHash }, $inc: { fence: 1 } },
          { session: s },
        );
        return row.completedEvidence;
      });
    },
    async finishEvidence(
      transferId: string,
      inputHash: string,
      result: unknown,
    ) {
      await c.transaction(async (s) => {
        await c.entitled(await c.owned(productionId, s), s);
        const row = await records.findOne(
          { _id: transferId, ownerId: actor.uid, productionId },
          { session: s },
        );
        if (!row || row.kind !== "evidence") throw bookletMissing();
        if (
          row.completedEvidence &&
          row.completedEvidence.inputHash !== inputHash
        )
          throw bookletConflict(
            "Evidence transfer already consumed with different input.",
          );
        await records.updateOne(
          { _id: transferId },
          {
            $set: { completedEvidence: { inputHash, result } },
            $inc: { fence: 1 },
          },
          { session: s },
        );
        // Retain hashes for upload retry checks, but raw logs live only in evidence storage.
        await parts.updateMany(
          { transferId },
          { $unset: { data: "" } },
          { session: s },
        );
      });
    },
    async read(
      transferId: string,
      kind: Transfer["kind"],
      signal: AbortSignal,
    ) {
      const row = await owned(transferId);
      if (row.kind !== kind) throw bookletConflict("Wrong transfer kind.");
      const count = Math.ceil(row.bytes / chunkBytes);
      const values = await parts
        .find({ transferId })
        .sort({ index: 1 })
        .limit(count + 1)
        .toArray();
      signal.throwIfAborted();
      if (
        values.length !== count ||
        values.some(
          (p, i) =>
            p.index !== i ||
            p.data?.length() !==
              Math.min(chunkBytes, row.bytes - i * chunkBytes),
        )
      )
        throw bookletConflict("Transfer is incomplete.");
      const bytes = Buffer.concat(
        values.map((p) => Buffer.from(p.data!.buffer)),
      );
      if (digest(bytes) !== row.sha256)
        throw bookletConflict("Transfer hash mismatch.");
      await owned(transferId);
      return bytes;
    },
  };
}

export function boundedChunk(
  bytes: Buffer,
  offset: number,
  expectedHash?: string,
) {
  const sha256 = digest(bytes);
  if ((expectedHash && expectedHash !== sha256) || offset > bytes.length)
    throw bookletConflict(
      "Document changed or offset is invalid; restart the read.",
    );
  if (offset && !expectedHash)
    throw bookletConflict("Subsequent chunks require the document hash.");
  const end = Math.min(bytes.length, offset + chunkBytes);
  return {
    sha256,
    bytes: bytes.length,
    offset,
    nextOffset: end < bytes.length ? end : null,
    data: bytes.subarray(offset, end).toString("base64"),
  };
}
