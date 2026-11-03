import { z } from "zod";

// V1 is additive and opt-in: existing sample artifacts are never parsed here.
export const bookletIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const id = bookletIdSchema;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const text = z.string().trim().min(1);
const time = z.iso.datetime();
const ids = z
  .array(id)
  .refine((v) => new Set(v).size === v.length, "Duplicate identity.");
const version = z.literal(1);
const uniqueItemIds = (items: readonly { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
const revisionIdentity = z.strictObject({
  artifactId: id,
  revisionId: id,
  sha256: hash,
});
export const sourceRevisionSchema = revisionIdentity;
export const assetIdentitySchema = z.strictObject({
  assetId: id,
  sha256: hash,
});
const sources = z
  .array(revisionIdentity)
  .refine(
    (items) => new Set(items.map((v) => v.artifactId)).size === items.length,
    "Only one source revision per artifact is allowed.",
  );
export const subjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("book"), id }),
  z.strictObject({ kind: z.literal("style-sample"), id }),
  z.strictObject({ kind: z.literal("character"), id }),
  z.strictObject({ kind: z.literal("location"), id }),
  z.strictObject({
    kind: z.literal("page"),
    id,
    role: z.enum(["story", "cover"]),
    index: count,
  }),
]);
export const revisionCategorySchema = z.enum([
  "story",
  "style",
  "reference",
  "page",
]);
const allowance = z.strictObject({
  included: count,
  extraCredits: count.nullable(),
});
const canvas = z.strictObject({
  width: positive,
  height: positive,
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
const language = z.strictObject({
  tag: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  direction: z.enum(["ltr", "rtl"]),
});
export const bookletPackageSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    revision: positive,
    executionProfileId: id,
    executionProfileRevision: positive,
    storyPages: positive,
    includeCover: z.boolean(),
    maxCharacters: count,
    maxLocations: count,
    maxPanelsPerPage: positive,
    styleSamples: positive,
    canvas,
    languages: z
      .array(language)
      .min(1)
      .refine(
        (items) => new Set(items.map((v) => v.tag)).size === items.length,
      ),
    credits: positive,
    allowances: z.strictObject({
      story: allowance,
      style: allowance,
      reference: allowance,
      page: allowance,
    }),
    repairLimitPerOutput: count.default(1),
    execution: z.strictObject({
      maxTextCalls: positive,
      maxImageCalls: positive,
      maxWorkflowSteps: positive,
      maxElapsedSeconds: positive,
      spendingCeiling: z.strictObject({
        amountMinor: positive,
        currency: z.string().regex(/^[A-Z]{3}$/),
      }),
    }),
    entitlementDays: positive.nullable().default(null),
  })
  .readonly();
export type BookletPackage = z.infer<typeof bookletPackageSchema>;
export const executionCapacitySchema = z.strictObject({
  id,
  revision: positive,
  maxStoryPages: positive,
  coverSupported: z.boolean(),
  maxCharacters: count,
  maxLocations: count,
  maxPanelsPerPage: positive,
  maxStyleSamples: positive,
  canvases: z.array(canvas).min(1),
  languages: z.array(language).min(1),
});
export function validatePackageCapacity(
  value: unknown,
  capacity: unknown,
): BookletPackage {
  const pack = bookletPackageSchema.parse(value);
  const profile = executionCapacitySchema.parse(capacity);
  if (
    pack.executionProfileId !== profile.id ||
    pack.executionProfileRevision !== profile.revision
  )
    throw new Error("Execution profile does not match the package snapshot.");
  if (
    pack.storyPages > profile.maxStoryPages ||
    (pack.includeCover && !profile.coverSupported) ||
    pack.maxCharacters > profile.maxCharacters ||
    pack.maxLocations > profile.maxLocations ||
    pack.maxPanelsPerPage > profile.maxPanelsPerPage ||
    pack.styleSamples > profile.maxStyleSamples
  )
    throw new Error("Package exceeds execution profile capacity.");
  if (
    !profile.canvases.some(
      (c) =>
        c.width === pack.canvas.width &&
        c.height === pack.canvas.height &&
        c.mime === pack.canvas.mime,
    ) ||
    pack.languages.some(
      (l) =>
        !profile.languages.some(
          (p) => p.tag === l.tag && p.direction === l.direction,
        ),
    )
  )
    throw new Error(
      "Package canvas or language has not been accepted by the profile.",
    );
  // The initial output budget must cover the package's advertised subject capacity.
  if (
    pack.execution.maxImageCalls <
    pack.storyPages +
      Number(pack.includeCover) +
      pack.styleSamples +
      pack.maxCharacters +
      pack.maxLocations
  )
    throw new Error("Image budget cannot produce the purchased outputs.");
  return pack;
}

export const briefSchema = z.strictObject({
  idea: text,
  audience: text,
  language,
  characters: z.array(text),
  locations: z.array(text),
  visualPreferences: z.string(),
});
export const bookletSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    ownerId: z.string().min(1).max(128),
    title: text,
    currentProductionId: id.nullable(),
    revision: positive,
    createdAt: time,
    deletedAt: time.nullable(),
    recoverUntil: time.nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.deletedAt === null) !== (v.recoverUntil === null))
      ctx.addIssue({
        code: "custom",
        message: "Deletion and recovery deadline must be recorded together.",
      });
    if (
      v.deletedAt &&
      v.recoverUntil &&
      Date.parse(v.recoverUntil) - Date.parse(v.deletedAt) !== 30 * 86400000
    )
      ctx.addIssue({
        code: "custom",
        message: "Recovery window must be 30 days.",
      });
  });
const lock = z.strictObject({ operationId: id, lockedAt: time });
export const productionSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    bookletId: id,
    ownerId: z.string().min(1).max(128),
    orderId: id,
    sourceProductionId: id.nullable(),
    package: bookletPackageSchema,
    brief: briefSchema,
    state: z.enum([
      "queued",
      "running",
      "awaiting-human",
      "blocked",
      "completed",
      "cancelled",
      "closed",
    ]),
    revision: positive,
    activeRunId: id.nullable(),
    manifestRevisionId: id.nullable(),
    locks: z.strictObject({
      story: lock.nullable(),
      style: lock.nullable(),
      references: lock.nullable(),
    }),
    createdAt: time,
    expiresAt: time.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.sourceProductionId === v.id)
      ctx.addIssue({
        code: "custom",
        message: "Production cannot be its own source.",
      });
    if (v.state === "completed" && v.manifestRevisionId === null)
      ctx.addIssue({
        code: "custom",
        message: "Completion requires an accepted manifest.",
      });
    if ((v.locks.style || v.locks.references) && !v.locks.story)
      ctx.addIssue({
        code: "custom",
        message: "Downstream generation requires the story lock.",
      });
    if (v.locks.references && !v.locks.style)
      ctx.addIssue({
        code: "custom",
        message: "Page generation requires the style lock.",
      });
    if (
      !v.package.languages.some(
        (l) =>
          l.tag === v.brief.language.tag &&
          l.direction === v.brief.language.direction,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Language is outside accepted package terms.",
      });
    if (
      v.brief.characters.length > v.package.maxCharacters ||
      v.brief.locations.length > v.package.maxLocations
    )
      ctx.addIssue({
        code: "custom",
        message: "Brief exceeds accepted subject limits.",
      });
  });

const lettering = z.strictObject({
  id,
  kind: z.enum([
    "narration",
    "speech",
    "thought",
    "sound-effect",
    "title",
    "credit",
    "in-scene",
  ]),
  content: text,
  speakerId: id.nullable(),
  placement: text,
});
const rect = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (r) => r.x + r.width <= 1 && r.y + r.height <= 1,
    "Panel exceeds canvas.",
  );
const uniqueEntities = z
  .array(
    z.strictObject({
      id,
      name: text,
      description: text,
      continuity: z.array(text),
    }),
  )
  .refine((items) => new Set(items.map((v) => v.id)).size === items.length);
const manifestPage = z.strictObject({
  subjectId: id,
  role: z.enum(["cover", "story"]),
  index: count,
  revision: revisionIdentity,
  asset: assetIdentitySchema,
  qualityReviewId: id,
  approvalDecisionId: id,
});
export const manifestContentSchema = z
  .strictObject({
    kind: z.literal("book-manifest"),
    title: text,
    language,
    acceptedSources: sources,
    pages: z.array(manifestPage).min(1),
  })
  .superRefine((v, ctx) => {
    const covers = v.pages.filter((p) => p.role === "cover");
    if (
      covers.length > 1 ||
      (covers.length === 1 && v.pages[0].role !== "cover")
    )
      ctx.addIssue({
        code: "custom",
        message: "A single cover must precede story pages.",
      });
    if (
      new Set(v.pages.map((p) => p.subjectId)).size !== v.pages.length ||
      new Set(v.pages.map((p) => p.revision.revisionId)).size !== v.pages.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Manifest repeats a physical page.",
      });
    if (v.pages.some((p, i) => p.index !== i))
      ctx.addIssue({
        code: "custom",
        message: "Manifest pages must be ordered without gaps.",
      });
  });
export const artifactContentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("concept"),
    title: text,
    premise: text,
    theme: text,
    tone: text,
    constraints: z.array(text),
  }),
  z.strictObject({
    kind: z.literal("outline"),
    summary: text,
    beats: z
      .array(z.strictObject({ id, content: text }))
      .min(1)
      .refine(uniqueItemIds, "Duplicate beat identity."),
  }),
  z.strictObject({ kind: z.literal("characters"), entities: uniqueEntities }),
  z.strictObject({ kind: z.literal("locations"), entities: uniqueEntities }),
  z.strictObject({
    kind: z.literal("manuscript"),
    units: z
      .array(
        z.strictObject({
          id,
          prose: text,
          characterIds: ids,
          locationIds: ids,
        }),
      )
      .min(1)
      .refine(uniqueItemIds, "Duplicate manuscript unit identity."),
  }),
  z.strictObject({
    kind: z.literal("style"),
    direction: text,
    palette: z.array(text),
    typography: text,
    continuity: z.array(text),
  }),
  z.strictObject({
    kind: z.literal("reference"),
    description: text,
    requiredFeatures: z.array(text),
    asset: assetIdentitySchema,
  }),
  z.strictObject({
    kind: z.literal("page-plan"),
    panels: z
      .array(
        z.strictObject({
          id,
          region: rect,
          action: text,
          characterIds: ids,
          locationIds: ids,
          manuscriptUnitIds: ids,
          lettering: z
            .array(lettering)
            .refine(uniqueItemIds, "Duplicate lettering identity."),
        }),
      )
      .min(1)
      .refine(uniqueItemIds, "Duplicate panel identity."),
  }),
  z.strictObject({ kind: z.literal("page-image"), asset: assetIdentitySchema }),
  manifestContentSchema,
]);
export const artifactSchema = z.strictObject({
  schemaVersion: version,
  id,
  ownerId: z.string().min(1).max(128),
  productionId: id,
  subject: subjectSchema,
  responsibility: z.enum([
    "concept",
    "outline",
    "characters",
    "locations",
    "manuscript",
    "style",
    "reference",
    "page-plan",
    "page-image",
    "book-manifest",
  ]),
  currentRevisionId: id.nullable(),
  acceptedRevisionId: id.nullable(),
  revision: positive,
});
export const artifactRevisionSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    artifactId: id,
    productionId: id,
    ownerId: z.string().min(1).max(128),
    ordinal: positive,
    subject: subjectSchema,
    operationId: id,
    content: artifactContentSchema,
    sources,
    sha256: hash,
    evidenceIds: ids,
    createdAt: time,
  })
  .readonly();
export const humanDecisionSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    ownerId: z.string().min(1).max(128),
    productionId: id,
    runId: id,
    formId: id,
    submissionId: id,
    expectedProductionRevision: positive,
    presented: sources,
    submittedAt: time,
    action: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("approve") }),
      z.strictObject({ kind: z.literal("clarify"), answer: text }),
      z.strictObject({
        kind: z.literal("revise"),
        category: revisionCategorySchema,
        subjectIds: ids.min(1),
        instruction: text,
        quoteId: id,
      }),
    ]),
  })
  .superRefine((v, ctx) => {
    if (v.action.kind !== "clarify" && v.presented.length === 0)
      ctx.addIssue({
        code: "custom",
        message: "Approval and revision require presented revisions.",
      });
  });
export const operationSchema = z.strictObject({
  schemaVersion: version,
  id,
  ownerId: z.string().min(1).max(128),
  productionId: id,
  runId: id,
  workflowRunId: id,
  publicationId: id,
  parentWorkflowRunId: id.nullable(),
  idempotencyKey: id,
  inputHash: hash,
  expectedProductionRevision: positive,
  subject: subjectSchema,
  sources,
  kind: z.enum([
    "text",
    "style-image",
    "reference-image",
    "page-image",
    "quality-review",
    "complete",
  ]),
  funding: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("production"), orderId: id }),
    z.strictObject({ kind: z.literal("revision"), allocationId: id }),
    z.strictObject({
      kind: z.literal("repair"),
      failedReviewId: id,
      repairOrdinal: positive,
    }),
  ]),
  attempt: positive,
  state: z.enum(["prepared", "started", "succeeded", "failed", "unknown"]),
  resultRevisionIds: ids,
  retainedAssetIds: ids,
  measurementIds: ids,
  createdAt: time,
  startedAt: time.nullable(),
  completedAt: time.nullable(),
});
export const qualityReviewSchema = z
  .strictObject({
    schemaVersion: version,
    id,
    productionId: id,
    operationId: id,
    target: revisionIdentity,
    asset: assetIdentitySchema,
    sources,
    policy: z.strictObject({ id, revision: positive, publicationId: id }),
    disposition: z.enum(["pass", "repair", "blocked"]),
    findings: z.array(
      z.strictObject({
        code: z.enum([
          "lettering",
          "required-content",
          "continuity",
          "layout",
          "aesthetic",
        ]),
        blocking: z.boolean(),
        description: text,
        action: text,
      }),
    ),
    evidenceIds: ids.min(1),
    createdAt: time,
  })
  .superRefine((v, ctx) => {
    if (v.disposition === "pass" && v.findings.some((f) => f.blocking))
      ctx.addIssue({
        code: "custom",
        message: "Blocking findings cannot pass quality.",
      });
    if (v.disposition !== "pass" && !v.findings.some((f) => f.blocking))
      ctx.addIssue({
        code: "custom",
        message: "Failed quality requires actionable blocking findings.",
      });
    if (v.findings.some((f) => f.code === "aesthetic" && f.blocking))
      ctx.addIssue({
        code: "custom",
        message: "Subjective aesthetics are human revisions.",
      });
  });
export const originalAssetReceiptSchema = z.strictObject({
  schemaVersion: version,
  id,
  ownerId: z.string().min(1).max(128),
  productionId: id,
  operationId: id,
  sha256: hash,
  bytes: positive,
  mime: canvas.shape.mime,
  width: positive,
  height: positive,
  provider: id,
  providerRequestId: id,
  evidenceId: id,
  retainedAt: time, // Storage locator and credentials are not workflow DTO fields.
});
export type Production = z.infer<typeof productionSchema>;
export type ArtifactRevision = z.infer<typeof artifactRevisionSchema>;
export type HumanDecision = z.infer<typeof humanDecisionSchema>;
export type BookletOperation = z.infer<typeof operationSchema>;
export type QualityReview = z.infer<typeof qualityReviewSchema>;

/** Shape validation is not authorization: services must load and verify each reference. */
export function validateManifestPackage(content: unknown, terms: unknown) {
  const manifest = manifestContentSchema.parse(content);
  const pack = bookletPackageSchema.parse(terms);
  if (
    manifest.pages.filter((p) => p.role === "story").length !==
      pack.storyPages ||
    manifest.pages.filter((p) => p.role === "cover").length !==
      Number(pack.includeCover)
  )
    throw new Error("Manifest does not contain the purchased pages.");
  if (
    !pack.languages.some(
      (l) =>
        l.tag === manifest.language.tag &&
        l.direction === manifest.language.direction,
    )
  )
    throw new Error("Manifest language does not match package terms.");
  return manifest;
}
