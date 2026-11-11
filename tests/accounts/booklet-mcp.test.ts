import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { validateBookletSuiteV2 } from "../../src/lib/server/booklets/suite-v2";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import sharp from "sharp";

function suiteFixture() {
  const exported = parseYaml(readFileSync("docs/features/booklet-generation/workflow-package/manager/workflow.yaml", "utf8"));
  const graph = exported.workflow.graph as { nodes: { id: string; data: Record<string, unknown> }[] };
  const workflowId = randomUUID();
  const children = Object.fromEntries(graph.nodes.filter((node) => node.id.startsWith("child-")).map((node) => {
    node.data.provider_id = "configured-" + node.id;
    return [node.id.slice(6), { appId: randomUUID(), workflowId: randomUUID(), providerId: node.data.provider_id, toolName: node.data.tool_name }];
  }));
  const manifest = JSON.parse(readFileSync("docs/features/booklet-generation/workflow-package/manifest.json", "utf8"));
  const suite = { managerWorkflowId: workflowId, children,
    providerPackages: manifest.requiredPlugins.map((plugin: { installedPackageIdentifier: string }) => plugin.installedPackageIdentifier) as string[],
  };
  return { suite, workflowId, graph };
}
test("suite bindings match the actual Manager child-tool nodes", () => {
  const { suite, workflowId, graph } = suiteFixture();
  assert.deepEqual(validateBookletSuiteV2(suite, { workflowId, graph }), suite);
  assert.throws(() => validateBookletSuiteV2(suite, { workflowId: randomUUID(), graph }), /another Manager/);
  const foreign = structuredClone(suite);
  foreign.children["quality-reviewer"].providerId = "foreign-tool";
  assert.throws(() => validateBookletSuiteV2(foreign, { workflowId, graph }), /workflow-tool binding/);
  const missing = structuredClone(suite);
  delete missing.children["image-executor"];
  assert.throws(() => validateBookletSuiteV2(missing, { workflowId, graph }));
  const duplicate = structuredClone(graph);
  duplicate.nodes.push(duplicate.nodes.find((node) => node.id === "child-manuscript")!);
  assert.throws(() => validateBookletSuiteV2(suite, { workflowId, graph: duplicate }), /workflow-tool binding/);
  const missingProvider = { ...suite, providerPackages: suite.providerPackages.slice(0, 1) };
  assert.throws(() => validateBookletSuiteV2(missingProvider, { workflowId, graph }));
  const ambiguousProvider = { ...suite, providerPackages: [...suite.providerPackages, suite.providerPackages[0]] };
  assert.throws(() => validateBookletSuiteV2(ambiguousProvider, { workflowId, graph }), /unambiguous/);
  const collapsed = structuredClone(suite);
  collapsed.children["quality-reviewer"].workflowId = collapsed.children.manuscript.workflowId;
  assert.throws(() => validateBookletSuiteV2(collapsed, { workflowId, graph }), /workflow-tool binding/);
});
import { database } from "../../src/lib/server/mongo";
import { adminAuth } from "../../src/lib/server/firebase";
import { handleMcp } from "../../src/lib/server/mcp/handler";
import { parseMcpConfig } from "../../src/lib/config/mcp";
import { mcpLimitsSchema, type McpLimits } from "../../src/lib/contracts/mcp-limits";
import { bookletMcpTools } from "../../src/lib/server/booklets/mcp-tools";
import { bookletMcpToolsV2 } from "../../src/lib/server/booklets/mcp-tools-v2";
import { bookletTransfers } from "../../src/lib/server/booklets/mcp-transfers";
import { observeBookletNodeV2 } from "../../src/lib/server/booklets/observations-v2";
import type { AiJob } from "../../src/lib/server/ai/jobs";
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
    limits?: McpLimits,
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
      { ...options, limits },
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
          revisionChargeId: null,
          stageLocks: { story: null, style: null, references: null },
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
          }, serviceToken, mcpLimitsSchema.parse({ toolResultBytes: 256 * 1024, responseBytes: 1024 * 1024 }));
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
        const savedCheckpoint = await successful("read_document", { kind: "checkpoint", id: production._id });
        assert.equal(savedCheckpoint.complete, true);
        assert.deepEqual(savedCheckpoint.value, { checkpointVersion: 1, state: checkpoint.state });
        assert.equal((await invoke("read_document", { kind: "checkpoint", id: "foreign-production" })).isError, true);
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
              targetId: "book-subject",
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
        const leakedRequest = { ...childRequest, items: [{ ...childRequest.items[0],
          input: { instruction: "A literal private capability: " + v2Token } }] };
        const rejectedSecret = await invoke("begin_work", { ...registration, childRequest: leakedRequest,
          requestHash: fingerprint(leakedRequest) });
        assert.equal(rejectedSecret.isError, true);
        assert.ok(!JSON.stringify(rejectedSecret).includes(v2Token));
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
        assert.deepEqual(work.value.requestPayload, childRequest);
        assert.equal(work.value.ownerId, undefined);
        const productionRead = await successful("read_document", { kind: "production", id: production._id });
        assert.equal(productionRead.complete, true);
        assert.deepEqual(productionRead.value.brief, production.brief);
        assert.equal(productionRead.value.productionId, production._id);
        for (const field of ["ownerId", "orderId", "mutationLease", "checkpoint", "creationHash"])
          assert.equal(productionRead.value[field], undefined);
        assert.equal((await invoke("read_document", { kind: "production", id: "foreign-production" })).isError, true);
        assert.equal((await invoke("context", {})).isError, true);
        const configured = suiteFixture();
        await db.collection("aiJobs").updateOne({ _id: "run-v2" as never }, { $set: {
          "run.orchestrator.workflowId": configured.workflowId,
        } });
        const bindingRow = {
          profileId: production.creativeConfigSnapshot.executionProfileId,
          profileRevision: production.creativeConfigSnapshot.executionProfileRevision,
          orchestratorId: "booklet-v2", configurationRevision: 1,
          suite: configured.suite, managerGraph: configured.graph,
          reviewer: { id: "review-policy-v2", revision: 1, publicationId: configured.suite.children["quality-reviewer"].workflowId },
        };
        await db.collection("bookletWorkflowPolicies").insertOne(bindingRow);
        const facts = await successful("context", {});
        assert.equal(facts.productionId, production._id);
        assert.equal(facts.fence, registered.fence);
        assert.equal(facts.usage.canDispatch, false);
        assert.equal(facts.usage.workAttempts.paidLlm, 0);
        await t.test("native cost facts preserve unknowns and never add a Run summary to its nodes", async () => {
          const native = (id: string, scope: "node" | "execution", price: string | null, currency = "USD") => ({
            _id: fingerprint(["cost-fixture", id]) as never, uid: "owner", jobId: "run-v2", runId: "native-v2",
            id, scope, inputTokens: null, outputTokens: null, totalTokens: null,
            cost: price === null ? null : { amount: price, currency, source: "provider" },
            elapsedMs: null, provider: "fake", capability: "workflow", timestamp: new Date(),
          });
          const rows = [native("node-a", "node", "0.1"), native("node-b", "node", "0.2"), native("unknown", "node", null)];
          await db.collection("aiUsage").insertMany(rows);
          let costs = (await successful("context", {})).usage.costs;
          assert.equal(costs.reportedSubtotal, "0.3");
          assert.equal(costs.unknownNativeRecords, 1);
          assert.equal(costs.complete, false);
          const summary = native("summary", "execution", "0.25");
          await db.collection("aiUsage").insertOne(summary);
          costs = (await successful("context", {})).usage.costs;
          assert.equal(costs.reportedSubtotal, "0.3");
          await db.collection("aiUsage").updateOne({ _id: summary._id }, { $set: { "cost.amount": "0.5" } });
          assert.equal((await successful("context", {})).usage.costs.reportedSubtotal, "0.5");
          await db.collection("aiUsage").updateOne({ _id: summary._id }, { $set: { "cost.amount": String(production.creativeConfigSnapshot.execution.spendingCeiling.amountMinor) } });
          assert.equal((await successful("context", {})).usage.costs.overCeiling, true);
          const foreign = { ...native("foreign", "execution", "999999999"), uid: "foreign-owner" };
          const other = native("other-currency", "node", "1", "EUR");
          await db.collection("aiUsage").insertMany([foreign, other]);
          await db.collection("aiUsage").deleteOne({ _id: summary._id });
          costs = (await successful("context", {})).usage.costs;
          assert.equal(costs.reportedSubtotal, "0.3");
          assert.equal(costs.otherCurrencyRecords, 1);
          const parent = await db.collection("aiJobs").findOne({ _id: "run-v2" as never });
          const continuationId = "cost-continuation", unrelatedId = "cost-other-production";
          await db.collection("aiJobs").insertMany([
            { ...parent!, _id: continuationId as never, runId: "native-cost-continuation", status: "succeeded" },
            { ...parent!, _id: unrelatedId as never, run: { ...parent!.run, target: { ...parent!.run.target, id: "other-production" } } },
          ]);
          const continued = { ...native("continued", "execution", "0.4"), jobId: continuationId, runId: "native-cost-continuation" };
          const unrelated = { ...native("unrelated", "execution", "1000"), jobId: unrelatedId };
          await db.collection("aiUsage").insertMany([continued, unrelated]);
          assert.equal((await successful("context", {})).usage.costs.reportedSubtotal, "0.7");
          await db.collection("aiUsage").deleteMany({ _id: { $in: [continued._id, unrelated._id] } });
          await db.collection("aiJobs").deleteMany({ _id: { $in: [continuationId, unrelatedId] as never[] } });
          await db.collection("aiUsage").deleteMany({ _id: { $in: [...rows, foreign, other].map((row) => row._id) } });
        });
        assert.equal(facts.work[0].callId, "call-v2");
        assert.equal(facts.work[0].resultAvailable, false);
        assert.equal(facts.reviewerBinding, bindingRow.reviewer.publicationId);
        for (const key of ["ownerId", "orderId", "secret", "managerGraph", "suite"])
          assert.equal(facts[key], undefined);
        await db.collection("bookletWorkflowPolicies").updateOne({ orchestratorId: "booklet-v2" }, { $set: { "reviewer.publicationId": randomUUID() } });
        assert.equal((await invoke("context", {})).isError, true);
        await db.collection("bookletWorkflowPolicies").updateOne({ orchestratorId: "booklet-v2" }, { $set: { reviewer: bindingRow.reviewer } });
        const duplicateBindingId = randomUUID();
        await assert.rejects(db.collection("bookletWorkflowPolicies").insertOne({ ...bindingRow, _id: duplicateBindingId as never }), /E11000/);
        await t.test("context keeps old pending work and histories navigate beyond summary limits", async () => {
          const original = await db.collection("bookletWork").findOne({ ownerId: "owner", productionId: production._id, callId: "call-v2" });
          const before = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const rows = Array.from({ length: 25 }, (_, i) => ({ ...original!,
            _id: fingerprint(["context-history", i]) as never, callId: "history-" + i,
            actionKey: fingerprint(["context-action", i]), createdAt: new Date(Date.now() + 1000 + i),
          }));
          await db.collection("bookletWork").insertMany(rows);
          await db.collection("bookletWork").updateMany({ _id: { $in: rows.slice(0, 20).map((row) => row._id) } }, { $set: { status: "unknown" } });
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: {
            checkpoint: { pending: { callId: "call-v2", action: "manuscript" } },
          } });
          const context = await successful("context", {});
          assert.equal(context.workComplete, false);
          assert.equal(context.usage.workAttempts.paidLlm, 20);
          assert.equal(context.usage.workAttempts.unresolved, 20);
          assert.equal(context.work[0].callId, "call-v2");
          assert.equal(context.workHistoryDocument.kind, "work_history");
          assert.ok(Buffer.byteLength(JSON.stringify(context)) < 65536);
          const first = await successful("read_document", context.workHistoryDocument);
          assert.equal(first.items.length, 20);
          assert.equal(first.complete, false);
          const second = await successful("read_document", { ...context.workHistoryDocument, cursor: first.cursor });
          assert.equal(second.cursor, null);
          const calls = [...first.items, ...second.items].map((item: { callId: string }) => item.callId);
          assert.equal(calls.length, 26);
          assert.equal(new Set(calls).size, 26);
          const correction = await successful("read_document", { kind: "correction", id: original!.correctionRootId });
          assert.equal(correction.complete, true);
          assert.equal(correction.value.rootId, original!.correctionRootId);
          assert.equal((await invoke("read_document", { kind: "work_history", id: "foreign-production" })).isError, true);
          assert.equal((await invoke("read_document", { kind: "assessment_history", id: production._id, cursor: first.cursor })).isError, true);
          const late = { ...rows[0], _id: fingerprint("late-reason-observation") as never, callId: "late-history", actionKey: fingerprint("late-reason-action") };
          await db.collection("bookletWork").insertOne(late);
          assert.equal((await invoke("read_document", { ...context.workHistoryDocument, cursor: first.cursor })).isError, true);
          await db.collection("bookletWork").deleteOne({ _id: late._id });
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $inc: { version: 1 } });
          assert.equal((await invoke("read_document", { ...context.workHistoryDocument, cursor: first.cursor })).isError, true);
          const largeCheckpoint = { keep: "x".repeat(64000) };
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { checkpoint: largeCheckpoint } });
          const largeContext = await successful("context", {});
          assert.deepEqual(largeContext.checkpoint, largeCheckpoint);
          assert.ok(Buffer.byteLength(JSON.stringify(largeContext)) > 65536);
          assert.ok(Buffer.byteLength(JSON.stringify(largeContext)) < 131072);
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { version: before!.version, checkpoint: before!.checkpoint } });
          await db.collection("bookletWork").deleteMany({ _id: { $in: rows.map((row) => row._id) } });
          const empty = await successful("read_document", { kind: "assessment_history", id: production._id });
          assert.equal(empty.complete, true);
          assert.deepEqual(empty.items, []);
        });
        const pendingWork = await successful("reconcile_work", { callId: "call-v2" });
        assert.equal(pendingWork.status, "registered");
        assert.equal(pendingWork.resultAvailable, false);
        assert.equal(pendingWork.retryable, false);
        assert.equal((await invoke("reconcile_work", { callId: "call-v2", executionLocator: { runId: "forged" } })).isError, true);
        await t.test("v2 transfer resumes immutable chunks without altering the production fence", async () => {
          const content = Buffer.from(JSON.stringify({ text: "exact e\u0301 \ud83d\ude00\n".repeat(1600) }));
          const metadata = { action: "open", key: "large-v2-revision", kind: "revision",
            bytes: content.length, sha256: sha(content) };
          const opened = await successful("transfer", metadata);
          assert.deepEqual(await successful("transfer", metadata), opened);
          const store = bookletTransfers(db, { uid: "owner", authTime: 1 }, production._id, 2);
          await assert.rejects(store.read(opened.transferId, "revision", AbortSignal.timeout(5000)), /incomplete/);
          for (let i = 0; i < opened.parts; i++) {
            const part = { action: "part", transferId: opened.transferId, index: i,
              data: content.subarray(i * opened.chunkBytes, (i + 1) * opened.chunkBytes).toString("base64") };
            const saved = await successful("transfer", part);
            assert.deepEqual(await successful("transfer", part), saved);
          }
          assert.deepEqual(await store.read(opened.transferId, "revision", AbortSignal.timeout(5000)), content);
          assert.equal((await invoke("transfer", { ...metadata, sha256: "a".repeat(64) })).isError, true);
          assert.equal((await db.collection("bookletProductions").findOne({ _id: production._id as never }))!.fenceCounter, 2);
          // Version selection is server-side and v1 remains strict.
          await assert.rejects(bookletTransfers(db, { uid: "owner", authTime: 1 }, production._id).read(
            opened.transferId, "revision", AbortSignal.timeout(5000)));
          const secretBytes = Buffer.from("x".repeat(8175) + v2Token + "tail");
          const hidden = await successful("transfer", { action: "open", key: "secret-v2-rejected",
            kind: "revision", bytes: secretBytes.length, sha256: sha(secretBytes) });
          await successful("transfer", { action: "part", transferId: hidden.transferId, index: 0,
            data: secretBytes.subarray(0, hidden.chunkBytes).toString("base64") });
          assert.equal((await invoke("transfer", { action: "part", transferId: hidden.transferId, index: 1,
            data: secretBytes.subarray(hidden.chunkBytes).toString("base64") })).isError, true);
        });
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
        await t.test("retained large proposals publish through the v2 transfer and revision tools exactly once", async () => {
          const workflowId = configured.workflowId;
          await db.collection("aiJobs").updateOne({ _id: "run-v2" as never }, { $set: {
            "run.orchestrator.workflowId": workflowId, "execution.workflowId": workflowId,
          } });
          await db.collection("bookletWork").updateOne({ productionId: production._id, callId: "call-v2" }, { $set: { status: "dispatching" } });
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const result = { contractVersion: 2, invocationId: childRequest.invocationId, callId: childRequest.callId,
            service: "manuscript", operation: "write", status: "succeeded", items: [{ itemId: childRequest.items[0].itemId,
              status: "succeeded", proposals: [{ kind: "manuscript", subjectId: "book-subject", content }] }] };
          const session = db.client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: "native-v2", id: "retained-text-node", nodeId: "child-manuscript", nodeType: "tool", status: "succeeded",
            retryIndex: 0, iterationId: null, loopId: "iteration-v2", outputs: { json: [{ result: JSON.stringify(result) }] },
            outputsTruncated: false, error: null, executionMetadata: null,
          }, session)); } finally { await session.endSession(); }
          const captured = await db.collection("bookletWork").findOne({ productionId: production._id, callId: "call-v2" });
          const evidence = [captured!.evidenceIds.at(-1)];
          const bytes = Buffer.from(JSON.stringify(content));
          const transfer = await successful("transfer", { action: "open", key: "publish-large-manuscript",
            kind: "revision", bytes: bytes.length, sha256: sha(bytes) });
          for (let index = 0; index < transfer.parts; index++) await successful("transfer", {
            action: "part", transferId: transfer.transferId, index,
            data: bytes.subarray(index * transfer.chunkBytes, (index + 1) * transfer.chunkBytes).toString("base64"),
          });
          const before = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const request = { artifactId: "story-v2", content: { callId: "call-v2", itemId: childRequest.items[0].itemId, proposalIndex: 0 }, sources: [], assets: [],
            evidence, mutationKey: "save-large-manuscript", fence: before!.fenceCounter };
          assert.ok(Buffer.byteLength(JSON.stringify(request)) < 1024);
          assert.equal((await invoke("save_revision", { ...request, content: { kind: "manuscript", units: [] } })).isError, true);
          assert.equal((await invoke("save_revision", { ...request, content: { ...request.content, proposalIndex: 1 } })).isError, true);
          const saved = await successful("save_revision", request);
          assert.deepEqual(await successful("save_revision", request), saved);
          assert.equal((await successful("save_revision", { ...request, content: { transferId: transfer.transferId },
            mutationKey: "same-proposal-via-transfer", fence: saved.fence })).revisionId, saved.revisionId);
          assert.equal(saved.contentHash, fingerprint(content));
          const stored = await db.collection("bookletRevisions").findOne({ _id: saved.revisionId as never });
          assert.deepEqual(stored!.content, content);
          assert.equal(stored!.provenance.operationId, "call-v2");
          assert.equal(await db.collection("bookletRevisions").countDocuments({ productionId: production._id,
            artifactId: "story-v2", "provenance.operationId": "call-v2" }), 1);

          // Exercise actual Code functions against real tool replies, not a Dify interpreter.
          const runCode = (id: string, args: Record<string, unknown>) => {
            const python = process.env.BOOKLET_PYTHON ?? (existsSync("output/tooling/python312/python.exe")
              ? resolve("output/tooling/python312/python.exe") : "python3");
            const executed = spawnSync(python, ["-c",
              "import json,sys; v=json.load(sys.stdin); s={}; exec(v['code'],s); print(json.dumps(s['main'](**v['args']),ensure_ascii=False))"], {
              input: JSON.stringify({ code: configured.graph.nodes.find((node) => node.id === id)!.data.code, args }),
              encoding: "utf8", timeout: 5000, env: { ...process.env, PYTHONUTF8: "1" },
            });
            assert.equal(executed.status, 0, executed.stderr || String(executed.error));
            return JSON.parse(executed.stdout);
          };
          let current = await successful("context", {});
          const pending = await successful("checkpoint", { expectedVersion: current.checkpointVersion, fence: current.fence,
            state: { ...current.checkpoint, pending: { action: "manuscript", callId: childRequest.callId,
              invocationId: childRequest.invocationId, requestHash: registration.requestHash } } });
          current = await successful("context", {});
          assert.equal(current.work.find((row: { callId: string }) => row.callId === childRequest.callId).resultAvailable, true);
          const consumed = runCode("consume", { raw: [{ result }], action: "manuscript", request: JSON.stringify(childRequest),
            context: current, version: pending.checkpointVersion });
          const compact = JSON.parse(consumed.checkpoint);
          assert.ok(Buffer.byteLength(consumed.checkpoint) < 1024);
          assert.deepEqual(compact.state.lastResult.document, { kind: "work", id: childRequest.callId });
          const confirmed = await successful("checkpoint", compact);
          assert.deepEqual(await successful("checkpoint", compact), confirmed);

          // A second action consumes new context/version/fence without repeating publication.
          current = await successful("context", {});
          const facts = runCode("facts", { raw: { result: current }, execution_ready: "false" });
          assert.equal(facts.route, "pause"); // Full Manager activation is still gated.
          assert.equal(JSON.parse(facts.context).checkpointVersion, confirmed.checkpointVersion);
          const read = runCode("guard", { context: facts.context, decision: { action: "read_document",
            request_json: JSON.stringify(compact.state.lastResult.document), reason: "Inspect retained exact proposals" } });
          const readIntent = await successful("checkpoint", JSON.parse(read.checkpoint));
          const rebound = runCode("saved", { raw: { result: readIntent }, context: facts.context,
            request: read.request, dispatch: read.dispatch, action: "read_document" });
          const body = await successful("read_document", JSON.parse(rebound.request));
          const readResult = runCode("consume", { raw: { result: body }, action: "read_document", request: rebound.request,
            context: await successful("context", {}), version: rebound.version });
          const second = await successful("checkpoint", JSON.parse(readResult.checkpoint));
          assert.equal(second.checkpointVersion, confirmed.checkpointVersion + 2);
          assert.ok(second.fence > confirmed.fence);
          assert.deepEqual((await db.collection("bookletWork").findOne({ productionId: production._id, callId: childRequest.callId }))!.resultPayload, result);
        });
        await t.test("v2 lease refreshes replayable fences without blocking the next write", async () => {
          const before = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const request = { action: "acquire", fence: before!.fenceCounter };
          const acquired = await successful("lease", request);
          assert.equal(acquired.fence, before!.fenceCounter + 1);
          assert.equal(acquired.leaseHeld, false);
          assert.deepEqual(await successful("lease", request), acquired);
          const renewed = await successful("lease", { action: "renew", fence: acquired.fence });
          const released = await successful("lease", { action: "release", fence: renewed.fence });
          assert.equal((await invoke("lease", { action: "acquire", fence: 0 })).isError, true);
          const current = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          assert.equal(current!.mutationLease, null);
          const saved = await successful("checkpoint", { expectedVersion: current!.checkpointVersion,
            fence: released.fence, state: { step: "after-fence-refresh" } });
          assert.equal(saved.fence, released.fence + 1);
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: {
            mutationLease: { holderId: "other-run", fence: saved.fence, expiresAt: new Date(Date.now() + 60000) },
          } });
          assert.equal((await invoke("lease", { action: "acquire", fence: saved.fence })).isError, true);
          const held = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          assert.equal(held!.fenceCounter, saved.fence);
          assert.equal(held!.mutationLease.holderId, "other-run");
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { mutationLease: null } });
          const largeState = { exact: "\u0645\u0631\u062d\u0628\u0627 \ud83d\ude00\n".repeat(1500) };
          await successful("checkpoint", { expectedVersion: saved.checkpointVersion, fence: saved.fence, state: largeState });
          const largeRead = await successful("read_document", { kind: "checkpoint", id: production._id });
          assert.equal(largeRead.complete, false);
          assert.ok(largeRead.sections.some((section: { key: string; cursor?: string }) => section.key === "state" && section.cursor));
        });
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
