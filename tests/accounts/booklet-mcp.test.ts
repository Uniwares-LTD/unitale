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
import { bookletMedia, type BookletAsset } from "../../src/lib/server/booklets/media";
import { persistAiEvent, type AiJob } from "../../src/lib/server/ai/jobs";
import { createDifyWorkflow } from "../../src/lib/server/ai/dify";
import { parseDifyConfig } from "../../src/lib/config/dify";
import { submitAuthorizedDecision, type Decision } from "../../src/lib/server/runs/service";
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
// Isolated actual Code functions, not a Dify execution engine.
function runNativeCode(role: string, id: string, args: Record<string, unknown>) {
  const python = process.env.BOOKLET_PYTHON ?? (existsSync("output/tooling/python312/python.exe")
    ? resolve("output/tooling/python312/python.exe") : "python3");
  const graph = parseYaml(readFileSync("docs/features/booklet-generation/workflow-package/" + role + "/workflow.yaml", "utf8")).workflow.graph;
  const executed = spawnSync(python, ["-c",
    "import json,sys; v=json.load(sys.stdin); s={}; exec(v['code'],s); print(json.dumps(s['main'](**v['args']),ensure_ascii=False))"], {
    input: JSON.stringify({ code: graph.nodes.find((node: { id: string; data: Record<string, unknown> }) => node.id === id)!.data.code, args }),
    encoding: "utf8", timeout: 5000, env: { ...process.env, PYTHONUTF8: "1" },
  });
  assert.equal(executed.status, 0, executed.stderr || String(executed.error));
  return JSON.parse(executed.stdout);
}

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
              orchestrator: { id: "booklet-v2", responseMode: "raw-v1" },
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
          limits = mcpLimitsSchema.parse({ requestBytes: 2 * 1024 * 1024, toolResultBytes: 256 * 1024, responseBytes: 1024 * 1024 }),
        ) => {
          const response = await rawCall("tools/call", {
            name: "booklet_" + name + "_v2",
            arguments: {
              runContext: token,
              request:
                typeof request === "string" ? request : JSON.stringify(request),
            },
          }, serviceToken, limits);
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
        assert.equal(facts.usage.canDispatch, true);
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
          assert.equal((await successful("context", {})).usage.canDispatch, false);
          const limited = await successful("context", {});
          assert.equal((await invoke("begin_work", { action: "dispatch", callId: "call-v2",
            requestHash: registration.requestHash, fence: limited.fence })).isError, true);
          assert.equal((await db.collection("bookletWork").findOne({ productionId: production._id, callId: "call-v2" }))!.status, "registered");
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
        await t.test("native execution bounds count unique steps and survive activity cleanup", async () => {
          const event = (id: string, native: string, elapsedMs: number, uid = "owner") => ({
            _id: "bounds-" + id as never, uid, jobId: "run-v2", event: { type: "stage", id: native, elapsedMs },
          });
          const events = [event("start", "node-1", 0), event("finish", "node-1", 500), event("second", "node-2", 750), event("foreign", "foreign-node", 999999, "foreign")];
          await db.collection("runEvents").insertMany(events);
          const usage = [
            { _id: "bounds-summary" as never, uid: "owner", jobId: "run-v2", id: "native-v2", scope: "execution", elapsedMs: 3000, cost: null },
            ...["node-1", "node-2"].map((id) => ({ _id: "bounds-" + id as never, uid: "owner", jobId: "run-v2", id, scope: "node", elapsedMs: null, cost: null })),
          ];
          await db.collection("aiUsage").insertMany(usage);
          let current = await successful("context", {});
          assert.equal(current.usage.execution.steps, 2);
          assert.equal(current.usage.execution.reportedElapsedMs, 3000);
          await db.collection("aiUsage").updateOne({ _id: "bounds-summary" as never }, { $set: { elapsedMs: null } });
          assert.equal((await successful("context", {})).usage.execution.reportedElapsedMs, 750);
          await db.collection("aiUsage").updateOne({ _id: "bounds-summary" as never }, { $set: { elapsedMs: 3000 } });
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: {
            "creativeConfigSnapshot.execution.maxWorkflowSteps": 2,
          } });
          current = await successful("context", {});
          assert.equal(current.usage.canDispatch, false);
          const dispatch = { action: "dispatch", callId: "call-v2", requestHash: registration.requestHash, fence: current.fence };
          assert.equal((await invoke("begin_work", dispatch)).isError, true);
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: {
            "creativeConfigSnapshot.execution.maxWorkflowSteps": production.creativeConfigSnapshot.execution.maxWorkflowSteps,
            "creativeConfigSnapshot.execution.maxElapsedSeconds": 2,
          } });
          assert.equal((await successful("context", {})).usage.canDispatch, false);
          assert.equal((await invoke("begin_work", dispatch)).isError, true);
          await db.collection("runEvents").deleteMany({ _id: { $in: events.map((row) => row._id) } });
          current = await successful("context", {});
          assert.equal(current.usage.execution.steps, 2);
          assert.equal(current.usage.execution.reportedElapsedMs, 3000);
          assert.equal(current.fence, facts.fence);
          assert.equal(current.work[0].status, "registered");
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: {
            "creativeConfigSnapshot.execution.maxElapsedSeconds": production.creativeConfigSnapshot.execution.maxElapsedSeconds,
          } });
          await db.collection("aiUsage").deleteMany({ _id: { $in: usage.map((row) => row._id) } });
        });
        assert.equal(facts.work[0].callId, "call-v2");
        assert.equal(facts.work[0].resultAvailable, false);
        assert.equal(facts.reviewerBinding, bindingRow.reviewer.publicationId);
        for (const key of ["ownerId", "orderId", "secret", "managerGraph", "suite"])
          assert.equal(facts[key], undefined);
        await db.collection("bookletWorkflowPolicies").updateOne({ orchestratorId: "booklet-v2" }, { $set: { "reviewer.publicationId": randomUUID() } });
        assert.equal((await invoke("context", {})).isError, true);
        assert.equal((await invoke("begin_work", { action: "dispatch", callId: "call-v2",
          requestHash: registration.requestHash, fence: facts.fence })).isError, true);
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
              texts: [{ id: "text-v2", kind: "narration", text: exactText }],
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
        await t.test("source binding rejects foreign or changed tuples and malformed original references", async () => {
          const source = { artifactId: revision.artifactId, revisionId: revision._id, contentHash: revision.contentHash };
          const before = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          assert.deepEqual(await successful("sources", { sources: [source], references: [] }), { references: [] });
          for (const change of [{ artifactId: "foreign" }, { revisionId: revisionId }, { contentHash: "a".repeat(64) }])
            assert.equal((await invoke("sources", { sources: [{ ...source, ...change }], references: [] })).isError, true);
          assert.equal((await invoke("sources", { sources: [], references: [{ assetId: "image" }] })).isError, true);
          assert.deepEqual(await db.collection("bookletProductions").findOne({ _id: production._id as never }), before);
        });
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
          const runCode = (id: string, args: Record<string, unknown>, role = "manager") => runNativeCode(role, id, args);

          const initial = await successful("context", {});
          const initialFacts = runCode("facts", { raw: { result: initial }, execution_ready: "true" });
          assert.equal(initialFacts.route, "reason");
          const plan = runCode("guard", { context: initialFacts.context, decision: { action: "manuscript",
            request_json: JSON.stringify(childRequest), reason: "Write the selected manuscript" } });
          const intent = await successful("checkpoint", JSON.parse(plan.checkpoint));
          const ready = runCode("saved", { raw: { result: intent }, context: initialFacts.context,
            request: plan.request, dispatch: plan.dispatch, action: "manuscript" });
          const originals = await successful("sources", JSON.parse(plan.sources));
          const child = runCode("bind-originals", { raw: { result: originals }, request: ready.request, files: [] });
          const dispatchRequest = JSON.parse(ready.dispatch);
          const allowed = await successful("begin_work", dispatchRequest);
          assert.equal(allowed.status, "dispatching");
          runCode("dispatch-saved", { raw: { result: allowed }, request: ready.dispatch });
          assert.deepEqual(await successful("begin_work", dispatchRequest), allowed);
          assert.equal((await invoke("begin_work", { ...dispatchRequest, fence: allowed.fence })).isError, true);
          assert.throws(() => runCode("guard", { context: JSON.stringify(initial), decision: { action: "manuscript",
            request_json: JSON.stringify({ ...childRequest, callId: "invented-retry" }), reason: "Do not replay" } }), /Unregistered/);
          const dispatched = await successful("context", {});
          assert.throws(() => runCode("guard", { context: JSON.stringify(dispatched), decision: { action: "manuscript",
            request_json: JSON.stringify(childRequest), reason: "Lost dispatch reply must not replay" } }), /already dispatched/);
          await db.collection("aiJobs").updateOne({ _id: "run-v2" as never }, { $set: {
            "run.orchestrator.workflowId": workflowId, execution: null, runId: null, taskId: null,
            lease: "fixture-worker", leaseUntil: new Date(Date.now() + 180000), capability: "booklet-fixture",
            binding: { name: "booklet-fixture", revision: "1", mode: "fake", kind: "workflow", fingerprint: "fixture" },
          } });
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const validated = runCode("validate", { request: child.request, references: [], execution_ready: "true" }, "manuscript");
          const result = JSON.parse(runCode("pack", { request: validated.request, response: {
            items: [{ itemId: childRequest.items[0].itemId, status: "succeeded",
              proposals: [{ kind: "manuscript", subjectId: "book-subject", content }] }],
          } }, "manuscript").result);
          const nativeId = randomUUID(), taskId = randomUUID();
          const config = parseDifyConfig({ DIFY_MODE: "live", DIFY_BASE_URL: "https://offline.invalid/v1",
            DIFY_KEY_FIXTURE: "fixture-not-a-key", DIFY_ORCHESTRATORS_JSON: JSON.stringify([{
              id: "fixture", name: "Fixture", description: "", order: 0, enabled: true,
              keyEnv: "DIFY_KEY_FIXTURE", workflowId, inputs: [], pricing: null, recovery: null,
            }]) });
          assert.equal(config.mode, "live");
          if (config.mode !== "live") throw new Error("Invalid fixture config");
          let dispatches = 0;
          const provider = createDifyWorkflow(config, config.bindings[0], async (url, options) => {
            dispatches++;
            assert.equal(url, "https://offline.invalid/v1/workflows/" + workflowId + "/run");
            assert.equal(options?.method, "POST");
            const events = [
              { event: "workflow_started", workflow_run_id: nativeId, task_id: taskId,
                data: { id: nativeId, workflow_id: workflowId } },
              { event: "node_finished", workflow_run_id: nativeId, task_id: taskId, data: {
                id: "retained-text-node", node_id: "child-manuscript", node_type: "tool", status: "succeeded",
                retry_index: 0, loop_id: "iteration-v2", outputs: { json: [{ result: JSON.stringify(result) }] }, outputs_truncated: false,
              } },
            ];
            return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
              { headers: { "content-type": "text/event-stream" } });
          }, undefined, true);
          const streamed = await provider.start({ user: "fixture", inputs: {} }, (event) =>
            persistAiEvent(db, parent!, event, new Date(), (job, node, session) => observeBookletNodeV2(db, job, node, session)));
          assert.equal(streamed.kind, "unknown"); // Dropped before parent completion; never POST again.
          const captured = await db.collection("bookletWork").findOne({ productionId: production._id, callId: "call-v2" });
          assert.deepEqual(captured!.resultPayload, result);
          assert.equal((await db.collection<AiJob>("aiJobs").findOne({ _id: parent!._id }))!.execution!.status, "running");
          let current = await successful("context", {});
          const consumed = runCode("consume", { raw: [{ result }], action: "manuscript", request: ready.request,
            context: current, version: ready.version });
          const compact = JSON.parse(consumed.checkpoint);
          assert.ok(Buffer.byteLength(consumed.checkpoint) < 1024);
          assert.deepEqual(compact.state.lastResult.document, { kind: "work", id: childRequest.callId });
          const confirmed = await successful("checkpoint", compact);
          assert.deepEqual(await successful("checkpoint", compact), confirmed);
          const evidence = [captured!.evidenceIds.at(-1)];
          const bytes = Buffer.from(JSON.stringify(content));
          const transfer = await successful("transfer", { action: "open", key: "publish-large-manuscript",
            kind: "revision", bytes: bytes.length, sha256: sha(bytes) });
          for (let index = 0; index < transfer.parts; index++) await successful("transfer", {
            action: "part", transferId: transfer.transferId, index,
            data: bytes.subarray(index * transfer.chunkBytes, (index + 1) * transfer.chunkBytes).toString("base64"),
          });
          current = await successful("context", {});
          const facts = runCode("facts", { raw: { result: current }, execution_ready: "true" });
          assert.equal(facts.route, "reason");
          assert.equal(JSON.parse(facts.context).checkpointVersion, confirmed.checkpointVersion);
          const saveArgs = { artifactId: "story-v2", content: { callId: "call-v2", itemId: childRequest.items[0].itemId, proposalIndex: 0 }, sources: [], assets: [],
            evidence, mutationKey: "save-large-manuscript", fence: current.fence };
          const plannedSave = runCode("guard", { context: facts.context, decision: { action: "save_revision",
            request_json: JSON.stringify(saveArgs), reason: "Publish exact retained text" } });
          const saveIntent = await successful("checkpoint", JSON.parse(plannedSave.checkpoint));
          const saveReady = runCode("saved", { raw: { result: saveIntent }, context: facts.context,
            request: plannedSave.request, dispatch: plannedSave.dispatch, action: "save_revision" });
          const request = JSON.parse(saveReady.request);
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

          const published = runCode("consume", { raw: { result: saved }, action: "save_revision", request: saveReady.request,
            context: await successful("context", {}), version: saveReady.version });
          const second = await successful("checkpoint", JSON.parse(published.checkpoint));
          assert.equal(second.checkpointVersion, confirmed.checkpointVersion + 2);
          assert.ok(second.fence > confirmed.fence);
          assert.deepEqual((await db.collection("bookletWork").findOne({ productionId: production._id, callId: childRequest.callId }))!.resultPayload, result);
          assert.equal(dispatches, 1);
        });
        await t.test("assessment gateway retains exact native Reviewer output with originating policy and replay receipts", async () => {
          const current = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const artifact = current!.subjects.find((subject: { id: string }) => subject.id === "book-subject").artifacts.find((item: { id: string }) => item.id === "story-v2");
          const selected = await db.collection("bookletRevisions").findOne({ _id: artifact.currentRevisionId });
          const source = { artifactId: "story-v2", revisionId: selected!._id, contentHash: selected!.contentHash };
          const child = { contractVersion: 2, invocationId: "review-gateway", callId: "review-gateway", service: "quality-reviewer",
            operation: "text", intent: "create", items: [{ itemId: "review-item", input: {
              targetIds: ["story-v2"], targetHash: source.contentHash, referencePositions: [],
            } }], sources: [{ ...source, content: selected!.content }], references: [], constraints: {} };
          const requestHash = fingerprint(child);
          const registered = await successful("begin_work", { action: "register", childRequest: child,
            requestHash, targets: ["story-v2"], fence: current!.fenceCounter });
          const dispatched = await successful("begin_work", { action: "dispatch", callId: child.callId, requestHash, fence: registered.fence });
          const result = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(child), response: {
            items: [{ itemId: "review-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "story-v2", content: {
              coverage: { targetIds: ["story-v2"], referencePositions: [] }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const locator = { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "review-gateway-execution" };
          const request = { assessment: result.items[0].proposals[0].content, executionLocator: locator, fence: dispatched.fence };
          assert.equal((await invoke("record_assessment", request)).isError, true);
          const session = db.client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: locator.runId, id: locator.executionId, nodeId: locator.nodeId, nodeType: "tool", status: "succeeded",
            retryIndex: null, iterationId: null, loopId: null, outputs: { json: [{ result: JSON.stringify(result) }] },
            outputsTruncated: false, error: null, executionMetadata: null,
          }, session)); } finally { await session.endSession(); }
          assert.equal((await invoke("record_assessment", { ...request, policyBinding: "invented" })).isError, true);
          assert.equal((await invoke("record_assessment", { ...request, assessment: { ...request.assessment, disposition: "inconclusive" } })).isError, true);
          assert.equal((await invoke("record_assessment", { ...request, assessment: { ...request.assessment,
            coverage: { ...request.assessment.coverage, targetIds: ["foreign"] } } })).isError, true);
          assert.equal((await invoke("record_assessment", { ...request, executionLocator: { ...locator, executionId: "foreign" } })).isError, true);
          const saved = await successful("record_assessment", request);
          assert.equal(saved.complete, true);
          assert.deepEqual(await successful("record_assessment", request), saved);
          const stored = await db.collection("bookletAssessments").findOne({ _id: saved.assessmentId as never });
          assert.deepEqual(stored!.assessment, request.assessment);
          assert.equal(stored!.policyBinding, fingerprint(bindingRow.reviewer));
          assert.equal(stored!.reviewerBinding, bindingRow.reviewer.publicationId);
          assert.equal(await db.collection("bookletAssessments").countDocuments({ productionId: production._id, callId: child.callId }), 1);
        });
        await t.test("Manager acceptance binds exact revision identity and sources without creating human or quality authority", async () => {
          const current = await successful("context", {});
          const p = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const artifact = p!.subjects.flatMap((subject: { artifacts: unknown[] }) => subject.artifacts)
            .find((artifact: { id: string }) => artifact.id === "story-v2");
          const revision = await db.collection("bookletRevisions").findOne({ _id: artifact.currentRevisionId });
          const assessment = await db.collection("bookletAssessments").findOne({ productionId: production._id,
            "assessment.mode": "text", "assessment.targetHash": revision!.contentHash });
          const request = { revisionId: revision!._id, contentHash: revision!.contentHash,
            targetIds: ["story-v2"], assetIds: [], sources: revision!.sources, evidence: [assessment!._id], fence: current.fence };
          const planned = runNativeCode("manager", "guard", { context: JSON.stringify(current), decision: {
            action: "record_acceptance", request_json: JSON.stringify(request), reason: "Select the reviewed exact text" } });
          const intent = await successful("checkpoint", JSON.parse(planned.checkpoint));
          const ready = JSON.parse(runNativeCode("manager", "saved", { raw: { result: intent }, context: JSON.stringify(current),
            request: planned.request, dispatch: planned.dispatch, action: "record_acceptance" }).request);
          for (const changed of [
            { ...ready, contentHash: "0".repeat(64) }, { ...ready, targetIds: ["foreign"] },
            { ...ready, assetIds: ["invented"] }, { ...ready, evidence: ["foreign-evidence"] },
            { ...ready, sources: [{ artifactId: "story-v2", revisionId: "foreign", contentHash: revision!.contentHash }] },
            { ...ready, runId: "model-selected-manager" },
          ]) assert.equal((await invoke("record_acceptance", changed)).isError, true);
          const accepted = await successful("record_acceptance", ready);
          assert.deepEqual(await successful("record_acceptance", ready), accepted);
          const read = await successful("read_document", { kind: "acceptance", id: accepted.acceptanceId });
          assert.equal(read.value.runId, "run-v2");
          assert.equal(read.value.revisionId, revision!._id);
          assert.deepEqual(read.value.evidenceIds, [assessment!._id]);
          const after = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          assert.equal(after!.subjects[0].artifacts.find((artifact: { id: string }) => artifact.id === "story-v2").acceptedRevisionId, revision!._id);
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { "stageLocks.story": {
            operationId: "fixture-stage-lock", lockedAt: new Date(), sourceRevisionIds: [revision!._id],
          } } });
          assert.equal((await invoke("record_acceptance", { ...ready, fence: accepted.fence })).isError, true);
          assert.deepEqual(await successful("record_acceptance", ready), accepted); // Exact receipt does not mutate a locked stage.
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { "stageLocks.story": null } });
          const stored = await db.collection("bookletAcceptances").findOne({ _id: accepted.acceptanceId as never });
          await db.collection("bookletAcceptances").insertOne({ ...stored!, _id: "foreign-acceptance" as never, ownerId: "foreign" });
          assert.equal((await invoke("read_document", { kind: "acceptance", id: "foreign-acceptance" })).isError, true);
        });
        await t.test("human requests bind native presentation and authenticated first-wins responses", async () => {
          const initial = await successful("context", {});
          const p = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const artifact = p!.subjects[0].artifacts.find((artifact: { id: string }) => artifact.id === "story-v2");
          const selected = await db.collection("bookletRevisions").findOne({ _id: artifact.currentRevisionId });
          const targets = [{ artifactId: "story-v2", revisionId: selected!._id, contentHash: selected!.contentHash }];
          const request = { question: "Keep this direction, or tell us what to change?", targets,
            responseContract: { mode: "raw-v1" }, presentation: { version: 1, cards: [] }, fence: initial.fence };
          assert.equal((await invoke("request_human", { ...request, targets: [{ ...targets[0], contentHash: "0".repeat(64) }] })).isError, true);
          assert.equal((await invoke("request_human", { ...request, presentation: { ...request.presentation, approval: {} } })).isError, true);
          const plan = runNativeCode("manager", "guard", { context: JSON.stringify(initial), decision: {
            action: "request_human", request_json: JSON.stringify(request), reason: "Ask one grouped optional review" } });
          const intent = await successful("checkpoint", JSON.parse(plan.checkpoint));
          const ready = JSON.parse(runNativeCode("manager", "saved", { raw: { result: intent }, context: JSON.stringify(initial),
            request: plan.request, dispatch: plan.dispatch, action: "request_human" }).request);
          const human = await successful("request_human", ready);
          assert.deepEqual(await successful("request_human", ready), human);
          const context = await successful("context", {});
          const consumed = runNativeCode("manager", "consume", { raw: { result: human }, action: "request_human",
            request: JSON.stringify(ready), context, version: intent.checkpointVersion });
          const checkpoint = JSON.parse(consumed.checkpoint);
          assert.deepEqual(checkpoint.state.lastResult.document, { kind: "human_response", id: human.requestId });
          assert.ok(Buffer.byteLength(consumed.checkpoint) < 2048);
          await successful("checkpoint", checkpoint);
          const read = () => successful("read_document", { kind: "human_response", id: human.requestId });
          assert.equal((await read()).value.status, "pending");
          const yaml = parseYaml(readFileSync("docs/features/booklet-generation/workflow-package/manager/workflow.yaml", "utf8"));
          const template = yaml.workflow.graph.nodes.find((node: { id: string }) => node.id === "human").data.form_content;
          const formContent = template.replace("{{#consume.form#}}", consumed.form);
          assert.equal(fingerprint(formContent), human.presentationHash);
          await db.collection("aiJobs").updateOne({ _id: "run-v2" as never }, { $set: {
            "run.orchestrator.responseMode": "raw-v1", inputs: { prompt: "booklet human fixture" },
            leaseUntil: new Date(Date.now() + 180000),
          } });
          const parent = (await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" }))!;
          const token = "synthetic-human-token";
          await persistAiEvent(db, parent, { type: "decision", nodeId: "human", title: "Booklet review", token });
          const decision = (await db.collection<Decision>("runDecisions").findOne({ jobId: parent._id, token }))!;
          const form = { form_content: formContent, inputs: [{ type: "paragraph", output_variable_name: "response" }],
            user_actions: [{ id: "continue", title: "Continue" }], resolved_default_values: {} };
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { form } });
          const actor = { uid: "owner", auth_time: 1 };
          const answer = { key: randomUUID(), action: "continue", response: "Keep it. حافظ على النص حرفياً." };
          await assert.rejects(submitAuthorizedDecision(db, { ...actor, uid: "foreign" }, parent, decision, answer, { type: "user" }), /unavailable/);
          assert.equal((await submitAuthorizedDecision(db, actor, parent, decision, answer, { type: "user" })).status, "submitted");
          assert.equal((await submitAuthorizedDecision(db, actor, parent, decision, answer, { type: "user" })).status, "submitted");
          await assert.rejects(submitAuthorizedDecision(db, actor, parent, decision,
            { ...answer, key: randomUUID(), response: "Changed second answer" }, { type: "user" }), /already pending or submitted/);
          const response = (await read()).value;
          assert.equal(response.status, "submitted");
          assert.equal(response.response, answer.response);
          assert.equal(response.decisionId, decision._id);
          assert.ok(!JSON.stringify(response).includes(token));
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { status: "unknown" } });
          assert.equal((await read()).value.status, "pending");
          await persistAiEvent(db, parent, { type: "decision-filled", nodeId: "human", action: "continue",
            inputs: { response: answer.response } });
          assert.equal((await read()).value.status, "submitted");
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { "answerSource.type": "persona" } });
          assert.equal((await read()).value.status, "pending");
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { "answerSource.type": "user",
            "form.form_content": formContent + "changed" } });
          assert.equal((await read()).value.status, "pending");
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { "form.form_content": formContent } });
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { jobId: "foreign-attempt" } });
          assert.equal((await read()).value.status, "pending");
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { jobId: parent._id,
            status: "pending", "form.expiration_time": Math.floor(Date.now() / 1000) - 1 } });
          assert.equal((await read()).value.status, "expired");
          await db.collection("runDecisions").updateOne({ _id: decision._id as never }, { $set: { status: "submitted", "form.expiration_time": null } });
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { "subjects.0.artifacts.0.currentRevisionId": "changed-target" } });
          assert.equal((await read()).value.status, "stale");
          await db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { "subjects.0.artifacts.0.currentRevisionId": selected!._id } });
          assert.equal((await read()).value.response, answer.response);
          assert.deepEqual(await successful("request_human", ready), human);
        });
        await t.test("unpaid preparation uses registered native work and retains the exact prepared identity", async () => {
          const before = await successful("context", {});
          const indexed = await successful("index", {
            subjects: [{ id: "sample-prepare", kind: "style-sample", label: "Style sample", pageRole: null }],
            artifacts: [
              { artifactId: "sample-output", subjectId: "sample-prepare", kind: "reference" },
              { artifactId: "sample-spec", subjectId: "sample-prepare", kind: "image-spec" },
              { artifactId: "sample-style", subjectId: "book-subject", kind: "style" },
            ], fence: before.fence,
          });
          const contents = [
            { kind: "image-spec", purpose: "Show the selected style", requiredFeatures: [], style: "watercolor" },
            { kind: "style", direction: "warm watercolor", letteringDirection: "none", exclusions: [] },
          ];
          const sources = contents.map((content, i) => {
            const row = revisionV2Schema.parse({ ...revision, _id: "prepare-source-" + i,
              subjectId: i ? "book-subject" : "sample-prepare", artifactId: i ? "sample-style" : "sample-spec",
              kind: content.kind, content, contentHash: fingerprint(content), sources: [], assets: [],
            });
            return { row, source: { artifactId: row.artifactId, revisionId: row._id, contentHash: row.contentHash, content } };
          });
          await db.collection("bookletRevisions").insertMany(sources.map(({ row }) => row) as never);
          const child = { contractVersion: 2, invocationId: "prepare-invocation", callId: "prepare-action",
            service: "image-executor", operation: "prepare", intent: "create",
            items: [{ itemId: "prepare-item", targetId: "sample-prepare", input: {
              imageKind: "style-sample", specification: contents[0], style: contents[1],
              settings: { mode: "generate", model: "gpt-image-2.5-sunburst", count: 3,
                canvas: { width: 1024, height: 1024 }, quality: "high", background: "opaque", format: "png" },
            } }], sources: sources.map(({ source }) => source), references: [], constraints: {},
          };
          const request = { action: "register", childRequest: child, requestHash: fingerprint(child),
            targets: ["sample-output"], fence: indexed.fence };
          assert.equal((await invoke("begin_work", { ...request, targets: ["story-v2"] })).isError, true);
          const altered = { ...child, items: [{ ...child.items[0], input: { ...child.items[0].input, style: {
            ...contents[1], direction: "unselected" } } }] };
          assert.equal((await invoke("begin_work", { ...request, childRequest: altered, requestHash: fingerprint(altered) })).isError, true);
          const registered = await successful("begin_work", request);
          assert.deepEqual(await successful("begin_work", request), registered);
          const work = await db.collection("bookletWork").findOne({ productionId: production._id, callId: child.callId });
          assert.equal(work!.category, "nonPaid");
          const facts = await successful("context", {});
          const planned = runNativeCode("manager", "guard", { context: JSON.stringify(facts), decision: {
            action: child.service, request_json: JSON.stringify(child), reason: "Prepare the selected image without payment" } });
          assert.equal(planned.paid, "no");
          assert.equal(planned.dispatchChild, "yes");
          const intent = await successful("checkpoint", JSON.parse(planned.checkpoint));
          const ready = runNativeCode("manager", "saved", { raw: { result: intent }, context: JSON.stringify(facts),
            request: planned.request, dispatch: planned.dispatch, action: child.service });
          const dispatched = await successful("begin_work", JSON.parse(ready.dispatch));
          assert.deepEqual(await successful("begin_work", JSON.parse(ready.dispatch)), dispatched);
          const result = JSON.parse(runNativeCode("image-executor", "validate", { request: ready.request }).result);
          const prepared = result.items[0].prepared;
          const { requestHash, ...body } = prepared;
          assert.equal(prepared.callId, child.callId);
          assert.equal(requestHash, fingerprint(body));
          const review = { ...child, invocationId: "preflight-invocation", callId: "preflight-action",
            service: "quality-reviewer", operation: "image_request", items: [{ itemId: "preflight-item", input: {
              targetIds: ["sample-output"], targetHash: prepared.requestHash, prepared, referencePositions: [],
            } }] };
          assert.equal((await invoke("begin_work", { action: "register", childRequest: review, requestHash: fingerprint(review),
            targets: ["sample-output"], fence: dispatched.fence })).isError, true);
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const session = db.client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "prepare-execution", nodeId: "child-image-executor", nodeType: "tool",
            status: "succeeded", retryIndex: null, iterationId: null, loopId: null,
            outputs: { json: [{ result: JSON.stringify(result) }] }, outputsTruncated: false, error: null, executionMetadata: null,
          }, session)); } finally { await session.endSession(); }
          const observed = await successful("context", {});
          assert.equal(observed.usage.workAttempts.nonPaid, facts.usage.workAttempts.nonPaid + 1);
          assert.equal(observed.usage.workAttempts.paidImage, facts.usage.workAttempts.paidImage);
          const consumed = runNativeCode("manager", "consume", { raw: { result }, action: child.service,
            request: ready.request, context: { result: observed }, version: intent.checkpointVersion });
          const state = JSON.parse(consumed.checkpoint).state;
          assert.deepEqual(state.lastResult.document, { kind: "work", id: child.callId });
          assert.equal(state.lastResult.requestHash, fingerprint(child));
          await successful("checkpoint", JSON.parse(consumed.checkpoint));
          const retained = await db.collection("bookletWork").findOne({ productionId: production._id, callId: child.callId });
          assert.deepEqual(retained!.resultPayload, result);
          assert.equal((await invoke("begin_work", { action: "dispatch", callId: child.callId,
            requestHash: fingerprint(child), fence: (await successful("context", {})).fence })).isError, true);
          const preflight = { action: "register", childRequest: review, requestHash: fingerprint(review),
            targets: ["sample-output"], fence: (await successful("context", {})).fence };
          // A self-consistent prompt/hash is insufficient without the exact native preparation.
          const forgedPrepared = { ...body, prompt: body.prompt + "changed" };
          const forgedHash = fingerprint(forgedPrepared);
          const forged = { ...review, items: [{ ...review.items[0], input: { ...review.items[0].input,
            targetHash: forgedHash, prepared: { ...forgedPrepared, requestHash: forgedHash } } }] };
          assert.equal((await invoke("begin_work", { ...preflight, childRequest: forged, requestHash: fingerprint(forged) })).isError, true);
          const registeredReview = await successful("begin_work", preflight);
          const reviewDispatch = await successful("begin_work", { action: "dispatch", callId: review.callId,
            requestHash: preflight.requestHash, fence: registeredReview.fence });
          const reviewed = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(review), response: {
            items: [{ itemId: "preflight-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "sample-output", content: {
              coverage: { targetIds: ["sample-output"], referencePositions: [] }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          const reviewSession = db.client.startSession();
          try { await reviewSession.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "preflight-execution", nodeId: "child-quality-reviewer", nodeType: "tool",
            status: "succeeded", retryIndex: null, iterationId: null, loopId: null,
            outputs: { json: [{ result: JSON.stringify(reviewed) }] }, outputsTruncated: false, error: null, executionMetadata: null,
          }, reviewSession)); } finally { await reviewSession.endSession(); }
          const assessment = await successful("record_assessment", { assessment: reviewed.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "preflight-execution" },
            fence: reviewDispatch.fence });
          assert.equal(assessment.complete, true);
          const accepted = await db.collection("bookletAssessments").findOne({ _id: assessment.assessmentId as never });
          assert.equal(accepted!.assessment.targetHash, prepared.requestHash);
          assert.equal(accepted!.assessment.requestHash, prepared.requestHash);
          const generation = { ...child, invocationId: "generate-invocation", callId: "generate-action",
            operation: "generate", items: [{ itemId: "generate-item", targetId: "sample-prepare", input: { prepared } }] };
          const generationRequest = { action: "register", childRequest: generation, requestHash: fingerprint(generation),
            targets: ["sample-output"], fence: assessment.fence };
          const forgedGeneration = { ...generation, items: [{ ...generation.items[0], input: { prepared: {
            ...forgedPrepared, requestHash: forgedHash } } }] };
          assert.equal((await invoke("begin_work", { ...generationRequest, childRequest: forgedGeneration,
            requestHash: fingerprint(forgedGeneration) })).isError, true);
          const imageRegistered = await successful("begin_work", generationRequest);
          const newerAssessmentIds = Array.from({ length: 9 }, (_, i) => "newer-preflight-preview-" + i);
          await db.collection("bookletAssessments").insertMany(newerAssessmentIds.map((_id, i) => ({
            ...accepted!, _id, callId: _id, assessment: { ...accepted!.assessment, mode: "text", targetHash: "0".repeat(64) },
            createdAt: new Date(Date.now() + i + 1000),
          })) as never);
          const imageContext = await successful("context", {});
          assert.equal(imageContext.usage.canDispatchImage, true);
          assert.equal(imageContext.assessmentsComplete, false);
          assert.equal(imageContext.assessments.some((row: { assessmentId: string }) => row.assessmentId === assessment.assessmentId), false);
          assert.equal(imageContext.work.find((row: { callId: string }) => row.callId === generation.callId).preflight.targetHash, prepared.requestHash);
          const imagePlan = runNativeCode("manager", "guard", { context: JSON.stringify(imageContext), decision: {
            action: generation.service, request_json: JSON.stringify(generation), reason: "Generate the reviewed exact request" } });
          assert.equal(imagePlan.paid, "yes");
          await db.collection("bookletAssessments").deleteMany({ _id: { $in: newerAssessmentIds as never[] } });
          assert.equal(JSON.parse(imagePlan.dispatch).requestHash, generationRequest.requestHash);
          assert.equal(runNativeCode("image-executor", "validate", { request: JSON.stringify(generation), execution_ready: "true" }).count, 3);
          const imageIntent = await successful("checkpoint", JSON.parse(imagePlan.checkpoint));
          const imageReady = runNativeCode("manager", "saved", { raw: { result: imageIntent }, context: JSON.stringify(imageContext),
            request: imagePlan.request, dispatch: imagePlan.dispatch, action: generation.service });
          const imageDispatch = await successful("begin_work", JSON.parse(imageReady.dispatch));
          assert.deepEqual(await successful("begin_work", JSON.parse(imageReady.dispatch)), imageDispatch);
          assert.ok(imageDispatch.fence > imageRegistered.fence);
          const nativeFiles = ["original-one", "original-two"].map((id) => {
            const related_id = randomUUID();
            return { id, type: "image", transfer_method: "tool_file", related_id,
              url: `https://offline.invalid/files/tools/${related_id}.png?timestamp=1&nonce=fixture&sign=fixture` };
          });
          const imageResult = JSON.parse(runNativeCode("image-executor", "generate-result", {
            request: imageReady.request, files: nativeFiles,
          }).result);
          assert.equal(imageResult.status, "partial");
          const imageSession = db.client.startSession();
          try { await imageSession.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "generate-execution", nodeId: "child-image-executor", nodeType: "tool",
            status: "succeeded", retryIndex: null, iterationId: null, loopId: null,
            outputs: { json: [{ result: JSON.stringify(imageResult) }] }, outputsTruncated: false, error: null, executionMetadata: null,
          }, imageSession)); } finally { await imageSession.endSession(); }
          const imageFacts = await successful("context", {});
          assert.equal(imageFacts.usage.workAttempts.paidImage, imageContext.usage.workAttempts.paidImage + 1);
          const imageConsumed = runNativeCode("manager", "consume", { raw: { result: imageResult }, action: generation.service,
            request: imageReady.request, context: { result: imageFacts }, version: imageIntent.checkpointVersion });
          assert.equal(JSON.parse(imageConsumed.checkpoint).state.lastResult.status, "partial");
          await successful("checkpoint", JSON.parse(imageConsumed.checkpoint));
          const imageWork = await db.collection("bookletWork").findOne({ productionId: production._id, callId: generation.callId });
          assert.equal(imageWork!.category, "paidImage");
          assert.deepEqual(imageWork!.resultPayload, imageResult);
          assert.equal((await invoke("begin_work", { action: "dispatch", callId: generation.callId,
            requestHash: fingerprint(generation), fence: (await successful("context", {})).fence })).isError, true);
          const media = bookletMedia(db, { uid: "owner", authTime: 1 }, { documentVersion: 2, store: null });
          const bytes = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "red" } }).png().toBuffer();
          const input = { operationId: generation.callId, outputKey: generation.callId + ":0", sha256: sha(bytes), mime: "image/png" };
          const originalRequest = { callId: generation.callId, outputKey: input.outputKey, nativeFile: nativeFiles[0],
            fence: (await successful("context", {})).fence };
          assert.equal((await invoke("retain_original", { ...originalRequest, nativeFile: { ...nativeFiles[0], url: "https://foreign.invalid/image.png" } })).isError, true);
          const previousFetch = globalThis.fetch;
          const previousMode = process.env.DIFY_MODE, previousBase = process.env.DIFY_BASE_URL;
          let downloads = 0;
          globalThis.fetch = async (url, options) => {
            assert.equal(String(url), nativeFiles[0].url);
            assert.equal(options?.redirect, "error");
            downloads++;
            return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png" } });
          };
          process.env.DIFY_MODE = "live";
          process.env.DIFY_BASE_URL = "https://offline.invalid/v1";
          try {
            const original = await successful("retain_original", originalRequest);
            assert.equal(original.asset.sha256, sha(bytes));
            assert.deepEqual(await successful("retain_original", originalRequest), original);
            assert.equal(downloads, 1);
          } finally {
            globalThis.fetch = previousFetch;
            if (previousMode === undefined) delete process.env.DIFY_MODE; else process.env.DIFY_MODE = previousMode;
            if (previousBase === undefined) delete process.env.DIFY_BASE_URL; else process.env.DIFY_BASE_URL = previousBase;
          }
          await assert.rejects(media.retainOriginal(production._id, { ...input, outputKey: "invented" }, bytes), /observed image output/);
          const smaller = await sharp(bytes).resize(512, 512).png().toBuffer();
          await assert.rejects(media.retainOriginal(production._id, { ...input, outputKey: generation.callId + ":1",
            sha256: sha(smaller) }, smaller), /dimensions differ/);
          const jpeg = await sharp(bytes).jpeg().toBuffer();
          await assert.rejects(media.retainOriginal(production._id, { ...input, outputKey: generation.callId + ":1",
            sha256: sha(jpeg), mime: "image/jpeg" }, jpeg), /format differs/);
          // Storage must finish after cancellation without creating dispatch or publication authority.
          await db.collection("aiJobs").updateOne({ _id: "run-v2" as never }, { $set: { cancelRequested: true } });
          let first;
          try {
            first = await media.retainOriginal(production._id, input, bytes);
            assert.deepEqual(await media.retainOriginal(production._id, input, bytes), first);
            assert.deepEqual((await media.read(production._id, first.id)).bytes, bytes);
            const secondBytes = await sharp(bytes).tint("blue").png().toBuffer();
            const second = await media.retainOriginal(production._id, { ...input, outputKey: generation.callId + ":1",
              sha256: sha(secondBytes) }, secondBytes);
            assert.notEqual(second.id, first.id);
            assert.equal(second.originalAssetId, null);
            assert.deepEqual((await media.read(production._id, second.id)).bytes, secondBytes);
            await assert.rejects(media.retainOriginal(production._id, input, secondBytes), /correct hash/);
            await assert.rejects(bookletMedia(db, { uid: "foreign", authTime: 1 }, { documentVersion: 2, store: null })
              .read(production._id, first.id));
            assert.equal(await db.collection("bookletAssets").countDocuments({ productionId: production._id,
              operationId: generation.callId, originalAssetId: null }), 2);
          } finally {
            await db.collection("aiJobs").updateOne({ _id: "run-v2" as never }, { $set: { cancelRequested: false } });
          }
        });
        await t.test("original source delivery preserves ordered bytes and binds visual child inputs without binary JSON", async () => {
          const media = bookletMedia(db, { uid: "owner", authTime: 1 }, { documentVersion: 2, store: null });
          const assets = await db.collection<BookletAsset>("bookletAssets").find({ productionId: production._id,
            operationId: "generate-action", originalAssetId: null }).sort({ outputKey: -1 }).toArray();
          assert.equal(assets.length, 2);
          const references = assets.map((asset) => ({ assetId: asset._id, sha256: asset.sha256, bytes: asset.bytes }));
          const request = { sources: [], references };
          const response = await invoke("sources", request);
          assert.notEqual(response.isError, true, JSON.stringify(response));
          assert.deepEqual(response.structuredContent, { result: { references } });
          assert.ok(!JSON.stringify(response.structuredContent).includes("data"));
          const images = response.content.filter((block: { type: string }) => block.type === "image");
          assert.equal(images.length, 2);
          for (const [i, image] of images.entries()) {
            const original = await media.read(production._id, references[i].assetId);
            assert.deepEqual(Buffer.from(image.data, "base64"), original.bytes);
            assert.equal(image.mimeType, original.asset.mime);
          }
          const tooSmall = mcpLimitsSchema.parse({ requestBytes: 2097152, toolResultBytes: 1024, responseBytes: 4096 });
          assert.equal((await invoke("sources", request, v2Token, tooSmall)).isError, true);
          for (const change of [{ sha256: "f".repeat(64) }, { bytes: references[0].bytes + 1 }, { assetId: "foreign" }])
            assert.equal((await invoke("sources", { ...request, references: [{ ...references[0], ...change }] })).isError, true);
          assert.equal((await invoke("sources", { ...request, references: references.map((ref) => ({ ...ref, bytes: 5 * 1024 * 1024 })) })).isError, true);
          const derivative = await media.derivative(production._id, references[0].assetId, 512);
          assert.equal((await invoke("sources", { sources: [], references: [{ assetId: derivative.id,
            sha256: derivative.sha256, bytes: derivative.bytes }] })).isError, true);

          const specSource = await db.collection("bookletRevisions").findOne({ _id: "prepare-source-0" as never });
          const styleSource = await db.collection("bookletRevisions").findOne({ _id: "prepare-source-1" as never });
          const child = { contractVersion: 2, invocationId: "prepare-edit", callId: "prepare-edit", service: "image-executor",
            operation: "prepare", intent: "create", items: [{ itemId: "prepare-edit-item", targetId: "sample-prepare", input: {
              imageKind: "style-sample", specification: specSource!.content, style: styleSource!.content,
              settings: { mode: "edit", model: "gpt-image-2.5-sunburst", count: 1, canvas: { width: 1024, height: 1024 },
                quality: "high", background: "opaque", format: "png" },
            } }], sources: [specSource!, styleSource!].map((source) => ({ artifactId: source.artifactId,
              revisionId: source._id, contentHash: source.contentHash, content: source.content })), references, constraints: {} };
          const current = await successful("context", {});
          const registered = await successful("begin_work", { action: "register", childRequest: child,
            requestHash: fingerprint(child), targets: ["sample-output"], fence: current.fence });
          const files = references.map(() => ({ related_id: randomUUID() })); // Synthetic target conversion; no Dify execution.
          const bound = JSON.parse(runNativeCode("manager", "bind-originals", { raw: response.structuredContent,
            request: JSON.stringify(child), files }).request);
          assert.deepEqual(bound.references.map((ref: { nativeFileId: string }) => ref.nativeFileId), files.map((file) => file.related_id));
          const prepared = JSON.parse(runNativeCode("image-executor", "validate", {
            request: JSON.stringify(bound), references: files,
          }).result).items[0].prepared;
          assert.deepEqual(prepared.references, references);
          assert.equal(prepared.settings.mode, "edit");
          assert.equal((await successful("begin_work", { action: "dispatch", callId: child.callId,
            requestHash: fingerprint(child), fence: registered.fence })).status, "dispatching");
        });
        await t.test("image outputs publish once per original and visual review binds the saved image to actual pixels", async () => {
          const assets = await db.collection<BookletAsset>("bookletAssets").find({ productionId: production._id,
            operationId: "generate-action", originalAssetId: null }).sort({ outputKey: 1 }).toArray();
          const producer = await db.collection("bookletWork").findOne({ productionId: production._id, callId: "generate-action" });
          const current = await successful("context", {});
          const request = { artifactId: "sample-output", content: { kind: "reference", asset: {
            assetId: assets[0]._id, sha256: assets[0].sha256,
          } }, assets: [{ assetId: assets[0]._id, sha256: assets[0].sha256 }], sources: producer!.sources,
            evidence: producer!.evidenceIds, mutationKey: "image-output-zero", fence: current.fence };
          assert.equal((await invoke("save_revision", { ...request, content: { ...request.content, asset: {
            ...request.content.asset, sha256: "f".repeat(64),
          } } })).isError, true);
          const first = await successful("save_revision", request);
          assert.deepEqual(await successful("save_revision", request), first);
          const other = { ...request, content: { kind: "reference", asset: { assetId: assets[1]._id, sha256: assets[1].sha256 } },
            assets: [{ assetId: assets[1]._id, sha256: assets[1].sha256 }], mutationKey: "image-output-one", fence: first.fence };
          const second = await successful("save_revision", other);
          assert.notEqual(first.revisionId, second.revisionId);
          assert.equal((await successful("save_revision", { ...other, mutationKey: "same-output-new-key", fence: second.fence })).revisionId, second.revisionId);
          const replayed = await successful("save_revision", { ...request, mutationKey: "old-output-new-key",
            fence: (await successful("context", {})).fence });
          assert.equal(replayed.revisionId, first.revisionId);
          const pointers = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          assert.equal(pointers!.subjects.find((subject: { id: string }) => subject.id === "sample-prepare")
            .artifacts.find((artifact: { id: string }) => artifact.id === "sample-output").currentRevisionId, second.revisionId);
          assert.equal(await db.collection("bookletRevisions").countDocuments({ productionId: production._id,
            artifactId: "sample-output", "provenance.operationId": producer!.callId }), 2);
          assert.ok((await db.collection<BookletAsset>("bookletAssets").findOne({ _id: assets[1]._id }))!.attachments.includes(second.revisionId));
          const selected = await db.collection<import("../../src/lib/server/booklets/documents-v2").RevisionV2>("bookletRevisions")
            .findOne({ _id: second.revisionId });
          assert.deepEqual(selected!.content, other.content);
          const replacement = await db.collection<import("../../src/lib/server/booklets/documents-v2").RevisionV2>("bookletRevisions")
            .findOne({ _id: "prepare-source-1" });
          const references = [assets[1], assets[0]].map((asset) => ({ assetId: asset._id, sha256: asset.sha256, bytes: asset.bytes }));
          const child = { contractVersion: 2, invocationId: "visual-review", callId: "visual-review", service: "quality-reviewer",
            operation: "image", intent: "create", items: [{ itemId: "visual-item", input: {
              targetIds: ["sample-output"], targetHash: selected!.contentHash, referencePositions: [0],
            } }], sources: [{ artifactId: selected!.artifactId, revisionId: selected!._id,
              contentHash: selected!.contentHash, content: selected!.content }, { artifactId: replacement!.artifactId,
              revisionId: replacement!._id, contentHash: replacement!.contentHash, content: replacement!.content }], references, constraints: {} };
          const review = { action: "register", childRequest: child, requestHash: fingerprint(child), targets: ["sample-output"],
            fence: (await successful("context", {})).fence };
          const omitted = { ...child, items: [{ ...child.items[0], input: { ...child.items[0].input, referencePositions: [1] } }] };
          assert.equal((await invoke("begin_work", { ...review, childRequest: omitted, requestHash: fingerprint(omitted) })).isError, true);
          const registered = await successful("begin_work", review);
          const response = await invoke("sources", { sources: child.sources.map(({ artifactId, revisionId, contentHash }) =>
            ({ artifactId, revisionId, contentHash })), references });
          assert.notEqual(response.isError, true);
          const files = references.map(() => ({ related_id: randomUUID() })); // Target conversion remains unverified.
          const bound = JSON.parse(runNativeCode("manager", "bind-originals", { raw: response.structuredContent,
            request: JSON.stringify(child), files }).request);
          runNativeCode("quality-reviewer", "validate", { request: JSON.stringify(bound), references: files, execution_ready: "true" });
          const dispatched = await successful("begin_work", { action: "dispatch", callId: child.callId,
            requestHash: review.requestHash, fence: registered.fence });
          const finding = { id: "visual-defect", criterion: "required-content", classification: "confirmed",
            targetId: "sample-output", expected: "Required feature visible", observed: "Required feature absent" };
          const result = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(bound), response: {
            items: [{ itemId: "visual-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "sample-output", content: {
              coverage: { targetIds: ["sample-output"], referencePositions: [0] }, disposition: "repair", findings: [finding], limitations: [],
            } }] }],
          } }).result);
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const session = db.client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "visual-execution", nodeId: "child-quality-reviewer", nodeType: "tool",
            status: "succeeded", retryIndex: null, iterationId: null, loopId: null,
            outputs: { json: [{ result: JSON.stringify(result) }] }, outputsTruncated: false, error: null, executionMetadata: null,
          }, session)); } finally { await session.endSession(); }
          const assessment = await successful("record_assessment", { assessment: result.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "visual-execution" }, fence: dispatched.fence });
          assert.equal(assessment.complete, true);
          const saved = await db.collection("bookletAssessments").findOne({ _id: assessment.assessmentId as never });
          assert.deepEqual(saved!.assessment.coverage.assetIds, [assets[1]._id]);
          const reviewWork = await db.collection("bookletWork").findOne({ productionId: production._id, callId: child.callId });
          const revalidation = { artifactId: "sample-output", revalidatedFrom: selected!._id, assets: selected!.assets,
            sources: [{ artifactId: replacement!.artifactId, revisionId: replacement!._id, contentHash: replacement!.contentHash }],
            evidence: reviewWork!.evidenceIds, mutationKey: "revalidate-image", fence: assessment.fence };
          assert.equal((await invoke("save_revision", { ...revalidation, sources: [] })).isError, true);
          assert.equal((await invoke("save_revision", { ...revalidation, content: { kind: "reference",
            asset: { assetId: assets[0]._id, sha256: assets[0].sha256 } }, assets: [{ assetId: assets[0]._id, sha256: assets[0].sha256 }] })).isError, true);
          const revalidated = await successful("save_revision", revalidation);
          assert.deepEqual(await successful("save_revision", revalidation), revalidated);
          const rebound = await db.collection<import("../../src/lib/server/booklets/documents-v2").RevisionV2>("bookletRevisions")
            .findOne({ _id: revalidated.revisionId });
          assert.equal(rebound!.revalidatedFrom, selected!._id);
          assert.deepEqual(rebound!.content, selected!.content);
          assert.deepEqual(rebound!.assets, selected!.assets);
          assert.deepEqual(rebound!.sources, revalidation.sources);
          const reuse = await successful("save_revision", { ...revalidation, sources: [selected!.sources[0]],
            evidence: producer!.evidenceIds, mutationKey: "manager-policy-reuse", fence: revalidated.fence });
          const reused = await db.collection("bookletRevisions").findOne({ _id: reuse.revisionId as never });
          assert.equal(reused!.revalidatedFrom, selected!._id);
          assert.deepEqual(reused!.content, selected!.content);
          assert.deepEqual((await db.collection("bookletRevisions").findOne({ _id: selected!._id as never }))!.sources, selected!.sources);
          const after = await db.collection<import("../../src/lib/server/booklets/documents-v2").RevisionV2>("bookletRevisions")
            .findOne({ _id: first.revisionId });
          const correction = { ...child, invocationId: "visual-correction-review", callId: "visual-correction-review", operation: "correction",
            items: [{ itemId: "correction-item", input: { targetIds: ["sample-output"], targetHash: after!.contentHash,
              before: selected!.content, after: after!.content, findings: [finding], visual: true, referencePositions: [0, 1] } }],
            sources: [selected!, after!].map((source) => ({ artifactId: source.artifactId, revisionId: source._id,
              contentHash: source.contentHash, content: source.content })),
          };
          const correctionRequest = { action: "register", childRequest: correction, requestHash: fingerprint(correction),
            targets: ["sample-output"], fence: (await successful("context", {})).fence };
          const forged = { ...correction, items: [{ ...correction.items[0], input: { ...correction.items[0].input,
            findings: [{ ...finding, observed: "Invented defect" }] } }] };
          assert.equal((await invoke("begin_work", { ...correctionRequest, childRequest: forged, requestHash: fingerprint(forged) })).isError, true);
          const registration = await successful("begin_work", correctionRequest);
          const correctionSources = await invoke("sources", { sources: correction.sources.map(({ artifactId, revisionId, contentHash }) =>
            ({ artifactId, revisionId, contentHash })), references });
          assert.notEqual(correctionSources.isError, true);
          const correctedInput = JSON.parse(runNativeCode("manager", "bind-originals", { raw: correctionSources.structuredContent,
            request: JSON.stringify(correction), files }).request);
          runNativeCode("quality-reviewer", "validate", { request: JSON.stringify(correctedInput), references: files, execution_ready: "true" });
          const correctionDispatch = await successful("begin_work", { action: "dispatch", callId: correction.callId,
            requestHash: correctionRequest.requestHash, fence: registration.fence });
          const checked = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(correctedInput), response: {
            items: [{ itemId: "correction-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "sample-output", content: {
              coverage: { targetIds: ["sample-output"], referencePositions: [0, 1] }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          const correctionSession = db.client.startSession();
          try { await correctionSession.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "correction-review-execution", nodeId: "child-quality-reviewer", nodeType: "tool",
            status: "succeeded", retryIndex: null, iterationId: null, loopId: null,
            outputs: { json: [{ result: JSON.stringify(checked) }] }, outputsTruncated: false, error: null, executionMetadata: null,
          }, correctionSession)); } finally { await correctionSession.endSession(); }
          const recorded = await successful("record_assessment", { assessment: checked.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "correction-review-execution" },
            fence: correctionDispatch.fence });
          assert.equal(recorded.complete, true);
          assert.deepEqual(checked.items[0].proposals[0].content.coverage.assetIds, references.map((ref) => ref.assetId));
          // Exercise the paid-action boundary with synthetic native results only.
          const dispatchChild = async (request: Record<string, unknown>, correctionMetadata?: unknown) => {
            const registration = await successful("begin_work", { action: "register", childRequest: request,
              requestHash: fingerprint(request), targets: ["sample-output"], correction: correctionMetadata,
              fence: (await successful("context", {})).fence });
            if (request.service === "image-executor" && request.operation === "generate")
              assert.equal(runNativeCode("manager", "guard", { context: JSON.stringify({ ...await successful("context", {}), assessments: [] }), decision: {
                action: "image-executor", request_json: JSON.stringify(request), reason: "Correct the confirmed scoped finding" } }).paid, "yes");
            return successful("begin_work", { action: "dispatch", callId: request.callId,
              requestHash: fingerprint(request), fence: registration.fence });
          };
          const observe = async (result: unknown, nodeId: string, executionId: string) => {
            const session = db.client.startSession();
            try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
              runId: parent!.runId!, id: executionId, nodeId, nodeType: "tool", status: "succeeded",
              retryIndex: null, iterationId: null, loopId: null, outputs: { json: [{ result: JSON.stringify(result) }] },
              outputsTruncated: false, error: null, executionMetadata: null,
            }, session)); } finally { await session.endSession(); }
          };
          const spec = await db.collection("bookletRevisions").findOne({ _id: "prepare-source-0" as never });
          const prepare = { contractVersion: 2, invocationId: "repair-prepare", callId: "repair-prepare", service: "image-executor",
            operation: "prepare", intent: "revise", items: [{ itemId: "repair-item", targetId: "sample-prepare",
              baseline: selected!.content, feedback: finding, input: { imageKind: "style-sample", specification: spec!.content,
                style: replacement!.content, settings: { mode: "generate", model: "gpt-image-2.5-sunburst", count: 1,
                  canvas: { width: 1024, height: 1024 }, quality: "high", background: "opaque", format: "png" } } }],
            sources: [selected!, spec!, replacement!].map((source) => ({ artifactId: source.artifactId, revisionId: source._id,
              contentHash: source.contentHash, content: source.content })), references: [], constraints: {} };
          await dispatchChild(prepare);
          const preparedResult = JSON.parse(runNativeCode("image-executor", "validate", { request: JSON.stringify(prepare) }).result);
          await observe(preparedResult, "child-image-executor", "repair-prepare-execution");
          const prepared = preparedResult.items[0].prepared;
          const preflight = { ...prepare, invocationId: "repair-preflight", callId: "repair-preflight", service: "quality-reviewer",
            operation: "image_request", intent: "create", items: [{ itemId: "preflight-item", input: {
              targetIds: ["sample-output"], targetHash: prepared.requestHash, prepared, referencePositions: [],
            } }] };
          const preflightDispatch = await dispatchChild(preflight);
          const preflightResult = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(preflight), response: {
            items: [{ itemId: "preflight-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "sample-output", content: {
              coverage: { targetIds: ["sample-output"], referencePositions: [] }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          await observe(preflightResult, "child-quality-reviewer", "repair-preflight-execution");
          await successful("record_assessment", { assessment: preflightResult.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "repair-preflight-execution" },
            fence: preflightDispatch.fence });
          const generation = { ...prepare, invocationId: "repair-generate", callId: "repair-generate", operation: "generate",
            items: [{ ...prepare.items[0], input: { prepared } }] };
          const correctionMetadata = { rootId: producer!.correctionRootId, family: "image", findingIds: [finding.id] };
          const generated = await dispatchChild(generation, correctionMetadata);
          assert.equal(generated.status, "dispatching");
          runNativeCode("image-executor", "validate", { request: JSON.stringify(generation), execution_ready: "true" });
          const imageResult = JSON.parse(runNativeCode("image-executor", "generate-result", { request: JSON.stringify(generation),
            files: [{ id: "synthetic-repaired-original" }] }).result);
          await observe(imageResult, "child-image-executor", "repair-generate-execution");
          const repairedBytes = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "green" } }).png().toBuffer();
          const repaired = await bookletMedia(db, { uid: "owner", authTime: 1 }, { documentVersion: 2, store: null })
            .retainOriginal(production._id, { operationId: generation.callId, outputKey: generation.callId + ":0",
              sha256: sha(repairedBytes), mime: "image/png" }, repairedBytes);
          const repairedWork = await db.collection("bookletWork").findOne({ productionId: production._id, callId: generation.callId });
          const published = await successful("save_revision", { artifactId: "sample-output", content: { kind: "reference",
            asset: { assetId: repaired.id, sha256: repaired.sha256 } }, assets: [{ assetId: repaired.id, sha256: repaired.sha256 }],
            sources: repairedWork!.sources, evidence: repairedWork!.evidenceIds, mutationKey: "publish-repaired-original",
            fence: (await successful("context", {})).fence });
          assert.ok(published.revisionId);
          const allowance = await successful("read_document", { kind: "correction", id: correctionMetadata.rootId });
          assert.equal(allowance.value.used, 1);
          const exhausted = { ...generation, invocationId: "repair-again", callId: "repair-again", constraints: { variant: "another" } };
          const exhaustedIntent = await successful("begin_work", { action: "register", childRequest: exhausted, requestHash: fingerprint(exhausted),
            targets: ["sample-output"], correction: correctionMetadata, fence: published.fence });
          assert.equal((await invoke("begin_work", { action: "dispatch", callId: exhausted.callId, requestHash: fingerprint(exhausted),
            fence: exhaustedIntent.fence })).isError, true);
          const repairedRevision = await db.collection<import("../../src/lib/server/booklets/documents-v2").RevisionV2>("bookletRevisions")
            .findOne({ _id: published.revisionId });
          const finalReview = { ...correction, invocationId: "repaired-review", callId: "repaired-review",
            items: [{ itemId: "repaired-review-item", input: { ...correction.items[0].input,
              after: repairedRevision!.content, targetHash: repairedRevision!.contentHash } }],
            sources: [selected!, repairedRevision!].map((source) => ({ artifactId: source.artifactId, revisionId: source._id,
              contentHash: source.contentHash, content: source.content })),
            references: [references[0], { assetId: repaired.id, sha256: repaired.sha256, bytes: repaired.bytes }],
          };
          const finalPixels = await invoke("sources", { sources: finalReview.sources.map(({ artifactId, revisionId, contentHash }) =>
            ({ artifactId, revisionId, contentHash })), references: finalReview.references });
          assert.notEqual(finalPixels.isError, true);
          const finalFiles = finalReview.references.map(() => ({ related_id: randomUUID() }));
          const finalInput = JSON.parse(runNativeCode("manager", "bind-originals", { raw: finalPixels.structuredContent,
            request: JSON.stringify(finalReview), files: finalFiles }).request);
          const finalDispatch = await dispatchChild(finalReview);
          const finalResult = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(finalInput), response: {
            items: [{ itemId: "repaired-review-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "sample-output", content: {
              coverage: { targetIds: ["sample-output"], referencePositions: [0, 1] }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          await observe(finalResult, "child-quality-reviewer", "repaired-review-execution");
          assert.equal((await successful("record_assessment", { assessment: finalResult.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "repaired-review-execution" },
            fence: finalDispatch.fence })).complete, true);
          assert.equal((await successful("read_document", { kind: "correction", id: correctionMetadata.rootId })).value.used, 1);
        });
        await t.test("specification review records only the exact retained immutable specification", async () => {
          const current = await successful("context", {});
          const selected = await db.collection("bookletRevisions").findOne({ _id: "prepare-source-0" as never });
          const child = { contractVersion: 2, invocationId: "spec-review", callId: "spec-review", service: "quality-reviewer",
            operation: "specification", intent: "create", items: [{ itemId: "spec-item", input: {
              targetIds: ["sample-spec"], targetHash: selected!.contentHash, referencePositions: [],
            } }], sources: [{ artifactId: selected!.artifactId, revisionId: selected!._id, contentHash: selected!.contentHash,
              content: selected!.content }], references: [], constraints: {} };
          const requestHash = fingerprint(child);
          const registered = await successful("begin_work", { action: "register", childRequest: child,
            requestHash, targets: ["sample-spec"], fence: current.fence });
          runNativeCode("quality-reviewer", "validate", { request: JSON.stringify(child), references: [], execution_ready: "true" });
          const dispatched = await successful("begin_work", { action: "dispatch", callId: child.callId, requestHash, fence: registered.fence });
          const result = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(child), response: {
            items: [{ itemId: "spec-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "sample-spec", content: {
              coverage: { targetIds: ["sample-spec"], referencePositions: [] }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const session = db.client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "spec-execution", nodeId: "child-quality-reviewer", nodeType: "tool", status: "succeeded",
            retryIndex: null, iterationId: null, loopId: null, outputs: { json: [{ result: JSON.stringify(result) }] },
            outputsTruncated: false, error: null, executionMetadata: null,
          }, session)); } finally { await session.endSession(); }
          const request = { assessment: result.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "spec-execution" }, fence: dispatched.fence };
          assert.equal((await invoke("record_assessment", { ...request, assessment: { ...request.assessment,
            targetHash: "0".repeat(64) } })).isError, true);
          const recorded = await successful("record_assessment", request);
          assert.equal(recorded.complete, true);
          assert.deepEqual(await successful("record_assessment", request), recorded);
        });
        await t.test("whole-book review binds manifest, immutable page sources and inspected originals", async () => {
          const current = await successful("context", {});
          const indexed = await successful("index", { subjects: [], artifacts: [
            { subjectId: "page-v2", artifactId: "whole-page-image", kind: "page-image" },
            { subjectId: "book-subject", artifactId: "whole-manifest", kind: "book-manifest" },
          ], fence: current.fence });
          const originals = await db.collection<BookletAsset>("bookletAssets").find({ productionId: production._id,
            operationId: "generate-action", originalAssetId: null }).sort({ outputKey: 1 }).toArray();
          const pairs = [{ pageId: "page-v2", referenceAssetId: originals[1]._id }];
          const pageContent = { kind: "page-image", asset: { assetId: originals[0]._id, sha256: originals[0].sha256 } };
          const manifest = { kind: "book-manifest", pages: [{ pageId: "page-v2", assetId: originals[0]._id }], continuityPairs: pairs };
          // The page's immutable metadata is staged; Manager manifest publication is actual.
          const pageRevision = revisionV2Schema.parse({ ...revision, _id: "whole-page-fixture", ordinal: 1,
            artifactId: "whole-page-image", subjectId: "page-v2", kind: "page-image", content: pageContent,
            contentHash: fingerprint(pageContent), sources: [], assets: [pageContent.asset] });
          await db.collection("bookletRevisions").insertOne(pageRevision as never);
          const pageSource = { artifactId: pageRevision.artifactId, revisionId: pageRevision._id, contentHash: pageRevision.contentHash };
          const draft = { artifactId: "whole-manifest", content: manifest, sources: [pageSource], assets: [pageContent.asset],
            evidence: [], mutationKey: "assemble-manifest", fence: indexed.fence };
          const workCount = await db.collection("bookletWork").countDocuments({ productionId: production._id });
          for (const changed of [{ ...draft, sources: [] }, { ...draft, assets: [] },
            { ...draft, content: { ...manifest, pages: [{ pageId: "page-v2", assetId: originals[1]._id }] } },
            { ...draft, evidence: ["invented-producer"] }])
            assert.equal((await invoke("save_revision", changed)).isError, true);
          const first = await successful("save_revision", draft);
          assert.deepEqual(await successful("save_revision", draft), first);
          const extra = await db.collection("bookletRevisions").findOne({ _id: "prepare-source-0" as never });
          const replacementSources = [pageSource, { artifactId: extra!.artifactId, revisionId: extra!._id, contentHash: extra!.contentHash }];
          const second = await successful("save_revision", { ...draft, content: undefined, sources: replacementSources,
            revalidatedFrom: first.revisionId, mutationKey: "revalidate-manifest-context", fence: first.fence });
          assert.notEqual(second.revisionId, first.revisionId);
          assert.equal(second.contentHash, first.contentHash);
          assert.equal((await successful("save_revision", { ...draft, mutationKey: "same-draft-new-key", fence: second.fence })).revisionId, first.revisionId);
          assert.equal(await db.collection("bookletWork").countDocuments({ productionId: production._id }), workCount);
          const state = await successful("read_document", { kind: "production", id: production._id });
          assert.equal(state.value.state, "in-progress");
          assert.equal(state.value.currentManifestRevisionId, null);
          const p = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          const selected = p!.subjects[0].artifacts.find((artifact: { id: string }) => artifact.id === "whole-manifest");
          assert.equal(selected.currentRevisionId, second.revisionId);
          assert.equal(selected.acceptedRevisionId, null);
          const selectedManifest = await db.collection<import("../../src/lib/server/booklets/documents-v2").RevisionV2>("bookletRevisions").findOne({ _id: second.revisionId });
          assert.equal(selectedManifest!.revalidatedFrom, first.revisionId);
          assert.deepEqual(selectedManifest!.content, manifest);
          assert.ok(selectedManifest!.provenance.operationId.startsWith("manifest:"));
          const references = originals.map((asset) => ({ assetId: asset._id, sha256: asset.sha256, bytes: asset.bytes }));
          const child = { contractVersion: 2, invocationId: "whole-review", callId: "whole-review", service: "quality-reviewer",
            operation: "whole_book", intent: "create", items: [{ itemId: "whole-item", input: {
              targetIds: ["page-v2"], pageIds: ["page-v2"], targetHash: fingerprint(manifest), referencePositions: [0, 1], continuityPairs: pairs,
            } }], sources: [pageRevision, selectedManifest!].map((row) => ({ artifactId: row.artifactId, revisionId: row._id, contentHash: row.contentHash,
              content: row.content })), references, constraints: {} };
          const registration = { action: "register", childRequest: child, requestHash: fingerprint(child), targets: ["page-v2"], fence: p!.fenceCounter };
          for (const sources of [[child.sources[0]], [child.sources[1]]]) {
            const omitted = { ...child, sources };
            assert.equal((await invoke("begin_work", { ...registration, childRequest: omitted, requestHash: fingerprint(omitted) })).isError, true);
          }
          const wrongPixels = { ...child, references: [references[1]], items: [{ ...child.items[0], input: {
            ...child.items[0].input, referencePositions: [0] } }] };
          assert.equal((await invoke("begin_work", { ...registration, childRequest: wrongPixels,
            requestHash: fingerprint(wrongPixels) })).isError, true);
          const registered = await successful("begin_work", registration);
          const pixels = await invoke("sources", { sources: child.sources.map(({ artifactId, revisionId, contentHash }) =>
            ({ artifactId, revisionId, contentHash })), references });
          assert.notEqual(pixels.isError, true);
          const files = references.map(() => ({ related_id: randomUUID() })); // Synthetic target conversion only.
          const bound = JSON.parse(runNativeCode("manager", "bind-originals", { raw: pixels.structuredContent,
            request: JSON.stringify(child), files }).request);
          runNativeCode("quality-reviewer", "validate", { request: JSON.stringify(bound), references: files, execution_ready: "true" });
          const dispatched = await successful("begin_work", { action: "dispatch", callId: child.callId,
            requestHash: registration.requestHash, fence: registered.fence });
          const packed = JSON.parse(runNativeCode("quality-reviewer", "pack", { request: JSON.stringify(bound), response: {
            items: [{ itemId: "whole-item", status: "succeeded", proposals: [{ kind: "assessment", subjectId: "page-v2", content: {
              coverage: { targetIds: ["page-v2"], referencePositions: [0, 1], continuityPairs: pairs }, disposition: "pass", findings: [], limitations: [],
            } }] }],
          } }).result);
          const parent = await db.collection<AiJob>("aiJobs").findOne({ _id: "run-v2" });
          const session = db.client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(db, parent!, {
            runId: parent!.runId!, id: "whole-execution", nodeId: "child-quality-reviewer", nodeType: "tool", status: "succeeded",
            retryIndex: null, iterationId: null, loopId: null, outputs: { json: [{ result: JSON.stringify(packed) }] },
            outputsTruncated: false, error: null, executionMetadata: null,
          }, session)); } finally { await session.endSession(); }
          const request = { assessment: packed.items[0].proposals[0].content,
            executionLocator: { runId: parent!.runId!, nodeId: "child-quality-reviewer", executionId: "whole-execution" }, fence: dispatched.fence };
          assert.equal((await invoke("record_assessment", { ...request, assessment: { ...request.assessment,
            coverage: { ...request.assessment.coverage, continuityPairs: [] } } })).isError, true);
          const recorded = await successful("record_assessment", request);
          assert.equal(recorded.complete, true);
          assert.deepEqual(await successful("record_assessment", request), recorded);
          const accepted = await successful("record_acceptance", { revisionId: selectedManifest!._id,
            contentHash: selectedManifest!.contentHash, targetIds: ["whole-manifest"], assetIds: [pageContent.asset.assetId],
            sources: selectedManifest!.sources, evidence: [recorded.assessmentId], fence: recorded.fence });
          assert.ok(accepted.acceptanceId);
          const after = await db.collection("bookletProductions").findOne({ _id: production._id as never });
          assert.equal(after!.lifecycleState, "in-progress");
          assert.equal(after!.currentManifestRevisionId, null);
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
