import { cleanupEvidence } from "../src/lib/server/execution/measurements";
import {
  processOneNotification,
  pruneNotifications,
} from "../src/lib/server/notifications";
import { processOneFileDeletion } from "../src/lib/server/private-files";
import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import Stripe from "stripe";
import { parseConfig } from "../src/lib/config/schema";
import { parseAuthConfig } from "../src/lib/config/auth";
import { parseDatabaseConfig } from "../src/lib/config/database";
import { parsePaymentMode } from "../src/lib/config/credits";
import { parseStripeConfig } from "../src/lib/config/payments";
import {
  maintainCredits,
  processOnePaymentNotice,
  processPaymentOrder,
} from "../src/lib/server/payment-worker";
import { paymentOrders } from "../src/lib/server/store/payments";
import { runtimeRecord } from "../src/lib/log-policy";
import { writeRuntimeRecord } from "../src/lib/server/store/runtime";
import { workerHeartbeat } from "../src/lib/server/worker-heartbeat";
import { readSettings } from "../src/lib/server/settings";
import { processOneAssetDeletion } from "../src/lib/server/runs/cleanup";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  const base = parseConfig(process.env);
  const databaseConfig = parseDatabaseConfig(
    process.env,
    base.server.environment,
  );
  const auth = parseAuthConfig(
    process.env,
    base.server.environment,
    base.server.origin,
  );
  const mode = parsePaymentMode(
    process.env,
    base.server.environment,
    auth.server.mode,
  );
  const settings = parseStripeConfig(process.env, mode === "stripe");
  const stripe = settings
    ? new Stripe(settings.key, { timeout: 10000, maxNetworkRetries: 1 })
    : null;
  const client = new MongoClient(databaseConfig.mongoUri, {
    maxPoolSize: 4,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  const db = client.db(databaseConfig.database);
  const heartbeat = workerHeartbeat(db, "payment");
  const observe = async (status: number, started: number) => {
    const record = runtimeRecord("payment-maintenance", {
      status,
      durationMs: performance.now() - started,
      requestId: crypto.randomUUID(),
    });
    console.log(JSON.stringify(record));
    try {
      await writeRuntimeRecord(db, record, 500);
    } catch {
      /* stdout is the fallback */
    }
  };
  try {
    await heartbeat("ok");
    while (!stopping) {
      const started = performance.now();
      let worked = false;
      let cycleState: "ok" | "error" = "ok";
      try {
        await readSettings(db);
        await pruneNotifications(db);
        worked = (await cleanupEvidence(db)) > 0 || worked;
        worked = (await processOneFileDeletion(db)) || worked;
        for (let n = 0; n < 10; n++) {
          if (!(await processOneNotification(db))) break;
          worked = true;
        }

        if (stripe) {
          for (let n = 0; n < 1 && !stopping; n++) {
            try {
              if (!(await processOnePaymentNotice(db, stripe))) break;
              worked = true;
            } catch {
              cycleState = "error";
              await observe(503, started);
              if (process.argv.includes("--once")) process.exitCode = 1;
            }
          }
          // Poll one overdue order per cycle to recover missed notifications.
          const order = await paymentOrders(db).findOne(
            {
              provider: "stripe",
              $or: [
                {
                  status: "pending",
                  updatedAt: { $lt: new Date(Date.now() - 15 * 60000) },
                },
                {
                  status: { $in: ["paid", "refunded", "disputed"] },
                  updatedAt: { $lt: new Date(Date.now() - 24 * 3600000) },
                },
              ],
            },
            { sort: { updatedAt: 1 } },
          );
          if (order) {
            await processPaymentOrder(db, stripe, order._id);
            worked = true;
          }
        }
        worked = (await maintainCredits(db)) || worked;
        worked = (await processOneAssetDeletion(db)) || worked;

        if (worked) await observe(200, started);
      } catch {
        cycleState = "error";
        await observe(503, started);
        if (process.argv.includes("--once")) process.exitCode = 1;
      }
      await heartbeat(cycleState).catch(() => undefined);
      if (process.argv.includes("--once")) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    await client.close();
  }
}
void main().catch(() => {
  console.error('{"event":"payment-worker-startup","severity":"error"}');
  process.exitCode = 1;
});
