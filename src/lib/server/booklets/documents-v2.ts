import "server-only";
import { z } from "zod";
import {
  bookletContentV2Schema,
  bookletRetryPolicySchema,
  bookletSourceV2Schema,
} from "../../../project/booklets/contracts-v2";
import {
  artifactEntrySchema,
  productionDocumentSchema,
  revisionDocumentSchema,
  subjectInputSchema,
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
