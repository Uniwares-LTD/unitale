import { z } from "zod";

const id = z.string().min(1).max(256);
const count = z.number().int().nonnegative().safe();
const cost = z.strictObject({
  // Decimal string: preserve provider precision without floating-point money math.
  amount: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const evidenceReferenceSchema = z.strictObject({
  id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: count,
  kind: z.enum(["prompt", "input", "output", "trace", "provider-receipt"]),
});
export const executionMeasurementSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    operationId: id,
    runId: id,
    provider: id,
    model: id.nullable(),
    requestId: id.nullable(),
    workflowRunId: id,
    publicationId: id,
    parentMeasurementId: id.nullable(),
    scope: z.enum(["call", "summary"]),
    authority: z.enum(["provider", "adapter", "estimate"]),
    usage: z.strictObject({
      inputTokens: count.nullable(),
      outputTokens: count.nullable(),
      additional: z.array(
        z.strictObject({
          category: id,
          quantity: z.number().nonnegative().finite(),
          unit: id,
        }),
      ),
    }),
    reportedCost: cost.nullable(),
    estimatedCost: cost.extend({ pricingRevision: id }).nullable(),
    queuedAt: z.iso.datetime().nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    elapsedMs: count.nullable(),
    providerDurationMs: count.nullable(),
    outcome: z.enum(["succeeded", "failed", "unknown"]),
    evidence: z.array(evidenceReferenceSchema),
  })
  .superRefine((value, ctx) => {
    if (value.authority !== "provider" && value.reportedCost !== null)
      ctx.addIssue({
        code: "custom",
        message: "Reported cost requires provider evidence.",
      });
    const times = [value.queuedAt, value.startedAt, value.completedAt]
      .filter((v) => v !== null)
      .map(Date.parse);
    if (times.some((v, i) => i > 0 && v < times[i - 1]))
      ctx.addIssue({
        code: "custom",
        message: "Measurement timestamps are out of order.",
      });
    if (value.parentMeasurementId === value.id)
      ctx.addIssue({
        code: "custom",
        message: "Measurement cannot summarize itself.",
      });
  });
export type ExecutionMeasurement = z.infer<typeof executionMeasurementSchema>;

/** Summaries are diagnostic only. Unknown call costs are never coerced to zero. */
export function expenditureCoverage(
  measurements: readonly ExecutionMeasurement[],
) {
  const calls = new Map<string, ExecutionMeasurement>();
  for (const value of measurements) {
    const parsed = executionMeasurementSchema.parse(value);
    if (calls.has(parsed.id))
      throw new Error("Duplicate measurement identity.");
    calls.set(parsed.id, parsed);
  }
  const leaves = [...calls.values()].filter((value) => value.scope === "call");
  return {
    calls: leaves.length,
    reported: leaves.filter((value) => value.reportedCost !== null).length,
    estimatedOnly: leaves.filter(
      (value) => value.reportedCost === null && value.estimatedCost !== null,
    ).length,
    unknown: leaves.filter(
      (value) => value.reportedCost === null && value.estimatedCost === null,
    ).length,
  };
}
