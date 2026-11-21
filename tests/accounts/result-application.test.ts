import {
  reconcileExtensions,
  type ServerExtension,
} from "../../src/lib/server/extensions";
import {
  retainEvidence,
  readEvidence,
} from "../../src/lib/server/execution/measurements";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AppError } from "../../src/lib/auth-policy";
import { domains, domainRegistry } from "../../src/lib/server/domains";
import {
  queueResultApplication,
  processOneResultApplication,
} from "../../src/lib/server/domain-results";
import { stageProductAssets } from "../../src/lib/server/runs/assets";
import { readRunAsset } from "../../src/lib/server/runs/media";
import { grantCredits, readWallet } from "../../src/lib/server/store/credits";
import type { AiJob } from "../../src/lib/server/ai/jobs";

test("artifact publication stages payloads before its owned metadata transaction", async (t) => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri(), { monitorCommands: true });
  let sequence = 0;
  async function fixture(count = 9, large = false) {
    const db = client.db(`result_application_${++sequence}`),
      uid = "owner",
      jobId = randomUUID(),
      artifactId = randomUUID();
    const job = {
      _id: jobId,
      uid,
      authTime: Math.floor(Date.now() / 1000),
      status: "succeeded",
      run: {
        artifactId,
        target: {
          adapter: "artifact",
          version: "1",
          kind: "artifact",
          id: artifactId,
        },
      },
    } as AiJob;
    await grantCredits(db, uid, "seed", {
      amount: 5,
      source: "purchase",
      reference: "fixture",
    });
    await db.collection<AiJob>("aiJobs").insertOne(job);
    await db.collection("artifacts").insertOne({
      id: artifactId,
      uid,
      title: "Fixture",
      revision: 1,
      approvedRevision: 1,
      assets: [],
      createdAt: new Date(),
    });
    const images = Array.from({ length: count }, () => ({
      _id: randomUUID(),
      uid,
      jobId,
      logicalId: jobId,
      status: "ready",
      mime: "image/png",
      bytes: large ? 3 * 1024 * 1024 : 3,
      base64: large ? "b".repeat(4 * 1024 * 1024) : "YmJi",
      digest: "0".repeat(64),
      name: "Fixture",
      createdAt: new Date(),
    }));
    await db.collection("runAssets").insertMany(images as never);
    await db.collection("runResults").insertOne({
      _id: jobId,
      uid,
      result: { images: images.map((i) => ({ id: i._id, name: i.name })) },
    } as never);
    const session = client.startSession();
    try {
      await session.withTransaction(() =>
        queueResultApplication(db, job, session),
      );
    } finally {
      await session.endSession();
    }
    return { db, uid, jobId, artifactId, job, images };
  }
  try {
    await t.test(
      "an extension retains late evidence without reopening a stopped Run or publishing assets",
      async () => {
        const { db, uid, jobId } = await fixture(1);
        await db
          .collection<AiJob>("aiJobs")
          .updateOne({ _id: jobId }, { $set: { status: "cancelled" } });
        await db
          .collection("fixtureAcceptedWork")
          .insertOne({ id: "late-call", uid, jobId, status: "unknown" });
        const extension: ServerExtension = {
          module: "notes",
          async reconcile(database, now) {
            const work = await database
              .collection("fixtureAcceptedWork")
              .findOneAndUpdate(
                { id: "late-call", status: "unknown" },
                { $set: { status: "retaining", observedAt: now } },
                { returnDocument: "after" },
              );
            if (!work) return false;
            // A project owns the bounded non-paid readback and its accepted-work fence.
            await retainEvidence(database, work.uid, {
              id: "late-evidence",
              runId: work.jobId,
              operationId: work.id,
              kind: "provider-receipt",
              payload: { status: "succeeded", result: "late result" },
              retentionDays: 1,
            });
            await database
              .collection("fixtureAcceptedWork")
              .updateOne({ id: work.id }, { $set: { status: "retained" } });
            return true;
          },
        };
        const now = new Date();
        assert.equal(await reconcileExtensions([], db, now), false);
        assert.equal(await reconcileExtensions([extension], db, now), true);
        assert.equal(await reconcileExtensions([extension], db, now), false);
        assert.equal(
          (await db.collection<AiJob>("aiJobs").findOne({ _id: jobId }))
            ?.status,
          "cancelled",
        );
        assert.equal(await db.collection<AiJob>("aiJobs").countDocuments(), 1);
        assert.equal(await db.collection("productAssets").countDocuments(), 0);
        assert.deepEqual(await readEvidence(db, uid, "late-evidence"), {
          status: "succeeded",
          result: "late result",
        });
      },
    );
    await t.test(
      "nine large image copies stay on MongoDB's server; transaction wire messages contain metadata only",
      async () => {
        const { db, uid, jobId, artifactId, images } = await fixture(9, true);
        let staged = 0;
        const transactionRequests: number[] = [],
          transactionReplies: number[] = [];
        const activeRequests = new Set<number>();
        const started = (event: import("mongodb").CommandStartedEvent) => {
          if (event.databaseName !== db.databaseName) return;
          if (
            event.command.aggregate === "runAssets" &&
            event.command.pipeline?.some(
              (s: Record<string, unknown>) => s.$merge,
            )
          ) {
            assert.equal(event.command.autocommit, undefined);
            staged++;
          }
          if (event.command.autocommit === false) {
            activeRequests.add(event.requestId);
            transactionRequests.push(
              Buffer.byteLength(JSON.stringify(event.command)),
            );
          }
        };
        const succeeded = (event: import("mongodb").CommandSucceededEvent) => {
          if (activeRequests.has(event.requestId))
            transactionReplies.push(
              Buffer.byteLength(JSON.stringify(event.reply)),
            );
        };
        client.on("commandStarted", started);
        client.on("commandSucceeded", succeeded);
        try {
          assert.equal(await processOneResultApplication(db), true);
        } finally {
          client.off("commandStarted", started);
          client.off("commandSucceeded", succeeded);
        }
        assert.equal(staged, 1);
        assert.ok(
          transactionRequests.length > 0 && transactionReplies.length > 0,
        );
        assert.ok(Math.max(...transactionRequests) < 8192);
        assert.ok(Math.max(...transactionReplies) < 8192);
        const artifact = await db
          .collection("artifacts")
          .findOne({ id: artifactId });
        assert.equal(artifact?.assets.length, 9);
        assert.equal(
          await db.collection("productAssets").countDocuments({
            uid,
            jobId,
            references: `artifact:${artifactId}`,
          }),
          9,
        );
        assert.equal(
          await db
            .collection("runAssets")
            .countDocuments({ jobId, retained: true }),
          9,
        );
        assert.equal((await readWallet(db, uid)).balance, 5);
        assert.equal(await processOneResultApplication(db), false);
        await stageProductAssets(db, uid, jobId);
        assert.equal(
          await db.collection("productAssets").countDocuments({ jobId }),
          9,
        );
        assert.equal(
          (
            await db
              .collection("productAssets")
              .findOne({ _id: images[0]._id } as never)
          )?.references.length,
          1,
        );
      },
    );
    await t.test(
      "failed publication leaves copied images private and retries without copying or charging again",
      async () => {
        const { db, uid, jobId, artifactId } = await fixture(2);
        const artifact = domains.get("artifact", "1");
        const failing = domainRegistry([
          {
            ...artifact,
            async apply(db, intent, session) {
              await artifact.apply(db, intent, session);
              throw new AppError(
                "ASSET_UNAVAILABLE",
                "DO_NOT_RECORD_SECRET_PAYLOAD",
                409,
              );
            },
          },
        ]);
        await processOneResultApplication(db, undefined, failing);
        let record = await db
          .collection("resultApplications")
          .findOne({ jobId });
        assert.equal(record?.status, "failed");
        assert.equal(record?.failure.phase, "apply");
        assert.equal(record?.failure.code, "ASSET_UNAVAILABLE");
        assert.ok(!JSON.stringify(record).includes("DO_NOT_RECORD"));
        assert.equal(
          (await db.collection("artifacts").findOne({ id: artifactId }))?.assets
            .length,
          0,
        );
        assert.equal(
          await db
            .collection("productAssets")
            .countDocuments({ jobId, references: { $size: 0 } }),
          2,
        );
        assert.equal((await readWallet(db, uid)).balance, 5);
        await db
          .collection("resultApplications")
          .updateOne(
            { jobId },
            { $set: { status: "pending", nextAttemptAt: new Date() } },
          );
        await processOneResultApplication(db);
        record = await db.collection("resultApplications").findOne({ jobId });
        assert.equal(record?.status, "applied");
        assert.equal(record?.failure, undefined);
        assert.equal(
          (await db.collection("artifacts").findOne({ id: artifactId }))?.assets
            .length,
          2,
        );
        assert.equal((await readWallet(db, uid)).balance, 5);
      },
    );
    await t.test(
      "missing expected images cannot be marked applied and unreferenced copies cannot be read",
      async () => {
        const { db, uid, jobId, images } = await fixture(2);
        await db
          .collection("runAssets")
          .deleteOne({ _id: images[1]._id } as never);
        await processOneResultApplication(db);
        const record = await db
          .collection("resultApplications")
          .findOne({ jobId });
        assert.equal(record?.status, "failed");
        assert.equal(record?.failure.code, "RESULT_ASSETS_UNAVAILABLE");
        await db.collection("runAssets").deleteMany({ jobId });
        await assert.rejects(
          readRunAsset(db, uid, images[0]._id),
          /unavailable/,
        );
        await assert.rejects(
          readRunAsset(db, "another-owner", images[0]._id),
          /unavailable/,
        );
      },
    );
    await t.test(
      "only images in the accepted saved result receive product references",
      async () => {
        const { db, uid, jobId, artifactId, images } = await fixture(2);
        await db
          .collection("runResults")
          .updateOne({ _id: jobId } as never, {
            $set: {
              "result.images": [{ id: images[0]._id, name: "Selected" }],
            },
          });
        await processOneResultApplication(db);
        assert.deepEqual(
          (await db.collection("artifacts").findOne({ id: artifactId }))
            ?.assets,
          [images[0]._id],
        );
        assert.equal(
          await db
            .collection("productAssets")
            .countDocuments({ uid, jobId, references: { $size: 0 } }),
          1,
        );
      },
    );
    await t.test(
      "a changed accepted target blocks preparation and publication",
      async () => {
        const { db, jobId } = await fixture(1);
        await db
          .collection("resultApplications")
          .updateOne({ jobId }, { $set: { "target.id": randomUUID() } });
        await processOneResultApplication(db);
        const record = await db
          .collection("resultApplications")
          .findOne({ jobId });
        assert.equal(record?.failure.code, "RESULT_TARGET_CHANGED");
        assert.equal(
          await db.collection("productAssets").countDocuments({ jobId }),
          0,
        );
      },
    );
  } finally {
    await client.close();
    await repl.stop();
  }
});
