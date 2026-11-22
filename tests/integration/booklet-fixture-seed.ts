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
const canvas = { width: 1024, height: 1024, mime: "image/png" as const };
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
    const actor = { uid: admin._id, auth_time: Math.floor(Date.now() / 1000) };
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
      inputs: [],
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
