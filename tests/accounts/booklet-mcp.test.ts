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
import { bookletMcpToolsV2 } from "../../src/lib/server/booklets/mcp-tools-v2";
import {
  productionV2Schema,
  revisionV2Schema,
  assessmentDocumentV2Schema,
} from "../../src/lib/server/booklets/documents-v2";
import { fingerprint } from "../../src/lib/server/foundation/canonical";
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
          [...bookletMcpTools, ...bookletMcpToolsV2].map((t) => t.name).sort(),
        );
        assert.ok(bookletMcpTools.length <= 20);
        for (const tool of [...bookletMcpTools, ...bookletMcpToolsV2])
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
    await t.test(
      "v2 tools preserve native Run scope, atomic receipts and complete typed reads",
      async (t) => {
        const v2Token = "v".repeat(43);
        const stored = await p();
        const production = productionV2Schema.parse({
          ...stored,
          _id: "production-v2",
          documentVersion: 2,
          orderId: "order-v2",
          lifecycleState: "in-progress",
          version: 1,
          fenceCounter: 0,
          mutationLease: null,
          expiresAt: null,
          creationHash: fingerprint("v2-fixture"),
          checkpointVersion: 0,
          checkpoint: null,
          retryPolicy: { paidLlm: 2, paidImage: 0, nonPaid: 3 },
          subjects: [
            {
              id: "book-subject",
              kind: "book",
              label: "Book",
              pageRole: null,
              artifacts: [
                {
                  id: "story-v2",
                  kind: "manuscript",
                  currentRevisionId: null,
                  acceptedRevisionId: null,
                },
              ],
            },
          ],
        });
        await db
          .collection("bookletProductions")
          .insertOne(production as never);
        const order = await db
          .collection("consumptionOrders")
          .findOne({ _id: "order" as never });
        await db
          .collection("consumptionOrders")
          .insertOne({
            ...order!,
            _id: "order-v2" as never,
            activeWorkflow: "flow-v2",
            value: {
              ...order!.value,
              id: "order-v2",
              targetId: production._id,
              state: "started",
              expiresAt: null,
            },
          });
        await db
          .collection("consumptionWorkflows")
          .insertOne({
            _id: "flow-v2" as never,
            orderId: "order-v2",
            uid: "owner",
            state: "active",
            jobId: "run-v2",
          });
        await db
          .collection("aiJobs")
          .insertOne({
            _id: "run-v2" as never,
            uid: "owner",
            authTime: 1,
            status: "running",
            cancelRequested: false,
            runId: "native-v2",
            execution: { status: "running" },
            consumption: { orderId: "order-v2", workflowId: "flow-v2" },
            run: {
              logicalId: "logical-v2",
              configurationRevision: 1,
              orchestrator: { id: "booklet-v2" },
              target: {
                adapter: "booklet",
                version: "2",
                kind: "booklet-production",
                id: production._id,
              },
            },
          });
        await db
          .collection("runCapabilities")
          .insertOne({
            _id: sha(v2Token) as never,
            uid: "owner",
            jobId: "run-v2",
            clientId: "fixture",
            operations: bookletMcpToolsV2.map((tool) => tool.name),
            expiresAt: new Date(Date.now() + 300000),
          });
        const invoke = async (
          name: string,
          request: unknown,
          token = v2Token,
        ) => {
          const response = await rawCall("tools/call", {
            name: "booklet_" + name + "_v2",
            arguments: {
              runContext: token,
              request:
                typeof request === "string" ? request : JSON.stringify(request),
            },
          });
          assert.equal(response.status, 200);
          return (await response.json()).result;
        };
        const successful = async (name: string, request: unknown) => {
          const response = await invoke(name, request);
          assert.notEqual(response.isError, true, JSON.stringify(response));
          assert.ok(!JSON.stringify(response).includes(v2Token));
          return response.structuredContent.result;
        };
        const checkpoint = {
          expectedVersion: 0,
          fence: 0,
          state: { pending: { callId: "call-v2" } },
        };
        assert.equal(
          (await invoke("checkpoint", checkpoint, runToken)).isError,
          true,
        );
        assert.equal(
          (await invoke("checkpoint", "invalid JSON")).isError,
          true,
        );
        assert.equal(
          (await invoke("checkpoint", { ...checkpoint, ownerId: "other" }))
            .isError,
          true,
        );
        const saved = await successful("checkpoint", checkpoint);
        assert.equal(saved.checkpointVersion, 1);
        assert.equal(saved.fence, 1);
        assert.deepEqual(await successful("checkpoint", checkpoint), saved);
        const childRequest = {
          contractVersion: 2,
          invocationId: "invocation-v2",
          callId: "call-v2",
          service: "manuscript",
          operation: "write",
          intent: "create",
          items: [
            {
              itemId: "item-v2",
              targetId: "story-v2",
              input: { instruction: "Write the story." },
            },
          ],
          sources: [],
          references: [],
          constraints: {},
        };
        const registration = {
          action: "register",
          fence: saved.fence,
          childRequest,
          targets: ["story-v2"],
          requestHash: fingerprint(childRequest),
        };
        const registered = await successful("begin_work", registration);
        assert.deepEqual(registered, {
          callId: "call-v2",
          requestHash: registration.requestHash,
          status: "registered",
          fence: 2,
        });
        assert.deepEqual(
          await successful("begin_work", registration),
          registered,
        );
        assert.deepEqual(await successful("checkpoint", checkpoint), saved);
        assert.equal(
          await db
            .collection("bookletWork")
            .countDocuments({ productionId: production._id }),
          1,
        );
        assert.equal(
          (await db
            .collection("bookletProductions")
            .findOne({ _id: production._id as never }))!.mutationLease,
          null,
        );
        assert.equal(
          (
            await invoke("begin_work", {
              action: "dispatch",
              callId: "call-v2",
              requestHash: registration.requestHash,
              fence: 2,
            })
          ).isError,
          true,
        );
        assert.equal(
          (
            await invoke("checkpoint", {
              expectedVersion: 1,
              fence: 0,
              state: null,
            })
          ).isError,
          true,
        );
        const work = await successful("read_document", {
          kind: "work",
          id: "call-v2",
        });
        assert.equal(work.type, "value");
        assert.equal(work.complete, true);
        assert.equal(work.value.callId, "call-v2");
        assert.equal(work.value.ownerId, undefined);
        const exactText =
          "\u0645\u0631\u062d\u0628\u0627 e\u0301 \ud83d\ude00\n".repeat(6000);
        const content = {
          kind: "manuscript",
          units: [
            {
              id: "unit-v2",
              texts: [{ id: "text-v2", kind: "prose", text: exactText }],
            },
          ],
        };
        const oldRevision = await db
          .collection("bookletRevisions")
          .findOne({ _id: revisionId as never });
        const revision = revisionV2Schema.parse({
          ...oldRevision,
          _id: "revision-v2",
          documentVersion: 2,
          productionId: production._id,
          artifactId: "story-v2",
          subjectId: "book-subject",
          kind: "manuscript",
          content,
          contentHash: fingerprint(content),
          sources: [],
          assets: [],
        });
        await db.collection("bookletRevisions").insertOne(revision as never);
        const documentRequest = { kind: "revision", id: revision._id };
        let section = await successful("read_document", documentRequest);
        assert.equal(section.complete, false);
        const rootCursor = section.sections.find(
          (part: { key: string }) => part.key === "content",
        ).cursor;
        for (const key of ["content", "units", 0, "texts", 0, "text"]) {
          const part = section.sections.find(
            (part: { key: string | number }) => part.key === key,
          );
          assert.equal(part.complete, false);
          section = await successful("read_document", {
            ...documentRequest,
            cursor: part.cursor,
          });
        }
        let retainedText = "";
        let expectedOffset = 0;
        for (;;) {
          assert.equal(section.type, "text");
          assert.equal(section.offset, expectedOffset);
          assert.equal(section.complete, false);
          assert.ok(Buffer.byteLength(JSON.stringify(section)) < 20 * 1024);
          retainedText += section.text;
          expectedOffset = section.end;
          if (!section.cursor) break;
          section = await successful("read_document", {
            ...documentRequest,
            cursor: section.cursor,
          });
        }
        assert.equal(retainedText, exactText);
        assert.equal(expectedOffset, [...exactText].length);
        assert.equal(
          (
            await invoke("read_document", {
              kind: "work",
              id: "call-v2",
              cursor: rootCursor,
            })
          ).isError,
          true,
        );
        assert.equal(
          (
            await invoke("read_document", {
              ...documentRequest,
              id: revisionId,
            })
          ).isError,
          true,
        );
        const tampered = JSON.parse(
          Buffer.from(rootCursor, "base64url").toString("utf8"),
        );
        tampered.path = ["__proto__"];
        assert.equal(
          (
            await invoke("read_document", {
              ...documentRequest,
              cursor: Buffer.from(JSON.stringify(tampered)).toString(
                "base64url",
              ),
            })
          ).isError,
          true,
        );
        const assessment = assessmentDocumentV2Schema.parse({
          _id: fingerprint("assessment-v2"),
          documentVersion: 2,
          ownerId: "owner",
          productionId: production._id,
          createdAt: new Date(),
          callId: "review-v2",
          policyBinding: "policy",
          reviewerBinding: "reviewer",
          complete: true,
          evidenceIds: ["evidence-v2"],
          assessment: {
            mode: "text",
            targetHash: revision.contentHash,
            requestHash: null,
            sources: [],
            coverage: { targetIds: ["story-v2"], referencePositions: [] },
            disposition: "pass",
            findings: [],
            limitations: [],
          },
        });
        await db
          .collection("bookletAssessments")
          .insertOne(assessment as never);
        const assessmentRead = await successful("read_document", {
          kind: "assessment",
          id: assessment._id,
        });
        assert.equal(assessmentRead.complete, true);
        assert.equal(
          assessmentRead.value.assessment.targetHash,
          revision.contentHash,
        );
        assert.equal(assessmentRead.value.ownerId, undefined);
        await db
          .collection("bookletWork")
          .updateOne(
            { productionId: production._id, callId: "call-v2" },
            {
              $set: {
                evidenceIds: Array.from(
                  { length: 1000 },
                  (_, i) => "observed-evidence-" + i,
                ),
              },
            },
          );
        const changing = await successful("read_document", {
          kind: "work",
          id: "call-v2",
        });
        const changingCursor = changing.cursor;
        assert.ok(changingCursor);
        await db
          .collection("bookletWork")
          .updateOne(
            { productionId: production._id, callId: "call-v2" },
            { $addToSet: { evidenceIds: "later-observation" } },
          );
        assert.equal(
          (
            await invoke("read_document", {
              kind: "work",
              id: "call-v2",
              cursor: changingCursor,
            })
          ).isError,
          true,
        );
        assert.equal(
          (
            await invoke("read_document", {
              kind: "assessment",
              id: "foreign-assessment",
            })
          ).isError,
          true,
        );
        await t.test(
          "history pages pin immutable metadata and exclude later revisions",
          async () => {
            const smallContent = { kind: "manuscript", units: [] };
            await db.collection("bookletRevisions").insertMany(
              Array.from({ length: 25 }, (_, index) =>
                revisionV2Schema.parse({
                  ...revision,
                  _id: "history-v2-" + (index + 2),
                  ordinal: index + 2,
                  content: smallContent,
                  contentHash: fingerprint(smallContent),
                }),
              ) as never,
            );
            const firstPage = await successful("read_document", {
              kind: "history",
              id: "story-v2",
            });
            assert.equal(firstPage.items.length, 20);
            assert.equal(firstPage.snapshotOrdinal, 26);
            assert.equal(firstPage.complete, false);
            assert.ok(firstPage.cursor);
            assert.ok(
              firstPage.items.every(
                (item: Record<string, unknown>) =>
                  !Object.hasOwn(item, "content") &&
                  !Object.hasOwn(item, "ownerId"),
              ),
            );
            await db.collection("bookletRevisions").insertOne(
              revisionV2Schema.parse({
                ...revision,
                _id: "history-v2-27",
                ordinal: 27,
                content: smallContent,
                contentHash: fingerprint(smallContent),
              }) as never,
            );
            const lastPage = await successful("read_document", {
              kind: "history",
              id: "story-v2",
              cursor: firstPage.cursor,
            });
            assert.equal(lastPage.snapshotOrdinal, 26);
            assert.equal(lastPage.cursor, null);
            assert.equal(lastPage.complete, false);
            assert.deepEqual(
              [...firstPage.items, ...lastPage.items].map(
                (item: { ordinal: number }) => item.ordinal,
              ),
              Array.from({ length: 26 }, (_, index) => index + 1),
            );
            assert.equal(
              (
                await invoke("read_document", {
                  kind: "history",
                  id: "foreign-artifact",
                  cursor: firstPage.cursor,
                })
              ).isError,
              true,
            );
            assert.equal(
              (
                await invoke("read_document", {
                  kind: "revision",
                  id: revision._id,
                  cursor: firstPage.cursor,
                })
              ).isError,
              true,
            );
            assert.equal(
              (
                await successful("read_document", {
                  kind: "history",
                  id: "story-v2",
                })
              ).snapshotOrdinal,
              27,
            );
          },
        );
        await t.test(
          "index batches preserve identities, capacity and atomic rollback",
          async () => {
            const before = await db
              .collection("bookletProductions")
              .findOne({ _id: production._id as never });
            const page = {
              id: "page-v2",
              kind: "page",
              label: "First page",
              pageRole: "story",
            };
            const spec = {
              subjectId: page.id,
              artifactId: "page-spec-v2",
              kind: "page-spec",
            };
            const invalid = {
              subjects: [page],
              artifacts: [
                spec,
                {
                  subjectId: page.id,
                  artifactId: "wrong-responsibility",
                  kind: "reference",
                },
              ],
              fence: before!.fenceCounter,
            };
            assert.equal((await invoke("index", invalid)).isError, true);
            assert.deepEqual(
              await db
                .collection("bookletProductions")
                .findOne({ _id: production._id as never }),
              before,
            );
            const request = {
              subjects: [
                {
                  id: "book-subject",
                  kind: "book",
                  label: "Book",
                  pageRole: null,
                },
                page,
              ],
              artifacts: [
                {
                  subjectId: "book-subject",
                  artifactId: "story-v2",
                  kind: "manuscript",
                },
                spec,
              ],
              fence: before!.fenceCounter,
            };
            const indexed = await successful("index", request);
            assert.deepEqual(indexed, {
              subjects: {
                "book-subject": "book-subject",
                "page-v2": "page-v2",
              },
              artifacts: {
                "story-v2": "story-v2",
                "page-spec-v2": "page-spec-v2",
              },
              fence: before!.fenceCounter + 1,
            });
            assert.deepEqual(await successful("index", request), indexed);
            const added = await db
              .collection("bookletProductions")
              .findOne({ _id: production._id as never });
            assert.equal(added!.subjects.length, before!.subjects.length + 1);
            assert.deepEqual(added!.subjects[0], before!.subjects[0]);
            assert.equal(added!.mutationLease, null);
            const reused = await successful("index", {
              ...request,
              fence: indexed.fence,
            });
            const after = await db
              .collection("bookletProductions")
              .findOne({ _id: production._id as never });
            assert.deepEqual(after!.subjects, added!.subjects);
            assert.equal(after!.version, added!.version + 1);
            assert.equal(
              (await invoke("index", {
                subjects: [],
                artifacts: [{
                  subjectId: "book-subject",
                  artifactId: "new-candidate-id",
                  kind: "manuscript",
                }],
                fence: reused.fence,
              })).isError,
              true,
            );
            const overCapacity = {
              subjects: Array.from(
                { length: production.creativeConfigSnapshot.storyPages + 1 },
                (_, index) => ({
                  id: "excess-page-" + index,
                  kind: "page",
                  label: "Page",
                  pageRole: "story",
                }),
              ),
              artifacts: [],
              fence: reused.fence,
            };
            assert.equal((await invoke("index", overCapacity)).isError, true);
            assert.equal(
              (
                await invoke("index", {
                  subjects: [],
                  artifacts: [
                    {
                      subjectId: page.id,
                      artifactId: "story-v2",
                      kind: "manuscript",
                    },
                  ],
                  fence: reused.fence,
                })
              ).isError,
              true,
            );
            assert.equal(
              (
                await invoke("index", {
                  subjects: [page, page],
                  artifacts: [],
                  fence: reused.fence,
                })
              ).isError,
              true,
            );
            assert.deepEqual(
              await db
                .collection("bookletProductions")
                .findOne({ _id: production._id as never }),
              after,
            );
          },
        );
        for (const change of [
          { cancelRequested: true },
          { "run.target.version": "1" },
          { "run.answerer": { id: "persona" } },
          { "execution.status": "failed" },
        ]) {
          await db
            .collection("aiJobs")
            .updateOne({ _id: "run-v2" as never }, { $set: change });
          assert.equal((await invoke("checkpoint", checkpoint)).isError, true);
          await db.collection("aiJobs").updateOne(
            { _id: "run-v2" as never },
            {
              $set: {
                cancelRequested: false,
                "run.target.version": "2",
                "execution.status": "running",
              },
              $unset: { "run.answerer": "" },
            },
          );
        }
        await db
          .collection("consumptionWorkflows")
          .updateOne({ _id: "flow-v2" as never }, { $set: { jobId: "other" } });
        assert.equal((await invoke("checkpoint", checkpoint)).isError, true);
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
