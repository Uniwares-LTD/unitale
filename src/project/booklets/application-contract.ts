import { z } from "zod";
import { bookletIdSchema, briefSchema } from "./contracts";
import { bookletReplySchema, bookletTurnSchema } from "./turn-contract";

// Client-safe public booklet commands and DTOs (version 1 of the public contract;
// a breaking shape needs explicit versioning, see contracts.md). Server records,
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
// Conversational start from the idea alone; the server derives the title and
// brief (see the facade). Consent is the same exact quote and credits.
export const bookletIdeaStartCommandSchema = z.strictObject({
  action: z.literal("start-idea"),
  key,
  catalogId: id,
  revision: positive,
  quoteHash: hash,
  acceptedCredits: positive,
  idea: z.string().trim().min(1).max(4000),
  language: z.enum(["en", "ar"]),
});
export const bookletCreationCommandSchema = z.discriminatedUnion("action", [
  bookletQuoteCommandSchema,
  bookletStartCommandSchema,
  bookletIdeaStartCommandSchema,
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
  // Starts the saved committed step that has no Run yet (idempotent by flow).
  z.strictObject({ action: z.literal("resume") }),
  // The owner's typed reply to one conversation turn (checked against it).
  z.strictObject({
    action: z.literal("reply"),
    key,
    requestId: z.uuid(),
    reply: bookletReplySchema,
  }),
]);

export type BookletStartCommand = z.infer<typeof bookletStartCommandSchema>;
export type BookletProductionCommand = z.infer<
  typeof bookletProductionCommandSchema
>;

// Response schemas: the browser parses with these; the server returns their types.
export const bookletPackageSummarySchema = z.object({
  catalogId: z.string(),
  revision: z.number(),
  quoteHash: z.string(),
  credits: z.number(),
  entitlementDays: z.number().nullable(),
  storyPages: z.number(),
  includeCover: z.boolean(),
  maxCharacters: z.number(),
  maxLocations: z.number(),
  maxPanelsPerPage: z.number(),
  styleSamples: z.number(),
  languages: z.array(
    z.object({ tag: z.string(), direction: z.enum(["ltr", "rtl"]) }),
  ),
  allowances: z.array(
    z.object({
      category: z.string(),
      unit: z.enum(["request", "subject"]),
      included: z.number(),
      // Null means additional revisions cannot be purchased.
      extraCredits: z.number().nullable(),
    }),
  ),
  available: z.boolean(),
});
export const bookletEntrySchema = z.object({
  package: bookletPackageSummarySchema.nullable(),
  availableCredits: z.number(),
});
export type BookletEntry = z.infer<typeof bookletEntrySchema>;
export const bookletPackagePageSchema = z.object({
  rows: z.array(bookletPackageSummarySchema),
  next: z.string().nullable(),
});
export const bookletRunReferenceSchema = z.object({
  productionId: z.string(),
  runId: z.string(),
});
export const bookletRevisionQuoteSchema = z.object({
  quoteHash: z.string(),
  credits: z.number(),
  units: z.number(),
});
export const bookletRetryResultSchema = z.object({
  authorized: z.literal(true),
  // Null when the active Manager resumes from its own retry wait.
  continued: bookletRunReferenceSchema.nullable(),
});
// Owned production view: status, saved progress, selected (accepted) results and
// owned original URLs only. No brief, prompts, work, checkpoints or audit data.
export const bookletViewSchema = z.object({
  productionId: z.string(),
  bookletId: z.string(),
  title: z.string(),
  state: z.enum(["draft", "in-progress", "completed", "closed"]),
  version: z.number(),
  expiresAt: z.string().nullable(),
  completed: z.boolean(),
  predecessorId: z.string().nullable(),
  stages: z.object({
    story: z.boolean(),
    style: z.boolean(),
    references: z.boolean(),
  }),
  pages: z.object({ accepted: z.number(), total: z.number() }),
  // Server-computed eligibility; commands still recheck everything.
  actions: z.object({
    running: z.boolean(),
    // A committed step has no Run yet: Resume it (never Continue or revise).
    resume: z.boolean(),
    continue: z.boolean(),
    retry: z.object({ callId: z.string() }).nullable(),
    revisions: z.array(
      z.object({
        category: z.enum(["story", "style", "reference", "page"]),
        unit: z.enum(["request", "subject"]),
        // Style revisions always cover every style sample (server rule).
        allSubjectsRequired: z.boolean(),
        subjects: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            pageRole: z.enum(["cover", "story"]).nullable(),
          }),
        ),
      }),
    ),
  }),
  subjects: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["book", "character", "location", "style-sample", "page"]),
      label: z.string(),
      pageRole: z.enum(["cover", "story"]).nullable(),
      artifacts: z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          status: z.enum(["not-started", "in-progress", "selected"]),
          images: z.array(z.object({ assetId: z.string(), url: z.string() })),
        }),
      ),
    }),
  ),
});
export type BookletView = z.infer<typeof bookletViewSchema>;

export const bookletHistoryKinds = ["runs", "versions", "revisions"] as const;
// Owned history pages. Runs link to their Run pages (where decision history
// lives); no provider/native IDs, requests, results or evidence are included.
export const bookletHistorySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("runs"),
    items: z.array(
      z.object({
        runId: z.string(),
        status: z.enum([
          "active",
          "confirming",
          "succeeded",
          "failed",
          "cancelled",
        ]),
        createdAt: z.string().nullable(),
      }),
    ),
    next: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("versions"),
    items: z.array(
      z.object({
        productionId: z.string(),
        state: z.string(),
        current: z.boolean(),
        predecessor: z.boolean(),
        createdAt: z.string().nullable(),
      }),
    ),
    next: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("revisions"),
    items: z.array(
      z.object({
        revisionId: z.string(),
        ordinal: z.number(),
        selected: z.boolean(),
        current: z.boolean(),
        createdAt: z.string(),
      }),
    ),
    next: z.string().nullable(),
  }),
]);
export type BookletHistory = z.infer<typeof bookletHistorySchema>;
export type BookletPackageSummary = z.infer<typeof bookletPackageSummarySchema>;
export type BookletPackagePage = z.infer<typeof bookletPackagePageSchema>;
export type BookletRunReference = z.infer<typeof bookletRunReferenceSchema>;
export type BookletRevisionQuote = z.infer<typeof bookletRevisionQuoteSchema>;
export type BookletRetryResult = z.infer<typeof bookletRetryResultSchema>;
// Refusals that happen before any charge: the browser may unlock editing.
// Everything else (including BOOKLET_START_PENDING and transport failures)
// keeps the exact request for a same-key retry.
export const bookletEditableErrors: readonly string[] = [
  "INVALID_INPUT",
  "INVALID_CSRF",
  "BOOKLET_CONFLICT",
  "BOOKLET_UNAVAILABLE",
  "BOOKLET_INVALID",
  "CONSUMPTION_CONFLICT",
  "INSUFFICIENT_CREDITS",
  "MODULE_UNAVAILABLE",
  "RATE_LIMITED",
];

// Conversation (checkpoint 10-chat-version). Turns come from the Manager's
// validated human requests; replies from the authentic Run decisions.
export const bookletTurnStatuses = [
  "preparing", // Requested; the native question is not open yet.
  "open", // Awaiting the owner's reply.
  "confirming", // A sent or uncertain reply awaits the native acknowledgement.
  "answered",
  "stale", // A shown revision changed before a reply.
  "expired",
  "closed", // The Run stopped before a reply.
] as const;
export const bookletConversationSchema = z.object({
  productionId: id,
  title: z.string(),
  idea: z.string(),
  state: z.enum(["draft", "in-progress", "completed", "closed"]),
  // An attempt is queued or running and no question is open.
  working: z.boolean(),
  activity: z
    .enum([
      "queued",
      "preparing-question",
      "story",
      "art",
      "layout",
      "images",
      "review",
      "retry",
      "working",
      "confirming",
    ])
    .nullable(),
  runId: z.string().nullable(),
  completed: z.boolean(),
  reader: z
    .object({
      direction: z.enum(["ltr", "rtl"]),
      width: positive,
      height: positive,
      pages: z
        .array(
          z.object({
            assetId: id,
            cover: z.boolean(),
            text: z.array(z.string()),
          }),
        )
        .min(1),
    })
    .nullable(),
  turns: z.array(
    z.object({
      requestId: z.uuid(),
      createdAt: z.string(),
      status: z.enum(bookletTurnStatuses),
      turn: bookletTurnSchema,
      reply: bookletReplySchema.nullable(),
    }),
  ),
});
export type BookletConversation = z.infer<typeof bookletConversationSchema>;
export const bookletReplyResultSchema = z.object({
  status: z.enum(["submitting", "submitted"]),
});
export type BookletReplyResult = z.infer<typeof bookletReplyResultSchema>;
