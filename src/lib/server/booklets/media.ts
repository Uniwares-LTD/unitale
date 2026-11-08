import "server-only";
import type { RevisionDocument } from "./documents";
import { createHash, randomUUID } from "node:crypto";
import { Binary, type Db, type ClientSession } from "mongodb";
import sharp from "sharp";
import { z } from "zod";
import { parseAssetConfig } from "../../config/assets";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import {
  s3ObjectStore,
  type ObjectReference,
  type PrivateObjectStore,
} from "../runs/object-store";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import { id } from "./documents";
import type { Generation } from "./lifecycle";
import { resolveReusedSource } from "./guards";

const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const PART = 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export type BookletAsset = {
  _id: string;
  documentVersion: 1;
  ownerId: string;
  productionId: string;
  operationId: string;
  outputKey: string;
  inputHash: string;
  sha256: string;
  bytes: number;
  mime: string;
  width: number;
  height: number;
  state: "staging" | "ready";
  storage: { kind: "mongo" } | { kind: "object"; object: ObjectReference };
  sourceRevisions: Generation["sources"];
  originalAssetId: string | null;
  attachments: string[];
  fence: number;
  createdAt: Date;
};
type Chunk = {
  _id: string;
  assetId: string;
  index: number;
  sha256: string;
  bytes: Binary;
};
export async function createBookletMediaIndexes(db: Db) {
  await db
    .collection("bookletAssets")
    .createIndex({ ownerId: 1, productionId: 1, operationId: 1 });
  await db
    .collection("bookletAssetBytes")
    .createIndex({ assetId: 1, index: 1 }, { unique: true });
}
function view(row: BookletAsset) {
  return {
    id: row._id,
    sha256: row.sha256,
    bytes: row.bytes,
    mime: row.mime,
    width: row.width,
    height: row.height,
    originalAssetId: row.originalAssetId,
    createdAt: row.createdAt.toISOString(),
  };
}
// Internal service only. Buffer comes from a bounded provider/evidence transfer,
// never a client URL or customer upload. No fetching arbitrary URLs here.
export function bookletMedia(
  db: Db,
  actor: CreditActor,
  options: {
    store?: PrivateObjectStore | null;
    maxBytes?: number;
    maxPixels?: number;
  } = {},
) {
  const c = bookletContext(db, actor);
  const records = db.collection<BookletAsset>("bookletAssets");
  const chunks = db.collection<Chunk>("bookletAssetBytes");
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const maxPixels = options.maxPixels ?? 16_000_000;
  z.number()
    .int()
    .min(1)
    .max(64 * 1024 * 1024)
    .parse(maxBytes);
  z.number().int().min(1).max(64_000_000).parse(maxPixels);
  function store() {
    if (options.store !== undefined) return options.store;
    const config = parseAssetConfig(process.env);
    return config.mode === "s3" ? s3ObjectStore(config) : null;
  }
  async function owned(
    productionId: string,
    assetId: string,
    s?: ClientSession,
  ) {
    await c.owned(productionId, s);
    const row = await records.findOne(
      { _id: assetId, ownerId: actor.uid, state: "ready" },
      { session: s },
    );
    if (!row) throw bookletMissing();
    if (row.productionId !== productionId) {
      const original = row.originalAssetId
        ? await records.findOne(
            {
              _id: row.originalAssetId,
              ownerId: actor.uid,
              productionId: row.productionId,
              originalAssetId: null,
              state: "ready",
            },
            { session: s },
          )
        : row;
      if (
        !original ||
        !(await db.collection<RevisionDocument>("bookletRevisions").findOne(
          {
            productionId,
            ownerId: actor.uid,
            _id: { $in: original.attachments },
            assets: {
              $elemMatch: { assetId: original._id, sha256: original.sha256 },
            },
          },
          { session: s },
        ))
      )
        throw bookletMissing();
    }
    return row;
  }
  async function read(productionId: string, assetId: string) {
    const row = await c.transaction((s) => owned(productionId, assetId, s));
    let bytes: Buffer;
    if (row.storage.kind === "object") {
      const backend = store();
      if (!backend || backend.id !== row.storage.object.storeId)
        throw bookletConflict("Original storage configuration is unavailable.");
      bytes = await backend.get(row.storage.object, {
        bytes: row.bytes,
        digest: row.sha256,
      });
    } else {
      const parts = await chunks
        .find({ assetId: row._id })
        .sort({ index: 1 })
        .limit(Math.ceil(row.bytes / PART) + 1)
        .toArray();
      if (parts.length !== Math.ceil(row.bytes / PART))
        throw bookletConflict("Original image is incomplete.");
      bytes = Buffer.concat(
        parts.map((part, i) => {
          const b = Buffer.from(part.bytes.buffer);
          if (
            part.index !== i ||
            b.length !== Math.min(PART, row.bytes - i * PART) ||
            digest(b) !== part.sha256
          )
            throw bookletConflict("Original image part failed verification.");
          return b;
        }),
      );
    }
    if (bytes.length !== row.bytes || digest(bytes) !== row.sha256)
      throw bookletConflict(
        "Original image hash differs from retained receipt.",
      );
    // Recheck deletion/access after storage IO.
    await c.transaction((s) => owned(productionId, assetId, s));
    return { asset: view(row), bytes };
  }
  async function retain(
    productionId: string,
    raw: {
      operationId: string;
      outputKey: string;
      sha256: string;
      mime: string;
    },
    bytes: Buffer,
    originalAssetId: string | null = null,
  ) {
    const input = z
      .strictObject({
        operationId: id,
        outputKey: id,
        sha256: hash,
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      })
      .parse(raw);
    if (
      !bytes.length ||
      bytes.length > maxBytes ||
      digest(bytes) !== input.sha256
    )
      throw bookletConflict(
        "Complete original bytes and their correct hash are required.",
      );
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        if (length > bytes.length - offset - 12 || type === "acTL")
          throw bookletConflict("Use a complete single-frame original image.");
        offset += length + 12;
        if (type === "IEND") break;
      }
    }
    const image = sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: maxPixels,
    });
    const meta = await image.metadata();
    if (
      !meta.width ||
      !meta.height ||
      (meta.pages ?? 1) !== 1 ||
      `image/${meta.format}` !== input.mime
    )
      throw bookletConflict("Unsupported image format or dimensions.");
    // Decode for validation, but persist the original buffer, including metadata.
    await image.clone().raw().toBuffer();
    const assetId = fingerprint([
      actor.uid,
      productionId,
      input.operationId,
      input.outputKey,
      originalAssetId,
    ]);
    const inputHash = fingerprint({
      input,
      bytes: bytes.length,
      originalAssetId,
    });
    const backend = store();
    const receipt = await c.transaction(async (s) => {
      const p = await c.owned(productionId, s);
      const prior = await records.findOne({ _id: assetId }, { session: s });
      if (prior) {
        if (prior.inputHash !== inputHash)
          throw bookletConflict(
            "Asset key was reused with different bytes or metadata.",
          );
        return prior;
      }
      if (!originalAssetId) await c.entitled(p, s);
      const operation = await db
        .collection<Generation>("bookletGenerations")
        .findOne(
          { _id: input.operationId, productionId, ownerId: actor.uid },
          { session: s },
        );
      if (
        !operation ||
        (!originalAssetId &&
          !["authorized", "unknown"].includes(operation.state))
      )
        throw bookletConflict("An authorized generation receipt is required.");
      if (
        !originalAssetId &&
        (await records.findOne(
          {
            productionId,
            operationId: input.operationId,
            originalAssetId: null,
          },
          { session: s },
        ))
      )
        throw bookletConflict(
          "Generation already has a retained original; reuse its receipt.",
        );
      if (originalAssetId) {
        const original = await owned(productionId, originalAssetId, s);
        if (original.operationId !== operation._id || original.originalAssetId)
          throw bookletConflict(
            "Derivative must identify the generation's original.",
          );
      }
      const row: BookletAsset = {
        _id: assetId,
        documentVersion: 1,
        ownerId: actor.uid,
        productionId,
        operationId: operation._id,
        outputKey: input.outputKey,
        inputHash,
        sha256: input.sha256,
        bytes: bytes.length,
        mime: input.mime,
        width: meta.width!,
        height: meta.height!,
        state: "staging",
        storage: backend
          ? {
              kind: "object",
              object: { storeId: backend.id, key: backend.key(randomUUID()) },
            }
          : { kind: "mongo" },
        sourceRevisions: operation.sources,
        originalAssetId,
        attachments: [],
        fence: 0,
        createdAt: new Date(),
      };
      await records.insertOne(row, { session: s });
      return row;
    });
    if (receipt.state === "ready") return view(receipt);
    if (receipt.storage.kind === "object") {
      if (!backend || backend.id !== receipt.storage.object.storeId)
        throw bookletConflict("Retained storage configuration changed.");
      // Same immutable key and same verified bytes make uncertain writes retryable.
      await backend.put(
        receipt.storage.object.key,
        bytes,
        receipt.mime,
        receipt.sha256,
      );
      await backend.get(receipt.storage.object, {
        bytes: receipt.bytes,
        digest: receipt.sha256,
      });
    } else {
      for (
        let offset = 0, index = 0;
        offset < bytes.length;
        offset += PART, index++
      ) {
        const part = bytes.subarray(offset, offset + PART);
        await chunks.updateOne(
          { _id: fingerprint([assetId, index]) },
          {
            $setOnInsert: {
              assetId,
              index,
              sha256: digest(part),
              bytes: new Binary(part),
            },
          },
          { upsert: true },
        );
      }
    }
    await c.transaction(async (s) => {
      await c.owned(productionId, s);
      await records.updateOne(
        { _id: assetId, inputHash },
        { $set: { state: "ready" }, $inc: { fence: 1 } },
        { session: s },
      );
    });
    return (await read(productionId, assetId)).asset;
  }
  return {
    retainOriginal: (
      productionId: string,
      input: Parameters<typeof retain>[1],
      bytes: Buffer,
    ) => retain(productionId, input, bytes),
    read,
    async reviewerInputs(productionId: string, revisionId: string) {
      const revision = await c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        const revision = await c.revision(p, revisionId, s);
        if (
          !["reference", "page-image"].includes(revision.kind) ||
          revision.assets.length !== 1
        )
          throw bookletConflict(
            "Visual review requires one original image revision.",
          );
        if (
          c.artifact(p, revision.artifactId).artifact.currentRevisionId !==
          revisionId
        )
          throw bookletConflict("Review target changed.");
        return revision;
      });
      const original = await read(productionId, revision.assets[0].assetId);
      if (
        original.asset.sha256 !== revision.assets[0].sha256 ||
        original.asset.originalAssetId
      )
        throw bookletConflict("Reviewer target is not the original.");
      const sources = await c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        const values = [];
        for (const source of revision.sources) {
          const local = await db
            .collection<RevisionDocument>("bookletRevisions")
            .findOne(
              {
                _id: source.revisionId,
                productionId,
                ownerId: actor.uid,
              },
              { session: s },
            );
          const row = local
            ? await c.revision(p, source.revisionId, s)
            : await resolveReusedSource(db, p, source.revisionId, s);
          const artifact = local
            ? c.artifact(p, source.artifactId).artifact
            : null;
          if (
            row.contentHash !== source.sha256 ||
            (artifact &&
              (artifact.acceptedRevisionId !== row._id ||
                artifact.currentRevisionId !== row._id))
          )
            throw bookletConflict("Reviewer sources are no longer approved.");
          values.push({
            identity: source,
            content: row.content,
            assets: row.assets,
          });
        }
        return values;
      });
      const referenceImages = [];
      let bytes = original.bytes.length;
      for (const source of sources)
        for (const identity of source.assets) {
          const row = await c.transaction((s) =>
            owned(productionId, identity.assetId, s),
          );
          bytes += row.bytes;
          if (bytes > maxBytes)
            throw bookletConflict(
              "Reviewer image inputs exceed the bounded transfer limit.",
            );
          const image = await read(productionId, identity.assetId);
          if (
            image.asset.sha256 !== identity.sha256 ||
            image.asset.originalAssetId
          )
            throw bookletConflict(
              "Reviewer source is not the approved original.",
            );
          referenceImages.push({
            revisionId: source.identity.revisionId,
            ...image,
          });
        }
      return {
        target: {
          artifactId: revision.artifactId,
          revisionId: revision._id,
          sha256: revision.contentHash,
        },
        original,
        sources,
        referenceImages,
      };
    },
    async derivative(productionId: string, assetId: string, width = 512) {
      z.number().int().min(64).max(2048).parse(width);
      const original = await read(productionId, assetId);
      if (original.asset.originalAssetId)
        throw bookletConflict("A derivative cannot be used as an original.");
      const row = await c.transaction((s) => owned(productionId, assetId, s));
      const bytes = await sharp(original.bytes)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp()
        .toBuffer();
      return retain(
        row.productionId,
        {
          operationId: row.operationId,
          outputKey: `display-v1-${width}`,
          sha256: digest(bytes),
          mime: "image/webp",
        },
        bytes,
        assetId,
      );
    },
    async references(productionId: string, operationId: string) {
      const references = await c.transaction(async (s) => {
        const p = await c.owned(productionId, s);
        await c.entitled(p, s);
        const operation = await db
          .collection<Generation>("bookletGenerations")
          .findOne(
            {
              _id: operationId,
              productionId,
              ownerId: actor.uid,
              state: "authorized",
            },
            { session: s },
          );
        if (!operation) throw bookletMissing();
        const result: {
          revisionId: string;
          assetId: string;
          sha256: string;
        }[] = [];
        let totalBytes = 0;
        for (const source of operation.sources) {
          const row = await c.revision(p, source.revisionId, s);
          const entry = c.artifact(p, source.artifactId).artifact;
          if (
            row.contentHash !== source.sha256 ||
            entry.acceptedRevisionId !== row._id ||
            entry.currentRevisionId !== row._id
          )
            throw bookletConflict("Reference approval changed.");
          for (const asset of row.assets) {
            const retained = await owned(productionId, asset.assetId, s);
            if (
              retained.originalAssetId ||
              retained.sha256 !== asset.sha256 ||
              !retained.attachments.includes(row._id)
            )
              throw bookletConflict(
                "Approved original reference is unavailable.",
              );
            totalBytes += retained.bytes;
            if (totalBytes > maxBytes)
              throw bookletConflict(
                "Reference images exceed the bounded transfer limit.",
              );
            result.push({
              revisionId: row._id,
              assetId: retained._id,
              sha256: retained.sha256,
            });
          }
        }
        return result;
      });
      const result = [];
      for (const ref of references)
        result.push({ ...ref, ...(await read(productionId, ref.assetId)) });
      return result;
    },
  };
}
