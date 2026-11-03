import { z } from "zod";
import {
  bookletIdSchema,
  sourceRevisionSchema,
  assetIdentitySchema,
  subjectSchema,
  artifactContentSchema,
} from "./contracts";

const id = bookletIdSchema;
export const SOURCE_REVISION = "baa9dda25c041b2d7a77853f9f6c3daa73161217";
export const specialistTaskSchema = z.enum([
  "J01",
  "J02",
  "J03",
  "J04",
  "J05",
  "J06",
  "J07",
  "J08",
  "J09",
  "J10",
  "J11",
  "J12",
  "J13",
]);
// This envelope is passed to children. Private Run context is deliberately absent;
// strict parsing rejects accidental forwarding rather than silently stripping it.
export const specialistInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  task: specialistTaskSchema,
  operationId: id,
  invocationId: id,
  parentWorkflowRunId: id,
  publicationId: id,
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  subject: subjectSchema,
  instruction: z.string().trim().min(1),
  sources: z.array(
    z.strictObject({
      revision: sourceRevisionSchema,
      content: artifactContentSchema,
    }),
  ),
  references: z.array(
    z.strictObject({
      subject: subjectSchema,
      revision: sourceRevisionSchema,
      asset: assetIdentitySchema,
      // Native Dify files are resolved by the orchestrator's adapter, not arbitrary URLs.
      nativeFileId: id,
    }),
  ),
});
export const specialistResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: id,
  invocationId: id,
  workflowRunId: id,
  publicationId: id,
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  proposal: artifactContentSchema,
  evidenceIds: z.array(id),
});

export const managerActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("specialist"),
    task: specialistTaskSchema,
    subject: subjectSchema,
    sourceRevisionIds: z.array(id),
  }),
  z.strictObject({
    kind: z.literal("review"),
    targetRevisionId: id,
    policyId: id,
  }),
  z.strictObject({
    kind: z.literal("ask-human"),
    targetRevisionIds: z.array(id),
    question: z.string().trim().min(1),
  }),
  z.strictObject({ kind: z.literal("complete"), manifestRevisionId: id }),
  z.strictObject({ kind: z.literal("stop"), reason: z.string().trim().min(1) }),
]);

export type SpecialistInput = z.infer<typeof specialistInputSchema>;
export type SpecialistResult = z.infer<typeof specialistResultSchema>;
export function verifySpecialistResult(
  input: SpecialistInput,
  result: unknown,
  observedWorkflowRunId: string,
): SpecialistResult {
  const expected = specialistInputSchema.parse(input);
  const parsed = specialistResultSchema.parse(result);
  if (
    parsed.operationId !== expected.operationId ||
    parsed.invocationId !== expected.invocationId ||
    parsed.workflowRunId !== id.parse(observedWorkflowRunId) ||
    parsed.publicationId !== expected.publicationId ||
    parsed.inputFingerprint !== expected.inputFingerprint
  )
    throw new Error(
      "Specialist result is not bound to the authorized invocation.",
    );
  return parsed;
}
