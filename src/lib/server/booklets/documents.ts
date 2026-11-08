import "server-only";
import { z } from "zod";
import {
  artifactContentSchema,
  bookletIdSchema,
  bookletPackageSchema,
  briefSchema,
  sourceRevisionSchema,
  assetIdentitySchema,
} from "../../../project/booklets/contracts";

export const id = bookletIdSchema;
const positive = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const text = z.string().trim().min(1).max(65536);
const ids = z
  .array(id)
  .refine((v) => new Set(v).size === v.length, "Duplicate identity.");
export const artifactKind = z.enum([
  "concept",
  "outline",
  "manuscript",
  "description",
  "roster",
  "style",
  "reference",
  "page-plan",
  "page-image",
  "book-manifest",
]);
// A new persistence-only content union: never reinterpret the v1 aggregate payloads.
export const contentSchema = z.union([
  artifactContentSchema.refine(
    (v) => v.kind !== "characters" && v.kind !== "locations",
    "Use individual descriptions and a roster.",
  ),
  z.strictObject({
    kind: z.literal("description"),
    name: text,
    description: text,
    continuityRules: z.array(text),
  }),
  z.strictObject({
    kind: z.literal("roster"),
    characterIds: ids,
    locationIds: ids,
  }),
]);
export const artifactEntrySchema = z.strictObject({
  id,
  kind: artifactKind,
  currentRevisionId: id.nullable(),
  acceptedRevisionId: id.nullable(),
});
export const subjectInputSchema = z
  .strictObject({
    id,
    kind: z.enum(["book", "character", "location", "style-sample", "page"]),
    label: z.string().trim().min(1).max(160),
    pageRole: z.enum(["cover", "story"]).nullable(),
  })
  .refine(
    (v) => (v.kind === "page") === (v.pageRole !== null),
    "Only pages have a page role.",
  );
export const subjectSchema = subjectInputSchema.safeExtend({
  artifacts: z.array(artifactEntrySchema),
});
export const creativeFieldsSchema = bookletPackageSchema.unwrap().omit({
  schemaVersion: true,
  id: true,
  revision: true,
  credits: true,
  allowances: true,
  entitlementDays: true,
});
export const creativeSnapshotSchema = creativeFieldsSchema.extend({
  id,
  revision: positive,
});
const deletionSchema = z.strictObject({
  deletedAt: z.date().nullable(),
  recoverUntil: z.date().nullable(),
});
export const bookDocumentSchema = z.strictObject({
  _id: id,
  documentVersion: z.literal(1),
  ownerId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(160),
  currentProductionId: id.nullable(),
  version: positive,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletion: deletionSchema,
});
const lock = z.strictObject({
  operationId: id,
  lockedAt: z.date(),
  sourceRevisionIds: ids,
});
export const productionDocumentSchema = z.strictObject({
  _id: id,
  documentVersion: z.literal(1),
  ownerId: z.string().min(1).max(128),
  bookletId: id,
  orderId: id,
  sourceProductionId: id.nullable(),
  revisionChargeId: id.nullable().default(null),
  brief: briefSchema,
  creativeConfigSnapshot: creativeSnapshotSchema,
  lifecycleState: z.enum(["draft", "in-progress", "completed", "closed"]),
  subjects: z.array(subjectSchema),
  stageLocks: z.strictObject({
    story: lock.nullable(),
    style: lock.nullable(),
    references: lock.nullable(),
  }),
  mutationLease: z
    .strictObject({ holderId: id, fence: positive, expiresAt: z.date() })
    .nullable(),
  fenceCounter: count,
  version: positive,
  currentManifestRevisionId: id.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date().nullable(),
});
export const revisionDocumentSchema = z.strictObject({
  _id: id,
  documentVersion: z.literal(1),
  ownerId: z.string().min(1).max(128),
  productionId: id,
  artifactId: id,
  subjectId: id,
  kind: artifactKind,
  ordinal: positive,
  content: contentSchema,
  sources: z.array(sourceRevisionSchema),
  assets: z.array(assetIdentitySchema),
  provenance: z.strictObject({ operationId: id, runId: id, evidenceIds: ids }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.date(),
});
export const mutationSchema = z.strictObject({
  key: id,
  expectedVersion: positive,
  holderId: id,
  fence: positive,
});
export const appendInputSchema = mutationSchema.extend({
  artifactId: id,
  content: contentSchema,
  sources: z.array(sourceRevisionSchema),
  assets: z.array(assetIdentitySchema),
  provenance: revisionDocumentSchema.shape.provenance,
});
export type BookDocument = z.infer<typeof bookDocumentSchema>;
export type ProductionDocument = z.infer<typeof productionDocumentSchema>;
export type RevisionDocument = z.infer<typeof revisionDocumentSchema>;
export type SubjectInput = z.infer<typeof subjectInputSchema>;
export type ArtifactKind = z.infer<typeof artifactKind>;
export type Mutation = z.infer<typeof mutationSchema>;
export type AppendInput = z.infer<typeof appendInputSchema>;
export type Content = z.infer<typeof contentSchema>;

export const responsibilities: Record<
  SubjectInput["kind"],
  readonly ArtifactKind[]
> = {
  book: [
    "concept",
    "outline",
    "manuscript",
    "roster",
    "style",
    "book-manifest",
  ],
  character: ["description", "reference"],
  location: ["description", "reference"],
  "style-sample": ["reference"],
  page: ["page-plan", "page-image"],
};
// Transport conversion is explicit about dates, including nested locks and lease.
export function bookView(d: BookDocument) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletion: {
      deletedAt: d.deletion.deletedAt?.toISOString() ?? null,
      recoverUntil: d.deletion.recoverUntil?.toISOString() ?? null,
    },
  };
}
export function productionView(d: ProductionDocument) {
  const asLock = (v: z.infer<typeof lock> | null) =>
    v && { ...v, lockedAt: v.lockedAt.toISOString() };
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    expiresAt: d.expiresAt?.toISOString() ?? null,
    mutationLease: d.mutationLease && {
      ...d.mutationLease,
      expiresAt: d.mutationLease.expiresAt.toISOString(),
    },
    stageLocks: {
      story: asLock(d.stageLocks.story),
      style: asLock(d.stageLocks.style),
      references: asLock(d.stageLocks.references),
    },
  };
}
export function revisionView(d: RevisionDocument) {
  return { ...d, createdAt: d.createdAt.toISOString() };
}

export const writeResultSchema = z.strictObject({
  id,
  version: positive,
  revisionId: id.optional(),
  ordinal: positive.optional(),
  fence: positive.optional(),
  expiresAt: z.iso.datetime().optional(),
});
export const writeReceiptSchema = z.strictObject({
  _id: z.string().regex(/^[a-f0-9]{64}$/),
  ownerId: z.string().min(1).max(128),
  scope: z.string().min(1).max(160),
  key: id,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  result: writeResultSchema,
  createdAt: z.date(),
});
export type WriteResult = z.infer<typeof writeResultSchema>;
export type WriteReceipt = z.infer<typeof writeReceiptSchema>;
