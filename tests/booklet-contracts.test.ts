import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookletPackageSchema,
  validatePackageCapacity,
  productionSchema,
  qualityReviewSchema,
  validateManifestPackage,
  bookletSchema,
  humanDecisionSchema,
  artifactContentSchema,
} from "../src/project/booklets/contracts";
import {
  specialistInputSchema,
  verifySpecialistResult,
} from "../src/project/booklets/workflow-contracts";

const sha256 = "a".repeat(64);
const language = { tag: "en", direction: "ltr" };
const canvas = { width: 1024, height: 1024, mime: "image/png" };
// Fixtures only. No catalog seeding or advertised production capacity.
const pack = {
  schemaVersion: 1,
  id: "fixture",
  revision: 1,
  executionProfileId: "fake",
  executionProfileRevision: 1,
  storyPages: 3,
  includeCover: true,
  maxCharacters: 3,
  maxLocations: 2,
  maxPanelsPerPage: 4,
  styleSamples: 2,
  canvas,
  languages: [language],
  credits: 50,
  allowances: Object.fromEntries(
    ["story", "style", "reference", "page"].map((k) => [
      k,
      { included: 1, extraCredits: 5 },
    ]),
  ),
  execution: {
    maxTextCalls: 50,
    maxImageCalls: 20,
    maxWorkflowSteps: 100,
    maxElapsedSeconds: 3600,
    spendingCeiling: { amountMinor: 100, currency: "USD" },
  },
};
const capacity = {
  id: "fake",
  revision: 1,
  maxStoryPages: 12,
  coverSupported: true,
  maxCharacters: 6,
  maxLocations: 4,
  maxPanelsPerPage: 6,
  maxStyleSamples: 3,
  canvases: [canvas],
  languages: [language],
};
const revision = { artifactId: "art", revisionId: "rev", sha256 };
const asset = { assetId: "asset", sha256 };

test("packages are configurable and require accepted profile capacity", () => {
  const parsed = validatePackageCapacity(pack, capacity);
  assert.equal(parsed.repairLimitPerOutput, 1);
  assert.equal(parsed.entitlementDays, null);
  assert.ok(Object.isFrozen(parsed));
  assert.equal(
    validatePackageCapacity(
      { ...pack, storyPages: 10, maxCharacters: 5 },
      capacity,
    ).storyPages,
    10,
  );
  for (const changes of [
    { storyPages: 13 },
    { executionProfileRevision: 2 },
    { maxCharacters: 7 },
    { canvas: { ...canvas, width: 2048 } },
    { languages: [{ tag: "ar", direction: "rtl" }] },
    { execution: { ...pack.execution, maxImageCalls: 6 } },
    { persona: "playful_kid" },
  ])
    assert.throws(() =>
      validatePackageCapacity({ ...pack, ...changes }, capacity),
    );
  assert.throws(() =>
    bookletPackageSchema.parse({
      ...pack,
      credits: Number.MAX_SAFE_INTEGER + 1,
    }),
  );
});

test("manifest binds ordered exact page revisions and package counts", () => {
  const pages = Array.from({ length: 4 }, (_, index) => ({
    subjectId: `page-${index}`,
    role: index === 0 ? "cover" : "story",
    index,
    revision: {
      ...revision,
      artifactId: `art-${index}`,
      revisionId: `rev-${index}`,
    },
    asset: { ...asset, assetId: `asset-${index}` },
    qualityReviewId: `quality-${index}`,
    approvalDecisionId: `decision-${index}`,
  }));
  const manifest = {
    kind: "book-manifest",
    title: "Fixture",
    language,
    acceptedSources: [revision],
    pages,
  };
  assert.equal(validateManifestPackage(manifest, pack).pages.length, 4);
  for (const changed of [
    pages.slice(1),
    [...pages].reverse(),
    [pages[0], pages[1], pages[1], pages[3]],
  ])
    assert.throws(() =>
      validateManifestPackage({ ...manifest, pages: changed }, pack),
    );
  assert.throws(() =>
    validateManifestPackage(
      { ...manifest, language: { tag: "ar", direction: "rtl" } },
      pack,
    ),
  );
});

test("production validates package language, source lineage, and lock ordering", () => {
  const value = {
    schemaVersion: 1,
    id: "prod",
    bookletId: "book",
    ownerId: "user",
    orderId: "order",
    sourceProductionId: null,
    package: pack,
    brief: {
      idea: "A kite",
      audience: "Children",
      language,
      characters: [],
      locations: [],
      visualPreferences: "",
    },
    state: "queued",
    revision: 1,
    activeRunId: null,
    manifestRevisionId: null,
    locks: { story: null, style: null, references: null },
    createdAt: "2026-11-03T00:00:00Z",
    expiresAt: null,
  };
  assert.ok(productionSchema.safeParse(value).success);
  for (const changed of [
    { sourceProductionId: "prod" },
    { state: "completed" },
    {
      locks: {
        ...value.locks,
        references: { operationId: "op", lockedAt: value.createdAt },
      },
    },
    { brief: { ...value.brief, language: { tag: "ar", direction: "rtl" } } },
  ])
    assert.equal(
      productionSchema.safeParse({ ...value, ...changed }).success,
      false,
    );
});

test("quality disposition cannot contradict blocking findings", () => {
  const value = {
    schemaVersion: 1,
    id: "review",
    productionId: "prod",
    operationId: "op",
    target: revision,
    asset,
    sources: [],
    policy: { id: "visual", revision: 1, publicationId: "published" },
    disposition: "pass",
    findings: [],
    evidenceIds: ["evidence"],
    createdAt: "2026-11-03T00:00:00Z",
  };
  assert.ok(qualityReviewSchema.safeParse(value).success);
  assert.equal(
    qualityReviewSchema.safeParse({ ...value, disposition: "repair" }).success,
    false,
  );
  const finding = {
    code: "lettering",
    blocking: true,
    description: "Missing title",
    action: "Restore title",
  };
  assert.equal(
    qualityReviewSchema.safeParse({ ...value, findings: [finding] }).success,
    false,
  );
  assert.ok(
    qualityReviewSchema.safeParse({
      ...value,
      disposition: "repair",
      findings: [finding],
    }).success,
  );
  assert.equal(
    qualityReviewSchema.safeParse({
      ...value,
      disposition: "repair",
      findings: [{ ...finding, code: "aesthetic" }],
    }).success,
    false,
  );
});

test("child envelope rejects Run credentials and mismatched results", () => {
  const input = specialistInputSchema.parse({
    schemaVersion: 1,
    task: "J01",
    operationId: "op",
    invocationId: "invocation",
    parentWorkflowRunId: "parent",
    publicationId: "publication",
    inputFingerprint: sha256,
    subject: { kind: "book", id: "book" },
    instruction: "Develop concept",
    sources: [],
    references: [],
  });
  assert.throws(() =>
    specialistInputSchema.parse({ ...input, runContext: "private" }),
  );
  const result = {
    schemaVersion: 1,
    operationId: "op",
    invocationId: "invocation",
    workflowRunId: "child",
    publicationId: "publication",
    inputFingerprint: sha256,
    evidenceIds: [],
    proposal: {
      kind: "concept",
      title: "Kite",
      premise: "Find kite",
      theme: "Friendship",
      tone: "Warm",
      constraints: [],
    },
  };
  assert.equal(
    verifySpecialistResult(input, result, "child").operationId,
    "op",
  );
  for (const key of [
    "operationId",
    "invocationId",
    "workflowRunId",
    "publicationId",
    "inputFingerprint",
  ])
    assert.throws(() =>
      verifySpecialistResult(input, { ...result, [key]: "wrong" }, "child"),
    );
});

test("deletion requires the full recovery window", () => {
  const value = {
    schemaVersion: 1,
    id: "book",
    ownerId: "user",
    title: "Book",
    currentProductionId: null,
    revision: 1,
    createdAt: "2026-11-03T00:00:00Z",
    deletedAt: "2026-11-03T00:00:00Z",
    recoverUntil: "2026-12-03T00:00:00Z",
  };
  assert.ok(bookletSchema.safeParse(value).success);
  assert.equal(
    bookletSchema.safeParse({ ...value, recoverUntil: null }).success,
    false,
  );
});
test("initial clarification needs no artifact but approval requires exact presented revisions", () => {
  const value = {
    schemaVersion: 1,
    id: "decision",
    ownerId: "user",
    productionId: "prod",
    runId: "run",
    formId: "form",
    submissionId: "submission",
    expectedProductionRevision: 1,
    presented: [],
    submittedAt: "2026-11-03T00:00:00Z",
    action: { kind: "clarify", answer: "For children" },
  };
  assert.ok(humanDecisionSchema.safeParse(value).success);
  assert.equal(
    humanDecisionSchema.safeParse({ ...value, action: { kind: "approve" } })
      .success,
    false,
  );
  assert.ok(
    humanDecisionSchema.safeParse({
      ...value,
      presented: [revision],
      action: { kind: "approve" },
    }).success,
  );
});

test("accepted RTL profiles and coverless packages are not tied to source sample cases", () => {
  const arabic = { tag: "ar", direction: "rtl" };
  const terms = validatePackageCapacity(
    {
      ...pack,
      storyPages: 1,
      includeCover: false,
      maxCharacters: 0,
      maxLocations: 0,
      languages: [arabic],
    },
    { ...capacity, languages: [arabic] },
  );
  const manifest = validateManifestPackage(
    {
      kind: "book-manifest",
      title: "كتاب",
      language: arabic,
      acceptedSources: [],
      pages: [
        {
          subjectId: "page",
          role: "story",
          index: 0,
          revision,
          asset,
          qualityReviewId: "quality",
          approvalDecisionId: "decision",
        },
      ],
    },
    terms,
  );
  assert.equal(manifest.language.direction, "rtl");
  assert.equal(manifest.pages.length, 1);
});

test("creative content rejects ambiguous stable unit and panel identities", () => {
  const unit = {
    id: "unit",
    prose: "A kite flies",
    characterIds: [],
    locationIds: [],
  };
  assert.ok(
    artifactContentSchema.safeParse({ kind: "manuscript", units: [unit] })
      .success,
  );
  assert.equal(
    artifactContentSchema.safeParse({ kind: "manuscript", units: [unit, unit] })
      .success,
    false,
  );
  const panel = {
    id: "panel",
    region: { x: 0, y: 0, width: 1, height: 1 },
    action: "Kite flies",
    characterIds: [],
    locationIds: [],
    manuscriptUnitIds: ["unit"],
    lettering: [],
  };
  assert.equal(
    artifactContentSchema.safeParse({
      kind: "page-plan",
      panels: [panel, panel],
    }).success,
    false,
  );
  assert.equal(
    artifactContentSchema.safeParse({
      kind: "outline",
      summary: "Kite",
      beats: [
        { id: "beat", content: "Fly" },
        { id: "beat", content: "Land" },
      ],
    }).success,
    false,
  );
});
