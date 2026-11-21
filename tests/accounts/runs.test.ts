import { domains } from "../../src/lib/server/domains";
import assert from "node:assert/strict";
import { processOneAiJob } from "../../src/lib/server/ai/worker";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readSettings } from "../../src/lib/server/settings";
import {
  createAiJob,
  claimAiJob,
  persistAiEvent,
  settleAiJob,
  aiJobs,
  canStartNewAttempt,
  fingerprint,
} from "../../src/lib/server/ai/jobs";
import { grantCredits, readWallet } from "../../src/lib/server/store/credits";
import {
  prepareResult,
  attachResult,
  readRunAsset,
} from "../../src/lib/server/runs/media";
import type { ProviderExecution } from "../../src/lib/server/ai/types";
import storyPanel from "../../src/lib/server/runs/templates/story-panel.json";
test("Runs: frozen policies, normalized decisions, media ownership and linked recovery", async (t) => {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: ".cache/mongodb-binaries" },
    replSet: { count: 1 },
  });
  const client = new MongoClient(repl.getUri());
  const db = client.db("runs");
  const now = new Date();
  const actor = {
    uid: "run-owner",
    authTime: Math.floor(now.getTime() / 1000),
  };
  try {
    const { settings } = await readSettings(db);
    await grantCredits(db, actor.uid, "seed", {
      amount: 20,
      source: "purchase",
      reference: "seed",
    });
    const definition = {
      id: "fixture",
      name: "Fixture",
      description: "",
      order: 0,
      keyEnv: "DIFY_KEY_FIXTURE",
      enabled: true,
      inputs: [],
      pricing: null,
      recovery: { version: "1", stages: ["draft"], diagnostic: true },
    };
    const key = randomUUID();
    const id = fingerprint([actor.uid, key]);
    const request = {
      capability: "orchestrator",
      capabilityVersion: "1",
      inputs: { prompt: "test" },
      binding: {
        name: "fixture",
        revision: "1",
        kind: "workflow" as const,
        mode: "fake" as const,
        fingerprint: "fixture",
      },
      source: null,
      credits: 1,
      pricing: { mode: "fixed" as const, credits: 1 },
      run: {
        ...settings.runs,
        logicalId: id,
        attempt: 1,
        predecessorId: null,
        orchestrator: definition,
        configurationRevision: 1,
        settingsRevision: 0,
      },
    };
    const job = await createAiJob(db, actor, key, request);
    const claimed = await claimAiJob(db, new Date());
    assert.ok(claimed);
    const runId = randomUUID();
    await persistAiEvent(db, claimed, {
      type: "identity",
      runId,
      taskId: randomUUID(),
    });
    await t.test(
      "internal waits preserve genuine human questions across parallel decision events",
      async () => {
        const waitKey = randomUUID();
        const saved = await createAiJob(db, actor, waitKey, {
          ...request,
          credits: 0,
          pricing: { mode: "fixed", credits: 0 },
          run: {
            ...request.run,
            logicalId: fingerprint([actor.uid, waitKey]),
            artifactId: "fixture",
          },
        });
        const claimed = await claimAiJob(db, new Date());
        assert.equal(claimed?._id, saved._id);
        assert.ok(claimed);
        const adapter = domains.get("artifact", "1");
        const previousNodes = adapter.applicationWaitNodes,
          previousResume = adapter.resumePaused;
        adapter.applicationWaitNodes = ["internal-wait"];
        adapter.resumePaused = async () => {};
        try {
          await persistAiEvent(db, claimed, {
            type: "identity",
            runId: randomUUID(),
            taskId: randomUUID(),
          });
          await persistAiEvent(db, claimed, {
            type: "decision",
            nodeId: "internal-wait",
            title: "Internal wait",
            token: "internal",
          });
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.applicationWait,
            true,
          );
          await persistAiEvent(db, claimed, {
            type: "decision",
            nodeId: "human-wait",
            title: "Real question",
            token: "human",
          });
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.applicationWait,
            false,
          );
          await persistAiEvent(db, claimed, {
            type: "decision-filled",
            nodeId: "human-wait",
            action: "continue",
            inputs: { response: "human answer" },
          });
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.applicationWait,
            true,
          );
          await persistAiEvent(db, claimed, {
            type: "decision-expired",
            nodeId: "internal-wait",
          });
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.applicationWait,
            false,
          );
          assert.equal(
            await db.collection("runEvents").countDocuments({
              jobId: saved._id,
              "event.nodeId": "internal-wait",
            }),
            0,
          );
          assert.equal(
            await db
              .collection("runEvents")
              .countDocuments({ jobId: saved._id, "event.type": "decision" }),
            1,
          );
          await settleAiJob(db, claimed, "failed");
        } finally {
          adapter.applicationWaitNodes = previousNodes;
          adapter.resumePaused = previousResume;
        }
      },
    );
    await t.test(
      "application wait eligibility uses the existing worker and never starts another execution",
      async () => {
        const waitKey = randomUUID();
        const saved = await createAiJob(db, actor, waitKey, {
          ...request,
          credits: 0,
          pricing: { mode: "fixed", credits: 0 },
          run: { ...request.run, logicalId: fingerprint([actor.uid, waitKey]) },
        });
        await aiJobs(db).updateOne(
          { _id: saved._id },
          { $set: { applicationWait: true } },
        );
        const startedAt = new Date();
        let clock = startedAt,
          starts = 0,
          retrieves = 0,
          resumes = 0;
        const due = new Date(clock.getTime() + 30000);
        const nativeId = randomUUID();
        const value: ProviderExecution = {
          runId: nativeId,
          workflowId: randomUUID(),
          status: "paused",
          outputs: null,
          usage: {
            scope: "execution",
            id: nativeId,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: null,
            elapsedMs: 1,
          },
        };
        const deps = {
          provider: () => ({
            async start(
              _input: unknown,
              observe: (
                event: import("../../src/lib/server/ai/types").ProviderEvent,
              ) => Promise<void>,
            ) {
              starts++;
              await observe({
                type: "identity",
                runId: nativeId,
                taskId: randomUUID(),
              });
              return {
                kind: "ok" as const,
                value: { ...value, status: "running" as const },
              };
            },
            async retrieve() {
              retrieves++;
              return {
                kind: "ok" as const,
                value: {
                  ...value,
                  status:
                    resumes >= 2 ? ("succeeded" as const) : ("paused" as const),
                },
              };
            },
            async stop() {
              return { kind: "ok" as const, value: undefined };
            },
          }),
          authorize: async () => true,
          validateOutput: () => true,
          now: () => clock,
          resumePaused: async (current: typeof saved) => {
            assert.equal(current._id, saved._id);
            assert.equal(current.runId, nativeId);
            resumes++;
            return resumes === 1 ? due : undefined;
          },
        };
        await processOneAiJob(db, deps);
        assert.equal(resumes, 0);
        assert.equal(
          (await aiJobs(db).findOne({ _id: saved._id }))?.applicationWait,
          true,
        );
        clock = new Date(
          startedAt.getTime() + settings.runs.pollSeconds * 1000,
        );
        await processOneAiJob(db, deps); // Running -> paused without a replayed decision event.
        const waiting = (await aiJobs(db).findOne({ _id: saved._id }))!;
        assert.equal(waiting.status, "paused");
        assert.equal(waiting.nextAttemptAt.getTime(), due.getTime());
        clock = new Date(due.getTime() - 1);
        assert.equal(await processOneAiJob(db, deps), false);
        clock = due;
        await processOneAiJob(db, deps);
        clock = new Date(due.getTime() + settings.runs.pollSeconds * 1000);
        await processOneAiJob(db, deps);
        const completed = (await aiJobs(db).findOne({ _id: saved._id }))!;
        assert.equal(completed.status, "succeeded");
        assert.equal(completed.runId, nativeId);
        assert.equal(starts, 1);
        assert.equal(retrieves, 3);
        assert.equal(completed.run?.attempt, 1);
      },
    );
    await t.test(
      "native images are retained privately and replay does not depend on expired provider links",
      async () => {
        const nativeJob = {
          ...job,
          _id: randomUUID(),
          binding: { ...job.binding, mode: "live" as const },
        };
        const imageId = randomUUID();
        const oldFetch = globalThis.fetch;
        const oldBase = process.env.DIFY_BASE_URL;
        let downloads = 0;
        process.env.DIFY_BASE_URL = "https://dify.example.test/v1";
        const { sampleImage } =
          await import("../../src/lib/server/runs/sample");
        globalThis.fetch = async () => {
          downloads++;
          return new Response(Buffer.from(sampleImage, "base64"), {
            headers: { "content-type": "image/png" },
          });
        };
        const execution: ProviderExecution = {
          runId,
          workflowId: null,
          status: "succeeded",
          usage: {
            scope: "execution",
            id: runId,
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cost: null,
            elapsedMs: 1,
          },
          outputs: {
            result: {
              version: 1,
              outcome: "success",
              text: "Story and character",
              cards: [],
              images: [],
            },
            unibase_images: [
              {
                type: "image",
                transfer_method: "tool_file",
                related_id: imageId,
                url: `/files/tools/${imageId}.png?timestamp=123&nonce=n&sign=s`,
              },
            ],
          },
        };
        try {
          await prepareResult(db, nativeJob, execution);
          const result = await db
            .collection<{ _id: string; result: { images: { id: string }[] } }>(
              "runResults",
            )
            .findOne({ _id: nativeJob._id });
          assert.equal(result?.result.images.length, 1);
          assert.equal(JSON.stringify(result).includes("sign=s"), false);
          globalThis.fetch = async () => {
            throw new Error("Expired provider link");
          };
          await prepareResult(db, nativeJob, execution);
          assert.equal(downloads, 1);
          const session = client.startSession();
          try {
            await session.withTransaction(async () =>
              attachResult(db, nativeJob, session),
            );
          } finally {
            await session.endSession();
          }
          const asset = await readRunAsset(
            db,
            actor.uid,
            result!.result.images[0].id,
          );
          assert.equal(asset.bytes.length > 0, true);
          await assert.rejects(
            readRunAsset(db, "another-user", result!.result.images[0].id),
            /unavailable/,
          );
        } finally {
          globalThis.fetch = oldFetch;
          if (oldBase === undefined) delete process.env.DIFY_BASE_URL;
          else process.env.DIFY_BASE_URL = oldBase;
        }
      },
    );
    await t.test(
      "expired native images renew once, retain privately, and survive expired renewal links",
      async () => {
        const appId = randomUUID(),
          providerId = randomUUID(),
          imageId = randomUUID();
        const nativeJob = {
          ...job,
          _id: randomUUID(),
          runId: providerId,
          binding: { ...job.binding, mode: "live" as const },
          run: { ...job.run!, orchestrator: { ...definition, appId } },
        };
        const file = {
          type: "image",
          transfer_method: "tool_file",
          related_id: imageId,
          url: `/files/tools/${imageId}.png?timestamp=1&nonce=n&sign=old`,
        };
        const output = {
          version: 1,
          outcome: "success",
          text: "Comic",
          cards: [],
          images: [],
        };
        const execution: ProviderExecution = {
          runId: providerId,
          workflowId: null,
          status: "succeeded",
          outputs: { result: output, unibase_images: [file] },
          usage: {
            scope: "execution",
            id: providerId,
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cost: null,
            elapsedMs: 1,
          },
        };
        const node = storyPanel.dsl.workflow.graph.nodes.find(
          (n) => n.id === "validate_image1",
        )!;
        const priorEnv = {
          DIFY_BASE_URL: process.env.DIFY_BASE_URL,
          DIFY_CONSOLE_URL: process.env.DIFY_CONSOLE_URL,
          DIFY_MANAGEMENT_KEY: process.env.DIFY_MANAGEMENT_KEY,
          DIFY_WORKSPACE_ID: process.env.DIFY_WORKSPACE_ID,
        };
        const priorFetch = globalThis.fetch;
        let renewals = 0,
          downloads = 0,
          progress = 0;
        const { sampleImage } =
          await import("../../src/lib/server/runs/sample");
        Object.assign(process.env, {
          DIFY_BASE_URL: "https://dify.example.test/v1",
          DIFY_CONSOLE_URL: "https://dify.example.test/console/api",
          DIFY_MANAGEMENT_KEY: "fixture",
          DIFY_WORKSPACE_ID: randomUUID(),
        });
        globalThis.fetch = async (url, options) => {
          const path = new URL(String(url)).pathname;
          if (path.startsWith("/files/")) {
            downloads++;
            assert.equal(options?.headers, undefined);
            return String(url).includes("sign=old")
              ? new Response(null, { status: 403 })
              : new Response(Buffer.from(sampleImage, "base64"), {
                  headers: { "content-type": "image/png" },
                });
          }
          if (path.endsWith(`/workflow-runs/${providerId}`))
            return Response.json({
              id: providerId,
              status: "succeeded",
              graph: { nodes: [node] },
              outputs: execution.outputs,
            });
          if (path.endsWith("/workflows/draft"))
            return Response.json({ graph: { nodes: [node] } });
          assert.equal(
            path,
            `/console/api/apps/${appId}/workflows/draft/nodes/validate_image1/run`,
          );
          renewals++;
          return Response.json({
            node_id: node.id,
            status: "succeeded",
            outputs: {
              files: [{ ...file, url: file.url.replace("old", "fresh") }],
            },
          });
        };
        try {
          await prepareResult(db, nativeJob, execution, async () => {
            progress++;
          });
          assert.equal(renewals, 1);
          assert.equal(downloads, 2);
          assert.equal(progress, 1);
          const retained = await db
            .collection<{ _id: string; result: { images: { id: string }[] } }>(
              "runResults",
            )
            .findOne({ _id: nativeJob._id });
          assert.equal(retained?.result.images.length, 1);
          assert.equal(JSON.stringify(retained).includes("sign="), false);
          globalThis.fetch = async () => {
            throw Error("Must reuse retained bytes");
          };
          await prepareResult(db, nativeJob, execution);
        } finally {
          globalThis.fetch = priorFetch;
          for (const [key, value] of Object.entries(priorEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      },
    );
    await t.test(
      "snapshots deduplicate stages and parallel or repeated checkpoints remain separate",
      async () => {
        for (let n = 0; n < 2; n++)
          await persistAiEvent(db, claimed, {
            type: "stage",
            id: "node-execution",
            nodeId: "draft",
            title: "Draft",
            status: "running",
            elapsedMs: null,
          });
        assert.equal(
          await db.collection("runEvents").countDocuments({ jobId: job._id }),
          1,
        );
        for (const [nodeId, token] of [
          ["first", "token-one"],
          ["second", "token-two"],
          ["first", "token-three"],
        ])
          await persistAiEvent(db, claimed, {
            type: "decision",
            nodeId,
            title: "Choose",
            token,
          });
        assert.equal(
          await db
            .collection("runDecisions")
            .countDocuments({ jobId: job._id }),
          3,
        );
        assert.ok(
          !(
            await db
              .collection("runEvents")
              .findOne({ "event.type": "decision" })
          )?.event.token,
        );
      },
    );
    await t.test(
      "draft_result partial outcome keeps private images and waives success-only charges",
      async () => {
        const execution: ProviderExecution = {
          runId,
          workflowId: null,
          status: "succeeded",
          usage: {
            scope: "execution",
            id: runId,
            totalTokens: 10,
            inputTokens: 5,
            outputTokens: 5,
            cost: null,
            elapsedMs: 1,
          },
          outputs: {
            draft_result: {
              version: 1,
              outcome: "partial",
              text: "Partial",
              cards: [],
              images: [
                {
                  id: randomUUID(),
                  name: "Generated",
                  base64:
                    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQYlWNIKen+jw8zjAwFAGqamIFJPsH4AAAAAElFTkSuQmCC",
                },
              ],
              failure: null,
              checkpoint: {
                version: "1",
                stage: "draft",
                data: { input: "test" },
              },
            },
          },
        };
        await persistAiEvent(db, claimed, { type: "execution", execution });
        await prepareResult(db, claimed, execution);
        const asset = await db
          .collection<import("../../src/lib/server/runs/media").RunAsset>(
            "runAssets",
          )
          .findOne({ jobId: job._id });
        assert.ok(asset);
        await assert.rejects(readRunAsset(db, actor.uid, asset._id));
        await settleAiJob(db, claimed, "failed", new Date(), (session) =>
          attachResult(db, claimed, session),
        );
        await assert.rejects(readRunAsset(db, "other", asset._id));
        assert.equal(
          (await readRunAsset(db, actor.uid, asset._id)).mime,
          "image/png",
        );
        const done = await aiJobs(db).findOne({ _id: job._id });
        assert.ok(done);
        assert.ok(canStartNewAttempt(done));
        assert.equal((await readWallet(db, actor.uid)).balance, 20);
      },
    );
    await t.test(
      "only one successor is admitted under concurrent restarts",
      async () => {
        const results = await Promise.allSettled(
          [1, 2].map((n) =>
            createAiJob(db, actor, randomUUID(), {
              ...request,
              run: { ...request.run, attempt: 2, predecessorId: job._id },
              inputs: { prompt: `restart-${n}` },
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal((await readWallet(db, actor.uid)).reserved, 1);
      },
    );
    await t.test(
      "verified failure usage excludes fixed bases, settles once and retains missing evidence",
      async () => {
        const prices: import("../../src/lib/config/ai-pricing").AiPricing[] = [
          { mode: "fixed", credits: 2 },
          {
            mode: "tokens",
            maxCredits: 5,
            rate: { basis: "total", creditsPerMillion: "100000" },
          },
          {
            mode: "provider-cost",
            maxCredits: 5,
            currency: "USD",
            creditsPerCurrencyUnit: "100",
          },
          {
            mode: "hybrid",
            maxCredits: 5,
            baseCredits: 3,
            usage: {
              mode: "tokens",
              rate: { basis: "total", creditsPerMillion: "100000" },
            },
          },
        ];
        for (const [n, pricing] of prices.entries()) {
          const uid = `failure-billing-${n}`;
          await grantCredits(db, uid, "seed", {
            amount: 10,
            source: "purchase",
            reference: uid,
          });
          const saved = await createAiJob(db, { ...actor, uid }, randomUUID(), {
            ...request,
            pricing,
            credits:
              pricing.mode === "fixed" ? pricing.credits : pricing.maxCredits,
            run: {
              ...request.run,
              logicalId: fingerprint(uid),
              failureCharging: "verified-usage",
            },
          });
          // The successor from the earlier test is queued; claim it before this job.
          let claimed = await claimAiJob(db, new Date());
          if (claimed?._id !== saved._id)
            claimed = await claimAiJob(db, new Date());
          assert.equal(claimed?._id, saved._id);
          assert.ok(claimed);
          const providerId = randomUUID();
          await persistAiEvent(db, claimed, {
            type: "identity",
            runId: providerId,
            taskId: randomUUID(),
          });
          await persistAiEvent(db, claimed, {
            type: "execution",
            execution: {
              runId: providerId,
              workflowId: null,
              status: "failed",
              outputs: null,
              failure: "A workflow dependency timed out.",
              usage: {
                scope: "execution",
                id: providerId,
                inputTokens: 5,
                outputTokens: 5,
                totalTokens: 10,
                cost: { amount: "0.01", currency: "USD", source: "provider" },
                elapsedMs: 1,
              },
            },
          });
          await settleAiJob(db, claimed, "failed");
          await settleAiJob(db, claimed, "failed");
          assert.equal(
            (await aiJobs(db).findOne({ _id: saved._id }))?.failure,
            "A workflow dependency timed out.",
          );
          assert.equal((await readWallet(db, uid)).balance, n === 0 ? 10 : 9);
          assert.equal((await readWallet(db, uid)).reserved, 0);
        }
        const uid = "missing-failure-usage";
        await grantCredits(db, uid, "seed", {
          amount: 10,
          source: "purchase",
          reference: uid,
        });
        const saved = await createAiJob(db, { ...actor, uid }, randomUUID(), {
          ...request,
          pricing: prices[2],
          credits: 5,
          run: {
            ...request.run,
            logicalId: fingerprint(uid),
            failureCharging: "verified-usage",
          },
        });
        const claimed = await claimAiJob(db, new Date());
        assert.equal(claimed?._id, saved._id);
        assert.ok(claimed);
        const providerId = randomUUID();
        await persistAiEvent(db, claimed, {
          type: "identity",
          runId: providerId,
          taskId: randomUUID(),
        });
        await persistAiEvent(db, claimed, {
          type: "execution",
          execution: {
            runId: providerId,
            workflowId: null,
            status: "stopped",
            outputs: null,
            usage: {
              scope: "execution",
              id: providerId,
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
              cost: null,
              elapsedMs: null,
            },
          },
        });
        await assert.rejects(
          settleAiJob(db, claimed, "cancelled"),
          /billing usage/,
        );
        assert.equal((await readWallet(db, uid)).reserved, 5);
      },
    );
    await t.test(
      "terminal retrieval settles without a live stream and replays only uncertain decisions",
      async () => {
        for (const status of ["succeeded", "failed", "stopped"] as const) {
          for (const uncertain of [false, true]) {
            const fixture = client.db(`terminal_${status}_${uncertain}`);
            const uid = `terminal-${status}-${uncertain}`;
            await grantCredits(fixture, uid, "seed", {
              amount: 10,
              source: "purchase",
              reference: uid,
            });
            const saved = await createAiJob(
              fixture,
              { ...actor, uid },
              randomUUID(),
              {
                ...request,
                run: { ...request.run, logicalId: fingerprint(uid) },
              },
            );
            const providerId = randomUUID();
            const result: ProviderExecution = {
              runId: providerId,
              workflowId: null,
              status,
              outputs: null,
              usage: {
                scope: "execution",
                id: providerId,
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
                cost: null,
                elapsedMs: 1,
              },
            };
            await aiJobs(fixture).updateOne(
              { _id: saved._id },
              { $set: { status: "paused", runId: providerId } },
            );
            if (uncertain)
              await fixture.collection("runDecisions").insertOne({
                jobId: saved._id,
                nodeId: "choice",
                status: "unknown",
              });
            let streams = 0;
            let traces = 0;
            await processOneAiJob(fixture, {
              authorize: async () => true,
              validateOutput: () => true,
              terminalOutput: async () =>
                status === "succeeded" ? "succeeded" : "failed",
              trace: async () => {
                traces++;
                return [];
              },
              provider: () => ({
                start: async () => {
                  throw new Error("Must not generate again");
                },
                stop: async () => ({ kind: "ok", value: undefined }),
                retrieve: async () => ({ kind: "ok", value: result }),
                stream: async (_, __, observe) => {
                  streams++;
                  assert.ok(uncertain && status !== "stopped");
                  await observe({
                    type: "decision-filled",
                    nodeId: "choice",
                    action: "continue",
                    inputs: {},
                  });
                  // A historical pause must not replace retrieved completion.
                  return { kind: "ok", value: { ...result, status: "paused" } };
                },
              }),
            });
            const done = await aiJobs(fixture).findOne({ _id: saved._id });
            assert.equal(
              done?.status,
              status === "stopped" ? "cancelled" : status,
            );
            assert.equal(streams, uncertain && status !== "stopped" ? 1 : 0);
            assert.equal(traces, 1);
            const wallet = await readWallet(fixture, uid);
            assert.equal(wallet.reserved, 0);
            assert.equal(wallet.balance, status === "succeeded" ? 9 : 10);
            assert.equal(
              await processOneAiJob(fixture, {
                authorize: async () => true,
                validateOutput: () => true,
                provider: () => {
                  throw new Error("Settled Run must remain settled");
                },
              }),
              false,
            );
          }
        }
      },
    );
    await t.test(
      "long terminal image retention renews the owned lease and settles once",
      async () => {
        const fixture = client.db("long-retention");
        const uid = "long-retention";
        let clock = new Date();
        await grantCredits(fixture, uid, "seed", {
          amount: 10,
          source: "purchase",
          reference: uid,
        });
        const saved = await createAiJob(
          fixture,
          { ...actor, uid },
          randomUUID(),
          {
            ...request,
            run: { ...request.run, logicalId: fingerprint(uid) },
          },
          clock,
        );
        const execution: ProviderExecution = {
          runId: randomUUID(),
          workflowId: null,
          status: "succeeded",
          outputs: null,
          usage: {
            scope: "execution",
            id: uid,
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cost: null,
            elapsedMs: 1,
          },
        };
        await aiJobs(fixture).updateOne(
          { _id: saved._id },
          { $set: { status: "running", execution, runId: execution.runId } },
        );
        let imports = 0;
        const deps = {
          now: () => clock,
          authorize: async () => true,
          validateOutput: () => true,
          provider: () => {
            throw Error("Must not dispatch or poll completed generation");
          },
          terminalOutput: async (
            _job: unknown,
            _execution: unknown,
            progress: () => Promise<void>,
          ) => {
            for (let i = 0; i < 9; i++) {
              clock = new Date(clock.getTime() + 60_000);
              await progress();
              imports++;
            }
            return "succeeded" as const;
          },
        };
        await processOneAiJob(fixture, deps);
        assert.equal(imports, 9);
        assert.equal(
          (await aiJobs(fixture).findOne({ _id: saved._id }))?.status,
          "succeeded",
        );
        const wallet = await readWallet(fixture, uid, { now: clock });
        assert.equal(wallet.reserved, 0);
        assert.equal(wallet.balance, 9);
        assert.equal(await processOneAiJob(fixture, deps), false);
      },
    );
    await t.test(
      "terminal outcomes with unconfirmed decisions remain reviewable and keep the hold",
      async () => {
        const uid = "unconfirmed-decision";
        await grantCredits(db, uid, "seed", {
          amount: 10,
          source: "purchase",
          reference: uid,
        });
        const saved = await createAiJob(db, { ...actor, uid }, randomUUID(), {
          ...request,
          run: { ...request.run, logicalId: fingerprint(uid) },
        });
        const providerId = randomUUID();
        const execution: ProviderExecution = {
          runId: providerId,
          workflowId: null,
          status: "succeeded",
          outputs: null,
          usage: {
            scope: "execution",
            id: providerId,
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cost: null,
            elapsedMs: 1,
          },
        };
        await processOneAiJob(db, {
          authorize: async () => true,
          validateOutput: () => true,
          terminalOutput: async () => "succeeded",
          provider: () => ({
            start: async (_, observe) => {
              await observe({
                type: "identity",
                runId: providerId,
                taskId: randomUUID(),
              });
              await observe({
                type: "decision",
                nodeId: "choice",
                title: "Choose",
                token: "fixture-token",
              });
              await db
                .collection("runDecisions")
                .updateOne(
                  { jobId: saved._id },
                  { $set: { status: "unknown" } },
                );
              return { kind: "ok", value: execution };
            },
            retrieve: async () => ({ kind: "ok", value: execution }),
            stop: async () => ({ kind: "ok", value: undefined }),
          }),
        });
        const done = await aiJobs(db).findOne({ _id: saved._id });
        assert.equal(done?.status, "needs-review");
        assert.equal(done?.failure, "decision-outcome-unconfirmed");
        assert.equal((await readWallet(db, uid)).reserved, 1);
        assert.equal(canStartNewAttempt(done!), false);
      },
    );
    await t.test(
      "stopped runs recover from decision review without replay or a success charge",
      async () => {
        const uid = "stopped-decision";
        await grantCredits(db, uid, "seed", {
          amount: 10,
          source: "purchase",
          reference: uid,
        });
        const saved = await createAiJob(db, { ...actor, uid }, randomUUID(), {
          ...request,
          run: { ...request.run, logicalId: fingerprint(uid) },
        });
        const providerId = randomUUID();
        await aiJobs(db).updateOne(
          { _id: saved._id },
          {
            $set: {
              status: "needs-review",
              failure: "decision-outcome-unconfirmed",
              runId: providerId,
              cancelRequested: true,
              execution: {
                runId: providerId,
                workflowId: null,
                status: "stopped",
                outputs: null,
                usage: {
                  scope: "execution",
                  id: providerId,
                  inputTokens: 1,
                  outputTokens: 1,
                  totalTokens: 2,
                  cost: null,
                  elapsedMs: 1,
                },
              },
            },
          },
        );
        await db
          .collection("runDecisions")
          .insertOne({ jobId: saved._id, status: "unknown" });
        assert.equal(
          await processOneAiJob(db, {
            authorize: async () => true,
            validateOutput: () => true,
            terminalOutput: async () => "failed",
            provider: () => {
              throw new Error(
                "Saved termination must not replay provider requests",
              );
            },
          }),
          true,
        );
        const done = (await aiJobs(db).findOne({ _id: saved._id }))!;
        assert.equal(done.status, "cancelled");
        assert.equal(done.terminationEvidence, "provider-stopped");
        assert.equal(canStartNewAttempt(done), true);
        assert.equal((await readWallet(db, uid)).reserved, 0);
        assert.equal((await readWallet(db, uid)).balance, 10);
        assert.equal(
          (await db.collection("runDecisions").findOne({ jobId: saved._id }))
            ?.status,
          "unknown",
        );
      },
    );
    await t.test(
      "database settings seed once and do not depend on later invalid seed values",
      async () => {
        const original = process.env.CREDIT_PACKS_JSON;
        process.env.CREDIT_PACKS_JSON = "invalid";
        try {
          assert.equal((await readSettings(db)).revision, 0);
        } finally {
          if (original === undefined) delete process.env.CREDIT_PACKS_JSON;
          else process.env.CREDIT_PACKS_JSON = original;
        }
      },
    );
    await t.test(
      "existing settings acquire upload defaults without replacing saved billing",
      async () => {
        await db.collection<{ _id: string }>("baseSettings").updateOne(
          { _id: "base" },
          {
            $set: { "settings.runs.pricing": { mode: "fixed", credits: 7 } },
            $unset: {
              "settings.runs.uploadBytes": "",
              "settings.runs.filesPerAccount": "",
              "settings.runs.uploadBytesPerAccount": "",
            },
          },
        );
        const current = await readSettings(db);
        assert.deepEqual(current.settings.runs.pricing, {
          mode: "fixed",
          credits: 7,
        });
        assert.equal(current.settings.runs.uploadBytes, 20 * 1024 * 1024);
        assert.equal(current.settings.runs.filesPerAccount, 100);
        assert.equal(
          current.settings.runs.uploadBytesPerAccount,
          100 * 1024 * 1024,
        );
        const saved = await db
          .collection<{
            _id: string;
            settings: { runs: { uploadBytes?: number } };
          }>("baseSettings")
          .findOne({ _id: "base" });
        assert.equal(saved?.settings.runs.uploadBytes, undefined);
      },
    );
  } finally {
    await client.close();
    await repl.stop();
  }
});
