import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import type { AiJob } from "../ai/jobs";
import type { RegisteredTool, ToolContext } from "../mcp/tools";
import { database } from "../mongo";
import { authorizedRun } from "../runs/capabilities";
import { fingerprint } from "../foundation/canonical";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import { bookletRepositoryV2 } from "./repository-v2";
import { registerBookletWorkV2 } from "./work-v2";
import {
  workRegistrationV2Schema,
  artifactKindV2Schema,
  type ProductionV2,
  type WorkV2,
  type RevisionV2,
} from "./documents-v2";
import { id, subjectInputSchema } from "./documents";
import { readBookletDocumentV2 } from "./read-v2";
import { bookletTransfers, transferSchema } from "./mcp-transfers";
import { reconcileBookletWorkV2 } from "./reconcile-v2";
import { readBookletSuiteV2 } from "./suite-v2";
import { bookletNativeCostsV2, bookletWorkUsageV2, bookletRunBoundsV2 } from "./usage-v2";
import {
  bookletContentV2Schema,
  bookletSourceV2Schema,
} from "../../../project/booklets/contracts-v2";
import { assetIdentitySchema } from "../../../project/booklets/contracts";

const count = z.number().int().nonnegative().safe();
const input = z.strictObject({
  runContext: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  request: z.string().max(1024 * 1024),
});
const output = z.strictObject({ result: z.json() });
type Scope = {
  db: Db;
  job: AiJob;
  production: ProductionV2;
  actor: { uid: string; authTime: number };
  signal: AbortSignal;
  secret: string;
};

export function createBookletMcpToolsV2(
  getDb: () => Db = database,
): readonly RegisteredTool[] {
  async function scope(
    secret: string,
    name: string,
    context: ToolContext,
  ): Promise<Scope> {
    context.signal.throwIfAborted();
    const db = getDb();
    const authorized = await authorizedRun(db, secret, context.clientId, name);
    const actor = { uid: authorized.uid, authTime: authorized.authTime };
    const c = bookletContext(db, actor);
    return c.transaction(async (session) => {
      // Re-read the native parent and prepaid binding with the owned production.
      const job = await db.collection<AiJob>("aiJobs").findOne(
        {
          _id: authorized._id,
          uid: actor.uid,
          cancelRequested: false,
          status: { $in: ["running", "paused"] },
          "run.target.adapter": "booklet",
          "run.target.version": "2",
        },
        { session },
      );
      if (
        !job?.runId ||
        !job.run?.target ||
        job.run.answerer ||
        (job.execution && !["running", "paused"].includes(job.execution.status))
      )
        throw bookletMissing();
      const production = await c.owned(job.run.target.id, session, 2);
      const order = await c.entitled(production, session);
      const flow = await db.collection("consumptionWorkflows").findOne(
        {
          _id: order.activeWorkflow as never,
          uid: actor.uid,
          orderId: production.orderId,
          state: "active",
          jobId: job._id,
        },
        { session },
      );
      if (
        !flow ||
        job.consumption?.orderId !== production.orderId ||
        job.consumption.workflowId !== order.activeWorkflow
      )
        throw bookletMissing();
      context.signal.throwIfAborted();
      return { db, job, production, actor, signal: context.signal, secret };
    });
  }
  async function mutation(
    s: Scope,
    operation: string,
    request: unknown,
    fence: number,
  ) {
    const key = fingerprint([s.job._id, operation, request]);
    const prior = await s.db
      .collection<{
        _id: string;
        ownerId: string;
        productionId: string;
        result: { version: number };
      }>("bookletRepositoryWrites")
      .findOne({
        _id: fingerprint([s.actor.uid, "production-v2", s.production._id, key]),
        ownerId: s.actor.uid,
        productionId: s.production._id,
      });
    // Reconstruct the original CAS input for exact lost-reply receipt replay.
    // A fresh production version must not turn a replay into a changed payload.
    return {
      key,
      holderId: s.job._id,
      fence,
      expectedVersion: prior
        ? z.number().int().min(2).safe().parse(prior.result.version) - 1
        : s.production.version,
    };
  }
  function tool(
    name: string,
    description: string,
    effect: (request: unknown, s: Scope) => Promise<unknown>,
    write = true,
  ): RegisteredTool {
    const fullName = `booklet_${name}_v2`;
    return {
      name: fullName,
      description,
      permission: `extension:booklets:${write ? "write" : "read"}`,
      write,
      runContext: true,
      input,
      output,
      async run(raw, context) {
        const value = input.parse(raw);
        const s = await scope(value.runContext, fullName, context);
        const request: unknown = JSON.parse(value.request);
        if (JSON.stringify(request).includes(s.secret))
          throw bookletConflict(
            "Private Run context cannot enter the request payload.",
          );
        const response = await effect(request, s);
        context.signal.throwIfAborted();
        if (JSON.stringify(response).includes(s.secret))
          throw bookletConflict("Private Run context cannot be returned.");
        return { result: z.json().parse(JSON.parse(JSON.stringify(response))) };
      },
    };
  }
  return [
    tool(
      "context",
      "Read owned Manager facts and configured suite identity. Follow document references for complete bodies; dispatch remains gated by application safeguards.",
      async (raw, s) => {
        z.strictObject({}).parse(raw);
        const binding = await readBookletSuiteV2(s.db, s.production, s.job);
        const owned = { ownerId: s.actor.uid, productionId: s.production._id };
        const currentIds = s.production.subjects.flatMap((subject) =>
          subject.artifacts.flatMap((artifact) =>
            artifact.currentRevisionId ? [artifact.currentRevisionId] : [],
          ),
        );
        const [revisions, work, assessments] = await Promise.all([
          s.db
            .collection("bookletRevisions")
            .find(
              { ...owned, _id: { $in: currentIds as never[] } },
              {
                projection: { _id: 1, artifactId: 1, contentHash: 1 },
              },
            )
            .sort({ _id: 1 })
            .limit(17)
            .toArray(),
          s.db
            .collection<WorkV2 & { resultAvailable: boolean }>("bookletWork")
            .find(owned, {
              projection: {
                _id: 0,
                callId: 1,
                requestHash: 1,
                service: 1,
                operation: 1,
                status: 1,
                category: 1,
                retryable: 1,
                correction: 1,
                correctionRootId: 1,
                resultObservation: 1,
                resultAvailable: {
                  $ne: [{ $type: "$resultPayload" }, "missing"],
                },
              },
            })
            .sort({ createdAt: -1, _id: -1 })
            .limit(17)
            .toArray(),
          s.db
            .collection("bookletAssessments")
            .find(owned, {
              projection: {
                _id: 1,
                assessment: 1,
                complete: 1,
                policyBinding: 1,
                reviewerBinding: 1,
              },
            })
            .sort({ createdAt: -1, _id: -1 })
            .limit(9)
            .toArray(),
        ]);
        function bounded<T>(rows: T[], limit: number) {
          const selected: T[] = [];
          for (const row of rows.slice(0, limit)) {
            if (Buffer.byteLength(JSON.stringify([...selected, row])) > 8192)
              break;
            selected.push(row);
          }
          return selected;
        }
        const sources = bounded(
          revisions.map((row) => ({
            artifactId: row.artifactId,
            revisionId: row._id,
            contentHash: row.contentHash,
          })),
          16,
        );
        const workFacts = bounded(
          work.map((row) => ({
            callId: row.callId,
            requestHash: row.requestHash,
            service: row.service,
            operation: row.operation,
            status: row.status,
            category: row.category,
            retryable: row.retryable,
            correction: row.correction,
            correctionRootId: row.correctionRootId,
            resultAvailable: row.resultAvailable,
            document: { kind: "work", id: row.callId },
          })),
          16,
        );
        const assessmentFacts = bounded(
          assessments.map((row) => ({
            ...row.assessment,
            assessmentId: row._id,
            complete: row.complete,
            policyBinding: row.policyBinding,
            reviewerBinding: row.reviewerBinding,
          })),
          8,
        );
        const pending = z
          .object({
            pending: z
              .object({ callId: id.nullable().optional() })
              .nullable()
              .optional(),
          })
          .safeParse(s.production.checkpoint);
        const pendingCallId = pending.success
          ? pending.data.pending?.callId
          : undefined;
        if (
          pendingCallId &&
          !workFacts.some((row) => row.callId === pendingCallId) &&
          (await s.db
            .collection("bookletWork")
            .findOne(
              { ...owned, callId: pendingCallId },
              { projection: { _id: 1 } },
            ))
        ) {
          const retained = await bookletRepositoryV2(s.db, s.actor).getWork(
            s.production._id,
            pendingCallId,
          );
          const focused = {
            callId: retained.callId,
            requestHash: retained.requestHash,
            service: retained.service,
            operation: retained.operation,
            status: retained.status,
            category: retained.category,
            retryable: retained.retryable,
            correction: retained.correction,
            correctionRootId: retained.correctionRootId,
            resultAvailable: retained.resultPayload !== undefined,
            document: { kind: "work", id: retained.callId },
          };
          workFacts.unshift(focused);
          while (
            Buffer.byteLength(JSON.stringify(workFacts)) > 8192 ||
            workFacts.length > 16
          ) {
            if (workFacts.length === 1)
              throw bookletConflict(
                "Pending work summary exceeds context capacity; read its document.",
              );
            workFacts.pop();
          }
        }
        const repo = bookletRepositoryV2(s.db, s.actor);
        const correctionRoots = [
          ...new Set(
            workFacts
              .filter((row) => row.correction)
              .map((row) => row.correctionRootId as string),
          ),
        ];
        const correctionFacts = bounded(
          await Promise.all(
            correctionRoots.map((root) =>
              repo.getCorrection(s.production._id, root),
            ),
          ),
          16,
        );
        const workAttempts = await bookletWorkUsageV2(s.db, s.production);
        const costs = await bookletNativeCostsV2(s.db, s.production);
        const execution = await bookletRunBoundsV2(s.db, s.production);
        const textLimit = s.production.creativeConfigSnapshot.execution.maxTextCalls;
        const canDispatch = workAttempts.paidLlm < textLimit && !costs.overCeiling && !execution.overLimit;
        const facts = {
          productionId: s.production._id,
          version: s.production.version,
          state: s.production.lifecycleState,
          checkpointVersion: s.production.checkpointVersion,
          checkpoint: s.production.checkpoint ?? {},
          checkpointDocument: { kind: "checkpoint", id: s.production._id },
          productionDocument: { kind: "production", id: s.production._id },
          workHistoryDocument: { kind: "work_history", id: s.production._id },
          assessmentHistoryDocument: {
            kind: "assessment_history",
            id: s.production._id,
          },
          fence: s.production.fenceCounter,
          leaseHeld:
            !!s.production.mutationLease &&
            s.production.mutationLease.expiresAt > new Date(),
          cancelled: s.job.cancelRequested,
          policyBinding: binding.policyBinding,
          reviewerBinding: binding.reviewerBinding,
          suiteBinding: fingerprint(binding.suite),
          retryPolicy: s.production.retryPolicy,
          stageLocks: s.production.stageLocks,
          sources,
          sourcesComplete: sources.length === currentIds.length,
          work: workFacts,
          workComplete: workFacts.length === work.length,
          assessments: assessmentFacts,
          assessmentsComplete: assessmentFacts.length === assessments.length,
          corrections: correctionFacts,
          correctionsComplete:
            workFacts.length === work.length &&
            correctionFacts.length === correctionRoots.length,
          usage: {
            canDispatch,
            reason: canDispatch ? null : "production_usage_bound_reached",
            workAttempts,
            costs,
            execution,
          },
        };
        if (Buffer.byteLength(JSON.stringify(facts)) > 128 * 1024)
          throw bookletConflict(
            "Context exceeds capacity; read complete documents separately.",
          );
        return facts;
      },
      false,
    ),
    tool(
      "lease",
      "Refresh the Run-owned mutation fence atomically. Acquire, renew and release hold no lease between tool calls; every write checks its fence independently.",
      async (raw, s) => {
        const request = z
          .strictObject({
            action: z.enum(["acquire", "renew", "release"]),
            fence: count,
          })
          .parse(raw);
        const m = await mutation(s, "refreshFence", request, request.fence);
        const receipt = await bookletRepositoryV2(s.db, s.actor, undefined, {
          atomicMutations: true,
        }).refreshFence(s.production._id, m);
        return { ...receipt, leaseHeld: false };
      },
    ),
    tool(
      "save_revision",
      "Publish an exact retained creative proposal with trusted producer evidence, current funding and locks. Prefer content {callId,itemId,proposalIndex} to avoid copying model text; typed JSON and complete {transferId} payloads are also supported.",
      async (raw, s) => {
        const request = z
          .strictObject({
            artifactId: id,
            content: z.union([
              bookletContentV2Schema,
              z.strictObject({ transferId: id }),
              z.strictObject({ callId: id, itemId: id, proposalIndex: count }),
            ]),
            sources: z.array(bookletSourceV2Schema),
            assets: z.array(assetIdentitySchema),
            evidence: z.array(id).min(1),
            mutationKey: id,
            fence: count,
          })
          .parse(raw);
        const producers = await s.db
          .collection<WorkV2>("bookletWork")
          .find({
            ownerId: s.actor.uid,
            productionId: s.production._id,
            status: { $in: ["succeeded", "partial"] },
            evidenceIds: { $all: request.evidence },
          })
          .limit(2)
          .toArray();
        if (producers.length !== 1)
          throw bookletConflict(
            "An unambiguous retained producer is required.",
          );
        let content: z.infer<typeof bookletContentV2Schema>;
        if ("kind" in request.content) content = request.content;
        else if ("callId" in request.content) {
          const reference = request.content;
          if (reference.callId !== producers[0].callId)
            throw bookletConflict(
              "Proposal reference differs from the retained producer.",
            );
          const result = z
            .object({
              items: z.array(
                z.object({
                  itemId: id,
                  status: z.string(),
                  proposals: z
                    .array(z.object({ content: bookletContentV2Schema }))
                    .default([]),
                }),
              ),
            })
            .parse(producers[0].resultPayload);
          const item = result.items.find(
            (item) => item.itemId === reference.itemId,
          );
          const selected =
            item?.status === "succeeded"
              ? item.proposals[reference.proposalIndex]
              : undefined;
          if (!selected)
            throw bookletConflict("Retained proposal is unavailable.");
          content = selected.content;
        } else
          content = bookletContentV2Schema.parse(
            JSON.parse(
              (
                await bookletTransfers(s.db, s.actor, s.production._id, 2).read(
                  request.content.transferId,
                  "revision",
                  s.signal,
                )
              ).toString("utf8"),
            ),
          );
        const m = await mutation(s, "appendRevision", request, request.fence);
        const repo = bookletRepositoryV2(s.db, s.actor, undefined, {
          atomicMutations: true,
        });
        const receipt = await repo.appendRevision(s.production._id, {
          ...m,
          artifactId: request.artifactId,
          content,
          sources: request.sources,
          assets: request.assets,
          provenance: {
            runId: s.job._id,
            operationId: producers[0].callId,
            evidenceIds: request.evidence,
          },
        });
        const revision = await repo.getRevision(
          s.production._id,
          receipt.revisionId!,
        );
        return {
          revisionId: revision._id,
          ordinal: revision.ordinal,
          contentHash: revision.contentHash,
          fence: receipt.fence,
          version: receipt.version,
        };
      },
    ),
    tool(
      "reconcile_work",
      "Read an existing work item's native execution and retain matching results. Never starts a provider or infers safe replay from missing evidence.",
      async (raw, s) => {
        const request = z
          .strictObject({
            callId: id,
            executionLocator: z
              .strictObject({
                runId: id,
                nodeId: id.optional(),
                executionId: id.optional(),
              })
              .optional(),
          })
          .parse(raw);
        return reconcileBookletWorkV2(
          s.db,
          s.actor,
          s.production._id,
          request.callId,
          s.signal,
          { executionLocator: request.executionLocator },
        );
      },
    ),
    tool(
      "transfer",
      "Stage a complete bounded payload with immutable metadata and replayable chunks; this does not publish content or authorize dispatch.",
      async (raw, s) => {
        const request = z
          .discriminatedUnion("action", [
            transferSchema.extend({ action: z.literal("open") }),
            z.strictObject({
              action: z.literal("part"),
              transferId: id,
              index: count,
              data: z.string().max(10924),
            }),
          ])
          .parse(raw);
        const transfers = bookletTransfers(s.db, s.actor, s.production._id, 2);
        if (request.action === "part")
          return transfers.put(
            request.transferId,
            request.index,
            request.data,
            s.signal,
            s.secret,
          );
        const { key, kind, bytes, sha256 } = request;
        return transfers.open({ key, kind, bytes, sha256 });
      },
    ),
    tool(
      "index",
      "Register stable subject and artifact identities atomically within purchased capacity; matching existing entries are reused.",
      async (raw, s) => {
        const request = z
          .strictObject({
            subjects: z.array(subjectInputSchema),
            artifacts: z.array(
              z.strictObject({
                subjectId: id,
                artifactId: id,
                kind: artifactKindV2Schema,
              }),
            ),
            fence: count,
          })
          .parse(raw);
        const m = await mutation(s, "indexEntries", request, request.fence);
        const receipt = await bookletRepositoryV2(s.db, s.actor, undefined, {
          atomicMutations: true,
        }).indexEntries(s.production._id, {
          ...m,
          subjects: request.subjects,
          artifacts: request.artifacts,
        });
        return {
          subjects: Object.fromEntries(
            request.subjects.map((subject) => [subject.id, subject.id]),
          ),
          artifacts: Object.fromEntries(
            request.artifacts.map((artifact) => [
              artifact.artifactId,
              artifact.artifactId,
            ]),
          ),
          fence: receipt.fence,
        };
      },
    ),
    tool(
      "read_document",
      "Read complete typed values or bounded decoded sections. Follow section and page cursors; incomplete responses are not whole documents.",
      (raw, s) => readBookletDocumentV2(s.db, s.actor, s.production._id, raw),
      false,
    ),
    tool(
      "checkpoint",
      "Save bounded Manager intent with a current fence and checkpoint CAS; no lease spans a workflow wait.",
      async (raw, s) => {
        const request = z
          .strictObject({
            expectedVersion: count,
            fence: count,
            state: z.json(),
          })
          .parse(raw);
        const m = await mutation(s, "checkpoint", request, request.fence);
        return bookletRepositoryV2(s.db, s.actor, undefined, {
          atomicMutations: true,
        }).checkpoint(s.production._id, {
          ...m,
          expectedCheckpointVersion: request.expectedVersion,
          state: request.state,
        });
      },
    ),
    tool(
      "sources",
      "Verify owned immutable text sources. Original-image binding remains unavailable until image safeguards are implemented.",
      async (raw, s) => {
        const request = z.strictObject({
          sources: z.array(bookletSourceV2Schema),
          references: z.array(z.json()).max(0),
        }).parse(raw);
        const records = await s.db.collection<RevisionV2>("bookletRevisions").find({
          ownerId: s.actor.uid,
          productionId: s.production._id,
          documentVersion: 2,
          _id: { $in: request.sources.map((source) => source.revisionId) },
        }, { projection: { _id: 1, artifactId: 1, contentHash: 1 } }).toArray();
        for (const source of request.sources)
          if (!records.some((row) => row._id === source.revisionId && row.artifactId === source.artifactId && row.contentHash === source.contentHash))
            throw bookletConflict("Source identity differs from its owned immutable revision.");
        return { references: [] };
      },
      false,
    ),
    tool(
      "begin_work",
      "Register child intent or atomically authorize configured text work after current ownership, funding, lock and usage checks. Image dispatch remains unavailable.",
      async (raw, s) => {
        const request = z
          .discriminatedUnion("action", [z.strictObject({
            action: z.literal("register"),
            childRequest: z.json(),
            requestHash: z.string().regex(/^[a-f0-9]{64}$/),
            targets: z.array(id).min(1),
            retryOf: id.nullable().optional(),
            correction: workRegistrationV2Schema.shape.correction,
            fence: count,
          }), z.strictObject({
            action: z.literal("dispatch"), callId: id,
            requestHash: z.string().regex(/^[a-f0-9]{64}$/), fence: count,
          })])
          .parse(raw);
        if (request.action === "dispatch") {
          await readBookletSuiteV2(s.db, s.production, s.job);
          const repo = bookletRepositoryV2(s.db, s.actor, undefined, { atomicMutations: true });
          const work = await repo.getWork(s.production._id, request.callId);
          const payload = z.object({ references: z.array(z.json()).max(0) }).safeParse(work.requestPayload);
          if (work.category !== "paidLlm" || work.service === "manager" || work.service === "image-executor" ||
            (work.service === "quality-reviewer" && !["text", "specification"].includes(work.operation)) || !payload.success)
            throw bookletConflict("Only registered text work without image references is available for dispatch.");
          const m = await mutation(s, "dispatchWork", request, request.fence);
          const receipt = await repo.dispatchWork(s.production._id, {
            ...m, callId: request.callId, requestHash: request.requestHash,
          });
          return { callId: request.callId, requestHash: request.requestHash, status: "dispatching", fence: receipt.fence };
        }
        const {
          fence,
          childRequest,
          requestHash,
          targets,
          retryOf,
          correction,
        } = request;
        const registration = {
          childRequest,
          requestHash,
          targets,
          retryOf,
          correction,
        };
        const m = await mutation(s, "registerWork", request, fence);
        const receipt = await registerBookletWorkV2(
          s.db,
          s.actor,
          s.production._id,
          s.job._id,
          m,
          registration,
        );
        const child = z.object({ callId: id }).parse(request.childRequest);
        return {
          callId: child.callId,
          requestHash: request.requestHash,
          status: "registered",
          fence: receipt.fence,
        };
      },
    ),
  ];
}

export const bookletMcpToolsV2 = createBookletMcpToolsV2();
