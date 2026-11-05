import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import { accessTransaction } from "../store/access";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";
import {
  previewCatalog,
  publishCatalog,
  saveCatalogDraft,
  type ProductType,
  catalogDefinitionSchema,
} from "./catalogs";
import {
  prepareProviderPublication,
  executeProviderAction,
  type ProviderActionAdapter,
  type ProviderAction,
} from "./provider-actions";
import { providerCatalogDraftSchema } from "./provider-catalog";
import { refundConsumption } from "./orders";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const revision = z.number().int().positive();
const binding = z.object({
  catalogId: id,
  revision,
  definitionHash: z.string().length(64),
  providerDraft: z.unknown(),
});
export const commerceAdminCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("save"),
    definition: z.unknown(),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.strictObject({ action: z.literal("preview"), id }),
  z.strictObject({
    action: z.literal("publish"),
    id,
    revision,
    hash: z.string().length(64),
  }),
  z.strictObject({
    action: z.literal("provider-preview"),
    id,
    draft: z.unknown(),
  }),
  z.strictObject({
    action: z.literal("provider-publish"),
    key: id,
    preview: binding,
    hash: z.string().length(64),
  }),
  z.strictObject({ action: z.literal("provider-reconcile"), id }),
  z.strictObject({
    action: z.literal("refund"),
    uid: z.string().min(1).max(128),
    chargeId: id,
    key: id,
    amount: z.number().int().positive().safe(),
    reason: z.string().trim().min(1).max(300),
  }),
]);
type Actor = { uid: string; auth_time: number };
export async function commerceAdminView(
  db: Db,
  actor: Actor,
  types: readonly ProductType[],
  query: { section?: string; after?: string; uid?: string } = {},
) {
  const section = z
    .enum(["catalogs", "subscriptions", "orders", "publications"])
    .parse(query.section ?? "catalogs");
  const after = query.after ? id.parse(query.after) : null;
  const uid = query.uid ? z.string().min(1).max(128).parse(query.uid) : null;
  return accessTransaction(
    db,
    actor.uid,
    async (session) => {
      const sources = {
        catalogs: {
          collection: "commerceCatalogs",
          projection: { _id: 1, revision: 1, draft: 1, publishedRevision: 1 },
        },
        subscriptions: {
          collection: "billingIntents",
          projection: {
            _id: 1,
            uid: 1,
            checkoutId: 1,
            terms: 1,
            state: 1,
            nextTerms: 1,
            periodEnd: 1,
            cancelAtPeriodEnd: 1,
          },
        },
        orders: {
          collection: "consumptionCharges",
          projection: {
            _id: 1,
            uid: 1,
            orderId: 1,
            kind: 1,
            amount: 1,
            refunded: 1,
          },
        },
        publications: {
          collection: "billingProviderActions",
          projection: {
            _id: 1,
            subjectId: 1,
            input: 1,
            state: 1,
            result: 1,
            createdAt: 1,
          },
        },
      }[section];
      const rows = await db
        .collection(sources.collection)
        .find(
          {
            ...(after ? { _id: { $gt: after as never } } : {}),
            ...(uid && ["orders", "subscriptions"].includes(section)
              ? { uid }
              : {}),
            ...(section === "publications" ? { kind: "publish" } : {}),
            ...(section === "subscriptions"
              ? { "terms.billing.kind": "subscription" }
              : {}),
          },
          { session, projection: sources.projection },
        )
        .sort({ _id: 1 })
        .limit(51)
        .toArray();
      return {
        section,
        rows: rows
          .slice(0, 50)
          .map(
            (row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>,
          ),
        next: rows.length > 50 ? String(rows[49]._id) : null,
        catalogSchema: z.toJSONSchema(catalogDefinitionSchema, {
          unrepresentable: "any",
        }),
        providerSchema: z.toJSONSchema(providerCatalogDraftSchema, {
          unrepresentable: "any",
        }),
        productTypes: types.map((type) => ({
          id: type.id,
          schemaVersion: type.schemaVersion,
          fields: z.toJSONSchema(type.fields, { unrepresentable: "any" }),
        })),
      };
    },
    actor.auth_time,
  );
}
async function executeAdminAction(
  db: Db,
  actor: Actor,
  raw: unknown,
  types: readonly ProductType[],
  provider: (draft: unknown) => ProviderActionAdapter,
) {
  // Every command authenticates current admin access, including provider readback.
  await accessTransaction(db, actor.uid, async () => {}, actor.auth_time);
  const input = commerceAdminCommand.parse(raw);
  if (input.action === "save")
    return saveCatalogDraft(
      db,
      actor,
      input.definition,
      input.expectedRevision,
      types,
    );
  if (input.action === "preview")
    return previewCatalog(db, actor, input.id, types);
  if (input.action === "publish") {
    await publishCatalog(
      db,
      actor,
      input.id,
      input.revision,
      input.hash,
      types,
    );
    return { published: true, id: input.id, revision: input.revision };
  }
  if (input.action === "provider-preview") {
    const catalog = await previewCatalog(db, actor, input.id, types);
    const providerDraft = providerCatalogDraftSchema.parse(input.draft);
    const preview = {
      catalogId: catalog.id,
      revision: catalog.revision,
      definitionHash: catalog.hash,
      providerDraft,
    };
    return { preview, hash: fingerprint(preview) };
  }
  if (input.action === "provider-publish") {
    const adapter = provider(input.preview.providerDraft);
    const action = await prepareProviderPublication(
      db,
      actor,
      input.key,
      input.preview,
      input.hash,
    );
    const result = await executeProviderAction(db, action._id, adapter);
    return { id: action._id, result };
  }
  if (input.action === "provider-reconcile") {
    const action = await db
      .collection<ProviderAction>("billingProviderActions")
      .findOne({ _id: input.id, kind: "publish" });
    if (!action) throw new AppError("NOT_FOUND", "Publication not found.", 404);
    // This UI action is readback only, including for a prepared publication.
    const adapter = provider(action.input);
    const receipt = await adapter.readback(action);
    if (receipt === null)
      throw new AppError(
        "PUBLICATION_UNVERIFIED",
        "Provider readback has not confirmed publication.",
        409,
      );
    return executeProviderAction(db, action._id, {
      readback: async () => receipt,
      execute: async () => {
        throw new Error("Readback only");
      },
    });
  }
  await refundConsumption(
    db,
    { uid: actor.uid, authTime: actor.auth_time },
    input.uid,
    input.chargeId,
    input.key,
    input.amount,
    input.reason,
  );
  return { refunded: true };
}

export async function commerceAdminAction(
  ...args: Parameters<typeof executeAdminAction>
) {
  try {
    return await executeAdminAction(...args);
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new AppError(
        "INVALID_INPUT",
        error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
        400,
      );
    throw error;
  }
}
