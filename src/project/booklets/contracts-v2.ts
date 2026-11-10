import { z } from "zod";
import { assetIdentitySchema, bookletIdSchema } from "./contracts";

// Application content boundary for the native YAML package. V1 stays unchanged.
// Preserve creative extension fields as JSON; do not strip or normalize model text.
const id = bookletIdSchema;
const text = z.string();
const count = z.number().int().nonnegative().safe();
const ids = z.array(id).refine((v) => new Set(v).size === v.length);
const content = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catchall(z.json());
const uniqueIds = (values: readonly { id: string }[]) =>
  new Set(values.map((value) => value.id)).size === values.length;
const canvas = content({
  width: z.number().int().positive().safe(),
  height: z.number().int().positive().safe(),
});
const visibleText = content({
  id,
  kind: z.string().min(1),
  text,
  speaker: id.optional(),
});
const span = content({
  textId: id,
  kind: z.string().min(1),
  text,
  start: count,
  end: count,
  speaker: id.optional(),
}).refine(
  (v) => v.end >= v.start && [...v.text].length === v.end - v.start,
  "Lettering span must retain exact Unicode code points.",
);
const panel = content({
  id,
  lettering: z.array(span),
  noText: z.boolean(),
}).refine(
  (v) => v.noText === (v.lettering.length === 0),
  "No-text panels cannot contain lettering.",
);

export const bookletManifestV2Schema = content({
  kind: z.literal("book-manifest"),
  pages: z
    .array(content({ pageId: id, assetId: id }))
    .min(1)
    .refine(
      (pages) =>
        new Set(pages.map((page) => page.pageId)).size === pages.length,
      "Duplicate manifest page identity.",
    ),
  continuityPairs: z.array(z.json()),
});

export const bookletContentV2Schema = z.discriminatedUnion("kind", [
  content({
    kind: z.literal("concept"),
    title: text,
    premise: text,
    audience: text,
    tone: text,
    constraints: z.array(text),
  }),
  content({
    kind: z.literal("outline"),
    summary: text,
    beats: z
      .array(content({ id }))
      .refine(uniqueIds, "Duplicate beat identity."),
  }),
  content({
    kind: z.literal("description"),
    name: text,
    subjectKind: z.enum(["character", "location"]),
    description: text,
    establishedFacts: z.array(z.json()),
    continuityConstraints: z.array(z.json()),
  }),
  content({ kind: z.literal("roster"), subjectIds: ids }),
  content({
    kind: z.literal("manuscript"),
    units: z
      .array(content({ id, texts: z.array(visibleText) }))
      .refine(
        (units) =>
          uniqueIds(units) && uniqueIds(units.flatMap((unit) => unit.texts)),
        "Duplicate manuscript unit or text identity.",
      ),
  }),
  content({
    kind: z.literal("style"),
    direction: text,
    letteringDirection: text,
    exclusions: z.array(text),
  }),
  content({
    kind: z.literal("image-spec"),
    purpose: text,
    requiredFeatures: z.array(z.json()),
    style: z.json(),
  }),
  content({
    kind: z.literal("book-layout"),
    canvas,
    direction: z.enum(["ltr", "rtl"]),
    pages: z
      .array(
        content({
          id,
          role: z.enum(["cover", "story"]),
          panels: z.array(panel).refine(uniqueIds, "Duplicate panel identity."),
        }),
      )
      .refine(uniqueIds, "Duplicate page identity."),
  }),
  content({
    kind: z.literal("page-spec"),
    pageId: id,
    panels: z.array(panel).refine(uniqueIds, "Duplicate panel identity."),
  }),
  content({ kind: z.literal("reference"), asset: assetIdentitySchema }),
  content({ kind: z.literal("page-image"), asset: assetIdentitySchema }),
  bookletManifestV2Schema,
]);
export type BookletContentV2 = z.infer<typeof bookletContentV2Schema>;

export const bookletSourceV2Schema = z.strictObject({
  artifactId: id,
  revisionId: id,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const bookletRetryPolicySchema = z.strictObject({
  paidLlm: count.default(2),
  paidImage: count.default(0),
  nonPaid: count.default(3),
});
export type BookletRetryPolicy = z.infer<typeof bookletRetryPolicySchema>;
export const defaultBookletRetryPolicy: Readonly<BookletRetryPolicy> =
  Object.freeze(bookletRetryPolicySchema.parse({}));

export const bookletAssessmentV2Schema = content({
  mode: z.enum([
    "text",
    "specification",
    "image_request",
    "image",
    "whole_book",
    "correction",
  ]),
  targetHash: z.string().regex(/^[a-f0-9]{64}$/),
  disposition: z.enum(["pass", "repair", "inconclusive", "blocked"]),
  requestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  sources: z.array(bookletSourceV2Schema),
  coverage: content({
    targetIds: ids,
    referencePositions: z
      .array(count)
      .refine((v) => new Set(v).size === v.length),
  }),
  findings: z.array(
    content({
      id,
      criterion: text,
      classification: z.enum(["confirmed", "advisory", "uncertain"]),
      targetId: id,
      expected: text,
      observed: text,
      correction: text.optional(),
    }),
  ),
  limitations: z.array(text),
}).superRefine((v, ctx) => {
  if (v.findings.some((f) => !v.coverage.targetIds.includes(f.targetId)))
    ctx.addIssue({
      code: "custom",
      message: "Finding escapes assessed scope.",
    });
  if (new Set(v.findings.map((f) => f.id)).size !== v.findings.length)
    ctx.addIssue({ code: "custom", message: "Duplicate finding identity." });
  if (
    v.disposition === "pass" &&
    (v.limitations.length > 0 ||
      v.findings.some((f) => f.classification !== "advisory"))
  )
    ctx.addIssue({
      code: "custom",
      message: "Pass requires complete, conclusive coverage.",
    });
  if (
    v.disposition === "repair" &&
    !v.findings.some((f) => f.classification === "confirmed")
  )
    ctx.addIssue({
      code: "custom",
      message: "Repair requires a confirmed defect.",
    });
});
