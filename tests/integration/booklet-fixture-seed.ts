// Seeds booklet data into a running disposable integration fixture
// (`node scripts/integration.mjs --owned-auth --browser --ai`) for browser checks.
// Usage: node --conditions=react-server --import tsx
//   tests/integration/booklet-fixture-seed.ts <mongodb-uri>
// It only accepts loopback URIs and the fixture's database prefix, never Atlas.
import { MongoClient } from "mongodb";
import { fixtureDatabasePrefix } from "./project-fixture.mjs";
import {
  previewCatalog,
  publishCatalog,
  saveCatalogDraft,
} from "../../src/lib/server/commerce/catalogs";
import { grantCredits } from "../../src/lib/server/store/credits";
import { readSettings } from "../../src/lib/server/settings";
import { orchestratorSchema } from "../../src/lib/contracts/runs";
import { creativeFieldsSchema } from "../../src/lib/server/booklets/documents";

const uri = process.argv[2] ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
  throw new Error("Pass the fixture's loopback MongoDB URI.");
const types = [
  { id: "booklet", schemaVersion: 1, fields: creativeFieldsSchema },
];
const canvas: {
  width: number;
  height: number;
  mime: "image/png" | "image/webp";
} = { width: 1024, height: 1024, mime: "image/png" };
const languages = [
  { tag: "en", direction: "ltr" as const },
  { tag: "ar", direction: "rtl" as const },
];
const profile = { id: "fixture-profile", revision: 1 };
const execution = {
  maxTextCalls: 200,
  maxImageCalls: 60,
  maxWorkflowSteps: 100,
  maxElapsedSeconds: 3600,
  spendingCeiling: { amountMinor: 100, currency: "USD" },
};
const allowances = [
  { category: "story", unit: "request", included: 1, extraCredits: 5 },
  { category: "style", unit: "subject", included: 1, extraCredits: 3 },
  { category: "reference", unit: "subject", included: 1, extraCredits: 3 },
  { category: "page", unit: "subject", included: 2, extraCredits: 2 },
];
function pack(
  id: string,
  storyPages: number,
  credits: number,
  profileRevision = 1,
) {
  return {
    kind: "consumption",
    terms: {
      identity: { id, revision: 1, schemaVersion: 1 },
      productType: "booklet",
      productSchemaVersion: 1,
      credits,
      allowances,
      entitlementDays: null,
    },
    fields: {
      executionProfileId: profile.id,
      executionProfileRevision: profileRevision,
      storyPages,
      includeCover: true,
      maxCharacters: 3,
      maxLocations: 2,
      maxPanelsPerPage: 3,
      styleSamples: 1,
      canvas,
      languages,
      repairLimitPerOutput: 1,
      execution,
    },
  };
}

async function main() {
  const client = new MongoClient(uri);
  try {
    const names = (await client.db().admin().listDatabases()).databases
      .map((d) => d.name)
      .filter((name) => name.startsWith(fixtureDatabasePrefix));
    if (names.length !== 1) throw new Error("Expected one fixture database.");
    const db = client.db(names[0]);
    const admin = await db
      .collection<{ _id: string }>("accountAccess")
      .findOne({ role: "admin" });
    if (!admin) throw new Error("Fixture administrator not found.");
    // `runs on|off`: toggle Run admission (to exercise pending and Resume).
    if (process.argv[3] === "runs") {
      const enabled = process.argv[4] === "on";
      await readSettings(db);
      await db
        .collection("baseSettings")
        .updateOne(
          { _id: "base" as never },
          { $set: { "settings.runs.enabled": enabled } },
        );
      console.log(`Runs ${enabled ? "enabled" : "disabled"}`);
      return;
    }
    // `settle failed|succeeded`: give the newest booklet attempt a verified
    // terminal outcome (as the worker would) so recovery controls can be checked.
    const settle = process.argv[3] === "settle" ? process.argv[4] : null;
    if (settle) {
      if (!["failed", "succeeded", "unknown"].includes(settle))
        throw new Error("Use settle failed|succeeded|unknown.");
      const job = await db
        .collection("aiJobs")
        .findOne(
          { uid: admin._id, "run.target.adapter": "booklet" },
          { sort: { createdAt: -1 } },
        );
      if (!job) throw new Error("No booklet attempt to settle.");
      await db
        .collection("consumptionWorkflows")
        .updateOne(
          { _id: job.consumption.workflowId },
          { $set: { jobId: job._id } },
        );
      await db.collection("aiJobs").updateOne(
        { _id: job._id },
        // `unknown` is an unverified outcome (public status "reconciling").
        settle === "unknown"
          ? {
              // Defer the fixture worker's reconciliation, as the base browser
              // fixture does for its held jobs, so the state can be observed.
              $set: {
                status: "unknown",
                lease: null,
                nextAttemptAt: new Date(Date.now() + 3600000),
                reviewAfter: new Date(Date.now() + 3600000),
                updatedAt: new Date(),
              },
              $unset: { terminationEvidence: "" },
            }
          : {
              $set: {
                status: settle,
                lease: null,
                terminationEvidence:
                  settle === "succeeded"
                    ? "provider-completed"
                    : "provider-failed",
                updatedAt: new Date(),
              },
            },
      );
      console.log(`Settled ${String(job._id).slice(0, 12)} as ${settle}`);
      return;
    }
    const actor = { uid: admin._id, auth_time: Math.floor(Date.now() / 1000) };
    // Add a distinct immutable demo package; never rewrite existing book terms.
    if (process.argv[3] === "demo") {
      const demoCanvas = {
        width: 1024,
        height: 1536,
        mime: "image/webp" as const,
      };
      const source = await db
        .collection("bookletWorkflowPolicies")
        .findOne({ profileId: profile.id, profileRevision: 1 });
      if (!source) throw new Error("Seed the base fixture first.");
      const { _id: unusedId, ...policy } = source;
      void unusedId;
      await db
        .collection("bookletWorkflowPolicies")
        .updateOne(
          { profileId: profile.id, profileRevision: 3 },
          {
            $setOnInsert: {
              ...policy,
              profileRevision: 3,
              capacity: {
                ...source.capacity,
                revision: 3,
                canvases: [demoCanvas],
              },
            },
          },
          { upsert: true },
        );
      let catalog = await db
        .collection<{ _id: string }>("commerceCatalogs")
        .findOne({ _id: "consumption:fixture-mina" });
      if (!catalog) {
        const definition = pack("fixture-mina", 4, 20, 3);
        definition.fields.canvas = demoCanvas;
        const saved = await saveCatalogDraft(db, actor, definition, 0, types);
        const preview = await previewCatalog(db, actor, saved.id, types);
        await publishCatalog(db, actor, saved.id, 1, preview.hash, types);
        catalog = { _id: saved.id };
      }
      await db
        .collection("bookletSettings")
        .updateOne(
          { _id: "default-package" as never },
          { $set: { catalogId: catalog._id, updatedAt: new Date() } },
          { upsert: true },
        );
      console.log(
        "Prepared Mina demo package selected; existing terms unchanged.",
      );
      return;
    }
    // Profile revision 2 has no policy row: shown as an unavailable package.
    for (const definition of [
      pack("fixture-short", 4, 20),
      pack("fixture-long", 8, 35),
      pack("fixture-unavailable", 6, 25, 2),
    ]) {
      const saved = await saveCatalogDraft(db, actor, definition, 0, types);
      const preview = await previewCatalog(db, actor, saved.id, types);
      await publishCatalog(db, actor, saved.id, 1, preview.hash, types);
    }
    const definition = orchestratorSchema.parse({
      id: "booklet-v2",
      name: "Booklet",
      description: "Fixture booklet Manager",
      order: 0,
      keyEnv: "DIFY_KEY_FIXTURE",
      workflowId: "00000000-0000-4000-8000-000000000001",
      enabled: true,
      domainAdapter: { id: "booklet", version: "2" },
      responseMode: "raw-v1",
      legacyInputs: [],
      // Optional: a reply typed after its question expired (Continue).
      inputs: [
        { name: "late_reply_for", label: "Expired question", kind: "text", required: false, maxLength: 36 },
        { name: "late_reply", label: "Late reply", kind: "paragraph", required: false, maxLength: 2000 },
      ],
      pricing: null,
      recovery: null,
    });
    await db.collection("orchestrators").insertOne({
      _id: definition.id as never,
      revision: 1,
      definition,
      validated: true,
      updatedAt: new Date(),
    });
    await db.collection("bookletWorkflowPolicies").insertOne({
      profileId: profile.id,
      profileRevision: profile.revision,
      orchestratorId: definition.id,
      configurationRevision: 1,
      capacity: {
        ...profile,
        maxStoryPages: 12,
        coverSupported: true,
        maxCharacters: 4,
        maxLocations: 4,
        maxPanelsPerPage: 4,
        maxStyleSamples: 2,
        canvases: [canvas],
        languages,
      },
      retryDefaults: { paidLlm: 2, paidImage: 0, nonPaid: 3 },
    });
    // Conversations use one admin-selected default package.
    const short = await db
      .collection<{ _id: string }>("commerceCatalogs")
      .findOne({ _id: { $regex: /fixture-short$/ } as never });
    if (!short) throw new Error("Default fixture package not found.");
    await db
      .collection<{ _id: string; catalogId: string; updatedAt: Date }>(
        "bookletSettings",
      )
      .updateOne(
        { _id: "default-package" },
        { $set: { catalogId: short._id, updatedAt: new Date() } },
        { upsert: true },
      );
    await readSettings(db);
    await db
      .collection("baseSettings")
      .updateOne(
        { _id: "base" as never },
        { $set: { "settings.runs.enabled": true } },
      );
    await grantCredits(db, admin._id, "booklet-fixture", {
      amount: 200,
      source: "purchase",
      reference: "booklet-fixture",
    });
    console.log("Seeded booklet fixture in " + names[0]);
  } finally {
    await client.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
