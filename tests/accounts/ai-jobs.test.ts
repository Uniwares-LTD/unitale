import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  aiJobs,
  aiUsage,
  claimAiJob,
  createAiIndexes,
  createAiJob,
  patchAiJob,
  persistAiEvent,
  settleAiJob,
  resolveAiJob,
  canStartNewAttempt,
} from "../../src/lib/server/ai/jobs";
import { appointFirstAdmin } from "../../src/lib/server/store/access";
import {
  createCreditIndexes,
  finishReservation,
  grantCredits,
  readCreditAccount,
  readWallet,
  reversePurchase,
} from "../../src/lib/server/store/credits";
import {
  retainEvidence,
  readEvidence,
} from "../../src/lib/server/execution/measurements";
import { nodeObservation } from "../../src/lib/server/ai/node-observation";
import { processOneAiJob } from "../../src/lib/server/ai/worker";
import type {
  ProviderExecution,
  WorkflowProvider,
} from "../../src/lib/server/ai/types";

const start = new Date("2030-01-01T00:00:00Z");
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const actor = { uid: "owner", authTime: Math.floor(Date.now() / 1000) };
const request = {
  capability: "example",
  capabilityVersion: "1",
  binding: {
    name: "example",
    revision: "1",
    kind: "workflow" as const,
    mode: "fake" as const,
    fingerprint: "fake-1",
  },
  inputs: { text: "hello" },
  source: null,
  credits: 5,
};
const runId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const execution: ProviderExecution = {
  runId,
  workflowId: "00000000-0000-4000-8000-000000000003",
  status: "succeeded",
  outputs: { text: "done" },
  usage: {
    scope: "execution",
    id: runId,
    inputTokens: null,
    outputTokens: null,
    totalTokens: 10,
    cost: null,
    elapsedMs: 500,
  },
};

test("durable AI jobs, credit boundaries and recovery", async (t) => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  await client.connect();
  let sequence = 0;
  async function fixture() {
    const db = client.db(`ai_${++sequence}`);
    await createCreditIndexes(db);
    await createAiIndexes(db);
    await grantCredits(
      db,
      actor.uid,
      "fixture",
      { amount: 100, source: "purchase", reference: "fixture" },
      { now: start },
    );
    return db;
  }
  try {
    await t.test(
      "private observations are fenced, transactional and never public Run events",
      async () => {
        const db = await fixture();
        await createAiJob(db, actor, "observations", request, start);
        const job = await claimAiJob(db, start);
        assert.ok(job);
        await persistAiEvent(
          db,
          job,
          { type: "identity", runId, taskId },
          start,
        );
        const node = nodeObservation(runId, {
          id: "child",
          node_id: "child",
          status: "succeeded",
          outputs: { secret: "private" },
        });
        const event = { type: "node-observation" as const, node };
        let seen = 0;
        const observe = async (
          current: typeof job,
          value: typeof node,
          session: import("mongodb").ClientSession,
        ) => {
          assert.equal(current.runId, runId);
          assert.equal(current.uid, actor.uid);
          assert.equal(value.outputs?.secret, "private");
          seen++;
          await retainEvidence(
            db,
            current.uid,
            {
              id: value.id,
              runId: current.runId!,
              operationId: "accepted-operation",
              kind: "trace",
              payload: value,
              retentionDays: 1,
            },
            session,
          );
          await db
            .collection("fixturePrivateObservations")
            .updateOne(
              { id: value.id },
              { $set: { value } },
              { upsert: true, session },
            );
        };
        await persistAiEvent(db, job, event, start); // Default ignores private events.
        assert.equal(
          await db.collection("fixturePrivateObservations").countDocuments(),
          0,
        );
        await persistAiEvent(db, job, event, start, observe);
        await persistAiEvent(db, job, event, start, observe);
        assert.equal(seen, 2);
        assert.equal(
          await db.collection("fixturePrivateObservations").countDocuments(),
          1,
        );
        assert.equal(
          JSON.stringify(await readEvidence(db, actor.uid, "child")).includes(
            '"secret":"private"',
          ),
          false,
        );
        assert.equal(
          await db.collection("executionEvidence").countDocuments(),
          1,
        );
        assert.equal(await db.collection("runEvents").countDocuments(), 0);
        assert.equal(await aiUsage(db).countDocuments(), 0);
        await assert.rejects(
          persistAiEvent(
            db,
            job,
            { ...event, node: { ...node, runId: taskId } },
            start,
            observe,
          ),
        );
        assert.equal(seen, 2);
        await assert.rejects(
          persistAiEvent(
            db,
            job,
            { ...event, node: { ...node, id: "rollback" } },
            start,
            async (current, value, session) => {
              await observe(current, value, session);
              throw new Error("fixture retention failed");
            },
          ),
          /retention failed/,
        );
        assert.equal(
          await db.collection("fixturePrivateObservations").countDocuments(),
          1,
        );
        await assert.rejects(readEvidence(db, actor.uid, "rollback"));
        assert.equal(
          await db.collection("executionEvidence").countDocuments(),
          1,
        );
        const idleSession = client.startSession();
        try {
          await assert.rejects(
            retainEvidence(
              db,
              actor.uid,
              {
                id: "idle",
                runId,
                operationId: "accepted-operation",
                kind: "trace",
                payload: {},
                retentionDays: 1,
              },
              idleSession,
            ),
            /active caller transaction/,
          );
        } finally {
          await idleSession.endSession();
        }
        const beforeExpired = seen;
        await assert.rejects(persistAiEvent(db, job, event, at(4), observe));
        assert.equal(seen, beforeExpired);
      },
    );
    await t.test(
      "concurrent duplicate submission creates one job/hold and changed inputs conflict",
      async () => {
        const db = await fixture();
        const jobs = await Promise.all(
          Array.from({ length: 4 }, () =>
            createAiJob(db, actor, "same-key", request, start),
          ),
        );
        assert.equal(new Set(jobs.map((job) => job._id)).size, 1);
        assert.equal(await aiJobs(db).countDocuments(), 1);
        assert.equal(
          await db.collection("creditReservations").countDocuments(),
          1,
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: start })).reserved,
          5,
        );
        await assert.rejects(
          createAiJob(
            db,
            actor,
            "same-key",
            { ...request, inputs: { text: "changed" } },
            start,
          ),
          /different inputs/,
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: start })).reserved,
          5,
        );
      },
    );
    await t.test(
      "managed holds survive expiry and reject ordinary settlement",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "long-running",
          request,
          start,
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: at(60) })).reserved,
          5,
        );
        const account = await readCreditAccount(db, actor.uid, undefined, {
          now: at(60),
        });
        assert.equal(account.holds[0].managedJobId, saved._id);
        await assert.rejects(
          finishReservation(
            db,
            actor,
            "bypass",
            saved.reservationId!,
            "release",
            { now: at(60) },
          ),
          /must be settled by its execution/,
        );
        const job = await claimAiJob(db, at(60));
        assert.ok(job);
        await persistAiEvent(
          db,
          job,
          { type: "identity", runId, taskId },
          at(60),
        );
        await persistAiEvent(db, job, { type: "execution", execution }, at(60));
        await settleAiJob(db, job, "succeeded", at(60));
        await settleAiJob(db, job, "succeeded", at(60));
        const wallet = await readWallet(db, actor.uid, { now: at(60) });
        assert.equal(wallet.balance, 95);
        assert.equal(wallet.reserved, 0);
      },
    );
    await t.test(
      "stale worker cannot publish or charge after lease expiry",
      async () => {
        const db = await fixture();
        await createAiJob(db, actor, "lease", request, start);
        const first = await claimAiJob(db, start);
        assert.ok(first);
        await patchAiJob(db, first, { status: "dispatching" }, start);
        await persistAiEvent(
          db,
          first,
          { type: "identity", runId, taskId },
          start,
        );
        await persistAiEvent(
          db,
          first,
          { type: "execution", execution },
          start,
        );
        const second = await claimAiJob(db, at(4));
        assert.ok(second);
        await assert.rejects(
          settleAiJob(db, first, "succeeded", at(4)),
          /execution changed/,
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: at(4) })).balance,
          100,
        );
        await settleAiJob(db, second, "failed", at(4));
        assert.equal(
          (await readWallet(db, actor.uid, { now: at(4) })).reserved,
          0,
        );
      },
    );
    await t.test(
      "usage deduplicates and enrichment preserves exact reported cost",
      async () => {
        const db = await fixture();
        await createAiJob(db, actor, "usage", request, start);
        const job = await claimAiJob(db, start);
        assert.ok(job);
        await persistAiEvent(
          db,
          job,
          { type: "identity", runId, taskId },
          start,
        );
        await persistAiEvent(
          db,
          job,
          {
            type: "execution",
            execution: {
              ...execution,
              status: "running",
              usage: { ...execution.usage, totalTokens: null },
            },
          },
          start,
        );
        await persistAiEvent(db, job, { type: "execution", execution }, start);
        for (let i = 0; i < 2; i++)
          await persistAiEvent(
            db,
            job,
            {
              type: "usage",
              usage: {
                ...execution.usage,
                scope: "node",
                id: "node-1",
                cost: {
                  amount: "0.000000000000001234",
                  currency: "USD",
                  source: "provider",
                },
              },
            },
            start,
          );
        assert.equal(await aiUsage(db).countDocuments(), 2);
        assert.equal(
          (await aiUsage(db).findOne({ scope: "execution" }))?.totalTokens,
          10,
        );
        assert.equal(
          (await aiUsage(db).findOne({ scope: "node" }))?.cost?.amount,
          "0.000000000000001234",
        );
      },
    );
    await t.test(
      "worker forwards private observations with the authoritative identity",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "worker-observation",
          request,
          start,
        );
        let observed = 0;
        const provider: WorkflowProvider = {
          async start(_input, observe) {
            await observe({ type: "identity", runId, taskId });
            await observe({
              type: "node-observation",
              node: nodeObservation(runId, {
                id: "child",
                node_id: "child",
                status: "retry",
                retry_index: 1,
              }),
            });
            return { kind: "ok", value: execution };
          },
          async retrieve() {
            throw new Error("Unexpected retrieve");
          },
          async stop() {
            return { kind: "ok", value: undefined };
          },
        };
        await processOneAiJob(db, {
          provider: () => provider,
          authorize: async () => true,
          validateOutput: () => true,
          now: () => start,
          observeNode: async (job, node, session) => {
            assert.equal(job._id, saved._id);
            assert.equal(job.runId, runId);
            assert.equal(job.uid, actor.uid);
            assert.equal(node.retryIndex, 1);
            assert(session.inTransaction());
            observed++;
          },
        });
        assert.equal(observed, 1);
        assert.equal(await db.collection("runEvents").countDocuments(), 0);
        assert.equal(
          (await aiJobs(db).findOne({ _id: saved._id }))?.status,
          "succeeded",
        );
      },
    );
    await t.test(
      "restart after accepted POST retrieves instead of starting twice",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(db, actor, "restart", request, start);
        let starts = 0;
        let retrieves = 0;
        let clock = start;
        const provider: WorkflowProvider = {
          async start(_input, observe) {
            starts++;
            await observe({ type: "identity", runId, taskId });
            return { kind: "unknown", failure: "transport" };
          },
          async retrieve() {
            retrieves++;
            return { kind: "ok", value: execution };
          },
          async stop() {
            return { kind: "ok", value: undefined };
          },
        };
        const deps = {
          provider: () => provider,
          authorize: async () => true,
          validateOutput: () => true,
          now: () => clock,
        };
        await processOneAiJob(db, deps);
        clock = at(20);
        await processOneAiJob(db, deps);
        assert.equal(starts, 1);
        assert.equal(retrieves, 1);
        assert.equal(
          (await aiJobs(db).findOne({ _id: saved._id }))?.status,
          "succeeded",
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: clock })).balance,
          95,
        );
      },
    );
    await t.test(
      "accepted stream timeout polls on schedule instead of exponential backoff",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "accepted-timeout",
          request,
          start,
        );
        let clock = start;
        let starts = 0;
        let retrieves = 0;
        const deps = {
          now: () => clock,
          authorize: async () => true,
          validateOutput: () => true,
          provider: (): WorkflowProvider => ({
            start: async (_, observe) => {
              starts++;
              await observe({ type: "identity", runId, taskId });
              await aiJobs(db).updateOne(
                { _id: saved._id },
                { $set: { attempts: 8 } },
              );
              return { kind: "unknown", failure: "timeout" };
            },
            retrieve: async () => {
              retrieves++;
              return { kind: "ok", value: execution };
            },
            stop: async () => ({ kind: "ok", value: undefined }),
          }),
        };
        await processOneAiJob(db, deps);
        assert.equal(
          (
            await aiJobs(db).findOne({ _id: saved._id })
          )?.nextAttemptAt.getTime(),
          start.getTime() + 5000,
        );
        clock = new Date(start.getTime() + 4999);
        assert.equal(await processOneAiJob(db, deps), false);
        clock = new Date(start.getTime() + 5000);
        assert.equal(await processOneAiJob(db, deps), true);
        assert.equal(starts, 1);
        assert.equal(retrieves, 1);
        assert.equal(
          (await aiJobs(db).findOne({ _id: saved._id }))?.status,
          "succeeded",
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: clock })).reserved,
          0,
        );
      },
    );
    await t.test(
      "unknown acceptance requires review and retains credits without replay",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(db, actor, "unknown", request, start);
        let starts = 0;
        const provider: WorkflowProvider = {
          async start() {
            starts++;
            return { kind: "unknown", failure: "transport" };
          },
          async retrieve() {
            throw new Error("No identity to retrieve");
          },
          async stop() {
            return { kind: "ok", value: undefined };
          },
        };
        const deps = {
          provider: () => provider,
          authorize: async () => true,
          validateOutput: () => true,
          now: () => start,
        };
        await processOneAiJob(db, deps);
        assert.equal(await processOneAiJob(db, deps), false);
        assert.equal(starts, 1);
        assert.equal(
          (await aiJobs(db).findOne({ _id: saved._id }))?.status,
          "needs-review",
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: at(60) })).reserved,
          5,
        );
      },
    );
    await t.test(
      "operator release requires current admin authority and writes an audit record atomically",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(db, actor, "resolve", request, start);
        const claimed = await claimAiJob(db, start);
        assert.ok(claimed);
        await patchAiJob(
          db,
          claimed,
          { status: "needs-review", lease: null, leaseUntil: new Date(0) },
          start,
        );
        await assert.rejects(
          resolveAiJob(
            db,
            actor,
            saved._id,
            "release",
            "Verified test resolution",
            () => true,
            start,
          ),
          { code: "FORBIDDEN" },
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: start })).reserved,
          5,
        );
        assert.equal(
          await db
            .collection("auditEvents")
            .countDocuments({ event: "ai-resolution" }),
          0,
        );
        await appointFirstAdmin(db, "operator", "Local AI fixture operator");
        await resolveAiJob(
          db,
          { uid: "operator", authTime: actor.authTime },
          saved._id,
          "release",
          "",
          () => true,
          start,
        );
        assert.equal(
          canStartNewAttempt((await aiJobs(db).findOne({ _id: saved._id }))!),
          false,
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: start })).reserved,
          0,
        );
        assert.equal(
          (await readWallet(db, actor.uid, { now: start })).balance,
          100,
        );
        assert.equal(
          await db
            .collection("auditEvents")
            .countDocuments({ event: "ai-resolution", targetUid: actor.uid }),
          1,
        );
      },
    );
    await t.test(
      "successful execution racing cancellation is charged, but reversed funding blocks settlement",
      async () => {
        for (const reverse of [false, true]) {
          const db = await fixture();
          const saved = await createAiJob(db, actor, "race", request, start);
          const provider: WorkflowProvider = {
            async start(_input, observe) {
              await observe({ type: "identity", runId, taskId });
              await aiJobs(db).updateOne(
                { _id: saved._id },
                { $set: { cancelRequested: true } },
              );
              if (reverse)
                await reversePurchase(db, actor.uid, "refund", "fixture", 100, {
                  now: start,
                });
              return { kind: "ok", value: execution };
            },
            async retrieve() {
              throw new Error("Unexpected recovery");
            },
            async stop() {
              throw new Error("Success already observed");
            },
          };
          await processOneAiJob(db, {
            provider: () => provider,
            authorize: async () => true,
            validateOutput: () => true,
            now: () => start,
          });
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.status,
            reverse ? "settlement-blocked" : "succeeded",
          );
          const wallet = await readWallet(db, actor.uid, { now: start });
          assert.equal(wallet.balance, reverse ? 0 : 95);
          assert.equal(wallet.reserved, 0);
          assert.equal(
            await aiUsage(db).countDocuments({ jobId: saved._id }),
            1,
          );
        }
      },
    );
    await t.test(
      "feature materialization and credit settlement roll back together and recover without generation",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "materialize",
          request,
          start,
        );
        let starts = 0;
        let clock = start;
        let fail = true;
        const provider: WorkflowProvider = {
          async start(_input, observe) {
            starts++;
            await observe({ type: "identity", runId, taskId });
            await observe({ type: "execution", execution });
            return { kind: "ok", value: execution };
          },
          async retrieve() {
            throw new Error("Saved result should be reused");
          },
          async stop() {
            return { kind: "ok", value: undefined };
          },
        };
        const deps: import("../../src/lib/server/ai/worker").AiWorkerDependencies =
          {
            provider: () => provider,
            authorize: async () => true,
            validateOutput: () => true,
            now: () => clock,
            materialize: async (job, _result, session) => {
              await db
                .collection<{ _id: string; text: string }>("featureResults")
                .insertOne({ _id: job._id, text: "materialized" }, { session });
              if (fail) throw new Error("Required feature write failed");
            },
          };
        await processOneAiJob(db, deps);
        const reconciling = await aiJobs(db).findOne({ _id: saved._id });
        assert.equal(reconciling?.status, "unknown");
        assert.equal(reconciling?.failure, "settlement-failed");
        assert.equal(reconciling?.execution?.status, "succeeded");
        assert.equal(await db.collection("featureResults").countDocuments(), 0);
        assert.equal(
          (await readWallet(db, actor.uid, { now: start })).balance,
          100,
        );
        clock = at(4);
        fail = false;
        await processOneAiJob(db, deps);
        assert.equal(starts, 1);
        assert.equal(await db.collection("featureResults").countDocuments(), 1);
        assert.equal(
          (await readWallet(db, actor.uid, { now: clock })).balance,
          95,
        );
        assert.equal(
          (await aiJobs(db).findOne({ _id: saved._id }))?.status,
          "succeeded",
        );
      },
    );
    await t.test(
      "permanent materialization failure escalates without refunding or regenerating",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "stale-source",
          request,
          start,
        );
        const claimed = await claimAiJob(db, start);
        assert.ok(claimed);
        await persistAiEvent(
          db,
          claimed,
          { type: "identity", runId, taskId },
          start,
        );
        await persistAiEvent(
          db,
          claimed,
          { type: "execution", execution },
          start,
        );
        await processOneAiJob(db, {
          now: () => at(24 * 60 + 1),
          provider: () => {
            throw new Error("Must reuse saved result");
          },
          authorize: async () => true,
          validateOutput: () => true,
          materialize: async () => {
            throw new Error("Source version no longer current");
          },
        });
        const job = await aiJobs(db).findOne({ _id: saved._id });
        assert.equal(job?.status, "needs-review");
        assert.equal(job?.failure, "settlement-failed");
        assert.equal(job?.execution?.status, "succeeded");
        const wallet = await readWallet(db, actor.uid, {
          now: at(24 * 60 + 1),
        });
        assert.equal(wallet.balance, 100);
        assert.equal(wallet.reserved, 5);
      },
    );
    await t.test(
      "confirmed rejection survives a crash before credit release without dispatching again",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "rejected-recovery",
          request,
          start,
        );
        const claimed = (await claimAiJob(db, start))!;
        await patchAiJob(
          db,
          claimed,
          {
            status: "dispatching",
            terminationEvidence: "provider-rejected",
            failure: "invalid-request",
            lease: null,
            leaseUntil: new Date(0),
          },
          start,
        );
        await processOneAiJob(db, {
          provider: () => {
            throw new Error(
              "Must not contact provider after confirmed rejection",
            );
          },
          authorize: async () => true,
          validateOutput: () => true,
          now: () => at(1),
        });
        const finished = (await aiJobs(db).findOne({ _id: saved._id }))!;
        assert.equal(finished.status, "failed");
        assert.equal(canStartNewAttempt(finished), true);
        assert.equal(
          (await readWallet(db, actor.uid, { now: at(1) })).reserved,
          0,
        );
      },
    );
    await t.test(
      "worker preserves paused and partial outcomes and releases only verified failures or queued cancellation",
      async () => {
        for (const status of [
          "queued-cancel",
          "paused",
          "partial-succeeded",
          "failed",
          "stopped",
          "rejected",
        ] as const) {
          const db = await fixture();
          const saved = await createAiJob(db, actor, status, request, start);
          if (status === "queued-cancel")
            await aiJobs(db).updateOne(
              { _id: saved._id },
              { $set: { cancelRequested: true } },
            );
          let starts = 0;
          await processOneAiJob(db, {
            authorize: async () => true,
            validateOutput: () => true,
            now: () => start,
            provider: () => ({
              async start(_input, observe) {
                starts++;
                assert.notEqual(status, "queued-cancel");
                if (status === "rejected")
                  return { kind: "rejected", failure: "invalid-request" };
                await observe({ type: "identity", runId, taskId });
                return {
                  kind: "ok",
                  value: {
                    ...execution,
                    status: status === "queued-cancel" ? "failed" : status,
                  },
                };
              },
              async retrieve() {
                throw new Error("Unexpected retrieval");
              },
              async stop() {
                throw new Error("Unexpected stop");
              },
            }),
          });
          const unresolved =
            status === "paused" || status === "partial-succeeded";
          assert.equal(
            canStartNewAttempt((await aiJobs(db).findOne({ _id: saved._id }))!),
            !unresolved,
          );
          assert.equal(starts, status === "queued-cancel" ? 0 : 1);
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.status,
            status === "queued-cancel" || status === "stopped"
              ? "cancelled"
              : status === "rejected"
                ? "failed"
                : status === "partial-succeeded"
                  ? "needs-review"
                  : status,
          );
          const wallet = await readWallet(db, actor.uid, { now: start });
          assert.equal(wallet.balance, 100);
          assert.equal(wallet.reserved, unresolved ? 5 : 0);
        }
      },
    );
    await t.test(
      "paused cancellation keeps its hold until provider confirms termination",
      async () => {
        const db = await fixture();
        const saved = await createAiJob(
          db,
          actor,
          "paused-cancel",
          request,
          start,
        );
        let clock = start;
        let stopped = false;
        let stopCalls = 0;
        const provider: WorkflowProvider = {
          async start(_input, observe) {
            await observe({ type: "identity", runId, taskId });
            return { kind: "ok", value: { ...execution, status: "paused" } };
          },
          async retrieve() {
            return {
              kind: "ok",
              value: { ...execution, status: stopped ? "stopped" : "paused" },
            };
          },
          async stop(task) {
            assert.equal(task, taskId);
            stopCalls++;
            return { kind: "ok", value: undefined };
          },
        };
        const deps = {
          provider: () => provider,
          authorize: async () => true,
          validateOutput: () => true,
          now: () => clock,
        };
        await processOneAiJob(db, deps);
        clock = at(1);
        await aiJobs(db).updateOne(
          { _id: saved._id },
          { $set: { cancelRequested: true, nextAttemptAt: clock } },
        );
        await processOneAiJob(db, deps);
        const pending = (await aiJobs(db).findOne({ _id: saved._id }))!;
        assert.equal(pending.status, "paused");
        assert.equal(canStartNewAttempt(pending), false);
        assert.equal(
          (await readWallet(db, actor.uid, { now: clock })).reserved,
          5,
        );
        stopped = true;
        clock = at(2);
        await aiJobs(db).updateOne(
          { _id: saved._id },
          { $set: { nextAttemptAt: clock } },
        );
        await processOneAiJob(db, deps);
        const finished = (await aiJobs(db).findOne({ _id: saved._id }))!;
        assert.equal(stopCalls, 2);
        assert.equal(finished.status, "cancelled");
        assert.equal(canStartNewAttempt(finished), true);
        const wallet = await readWallet(db, actor.uid, { now: clock });
        assert.equal(wallet.balance, 100);
        assert.equal(wallet.reserved, 0);
      },
    );
  } finally {
    await client.close();
    await repl.stop();
  }
});
