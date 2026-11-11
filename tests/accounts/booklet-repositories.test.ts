import assert from "node:assert/strict";
import { test } from "node:test";
import { BSON, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  bookletRepository,
  createBookletIndexes,
} from "../../src/lib/server/booklets/repository";
import { bookletsServerExtension } from "../../src/project/booklets/server";
import { fingerprint } from "../../src/lib/server/foundation/canonical";
import { enqueueBookletRun } from "../../src/lib/server/booklets/runs";
import { bookletDomain, bookletDomainV2 } from "../../src/project/booklets/domain";
import { createCreditIndexes, grantCredits } from "../../src/lib/server/store/credits";
import { createConsumptionIndexes } from "../../src/lib/server/commerce/orders";
import { bookletLifecycleV2 } from "../../src/lib/server/booklets/lifecycle-v2";
import { bookletContext } from "../../src/lib/server/booklets/context";
import { registerBookletWorkV2 } from "../../src/lib/server/booklets/work-v2";
import { bookletWorkUsageV2 } from "../../src/lib/server/booklets/usage-v2";
import { observeBookletNodeV2 } from "../../src/lib/server/booklets/observations-v2";
import type { AiJob } from "../../src/lib/server/ai/jobs";
import type { ProviderExecution, ProviderNodeObservation } from "../../src/lib/server/ai/types";
import { readBookletDocumentV2 } from "../../src/lib/server/booklets/read-v2";
import { reconcileBookletWorkV2, reconcileOneBookletWorkV2 } from "../../src/lib/server/booklets/reconcile-v2";
import { bookletContentV2Schema } from "../../src/project/booklets/contracts-v2";
import { orchestratorSchema } from "../../src/lib/contracts/runs";
import {
  bookletRepositoryV2,
  createBookletV2Indexes,
} from "../../src/lib/server/booklets/repository-v2";
import {
  productionV2Schema,
  revisionV2Schema,
  storedProductionSchema,
  workV2Schema,
  assessmentDocumentV2Schema,
  acceptanceDocumentV2Schema,
  humanRequestV2Schema,
} from "../../src/lib/server/booklets/documents-v2";
import type {
  AppendInput,
  Mutation,
  SubjectInput,
  ArtifactKind,
} from "../../src/lib/server/booklets/documents";

const language = { tag: "en", direction: "ltr" as const };
const canvas = { width: 1024, height: 1024, mime: "image/png" as const };
const fields = {
  executionProfileId: "fixture",
  executionProfileRevision: 1,
  storyPages: 1,
  includeCover: false,
  maxCharacters: 1,
  maxLocations: 1,
  maxPanelsPerPage: 2,
  styleSamples: 1,
  canvas,
  languages: [language],
  repairLimitPerOutput: 1,
  execution: {
    maxTextCalls: 20,
    maxImageCalls: 10,
    maxWorkflowSteps: 60,
    maxElapsedSeconds: 600,
    spendingCeiling: { amountMinor: 100, currency: "USD" },
  },
};
const capacity = {
  id: "fixture",
  revision: 1,
  maxStoryPages: 10,
  coverSupported: true,
  maxCharacters: 5,
  maxLocations: 5,
  maxPanelsPerPage: 4,
  maxStyleSamples: 2,
  canvases: [canvas],
  languages: [language],
};
const brief = {
  idea: "Mira finds a lantern.",
  audience: "Children",
  language,
  characters: ["Mira"],
  locations: [],
  visualPreferences: "Watercolor",
};
const actor = { uid: "owner", authTime: 1 };
const content = {
  kind: "manuscript" as const,
  units: [
    {
      id: "unit-1",
      prose: "Mira finds a lantern.",
      characterIds: [],
      locationIds: [],
    },
  ],
};
const hash = "a".repeat(64);

test("booklet repositories preserve embedded identities and transactional boundaries", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  let serial = 0;
  async function fixture() {
    const db = client.db("booklet_" + ++serial);
    await createBookletIndexes(db);
    let time = new Date("2026-11-07T09:00:00Z");
    const now = () => time;
    const repo = bookletRepository(db, actor, { now });
    const order = {
      _id: "order",
      value: {
        schemaVersion: 1,
        id: "order",
        ownerId: actor.uid,
        targetId: "production",
        idempotencyKey: "checkout",
        inputHash: hash,
        terms: {
          identity: { id: "fixture-package", revision: 1, schemaVersion: 1 },
          productType: "booklet",
          productSchemaVersion: 1,
          credits: 50,
          allowances: ["story", "style", "reference", "page"].map(
            (category) => ({
              category,
              unit: "subject",
              included: 1,
              extraCredits: 5,
            }),
          ),
          entitlementDays: null,
        },
        state: "queued",
        chargedCredits: 0,
        refundedCredits: 0,
        chargeLedgerId: null,
        startedAt: null,
        expiresAt: null,
        createdAt: time.toISOString(),
      },
      fields,
      locks: [],
      activeWorkflow: null,
    };
    await db.collection<typeof order>("consumptionOrders").insertOne(order);
    await repo.createBook({ id: "book", title: "The lantern", key: "create" });
    const creation = {
      id: "production",
      bookletId: "book",
      orderId: "order",
      brief,
      capacity,
      key: "production-create",
    };
    await repo.createProduction(creation);
    let version = 1;
    let fence = 0;
    let key = 0;
    const mutation = (): Mutation => ({
      key: "mutation-" + ++key,
      expectedVersion: version,
      holderId: "worker",
      fence,
    });
    async function lease() {
      const result = await repo.acquireLease("production", {
        key: "lease-" + ++key,
        expectedVersion: version,
        holderId: "worker",
        durationMs: 10000,
      });
      version = result.version;
      fence = result.fence!;
      return result;
    }
    async function subject(s: SubjectInput) {
      const result = await repo.addSubject("production", {
        ...mutation(),
        subject: s,
      });
      version = result.version;
    }
    async function artifact(
      subjectId: string,
      artifactId: string,
      kind: ArtifactKind,
    ) {
      const result = await repo.addArtifact("production", {
        ...mutation(),
        subjectId,
        artifactId,
        kind,
      });
      version = result.version;
    }
    function append(override: Partial<AppendInput> = {}): AppendInput {
      return {
        ...mutation(),
        artifactId: "story",
        content,
        sources: [],
        assets: [],
        provenance: { operationId: "operation", runId: "run", evidenceIds: [] },
        ...override,
      };
    }
    async function ready() {
      await lease();
      await subject({
        id: "book-subject",
        kind: "book",
        label: "Book",
        pageRole: null,
      });
      await artifact("book-subject", "story", "manuscript");
    }
    return {
      db,
      repo,
      order,
      creation,
      now,
      mutation,
      lease,
      subject,
      artifact,
      append,
      ready,
      setVersion: (v: number) => {
        version = v;
      },
      advance: (ms: number) => {
        time = new Date(time.getTime() + ms);
      },
    };
  }
  async function managerFixture() {
    const f = await fixture();
    await createBookletV2Indexes(f.db);
    const v2 = bookletRepositoryV2(f.db, actor, f.now);
    const order = structuredClone(f.order);
    order._id = "order-v2";
    order.value.id = "order-v2";
    order.value.targetId = "production-v2";
    await f.db.collection<typeof order>("consumptionOrders").insertOne(order);
    await v2.createProduction({
      ...f.creation,
      id: "production-v2",
      orderId: "order-v2",
      key: "create-v2",
    });
    const lease = await v2.acquireLease("production-v2", {
      key: "lease",
      holderId: "worker",
      expectedVersion: 1,
      durationMs: 300000,
    });
    let version = lease.version;
    let ordinal = 0;
    async function write<T extends { version: number }>(
      effect: (mutation: Mutation) => Promise<T>,
    ) {
      const result = await effect({
        key: "write-" + ++ordinal,
        expectedVersion: version,
        holderId: "worker",
        fence: lease.fence!,
      });
      version = result.version;
      return result;
    }
    await write((m) =>
      v2.addSubject("production-v2", {
        ...m,
        subject: {
          id: "book-subject",
          kind: "book",
          label: "Book",
          pageRole: null,
        },
      }),
    );
    await write((m) =>
      v2.addArtifact("production-v2", {
        ...m,
        subjectId: "book-subject",
        artifactId: "story-v2",
        kind: "manuscript",
      }),
    );
    const saved = await write((m) =>
      v2.appendRevision("production-v2", {
        ...m,
        artifactId: "story-v2",
        content: { kind: "manuscript", units: [] },
        sources: [],
        assets: [],
        provenance: { runId: "run", operationId: "op", evidenceIds: [] },
      }),
    );
    const revision = await v2.getRevision("production-v2", saved.revisionId!);
    return {
      ...f,
      v2,
      write,
      revision,
      source: {
        artifactId: revision.artifactId,
        revisionId: revision._id,
        contentHash: revision.contentHash,
      },
    };
  }
  try {
    await t.test("Reviewer registration retains both immutable correction revisions without duplicate sources", async () => {
      const f = await managerFixture();
      const after = { kind: "manuscript" as const, units: [{ id: "corrected", texts: [] }] };
      const saved = await f.write((m) => f.v2.appendRevision("production-v2", {
        ...m, artifactId: "story-v2", content: after, sources: [f.source], assets: [],
        provenance: { runId: "draft", operationId: "correction-fixture", evidenceIds: [] },
      }));
      const revision = await f.v2.getRevision("production-v2", saved.revisionId!);
      await createCreditIndexes(f.db);
      await createConsumptionIndexes(f.db);
      await grantCredits(f.db, actor.uid, "review-funding", { amount: 500, source: "purchase", reference: "fixture" });
      const paid = await bookletLifecycleV2(f.db, actor).start("production-v2");
      const jobId = "review-manager";
      await f.db.collection("aiJobs").insertOne({
        _id: jobId as never, uid: actor.uid, authTime: actor.authTime,
        status: "running", cancelRequested: false, runId: crypto.randomUUID(),
        consumption: { orderId: "order-v2", workflowId: paid.workflowId },
        run: { target: { adapter: "booklet", version: "2", kind: "booklet-production", id: "production-v2" } },
      });
      await f.db.collection("consumptionWorkflows").updateOne({ _id: paid.workflowId as never }, { $set: { jobId } });
      const repo = bookletRepositoryV2(f.db, actor, undefined, { atomicMutations: true });
      const p = await repo.getProduction("production-v2");
      const mutation = { key: "review-registration", holderId: jobId, expectedVersion: p.version, fence: p.fenceCounter };
      const originalFinding = { id: "original-finding", criterion: "exact-text", classification: "confirmed" as const,
        targetId: "story-v2", expected: "Correct text", observed: "Text defect" };
      const reviewSources = [f.source, { artifactId: revision.artifactId, revisionId: revision._id, contentHash: revision.contentHash }];
      for (const baseline of [f.revision, revision]) await f.db.collection("bookletAssessments").insertOne(assessmentDocumentV2Schema.parse({
        _id: fingerprint(["original-review", baseline._id]), documentVersion: 2, ownerId: actor.uid, productionId: p._id,
        createdAt: new Date(), callId: "original-review-" + baseline._id, policyBinding: "policy", reviewerBinding: "reviewer",
        complete: true, evidenceIds: ["trusted-fixture"], assessment: { mode: "text", targetHash: baseline.contentHash,
          requestHash: null, sources: reviewSources, coverage: { targetIds: ["story-v2"], referencePositions: [] },
          disposition: "repair", findings: [originalFinding], limitations: [] },
      }) as never);
      const request = {
        contractVersion: 2, invocationId: "review-invocation", callId: "review-correction",
        service: "quality-reviewer", operation: "correction", intent: "create",
        items: [{ itemId: "review-item", input: {
          targetIds: ["story-v2"], targetHash: revision.contentHash,
          before: f.revision.content, after, findings: [originalFinding],
        } }],
        sources: [{ ...f.source, content: f.revision.content }, {
          artifactId: revision.artifactId, revisionId: revision._id, contentHash: revision.contentHash, content: after,
        }],
        references: [], constraints: {},
      };
      const invoke = (childRequest: typeof request) => registerBookletWorkV2(f.db, actor, p._id, jobId, mutation, {
        childRequest, targets: ["story-v2"], requestHash: fingerprint(childRequest),
      });
      const duplicated = structuredClone(request);
      duplicated.sources.push(duplicated.sources[0]);
      await assert.rejects(invoke(duplicated), /Duplicate immutable review source/);
      const changed = structuredClone(request);
      changed.sources[1].content = f.revision.content as typeof after;
      await assert.rejects(invoke(changed), /source content changed/);
      const wrongTarget = structuredClone(request);
      wrongTarget.items[0].input.targetHash = "0".repeat(64);
      await assert.rejects(invoke(wrongTarget), /Review hash/);
      const forgedFinding = structuredClone(request);
      forgedFinding.items[0].input.findings[0].observed = "Invented defect";
      await assert.rejects(invoke(forgedFinding), /original confirmed finding/);
      const copy = { ...revision, _id: crypto.randomUUID(), ordinal: revision.ordinal + 1 };
      await f.db.collection("bookletRevisions").insertOne(copy as never);
      const stale = { ...request, items: [{ ...request.items[0], input: { ...request.items[0].input,
        targetHash: f.revision.contentHash, before: after, after: f.revision.content as typeof after,
      } }], sources: [request.sources[0], { ...request.sources[1], revisionId: copy._id }] };
      await assert.rejects(invoke(stale), /exact selected baseline/);
      const corrective = (baseline: typeof revision) => ({
        contractVersion: 2, invocationId: "correct-creative", callId: "correct-creative", service: "manuscript", operation: "write",
        intent: "revise", items: [{ itemId: "correct-item", targetId: "book-subject", input: {}, baseline: baseline.content,
          feedback: originalFinding }], sources: [{ artifactId: baseline.artifactId, revisionId: baseline._id,
          contentHash: baseline.contentHash, content: baseline.content }], references: [], constraints: {},
      });
      const correction = { rootId: fingerprint([p._id, "manuscript", "write", ["story-v2"], p.revisionChargeId ?? "platform"]),
        family: "llm", findingIds: [originalFinding.id] };
      const registerCorrection = (baseline: typeof revision, findingIds = correction.findingIds) => {
        const child = corrective(baseline);
        return registerBookletWorkV2(f.db, actor, p._id, jobId, { ...mutation, key: "corrective-registration" }, {
          childRequest: child, targets: ["story-v2"], requestHash: fingerprint(child), correction: { ...correction, findingIds },
        });
      };
      await assert.rejects(registerCorrection(copy), /exact selected baseline/);
      await assert.rejects(registerCorrection(f.revision, ["invented"]), /exact selected baseline/);
      const corrected = await registerCorrection(f.revision);
      assert.equal((await repo.getWork(p._id, "correct-creative")).correction?.findingIds[0], originalFinding.id);
      mutation.expectedVersion = corrected.version;
      mutation.fence = corrected.fence!;
      // A batch may review different immutable versions of the same artifact.
      request.items.push({ itemId: "review-earlier", input: {
        ...request.items[0].input, targetHash: f.revision.contentHash,
        before: after, after: f.revision.content as typeof after,
      } });
      request.items.push({ ...structuredClone(request.items[1]), itemId: "review-earlier-again" });
      const registered = await invoke(request);
      const work = await repo.getWork(p._id, request.callId);
      assert.equal(work.service, "quality-reviewer");
      assert.equal(work.category, "paidLlm");
      assert.deepEqual(work.sources.map((source) => source.revisionId), [f.revision._id, revision._id]);
      assert.deepEqual(work.requestPayload, request);
      assert.equal(work.status, "registered");
      const assessment = {
        mode: "correction" as const, targetHash: f.revision.contentHash, requestHash: null,
        sources: work.sources, coverage: { targetIds: ["story-v2"], referencePositions: [] },
        disposition: "pass" as const, findings: [], limitations: [],
      };
      const alternate = { ...assessment, disposition: "inconclusive" as const };
      await f.db.collection("bookletWork").updateOne({ _id: work._id as never }, { $set: { status: "dispatching" } });
      const parent = await f.db.collection("aiJobs").findOne({ _id: jobId as never });
      const workflowId = crypto.randomUUID();
      const job = { ...parent, execution: { workflowId, status: "running" },
        run: { ...parent!.run, orchestrator: { id: "booklet-manager", workflowId } },
      } as unknown as AiJob;
      const nativeResult = { contractVersion: 2, invocationId: request.invocationId, callId: request.callId,
        service: request.service, operation: request.operation, status: "partial", items: [
          { itemId: "review-item", status: "failed", proposals: [] },
          { itemId: "review-earlier", status: "succeeded", proposals: [{ content: assessment }] },
          { itemId: "review-earlier-again", status: "succeeded", proposals: [{ content: alternate }] },
        ] };
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await observeBookletNodeV2(f.db, job, {
            runId: job.runId!, id: "native-review", nodeId: "child-quality-reviewer", nodeType: "tool",
            status: "succeeded", retryIndex: null, iterationId: null, loopId: null,
            outputs: { json: [{ result: JSON.stringify(nativeResult) }] }, outputsTruncated: false,
            error: null, executionMetadata: null,
          }, session);
        });
      } finally { await session.endSession(); }
      const observed = await repo.getWork(p._id, work.callId);
      assert.deepEqual(observed.resultPayload, nativeResult);
      assert.equal(observed.status, "partial");
      const assessmentInput = {
        key: "batch-second-assessment", holderId: jobId, fence: registered.fence!, expectedVersion: registered.version,
        callId: work.callId, policyBinding: "policy-fixture", reviewerBinding: "reviewer-fixture",
        evidenceIds: observed.evidenceIds, assessment,
      };
      await assert.rejects(repo.recordAssessment(p._id, {
        ...assessmentInput, assessment: { ...assessment, disposition: "blocked" },
      }), /observed review work|retained native proposal/);
      const recorded = await repo.recordAssessment(p._id, assessmentInput);
      assert.ok(recorded.assessmentId);
      const repeated = await repo.recordAssessment(p._id, {
        ...assessmentInput, key: "batch-repeated-scope", expectedVersion: recorded.version,
        fence: recorded.fence!, assessment: alternate,
      });
      assert.ok(repeated.assessmentId);
      assert.notEqual(repeated.assessmentId, recorded.assessmentId);
    });
    await t.test("creative work derives retry identity from the actual request and bound paid Run", async (t) => {
      const f = await managerFixture();
      await f.write((m) => f.v2.indexEntries("production-v2", { ...m,
        subjects: [
          { id: "character-v2", kind: "character", label: "Mira", pageRole: null },
          { id: "location-v2", kind: "location", label: "Garden", pageRole: null },
          { id: "sample-v2", kind: "style-sample", label: "Style", pageRole: null },
          { id: "page-v2", kind: "page", label: "Page", pageRole: "story" },
        ], artifacts: [
          ...(["concept", "outline", "roster", "style", "book-layout"] as const).map((kind) => ({ subjectId: "book-subject", artifactId: "book-" + kind, kind })),
          ...(["character", "location"] as const).flatMap((kind) => [
            { subjectId: kind + "-v2", artifactId: kind + "-description", kind: "description" as const },
            { subjectId: kind + "-v2", artifactId: kind + "-spec", kind: "image-spec" as const },
          ]),
          { subjectId: "sample-v2", artifactId: "sample-spec", kind: "image-spec" },
          { subjectId: "page-v2", artifactId: "page-spec", kind: "page-spec" },
        ],
      }));
      await createCreditIndexes(f.db);
      await createConsumptionIndexes(f.db);
      await grantCredits(f.db, actor.uid, "work-funding", { amount: 500, source: "purchase", reference: "fixture" });
      const paid = await bookletLifecycleV2(f.db, actor).start("production-v2");
      const jobId = "manager-run";
      await f.db.collection("aiJobs").insertOne({
        _id: jobId as never, uid: actor.uid, authTime: actor.authTime,
        status: "running", cancelRequested: false, runId: crypto.randomUUID(),
        consumption: { orderId: "order-v2", workflowId: paid.workflowId },
        run: { target: { adapter: "booklet", version: "2", kind: "booklet-production", id: "production-v2" } },
      });
      await f.db.collection("consumptionWorkflows").updateOne({ _id: paid.workflowId as never }, { $set: { jobId } });
      const repo = bookletRepositoryV2(f.db, actor, undefined, { atomicMutations: true });
      let p = await repo.getProduction("production-v2");
      let version = p.version;
      let fence = p.fenceCounter;
      let ordinal = 0;
      const m = () => ({ key: "registration-" + ++ordinal, holderId: jobId, fence, expectedVersion: version });
      const request = {
        contractVersion: 2, invocationId: "invocation-1", callId: "call-1", service: "manuscript", operation: "write", intent: "create",
        items: [{ itemId: "item-1", targetId: "book-subject", input: { instruction: "Keep exact text.\n\u0645\u0631\u062d\u0628\u0627 \ud83d\ude00 e\u0301 Bearer creative-dialogue" } }],
        sources: [{ ...f.source, content: f.revision.content }],
        references: [{ assetId: "original-1", sha256: "a".repeat(64), bytes: 100, nativeFileId: "handle-1", url: "https://files.invalid/old" }],
        constraints: { language: "ar" },
      };
      const payload = (childRequest: typeof request, retryOf: string | null = null) => ({
        childRequest, targets: ["story-v2"], retryOf,
        requestHash: fingerprint({ ...childRequest, references: childRequest.references.map(({ assetId, sha256, bytes }) => ({ assetId, sha256, bytes })) }),
      });
      const firstMutation = m();
      const invoke = (mutation: Mutation, value: unknown) => registerBookletWorkV2(f.db, actor, p._id, jobId, mutation, value);
      await assert.rejects(invoke(firstMutation, { ...payload(request), category: "nonPaid" }));
      await assert.rejects(invoke(firstMutation, { ...payload(request), requestHash: "0".repeat(64) }), /actual payload/);
      const changed = structuredClone(request);
      changed.sources[0].content = { kind: "manuscript", units: [{ id: "altered", texts: [] }] };
      await assert.rejects(invoke(firstMutation, payload(changed)), /source content/);
      await assert.rejects(invoke(firstMutation, { ...payload(request), childRequest: { ...request, constraints: { authorization: "private" } } }), /Private bindings/);
      // Registration checks owned retained metadata; the MCP suite separately
      // verifies complete original bytes and native image delivery.
      await f.db.collection("bookletAssets").insertOne({ _id: "original-1" as never,
        ownerId: actor.uid, productionId: p._id, originalAssetId: null, state: "ready",
        sha256: "a".repeat(64), bytes: 100,
      });
      for (const target of ["book-subject", "book-concept", "missing-target"]) {
        const invalid = structuredClone(request);
        invalid.items[0].targetId = target;
        await assert.rejects(invoke(firstMutation, { ...payload(invalid), targets: [target] }), /artifact responsibility/);
      }
      const wrongSubject = { ...request, service: "art-director", operation: "character_spec",
        items: [{ ...request.items[0], targetId: "location-v2" }] };
      await assert.rejects(invoke(firstMutation, { ...payload(wrongSubject), targets: ["location-spec"] }), /artifact responsibility/);
      const inheritedOperation = { ...request, operation: "constructor" };
      await assert.rejects(invoke(firstMutation, payload(inheritedOperation)), /Unsupported child operation/);
      const escapedSubject = { ...request, items: [{ ...request.items[0], targetId: "character-v2" }] };
      await assert.rejects(invoke(firstMutation, payload(escapedSubject)), /Child subject escapes/);
      const artifactSelector = { ...request, items: [{ ...request.items[0], targetId: "story-v2" }] };
      await assert.rejects(invoke(firstMutation, payload(artifactSelector)), /Child subject escapes/);
      const registered = await invoke(firstMutation, payload(request));
      version = registered.version;
      fence = registered.fence!;
      assert.deepEqual(await invoke(firstMutation, payload(request)), registered);
      const first = await repo.getWork(p._id, "call-1");
      assert.equal(first.category, "paidLlm");
      assert.equal(first.runId, jobId);
      const expectedRequest = { ...request, references: request.references.map(({ assetId, sha256, bytes }) => ({ assetId, sha256, bytes })) };
      assert.deepEqual(first.requestPayload, expectedRequest);
      // A fresh repository instance after the registration reply is lost can
      // reconstruct the exact intent, without diagnostic redaction or expiring URLs.
      assert.deepEqual((await bookletRepositoryV2(f.db, actor).getWork(p._id, "call-1")).requestPayload, expectedRequest);
      assert.equal(fingerprint(first.requestPayload), first.requestHash);
      await assert.rejects(repo.registerWork(p._id, { ...m(),
        callId: "forged-body", runId: jobId, actionKey: first.actionKey,
        requestHash: first.requestHash, requestPayload: { changed: true },
        service: "manuscript", operation: "write", targetIds: ["story-v2"],
        sources: [], category: "paidLlm",
      }), /Stored request differs/);
      assert.equal((await repo.getProduction(p._id)).mutationLease, null);
      const retry = structuredClone(request);
      retry.invocationId = "invocation-2"; retry.callId = "call-2"; retry.items[0].itemId = "item-2";
      retry.references[0].nativeFileId = "handle-2"; retry.references[0].url = "https://files.invalid/renewed";
      await assert.rejects(invoke(m(), payload(retry, "call-1")), /Reuse or reconcile/);
      await t.test("dispatch rejects exhausted usage, reported cost, locked stages and unfunded revisions atomically", async () => {
        const before = await repo.getProduction(p._id);
        const call = () => repo.dispatchWork(p._id, { ...m(), callId: first.callId, requestHash: first.requestHash });
        const unchanged = async () => {
          assert.equal((await repo.getWork(p._id, first.callId)).status, "registered");
          const current = await repo.getProduction(p._id);
          assert.equal(current.version, before.version);
          assert.equal(current.fenceCounter, before.fenceCounter);
        };
        const counted = { ...first, _id: fingerprint("counted-manager") as never,
          callId: "counted-manager", actionKey: fingerprint("counted-manager-action"),
          service: "manager", operation: "reason", status: "unknown" };
        await f.db.collection("bookletWork").insertOne(counted);
        await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: {
          "creativeConfigSnapshot.execution.maxTextCalls": 1,
        } });
        await assert.rejects(call(), /call or reported spending ceiling/);
        await unchanged();
        await f.db.collection("bookletWork").deleteOne({ _id: counted._id });
        await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: {
          "creativeConfigSnapshot.execution.maxTextCalls": before.creativeConfigSnapshot.execution.maxTextCalls,
        } });
        const costId = fingerprint("dispatch-cost-fixture");
        await f.db.collection("aiUsage").insertOne({ _id: costId as never, uid: actor.uid, jobId,
          scope: "execution", cost: { amount: "999999", currency: before.creativeConfigSnapshot.execution.spendingCeiling.currency } });
        await assert.rejects(call(), /call or reported spending ceiling/);
        await unchanged();
        await f.db.collection("aiUsage").deleteOne({ _id: costId as never });
        await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: {
          "stageLocks.story": { operationId: "locked-before-dispatch", lockedAt: new Date(), sourceRevisionIds: [] },
        } });
        await assert.rejects(call(), /stage is locked/);
        await unchanged();
        await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: {
          "stageLocks.story": null, revisionChargeId: "unfunded-revision",
        } });
        await assert.rejects(call(), /financial consent/);
        await unchanged();
        await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: {
          revisionChargeId: before.revisionChargeId,
        } });
        assert.deepEqual(await repo.getProduction(p._id), before);
      });
      const dispatch = await repo.dispatchWork(p._id, { ...m(), callId: "call-1", requestHash: first.requestHash });
      version = dispatch.version;
      fence = dispatch.fence!;
      const outcome = await repo.recordWorkOutcome(p._id, { ...m(), callId: "call-1", status: "failed", retryable: true, evidenceIds: ["trusted-fixture"] });
      version = outcome.version;
      fence = outcome.fence!;
      const retried = await invoke(m(), payload(retry, "call-1"));
      version = retried.version;
      fence = retried.fence!;
      const second = await repo.getWork(p._id, "call-2");
      assert.equal(second.actionKey, first.actionKey);
      assert.equal(second.retryOrdinal, 1);
      const tasks = [
        ["story-planner", "concept", "book-concept"], ["story-planner", "outline", "book-outline"],
        ["story-planner", "cast", "book-roster"], ["story-planner", "cast", "character-description"],
        ["story-planner", "locations", "book-roster"], ["story-planner", "locations", "location-description"],
        ["manuscript", "reconcile_characters", "character-description"], ["manuscript", "reconcile_locations", "location-description"],
        ["art-director", "style", "book-style"], ["art-director", "sample_spec", "sample-spec"],
        ["art-director", "character_spec", "character-spec"], ["art-director", "location_spec", "location-spec"],
        ["page-composer", "paginate", "book-book-layout"], ["page-composer", "compose", "page-spec"],
      ];
      for (const [service, operation, targetId] of tasks) {
        const subjectId = targetId.startsWith("character-") ? "character-v2" : targetId.startsWith("location-") ? "location-v2" : targetId === "sample-spec" ? "sample-v2" : targetId === "page-spec" ? "page-v2" : "book-subject";
        const child = { ...request, service, operation, callId: "scoped-" + service + "-" + operation + "-" + targetId,
          items: [{ ...request.items[0], targetId: subjectId }] };
        const result = await invoke(m(), { ...payload(child), targets: [targetId] });
        version = result.version;
        fence = result.fence!;
        const work = await repo.getWork(p._id, child.callId);
        assert.deepEqual(work.targetIds, [targetId], service + ":" + operation);
      }
      const localSubject = { ...request, service: "story-planner", operation: "cast", callId: "local-character-proposal",
        items: [{ ...request.items[0], targetId: "new-local-character" }] };
      const localResult = await invoke(m(), { ...payload(localSubject), targets: ["book-roster"] });
      version = localResult.version;
      fence = localResult.fence!;
      assert.deepEqual((await repo.getWork(p._id, localSubject.callId)).targetIds, ["book-roster"]);
      const wrongKnownSubject = { ...localSubject, callId: "wrong-known-character", items: [{ ...request.items[0], targetId: "location-v2" }] };
      await assert.rejects(invoke(m(), { ...payload(wrongKnownSubject), targets: ["book-roster"] }), /Child subject escapes/);
      const grouped = { ...request, callId: "grouped-revision", service: "manuscript", operation: "reconcile_characters", intent: "revise",
        items: [{ itemId: "grouped-item", input: { instruction: "Reconcile the selected character." }, targetIds: ["character-v2"],
          baseline: { name: "Mira" }, feedback: { instruction: "Keep established facts." } }] };
      const groupedResult = await invoke(m(), { childRequest: grouped, targets: ["character-description"],
        requestHash: fingerprint({ ...grouped, references: grouped.references.map(({ assetId, sha256, bytes }) => ({ assetId, sha256, bytes })) }) });
      version = groupedResult.version;
      fence = groupedResult.fence!;
      const different = structuredClone(retry); different.callId = "call-3"; different.items[0].input.instruction = "Changed instructions.";
      await assert.rejects(invoke(m(), payload(different, "call-2")), /predecessor/);
      await f.db.collection("consumptionWorkflows").updateOne({ _id: paid.workflowId as never }, { $set: { jobId: "foreign-run" } });
      await assert.rejects(invoke(m(), payload(different)), /prepaid Manager/);
      await assert.rejects(repo.dispatchWork(p._id, { ...m(), callId: "call-2", requestHash: second.requestHash }), /prepaid Manager/);
      await f.db.collection("consumptionWorkflows").updateOne({ _id: paid.workflowId as never }, { $set: { jobId } });
      await f.db.collection("aiJobs").updateOne({ _id: jobId as never }, { $set: { cancelRequested: true } });
      await assert.rejects(invoke(m(), payload(different)), /prepaid Manager/);
      await assert.rejects(repo.dispatchWork(p._id, { ...m(), callId: "call-2", requestHash: second.requestHash }), /prepaid Manager/);
      assert.equal((await repo.getWork(p._id, "call-2")).status, "registered");
      await f.db.collection("aiJobs").updateOne({ _id: jobId as never }, { $set: { cancelRequested: false, execution: { status: "failed" } } });
      await assert.rejects(repo.dispatchWork(p._id, { ...m(), callId: "call-2", requestHash: second.requestHash }), /prepaid Manager/);

      p = await repo.getProduction(p._id);
      assert.equal(p.version, version);
      assert.equal(await f.db.collection("bookletWork").countDocuments({ productionId: p._id }), 4 + tasks.length);
      const nextJobId = "successor-manager";
      const nextFlowId = "successor-flow";
      const oldJob = await f.db.collection("aiJobs").findOne({ _id: jobId as never });
      const oldFlow = await f.db.collection("consumptionWorkflows").findOne({ _id: paid.workflowId as never });
      await f.db.collection("aiJobs").insertOne({ ...oldJob!, _id: nextJobId as never,
        cancelRequested: false, runId: crypto.randomUUID(), execution: null, consumption: { orderId: "order-v2", workflowId: nextFlowId } });
      await f.db.collection("consumptionWorkflows").insertOne({ ...oldFlow!, _id: nextFlowId as never, jobId: nextJobId });
      await f.db.collection("consumptionOrders").updateOne({ _id: "order-v2" as never }, { $set: { activeWorkflow: nextFlowId } });
      await repo.dispatchWork(p._id, { key: "successor-dispatch", holderId: nextJobId, fence: p.fenceCounter,
        expectedVersion: p.version, callId: "call-2", requestHash: second.requestHash });
      assert.equal((await repo.getWork(p._id, "call-2")).runId, nextJobId);
      assert.equal((await repo.getWork(p._id, "call-2")).status, "dispatching");
      await t.test("native child retention survives terminal parents and rolls back with its worker transaction", async (t) => {
        const nativeId = crypto.randomUUID();
        const workflowId = crypto.randomUUID();
        const parent = await f.db.collection("aiJobs").findOne({ _id: nextJobId as never });
        const job = { ...parent, runId: nativeId, status: "cancelled", cancelRequested: true,
          execution: { runId: nativeId, workflowId, status: "stopped" },
          run: { ...parent!.run, orchestrator: { id: "booklet-manager", workflowId } } } as unknown as AiJob;
        await f.db.collection("aiJobs").replaceOne({ _id: nextJobId as never }, job as never);
        await f.db.collection("consumptionOrders").updateOne({ _id: "order-v2" as never }, { $set: { "value.state": "revoked" } });
        const exact = "\u0645\u0631\u062d\u0628\u0627 e\u0301 \ud83d\ude00\nBearer creative-dialogue ".repeat(3000);
        const result = { contractVersion: 2, invocationId: retry.invocationId, callId: retry.callId,
          service: "manuscript", operation: "write", status: "succeeded", items: [{ itemId: "item-2",
            status: "succeeded", proposals: [{ kind: "manuscript", subjectId: "book-subject",
              content: { kind: "manuscript", units: [{ id: "unit", texts: [{ id: "text", kind: "prose", text: exact }] }] } }] }] };
        const node: ProviderNodeObservation = { runId: nativeId, id: "observed-execution", nodeId: "child-manuscript",
          nodeType: "tool", status: "succeeded", retryIndex: 0, iterationId: null, loopId: "iteration-2",
          outputs: { json: [{ result: JSON.stringify(result) }] }, outputsTruncated: false,
          error: null, executionMetadata: { total_tokens: 42 } };
        const observe = async (observation: ProviderNodeObservation, parent = job, rollback = false) => {
          const session = client.startSession();
          try { await session.withTransaction(async () => {
            await observeBookletNodeV2(f.db, parent, observation, session);
            if (rollback) throw Error("fixture rollback");
          }); } finally { await session.endSession(); }
        };
        for (const invalid of [{ ...node, outputsTruncated: true }, { ...node, runId: crypto.randomUUID() },
          { ...node, nodeId: "untrusted-node" }, { ...node, outputs: { json: [{ result: JSON.stringify({ ...result, invocationId: "forged" }) }] } }])
          await observe(invalid);
        await observe(node, { ...job, execution: { ...job.execution!, workflowId: crypto.randomUUID() } });
        assert.equal((await repo.getWork(p._id, "call-2")).resultPayload, undefined);
        await assert.rejects(observe(node, job, true), /fixture rollback/);
        assert.equal((await repo.getWork(p._id, "call-2")).resultPayload, undefined);
        assert.equal(await f.db.collection("executionEvidence").countDocuments({ runId: nextJobId }), 0);
        const execution: ProviderExecution = { runId: nativeId, workflowId, status: "stopped", outputs: null,
          usage: { scope: "execution", id: nativeId, inputTokens: null, outputTokens: null,
            totalTokens: null, cost: null, elapsedMs: null } };
        let reads = 0, traces = 0;
        const reconcile = (executionRead: NonNullable<Parameters<typeof reconcileBookletWorkV2>[5]>["execution"], nodes: ProviderNodeObservation[] = []) =>
          reconcileBookletWorkV2(f.db, actor, p._id, retry.callId, AbortSignal.timeout(5000), {
            execution: async (accepted, signal) => { reads++; assert.equal(accepted._id, nextJobId); assert.equal(accepted.runId, nativeId);
              return executionRead!(accepted, signal); },
            trace: async () => { traces++; return nodes.map(node => ({ type: "node-observation" as const, node })); },
          });
        const unconfirmed = await reconcile(async () => ({ kind: "unknown", failure: "timeout" }));
        assert.equal(unconfirmed.status, "dispatching");
        assert.equal(unconfirmed.retryable, false);
        assert.equal(unconfirmed.reconciliation, "execution_unconfirmed");
        const mismatched = await reconcile(async () => ({ kind: "ok", value: { ...execution, workflowId: crypto.randomUUID() } }));
        assert.equal(mismatched.reconciliation, "execution_identity_mismatch");
        assert.equal(traces, 0);
        const missing = await reconcile(async () => ({ kind: "ok", value: execution }));
        assert.equal(missing.reconciliation, "child_result_pending");
        const recovered = await reconcile(async () => ({ kind: "ok", value: execution }), [node]);
        assert.equal(recovered.resultAvailable, true);
        assert.equal(recovered.status, "succeeded");
        assert.equal(reads, 4);
        await reconcile(async () => { throw Error("Known result must not read or restart a provider"); });
        assert.equal(reads, 4);
        const retained = await bookletRepositoryV2(f.db, actor).getWork(p._id, "call-2");
        assert.deepEqual(retained.resultPayload, result);
        type Page = { complete: boolean; sections: { key: string; complete: boolean; cursor?: string }[]; cursor: string | null };
        let ownedRead = await readBookletDocumentV2(f.db, actor, p._id, { kind: "work", id: retry.callId }) as Page;
        assert.equal(ownedRead.complete, false);
        while (!ownedRead.sections.some(section => section.key === "resultPayload") && ownedRead.cursor)
          ownedRead = await readBookletDocumentV2(f.db, actor, p._id, { kind: "work", id: retry.callId, cursor: ownedRead.cursor }) as Page;
        assert.ok(ownedRead.sections.some(section => section.key === "resultPayload" && !section.complete));
        assert.equal(retained.status, "succeeded");
        assert.equal(retained.retryable, false);
        assert.deepEqual(retained.resultObservation, { runId: nativeId, nodeId: node.nodeId, executionId: node.id,
          retryIndex: 0, iterationId: null, loopId: "iteration-2" });
        await observe(node);
        assert.equal(await f.db.collection("executionEvidence").countDocuments({ runId: nextJobId }), 1);
        assert.equal(await f.db.collection("bookletRevisions").countDocuments({ productionId: p._id }), 1);
        assert.equal((await repo.getProduction(p._id)).lifecycleState, "in-progress");
        await t.test("Manager reasoning is counted once with fenced retention and unknown failures", async () => {
          const reason: ProviderNodeObservation = { ...node, id: "manager-reason", nodeId: "decide", nodeType: "llm",
            outputs: { structured_output: { action: "read_document" } }, executionMetadata: { total_tokens: 17 } };
          const before = await repo.getProduction(p._id);
          const counts = await bookletWorkUsageV2(f.db, before);
          await observe({ ...reason, nodeId: "untrusted-reason" });
          await assert.rejects(observe(reason, job, true), /fixture rollback/);
          assert.equal((await repo.getProduction(p._id)).version, before.version);
          await observe(reason);
          await observe(reason);
          await observe({ ...reason, retryIndex: null });
          const after = await repo.getProduction(p._id);
          assert.equal(after.version, before.version);
          const measured = await bookletWorkUsageV2(f.db, after);
          assert.equal(measured.paidLlm, counts.paidLlm + 1);
          assert.equal(after.fenceCounter, before.fenceCounter);
          const stored = await f.db.collection("bookletWork").findOne({ ownerId: actor.uid, productionId: p._id, service: "manager" });
          assert.deepEqual(stored!.resultPayload, reason.outputs);
          assert.equal(stored!.requestPayload, undefined);
          assert.equal(stored!.category, "paidLlm");
          await observe({ ...reason, id: "manager-failed", status: "failed", outputs: null });
          const failed = await f.db.collection("bookletWork").findOne({ ownerId: actor.uid, productionId: p._id, service: "manager", status: "unknown" });
          assert.equal(failed!.retryable, false);
          assert.equal((await bookletWorkUsageV2(f.db, await repo.getProduction(p._id))).unresolved, measured.unresolved + 1);
          const recovered = await reconcileBookletWorkV2(f.db, actor, p._id, failed!.callId, AbortSignal.timeout(5000), {
            execution: async () => ({ kind: "ok", value: execution }),
            trace: async () => [{ type: "node-observation", node: { ...reason, id: "manager-failed", status: "succeeded" } }],
          });
          assert.equal(recovered.status, "succeeded");
          const reconciled = await bookletWorkUsageV2(f.db, await repo.getProduction(p._id));
          assert.equal(reconciled.unresolved, measured.unresolved);
          assert.equal(reconciled.paidLlm, measured.paidLlm + 1);
          await observe({ ...reason, id: "manager-large", outputs: { values: Array(400000).fill(0) } });
          const oversized = await f.db.collection("bookletWork").findOne({ ownerId: actor.uid, productionId: p._id, "resultObservation.executionId": "manager-large" });
          assert.equal(oversized!.resultPayload, undefined);
          assert.ok(BSON.calculateObjectSize(oversized!) < 4 * 1024 * 1024);
          assert.equal((await bookletWorkUsageV2(f.db, await repo.getProduction(p._id))).paidLlm, reconciled.paidLlm + 1);
          await observe({ ...reason, id: "manager-truncated", outputsTruncated: true });
          const partial = await f.db.collection("bookletWork").findOne({ ownerId: actor.uid, productionId: p._id, "resultObservation.executionId": "manager-truncated" });
          assert.equal(partial!.resultPayload, undefined);
          await observe({ ...reason, id: "manager-truncated" });
          const hydrated = await f.db.collection("bookletWork").findOne({ _id: partial!._id });
          assert.deepEqual(hydrated!.resultPayload, reason.outputs);
          assert.equal(hydrated!.evidenceIds.length, 2);
        });
        await t.test("a continuing Manager publishes the retained proposal without replaying its child", async () => {
          const publicationId = "publisher-manager", publicationFlow = "publisher-flow";
          let current = await repo.getProduction(p._id);
          const proposal = bookletContentV2Schema.parse(result.items[0].proposals[0].content);
          const save = (key: string, overrides: object = {}) => repo.appendRevision(p._id, {
            key, holderId: publicationId, fence: current.fenceCounter, expectedVersion: current.version,
            artifactId: "story-v2", content: proposal, sources: [f.source], assets: [],
            provenance: { runId: publicationId, operationId: retry.callId, evidenceIds: retained.evidenceIds }, ...overrides,
          });
          await assert.rejects(save("not-admitted"), /entitlement/);
          const publicationRun = crypto.randomUUID();
          await f.db.collection("aiJobs").insertOne({ ...job, _id: publicationId as never, status: "running",
            cancelRequested: false, runId: publicationRun, execution: { ...execution, runId: publicationRun, status: "running" },
            consumption: { orderId: "order-v2", workflowId: publicationFlow } });
          await f.db.collection("consumptionWorkflows").insertOne({ ...oldFlow!, _id: publicationFlow as never, jobId: publicationId });
          await f.db.collection("consumptionOrders").updateOne({ _id: "order-v2" as never }, { $set: { activeWorkflow: publicationFlow, "value.state": "started" } });
          await assert.rejects(save("changed-body", { content: { ...proposal, units: [] } }), /observed proposal/);
          await assert.rejects(save("changed-evidence", { provenance: { runId: publicationId, operationId: retry.callId, evidenceIds: ["invented-evidence"] } }), /retained creative work/);
          await assert.rejects(save("changed-source", { sources: [] }), /retained creative work/);
          await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: { "stageLocks.story": { operationId: "locked", lockedAt: new Date(), sourceRevisionIds: [f.source.revisionId] } } });
          await assert.rejects(save("locked-story"), /stage is locked/);
          await f.db.collection("bookletProductions").updateOne({ _id: p._id as never }, { $set: { "stageLocks.story": null } });
          const originalVersion = current;
          const saved = await save("publish-retained");
          assert.deepEqual((await repo.getRevision(p._id, saved.revisionId!)).content, proposal);
          assert.deepEqual(await save("publish-retained"), saved);
          current = await repo.getProduction(p._id);
          assert.equal(current.version, originalVersion.version + 1);
          assert.equal((await save("same-work-new-reply-key")).revisionId, saved.revisionId);
          assert.equal(await f.db.collection("bookletRevisions").countDocuments({ productionId: p._id, "provenance.operationId": retry.callId }), 1);
          assert.equal((await repo.getWork(p._id, retry.callId)).runId, nextJobId);
          let rosterSource: typeof f.source | undefined;
          for (const operation of ["cast", "locations"] as const) {
            const callId = "scoped-story-planner-" + operation + "-book-roster";
            const planned = await repo.getWork(p._id, callId);
            current = await repo.getProduction(p._id);
            await repo.dispatchWork(p._id, { key: "dispatch-" + operation, holderId: publicationId,
              fence: current.fenceCounter, expectedVersion: current.version, callId, requestHash: planned.requestHash });
            const roster = { kind: "roster" as const, subjectIds: [operation === "cast" ? "character-v2" : "location-v2"] };
            const description = { kind: "description" as const, name: "Mira", subjectKind: "character" as const,
              description: "Exact original description.", establishedFacts: [], continuityConstraints: [] };
            const proposals = [{ kind: "roster", subjectId: "book-subject", content: roster },
              ...(operation === "cast" ? [{ kind: "description", subjectId: "character-v2", content: description }] : [])];
            const childResult = { contractVersion: 2, invocationId: request.invocationId, callId, service: "story-planner",
              operation, status: "succeeded", items: [{ itemId: "item-1", status: "succeeded", proposals }] };
            const publisher = await f.db.collection<AiJob>("aiJobs").findOne({ _id: publicationId });
            const session = client.startSession();
            try { await session.withTransaction(async () => observeBookletNodeV2(f.db, publisher!, {
              ...node, runId: publicationRun, nodeId: "child-story-planner", id: "roster-" + operation,
              outputs: { json: [{ result: JSON.stringify(childResult) }] },
            }, session)); } finally { await session.endSession(); }
            const captured = await repo.getWork(p._id, callId);
            current = await repo.getProduction(p._id);
            const rosterSaved = await repo.appendRevision(p._id, { key: "roster-" + operation, holderId: publicationId,
              fence: current.fenceCounter, expectedVersion: current.version, artifactId: "book-roster", content: roster,
              sources: [f.source], assets: [], provenance: { runId: publicationId, operationId: callId, evidenceIds: captured.evidenceIds } });
            const rosterRevision = await repo.getRevision(p._id, rosterSaved.revisionId!);
            assert.deepEqual(rosterRevision.content,
              { kind: "roster", subjectIds: operation === "cast" ? ["character-v2"] : ["character-v2", "location-v2"] });
            if (rosterSource) assert.ok(rosterRevision.sources.some(source => fingerprint(source) === fingerprint(rosterSource)));
            rosterSource = { artifactId: "book-roster", revisionId: rosterRevision._id, contentHash: rosterRevision.contentHash };
            assert.deepEqual((captured.resultPayload as typeof childResult).items[0].proposals[0].content, roster);
            if (operation === "cast") {
              current = await repo.getProduction(p._id);
              const savedDescription = await repo.appendRevision(p._id, { key: "cast-description", holderId: publicationId,
                fence: current.fenceCounter, expectedVersion: current.version, artifactId: "character-description", content: description,
                sources: [f.source], assets: [], provenance: { runId: publicationId, operationId: callId, evidenceIds: captured.evidenceIds } });
              assert.deepEqual((await repo.getRevision(p._id, savedDescription.revisionId!)).content, description);
            }
          }
          const pageCall = "scoped-page-composer-compose-page-spec";
          const pageWork = await repo.getWork(p._id, pageCall);
          current = await repo.getProduction(p._id);
          await repo.dispatchWork(p._id, { key: "dispatch-page-capacity", holderId: publicationId,
            fence: current.fenceCounter, expectedVersion: current.version, callId: pageCall, requestHash: pageWork.requestHash });
          const overCapacityPage = { kind: "page-spec" as const, pageId: "page-v2",
            panels: Array.from({ length: p.creativeConfigSnapshot.maxPanelsPerPage + 1 }, (_, i) => ({ id: "panel-" + i, noText: true, lettering: [] })) };
          const publisher = await f.db.collection<AiJob>("aiJobs").findOne({ _id: publicationId });
          const session = client.startSession();
          try { await session.withTransaction(async () => observeBookletNodeV2(f.db, publisher!, {
            ...node, runId: publicationRun, nodeId: "child-page-composer", id: "page-capacity-result",
            outputs: { json: [{ result: JSON.stringify({ contractVersion: 2, invocationId: request.invocationId, callId: pageCall,
              service: "page-composer", operation: "compose", status: "succeeded", items: [{ itemId: "item-1", status: "succeeded",
                proposals: [{ kind: "page-spec", subjectId: "page-v2", content: overCapacityPage }] }] }) }] },
          }, session)); } finally { await session.endSession(); }
          current = await repo.getProduction(p._id);
          const pageOutcome = await repo.getWork(p._id, pageCall);
          await assert.rejects(repo.appendRevision(p._id, { key: "over-capacity-page", holderId: publicationId,
            fence: current.fenceCounter, expectedVersion: current.version, artifactId: "page-spec", content: overCapacityPage,
            sources: [f.source], assets: [], provenance: { runId: publicationId, operationId: pageCall, evidenceIds: pageOutcome.evidenceIds } }), /purchased panel capacity/);
          assert.equal(await f.db.collection("bookletRevisions").countDocuments({ productionId: p._id, "provenance.operationId": pageCall }), 0);
        });
      });
    });
    await t.test(
      "v2 prepaid Run admission preserves funding, versions and saved state across continuation",
      async () => {
        const f = await managerFixture();
        await f.write((m) =>
          f.v2.checkpoint("production-v2", {
            ...m,
            expectedCheckpointVersion: 0,
            state: { pending: { callId: "retained-work" } },
          }),
        );
        await createCreditIndexes(f.db);
        await createConsumptionIndexes(f.db);
        await f.db.collection("consumptionOrders").updateOne(
          { _id: "order-v2" as never },
          { $set: { "value.terms.allowances": f.order.value.terms.allowances.map((a) =>
            a.category === "story" ? { ...a, unit: "request" } : a,
          ) } },
        );
        await grantCredits(f.db, actor.uid, "admission-funding", {
          amount: 500,
          source: "purchase",
          reference: "fixture",
        });
        const lifecycle = bookletLifecycleV2(f.db, actor);
        const paid = await lifecycle.start("production-v2");
        assert.equal((await lifecycle.start("production-v2")).workflowId, paid.workflowId);
        const before = await f.v2.getProduction("production-v2");
        const legacy = await f.repo.getProduction("production");
        const context = bookletContext(f.db, actor);
        await assert.rejects(context.transaction((session) => context.save(
          { ...before, _id: "production", orderId: "order" }, legacy.version, session,
        )), /Production changed/);
        assert.equal((await f.repo.getProduction("production")).documentVersion, 1);
        const definition = orchestratorSchema.parse({
          id: "booklet-manager-v2",
          name: "Booklet fixture",
          description: "Fake",
          order: 0,
          keyEnv: "DIFY_KEY_TEST",
          enabled: true,
          domainAdapter: { id: "booklet", version: "2" },
          responseMode: "raw-v1",
          legacyInputs: [],
          inputs: [],
          pricing: null,
          recovery: null,
        });
        await f.db.collection("orchestrators").insertOne({
          _id: definition.id as never,
          revision: 1,
          definition,
          validated: true,
          updatedAt: new Date(),
        });
        await bookletDomainV2.own(f.db, actor.uid, "production-v2");
        await assert.rejects(bookletDomainV2.own(f.db, "foreign", "production-v2"));
        await assert.rejects(bookletDomain.own(f.db, actor.uid, "production-v2"));
        await assert.rejects(bookletDomainV2.own(f.db, actor.uid, "production"));
        const session = client.startSession();
        try {
          await assert.rejects(
            session.withTransaction(() =>
              bookletDomainV2.admit(f.db, actor.uid, "production-v2", session),
            ),
            /paid entitlement/,
          );
        } finally {
          await session.endSession();
        }
        const oldMode = process.env.DIFY_MODE;
        process.env.DIFY_MODE = "fake";
        try {
          const input = {
            key: "v2-admission",
            workflowId: paid.workflowId,
            orchestratorId: definition.id,
            configurationRevision: 1,
            inputs: {},
          };
          const [admitted, duplicate] = await Promise.all([
            enqueueBookletRun(f.db, actor, "production-v2", input),
            enqueueBookletRun(f.db, actor, "production-v2", input),
          ]);
          assert.deepEqual(duplicate, admitted);
          assert.deepEqual(
            await enqueueBookletRun(f.db, actor, "production-v2", input),
            admitted,
          );
          const job = await f.db
            .collection("aiJobs")
            .findOne({ _id: admitted.attemptId as never });
          assert.equal(job!.run.target.version, "2");
          assert.equal(job!.reservationId, null);
          assert.equal(job!.credits, 0);
          assert.equal(job!.consumption.orderId, "order-v2");
          await assert.rejects(
            lifecycle.finishRun("production-v2", paid.workflowId),
            /Reconcile/,
          );
          await assert.rejects(lifecycle.continue("production-v2", "still-active"), /Reconcile/);
          await f.db
            .collection("aiJobs")
            .updateOne(
              { _id: admitted.attemptId as never },
              { $set: { status: "failed", terminationEvidence: "unverified" } },
            );
          await assert.rejects(
            lifecycle.finishRun("production-v2", paid.workflowId),
            /Reconcile/,
          );
          await assert.rejects(lifecycle.continue("production-v2", "unverified-termination"), /Reconcile/);
          await f.db
            .collection("aiJobs")
            .updateOne(
              { _id: admitted.attemptId as never },
              { $set: { terminationEvidence: "provider-failed" } },
            );
          const [nextFlow, repeatedFlow] = await Promise.all([
            lifecycle.continue("production-v2", "explicit-continuation"),
            lifecycle.continue("production-v2", "explicit-continuation"),
          ]);
          assert.equal(repeatedFlow, nextFlow);
          assert.equal((await f.db.collection("consumptionWorkflows").findOne({ _id: paid.workflowId as never }))!.state, "finished");
          assert.equal(await lifecycle.continue("production-v2", "explicit-continuation"), nextFlow);
          await assert.rejects(lifecycle.continue("production-v2", "another-unbound-continuation"), /Unbound/);
          const successor = await enqueueBookletRun(f.db, actor, "production-v2", {
            ...input,
            key: "v2-continuation",
            workflowId: nextFlow,
            predecessorId: admitted.attemptId,
          });
          assert.equal(successor.id, admitted.id);
          assert.equal(await lifecycle.continue("production-v2", "explicit-continuation"), nextFlow);
          assert.equal((await f.db.collection("consumptionWorkflows").findOne({ _id: nextFlow as never }))!.state, "active");
          const nextJob = await f.db
            .collection("aiJobs")
            .findOne({ _id: successor.attemptId as never });
          assert.equal(nextJob!.run.attempt, 2);
          assert.equal(nextJob!.credits, 0);
          const activeProduction = await f.v2.getProduction("production-v2");
          const activeRevision = { requestId: "active-revision", category: "story" as const, subjects: [],
            inputHash: fingerprint("premature revision"), expectedVersion: activeProduction.version };
          const activeQuote = await lifecycle.quoteRevision("production-v2", activeRevision);
          await assert.rejects(lifecycle.startRevision("production-v2", activeRevision, activeQuote.hash, activeQuote.credits), /Reconcile/);
          assert.equal(
            await f.db
              .collection("consumptionCharges")
              .countDocuments({ orderId: "order-v2" }),
            1,
          );
          const after = await f.v2.getProduction("production-v2");
          assert.equal(after.documentVersion, 2);
          assert.deepEqual(after.retryPolicy, before.retryPolicy);
          assert.deepEqual(after.checkpoint, before.checkpoint);
          assert.deepEqual(after.subjects, before.subjects);
          assert.equal(after.version, before.version + 3);
          await f.db.collection("aiJobs").updateOne(
            { _id: successor.attemptId as never },
            { $set: { status: "failed", terminationEvidence: "provider-failed" } },
          );
          const revisionRequest = {
            requestId: "story-revision", category: "story" as const, subjects: [],
            inputHash: fingerprint("revised brief"), expectedVersion: after.version,
          };
          const quote = await lifecycle.quoteRevision("production-v2", revisionRequest);
          assert.equal(quote.credits, 0);
          await assert.rejects(lifecycle.quoteRevision("production-v2", {
            ...revisionRequest, expectedVersion: after.version + 1,
          }), /changed/);
          await assert.rejects(lifecycle.quoteRevision("production-v2", {
            ...revisionRequest, subjects: ["book-subject"],
          }), /one round/);
          await assert.rejects(lifecycle.startRevision("production-v2", revisionRequest, quote.hash, 1), /quote/);
          const revisionFlow = await lifecycle.startRevision("production-v2", revisionRequest, quote.hash, quote.credits);
          assert.equal((await f.db.collection("consumptionWorkflows").findOne({ _id: nextFlow as never }))!.state, "finished");
          assert.equal(await lifecycle.startRevision("production-v2", revisionRequest, quote.hash, quote.credits), revisionFlow);
          assert.equal(await lifecycle.continue("production-v2", "explicit-continuation"), nextFlow);
          assert.equal((await f.db.collection("consumptionOrders").findOne({ _id: "order-v2" as never }))!.activeWorkflow, revisionFlow);
          const revised = await f.v2.getProduction("production-v2");
          assert.equal(revised.revisionChargeId, revisionFlow);
          assert.deepEqual(revised.checkpoint, before.checkpoint);
          assert.equal(await f.db.collection("consumptionAllocations").countDocuments({ orderId: "order-v2" }), 1);
          await f.db.collection("bookletProductions").updateOne(
            { _id: "production-v2" as never },
            { $set: { "stageLocks.story": { operationId: "downstream", lockedAt: new Date(), sourceRevisionIds: [] } } },
          );
          await assert.rejects(lifecycle.quoteRevision("production-v2", {
            ...revisionRequest, requestId: "locked-revision", expectedVersion: revised.version,
          }), /locked/);
          await f.db
            .collection("orchestrators")
            .updateOne(
              { _id: definition.id as never },
              { $set: { "definition.domainAdapter.version": "1" } },
            );
          await assert.rejects(
            enqueueBookletRun(f.db, actor, "production-v2", {
              ...input,
              key: "wrong-version",
            }),
            /validated booklet/,
          );
        } finally {
          if (oldMode === undefined) delete process.env.DIFY_MODE;
          else process.env.DIFY_MODE = oldMode;
        }
      },
    );
    await t.test("worker readback is bounded, leased and preserves unresolved liability after stopping", async () => {
      const f = await managerFixture(), now = new Date();
      const production = await f.v2.getProduction("production-v2");
      const nativeId = crypto.randomUUID(), workflowId = crypto.randomUUID();
      const job = { _id: "readback-manager", uid: actor.uid, status: "cancelled", cancelRequested: true,
        runId: nativeId, execution: { runId: nativeId, workflowId, status: "stopped" },
        reviewAfter: new Date(now.getTime() + 3600000), run: { logicalId: "readback-logical",
          target: { adapter: "booklet", version: "2", kind: "booklet-production", id: production._id },
          orchestrator: { workflowId }, retryBaseSeconds: 2, retryMaxSeconds: 60, pollSeconds: 5 } };
      await f.db.collection("aiJobs").insertOne(job as never);
      // Admission revocation/cancellation must not prevent retaining already paid results.
      await f.db.collection("consumptionOrders").updateOne({ _id: production.orderId as never }, { $set: { "value.state": "revoked" } });
      const records = f.db.collection("bookletWork");
      const seed = async (callId: string) => {
        const request = { invocationId: callId, callId, service: "manuscript", operation: "write", items: [{ itemId: "only" }] };
        const row = workV2Schema.parse({ _id: fingerprint(callId), documentVersion: 2, ownerId: actor.uid,
          productionId: production._id, callId, runId: job._id, actionKey: fingerprint(["action", callId]),
          requestHash: fingerprint(request), requestPayload: request, service: "manuscript", operation: "write", category: "paidLlm",
          targetIds: ["story-v2"], sources: [f.source], status: "dispatching", retryOrdinal: 0,
          correctionRootId: fingerprint(["root", callId]), retryable: false, evidenceIds: [], createdAt: now, updatedAt: now });
        await records.insertOne(row as never);
        return row;
      };
      const read = async (callId: string) => (await records.findOne({ callId }))!;
      const execution: ProviderExecution = { runId: nativeId, workflowId, status: "running", outputs: null,
        usage: { scope: "execution", id: nativeId, inputTokens: null, outputTokens: null, totalTokens: null, elapsedMs: null, cost: null } };
      let reads = 0;
      const failure = { execution: async () => { reads++; return { kind: "unknown" as const, failure: "timeout" as const }; } };
      assert.equal(await reconcileOneBookletWorkV2(f.db, now, failure), false);
      await seed("exhaust");
      assert.equal(await reconcileOneBookletWorkV2(f.db, now, failure), true);
      assert.equal((await read("exhaust")).reconciliation.failedReads, 1);
      assert.ok((await read("exhaust")).reconciliation.nextAt.getTime() >= now.getTime() + 2000);
      assert.equal(await reconcileOneBookletWorkV2(f.db, now, failure), false);
      // A successful active read does not reset the episode's previous failure count.
      await reconcileOneBookletWorkV2(f.db, (await read("exhaust")).reconciliation.nextAt,
        { execution: async () => ({ kind: "ok", value: execution }), trace: async () => [] });
      assert.equal((await read("exhaust")).reconciliation.failedReads, 1);
      for (let n = 2; n <= 4; n++) {
        const eligible = (await read("exhaust")).reconciliation.nextAt;
        await reconcileOneBookletWorkV2(f.db, eligible, n === 2 ? { execution: async () => {
          reads++; return { kind: "rejected", failure: "rate-limit", retryAfterMs: 1000000 };
        } } : failure);
        assert.equal((await read("exhaust")).reconciliation.failedReads, n);
        if (n === 2) assert.equal((await read("exhaust")).reconciliation.nextAt.getTime() - eligible.getTime(), 60000);
      }
      const exhausted = await read("exhaust");
      assert.equal(reads, 4);
      assert.equal(exhausted.reconciliation.nextAt, null);
      assert.equal(exhausted.reconciliation.reason, "read_retries_exhausted");
      assert.equal(exhausted.status, "dispatching");
      assert.equal(exhausted.retryable, false);
      assert.equal(await reconcileOneBookletWorkV2(f.db, new Date(now.getTime() + 60000), failure), false);
      const late = await seed("late");
      const result = { contractVersion: 2, invocationId: late.callId, callId: late.callId, service: "manuscript", operation: "write",
        status: "succeeded", items: [{ itemId: "only", status: "succeeded", exact: "  e\u0301 مرحبا 😀\n" }] };
      const node: ProviderNodeObservation = { runId: nativeId, id: "late-node", nodeId: "child-manuscript", nodeType: "tool",
        status: "succeeded", retryIndex: null, iterationId: null, loopId: null, outputs: { result: JSON.stringify(result) },
        outputsTruncated: false, error: null, executionMetadata: null };
      let release!: () => void, started!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      const claimed = new Promise<void>((resolve) => { started = resolve; });
      const first = reconcileOneBookletWorkV2(f.db, now, { execution: async () => {
        started(); await waiting; return { kind: "ok", value: { ...execution, status: "stopped" } };
      }, trace: async () => [
        { type: "node-observation", node: { ...node, id: "another-call", outputs: { result: JSON.stringify({ ...result, invocationId: "exhaust", callId: "exhaust" }) } } },
        { type: "node-observation", node },
      ] });
      await claimed;
      try { assert.equal(await reconcileOneBookletWorkV2(f.db, now, failure), false); } finally { release(); }
      await first;
      const retained = await read("late");
      assert.deepEqual(retained.resultPayload, result);
      assert.equal((await read("exhaust")).resultPayload, undefined); // This pass owns only its selected call.
      assert.equal(retained.reconciliation.reason, "result_retained");
      assert.equal(retained.reconciliation.nextAt, null);
      assert.equal(await records.countDocuments(), 2); // No retry/successor action was created.
      assert.deepEqual(await f.db.collection("aiJobs").findOne({ _id: job._id as never }), job);
      assert.equal((await f.v2.getProduction(production._id)).version, production.version);
      assert.equal(await f.db.collection("executionEvidence").countDocuments({ operationId: "exhaust" }), 5);
      // A stale worker cannot retain a result after losing its short readback claim.
      const stale = await seed("stale");
      await reconcileOneBookletWorkV2(f.db, now, { execution: async () => {
        await records.updateOne({ _id: stale._id as never }, { $set: { "reconciliation.leaseUntil": new Date(0) } });
        return { kind: "ok", value: execution };
      }, trace: async () => [{ type: "node-observation", node: { ...node, outputs: { result: JSON.stringify({ ...result, invocationId: stale.callId, callId: stale.callId }) } } }] });
      assert.equal((await read("stale")).resultPayload, undefined);
      const staleResult = { ...result, invocationId: stale.callId, callId: stale.callId };
      await reconcileOneBookletWorkV2(f.db, now, { execution: async () => ({ kind: "ok", value: execution }),
        trace: async () => [{ type: "node-observation", node: { ...node, id: "stale-node",
          outputs: { result: JSON.stringify(staleResult) } } }] });
      assert.deepEqual((await read("stale")).resultPayload, staleResult);
      assert.equal((await read("stale")).reconciliation.leaseId, null);
      await seed("credentials");
      await reconcileOneBookletWorkV2(f.db, now, { execution: async () => ({ kind: "rejected", failure: "authentication" }) });
      assert.equal((await read("credentials")).reconciliation.reason, "read_non_retriable");
      assert.equal((await read("credentials")).reconciliation.nextAt, null);
      await seed("deadline");
      await f.db.collection("aiJobs").updateOne({ _id: job._id as never }, { $set: { reviewAfter: new Date(now.getTime() - 1) } });
      await reconcileOneBookletWorkV2(f.db, now, failure);
      assert.equal((await read("deadline")).reconciliation.reason, "reconciliation_deadline");
      const missing = await seed("missing-identity");
      await records.updateOne({ _id: missing._id as never }, { $set: { runId: "missing-manager" } });
      await reconcileOneBookletWorkV2(f.db, now, failure);
      assert.equal((await read("missing-identity")).reconciliation.reason, "native_identity_pending");
      assert.equal((await read("missing-identity")).reconciliation.nextAt, null);
      assert.equal(reads, 4); // Deadline handling performs no provider request.
      // Explicit trusted readback can still retain a late result after automatic
      // checks exhaust, without granting or resetting an action retry allowance.
      const exhaustedResult = { ...result, invocationId: "exhaust", callId: "exhaust" };
      await reconcileBookletWorkV2(f.db, actor, production._id, "exhaust", AbortSignal.timeout(5000), {
        execution: async () => ({ kind: "ok", value: execution }), trace: async () => [{ type: "node-observation",
          node: { ...node, id: "exhausted-late", outputs: { result: JSON.stringify(exhaustedResult) } } }],
      });
      assert.deepEqual((await read("exhaust")).resultPayload, exhaustedResult);
      assert.equal((await read("exhaust")).reconciliation.failedReads, 4);
      assert.equal((await read("exhaust")).retryable, false);
      await f.db.collection("aiJobs").updateOne({ _id: job._id as never }, { $set: { reviewAfter: job.reviewAfter } });
      await f.db.collection("bookletProductions").updateOne({ _id: production._id as never }, { $set: { "retryPolicy.nonPaid": 0 } });
      await seed("no-read-retries");
      await reconcileOneBookletWorkV2(f.db, now, failure);
      assert.equal((await read("no-read-retries")).reconciliation.failedReads, 1);
      assert.equal((await read("no-read-retries")).reconciliation.nextAt, null);
      assert.equal(reads, 5);
      assert.equal(bookletsServerExtension.reconcile, reconcileOneBookletWorkV2);
    });
    await t.test(
      "v2 work state preserves unknown outcomes and enforces retries across runs",
      async () => {
        const f = await managerFixture();
        const registration = {
          callId: "call-0",
          runId: "run-1",
          actionKey: fingerprint("same-action"),
          requestHash: fingerprint("request-0"),
          service: "manuscript" as const,
          operation: "write",
          category: "paidLlm" as const,
          targetIds: ["story-v2"],
          sources: [f.source],
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...registration }),
        );
        await f.write((m) =>
          f.v2.dispatchWork("production-v2", {
            ...m,
            callId: registration.callId,
            requestHash: registration.requestHash,
          }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId: registration.callId,
              requestHash: registration.requestHash,
            }),
          ),
          /already dispatched/,
        );
        await f.write((m) =>
          f.v2.recordWorkOutcome("production-v2", {
            ...m,
            callId: "call-0",
            status: "unknown",
            retryable: false,
            evidenceIds: ["timeout-evidence"],
          }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...registration,
              callId: "unsafe-replay",
              retryOf: "call-0",
              runId: "new-run",
            }),
          ),
          /reconcile/,
        );
        assert.equal(
          (
            await bookletRepositoryV2(f.db, actor, f.now).getWork(
              "production-v2",
              "call-0",
            )
          ).status,
          "unknown",
        );
        await f.write((m) =>
          f.v2.recordWorkOutcome("production-v2", {
            ...m,
            callId: "call-0",
            status: "failed",
            retryable: true,
            evidenceIds: ["confirmed-failure"],
          }),
        );
        for (let n = 1; n <= 2; n++) {
          const retry = {
            ...registration,
            callId: "call-" + n,
            retryOf: "call-" + (n - 1),
            runId: "run-" + (n + 1),
            requestHash: fingerprint("request-" + n),
          };
          await f.write((m) =>
            f.v2.registerWork("production-v2", { ...m, ...retry }),
          );
          await f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId: retry.callId,
              requestHash: retry.requestHash,
            }),
          );
          await f.write((m) =>
            f.v2.recordWorkOutcome("production-v2", {
              ...m,
              callId: retry.callId,
              status: "failed",
              retryable: true,
              evidenceIds: ["failure-" + n],
            }),
          );
        }
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...registration,
              callId: "exhausted",
              retryOf: "call-2",
              runId: "fresh-run",
            }),
          ),
          /allowance exhausted/,
        );
        assert.equal(await f.db.collection("bookletWork").countDocuments(), 3);
        assert.equal(
          (await f.v2.getWork("production-v2", "call-2")).retryOrdinal,
          2,
        );
        assert.deepEqual(
          (await f.v2.getWork("production-v2", "call-0")).evidenceIds,
          ["timeout-evidence", "confirmed-failure"],
        );
        await assert.rejects(
          bookletRepositoryV2(
            f.db,
            { uid: "other", authTime: 1 },
            f.now,
          ).getWork("production-v2", "call-0"),
        );
        const image = {
          ...registration,
          callId: "image",
          actionKey: fingerprint("image-action"),
          service: "image-executor" as const,
          operation: "generate",
          category: "paidImage" as const,
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...image }),
        );
        await f.write((m) =>
          f.v2.dispatchWork("production-v2", {
            ...m,
            callId: image.callId,
            requestHash: image.requestHash,
          }),
        );
        await f.write((m) =>
          f.v2.recordWorkOutcome("production-v2", {
            ...m,
            callId: image.callId,
            status: "failed",
            retryable: true,
            evidenceIds: ["image-failure"],
          }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...image,
              callId: "image-retry",
              retryOf: "image",
            }),
          ),
          /allowance exhausted/,
        );
        const nonPaid = {
          ...registration,
          callId: "local-0",
          actionKey: fingerprint("local-action"),
          service: "image-executor" as const,
          operation: "prepare",
          category: "nonPaid" as const,
        };
        for (let n = 0; n <= 3; n++) {
          const callId = "local-" + n;
          await f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...nonPaid,
              callId,
              retryOf: n ? "local-" + (n - 1) : null,
            }),
          );
          await f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId,
              requestHash: nonPaid.requestHash,
            }),
          );
          await f.write((m) =>
            f.v2.recordWorkOutcome("production-v2", {
              ...m,
              callId,
              status: "failed",
              retryable: true,
              evidenceIds: ["local-failure-" + n],
            }),
          );
        }
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...nonPaid,
              callId: "local-4",
              retryOf: "local-3",
            }),
          ),
          /allowance exhausted/,
        );
        assert.equal(
          (await f.v2.getWork("production-v2", "local-3")).retryOrdinal,
          3,
        );
      },
    );
    await t.test(
      "correction allowances survive invocation changes and exclude technical retries",
      async () => {
        const f = await managerFixture();
        const initial = {
          callId: "initial",
          runId: "run-initial",
          actionKey: fingerprint("initial"),
          requestHash: fingerprint("initial-request"),
          service: "manuscript" as const,
          operation: "write",
          category: "paidLlm" as const,
          targetIds: ["story-v2", "book-subject"],
          sources: [f.source],
        };
        async function dispatch(
          registration: Omit<
            Parameters<typeof f.v2.registerWork>[1],
            keyof Mutation
          >,
        ) {
          await f.write((m) =>
            f.v2.registerWork("production-v2", { ...m, ...registration }),
          );
          await f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId: registration.callId,
              requestHash: registration.requestHash,
            }),
          );
        }
        async function outcome(
          callId: string,
          status: "succeeded" | "failed",
          retryable = false,
        ) {
          await f.write((m) =>
            f.v2.recordWorkOutcome("production-v2", {
              ...m,
              callId,
              status,
              retryable,
              evidenceIds: ["observed-" + callId],
            }),
          );
        }
        await dispatch(initial);
        await outcome(initial.callId, "succeeded");
        const rootId = (await f.v2.getWork("production-v2", initial.callId))
          .correctionRootId;
        const disguised = {
          ...initial,
          callId: "disguised-initial",
          actionKey: fingerprint("disguised-initial"),
          requestHash: fingerprint("changed-creative-request"),
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...disguised }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId: disguised.callId,
              requestHash: disguised.requestHash,
            }),
          ),
          /Correction metadata required/,
        );
        const separateTask = {
          ...initial,
          callId: "reconcile-cast",
          operation: "reconcile_characters",
          actionKey: fingerprint("reconcile-cast"),
        };
        await dispatch(separateTask);
        await outcome(separateTask.callId, "succeeded");
        const review = {
          ...initial,
          callId: "review",
          actionKey: fingerprint("review"),
          service: "quality-reviewer" as const,
          operation: "text",
          reviewScope: {
            targetHash: f.revision.contentHash,
            referencePositions: [],
          },
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...review }),
        );
        await f.write((m) =>
          f.v2.dispatchWork("production-v2", {
            ...m,
            callId: review.callId,
            requestHash: review.requestHash,
          }),
        );
        await outcome(review.callId, "succeeded");
        await f.write((m) =>
          f.v2.recordAssessment("production-v2", {
            ...m,
            callId: review.callId,
            policyBinding: "policy",
            reviewerBinding: "reviewer",
            evidenceIds: ["observed-review"],
            assessment: {
              mode: "text",
              targetHash: f.revision.contentHash,
              requestHash: null,
              sources: [f.source],
              coverage: {
                targetIds: initial.targetIds,
                referencePositions: [],
              },
              disposition: "repair",
              findings: [
                {
                  id: "missing-text",
                  criterion: "lettering",
                  classification: "confirmed",
                  targetId: "story-v2",
                  expected: "Exact text",
                  observed: "Text omitted",
                },

                {
                  id: "book-defect",
                  criterion: "lettering",
                  classification: "confirmed",
                  targetId: "book-subject",
                  expected: "Exact text",
                  observed: "Text omitted",
                },
              ],
              limitations: [],
            },
          }),
        );
        const correction = {
          rootId,
          family: "llm" as const,
          findingIds: ["missing-text", "book-defect"],
        };
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...initial,
              callId: "reset-root",
              actionKey: fingerprint("reset"),
              correction: { ...correction, rootId: "a".repeat(64) },
            }),
          ),
          /identity changed/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...initial,
              callId: "invented-finding",
              actionKey: fingerprint("invented"),
              correction: { ...correction, findingIds: ["invented"] },
            }),
          ),
          /confirmed findings/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.registerWork("production-v2", {
              ...m,
              ...initial,
              callId: "uncovered-target",
              actionKey: fingerprint("uncovered-target"),
              correction: { ...correction, findingIds: ["missing-text"] },
            }),
          ),
          /every target/,
        );
        for (let n = 1; n <= 4; n++) {
          // Independent target repairs do not spend each other's allowance.
          const targetIds =
            n === 1
              ? ["story-v2"]
              : n === 2
                ? ["book-subject"]
                : initial.targetIds;
          const attempt = {
            ...initial,
            callId: "correction-" + n,
            runId: "fresh-run-" + n,
            actionKey: fingerprint("corrective-action-" + n),
            requestHash: fingerprint("corrective-request-" + n),
            targetIds,
            correction: {
              ...correction,
              rootId: fingerprint([
                "production-v2",
                "manuscript",
                "write",
                [...targetIds].sort(),
                "platform",
              ]),
              findingIds:
                n === 1
                  ? ["missing-text"]
                  : n === 2
                    ? ["book-defect"]
                    : correction.findingIds,
            },
          };
          await dispatch(attempt);
          if (n === 1) {
            await outcome(attempt.callId, "failed", true);
            const retry = {
              ...attempt,
              callId: "technical-retry",
              retryOf: attempt.callId,
              requestHash: fingerprint("retry-envelope"),
            };
            await dispatch(retry);
            await outcome(retry.callId, "succeeded");
          } else await outcome(attempt.callId, "succeeded");
          assert.equal(
            (await f.v2.getCorrection("production-v2", rootId)).used,
            Math.max(1, n - 1),
          );
        }
        const exhausted = {
          ...initial,
          callId: "fourth-correction",
          runId: "yet-another-run",
          actionKey: fingerprint("fourth"),
          requestHash: fingerprint("fourth-request"),
          correction,
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...exhausted }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId: exhausted.callId,
              requestHash: exhausted.requestHash,
            }),
          ),
          /Correction allowance exhausted/,
        );
        assert.deepEqual(
          await bookletRepositoryV2(f.db, actor, f.now).getCorrection(
            "production-v2",
            rootId,
          ),
          {
            rootId,
            family: "llm",
            targetIds: initial.targetIds,
            used: 3,
            limit: 3,
          },
        );
        assert.equal(
          (await f.v2.getWork("production-v2", exhausted.callId)).status,
          "registered",
        );
        {
          const operation = initial.operation;
          const subset = {
            ...initial,
            callId: "subset-" + operation,
            operation,
            actionKey: fingerprint("subset-" + operation),
            targetIds: ["story-v2"],
            correction: {
              ...correction,
              rootId: fingerprint([
                "production-v2",
                "manuscript",
                operation,
                ["story-v2"],
                "platform",
              ]),
              findingIds: ["missing-text"],
            },
          };
          await f.write((m) =>
            f.v2.registerWork("production-v2", { ...m, ...subset }),
          );
          await assert.rejects(
            f.write((m) =>
              f.v2.dispatchWork("production-v2", {
                ...m,
                callId: subset.callId,
                requestHash: subset.requestHash,
              }),
            ),
            /Correction allowance exhausted/,
          );
          assert.equal(
            (
              await f.v2.getCorrection(
                "production-v2",
                subset.correction.rootId,
              )
            ).used,
            3,
          );
        }
        const image = {
          ...initial,
          targetIds: ["story-v2"],
          callId: "image-initial",
          actionKey: fingerprint("image-initial"),
          service: "image-executor" as const,
          operation: "generate",
          category: "paidImage" as const,
        };
        await dispatch(image);
        await outcome(image.callId, "succeeded");
        const imageRoot = (await f.v2.getWork("production-v2", image.callId))
          .correctionRootId;
        const imageCorrection = {
          ...image,
          callId: "image-correction-1",
          actionKey: fingerprint("image-correction-1"),
          correction: {
            rootId: imageRoot,
            family: "image" as const,
            findingIds: ["missing-text"],
          },
        };
        await dispatch(imageCorrection);
        await outcome(imageCorrection.callId, "failed", true);
        assert.deepEqual(await f.v2.getCorrection("production-v2", imageRoot), {
          rootId: imageRoot,
          family: "image",
          targetIds: ["story-v2"],
          used: 1,
          limit: 1,
        });
        const extraImage = {
          ...imageCorrection,
          callId: "image-correction-2",
          actionKey: fingerprint("image-correction-2"),
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...extraImage }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.dispatchWork("production-v2", {
              ...m,
              callId: extraImage.callId,
              requestHash: extraImage.requestHash,
            }),
          ),
          /Correction allowance exhausted/,
        );
        // The financial lifecycle has separate integration tests. These stored receipt
        // fixtures isolate how work scopes survive successive purchased revisions.
        for (const funding of ["customer-revision-1", "customer-revision-2"]) {
          await f.db
            .collection<{
              _id: string;
              uid: string;
              orderId: string;
              kind: string;
            }>("consumptionCharges")
            .insertOne({
              _id: funding,
              uid: actor.uid,
              orderId: "order-v2",
              kind: "revision",
            });
          await f.db
            .collection<{ _id: string; revisionChargeId: string }>(
              "bookletProductions",
            )
            .updateOne(
              { _id: "production-v2" },
              { $set: { revisionChargeId: funding } },
            );
          const fresh = {
            ...initial,
            callId: funding,
            actionKey: fingerprint(funding),
          };
          await dispatch(fresh);
          await outcome(fresh.callId, "succeeded");
          assert.equal(
            (await f.v2.getCorrection("production-v2", rootId)).used,
            3,
          );
          if (funding === "customer-revision-1") {
            const paidRoot = (await f.v2.getWork("production-v2", fresh.callId))
              .correctionRootId;
            const repair = {
              ...fresh,
              callId: "paid-repair",
              actionKey: fingerprint("paid-repair"),
              correction: { ...correction, rootId: paidRoot },
            };
            await dispatch(repair);
            await outcome(repair.callId, "succeeded");
          } else {
            const paidRoot = (
              await f.v2.getWork("production-v2", "customer-revision-1")
            ).correctionRootId;
            assert.equal(
              (await f.v2.getCorrection("production-v2", paidRoot)).used,
              1,
            );
            await assert.rejects(
              f.write((m) =>
                f.v2.dispatchWork("production-v2", {
                  ...m,
                  callId: exhausted.callId,
                  requestHash: exhausted.requestHash,
                }),
              ),
              /funding identity changed/,
            );
          }
        }
      },
    );
    await t.test(
      "v2 assessments are repeatable and Manager acceptance is distinct from human/quality policy",
      async () => {
        const f = await managerFixture();
        const selection = {
          runId: "manager-run",
          revisionId: f.revision._id,
          contentHash: f.revision.contentHash,
          targetIds: ["story-v2"],
          assetIds: [],
          evidenceIds: [],
        };
        const accepted = await f.write((m) =>
          f.v2.recordAcceptance("production-v2", { ...m, ...selection }),
        );
        assert.ok(accepted.acceptanceId);
        assert.equal(
          (await f.v2.getProduction("production-v2")).subjects[0].artifacts[0]
            .acceptedRevisionId,
          f.revision._id,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAcceptance("production-v2", {
              ...m,
              ...selection,
              targetIds: ["story-v2", "foreign"],
            }),
          ),
          /identity mismatch/,
        );
        const review = {
          callId: "review-1",
          runId: "review-run",
          actionKey: fingerprint("review-action"),
          requestHash: fingerprint("review-request"),
          service: "quality-reviewer" as const,
          operation: "text",
          category: "paidLlm" as const,
          targetIds: ["story-v2"],
          sources: [f.source],
          reviewScope: {
            targetHash: f.revision.contentHash,
            referencePositions: [],
          },
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...review }),
        );
        await f.write((m) =>
          f.v2.dispatchWork("production-v2", {
            ...m,
            callId: review.callId,
            requestHash: review.requestHash,
          }),
        );
        const assessment = {
          mode: "text" as const,
          targetHash: f.revision.contentHash,
          requestHash: null,
          sources: [f.source],
          coverage: { targetIds: ["story-v2"], referencePositions: [] },
          disposition: "pass" as const,
          findings: [],
          limitations: [],
        };
        const result = {
          callId: review.callId,
          policyBinding: "policy-1",
          reviewerBinding: "reviewer-1",
          assessment,
          evidenceIds: ["trusted-review-evidence"],
        };
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAssessment("production-v2", { ...m, ...result }),
          ),
          /observed review/,
        );
        await f.write((m) =>
          f.v2.recordWorkOutcome("production-v2", {
            ...m,
            callId: review.callId,
            status: "succeeded",
            retryable: false,
            evidenceIds: ["trusted-review-evidence"],
          }),
        );
        await f.write((m) =>
          f.v2.recordAssessment("production-v2", { ...m, ...result }),
        );
        await f.write((m) =>
          f.v2.recordAssessment("production-v2", { ...m, ...result }),
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAssessment("production-v2", {
              ...m,
              ...result,
              assessment: {
                ...assessment,
                coverage: { targetIds: [], referencePositions: [] },
              },
            }),
          ),
          /omitted inspected scope/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAssessment("production-v2", {
              ...m,
              ...result,
              assessment: {
                ...assessment,
                disposition: "inconclusive",
                coverage: {
                  targetIds: ["story-v2", "book-subject"],
                  referencePositions: [],
                },
              },
            }),
          ),
          /unobserved coverage/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAssessment("production-v2", {
              ...m,
              ...result,
              assessment: {
                ...assessment,
                disposition: "inconclusive",
                coverage: { targetIds: ["story-v2"], referencePositions: [0] },
              },
            }),
          ),
          /unobserved coverage/,
        );
        assert.equal(
          await f.db.collection("bookletAssessments").countDocuments({
            "assessment.targetHash": f.revision.contentHash,
            complete: true,
          }),
          2,
        );
        assert.equal(
          await f.db.collection("bookletAcceptances").countDocuments(),
          1,
        );
        assert.equal(
          await f.db.collection("bookletQualityReviews").countDocuments(),
          0,
        );
        assert.equal(await f.db.collection("runDecisions").countDocuments(), 0);
        const wholeScope = {
          targetHash: fingerprint("manifest-window"),
          referencePositions: [0],
          assetIds: ["original-1"],
          continuityPairs: [["page-1", "page-2"]],
        };
        const whole = {
          ...review,
          callId: "whole-review",
          actionKey: fingerprint("whole-review-action"),
          requestHash: fingerprint("whole-review-request"),
          operation: "whole_book",
          reviewScope: wholeScope,
        };
        await f.write((m) =>
          f.v2.registerWork("production-v2", { ...m, ...whole }),
        );
        await f.write((m) =>
          f.v2.dispatchWork("production-v2", {
            ...m,
            callId: whole.callId,
            requestHash: whole.requestHash,
          }),
        );
        await f.write((m) =>
          f.v2.recordWorkOutcome("production-v2", {
            ...m,
            callId: whole.callId,
            status: "succeeded",
            retryable: false,
            evidenceIds: ["whole-observation"],
          }),
        );
        const wholeBody = {
          ...assessment,
          mode: "whole_book" as const,
          targetHash: wholeScope.targetHash,
          coverage: {
            targetIds: whole.targetIds,
            referencePositions: [0],
            assetIds: ["original-1"],
            continuityPairs: [] as string[][],
          },
        };
        const wholeResult = {
          ...result,
          callId: whole.callId,
          assessment: wholeBody,
          evidenceIds: ["whole-observation"],
        };
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAssessment("production-v2", { ...m, ...wholeResult }),
          ),
          /omitted inspected scope/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAssessment("production-v2", {
              ...m,
              ...wholeResult,
              assessment: {
                ...wholeBody,
                disposition: "inconclusive",
                coverage: {
                  ...wholeBody.coverage,
                  assetIds: ["unseen-original"],
                },
              },
            }),
          ),
          /unobserved coverage/,
        );
        await f.write((m) =>
          f.v2.recordAssessment("production-v2", {
            ...m,
            ...wholeResult,
            assessment: {
              ...wholeBody,
              coverage: {
                ...wholeBody.coverage,
                continuityPairs: wholeScope.continuityPairs,
              },
            },
          }),
        );
        assert.equal(
          await f.db
            .collection("bookletAssessments")
            .countDocuments({ callId: whole.callId, complete: true }),
          1,
        );
        await bookletsServerExtension
          .migrations!.find((m) => m.id === "booklets:0004-manager-state")!
          .run(f.db);
        assert.equal(await f.db.collection("bookletWork").countDocuments(), 2);
      },
    );
    await t.test(
      "atomic v2 gateway writes release fences without holding leases across calls",
      async () => {
        const f = await managerFixture();
        const gateway = bookletRepositoryV2(f.db, actor, f.now, {
          atomicMutations: true,
        });
        const held = await f.v2.getProduction("production-v2");
        const checkpoint = {
          key: "atomic-checkpoint",
          holderId: "worker",
          expectedVersion: held.version,
          fence: held.fenceCounter,
          expectedCheckpointVersion: 0,
          state: { pending: "action" },
        };
        await assert.rejects(
          gateway.checkpoint(held._id, checkpoint),
          /production is leased/,
        );
        const released = await f.write((m) => f.v2.releaseLease(held._id, m));
        const input = { ...checkpoint, expectedVersion: released.version };
        const saved = await gateway.checkpoint(held._id, input);
        assert.equal(saved.fence, held.fenceCounter + 1);
        let current = await gateway.getProduction(held._id);
        assert.equal(current.mutationLease, null);
        assert.equal(current.checkpointVersion, 1);
        assert.deepEqual(await gateway.checkpoint(held._id, input), saved);
        await assert.rejects(
          gateway.checkpoint(held._id, { ...input, state: null }),
          /Changed idempotency/,
        );
        const stale = {
          ...input,
          key: "stale-fence",
          expectedVersion: current.version,
          expectedCheckpointVersion: 1,
        };
        await assert.rejects(
          gateway.checkpoint(held._id, stale),
          /Mutation fence changed/,
        );
        await assert.rejects(
          gateway.addArtifact(held._id, {
            key: "invalid-artifact",
            holderId: "worker",
            expectedVersion: current.version,
            fence: current.fenceCounter,
            subjectId: "missing",
            artifactId: "invalid",
            kind: "outline",
          }),
        );
        assert.deepEqual(await gateway.getProduction(held._id), current);
        const race = await Promise.allSettled(
          ["left", "right"].map((key) =>
            gateway.checkpoint(held._id, {
              ...input,
              key,
              expectedVersion: current.version,
              fence: current.fenceCounter,
              expectedCheckpointVersion: 1,
              state: { winner: key },
            }),
          ),
        );
        assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
        current = await gateway.getProduction(held._id);
        assert.equal(current.fenceCounter, held.fenceCounter + 2);
        assert.equal(current.checkpointVersion, 2);
        assert.equal(current.mutationLease, null);
        // A lost tool reply remains replayable after subsequent writes and lease expiry.
        f.advance(400000);
        assert.deepEqual(await gateway.checkpoint(held._id, input), saved);
        assert.equal(
          (await gateway.getProduction(held._id)).version,
          current.version,
        );
        await f.db
          .collection<{ _id: string; lifecycleState: string }>(
            "bookletProductions",
          )
          .updateOne(
            { _id: held._id },
            { $set: { lifecycleState: "completed" } },
          );
        const terminal = await gateway.checkpoint(held._id, {
          ...input,
          key: "atomic-terminal",
          expectedVersion: current.version,
          fence: current.fenceCounter,
          expectedCheckpointVersion: 2,
          state: { phase: "complete" },
        });
        assert.equal(terminal.fence, current.fenceCounter + 1);
        assert.equal(
          (await gateway.getProduction(held._id)).mutationLease,
          null,
        );
      },
    );
    await t.test(
      "completed v2 productions retain only terminal checkpoint and lease metadata",
      async () => {
        const f = await managerFixture();
        // Completion facade is the next gateway slice; isolate its persisted state here.
        await f.db
          .collection<{ _id: string; lifecycleState: string }>(
            "bookletProductions",
          )
          .updateOne(
            { _id: "production-v2" },
            { $set: { lifecycleState: "completed" } },
          );
        const terminal = await f.write((m) =>
          f.v2.checkpoint("production-v2", {
            ...m,
            expectedCheckpointVersion: 0,
            state: { phase: "complete" },
          }),
        );
        assert.equal(terminal.checkpointVersion, 1);
        await assert.rejects(
          f.write((m) =>
            f.v2.addArtifact("production-v2", {
              ...m,
              subjectId: "book-subject",
              artifactId: "after-completion",
              kind: "outline",
            }),
          ),
          /not mutable/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.appendRevision("production-v2", {
              ...m,
              artifactId: "story-v2",
              content: { kind: "manuscript", units: [] },
              sources: [],
              assets: [],
              provenance: { runId: "run", operationId: "op", evidenceIds: [] },
            }),
          ),
          /not mutable/,
        );
        await assert.rejects(
          f.write((m) =>
            f.v2.recordAcceptance("production-v2", {
              ...m,
              runId: "run",
              revisionId: f.revision._id,
              contentHash: f.revision.contentHash,
              targetIds: ["story-v2"],
              assetIds: [],
              evidenceIds: [],
            }),
          ),
          /not mutable/,
        );
        const released = await f.write((m) =>
          f.v2.releaseLease("production-v2", m),
        );
        const lease = await f.v2.acquireLease("production-v2", {
          key: "terminal-lease",
          holderId: "terminal-worker",
          expectedVersion: released.version,
          durationMs: 1000,
        });
        const next = {
          key: "terminal-checkpoint",
          holderId: "terminal-worker",
          fence: lease.fence!,
          expectedVersion: lease.version,
          expectedCheckpointVersion: 1,
          state: { phase: "complete", retained: true },
        };
        await assert.rejects(
          f.v2.checkpoint("production-v2", {
            ...next,
            key: "stale-fence",
            fence: lease.fence! - 1,
          }),
          /lease expired or changed/,
        );
        const saved = await f.v2.checkpoint("production-v2", next);
        assert.deepEqual(await f.v2.checkpoint("production-v2", next), saved);
        assert.equal(saved.fence, lease.fence);
        await f.v2.releaseLease("production-v2", {
          key: "terminal-release",
          holderId: next.holderId,
          fence: next.fence,
          expectedVersion: saved.version,
        });
        const current = await f.v2.getProduction("production-v2");
        assert.equal(current.lifecycleState, "completed");
        assert.equal(current.checkpointVersion, 2);
        assert.equal(current.mutationLease, null);
        await f.db
          .collection<{ _id: string; lifecycleState: string }>(
            "bookletProductions",
          )
          .updateOne(
            { _id: "production-v2" },
            { $set: { lifecycleState: "closed" } },
          );
        await assert.rejects(
          f.v2.acquireLease("production-v2", {
            key: "closed-lease",
            holderId: "terminal-worker",
            expectedVersion: current.version,
            durationMs: 1000,
          }),
          /not mutable/,
        );
      },
    );
    await t.test(
      "v2 creation and checkpoints preserve v1, ownership and durable CAS",
      async () => {
        const f = await fixture();
        const before = await f.db
          .collection("bookletProductions")
          .findOne({ orderId: "order" });
        const v2 = bookletRepositoryV2(f.db, actor, f.now);
        const order = structuredClone(f.order);
        order._id = "order-v2";
        order.value.id = "order-v2";
        order.value.targetId = "production-v2";
        await f.db
          .collection<typeof order>("consumptionOrders")
          .insertOne(order);
        const input = {
          ...f.creation,
          id: "production-v2",
          orderId: "order-v2",
          key: "create-v2",
        };
        assert.deepEqual(await v2.createProduction(input), {
          id: "production-v2",
          version: 1,
        });
        assert.deepEqual(await v2.createProduction(input), {
          id: "production-v2",
          version: 1,
        });
        await assert.rejects(
          v2.createProduction(input, { paidLlm: 1 }),
          /Changed production/,
        );
        const p = await v2.getProduction(input.id);
        assert.equal(p.documentVersion, 2);
        assert.deepEqual(p.retryPolicy, {
          paidLlm: 2,
          paidImage: 0,
          nonPaid: 3,
        });
        assert.equal(storedProductionSchema.parse(before).documentVersion, 1);
        assert.equal(storedProductionSchema.parse(p).documentVersion, 2);
        await assert.rejects(f.repo.getProduction(input.id));
        await assert.rejects(v2.getProduction("production"));
        await assert.rejects(
          bookletRepositoryV2(
            f.db,
            { uid: "other", authTime: 1 },
            f.now,
          ).getProduction(input.id),
        );
        const lease = await v2.acquireLease(input.id, {
          key: "lease-v2",
          holderId: "worker",
          expectedVersion: 1,
          durationMs: 10000,
        });
        assert.deepEqual(
          await v2.acquireLease(input.id, {
            key: "lease-v2",
            holderId: "worker",
            expectedVersion: 1,
            durationMs: 10000,
          }),
          lease,
        );
        const checkpoint = {
          key: "checkpoint-1",
          holderId: "worker",
          fence: lease.fence!,
          expectedVersion: lease.version,
          expectedCheckpointVersion: 0,
          state: {
            text: "  e\u0301 \ud83d\ude00\n",
            pending: { callId: "call-1" },
          },
        };
        const written = await v2.checkpoint(input.id, checkpoint);
        assert.deepEqual(await v2.checkpoint(input.id, checkpoint), written);
        await assert.rejects(
          v2.checkpoint(input.id, { ...checkpoint, state: null }),
          /Changed idempotency/,
        );
        const race = await Promise.allSettled(
          ["left", "right"].map((key) =>
            v2.checkpoint(input.id, {
              ...checkpoint,
              key,
              expectedVersion: written.version,
              expectedCheckpointVersion: 1,
              state: { winner: key },
            }),
          ),
        );
        assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
        const current = await v2.getProduction(input.id);
        assert.equal(current.checkpointVersion, 2);
        await assert.rejects(
          v2.checkpoint(input.id, {
            ...checkpoint,
            key: "oversize",
            expectedVersion: current.version,
            expectedCheckpointVersion: 2,
            state: "x".repeat(65536),
          }),
          /Checkpoint exceeds/,
        );
        assert.equal((await v2.getProduction(input.id)).checkpointVersion, 2);
        assert.equal(
          productionV2Schema.safeParse({
            ...current,
            checkpoint: "x".repeat(65536),
          }).success,
          false,
        );
        f.advance(20000);
        await assert.rejects(
          v2.releaseLease(input.id, {
            key: "expired",
            expectedVersion: current.version,
            holderId: "worker",
            fence: lease.fence!,
          }),
          /lease expired/,
        );
        assert.deepEqual(
          await f.db
            .collection("bookletProductions")
            .findOne({ orderId: "order" }),
          before,
        );
      },
    );
    await t.test(
      "v2 revisions preserve exact text, source hashes and atomic history",
      async () => {
        const f = await fixture();
        const v2 = bookletRepositoryV2(f.db, actor, f.now);
        const order = structuredClone(f.order);
        order._id = "order-v2";
        order.value.id = "order-v2";
        order.value.targetId = "production-v2";
        await f.db
          .collection<typeof order>("consumptionOrders")
          .insertOne(order);
        await v2.createProduction({
          ...f.creation,
          id: "production-v2",
          orderId: "order-v2",
          key: "create-v2",
        });
        const lease = await v2.acquireLease("production-v2", {
          key: "lease",
          holderId: "worker",
          expectedVersion: 1,
          durationMs: 10000,
        });
        let version = lease.version;
        let key = 0;
        const mutation = () => ({
          key: "write-" + ++key,
          expectedVersion: version,
          holderId: "worker",
          fence: lease.fence!,
        });
        version = (
          await v2.addSubject("production-v2", {
            ...mutation(),
            subject: {
              id: "book-subject",
              kind: "book",
              label: "Book",
              pageRole: null,
            },
          })
        ).version;
        version = (
          await v2.addArtifact("production-v2", {
            ...mutation(),
            subjectId: "book-subject",
            artifactId: "story-v2",
            kind: "manuscript",
          })
        ).version;
        const content = {
          kind: "manuscript" as const,
          units: [
            {
              id: "u1",
              action: "A wave",
              texts: [
                {
                  id: "t1",
                  kind: "dialogue",
                  text: "  e\u0301 \ud83d\ude00\n",
                },
              ],
            },
          ],
        };
        const value = {
          ...mutation(),
          artifactId: "story-v2",
          content,
          sources: [],
          assets: [],
          provenance: { operationId: "op", runId: "run", evidenceIds: [] },
        };
        const first = await v2.appendRevision("production-v2", value);
        version = first.version;
        assert.deepEqual(
          await v2.appendRevision("production-v2", value),
          first,
        );
        const stored = await v2.getRevision("production-v2", first.revisionId!);
        assert.deepEqual(stored.content, content);
        assert.equal(stored.contentHash, fingerprint(content));
        const source = {
          artifactId: "story-v2",
          revisionId: stored._id,
          contentHash: stored.contentHash,
        };
        await assert.rejects(
          v2.appendRevision("production-v2", {
            ...value,
            ...mutation(),
            sources: [{ ...source, contentHash: "b".repeat(64) }],
          }),
          /Source identity/,
        );
        const race = await Promise.allSettled(
          [1, 2].map(() =>
            v2.appendRevision("production-v2", {
              ...value,
              ...mutation(),
              sources: [source],
            }),
          ),
        );
        assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await f.db
            .collection("bookletRevisions")
            .countDocuments({ productionId: "production-v2" }),
          2,
        );
        assert.deepEqual(
          await v2.getRevision("production-v2", stored._id),
          stored,
        );
        assert.equal(
          (await v2.getProduction("production-v2")).subjects[0].artifacts[0]
            .acceptedRevisionId,
          null,
        );
        await assert.rejects(v2.getRevision("production-v2", "other"));
      },
    );
    await t.test(
      "migration is repeatable and leaves existing records untouched",
      async () => {
        const f = await fixture();
        await f.db.collection("artifacts").insertOne({ existing: true });
        await bookletsServerExtension.migrations![0].run(f.db);
        await bookletsServerExtension.migrations![0].run(f.db);
        assert.equal(await f.db.collection("artifacts").countDocuments(), 1);
        assert.equal(
          (await f.db.listCollections({ name: "bookletArtifacts" }).toArray())
            .length,
          0,
        );
        assert.ok(
          (await f.db.collection("bookletProductions").indexes()).some(
            (i) => i.unique && i.key.orderId === 1,
          ),
        );
      },
    );
    await t.test(
      "creation uses frozen owned order terms and is idempotent",
      async () => {
        const f = await fixture();
        assert.deepEqual(await f.repo.createProduction(f.creation), {
          id: "production",
          version: 1,
        });
        assert.equal((await f.repo.getBook("book")).version, 2);
        const p = await f.repo.getProduction("production");
        assert.equal(p.creativeConfigSnapshot.storyPages, fields.storyPages);
        assert.equal("credits" in p.creativeConfigSnapshot, false);
        assert.equal(p.createdAt, "2026-11-07T09:00:00.000Z");
        await assert.rejects(
          f.repo.createProduction({
            ...f.creation,
            brief: { ...brief, idea: "different" },
          }),
          /different input/,
        );
        await assert.rejects(
          f.repo.createProduction({
            ...f.creation,
            id: "foreign-target",
            key: "new",
          }),
          /not found/,
        );
        const foreign = bookletRepository(f.db, {
          uid: "foreign",
          authTime: 1,
        });
        await assert.rejects(
          foreign.createBook({ id: "book", title: "stolen", key: "new" }),
          /not found/,
        );
        await assert.rejects(foreign.getProduction("production"), /not found/);
        assert.deepEqual(await foreign.listBooks(), {
          items: [],
          cursor: null,
        });
        await f.db.collection("bookletBooks").updateOne(
          { ownerId: actor.uid },
          {
            $set: {
              "deletion.deletedAt": new Date(),
              "deletion.recoverUntil": new Date(),
            },
          },
        );
        await assert.rejects(f.repo.getProduction("production"), /not found/);
        await assert.rejects(f.repo.createProduction(f.creation), /not found/);
      },
    );
    await t.test(
      "caller transaction rollback includes creation and receipts",
      async () => {
        const f = await fixture();
        const session = client.startSession();
        try {
          await assert.rejects(
            f.repo.createBook(
              { id: "bad-session", title: "No", key: "k" },
              session,
            ),
            /active transaction/,
          );
          await assert.rejects(
            session.withTransaction(async () => {
              await f.repo.createBook(
                { id: "rolled-back", title: "Abort", key: "k" },
                session,
              );
              throw new Error("abort fixture");
            }),
            /abort fixture/,
          );
          assert.equal(
            await f.db
              .collection("bookletBooks")
              .countDocuments({ title: "Abort" }),
            0,
          );
          assert.equal(
            await f.db
              .collection("bookletRepositoryWrites")
              .countDocuments({ scope: "book:rolled-back" }),
            0,
          );
        } finally {
          await session.endSession();
        }
      },
    );
    await t.test(
      "duplicate nested identities, kinds and package limits reject atomically",
      async () => {
        const f = await fixture();
        await f.ready();
        const p = await f.repo.getProduction("production");
        await assert.rejects(
          f.repo.addSubject("production", {
            ...f.mutation(),
            subject: {
              id: "book-subject",
              kind: "book",
              label: "duplicate",
              pageRole: null,
            },
          }),
          /Duplicate/,
        );
        await assert.rejects(
          f.repo.addArtifact("production", {
            ...f.mutation(),
            subjectId: "book-subject",
            artifactId: "story2",
            kind: "manuscript",
          }),
          /Duplicate responsibility/,
        );
        await assert.rejects(
          f.repo.addArtifact("production", {
            ...f.mutation(),
            subjectId: "book-subject",
            artifactId: "image",
            kind: "page-image",
          }),
          /does not match/,
        );
        await assert.rejects(
          f.repo.addSubject("production", {
            ...f.mutation(),
            subject: {
              id: "cover",
              kind: "page",
              label: "cover",
              pageRole: "cover",
            },
          }),
          /Page roles/,
        );
        assert.equal(
          (await f.repo.getProduction("production")).version,
          p.version,
        );
        assert.equal(
          await f.db
            .collection<{ _id: string; [key: string]: unknown }>(
              "bookletRevisions",
            )
            .countDocuments(),
          0,
        );
      },
    );
    await t.test(
      "revision and pointer are atomic, immutable, hash-bound and replayable",
      async () => {
        const f = await fixture();
        await f.ready();
        const input = f.append();
        const first = await f.repo.appendRevision("production", input);
        f.setVersion(first.version);
        const original = await f.repo.getRevision(
          "production",
          first.revisionId!,
        );
        assert.equal(
          original.contentHash,
          fingerprint({
            hashVersion: 1,
            productionId: "production",
            subjectId: "book-subject",
            artifactId: "story",
            content: input.content,
            sources: [],
            assets: [],
          }),
        );
        const second = await f.repo.appendRevision(
          "production",
          f.append({
            content: {
              ...content,
              units: [{ ...content.units[0], prose: "Second version" }],
            },
            sources: [
              {
                artifactId: "story",
                revisionId: first.revisionId!,
                sha256: original.contentHash,
              },
            ],
          }),
        );
        assert.equal(second.ordinal, 2);
        assert.deepEqual(
          await f.repo.appendRevision("production", input),
          first,
        );
        await assert.rejects(
          f.repo.appendRevision("production", {
            ...input,
            content: {
              ...content,
              units: [{ ...content.units[0], prose: "changed retry" }],
            },
          }),
          /different input/,
        );
        assert.deepEqual(
          await f.repo.getRevision("production", first.revisionId!),
          original,
        );
        const artifact = await f.repo.getArtifact("production", "story");
        assert.equal(artifact.currentRevisionId, second.revisionId);
        assert.equal(artifact.acceptedRevisionId, null);
        assert.equal(
          await f.db
            .collection<{ _id: string; [key: string]: unknown }>(
              "bookletRevisions",
            )
            .countDocuments(),
          2,
        );
        const foreign = bookletRepository(f.db, {
          uid: "foreign",
          authTime: 1,
        });
        await assert.rejects(
          foreign.getRevision("production", first.revisionId!),
          /not found/,
        );
        await assert.rejects(
          foreign.appendRevision("production", input),
          /not found/,
        );
      },
    );
    await t.test(
      "concurrent writes produce one winner and no orphan revision",
      async () => {
        const f = await fixture();
        await f.ready();
        const results = await Promise.allSettled([
          f.repo.appendRevision("production", f.append()),
          f.repo.appendRevision("production", f.append()),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await f.db
            .collection<{ _id: string; [key: string]: unknown }>(
              "bookletRevisions",
            )
            .countDocuments(),
          1,
        );
        const p = await f.repo.getProduction("production");
        f.setVersion(p.version);
        const same = f.append();
        const retryResults = await Promise.all([
          f.repo.appendRevision("production", same),
          f.repo.appendRevision("production", same),
        ]);
        assert.deepEqual(retryResults[0], retryResults[1]);
        assert.equal(
          await f.db
            .collection<{ _id: string; [key: string]: unknown }>(
              "bookletRevisions",
            )
            .countDocuments(),
          2,
        );
      },
    );
    await t.test(
      "lease takeover fences stale workers; renewal/release and access revocation work",
      async () => {
        const f = await fixture();
        await f.ready();
        const stale = f.append();
        f.advance(10001);
        await assert.rejects(
          f.repo.appendRevision("production", stale),
          /expired or superseded/,
        );
        const lease = await f.lease();
        assert.equal(lease.fence, 2);
        await assert.rejects(
          f.repo.appendRevision("production", {
            ...stale,
            expectedVersion: lease.version,
          }),
          /expired or superseded/,
        );
        const renewed = await f.repo.renewLease("production", {
          ...f.mutation(),
          durationMs: 20000,
        });
        f.setVersion(renewed.version);
        assert.equal(renewed.fence, lease.fence);
        const releaseInput = f.mutation();
        const released = await f.repo.releaseLease("production", releaseInput);
        f.setVersion(released.version);
        assert.deepEqual(
          await f.repo.releaseLease("production", releaseInput),
          released,
        );
        await assert.rejects(
          f.repo.appendRevision("production", f.append()),
          /expired or superseded/,
        );
        await f.db
          .collection<{ _id: string; [key: string]: unknown }>("accountAccess")
          .insertOne({
            _id: actor.uid,
            role: "member",
            status: "suspended",
            notBefore: 0,
            revision: 1,
            updatedAt: new Date(),
          });
        await assert.rejects(f.repo.getBook("book"), /Account access/);
        await assert.rejects(
          f.repo.releaseLease("production", releaseInput),
          /Account access/,
        );
      },
    );
    await t.test(
      "source ownership, hashes and content identities cannot be forged",
      async () => {
        const f = await fixture();
        await f.ready();
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              content: {
                kind: "description",
                name: "Mira",
                description: "Child",
                continuityRules: [],
              },
            }),
          ),
          /Content kind/,
        );
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              content: {
                ...content,
                units: [{ ...content.units[0], characterIds: ["missing"] }],
              },
            }),
          ),
          /Unknown or incompatible/,
        );
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              sources: [
                { artifactId: "story", revisionId: "missing", sha256: hash },
              ],
            }),
          ),
          /not found/,
        );
        const first = await f.repo.appendRevision("production", f.append());
        f.setVersion(first.version);
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              sources: [
                {
                  artifactId: "story",
                  revisionId: first.revisionId!,
                  sha256: hash,
                },
              ],
            }),
          ),
          /hash mismatch/,
        );
        await f.db
          .collection<{ _id: string; [key: string]: unknown }>(
            "bookletRevisions",
          )
          .insertOne({
            _id: "foreign-revision",
            ownerId: "other",
            productionId: "other-production",
            artifactId: "other-artifact",
            ordinal: 1,
          });
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              sources: [
                {
                  artifactId: "other-artifact",
                  revisionId: "foreign-revision",
                  sha256: hash,
                },
              ],
            }),
          ),
          /not found/,
        );
      },
    );
    await t.test(
      "BSON limits reject without truncation or partial effects",
      async () => {
        const f = await fixture();
        await f.ready();
        const small = bookletRepository(f.db, actor, {
          now: f.now,
          limits: { revisionBytes: 1024 },
        });
        await assert.rejects(
          small.appendRevision(
            "production",
            f.append({
              content: {
                ...content,
                units: [{ ...content.units[0], prose: "x".repeat(2000) }],
              },
            }),
          ),
          /storage limit/,
        );
        assert.equal(
          await f.db
            .collection<{ _id: string; [key: string]: unknown }>(
              "bookletRevisions",
            )
            .countDocuments(),
          0,
        );
        const doc = await f.db
          .collection("bookletProductions")
          .findOne({ ownerId: actor.uid });
        const tight = bookletRepository(f.db, actor, {
          now: f.now,
          limits: { productionBytes: BSON.calculateObjectSize(doc!) + 10 },
        });
        await assert.rejects(
          tight.appendRevision("production", f.append()),
          /storage limit/,
        );
        assert.equal(
          await f.db
            .collection<{ _id: string; [key: string]: unknown }>(
              "bookletRevisions",
            )
            .countDocuments(),
          0,
        );
        assert.equal(
          (await f.repo.getArtifact("production", "story")).currentRevisionId,
          null,
        );
      },
    );
    await t.test(
      "terminal/expired production guards do not invalidate original committed receipts",
      async () => {
        const f = await fixture();
        await f.ready();
        const input = f.append();
        const saved = await f.repo.appendRevision("production", input);
        f.setVersion(saved.version);
        await f.db
          .collection("bookletProductions")
          .updateOne(
            { ownerId: actor.uid },
            { $set: { lifecycleState: "closed" } },
          );
        await assert.rejects(
          f.repo.appendRevision("production", f.append()),
          /not mutable/,
        );
        assert.deepEqual(
          await f.repo.appendRevision("production", input),
          saved,
        );
        await f.db.collection("bookletProductions").updateOne(
          { ownerId: actor.uid },
          {
            $set: {
              lifecycleState: "draft",
              expiresAt: new Date("2020-01-01"),
            },
          },
        );
        await assert.rejects(
          f.repo.appendRevision("production", f.append()),
          /not mutable/,
        );
        assert.equal(
          await f.db.collection("bookletRevisions").countDocuments(),
          1,
        );
      },
    );
    await t.test(
      "creation composes with order insertion in the caller transaction",
      async () => {
        const f = await fixture();
        const session = client.startSession();
        const order = {
          ...f.order,
          _id: "new-order",
          value: {
            ...f.order.value,
            id: "new-order",
            targetId: "new-production",
          },
        };
        const input = {
          ...f.creation,
          id: "new-production",
          orderId: "new-order",
          key: "new-production",
        };
        try {
          await assert.rejects(
            session.withTransaction(async () => {
              await f.db
                .collection<typeof order>("consumptionOrders")
                .insertOne(order, { session });
              await f.repo.createProduction(input, session);
              throw new Error("rollback production");
            }),
            /rollback production/,
          );
          await assert.rejects(
            f.repo.getProduction("new-production"),
            /not found/,
          );
          assert.equal(
            (await f.repo.getBook("book")).currentProductionId,
            "production",
          );
          await session.withTransaction(async () => {
            await f.db
              .collection<typeof order>("consumptionOrders")
              .insertOne(order, { session });
            await f.repo.createProduction(input, session);
          });
          assert.equal(
            (await f.repo.getProduction("new-production")).orderId,
            "new-order",
          );
        } finally {
          await session.endSession();
        }
      },
    );
    await t.test(
      "individual descriptions and roster preserve the legacy aggregate contract boundary",
      async () => {
        const f = await fixture();
        await f.ready();
        await f.subject({
          id: "mira",
          kind: "character",
          label: "Mira",
          pageRole: null,
        });
        await f.artifact("mira", "mira-description", "description");
        await f.artifact("book-subject", "roster", "roster");
        const description = await f.repo.appendRevision(
          "production",
          f.append({
            artifactId: "mira-description",
            content: {
              kind: "description",
              name: "Mira",
              description: "Yellow raincoat",
              continuityRules: [],
            },
          }),
        );
        f.setVersion(description.version);
        await f.repo.appendRevision(
          "production",
          f.append({
            artifactId: "roster",
            content: {
              kind: "roster",
              characterIds: ["mira"],
              locationIds: [],
            },
          }),
        );
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              content: {
                kind: "characters",
                entities: [],
              } as unknown as AppendInput["content"],
            }),
          ),
          /individual descriptions/,
        );
        assert.equal(
          (await f.repo.getRevision("production", description.revisionId!))
            .subjectId,
          "mira",
        );
      },
    );
    await t.test("pagination is bounded, stable and scoped", async () => {
      const f = await fixture();
      await f.ready();
      for (let i = 0; i < 3; i++) {
        const r = await f.repo.appendRevision("production", f.append());
        f.setVersion(r.version);
      }
      const first = await f.repo.listRevisions("production", "story", {
        limit: 1,
      });
      const second = await f.repo.listRevisions("production", "story", {
        limit: 2,
        cursor: first.cursor!,
      });
      assert.equal(
        new Set([...first.items, ...second.items].map((v) => v._id)).size,
        3,
      );
      assert.equal(second.cursor, null);
      await assert.rejects(
        f.repo.listBooks({ cursor: first.cursor! }),
        /Invalid pagination cursor/,
      );
      await assert.rejects(
        f.repo.listRevisions("production", "story", { limit: 101 }),
      );
      assert.equal((await f.repo.listProductions("book")).items.length, 1);
    });
    await t.test(
      "page and manifest drafts validate structure but never approve or complete",
      async () => {
        const f = await fixture();
        await f.ready();
        await f.subject({
          id: "page1",
          kind: "page",
          label: "Page",
          pageRole: "story",
        });
        await f.artifact("page1", "page-plan", "page-plan");
        await f.artifact("page1", "page-image", "page-image");
        await f.artifact("book-subject", "manifest", "book-manifest");
        const panel = {
          id: "panel",
          region: { x: 0, y: 0, width: 1, height: 1 },
          action: "Mira waves",
          characterIds: [],
          locationIds: [],
          manuscriptUnitIds: [],
          lettering: [],
        };
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              artifactId: "page-plan",
              content: {
                kind: "page-plan",
                panels: [panel, { ...panel, id: "p2" }, { ...panel, id: "p3" }],
              },
            }),
          ),
          /Panel count/,
        );
        const asset = { assetId: "retained-image", sha256: hash };
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              artifactId: "page-image",
              content: { kind: "page-image", asset },
            }),
          ),
          /explicit asset/,
        );
        const image = await f.repo.appendRevision(
          "production",
          f.append({
            artifactId: "page-image",
            content: { kind: "page-image", asset },
            assets: [asset],
          }),
        );
        f.setVersion(image.version);
        const savedImage = await f.repo.getRevision(
          "production",
          image.revisionId!,
        );
        const source = {
          artifactId: "page-image",
          revisionId: image.revisionId!,
          sha256: savedImage.contentHash,
        };
        const manifest = {
          kind: "book-manifest" as const,
          title: "Book",
          language,
          acceptedSources: [],
          pages: [
            {
              subjectId: "page1",
              role: "story" as const,
              index: 0,
              revision: source,
              asset,
              qualityReviewId: "future-review",
              approvalDecisionId: "future-decision",
            },
          ],
        };
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              artifactId: "manifest",
              content: { ...manifest, pages: [] },
            }),
          ),
        );
        await assert.rejects(
          f.repo.appendRevision(
            "production",
            f.append({
              artifactId: "manifest",
              content: manifest,
              assets: [asset],
            }),
          ),
          /does not match/,
        );
        await f.repo.appendRevision(
          "production",
          f.append({
            artifactId: "manifest",
            content: manifest,
            sources: [source],
            assets: [asset],
          }),
        );
        const p = await f.repo.getProduction("production");
        assert.equal(p.lifecycleState, "draft");
        assert.equal(p.currentManifestRevisionId, null);
        assert.equal(
          (await f.repo.getArtifact("production", "manifest"))
            .acceptedRevisionId,
          null,
        );
      },
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
import { readFileSync } from "node:fs";
import {
  bookDocumentSchema,
  productionDocumentSchema,
  revisionDocumentSchema,
  writeReceiptSchema,
} from "../../src/lib/server/booklets/documents";

test("canonical document example matches persistence schemas and embedded references", () => {
  const example = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/features/booklet-generation/model-document-example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const c = example.collections;
  const v2Example = example.v2StorageExamples.production;
  const v2Parsed = productionV2Schema.parse({
    ...v2Example,
    createdAt: new Date(v2Example.createdAt),
    updatedAt: new Date(v2Example.updatedAt),
  });
  assert.equal(v2Parsed.documentVersion, 2);
  const v2Revision = revisionV2Schema.parse({
    ...example.v2StorageExamples.revision,
    createdAt: new Date(example.v2StorageExamples.revision.createdAt),
  });
  assert.equal(v2Revision.contentHash, fingerprint(v2Revision.content));
  const v2Work = workV2Schema.parse({
    ...example.v2StorageExamples.work,
    createdAt: new Date(example.v2StorageExamples.work.createdAt),
    updatedAt: new Date(example.v2StorageExamples.work.updatedAt),
    reconciliation: { ...example.v2StorageExamples.work.reconciliation,
      leaseUntil: new Date(example.v2StorageExamples.work.reconciliation.leaseUntil) },
  });
  const v2Assessment = assessmentDocumentV2Schema.parse({
    ...example.v2StorageExamples.assessment,
    createdAt: new Date(example.v2StorageExamples.assessment.createdAt),
  });
  const v2Acceptance = acceptanceDocumentV2Schema.parse({
    ...example.v2StorageExamples.acceptance,
    createdAt: new Date(example.v2StorageExamples.acceptance.createdAt),
  });
  assert.equal(v2Assessment.callId, v2Work.callId);
  assert.equal(v2Assessment.assessment.targetHash, v2Revision.contentHash);
  assert.equal(v2Acceptance.revisionId, v2Revision._id);
  const human = humanRequestV2Schema.parse(example.v2StorageExamples.humanRequestReceipt.result.humanRequest);
  assert.equal(human.presentationHash, fingerprint(human.formContent + "\n{{#$output.response#}}"));
  assert.equal(human.targets[0].revisionId, v2Revision._id);
  assert.equal(
    v2Parsed.subjects[0].artifacts[0].acceptedRevisionId,
    v2Acceptance.revisionId,
  );
  assert.equal(
    v2Parsed.subjects[0].artifacts[0].currentRevisionId,
    v2Revision._id,
  );
  assert.deepEqual(v2Parsed.retryPolicy, {
    paidLlm: 2,
    paidImage: 0,
    nonPaid: 3,
  });
  const dated = (row: Record<string, unknown>) => ({
    ...row,
    createdAt: new Date(row.createdAt as string),
  });
  const b = bookDocumentSchema.parse({
    ...dated(c.bookletBooks[0]),
    updatedAt: new Date(c.bookletBooks[0].updatedAt),
  });
  const p = productionDocumentSchema.parse({
    ...dated(c.bookletProductions[0]),
    updatedAt: new Date(c.bookletProductions[0].updatedAt),
  });
  const revisions = c.bookletRevisions.map((r: Record<string, unknown>) =>
    revisionDocumentSchema.parse(dated(r)),
  );
  assert.equal(p.bookletId, b._id);
  for (const subject of p.subjects)
    for (const artifact of subject.artifacts) {
      const current = revisions.find(
        (r: { _id: string }) => r._id === artifact.currentRevisionId,
      )!;
      assert.equal(current.artifactId, artifact.id);
      assert.equal(current.subjectId, subject.id);
      assert.equal(artifact.acceptedRevisionId, null);
    }
  for (const r of revisions) {
    assert.equal(
      r.contentHash,
      fingerprint({
        hashVersion: 1,
        productionId: r.productionId,
        subjectId: r.subjectId,
        artifactId: r.artifactId,
        content: r.content,
        sources: r.sources,
        assets: r.assets,
      }),
    );
    for (const source of r.sources)
      assert.equal(
        revisions.find((s: { _id: string }) => s._id === source.revisionId)!
          .contentHash,
        source.sha256,
      );
  }
  for (const receipt of c.bookletRepositoryWrites)
    writeReceiptSchema.parse(dated(receipt));
  assert.equal("artifacts" in c, false);
});
