import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import type { AiJob } from "../ai/jobs";
import type { RegisteredTool, ToolContext } from "../mcp/tools";
import { database } from "../mongo";
import { authorizedRun } from "../runs/capabilities";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import { bookletRepository } from "./repository";
import { bookletLifecycle, recordBookletQuality } from "./lifecycle";
import { bookletMedia } from "./media";
import {
  bookletTransfers,
  boundedChunk,
  transferSchema,
} from "./mcp-transfers";
import {
  id,
  mutationSchema,
  appendInputSchema,
  contentSchema,
  subjectInputSchema,
  artifactKind,
} from "./documents";
import { sourceRevisionSchema } from "../../../project/booklets/contracts";
import { readEvidence, retainEvidence } from "../execution/measurements";
import { fingerprint } from "../foundation/canonical";

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe();
const mutation = mutationSchema.omit({ holderId: true });
const result = z.strictObject({ result: z.json() });
const chunk = z.strictObject({
  sha256: hash,
  bytes: count,
  offset: count,
  nextOffset: count.nullable(),
  data: z.string().max(10924),
});
const policySchema = z.strictObject({
  id,
  revision: z.number().int().positive(),
  publicationId: id,
});
type Scope = {
  db: Db;
  job: AiJob;
  productionId: string;
  actor: { uid: string; authTime: number };
  signal: AbortSignal;
  secret: string;
};
const json = (value: unknown) =>
  z.json().parse(JSON.parse(JSON.stringify(value)));

/** Server-owned publication binding. T19/T20 provision verified immutable profile
 * and orchestrator revisions; a workflow cannot choose its own acceptance policy. */
async function qualityPolicy(s: Scope) {
  const p = await bookletRepository(s.db, s.actor).getProduction(
    s.productionId,
  );
  const binding = await s.db.collection("bookletWorkflowPolicies").findOne({
    profileId: p.creativeConfigSnapshot.executionProfileId,
    profileRevision: p.creativeConfigSnapshot.executionProfileRevision,
    orchestratorId: s.job.run!.orchestrator.id,
    configurationRevision: s.job.run!.configurationRevision,
  });
  if (!binding)
    throw bookletConflict(
      "Verified reviewer publication binding is unavailable.",
    );
  return policySchema.parse(binding.reviewer);
}

export function createBookletMcpTools(
  getDb: () => Db = database,
): readonly RegisteredTool[] {
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    write: boolean,
    effect: (value: z.infer<z.ZodObject<S>>, scope: Scope) => Promise<unknown>,
    output: z.ZodObject = result,
  ): RegisteredTool {
    const input = z.strictObject({ ...shape, runContext: token });
    return {
      name: `booklet_${name}_v1`,
      description,
      permission: `extension:booklets:${write ? "write" : "read"}`,
      write,
      runContext: true,
      input,
      output,
      async run(raw, context: ToolContext) {
        const parsed = input.parse(raw) as Record<string, unknown>;
        const secret = token.parse(parsed.runContext);
        context.signal.throwIfAborted();
        const db = getDb();
        // Revalidate even for a direct server invocation; never trust model IDs.
        const job = await authorizedRun(
          db,
          secret,
          context.clientId,
          `booklet_${name}_v1`,
        );
        if (
          !job.run ||
          job.run.target?.adapter !== "booklet" ||
          job.run.answerer ||
          !["running", "paused"].includes(job.status)
        )
          throw bookletMissing();
        const productionId = job.run.target.id;
        const actor = { uid: job.uid, authTime: job.authTime };
        const c = bookletContext(db, actor);
        await c.transaction(async (session) => {
          const p = await c.owned(productionId, session);
          const order = await c.entitled(p, session);
          if (
            job.consumption?.orderId !== p.orderId ||
            order.activeWorkflow !== job.consumption.workflowId
          )
            throw bookletMissing();
        });
        context.signal.throwIfAborted();
        const value = { ...parsed };
        delete value.runContext;
        const response = await effect(value as z.infer<z.ZodObject<S>>, {
          db,
          job,
          productionId,
          actor,
          signal: context.signal,
          secret,
        });
        context.signal.throwIfAborted();
        return output === result
          ? { result: json(response) }
          : (json(response) as Record<string, unknown>);
      },
    };
  }
  const repo = (s: Scope) => bookletRepository(s.db, s.actor);
  const service = (s: Scope) => bookletLifecycle(s.db, s.actor);
  const media = (s: Scope) => bookletMedia(s.db, s.actor);
  const transfer = (s: Scope) =>
    bookletTransfers(s.db, s.actor, s.productionId);
  const m = (s: Scope, value: z.infer<typeof mutation>) => ({
    ...value,
    holderId: s.job._id,
  });
  async function evidence(s: Scope, evidenceId: string) {
    const row = await s.db.collection("executionEvidence").findOne({
      uid: s.actor.uid,
      _id: fingerprint([s.actor.uid, evidenceId]) as never,
    });
    if (
      !row ||
      !(await s.db.collection<AiJob>("aiJobs").findOne({
        uid: s.actor.uid,
        "run.logicalId": row.runId,
        "run.target.adapter": "booklet",
        "run.target.id": s.productionId,
      }))
    )
      throw bookletMissing();
    return readEvidence(s.db, s.actor.uid, evidenceId);
  }
  return [
    tool(
      "context",
      "Read the owned production identity and version. Read the production document in bounded chunks for full context.",
      {},
      false,
      async (_, s) => {
        const p = await repo(s).getProduction(s.productionId);
        return {
          productionId: p._id,
          bookletId: p.bookletId,
          version: p.version,
          state: p.lifecycleState,
          currentManifestRevisionId: p.currentManifestRevisionId,
          lease: p.mutationLease
            ? {
                fence: p.mutationLease.fence,
                expiresAt: p.mutationLease.expiresAt,
                heldByThisRun: p.mutationLease.holderId === s.job._id,
              }
            : null,
        };
      },
    ),
    tool(
      "read_document",
      "Read base64 JSON or original-image bytes in 8 KiB chunks. Supply sha256 after the first chunk to reject changed documents.",
      {
        kind: z.enum([
          "production",
          "revision",
          "operation",
          "review-form",
          "evidence",
          "asset",
        ]),
        recordId: id.optional(),
        offset: count,
        sha256: hash.optional(),
      },
      false,
      async (v, s) => {
        let value: unknown;
        if (v.kind === "production") {
          const p = await repo(s).getProduction(s.productionId);
          value = {
            productionId: p._id,
            version: p.version,
            brief: p.brief,
            creativeConfig: p.creativeConfigSnapshot,
            subjects: p.subjects,
            stageLocks: p.stageLocks,
            state: p.lifecycleState,
          };
        } else {
          const recordId = id.parse(v.recordId);
          if (v.kind === "asset")
            return media(s).readChunk(
              s.productionId,
              recordId,
              v.offset,
              v.sha256,
            );
          if (v.kind === "revision") {
            const r = await repo(s).getRevision(s.productionId, recordId);
            value = {
              revisionId: r._id,
              artifactId: r.artifactId,
              subjectId: r.subjectId,
              ordinal: r.ordinal,
              kind: r.kind,
              content: r.content,
              sources: r.sources,
              assets: r.assets,
              contentHash: r.contentHash,
            };
          } else if (v.kind === "operation") {
            const op = await service(s).inspectGeneration(
              s.productionId,
              recordId,
            );
            value = {
              operationId: op._id,
              artifactId: op.artifactId,
              sources: op.sources,
              state: op.state,
              revisionId: op.revisionId,
              repairRoot: op.repairRoot,
            };
          } else if (v.kind === "evidence") value = await evidence(s, recordId);
          else {
            const saved = await s.db
              .collection("bookletServiceWrites")
              .findOne({
                ownerId: s.actor.uid,
                productionId: s.productionId,
                "result.id": recordId,
                "result.formContent": { $type: "string" },
              });
            if (!saved) throw bookletMissing();
            value = {
              formContent: saved.result.formContent,
              approval: saved.result.approval,
            };
          }
        }
        const encoded = JSON.stringify(value);
        if (encoded.includes(s.secret))
          throw bookletConflict("Private context cannot be returned.");
        return boundedChunk(Buffer.from(encoded), v.offset, v.sha256);
      },
      chunk,
    ),
    tool(
      "lease",
      "Acquire, renew or release this Run's production mutation lease. Use returned version and fence on later writes.",
      {
        action: z.enum(["acquire", "renew", "release"]),
        key: id,
        expectedVersion: z.number().int().positive(),
        fence: z.number().int().positive().optional(),
        durationMs: z.number().int().min(1000).max(300000).default(60000),
      },
      true,
      async (v, s) => {
        if (v.action === "acquire")
          return repo(s).acquireLease(s.productionId, {
            key: v.key,
            expectedVersion: v.expectedVersion,
            holderId: s.job._id,
            durationMs: v.durationMs,
          });
        const input = mutationSchema.parse({
          key: v.key,
          expectedVersion: v.expectedVersion,
          fence: v.fence,
          holderId: s.job._id,
        });
        return v.action === "renew"
          ? repo(s).renewLease(s.productionId, {
              ...input,
              durationMs: v.durationMs,
            })
          : repo(s).releaseLease(s.productionId, input);
      },
    ),
    tool(
      "index",
      "Add a stable subject or artifact responsibility to the owned production.",
      {
        mutation,
        entry: z.discriminatedUnion("type", [
          z.strictObject({
            type: z.literal("subject"),
            subject: subjectInputSchema,
          }),
          z.strictObject({
            type: z.literal("artifact"),
            subjectId: id,
            artifactId: id,
            kind: artifactKind,
          }),
        ]),
      },
      true,
      async (v, s) =>
        v.entry.type === "subject"
          ? repo(s).addSubject(s.productionId, {
              ...m(s, v.mutation),
              subject: v.entry.subject,
            })
          : repo(s).addArtifact(s.productionId, {
              ...m(s, v.mutation),
              subjectId: v.entry.subjectId,
              artifactId: v.entry.artifactId,
              kind: v.entry.kind,
            }),
    ),
    tool(
      "begin_generation",
      "Authorize an image operation and lock prerequisites. Inspect existing operations before dispatch; a retry does not authorize provider replay.",
      {
        mutation,
        operationId: id,
        artifactId: id,
        sources: z.array(sourceRevisionSchema).min(1).max(100),
        repairRevisionId: id.optional(),
      },
      true,
      async (v, s) =>
        service(s).authorizeGeneration(s.productionId, {
          ...m(s, v.mutation),
          operationId: v.operationId,
          artifactId: v.artifactId,
          sources: v.sources,
          ...(v.repairRevisionId
            ? { repairRevisionId: v.repairRevisionId }
            : {}),
          runId: s.job._id,
        }),
    ),
    tool(
      "transfer",
      "Open immutable bounded staging or write a canonical base64 chunk. Retries must keep the same metadata and bytes.",
      {
        action: z.discriminatedUnion("type", [
          transferSchema.extend({ type: z.literal("open") }),
          z.strictObject({
            type: z.literal("part"),
            transferId: id,
            index: count,
            data: z.string().max(10924),
          }),
        ]),
      },
      true,
      async (v, s) => {
        if (v.action.type === "part")
          return transfer(s).put(
            v.action.transferId,
            v.action.index,
            v.action.data,
            s.signal,
            s.secret,
          );
        const { key, kind, bytes, sha256 } = v.action;
        return transfer(s).open({ key, kind, bytes, sha256 });
      },
    ),
    tool(
      "retain_original",
      "Verify and retain complete original bytes from an image transfer. Never regenerate after a storage/attachment retry.",
      {
        transferId: id,
        operationId: id,
        outputKey: id,
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      },
      true,
      async (v, s) => {
        const bytes = await transfer(s).read(v.transferId, "image", s.signal);
        const sha256 = boundedChunk(bytes, 0).sha256;
        s.signal.throwIfAborted();
        return media(s).retainOriginal(
          s.productionId,
          {
            operationId: v.operationId,
            outputKey: v.outputKey,
            mime: v.mime,
            sha256,
          },
          bytes,
        );
      },
    ),
    tool(
      "save_revision",
      "Append immutable typed content from a revision JSON transfer and atomically advance its current pointer. Run provenance is server-derived.",
      {
        mutation,
        transferId: id,
        artifactId: id,
        operationId: id,
        sources: appendInputSchema.shape.sources.max(100),
        assets: appendInputSchema.shape.assets.max(100),
        evidenceIds: z.array(id).max(100),
      },
      true,
      async (v, s) => {
        for (const evidenceId of v.evidenceIds) await evidence(s, evidenceId);
        const content = contentSchema.parse(
          JSON.parse(
            (
              await transfer(s).read(v.transferId, "revision", s.signal)
            ).toString("utf8"),
          ),
        );
        s.signal.throwIfAborted();
        return repo(s).appendRevision(s.productionId, {
          ...m(s, v.mutation),
          artifactId: v.artifactId,
          content,
          sources: v.sources,
          assets: v.assets,
          provenance: {
            operationId: v.operationId,
            runId: s.job._id,
            evidenceIds: v.evidenceIds,
          },
        });
      },
    ),
    tool(
      "request_review",
      "Prepare exact-revision human review. Fetch its review-form document and present it unchanged through existing Human Input.",
      {
        mutation,
        targets: z.array(sourceRevisionSchema).min(1).max(20),
        reuse: z.boolean().default(false),
      },
      true,
      async (v, s) => {
        const review = await service(s).requestReview(s.productionId, {
          ...m(s, v.mutation),
          targets: v.targets,
          reuse: v.reuse,
          runId: s.job._id,
        });
        return {
          requestId: review.id,
          version: review.version,
          approval: review.approval,
        };
      },
    ),
    tool(
      "apply_decision",
      "Apply an already submitted authenticated human decision. This tool cannot create a human answer or bypass quality review.",
      { mutation, requestId: id, decisionId: id },
      true,
      (v, s) =>
        service(s).applyDecision(s.productionId, {
          ...m(s, v.mutation),
          requestId: v.requestId,
          decisionId: v.decisionId,
        }),
    ),
    tool(
      "record_evidence",
      "Retain redacted diagnostic JSON from an evidence transfer. This does not establish provider usage, cost, success or approval authority.",
      {
        transferId: id,
        evidenceId: id,
        operationId: id,
        kind: z.enum(["prompt", "input", "output", "trace"]),
      },
      true,
      async (v, s) => {
        const inputHash = fingerprint({ ...v, runId: s.job.run!.logicalId });
        const previous = await transfer(s).evidenceReceipt(
          v.transferId,
          inputHash,
        );
        if (previous) return previous.result;
        const payload = JSON.parse(
          (await transfer(s).read(v.transferId, "evidence", s.signal)).toString(
            "utf8",
          ),
        );
        s.signal.throwIfAborted();
        const receipt = await retainEvidence(s.db, s.actor.uid, {
          id: v.evidenceId,
          operationId: v.operationId,
          runId: s.job.run!.logicalId,
          kind: v.kind,
          payload,
          secrets: [s.secret],
        });
        await transfer(s).finishEvidence(v.transferId, inputHash, receipt);
        return receipt;
      },
    ),
    tool(
      "record_quality",
      "Apply evidence from a trusted measured reviewer publication. The policy comes from the server binding, never from tool input.",
      { evidenceId: id, measurementId: id },
      true,
      async (v, s) => {
        const payload = z
          .object({ productionId: id })
          .parse(await evidence(s, v.evidenceId));
        if (payload.productionId !== s.productionId) throw bookletMissing();
        const review = await recordBookletQuality(
          s.db,
          s.actor,
          await qualityPolicy(s),
          v.evidenceId,
          v.measurementId,
        );
        return {
          reviewId: review.id,
          target: review.target,
          disposition: review.disposition,
        };
      },
    ),
    tool(
      "sources",
      "Resolve exact approved original reference identities for a generation or reviewer. Fetch bytes separately through read_document.",
      {
        kind: z.enum(["generation", "reviewer"]),
        recordId: id,
        offset: count.default(0),
        sha256: hash.optional(),
      },
      false,
      async (v, s) => {
        let value: unknown;
        if (v.kind === "generation") {
          value = (await media(s).references(s.productionId, v.recordId)).map(
            ({ revisionId, asset }) => ({ revisionId, asset }),
          );
        } else {
          const input = await media(s).reviewerInputs(
            s.productionId,
            v.recordId,
          );
          value = {
            target: input.target,
            original: input.original.asset,
            sources: input.sources.map((source) => source.identity),
            references: input.referenceImages.map(({ revisionId, asset }) => ({
              revisionId,
              asset,
            })),
          };
        }
        return boundedChunk(
          Buffer.from(JSON.stringify(value)),
          v.offset,
          v.sha256,
        );
      },
      chunk,
    ),
    tool(
      "reconcile_generation",
      "Reconcile an existing operation using a trusted adapter/provider measurement. Unknown outcomes never authorize automatic replay.",
      { operationId: id, measurementId: id },
      true,
      async (v, s) => {
        await service(s).reconcileGeneration(
          s.productionId,
          v.operationId,
          v.measurementId,
        );
        return { operationId: v.operationId };
      },
    ),
    tool(
      "complete",
      "Verify accepted manifest content, approvals, quality and original bytes, then complete the owned production.",
      { mutation, manifestRevisionId: id },
      true,
      (v, s) =>
        service(s).complete(s.productionId, {
          ...m(s, v.mutation),
          runId: s.job._id,
          manifestRevisionId: v.manifestRevisionId,
        }),
    ),
  ];
}

export const bookletMcpTools = createBookletMcpTools();
