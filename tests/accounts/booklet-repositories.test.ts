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
          targetIds: ["story-v2"],
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
              coverage: { targetIds: ["story-v2"], referencePositions: [] },
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
              ],
              limitations: [],
            },
          }),
        );
        const correction = {
          rootId,
          family: "llm" as const,
          findingIds: ["missing-text"],
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
        for (let n = 1; n <= 3; n++) {
          const attempt = {
            ...initial,
            callId: "correction-" + n,
            runId: "fresh-run-" + n,
            actionKey: fingerprint("corrective-action-" + n),
            requestHash: fingerprint("corrective-request-" + n),
            correction,
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
            n,
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
          { rootId, family: "llm", targetIds: ["story-v2"], used: 3, limit: 3 },
        );
        assert.equal(
          (await f.v2.getWork("production-v2", exhausted.callId)).status,
          "registered",
        );
        const image = {
          ...initial,
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
