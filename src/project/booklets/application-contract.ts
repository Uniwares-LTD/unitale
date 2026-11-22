import { z } from "zod";
import { bookletIdSchema, briefSchema } from "./contracts";

// Client-safe public booklet commands and DTOs (schemaVersion 1). Server records,
// policy rows, provider bindings and execution evidence never cross this boundary.
const id = bookletIdSchema;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
// Browser-generated once per intended action and reused on every retry of it.
const key = z.uuid();
const category = z.enum(["story", "style", "reference", "page"]);

export const bookletQuoteCommandSchema = z.strictObject({
  action: z.literal("quote"),
  catalogId: id,
});
export const bookletStartCommandSchema = z.strictObject({
  action: z.literal("start"),
  key,
  catalogId: id,
  revision: positive,
  quoteHash: hash,
  // Explicit financial consent: the exact credits the user accepted.
  acceptedCredits: positive,
  title: z.string().trim().min(1).max(160),
  brief: briefSchema,
});
export const bookletCreationCommandSchema = z.discriminatedUnion("action", [
  bookletQuoteCommandSchema,
  bookletStartCommandSchema,
]);

const revisionScope = {
  requestId: key,
  expectedVersion: positive,
  category,
  subjects: z.array(id).max(100),
};
export const bookletProductionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("quote-revision"), ...revisionScope }),
  z.strictObject({
    action: z.literal("start-revision"),
    ...revisionScope,
    quoteHash: hash,
    acceptedCredits: count,
  }),
  z.strictObject({ action: z.literal("retry"), key, callId: id }),
  z.strictObject({ action: z.literal("continue"), key }),
]);

export type BookletStartCommand = z.infer<typeof bookletStartCommandSchema>;
export type BookletProductionCommand = z.infer<
  typeof bookletProductionCommandSchema
>;

export type BookletPackageSummary = {
  catalogId: string;
  revision: number;
  quoteHash: string;
  credits: number;
  entitlementDays: number | null;
  storyPages: number;
  includeCover: boolean;
  maxCharacters: number;
  maxLocations: number;
  maxPanelsPerPage: number;
  styleSamples: number;
  languages: { tag: string; direction: "ltr" | "rtl" }[];
  allowances: {
    category: string;
    unit: "request" | "subject";
    included: number;
    // Null means additional revisions cannot be purchased.
    extraCredits: number | null;
  }[];
  available: boolean;
};
export type BookletPackagePage = {
  rows: BookletPackageSummary[];
  next: string | null;
};
export type BookletRunReference = { productionId: string; runId: string };
export type BookletRevisionQuote = {
  quoteHash: string;
  credits: number;
  units: number;
};
export type BookletRetryResult = {
  authorized: true;
  // Null when the active Manager resumes from its own retry wait.
  continued: BookletRunReference | null;
};
