import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import sharp from "sharp";
import { database } from "../../src/lib/server/mongo";
import { adminAuth } from "../../src/lib/server/firebase";
import { handleMcp } from "../../src/lib/server/mcp/handler";
import { parseMcpConfig } from "../../src/lib/config/mcp";
import { bookletMcpTools } from "../../src/lib/server/booklets/mcp-tools";
import { bookletsServerExtension } from "../../src/project/booklets/server";
import {
  createCreditIndexes,
  grantCredits,
} from "../../src/lib/server/store/credits";
import {
  productionDocumentSchema,
  bookDocumentSchema,
} from "../../src/lib/server/booklets/documents";
import { privateToolPermissions } from "../../src/lib/server/mcp/private-catalog";
import {
  readEvidence,
  retainEvidence,
  recordMeasurement,
} from "../../src/lib/server/execution/measurements";
import example from "../../docs/features/booklet-generation/model-document-example.json";

const serviceToken = "s".repeat(43),
  runToken = "r".repeat(43);
const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
test("booklet MCP uses real transport, capabilities and repository transactions", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    APP_ENV: "local",
    APP_ORIGIN: "http://localhost:3000",
    AUTH_MODE: "emulator",
    MONGODB_URI: mongo.getUri(),
    MONGODB_DATABASE: "booklet_mcp_test",
  });
  const auth = adminAuth();
  t.mock.method(auth, "getUser", async () => ({
    disabled: false,
    emailVerified: true,
    tokensValidAfterTime: "1970-01-01",
  }));
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });
  const db = database();
  const config = parseMcpConfig(
    {
      MCP_ENABLED: "true",
      MCP_TOKEN_FIXTURE: serviceToken,
      MCP_CLIENTS_JSON: JSON.stringify([
        {
          id: "fixture",
          tokenEnv: "MCP_TOKEN_FIXTURE",
          permissions: ["extension:booklets:read", "extension:booklets:write"],
        },
      ]),
    },
    "http://localhost:3000",
  );
  const logs: unknown[] = [];
  const options = {
    config,
    appName: "Fixture",
    log(event: unknown) {
      logs.push(event);
    },
  };
  const rawCall = async (
    method: string,
    params: unknown,
    credential = serviceToken,
  ) =>
    handleMcp(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
      options,
    );
  const call = async (
    name: string,
    args: Record<string, unknown> = {},
    context = runToken,
  ) => {
    const response = await rawCall("tools/call", {
      name: `booklet_${name}_v1`,
      arguments: { ...args, runContext: context },
    });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  };
  const ok = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args);
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return result.structuredContent.result;
  };
  const denied = async (name: string, args: Record<string, unknown> = {}) =>
    assert.equal((await call(name, args)).isError, true);
  let key = 0;
  const p = () =>
    db.collection("bookletProductions").findOne({ _id: "production" as never });
  const mutation = async () => ({
    key: `write-${++key}`,
    expectedVersion: (await p())!.version,
    fence: 1,
  });
  const upload = async (
    bytes: Buffer,
    kind: "image" | "revision" | "evidence",
  ) => {
    const opened = await ok("transfer", {
      action: {
        type: "open",
        key: `transfer-${++key}`,
        kind,
        bytes: bytes.length,
        sha256: sha(bytes),
      },
    });
    for (
      let offset = 0, index = 0;
      offset < bytes.length;
      offset += opened.chunkBytes, index++
    )
      await ok("transfer", {
        action: {
          type: "part",
          transferId: opened.transferId,
          index,
          data: bytes
            .subarray(offset, offset + opened.chunkBytes)
            .toString("base64"),
        },
      });
    return opened.transferId as string;
  };
  try {
    await createCreditIndexes(db);
    await grantCredits(db, "owner", "fixture", {
      amount: 100,
      source: "purchase",
      reference: "fixture",
    });
    await bookletsServerExtension.indexes!(db);
    const migration = bookletsServerExtension.migrations!.find(
      (m) => m.id === "booklets:0003-mcp",
    )!;
    await migration.run(db);
    await migration.run(db);
    const source = example.collections.bookletProductions[0];
    const cfg = {
      ...source.creativeConfigSnapshot,
      canvas: { width: 8, height: 8, mime: "image/png" },
    };
    const now = new Date();
    await db.collection("bookletBooks").insertOne(
      bookDocumentSchema.parse({
        ...example.collections.bookletBooks[0],
        _id: "book",
        ownerId: "owner",
        currentProductionId: "production",
        createdAt: now,
        updatedAt: now,
      }) as never,
    );
    await db.collection("bookletProductions").insertOne(
      productionDocumentSchema.parse({
        ...source,
        _id: "production",
        ownerId: "owner",
        bookletId: "book",
        orderId: "order",
        subjects: [],
        lifecycleState: "in-progress",
        version: 1,
        mutationLease: null,
        fenceCounter: 0,
        createdAt: now,
        updatedAt: now,
        creativeConfigSnapshot: cfg,
      }) as never,
    );
    await db.collection("consumptionOrders").insertOne({
      _id: "order" as never,
      activeWorkflow: "flow",
      value: {
        schemaVersion: 1,
        id: "order",
        ownerId: "owner",
        targetId: "production",
        idempotencyKey: "order",
        inputHash: "a".repeat(64),
        state: "started",
        chargedCredits: 50,
        refundedCredits: 0,
        chargeLedgerId: "ledger",
        startedAt: now.toISOString(),
        expiresAt: null,
        createdAt: now.toISOString(),
        terms: {
          identity: { id: cfg.id, revision: cfg.revision, schemaVersion: 1 },
          productType: "booklet",
          productSchemaVersion: 1,
          credits: 50,
          allowances: [],
          entitlementDays: null,
        },
      },
    });
    await db.collection("aiJobs").insertOne({
      _id: "run" as never,
      uid: "owner",
      authTime: 1,
      cancelRequested: false,
      status: "running",
      consumption: { orderId: "order", workflowId: "flow" },
      run: {
        logicalId: "logical",
        configurationRevision: 1,
        orchestrator: { id: "booklet" },
        target: { adapter: "booklet", id: "production" },
      },
    });
    await db.collection("runCapabilities").insertOne({
      _id: sha(runToken) as never,
      uid: "owner",
      jobId: "run",
      clientId: "fixture",
      operations: bookletMcpTools.map((t) => t.name),
      expiresAt: new Date(Date.now() + 300000),
    });

    await t.test(
      "one credential discovers the private versioned catalog; foreign, terminal and forged contexts fail",
      async () => {
        const listed = await (await rawCall("tools/list", {})).json();
        assert.deepEqual(
          listed.result.tools.map((x: { name: string }) => x.name).sort(),
          bookletMcpTools.map((t) => t.name).sort(),
        );
        assert.ok(bookletMcpTools.length <= 20);
        for (const tool of bookletMcpTools)
          assert.equal(privateToolPermissions[tool.name], tool.permission);
        assert.equal((await rawCall("tools/list", {}, "wrong")).status, 401);
        assert.equal((await call("context", {}, "x".repeat(43))).isError, true);
        assert.equal((await ok("context")).productionId, "production");
        await denied("context", { productionId: "foreign", ownerId: "other" });
        await db
          .collection("bookletProductions")
          .updateOne(
            { _id: "production" as never },
            { $set: { ownerId: "other" } },
          );
        await denied("context");
        await db
          .collection("bookletProductions")
          .updateOne(
            { _id: "production" as never },
            { $set: { ownerId: "owner" } },
          );
        await db
          .collection("aiJobs")
          .updateOne({ _id: "run" as never }, { $set: { status: "failed" } });
        await denied("context");
        await db
          .collection("aiJobs")
          .updateOne({ _id: "run" as never }, { $set: { status: "running" } });
        const lease = await ok("lease", {
          action: "acquire",
          key: "lease",
          expectedVersion: 1,
        });
        assert.equal(lease.fence, 1);
      },
    );
    let revisionId: string;
    await t.test(
      "chunked revisions save once, reject changed keys and require actual human decisions",
      async () => {
        await ok("index", {
          mutation: await mutation(),
          entry: {
            type: "subject",
            subject: {
              id: "book-subject",
              kind: "book",
              label: "Book",
              pageRole: null,
            },
          },
        });
        await ok("index", {
          mutation: await mutation(),
          entry: {
            type: "artifact",
            subjectId: "book-subject",
            artifactId: "story",
            kind: "manuscript",
          },
        });
        const bytes = Buffer.from(
          JSON.stringify({
            kind: "manuscript",
            units: [
              {
                id: "unit",
                prose: "A lantern shines.",
                characterIds: [],
                locationIds: [],
              },
            ],
          }),
        );
        const transferId = await upload(bytes, "revision");
        const args = {
          mutation: await mutation(),
          transferId,
          artifactId: "story",
          operationId: "story-op",
          sources: [],
          assets: [],
          evidenceIds: [],
        };
        const saved = await ok("save_revision", args);
        revisionId = saved.revisionId;
        assert.deepEqual(await ok("save_revision", args), saved);
        await denied("save_revision", { ...args, operationId: "changed" });
        assert.equal(
          await db.collection("bookletRevisions").countDocuments(),
          1,
        );
        const row = await db
          .collection("bookletRevisions")
          .findOne({ _id: revisionId as never });
        const review = await ok("request_review", {
          mutation: await mutation(),
          targets: [
            { artifactId: "story", revisionId, sha256: row!.contentHash },
          ],
        });
        await denied("apply_decision", {
          mutation: await mutation(),
          requestId: review.requestId,
          decisionId: "fabricated",
        });
        const form = (
          await call("read_document", {
            kind: "review-form",
            recordId: review.requestId,
            offset: 0,
          })
        ).structuredContent;
        const parsed = JSON.parse(Buffer.from(form.data, "base64").toString());
        await db.collection("runDecisions").insertOne({
          _id: "decision" as never,
          uid: "owner",
          jobId: "run",
          status: "submitted",
          answerSource: { type: "user" },
          approval: review.approval,
          confirmedAction: "approve",
          form: { form_content: parsed.formContent },
        });
        await ok("apply_decision", {
          mutation: await mutation(),
          requestId: review.requestId,
          decisionId: "decision",
        });
        await denied("complete", {
          mutation: await mutation(),
          manifestRevisionId: revisionId,
        });
      },
    );
    await t.test(
      "large documents use hash-bound chunks and interrupted uploads reject partial or changed bytes",
      async () => {
        const bytes = Buffer.from(
          JSON.stringify({ message: "large diagnostic ".repeat(3000) }),
        );
        const opened = await ok("transfer", {
          action: {
            type: "open",
            key: "large",
            kind: "evidence",
            bytes: bytes.length,
            sha256: sha(bytes),
          },
        });
        await denied("record_evidence", {
          transferId: opened.transferId,
          evidenceId: "large",
          operationId: "text-op",
          kind: "trace",
        });
        for (let i = 0; i < opened.parts; i++) {
          const action = {
            type: "part",
            transferId: opened.transferId,
            index: i,
            data: bytes.subarray(i * 8192, (i + 1) * 8192).toString("base64"),
          };
          await ok("transfer", { action });
          await ok("transfer", { action });
        }
        await denied("transfer", {
          action: {
            type: "part",
            transferId: opened.transferId,
            index: 0,
            data: Buffer.alloc(8192).toString("base64"),
          },
        });
        const receipt = await ok("record_evidence", {
          transferId: opened.transferId,
          evidenceId: "large",
          operationId: "text-op",
          kind: "trace",
        });
        assert.deepEqual(
          await ok("record_evidence", {
            transferId: opened.transferId,
            evidenceId: "large",
            operationId: "text-op",
            kind: "trace",
          }),
          receipt,
        );
        await denied("record_evidence", {
          transferId: opened.transferId,
          evidenceId: "changed",
          operationId: "text-op",
          kind: "trace",
        });
        assert.equal(
          await db.collection("bookletMcpTransferParts").countDocuments({
            transferId: opened.transferId,
            data: { $exists: true },
          }),
          0,
        );
        await ok("transfer", {
          action: {
            type: "part",
            transferId: opened.transferId,
            index: 0,
            data: bytes.subarray(0, 8192).toString("base64"),
          },
        });
        let offset = 0;
        const chunks: Buffer[] = [];
        let digest: string | undefined;
        do {
          const part = (
            await call("read_document", {
              kind: "evidence",
              recordId: "large",
              offset,
              ...(digest ? { sha256: digest } : {}),
            })
          ).structuredContent;
          assert.ok(part.data.length <= 10924);
          chunks.push(Buffer.from(part.data, "base64"));
          digest = part.sha256;
          offset = part.nextOffset;
        } while (offset !== null);
        assert.deepEqual(
          JSON.parse(Buffer.concat(chunks).toString()),
          JSON.parse(bytes.toString()),
        );
        assert.ok(receipt.sha256);
        await denied("read_document", {
          kind: "evidence",
          recordId: "large",
          offset: 8192,
          sha256: "0".repeat(64),
        });
      },
    );
    await t.test(
      "original retention requires generation and evidence cannot forge provider or quality authority",
      async () => {
        const bytes = await sharp({
          create: { width: 8, height: 8, channels: 3, background: "red" },
        })
          .png()
          .toBuffer();
        const transferId = await upload(bytes, "image");
        await denied("retain_original", {
          transferId,
          operationId: "missing",
          outputKey: "original",
          mime: "image/png",
        });
        assert.equal(await db.collection("bookletAssets").countDocuments(), 0);
        await denied("record_evidence", {
          transferId,
          evidenceId: "forged",
          operationId: "op",
          kind: "provider-receipt",
        });
        const ev = await upload(
          Buffer.from(
            JSON.stringify({
              productionId: "foreign",
              authorization: "secret",
              privateContext: "must-be-redacted",
            }),
          ),
          "evidence",
        );
        await ok("record_evidence", {
          transferId: ev,
          evidenceId: "diag",
          operationId: "diag-op",
          kind: "trace",
        });
        assert.ok(
          !JSON.stringify(await readEvidence(db, "owner", "diag")).includes(
            runToken,
          ),
        );
        await denied("record_quality", {
          evidenceId: "diag",
          measurementId: "fabricated",
        });
        assert.equal(
          await db.collection("bookletQualityReviews").countDocuments(),
          0,
        );
        assert.equal(
          await db.collection("executionMeasurements").countDocuments(),
          0,
        );
        assert.ok(!JSON.stringify(logs).includes(runToken));
        assert.ok(!JSON.stringify(logs).includes(serviceToken));
        // A capability split across adjacent chunks must never enter raw staging.
        const leaked = Buffer.from("x".repeat(8180) + runToken);
        const staging = await ok("transfer", {
          action: {
            type: "open",
            key: "private-rejected",
            kind: "evidence",
            bytes: leaked.length,
            sha256: sha(leaked),
          },
        });
        await ok("transfer", {
          action: {
            type: "part",
            transferId: staging.transferId,
            index: 0,
            data: leaked.subarray(0, 8192).toString("base64"),
          },
        });
        await denied("transfer", {
          action: {
            type: "part",
            transferId: staging.transferId,
            index: 1,
            data: leaked.subarray(8192).toString("base64"),
          },
        });
      },
    );
    await t.test(
      "generation, original attachment and measured quality use the registered tools",
      async () => {
        const save = async (
          artifactId: string,
          content: unknown,
          operationId: string,
          sources: unknown[] = [],
          assets: unknown[] = [],
        ) => {
          const transferId = await upload(
            Buffer.from(JSON.stringify(content)),
            "revision",
          );
          const result = await ok("save_revision", {
            mutation: await mutation(),
            transferId,
            artifactId,
            operationId,
            sources,
            assets,
            evidenceIds: [],
          });
          return (await db
            .collection("bookletRevisions")
            .findOne({ _id: result.revisionId as never }))!;
        };
        const identity = (row: {
          _id: unknown;
          artifactId: string;
          contentHash: string;
        }) => ({
          artifactId: row.artifactId,
          revisionId: row._id,
          sha256: row.contentHash,
        });
        const approve = async (row: Parameters<typeof identity>[0]) => {
          const review = await ok("request_review", {
            mutation: await mutation(),
            targets: [identity(row)],
          });
          const form = (
            await call("read_document", {
              kind: "review-form",
              recordId: review.requestId,
              offset: 0,
            })
          ).structuredContent;
          const decisionId = `decision-${++key}`;
          await db.collection("runDecisions").insertOne({
            _id: decisionId as never,
            uid: "owner",
            jobId: "run",
            status: "submitted",
            answerSource: { type: "user" },
            approval: review.approval,
            confirmedAction: "approve",
            form: {
              form_content: JSON.parse(
                Buffer.from(form.data, "base64").toString(),
              ).formContent,
            },
          });
          return ok("apply_decision", {
            mutation: await mutation(),
            requestId: review.requestId,
            decisionId,
          });
        };
        await ok("index", {
          mutation: await mutation(),
          entry: {
            type: "artifact",
            subjectId: "book-subject",
            artifactId: "style",
            kind: "style",
          },
        });
        const style = await save(
          "style",
          {
            kind: "style",
            direction: "Watercolor",
            palette: ["red"],
            typography: "Readable",
            continuity: [],
          },
          "style-op",
        );
        await approve(style as never);
        await ok("index", {
          mutation: await mutation(),
          entry: {
            type: "subject",
            subject: {
              id: "style-sample",
              kind: "style-sample",
              label: "Style",
              pageRole: null,
            },
          },
        });
        await ok("index", {
          mutation: await mutation(),
          entry: {
            type: "artifact",
            subjectId: "style-sample",
            artifactId: "reference",
            kind: "reference",
          },
        });
        const story = (await db
          .collection("bookletRevisions")
          .findOne({ _id: revisionId as never }))!;
        const sources = [identity(story as never), identity(style as never)];
        const admission = {
          mutation: await mutation(),
          operationId: "image-op",
          artifactId: "reference",
          sources,
        };
        assert.deepEqual(
          await ok("begin_generation", admission),
          await ok("begin_generation", admission),
        );
        assert.deepEqual(
          JSON.parse(
            Buffer.from(
              (
                await call("sources", {
                  kind: "generation",
                  recordId: "image-op",
                })
              ).structuredContent.data,
              "base64",
            ).toString(),
          ),
          [],
        );
        const bytes = await sharp({
          create: { width: 8, height: 8, channels: 3, background: "red" },
        })
          .png()
          .toBuffer();
        const transferId = await upload(bytes, "image");
        const args = {
          transferId,
          operationId: "image-op",
          outputKey: "original",
          mime: "image/png",
        };
        const asset = await ok("retain_original", args);
        assert.deepEqual(await ok("retain_original", args), asset);
        const ref = { assetId: asset.id, sha256: asset.sha256 };
        const image = await save(
          "reference",
          {
            kind: "reference",
            description: "Style",
            requiredFeatures: [],
            asset: ref,
          },
          "image-op",
          sources,
          [ref],
        );
        assert.deepEqual(
          Buffer.from(
            (
              await call("read_document", {
                kind: "asset",
                recordId: asset.id,
                offset: 0,
              })
            ).structuredContent.data,
            "base64",
          ),
          bytes,
        );
        const inputs = JSON.parse(
          Buffer.from(
            (
              await call("sources", {
                kind: "reviewer",
                recordId: image._id,
              })
            ).structuredContent.data,
            "base64",
          ).toString(),
        );
        assert.equal(inputs.original.id, asset.id);
        const policy = {
          id: "visual",
          revision: 1,
          publicationId: "reviewer-published",
        };
        const review = {
          schemaVersion: 1,
          id: "review",
          productionId: "production",
          operationId: "review-op",
          target: identity(image as never),
          asset: ref,
          sources,
          policy,
          disposition: "pass",
          findings: [],
          evidenceIds: ["review-output"],
          createdAt: new Date().toISOString(),
        };
        const out = await retainEvidence(db, "owner", {
          id: "review-output",
          operationId: "review-op",
          runId: "logical",
          kind: "output",
          payload: review,
        });
        const input = await retainEvidence(db, "owner", {
          id: "review-input",
          operationId: "review-op",
          runId: "logical",
          kind: "input",
          payload: { target: review.target, asset: ref, sources },
        });
        await recordMeasurement(db, "owner", {
          schemaVersion: 1,
          id: "review-measurement",
          operationId: "review-op",
          runId: "logical",
          provider: "fake",
          model: "visual",
          requestId: "observed",
          workflowRunId: "observed",
          publicationId: policy.publicationId,
          parentMeasurementId: null,
          scope: "call",
          authority: "adapter",
          usage: { inputTokens: null, outputTokens: null, additional: [] },
          reportedCost: null,
          estimatedCost: null,
          queuedAt: null,
          startedAt: null,
          completedAt: null,
          elapsedMs: null,
          providerDurationMs: null,
          outcome: "succeeded",
          evidence: [input, out],
        });
        await denied("record_quality", {
          evidenceId: "review-output",
          measurementId: "review-measurement",
        });
        await db.collection("bookletWorkflowPolicies").insertOne({
          profileId: cfg.executionProfileId,
          profileRevision: cfg.executionProfileRevision,
          orchestratorId: "booklet",
          configurationRevision: 1,
          reviewer: policy,
        });
        assert.equal(
          (
            await ok("record_quality", {
              evidenceId: "review-output",
              measurementId: "review-measurement",
            })
          ).disposition,
          "pass",
        );
        await approve(image as never);
        await denied("reconcile_generation", {
          operationId: "image-op",
          measurementId: "review-measurement",
        });
      },
    );
    await t.test(
      "concurrent transfer reservations obey the finite production budget",
      async () => {
        const p = await db
          .collection("bookletProductions")
          .findOne({ _id: "production" as never });
        const limits = p!.creativeConfigSnapshot.execution;
        const budget =
          limits.maxImageCalls * 64 * 1024 * 1024 +
          limits.maxTextCalls * 4 * 1024 * 1024;
        await db
          .collection("bookletMcpTransferBudgets")
          .updateOne(
            { productionId: "production" },
            { $set: { bytes: budget - 1 } },
          );
        const replies = await Promise.all(
          ["limit-a", "limit-b"].map((key) =>
            call("transfer", {
              action: {
                type: "open",
                key,
                kind: "revision",
                bytes: 1,
                sha256: sha("x"),
              },
            }),
          ),
        );
        assert.equal(replies.filter((r) => !r.isError).length, 1);
        assert.equal(
          (await db
            .collection("bookletMcpTransferBudgets")
            .findOne({ productionId: "production" }))!.bytes,
          budget,
        );
        await denied("transfer", {
          action: {
            type: "open",
            key: "large-evidence",
            kind: "evidence",
            bytes: 1024 * 1024 + 1,
            sha256: sha("x"),
          },
        });
      },
    );
  } finally {
    await db.client.close();
    await mongo.stop();
    for (const k of Object.keys(process.env))
      if (!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env, oldEnv);
  }
});
