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
import { registerBookletCreativeWorkV2 } from "./work-v2";
import {
  workRegistrationV2Schema,
  artifactKindV2Schema,
  type ProductionV2,
} from "./documents-v2";
import { id, subjectInputSchema } from "./documents";
import { readBookletDocumentV2 } from "./read-v2";
import { bookletTransfers, transferSchema } from "./mcp-transfers";
import { reconcileBookletWorkV2 } from "./reconcile-v2";

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
      "begin_work",
      "Register validated creative-text intent. Paid dispatch is unavailable until its remaining safeguards are implemented.",
      async (raw, s) => {
        const request = z
          .strictObject({
            action: z.literal("register"),
            childRequest: z.json(),
            requestHash: z.string().regex(/^[a-f0-9]{64}$/),
            targets: z.array(id).min(1),
            retryOf: id.nullable().optional(),
            correction: workRegistrationV2Schema.shape.correction,
            fence: count,
          })
          .parse(raw);
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
        const receipt = await registerBookletCreativeWorkV2(
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
