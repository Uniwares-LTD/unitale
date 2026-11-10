import "server-only";
import { z } from "zod";
import {
  bookletContentV2Schema,
  bookletRetryPolicySchema,
  bookletSourceV2Schema,
  bookletAssessmentV2Schema,
} from "../../../project/booklets/contracts-v2";
import {
  artifactEntrySchema,
  productionDocumentSchema,
  revisionDocumentSchema,
  subjectInputSchema,
  id,
} from "./documents";

export const artifactKindV2Schema = z.enum([
  "concept",
  "outline",
  "description",
  "roster",
  "manuscript",
  "style",
  "image-spec",
  "book-layout",
  "page-spec",
  "reference",
  "page-image",
  "book-manifest",
]);
const subjectV2 = subjectInputSchema.safeExtend({
  artifacts: z.array(
    artifactEntrySchema.extend({ kind: artifactKindV2Schema }),
  ),
});
// New productions opt in. Existing v1 readers intentionally keep rejecting v2.
export const productionV2Schema = productionDocumentSchema
  .extend({
    documentVersion: z.literal(2),
    subjects: z.array(subjectV2),
    creationHash: z.string().regex(/^[a-f0-9]{64}$/),
    retryPolicy: bookletRetryPolicySchema,
    checkpointVersion: z.number().int().nonnegative().safe(),
    checkpoint: z.json().nullable(),
  })
  .superRefine((value, ctx) => {
    if (Buffer.byteLength(JSON.stringify(value.checkpoint), "utf8") > 64 * 1024)
      ctx.addIssue({ code: "custom", message: "Checkpoint exceeds 64 KiB." });
    const subjects = value.subjects.map((s) => s.id);
    const artifacts = value.subjects.flatMap((s) =>
      s.artifacts.map((a) => a.id),
    );
    if (
      new Set(subjects).size !== subjects.length ||
      new Set(artifacts).size !== artifacts.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate embedded identity." });
  });
export const revisionV2Schema = revisionDocumentSchema
  .extend({
    documentVersion: z.literal(2),
    kind: artifactKindV2Schema,
    content: bookletContentV2Schema,
    sources: z.array(bookletSourceV2Schema),
  })
  .refine(
    (value) => value.kind === value.content.kind,
    "Revision kind mismatch.",
  );

export const storedProductionSchema = z.union([
  productionDocumentSchema,
  productionV2Schema,
]);
export const storedRevisionSchema = z.union([
  revisionDocumentSchema,
  revisionV2Schema,
]);
export type ProductionV2 = z.infer<typeof productionV2Schema>;
export type RevisionV2 = z.infer<typeof revisionV2Schema>;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z.array(id).refine((v) => new Set(v).size === v.length);
const scope = {
  _id: hash,
  documentVersion: z.literal(2),
  ownerId: z.string().min(1).max(128),
  productionId: id,
  createdAt: z.date(),
};
export const workRegistrationV2Schema = z.strictObject({
  callId: id,
  runId: id,
  // Constructed by the server gateway from task/target/funding identity, not
  // copied from a model's new invocation ID. Exact requestHash remains separate.
  actionKey: hash,
  requestHash: hash,
  service: z.enum([
    "manager",
    "story-planner",
    "manuscript",
    "art-director",
    "page-composer",
    "image-executor",
    "quality-reviewer",
  ]),
  operation: id,
  targetIds: ids,
  sources: z.array(bookletSourceV2Schema),
  category: z.enum(["paidLlm", "paidImage", "nonPaid"]),
  retryOf: id.nullable().default(null),
  reviewScope: z
    .strictObject({
      targetHash: hash,
      referencePositions: z
        .array(z.number().int().nonnegative().safe())
        .refine((v) => new Set(v).size === v.length),
      assetIds: ids.default([]),
      continuityPairs: z.array(z.json()).default([]),
    })
    .nullable()
    .default(null),
  correction: z
    .strictObject({
      rootId: hash,
      family: z.enum(["llm", "image"]),
      findingIds: ids.min(1),
    })
    .nullable()
    .default(null),
});
export const workV2Schema = workRegistrationV2Schema.extend({
  ...scope,
  status: z.enum([
    "registered",
    "dispatching",
    "succeeded",
    "partial",
    "failed",
    "unknown",
  ]),
  retryOrdinal: z.number().int().nonnegative().safe(),
  correctionRootId: hash,
  retryable: z.boolean(),
  evidenceIds: ids,
  updatedAt: z.date(),
});
export const assessmentDocumentV2Schema = z.strictObject({
  ...scope,
  callId: id,
  policyBinding: id,
  reviewerBinding: id,
  assessment: bookletAssessmentV2Schema,
  complete: z.boolean(),
  evidenceIds: ids,
});
export const acceptanceDocumentV2Schema = z.strictObject({
  ...scope,
  runId: id,
  revisionId: id,
  contentHash: hash,
  targetIds: ids,
  assetIds: ids,
  evidenceIds: ids,
});
export type WorkV2 = z.infer<typeof workV2Schema>;
export type AssessmentV2 = z.infer<typeof assessmentDocumentV2Schema>;
export type AcceptanceV2 = z.infer<typeof acceptanceDocumentV2Schema>;
