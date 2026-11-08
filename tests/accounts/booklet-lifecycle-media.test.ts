import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import sharp from "sharp";
import { bookletRepository } from "../../src/lib/server/booklets/repository";
import {
  bookletLifecycle,
  recordBookletQuality,
  validateBookletApproval,
} from "../../src/lib/server/booklets/lifecycle";
import { bookletMedia } from "../../src/lib/server/booklets/media";
import { bookletsServerExtension } from "../../src/project/booklets/server";
import {
  grantCredits,
  createCreditIndexes,
  readWallet,
} from "../../src/lib/server/store/credits";
import {
  createConsumptionIndexes,
  abandonUnboundWorkflow,
} from "../../src/lib/server/commerce/orders";
import {
  retainEvidence,
  recordMeasurement,
  releaseOperationEvidence,
} from "../../src/lib/server/execution/measurements";
import type { AiJob } from "../../src/lib/server/ai/jobs";
import { enqueueBookletRun } from "../../src/lib/server/booklets/runs";
import { orchestratorSchema } from "../../src/lib/contracts/runs";
import type { PrivateObjectStore } from "../../src/lib/server/runs/object-store";
import type {
  Content,
  ArtifactKind,
  SubjectInput,
} from "../../src/lib/server/booklets/documents";
import example from "../../docs/features/booklet-generation/model-document-example.json";

const actor = { uid: "owner", authTime: 1 };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const policy = {
  id: "visual",
  revision: 1,
  publicationId: "reviewer-publication",
};

test("booklet lifecycle and original media use real transaction paths", async (t) => {
  const mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const client = new MongoClient(mongo.getUri());
  let serial = 0;
  async function fixture() {
    const db = client.db(`booklet_services_${++serial}`);
    await createCreditIndexes(db);
    await createConsumptionIndexes(db);
    await bookletsServerExtension.indexes!(db);
    const migration = bookletsServerExtension.migrations!.find(
      (m) => m.id === "booklets:0002-lifecycle-media",
    )!;
    await migration.run(db);
    await migration.run(db);
    await grantCredits(db, actor.uid, "initial", {
      amount: 500,
      source: "purchase",
      reference: "initial",
    });
    const config = {
      ...example.collections.bookletProductions[0].creativeConfigSnapshot,
      canvas: { width: 8, height: 8, mime: "image/png" as const },
    };
    const { id: packageId, revision: packageRevision, ...fields } = config;
    await db.collection("consumptionOrders").insertOne({
      _id: "order" as never,
      value: {
        schemaVersion: 1,
        id: "order",
        ownerId: actor.uid,
        targetId: "production",
        idempotencyKey: "checkout",
        inputHash: "a".repeat(64),
        terms: {
          identity: {
            id: packageId,
            revision: packageRevision,
            schemaVersion: 1,
          },
          productType: "booklet",
          productSchemaVersion: 1,
          credits: 50,
          allowances: ["story", "style", "reference", "page"].map(
            (category) => ({
              category,
              unit: category === "story" ? "request" : "subject",
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
        createdAt: new Date().toISOString(),
      },
      fields,
      locks: [],
      activeWorkflow: null,
    });
    const repo = bookletRepository(db, actor);
    await repo.createBook({ id: "book", title: "A lantern", key: "create" });
    await repo.createProduction({
      id: "production",
      bookletId: "book",
      orderId: "order",
      key: "create-production",
      brief: {
        idea: "A lantern",
        audience: "Children",
        language: { tag: "en", direction: "ltr" },
        characters: [],
        locations: [],
        visualPreferences: "Watercolor",
      },
      capacity: {
        id: config.executionProfileId,
        revision: config.executionProfileRevision,
        maxStoryPages: 5,
        coverSupported: true,
        maxCharacters: 5,
        maxLocations: 5,
        maxPanelsPerPage: 5,
        maxStyleSamples: 5,
        canvases: [config.canvas],
        languages: [{ tag: "en", direction: "ltr" }],
      },
    });
    await repo.acquireLease("production", {
      key: "lease",
      expectedVersion: 1,
      holderId: "worker",
      durationMs: 300000,
    });
    let keys = 0;
    let activeRunId = "run";
    const mutation = async () => ({
      key: `write-${++keys}`,
      expectedVersion: (await repo.getProduction("production")).version,
      holderId: "worker",
      fence: 1,
    });
    async function subject(
      id: string,
      kind: SubjectInput["kind"],
      artifacts: [string, ArtifactKind][],
    ) {
      await repo.addSubject("production", {
        ...(await mutation()),
        subject: {
          id,
          kind,
          label: id,
          pageRole: kind === "page" ? "story" : null,
        },
      });
      for (const [artifactId, artifactKind] of artifacts)
        await repo.addArtifact("production", {
          ...(await mutation()),
          subjectId: id,
          artifactId,
          kind: artifactKind,
        });
    }
    await subject("book-subject", "book", [
      ["story", "manuscript"],
      ["style", "style"],
    ]);
    await subject("style-subject", "style-sample", [
      ["style-image", "reference"],
    ]);
    await subject("character", "character", [
      ["description", "description"],
      ["character-image", "reference"],
    ]);
    await subject("page", "page", [
      ["plan", "page-plan"],
      ["image", "page-image"],
    ]);
    async function append(
      artifactId: string,
      content: Content,
      sources: {
        artifactId: string;
        revisionId: string;
        sha256: string;
      }[] = [],
      assets: { assetId: string; sha256: string }[] = [],
      operationId = "text",
    ) {
      const input = {
        ...(await mutation()),
        artifactId,
        content,
        sources,
        assets,
        provenance: { runId: activeRunId, operationId, evidenceIds: [] },
      };
      const saved = await repo.appendRevision("production", input);
      return {
        input,
        saved,
        revision: await repo.getRevision("production", saved.revisionId!),
      };
    }
    const story = await append("story", {
      kind: "manuscript",
      units: [
        {
          id: "unit",
          prose: "A lantern glows.",
          characterIds: [],
          locationIds: [],
        },
      ],
    });
    const style = await append("style", {
      kind: "style",
      direction: "Watercolor",
      palette: ["gold"],
      typography: "Readable",
      continuity: [],
    });
    const description = await append("description", {
      kind: "description",
      name: "Mira",
      description: "Yellow coat",
      continuityRules: [],
    });
    const identity = (revision: typeof story.revision) => ({
      artifactId: revision.artifactId,
      revisionId: revision._id,
      sha256: revision.contentHash,
    });
    const plan = await append(
      "plan",
      {
        kind: "page-plan",
        panels: [
          {
            id: "panel",
            region: { x: 0, y: 0, width: 1, height: 1 },
            action: "Glowing lantern",
            characterIds: [],
            locationIds: [],
            manuscriptUnitIds: ["unit"],
            lettering: [],
          },
        ],
      },
      [identity(story.revision)],
    );
    const service = bookletLifecycle(db, actor);
    const started = await service.start("production");
    const job = {
      _id: "run",
      uid: actor.uid,
      authTime: 1,
      status: "running",
      consumption: { orderId: "order", workflowId: started.workflowId },
      run: {
        target: {
          adapter: "booklet",
          version: "1",
          kind: "booklet-production",
          id: "production",
        },
        logicalId: "logical",
      },
    };
    await db.collection("aiJobs").insertOne(job as never);
    await db
      .collection("consumptionWorkflows")
      .updateOne(
        { _id: started.workflowId as never },
        { $set: { jobId: "run" } },
      );
    async function useWorkflow(workflowId: string) {
      activeRunId = `run-${++keys}`;
      await db.collection("aiJobs").insertOne({
        ...job,
        _id: activeRunId as never,
        consumption: { orderId: "order", workflowId },
      });
      await db
        .collection("consumptionWorkflows")
        .updateOne(
          { _id: workflowId as never },
          { $set: { jobId: activeRunId } },
        );
      return activeRunId;
    }
    async function request(revisions: (typeof story.revision)[]) {
      return service.requestReview("production", {
        ...(await mutation()),
        runId: activeRunId,
        targets: revisions.map(identity),
      });
    }
    async function answer(
      review: Awaited<ReturnType<typeof request>>,
      overrides = {},
    ) {
      const decisionId = `decision-${++keys}`;
      await db.collection("runDecisions").insertOne({
        _id: decisionId as never,
        uid: actor.uid,
        jobId: activeRunId,
        status: "submitted",
        answerSource: { type: "user" },
        approval: review.approval,
        confirmedAction: "approve",
        form: { form_content: review.formContent },
        ...overrides,
      });
      return { ...(await mutation()), requestId: review.id, decisionId };
    }
    async function approve(revisions: (typeof story.revision)[]) {
      const review = await request(revisions);
      return service.applyDecision("production", await answer(review));
    }
    async function quality(
      revision: typeof story.revision,
      disposition: "pass" | "repair" = "pass",
      productionId = "production",
    ) {
      const evidenceId = `review-output-${++keys}`;
      const op = `review-${keys}`;
      const value = {
        schemaVersion: 1,
        id: op,
        productionId,
        operationId: op,
        target: identity(revision),
        asset: revision.assets[0],
        sources: revision.sources,
        policy,
        disposition,
        findings:
          disposition === "pass"
            ? []
            : [
                {
                  code: "lettering",
                  blocking: true,
                  description: "Unreadable",
                  action: "Fix lettering",
                },
              ],
        evidenceIds: [evidenceId],
        createdAt: new Date().toISOString(),
      };
      const evidence = await retainEvidence(db, actor.uid, {
        id: evidenceId,
        operationId: op,
        runId: "logical",
        kind: "output",
        payload: value,
      });
      const inputEvidence = await retainEvidence(db, actor.uid, {
        id: `review-input-${keys}`,
        operationId: op,
        runId: "logical",
        kind: "input",
        payload: {
          target: value.target,
          asset: value.asset,
          sources: value.sources,
        },
      });
      const measurementId = `measurement-${keys}`;
      await recordMeasurement(db, actor.uid, {
        schemaVersion: 1,
        id: measurementId,
        operationId: op,
        runId: "logical",
        provider: "fake",
        model: "visual",
        requestId: op,
        workflowRunId: op,
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
        evidence: [evidence, inputEvidence],
      });
      await assert.rejects(
        releaseOperationEvidence(db, actor.uid, op),
        /Active Runs/,
      );
      return recordBookletQuality(db, actor, policy, evidenceId, measurementId);
    }
    const media = bookletMedia(db, actor, { store: null });
    const imageBytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "red" },
    })
      .png()
      .withMetadata()
      .toBuffer();
    async function generate(operationId = "image-op") {
      await approve([story.revision, style.revision]);
      const sources = [identity(story.revision), identity(style.revision)];
      const input = {
        ...(await mutation()),
        operationId,
        runId: activeRunId,
        artifactId: "style-image",
        sources,
      };
      const authorization = await service.authorizeGeneration(
        "production",
        input,
      );
      return { sources, input, authorization };
    }
    return {
      db,
      repo,
      service,
      media,
      mutation,
      append,
      request,
      answer,
      approve,
      quality,
      generate,
      identity,
      imageBytes,
      story,
      style,
      description,
      plan,
      started,
      job,
      useWorkflow,
    };
  }
  try {
    await t.test(
      "revision continuations preserve allocations without overriding revocation or later requests",
      async () => {
        const f = await fixture();
        const finish = async (runId: string, workflowId: string) => {
          await f.db.collection("aiJobs").updateOne(
            { _id: runId as never },
            {
              $set: {
                status: "failed",
                terminationEvidence: "provider-failed",
              },
            },
          );
          await f.service.finishRun("production", workflowId);
        };
        await finish("run", f.started.workflowId);
        const request = {
          requestId: "story-revision",
          expectedVersion: (await f.repo.getProduction("production")).version,
          category: "story" as const,
          subjects: [],
          inputHash: "b".repeat(64),
        };
        const quote = await f.service.quoteRevision("production", request);
        const origin = await f.service.startRevision(
          "production",
          request,
          quote.hash,
          quote.credits,
        );
        let workflowId = origin;
        let runId = await f.useWorkflow(workflowId);
        const content = {
          kind: "manuscript" as const,
          units: [
            {
              id: "unit",
              prose: "Revised lantern story",
              characterIds: [],
              locationIds: [],
            },
          ],
        };
        for (let attempt = 1; attempt <= 2; attempt++) {
          await finish(runId, workflowId);
          workflowId = await f.service.continue(
            "production",
            `resume-${attempt}`,
          );
          assert.equal(
            await f.service.continue("production", `resume-${attempt}`),
            workflowId,
          );
          runId = await f.useWorkflow(workflowId);
          assert.equal(
            (await f.repo.getProduction("production")).revisionChargeId,
            origin,
          );
          await f.append("story", content);
        }
        assert.equal(
          await f.db.collection("consumptionAllocations").countDocuments(),
          1,
        );
        assert.equal(
          await f.db.collection("consumptionCharges").countDocuments(),
          2,
        );
        await f.db
          .collection("consumptionAllocations")
          .updateMany({ chargeId: origin }, { $set: { revoked: true } });
        await assert.rejects(
          f.append("story", content),
          /revision allocation is required/,
        );
        await f.db
          .collection("consumptionAllocations")
          .updateMany({ chargeId: origin }, { $set: { revoked: false } });
        await finish(runId, workflowId);
        const next = {
          ...request,
          requestId: "style-revision",
          category: "style" as const,
          subjects: ["style-subject"],
          expectedVersion: (await f.repo.getProduction("production")).version,
        };
        const nextQuote = await f.service.quoteRevision("production", next);
        const nextFlow = await f.service.startRevision(
          "production",
          next,
          nextQuote.hash,
          nextQuote.credits,
        );
        await f.useWorkflow(nextFlow);
        assert.equal(
          (await f.repo.getProduction("production")).revisionChargeId,
          nextFlow,
        );
        await assert.rejects(
          f.append("story", content),
          /revision allocation is required/,
        );
        await f.append("style", {
          ...f.style.revision.content,
          kind: "style",
        } as Content);
      },
    );
    await t.test(
      "accepted originals and derivatives remain usable through three paid productions",
      async () => {
        const f = await fixture();
        const g = await f.generate();
        const asset = await f.media.retainOriginal(
          "production",
          {
            operationId: "image-op",
            outputKey: "original",
            sha256: sha(f.imageBytes),
            mime: "image/png",
          },
          f.imageBytes,
        );
        const ref = { assetId: asset.id, sha256: asset.sha256 };
        const first = await f.append(
          "style-image",
          {
            kind: "reference",
            description: "Style",
            requiredFeatures: [],
            asset: ref,
          },
          g.sources,
          [ref],
          "image-op",
        );
        await f.quality(first.revision);
        await f.approve([first.revision]);
        const derivative = await f.media.derivative("production", asset.id, 64);
        let source = first.revision;
        const base = await f.repo.getProduction("production");
        const order = await f.db
          .collection("consumptionOrders")
          .findOne({ _id: "order" as never });
        assert.ok(order);
        for (const n of [2, 3]) {
          const productionId = `production-${n}`;
          const orderId = `order-${n}`;
          const runId = `reuse-run-${n}`;
          await f.db.collection("consumptionOrders").insertOne({
            ...order,
            _id: orderId as never,
            value: {
              ...order.value,
              id: orderId,
              targetId: productionId,
              state: "queued",
              chargedCredits: 0,
              chargeLedgerId: null,
              startedAt: null,
              idempotencyKey: `restart-${n}`,
            },
            activeWorkflow: null,
          });
          const cfg = base.creativeConfigSnapshot;
          await f.repo.createProduction({
            id: productionId,
            bookletId: "book",
            sourceProductionId: source.productionId,
            orderId,
            brief: base.brief,
            key: `restart-${n}`,
            capacity: {
              id: cfg.executionProfileId,
              revision: cfg.executionProfileRevision,
              maxStoryPages: 5,
              coverSupported: true,
              maxCharacters: 5,
              maxLocations: 5,
              maxPanelsPerPage: 5,
              maxStyleSamples: 5,
              canvases: [cfg.canvas],
              languages: cfg.languages,
            },
          });
          await f.repo.acquireLease(productionId, {
            key: "lease",
            expectedVersion: 1,
            holderId: "worker",
            durationMs: 300000,
          });
          let seq = 0;
          const mutation = async () => ({
            key: `reuse-${++seq}`,
            expectedVersion: (await f.repo.getProduction(productionId)).version,
            holderId: "worker",
            fence: 1,
          });
          await f.repo.addSubject(productionId, {
            ...(await mutation()),
            subject: {
              id: "style-subject",
              kind: "style-sample",
              label: "Style",
              pageRole: null,
            },
          });
          await f.repo.addArtifact(productionId, {
            ...(await mutation()),
            subjectId: "style-subject",
            artifactId: "style-image",
            kind: "reference",
          });
          const started = await f.service.start(productionId);
          await f.db.collection("aiJobs").insertOne({
            ...f.job,
            _id: runId as never,
            consumption: { orderId, workflowId: started.workflowId },
            run: {
              ...f.job.run,
              target: { ...f.job.run.target, id: productionId },
            },
          });
          const approve = async (revision: typeof source, reuse: boolean) => {
            const request = await f.service.requestReview(productionId, {
              ...(await mutation()),
              runId,
              targets: [f.identity(revision)],
              reuse,
            });
            const decisionId = `answer-${n}-${seq}`;
            await f.db.collection("runDecisions").insertOne({
              _id: decisionId as never,
              uid: actor.uid,
              jobId: runId,
              status: "submitted",
              answerSource: { type: "user" },
              approval: request.approval,
              confirmedAction: "approve",
              form: { form_content: request.formContent },
            });
            await f.service.applyDecision(productionId, {
              ...(await mutation()),
              requestId: request.id,
              decisionId,
            });
            return request.id;
          };
          const append = async (operationId: string) =>
            f.repo.appendRevision(productionId, {
              ...(await mutation()),
              artifactId: "style-image",
              content: source.content,
              sources: [f.identity(source)],
              assets: source.assets,
              provenance: { operationId, runId, evidenceIds: [] },
            });
          await assert.rejects(
            f.media.read(productionId, asset.id),
            /not found/,
          );
          await assert.rejects(
            f.media.read(productionId, derivative.id),
            /not found/,
          );
          await assert.rejects(append("unaccepted"), /authorized generation/);
          const acceptance = await approve(source, true);
          const saved = await append(acceptance);
          const copy = await f.repo.getRevision(
            productionId,
            saved.revisionId!,
          );
          assert.deepEqual(
            (await f.media.read(productionId, asset.id)).bytes,
            f.imageBytes,
          );
          assert.equal(
            (await f.media.read(productionId, derivative.id)).asset
              .originalAssetId,
            asset.id,
          );
          assert.equal(
            (await f.media.derivative(productionId, asset.id, 64)).id,
            derivative.id,
          );
          const review = await f.media.reviewerInputs(productionId, copy._id);
          assert.deepEqual(review.original.bytes, f.imageBytes);
          await f.quality(copy, "pass", productionId);
          await approve(copy, false);
          source = copy;
        }
        await assert.rejects(
          bookletMedia(
            f.db,
            { uid: "other", authTime: 1 },
            { store: null },
          ).read("production-3", asset.id),
          /not found/,
        );
        const receipt = await f.db
          .collection("bookletAssets")
          .findOne({ _id: asset.id as never });
        assert.equal(receipt?.productionId, "production");
        assert.equal(receipt?.attachments.length, 3);
        assert.equal(
          await f.db
            .collection("bookletAssets")
            .countDocuments({ originalAssetId: null }),
          1,
        );
        assert.equal(
          await f.db
            .collection("consumptionCharges")
            .countDocuments({ kind: "package" }),
          3,
        );
        assert.deepEqual(await f.repo.getProduction("production"), base);
      },
    );
    await t.test(
      "continuation attaches a retained original from a verified terminal Run without replay",
      async () => {
        for (const state of ["authorized", "unknown"] as const) {
          const f = await fixture();
          const g = await f.generate();
          const asset = await f.media.retainOriginal(
            "production",
            {
              operationId: "image-op",
              outputKey: "original",
              sha256: sha(f.imageBytes),
              mime: "image/png",
            },
            f.imageBytes,
          );
          if (state === "unknown")
            await f.db
              .collection("bookletGenerations")
              .updateOne({ _id: "image-op" as never }, { $set: { state } });
          await f.db.collection("aiJobs").updateOne(
            { _id: "run" as never },
            {
              $set: { status: "failed", terminationEvidence: "unverified" },
            },
          );
          await assert.rejects(
            f.service.finishRun("production", f.started.workflowId),
            /Reconcile/,
          );
          await assert.rejects(
            f.service.continue("production", "recover"),
            /active|busy|workflow/i,
          );
          await f.db.collection("aiJobs").updateOne(
            { _id: "run" as never },
            {
              $set: { terminationEvidence: "provider-failed" },
            },
          );
          await f.service.finishRun("production", f.started.workflowId);
          const workflowId = await f.service.continue("production", "recover");
          assert.equal(
            await f.service.continue("production", "recover"),
            workflowId,
          );
          const runId = await f.useWorkflow(workflowId);
          await assert.rejects(
            f.service.authorizeGeneration("production", {
              ...(await f.mutation()),
              runId,
              operationId: "must-not-replay",
              artifactId: "style-image",
              sources: g.sources,
            }),
            /Reconcile the existing generation/,
          );
          const ref = { assetId: asset.id, sha256: asset.sha256 };
          const result = await f.append(
            "style-image",
            {
              kind: "reference",
              description: "Style",
              requiredFeatures: [],
              asset: ref,
            },
            g.sources,
            [ref],
            "image-op",
          );
          assert.deepEqual(
            await f.repo.appendRevision("production", result.input),
            result.saved,
          );
          assert.equal(result.revision.provenance.runId, runId);
          const operation = await f.service.inspectGeneration(
            "production",
            "image-op",
          );
          assert.equal(operation.runId, "run");
          assert.equal(operation.state, "succeeded");
          assert.equal(operation.revisionId, result.revision._id);
          assert.deepEqual(
            (await f.media.read("production", asset.id)).bytes,
            f.imageBytes,
          );
          assert.equal(
            await f.db.collection("bookletGenerations").countDocuments(),
            1,
          );
          assert.equal(
            await f.db.collection("bookletAssets").countDocuments(),
            1,
          );
          assert.equal(
            await f.db
              .collection("consumptionCharges")
              .countDocuments({ kind: "package" }),
            1,
          );
        }
      },
    );
    await t.test(
      "an image revision allocation cannot reset an exhausted repair budget",
      async () => {
        const f = await fixture();
        await f.db.collection("aiJobs").updateOne(
          { _id: "run" as never },
          {
            $set: {
              status: "succeeded",
              terminationEvidence: "provider-finished",
            },
          },
        );
        await f.service.finishRun("production", f.started.workflowId);
        const request = {
          requestId: "style-revision",
          category: "style" as const,
          subjects: ["style-subject"],
          expectedVersion: (await f.repo.getProduction("production")).version,
          inputHash: "b".repeat(64),
        };
        const quote = await f.service.quoteRevision("production", request);
        const workflowId = await f.service.startRevision(
          "production",
          request,
          quote.hash,
          quote.credits,
        );
        let runId = await f.useWorkflow(workflowId);
        await f.db.collection("aiJobs").updateOne(
          { _id: runId as never },
          {
            $set: { status: "failed", terminationEvidence: "provider-failed" },
          },
        );
        await f.service.finishRun("production", workflowId);
        const continued = await f.service.continue(
          "production",
          "resume-image-revision",
        );
        runId = await f.useWorkflow(continued);
        const g = await f.generate();
        const saveImage = async (operationId: string) => {
          const asset = await f.media.retainOriginal(
            "production",
            {
              operationId,
              outputKey: "original",
              sha256: sha(f.imageBytes),
              mime: "image/png",
            },
            f.imageBytes,
          );
          const ref = { assetId: asset.id, sha256: asset.sha256 };
          return f.append(
            "style-image",
            {
              kind: "reference",
              description: "Style",
              requiredFeatures: [],
              asset: ref,
            },
            g.sources,
            [ref],
            operationId,
          );
        };
        const first = await saveImage("image-op");
        await f.quality(first.revision, "repair");
        const fresh = async (operationId: string, repairRevisionId?: string) =>
          f.service.authorizeGeneration("production", {
            ...(await f.mutation()),
            runId,
            operationId,
            artifactId: "style-image",
            sources: g.sources,
            ...(repairRevisionId ? { repairRevisionId } : {}),
          });
        await assert.rejects(fresh("fresh-root"), /allocation already/);
        await fresh("repair", first.revision._id);
        const second = await saveImage("repair");
        await f.quality(second.revision, "repair");
        await f.db.collection("aiJobs").updateOne(
          { _id: runId as never },
          {
            $set: { status: "failed", terminationEvidence: "provider-failed" },
          },
        );
        await f.service.finishRun("production", continued);
        runId = await f.useWorkflow(
          await f.service.continue("production", "resume-exhausted-revision"),
        );
        await assert.rejects(
          fresh("over-budget", second.revision._id),
          /repair budget exhausted/,
        );
        await assert.rejects(fresh("omit-repair-id"), /allocation already/);
        assert.equal(
          await f.db.collection("consumptionAllocations").countDocuments(),
          1,
        );
        assert.equal(
          await f.db.collection("bookletGenerations").countDocuments(),
          2,
        );
      },
    );
    await t.test(
      "upfront admission is charged once and continuation requires a reconciled terminal Run",
      async () => {
        const f = await fixture();
        const before = await readWallet(f.db, actor.uid, { actor });
        await Promise.all([
          f.service.start("production"),
          f.service.start("production"),
        ]);
        assert.deepEqual(await readWallet(f.db, actor.uid, { actor }), before);
        assert.equal(
          await f.db.collection("consumptionCharges").countDocuments(),
          1,
        );
        await assert.rejects(
          f.service.continue("production", "resume"),
          /busy/,
        );
        await assert.rejects(
          f.service.finishRun("production", f.started.workflowId),
          /Reconcile/,
        );
        await f.db.collection("aiJobs").updateOne(
          { _id: "run" as never },
          {
            $set: {
              status: "succeeded",
              terminationEvidence: "provider-finished",
            },
          },
        );
        await f.service.finishRun("production", f.started.workflowId);
        const flow = await f.service.continue("production", "resume");
        assert.equal(await f.service.continue("production", "resume"), flow);
        assert.equal(
          await f.db.collection("consumptionCharges").countDocuments(),
          1,
        );
      },
    );
    await t.test(
      "human approval rejects persona, altered presentation, stale targets and foreign owners",
      async () => {
        const f = await fixture();
        const request = await f.request([f.story.revision]);
        await validateBookletApproval(
          f.db,
          f.job as unknown as AiJob,
          request.approval,
        );
        await assert.rejects(
          f.service.applyDecision(
            "production",
            await f.answer(request, { answerSource: { type: "persona" } }),
          ),
          /human approval/,
        );
        await assert.rejects(
          f.service.applyDecision(
            "production",
            await f.answer(request, {
              form: {
                form_content: request.formContent.replace("lantern", "secret"),
              },
            }),
          ),
          /presented content/,
        );
        const input = await f.answer(request);
        const approved = await f.service.applyDecision("production", input);
        assert.deepEqual(
          await f.service.applyDecision("production", input),
          approved,
        );
        await assert.rejects(
          bookletLifecycle(f.db, { uid: "other", authTime: 1 }).applyDecision(
            "production",
            input,
          ),
          /not found/,
        );
        await f.db
          .collection("bookletProductions")
          .updateOne(
            { _id: "production" as never },
            { $set: { "subjects.0.artifacts.0.currentRevisionId": null } },
          );
        await assert.rejects(
          validateBookletApproval(
            f.db,
            f.job as unknown as AiJob,
            request.approval,
          ),
          /changed/,
        );
      },
    );
    await t.test(
      "generation locks precede dispatch and duplicate retries cannot create competing operations",
      async () => {
        const f = await fixture();
        const g = await f.generate();
        assert.deepEqual(
          await f.service.authorizeGeneration("production", g.input),
          g.authorization,
        );
        await assert.rejects(
          f.service.authorizeGeneration("production", {
            ...g.input,
            operationId: "changed",
          }),
          /idempotency/,
        );
        assert.ok((await f.repo.getProduction("production")).stageLocks.story);
        await assert.rejects(
          f.service.quoteRevision("production", {
            requestId: "revision",
            expectedVersion: (await f.repo.getProduction("production")).version,
            category: "story",
            subjects: [],
            inputHash: "a".repeat(64),
          }),
          /locked/,
        );
        await assert.rejects(
          f.append("story", f.story.revision.content),
          /locked/,
        );
        await assert.rejects(
          f.service.authorizeGeneration("production", {
            ...g.input,
            ...(await f.mutation()),
            operationId: "second",
          }),
          /existing generation/,
        );
        assert.equal(
          await f.db.collection("bookletGenerations").countDocuments(),
          1,
        );
      },
    );
    await t.test(
      "original bytes, derivatives and attachment retries remain separate durable effects",
      async () => {
        const f = await fixture();
        const g = await f.generate();
        const input = {
          operationId: "image-op",
          outputKey: "original",
          sha256: sha(f.imageBytes),
          mime: "image/png",
        };
        const retained = await f.media.retainOriginal(
          "production",
          input,
          f.imageBytes,
        );
        assert.deepEqual(
          await f.media.retainOriginal("production", input, f.imageBytes),
          retained,
        );
        assert.deepEqual(
          (await f.media.read("production", retained.id)).bytes,
          f.imageBytes,
        );
        const derivative = await f.media.derivative("production", retained.id);
        assert.equal(derivative.originalAssetId, retained.id);
        assert.notEqual(derivative.sha256, retained.sha256);
        const asset = { assetId: retained.id, sha256: retained.sha256 };
        const content: Content = {
          kind: "reference",
          description: "Watercolor",
          requiredFeatures: [],
          asset,
        };
        await assert.rejects(
          f.append("style-image", content, g.sources, [asset], "wrong-op"),
          /authorized generation/,
        );
        assert.equal(
          await f.db
            .collection("bookletRevisions")
            .countDocuments({ artifactId: "style-image" }),
          0,
        );
        const saved = await f.append(
          "style-image",
          content,
          g.sources,
          [asset],
          "image-op",
        );
        assert.deepEqual(
          await f.repo.appendRevision("production", saved.input),
          saved.saved,
        );
        assert.equal(
          (await f.db
            .collection("bookletAssets")
            .findOne({ _id: retained.id as never }))!.attachments.length,
          1,
        );
        await assert.rejects(f.approve([saved.revision]), /quality review/);
        await f.quality(saved.revision);
        await f.approve([saved.revision]);
        await f.db
          .collection("consumptionOrders")
          .updateOne(
            { _id: "order" as never },
            { $set: { "value.expiresAt": "2020-01-01T00:00:00.000Z" } },
          );
        assert.equal(
          (await f.media.derivative("production", retained.id, 256))
            .originalAssetId,
          retained.id,
        );
        await assert.rejects(
          bookletMedia(f.db, { uid: "other", authTime: 1 }).read(
            "production",
            retained.id,
          ),
          /not found/,
        );
        await f.db
          .collection("bookletBooks")
          .updateOne(
            { _id: "book" as never },
            { $set: { "deletion.deletedAt": new Date() } },
          );
        await assert.rejects(
          f.media.read("production", retained.id),
          /not found/,
        );
      },
    );
    await t.test(
      "failed quality cannot be approved; one repair uses no customer revision allocation",
      async () => {
        const f = await fixture();
        const g = await f.generate();
        const asset = await f.media.retainOriginal(
          "production",
          {
            operationId: "image-op",
            outputKey: "original",
            sha256: sha(f.imageBytes),
            mime: "image/png",
          },
          f.imageBytes,
        );
        const ref = { assetId: asset.id, sha256: asset.sha256 };
        const first = await f.append(
          "style-image",
          {
            kind: "reference",
            description: "Style",
            requiredFeatures: [],
            asset: ref,
          },
          g.sources,
          [ref],
          "image-op",
        );
        await f.quality(first.revision, "repair");
        await assert.rejects(f.approve([first.revision]), /quality review/);
        await f.service.authorizeGeneration("production", {
          ...(await f.mutation()),
          runId: "run",
          operationId: "repair",
          artifactId: "style-image",
          sources: g.sources,
          repairRevisionId: first.revision._id,
        });
        assert.equal(
          await f.db.collection("consumptionAllocations").countDocuments(),
          0,
        );
        const repaired = await f.media.retainOriginal(
          "production",
          {
            operationId: "repair",
            outputKey: "original",
            sha256: sha(f.imageBytes),
            mime: "image/png",
          },
          f.imageBytes,
        );
        const repairedRef = { assetId: repaired.id, sha256: repaired.sha256 };
        const second = await f.append(
          "style-image",
          {
            kind: "reference",
            description: "Style",
            requiredFeatures: [],
            asset: repairedRef,
          },
          g.sources,
          [repairedRef],
          "repair",
        );
        await f.quality(second.revision, "repair");
        await assert.rejects(
          f.service.authorizeGeneration("production", {
            ...(await f.mutation()),
            runId: "run",
            operationId: "repair-again",
            artifactId: "style-image",
            sources: g.sources,
            repairRevisionId: second.revision._id,
          }),
          /repair budget exhausted/,
        );
      },
    );
    await t.test(
      "revision quotes allocate once and refunds revoke continuation",
      async () => {
        const f = await fixture();
        await f.db.collection("aiJobs").updateOne(
          { _id: "run" as never },
          {
            $set: {
              status: "succeeded",
              terminationEvidence: "provider-finished",
            },
          },
        );
        await f.service.finishRun("production", f.started.workflowId);
        const request = {
          requestId: "story-revision",
          expectedVersion: (await f.repo.getProduction("production")).version,
          category: "story" as const,
          subjects: [],
          inputHash: "b".repeat(64),
        };
        const quote = await f.service.quoteRevision("production", request);
        const workflowId = await f.service.startRevision(
          "production",
          request,
          quote.hash,
          quote.credits,
        );
        assert.equal(
          await f.service.startRevision(
            "production",
            request,
            quote.hash,
            quote.credits,
          ),
          workflowId,
        );
        assert.equal(
          await f.db.collection("consumptionAllocations").countDocuments(),
          1,
        );
        await abandonUnboundWorkflow(f.db, actor, "order", workflowId);
        await f.db
          .collection("consumptionOrders")
          .updateOne(
            { _id: "order" as never },
            { $set: { "value.state": "refunded" } },
          );
        await assert.rejects(
          f.service.continue("production", "after-refund"),
          /closed|unavailable/,
        );
      },
    );
    await t.test(
      "uncertain object writes resume the same original without another generation",
      async () => {
        const f = await fixture();
        await f.generate();
        const objects = new Map<string, Buffer>();
        let lose = true;
        const store: PrivateObjectStore = {
          id: "fake-private",
          key: (id) => id,
          async put(key, bytes) {
            objects.set(key, Buffer.from(bytes));
            if (lose) {
              lose = false;
              throw new Error("Lost response");
            }
            return { storeId: "fake-private", key };
          },
          async get(ref) {
            const bytes = objects.get(ref.key);
            if (!bytes) throw new Error("Missing");
            return bytes;
          },
          async head(ref) {
            const bytes = objects.get(ref.key);
            return bytes ? { bytes: bytes.length, digest: sha(bytes) } : null;
          },
          async remove(ref) {
            objects.delete(ref.key);
          },
        };
        const media = bookletMedia(f.db, actor, { store });
        const input = {
          operationId: "image-op",
          outputKey: "original",
          sha256: sha(f.imageBytes),
          mime: "image/png",
        };
        await assert.rejects(
          media.retainOriginal("production", input, f.imageBytes),
          /Lost response/,
        );
        assert.equal(
          await f.db
            .collection("bookletAssets")
            .countDocuments({ state: "staging" }),
          1,
        );
        const asset = await media.retainOriginal(
          "production",
          input,
          f.imageBytes,
        );
        assert.equal(objects.size, 1);
        assert.equal(
          await f.db.collection("bookletGenerations").countDocuments(),
          1,
        );
        assert.deepEqual(
          (await media.read("production", asset.id)).bytes,
          f.imageBytes,
        );
        await assert.rejects(
          media.retainOriginal(
            "production",
            { ...input, outputKey: "second" },
            f.imageBytes,
          ),
          /already has a retained original/,
        );
        await assert.rejects(
          media.retainOriginal(
            "production",
            { ...input, sha256: "0".repeat(64) },
            f.imageBytes,
          ),
          /correct hash/,
        );
        const small = bookletMedia(f.db, actor, { store, maxBytes: 1 });
        await assert.rejects(
          small.retainOriginal("production", input, f.imageBytes),
          /correct hash/,
        );
        objects.set([...objects.keys()][0], Buffer.from("corrupt"));
        await assert.rejects(
          media.read("production", asset.id),
          /hash differs/,
        );
      },
    );
    await t.test(
      "approved original routing is ordered and limited to the page's subjects",
      async () => {
        const f = await fixture();
        const g = await f.generate();
        const asset = await f.media.retainOriginal(
          "production",
          {
            operationId: "image-op",
            outputKey: "original",
            sha256: sha(f.imageBytes),
            mime: "image/png",
          },
          f.imageBytes,
        );
        const ref = { assetId: asset.id, sha256: asset.sha256 };
        const saved = await f.append(
          "style-image",
          {
            kind: "reference",
            description: "Style",
            requiredFeatures: [],
            asset: ref,
          },
          g.sources,
          [ref],
          "image-op",
        );
        await f.quality(saved.revision);
        await f.approve([
          saved.revision,
          f.plan.revision,
          f.description.revision,
        ]);
        const sources = [
          f.identity(f.story.revision),
          f.identity(f.plan.revision),
          f.identity(saved.revision),
        ];
        await assert.rejects(
          f.service.authorizeGeneration("production", {
            ...(await f.mutation()),
            operationId: "bad-page",
            artifactId: "image",
            runId: "run",
            sources: [...sources, f.identity(f.description.revision)],
          }),
          /unrelated/,
        );
        await f.service.authorizeGeneration("production", {
          ...(await f.mutation()),
          operationId: "page-op",
          artifactId: "image",
          runId: "run",
          sources,
        });
        const routed = await f.media.references("production", "page-op");
        assert.deepEqual(
          routed.map((r) => [r.revisionId, r.assetId, r.sha256]),
          [[saved.revision._id, asset.id, asset.sha256]],
        );
        assert.deepEqual(routed[0].bytes, f.imageBytes);
        const p = await f.repo.getProduction("production");
        assert.ok(p.stageLocks.style);
        assert.ok(p.stageLocks.references);
        await assert.rejects(
          f.service.quoteRevision("production", {
            requestId: "late-reference",
            expectedVersion: (await f.repo.getProduction("production")).version,
            category: "reference",
            subjects: ["character"],
            inputHash: "a".repeat(64),
          }),
          /locked/,
        );
        const pageAsset = await f.media.retainOriginal(
          "production",
          {
            operationId: "page-op",
            outputKey: "original",
            sha256: sha(f.imageBytes),
            mime: "image/png",
          },
          f.imageBytes,
        );
        const pageRef = { assetId: pageAsset.id, sha256: pageAsset.sha256 };
        const page = await f.append(
          "image",
          { kind: "page-image", asset: pageRef },
          sources,
          [pageRef],
          "page-op",
        );
        const reviewerInputs = await f.media.reviewerInputs(
          "production",
          page.revision._id,
        );
        assert.deepEqual(reviewerInputs.original.bytes, f.imageBytes);
        assert.deepEqual(
          reviewerInputs.referenceImages.map((r) => r.asset.id),
          [asset.id],
        );
        const review = await f.quality(page.revision);
        const pageRequest = await f.request([page.revision]);
        const answer = await f.answer(pageRequest);
        await f.service.applyDecision("production", answer);
        await f.repo.addArtifact("production", {
          ...(await f.mutation()),
          subjectId: "book-subject",
          artifactId: "manifest",
          kind: "book-manifest",
        });
        const acceptedSources = [...sources, f.identity(page.revision)];
        const manifest = await f.append(
          "manifest",
          {
            kind: "book-manifest",
            title: "Lantern",
            language: { tag: "en", direction: "ltr" },
            acceptedSources,
            pages: [
              {
                subjectId: "page",
                role: "story",
                index: 0,
                revision: f.identity(page.revision),
                asset: pageRef,
                qualityReviewId: review.id,
                approvalDecisionId: answer.decisionId,
              },
            ],
          },
          acceptedSources,
          [pageRef],
        );
        await assert.rejects(
          f.service.complete("production", {
            ...(await f.mutation()),
            runId: "run",
            manifestRevisionId: manifest.revision._id,
          }),
          /unaccepted/,
        );
        await f.approve([manifest.revision]);
        const completion = {
          ...(await f.mutation()),
          runId: "run",
          manifestRevisionId: manifest.revision._id,
        };
        const completed = await f.service.complete("production", completion);
        assert.deepEqual(
          await f.service.complete("production", completion),
          completed,
        );
        assert.equal(
          (await f.repo.getProduction("production")).lifecycleState,
          "completed",
        );
        assert.equal(
          (await f.repo.getProduction("production")).currentManifestRevisionId,
          manifest.revision._id,
        );
      },
    );
    await t.test(
      "production-specific Run admission binds consumption and never reserves credits",
      async () => {
        const f = await fixture();
        await f.db.collection("aiJobs").deleteOne({ _id: "run" as never });
        await f.db
          .collection("consumptionWorkflows")
          .updateOne(
            { _id: f.started.workflowId as never },
            { $set: { jobId: null } },
          );
        const definition = orchestratorSchema.parse({
          id: "booklet-test",
          name: "Booklet fixture",
          description: "Fake",
          order: 0,
          keyEnv: "DIFY_KEY_TEST",
          enabled: true,
          domainAdapter: { id: "booklet", version: "1" },
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
        const oldMode = process.env.DIFY_MODE;
        try {
          process.env.DIFY_MODE = "fake";
          const input = {
            key: "real-run-admission",
            workflowId: f.started.workflowId,
            orchestratorId: definition.id,
            configurationRevision: 1,
            inputs: {},
          };
          const result = await enqueueBookletRun(
            f.db,
            actor,
            "production",
            input,
          );
          assert.deepEqual(
            await enqueueBookletRun(f.db, actor, "production", input),
            result,
          );
          const job = await f.db
            .collection("aiJobs")
            .findOne({ _id: result.attemptId as never });
          assert.equal(job!.credits, 0);
          assert.equal(job!.reservationId, null);
          assert.equal(job!.consumption.orderId, "order");
          await assert.rejects(
            enqueueBookletRun(f.db, actor, "production", {
              ...input,
              inputs: { secret: "bad" },
            }),
            /changed inputs/,
          );
          assert.equal(
            await f.db.collection("consumptionCharges").countDocuments(),
            1,
          );
        } finally {
          if (oldMode === undefined) delete process.env.DIFY_MODE;
          else process.env.DIFY_MODE = oldMode;
        }
      },
    );
    await t.test(
      "paid restart keeps prior content immutable and requires explicit human reuse acceptance",
      async () => {
        const f = await fixture();
        await f.approve([f.story.revision]);
        const old = await f.repo.getProduction("production");
        const order = await f.db
          .collection("consumptionOrders")
          .findOne({ _id: "order" as never });
        assert.ok(order);
        await f.db.collection("consumptionOrders").insertOne({
          ...order,
          _id: "order-2" as never,
          value: {
            ...order.value,
            id: "order-2",
            targetId: "production-2",
            state: "queued",
            chargedCredits: 0,
            chargeLedgerId: null,
            startedAt: null,
            idempotencyKey: "restart",
          },
          activeWorkflow: null,
        });
        const cfg = old.creativeConfigSnapshot;
        await f.repo.createProduction({
          id: "production-2",
          bookletId: "book",
          sourceProductionId: "production",
          orderId: "order-2",
          brief: old.brief,
          key: "restart",
          capacity: {
            id: cfg.executionProfileId,
            revision: cfg.executionProfileRevision,
            maxStoryPages: 5,
            coverSupported: true,
            maxCharacters: 5,
            maxLocations: 5,
            maxPanelsPerPage: 5,
            maxStyleSamples: 5,
            canvases: [cfg.canvas],
            languages: cfg.languages,
          },
        });
        await f.repo.acquireLease("production-2", {
          key: "lease",
          expectedVersion: 1,
          holderId: "worker",
          durationMs: 300000,
        });
        let k = 0;
        const mutation = async () => ({
          key: `new-${++k}`,
          expectedVersion: (await f.repo.getProduction("production-2")).version,
          holderId: "worker",
          fence: 1,
        });
        await f.repo.addSubject("production-2", {
          ...(await mutation()),
          subject: {
            id: "book-subject",
            kind: "book",
            label: "Book",
            pageRole: null,
          },
        });
        await f.repo.addArtifact("production-2", {
          ...(await mutation()),
          subjectId: "book-subject",
          artifactId: "story",
          kind: "manuscript",
        });
        const started = await f.service.start("production-2");
        await f.db.collection("aiJobs").insertOne({
          ...f.job,
          _id: "run-2" as never,
          consumption: { orderId: "order-2", workflowId: started.workflowId },
          run: {
            ...f.job.run,
            target: { ...f.job.run.target, id: "production-2" },
          },
        });
        const source = f.identity(f.story.revision);
        const append = async (operationId: string) =>
          f.repo.appendRevision("production-2", {
            ...(await mutation()),
            artifactId: "story",
            content: f.story.revision.content,
            sources: [source],
            assets: [],
            provenance: { operationId, runId: "run-2", evidenceIds: [] },
          });
        await assert.rejects(
          append("unaccepted-reuse"),
          /explicit human acceptance/,
        );
        const request = await f.service.requestReview("production-2", {
          ...(await mutation()),
          runId: "run-2",
          targets: [source],
          reuse: true,
        });
        await f.db.collection("runDecisions").insertOne({
          _id: "reuse-answer" as never,
          uid: actor.uid,
          jobId: "run-2",
          status: "submitted",
          answerSource: { type: "user" },
          approval: request.approval,
          confirmedAction: "approve",
          form: { form_content: request.formContent },
        });
        await f.service.applyDecision("production-2", {
          ...(await mutation()),
          requestId: request.id,
          decisionId: "reuse-answer",
        });
        const copied = await append(request.id);
        assert.deepEqual(
          (await f.repo.getRevision("production-2", copied.revisionId!))
            .content,
          f.story.revision.content,
        );
        assert.deepEqual(await f.repo.getProduction("production"), old);
        assert.equal(
          await f.db
            .collection("consumptionCharges")
            .countDocuments({ kind: "package" }),
          2,
        );
      },
    );
    await t.test(
      "unknown image outcomes remain unresolved until a measured provider receipt arrives",
      async () => {
        const f = await fixture();
        const g = await f.generate();
        const base = {
          schemaVersion: 1,
          operationId: "image-op",
          runId: "logical",
          provider: "fake",
          model: "image",
          requestId: "provider-request",
          workflowRunId: "provider-workflow",
          publicationId: "image-publication",
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
          evidence: [],
        };
        await recordMeasurement(f.db, actor.uid, {
          ...base,
          id: "unknown-measurement",
          outcome: "unknown",
        });
        await f.service.reconcileGeneration(
          "production",
          "image-op",
          "unknown-measurement",
        );
        assert.equal(
          (await f.service.inspectGeneration("production", "image-op")).state,
          "unknown",
        );
        await assert.rejects(
          f.service.authorizeGeneration("production", {
            ...g.input,
            ...(await f.mutation()),
            operationId: "automatic-replay",
          }),
          /existing generation/,
        );
        await recordMeasurement(f.db, actor.uid, {
          ...base,
          id: "unproven-failure",
          outcome: "failed",
        });
        await assert.rejects(
          f.service.reconcileGeneration(
            "production",
            "image-op",
            "unproven-failure",
          ),
          /provider receipt/,
        );
        const receipt = await retainEvidence(f.db, actor.uid, {
          id: "failed-receipt",
          runId: "logical",
          operationId: "image-op",
          kind: "provider-receipt",
          payload: { outcome: "failed", requestId: "provider-request" },
        });
        await recordMeasurement(f.db, actor.uid, {
          ...base,
          id: "verified-failure",
          outcome: "failed",
          evidence: [receipt],
        });
        await f.service.reconcileGeneration(
          "production",
          "image-op",
          "verified-failure",
        );
        assert.equal(
          (await f.service.inspectGeneration("production", "image-op")).state,
          "failed",
        );
        assert.ok((await f.repo.getProduction("production")).stageLocks.story);
      },
    );
  } finally {
    await client.close();
    await mongo.stop();
  }
});
