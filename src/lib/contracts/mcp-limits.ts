import { z } from "zod";
export const mcpLimitsSchema = z
  .strictObject({
    requestBytes: z
      .number()
      .int()
      .min(1024)
      .max(16 * 1024 * 1024)
      .default(64 * 1024),
    responseBytes: z
      .number()
      .int()
      .min(1024)
      .max(32 * 1024 * 1024)
      .default(64 * 1024),
    toolResultBytes: z
      .number()
      .int()
      .min(128)
      .max(16 * 1024 * 1024)
      .default(31 * 1024),
    timeoutMs: z.number().int().min(100).max(120000).default(10000),
  })
  .refine(
    (v) => v.toolResultBytes < v.responseBytes,
    "Tool result limit must be below the response limit.",
  );
export type McpLimits = z.infer<typeof mcpLimitsSchema>;
