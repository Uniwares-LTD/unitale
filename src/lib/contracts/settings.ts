import { z } from "zod";
import { mcpLimitsSchema } from "./mcp-limits";
import { publicConfigSchema } from "../config/public";
import { aiPricingSchema } from "../config/ai-pricing";
import { externalMcpMappingSchema } from "./environment-binding";

/** Upper bound for one managed file; each account still has its own quota. */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

export const creditPackSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  label: z.string().trim().min(1).max(80),
  credits: z.number().int().positive().safe(),
  amountMinor: z.number().int().positive().safe().optional(),
  currency: z
    .string()
    .regex(/^[a-z]{3}$/)
    .optional(),
  stripePriceId: z
    .string()
    .regex(/^price_[A-Za-z0-9]+$/)
    .optional(),
  playProductId: z.string().max(128).optional(),
});
export const baseSettingsSchema = z
  .strictObject({
    public: publicConfigSchema,
    mcp: mcpLimitsSchema.default(() => mcpLimitsSchema.parse({})),
    execution: z
      .strictObject({
        rawLogRetentionDays: z.number().int().min(1).max(3650).default(90),
      })
      .default({ rawLogRetentionDays: 90 }),
    credits: z.strictObject({
      packs: z.array(creditPackSchema).max(50),
      holdMinutes: z.number().int().min(1).max(1440),
      promotionDays: z.number().int().min(1).max(3650),
    }),
    runs: z.strictObject({
      enabled: z.boolean(),
      externalMcpMappings: z
        .array(externalMcpMappingSchema)
        .max(50)
        .default([]),
      pricing: aiPricingSchema,
      failureCharging: z.enum(["success-only", "verified-usage"]),
      concurrentPerAccount: z.number().int().min(1).max(20),
      reconciliationHours: z.number().int().min(1).max(168),
      pollSeconds: z.number().int().min(2).max(60),
      retryBaseSeconds: z.number().int().min(2).max(60),
      retryMaxSeconds: z.number().int().min(60).max(600),
      uploadBytes: z
        .number()
        .int()
        .min(1024)
        .max(20 * 1024 * 1024)
        .default(20 * 1024 * 1024),
      // Managed files above uploadBytes use resumable part uploads.
      fileBytes: z
        .number()
        .int()
        .min(1024)
        .max(MAX_FILE_BYTES)
        .default(20 * 1024 * 1024),
      filesPerAccount: z.number().int().min(1).max(100_000).default(100),
      uploadBytesPerAccount: z
        .number()
        .int()
        .min(1024)
        .max(1024 * 1024 * 1024 * 1024)
        .default(100 * 1024 * 1024),
      imageBytes: z
        .number()
        .int()
        .min(1024)
        .max(8 * 1024 * 1024),
      imagePixels: z.number().int().min(1024).max(16_000_000),
      cleanupDays: z.number().int().min(1).max(3650),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.credits.packs.map((p) => p.id)).size !==
      value.credits.packs.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate pack IDs." });
    if (
      new Set(value.runs.externalMcpMappings.map((m) => m.source)).size !==
      value.runs.externalMcpMappings.length
    )
      ctx.addIssue({
        code: "custom",
        message: "External MCP source mappings must be unique.",
        path: ["runs", "externalMcpMappings"],
      });
  });
export type BaseSettings = z.infer<typeof baseSettingsSchema>;
export const settingsUpdateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().max(300).default(""),
  settings: baseSettingsSchema,
});
