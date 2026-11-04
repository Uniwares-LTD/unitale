import { createCatalogIndexes } from "../src/lib/server/commerce/catalogs";
import { createMeasurementIndexes } from "../src/lib/server/execution/measurements";
import {
  collectionEnabled,
  moduleEnabled,
  moduleIds,
} from "../src/lib/project";
import { serverExtensions } from "../src/project/server";
import { validateServerExtensions } from "../src/lib/server/extensions";
import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import { parseConfig } from "../src/lib/config/schema";
import { parseDatabaseConfig } from "../src/lib/config/database";
import { createCreditIndexes } from "../src/lib/server/store/credits";
import { createPurchaseIndexes } from "../src/lib/server/store/simulation";
import { createRuntimeIndexes } from "../src/lib/server/store/runtime";
import { createPaymentIndexes } from "../src/lib/server/store/payments";
import { createAiIndexes } from "../src/lib/server/ai/jobs";
import { createAiFileIndexes } from "../src/lib/server/ai/files";
import { createOperationsIndexes } from "../src/lib/server/worker-heartbeat";
import { createGrantIndexes } from "../src/lib/server/diagnostics/grant-store";
import { createDiagnosticIndexes } from "../src/lib/server/diagnostics/access-log";
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const base = parseConfig(process.env);
const config = parseDatabaseConfig(process.env, base.server.environment);
async function main() {
  const client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client
      .db(config.database)
      .collection("profiles")
      .createIndex({ uid: 1 }, { unique: true, name: "unique_firebase_uid" });
    await client
      .db(config.database)
      .collection("accountAccess")
      .createIndex({ role: 1, status: 1 });
    await client
      .db(config.database)
      .collection("auditEvents")
      .createIndex({ timestamp: -1, _id: -1 });
    await createCatalogIndexes(client.db(config.database));
    await createMeasurementIndexes(client.db(config.database));
    await createCreditIndexes(client.db(config.database));
    await createPurchaseIndexes(client.db(config.database));
    await createRuntimeIndexes(client.db(config.database));
    await createPaymentIndexes(client.db(config.database));
    await createAiIndexes(client.db(config.database));
    await createAiFileIndexes(client.db(config.database));
    await createOperationsIndexes(client.db(config.database));
    await createDiagnosticIndexes(client.db(config.database));
    await createGrantIndexes(client.db(config.database));
    if (collectionEnabled("notifications"))
      await client
        .db(config.database)
        .collection("notifications")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    for (const [name, keys] of [
      ["runEvents", { uid: 1, logicalId: 1, timestamp: -1, _id: -1 }],
      ["runDecisions", { uid: 1, logicalId: 1, createdAt: -1, _id: -1 }],
      ["notifications", { uid: 1, createdAt: -1, _id: -1 }],
      ["notifications", { uid: 1, read: 1, expiresAt: 1 }],
      ["notificationOutbox", { state: 1, nextAt: 1 }],
      ["notificationOutbox", { state: 1, expiresAt: 1 }],
      ["privateFiles", { uid: 1, createdAt: -1, _id: -1 }],
      ["privateFiles", { state: 1, nextDeleteAt: 1 }],
      ["runAssets", { uid: 1, jobId: 1 }],
      ["runAssetStages", { state: 1, nextDeleteAt: 1 }],
      ["orchestratorVersions", { orchestratorId: 1, revision: -1 }],
      ["baseSettingsVersions", { revision: -1 }],
      ["personas", { archived: 1, enabled: 1 }],
      ["personaVersions", { personaId: 1, revision: -1 }],
      ["artifactRevisions", { uid: 1, artifactId: 1, revision: -1 }],
      ["productAssets", { uid: 1, references: 1, state: 1 }],
      ["resultApplications", { status: 1, nextAttemptAt: 1 }],
    ] as const)
      if (collectionEnabled(name))
        await client.db(config.database).collection(name).createIndex(keys);
    await client
      .db(config.database)
      .collection("aiJobs")
      .createIndex({ uid: 1, "run.logicalId": 1, "run.attempt": -1 });
    await client
      .db(config.database)
      .collection("runCapabilities")
      .createIndex({ jobId: 1 }, { unique: true });
    await client
      .db(config.database)
      .collection("artifacts")
      .createIndex({ id: 1 }, { unique: true });
    await client
      .db(config.database)
      .collection("artifacts")
      .createIndex({ uid: 1, deleted: 1, createdAt: -1, id: -1 });
    await client
      .db(config.database)
      .collection("aiJobs")
      .createIndex({ "responder.parentId": 1 });
    validateServerExtensions([], serverExtensions, moduleIds);
    for (const extension of serverExtensions)
      if (moduleEnabled(extension.module))
        await extension.indexes?.(client.db(config.database));
    console.log(
      "Profile, access, audit, credit, payment and runtime indexes are ready.",
    );
  } finally {
    await client.close();
  }
}
void main().catch(() => {
  console.error(
    "Could not create application indexes. Check MongoDB connectivity, permissions, and duplicate UIDs. No connection credentials were printed.",
  );
  process.exitCode = 1;
});
