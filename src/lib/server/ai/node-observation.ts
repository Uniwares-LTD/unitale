import "server-only";
import { z } from "zod";
import type { ProviderNodeObservation } from "./types";

// Inputs/process data and arbitrary top-level fields never enter the observation.
const nodeSchema = z.object({
  id: z.string().min(1).max(128),
  node_id: z.string().min(1).max(128),
  node_type: z.string().max(128).nullish(),
  status: z.string().min(1).max(64),
  retry_index: z.number().int().nonnegative().safe().nullish(),
  iteration_id: z.string().max(128).nullish(),
  loop_id: z.string().max(128).nullish(),
  outputs: z.record(z.string(), z.json()).nullish(),
  outputs_truncated: z.boolean().nullish(),
  error: z.string().max(16384).nullish(),
  execution_metadata: z.record(z.string(), z.json()).nullish(),
});
export function nodeObservation(
  runId: string,
  raw: unknown,
): ProviderNodeObservation {
  const node = nodeSchema.parse(raw);
  const value: ProviderNodeObservation = {
    runId: z.string().uuid().parse(runId),
    id: node.id,
    nodeId: node.node_id,
    nodeType: node.node_type ?? null,
    status: node.status,
    retryIndex: node.retry_index ?? null,
    iterationId: node.iteration_id ?? null,
    loopId: node.loop_id ?? null,
    outputs: node.outputs ?? null,
    outputsTruncated: node.outputs_truncated ?? null,
    error: node.error ?? null,
    executionMetadata: node.execution_metadata ?? null,
  };
  if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024)
    throw new Error("Node observation size limit.");
  return value;
}
