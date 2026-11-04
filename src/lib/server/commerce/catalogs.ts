import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Db, ClientSession } from "mongodb";
import {
  consumptionTermsSchema,
  purchaseTermsSchema,
} from "../../contracts/commerce";
import { accessTransaction } from "../store/access";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";

export type ProductType = {
  id: string;
  schemaVersion: number;
  fields: z.ZodType;
};
const productDefinition = z.strictObject({
  kind: z.literal("consumption"),
  terms: consumptionTermsSchema,
  fields: z.record(z.string(), z.json()),
});
const purchaseDefinition = z.strictObject({
  kind: z.literal("purchase"),
  terms: purchaseTermsSchema,
});
export const catalogDefinitionSchema = z.discriminatedUnion("kind", [
  purchaseDefinition,
  productDefinition,
]);
type Definition = z.infer<typeof catalogDefinitionSchema>;
type Actor = { uid: string; auth_time: number };
type Head = {
  _id: string;
  revision: number;
  draft: Definition;
  publishedRevision: number | null;
  updatedAt: Date;
};
type Publication = {
  _id: string;
  catalogId: string;
  revision: number;
  definition: Definition;
  hash: string;
  publishedAt: Date;
  actorUid: string;
};
const key = (kind: string, id: string) => kind + ":" + id;
const conflict = () =>
  new AppError(
    "CATALOG_CONFLICT",
    "Catalog changed. Preview the current revision.",
    409,
  );
export function validateDefinition(
  raw: unknown,
  types: readonly ProductType[],
) {
  const parsed = catalogDefinitionSchema.parse(raw);
  if (
    new Set(types.map((t) => t.id + ":" + t.schemaVersion)).size !==
    types.length
  )
    throw new Error("Duplicate product type registration.");
  if (parsed.kind === "consumption") {
    const type = types.find(
      (t) =>
        t.id === parsed.terms.productType &&
        t.schemaVersion === parsed.terms.productSchemaVersion,
    );
    if (!type)
      throw new AppError(
        "PRODUCT_TYPE_UNAVAILABLE",
        "Product type version is unavailable.",
        409,
      );
    parsed.fields = z
      .record(z.string(), z.json())
      .parse(type.fields.parse(parsed.fields));
  }
  return parsed;
}
export async function saveCatalogDraft(
  db: Db,
  actor: Actor,
  raw: unknown,
  expectedRevision: number,
  types: readonly ProductType[],
) {
  const draft = validateDefinition(raw, types);
  z.number().int().nonnegative().safe().parse(expectedRevision);
  if (draft.terms.identity.revision !== expectedRevision + 1) throw conflict();
  const id = key(draft.kind, draft.terms.identity.id);
  return accessTransaction(
    db,
    actor.uid,
    async (session) => {
      const heads = db.collection<Head>("commerceCatalogs");
      const old = await heads.findOne({ _id: id }, { session });
      if ((old?.revision ?? 0) !== expectedRevision) throw conflict();
      const next: Head = {
        _id: id,
        revision: expectedRevision + 1,
        draft,
        publishedRevision: old?.publishedRevision ?? null,
        updatedAt: new Date(),
      };
      if (old)
        await heads.replaceOne({ _id: id, revision: expectedRevision }, next, {
          session,
        });
      else await heads.insertOne(next, { session });
      await audit(db, session, actor.uid, "catalog-draft", id, next.revision);
      return { id, revision: next.revision };
    },
    actor.auth_time,
  );
}
export async function previewCatalog(
  db: Db,
  actor: Actor,
  id: string,
  types: readonly ProductType[],
) {
  return accessTransaction(
    db,
    actor.uid,
    async (session) => {
      const row = await db
        .collection<Head>("commerceCatalogs")
        .findOne({ _id: id }, { session });
      if (!row)
        throw new AppError("CATALOG_NOT_FOUND", "Catalog not found.", 404);
      const definition = validateDefinition(row.draft, types);
      return {
        id,
        revision: row.revision,
        definition,
        hash: fingerprint(definition),
      };
    },
    actor.auth_time,
  );
}
export async function publishCatalog(
  db: Db,
  actor: Actor,
  id: string,
  expectedRevision: number,
  previewHash: string,
  types: readonly ProductType[],
) {
  await accessTransaction(
    db,
    actor.uid,
    async (session) => {
      const heads = db.collection<Head>("commerceCatalogs");
      const row = await heads.findOne({ _id: id }, { session });
      if (!row || row.revision !== expectedRevision) throw conflict();
      const definition = validateDefinition(row.draft, types);
      const hash = fingerprint(definition);
      if (hash !== previewHash) throw conflict();
      const publicationId = id + ":" + row.revision;
      const versions = db.collection<Publication>("commerceCatalogVersions");
      const previous = await versions.findOne(
        { _id: publicationId },
        { session },
      );
      if (previous) {
        if (previous.hash !== hash) throw conflict();
        return;
      }
      if (definition.kind === "purchase") {
        const mappingId = fingerprint(
          definition.terms.channel === "stripe"
            ? { channel: "stripe", priceId: definition.terms.provider.priceId }
            : {
                channel: definition.terms.channel,
                ...definition.terms.provider,
              },
        );
        const mappings = db.collection<{ _id: string; catalogId: string }>(
          "commerceProviderMappings",
        );
        const mapping = await mappings.findOne({ _id: mappingId }, { session });
        if (mapping && mapping.catalogId !== id)
          throw new AppError(
            "PROVIDER_MAPPING_CONFLICT",
            "Provider price is already assigned.",
            409,
          );
        await mappings.updateOne(
          { _id: mappingId },
          { $setOnInsert: { catalogId: id } },
          { upsert: true, session },
        );
      }
      await versions.insertOne(
        {
          _id: publicationId,
          catalogId: id,
          revision: row.revision,
          definition,
          hash,
          publishedAt: new Date(),
          actorUid: actor.uid,
        },
        { session },
      );
      await heads.updateOne(
        { _id: id },
        { $set: { publishedRevision: row.revision } },
        { session },
      );
      await audit(db, session, actor.uid, "catalog-publish", id, row.revision);
    },
    actor.auth_time,
  );
  const saved = await publishedCatalog(db, id, expectedRevision);
  if (!saved || fingerprint(saved.definition) !== previewHash)
    throw new Error("Catalog publication readback failed.");
  return saved;
}
export async function publishedCatalog(db: Db, id: string, revision?: number) {
  const selected =
    revision ??
    (await db.collection<Head>("commerceCatalogs").findOne({ _id: id }))
      ?.publishedRevision;
  if (!selected) return null;
  const row = await db
    .collection<Publication>("commerceCatalogVersions")
    .findOne({ _id: id + ":" + selected });
  if (!row) return null;
  return {
    id,
    revision: row.revision,
    hash: row.hash,
    definition: catalogDefinitionSchema.parse(row.definition),
  };
}
async function audit(
  db: Db,
  session: ClientSession,
  actorUid: string,
  event: string,
  target: string,
  revision: number,
) {
  await db
    .collection<{
      _id: string;
      event: string;
      actorUid: string;
      target: string;
      revision: number;
      timestamp: Date;
    }>("auditEvents")
    .insertOne(
      {
        _id: randomUUID(),
        event,
        actorUid,
        target,
        revision,
        timestamp: new Date(),
      },
      { session },
    );
}
export async function createCatalogIndexes(db: Db) {
  await db
    .collection("commerceCatalogVersions")
    .createIndex({ catalogId: 1, revision: 1 }, { unique: true });
}
