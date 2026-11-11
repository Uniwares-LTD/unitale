import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db } from "mongodb";
import type { AiJob } from "../ai/jobs";
import type { RegisteredTool, ToolContext } from "../mcp/tools";
import { database } from "../mongo";
import { authorizedRun } from "../runs/capabilities";
import { fingerprint } from "../foundation/canonical";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import { bookletRepositoryV2 } from "./repository-v2";
import { registerBookletWorkV2, bookletReferencesV2Schema } from "./work-v2";
import {
  workRegistrationV2Schema,
  artifactKindV2Schema,
  type ProductionV2,
  type WorkV2,
  type RevisionV2,
  type AssessmentV2,
  humanRequestInputV2Schema,
} from "./documents-v2";
import { id, subjectInputSchema } from "./documents";
import { readBookletDocumentV2 } from "./read-v2";
import { bookletTransfers, transferSchema } from "./mcp-transfers";
import { bookletMedia } from "./media";
import { downloadProviderImage } from "../runs/provider-images";
import { parseDifyConfig } from "../../config/dify";
import { reconcileBookletWorkV2 } from "./reconcile-v2";
import { readBookletSuiteV2 } from "./suite-v2";
import { bookletNativeCostsV2, bookletWorkUsageV2, bookletRunBoundsV2 } from "./usage-v2";
import {
  bookletContentV2Schema,
  bookletSourceV2Schema,
  bookletAssessmentV2Schema,
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
                retryOrdinal: 1,
                retryNotBefore: 1,
                retryAuthorization: 1,
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
            retryOrdinal: row.retryOrdinal,
            retryNotBefore: row.retryNotBefore?.toISOString() ?? null,
            dispatchReady: !row.retryNotBefore || row.retryNotBefore <= new Date(),
            retryAuthorized: row.retryAuthorization?.consumedByCallId === null,
            correction: row.correction,
            correctionRootId: row.correctionRootId,
            resultAvailable: row.resultAvailable,
            document: { kind: "work", id: row.callId },
            preflight: null as null | {
              mode: string; targetHash: string; disposition: string; complete: boolean;
              policyBinding: string; reviewerBinding: string;
            },
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
            retryOrdinal: retained.retryOrdinal,
            retryNotBefore: retained.retryNotBefore?.toISOString() ?? null,
            dispatchReady: !retained.retryNotBefore || retained.retryNotBefore <= new Date(),
            retryAuthorized: retained.retryAuthorization?.consumedByCallId === null,
            correction: retained.correction,
            correctionRootId: retained.correctionRootId,
            resultAvailable: retained.resultPayload !== undefined,
            document: { kind: "work", id: retained.callId },
            preflight: null,
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
        // The recent assessment preview is navigation, not all prior evidence.
        // Resolve the exact preflight needed by each registered Generate action.
        for (const fact of workFacts) {
          if (fact.status !== "registered" || fact.service !== "image-executor" || fact.operation !== "generate") continue;
          const selected = await s.db.collection<WorkV2>("bookletWork").findOne({ ...owned, callId: fact.callId });
          const prepared = z.object({ items: z.array(z.object({ input: z.object({
            prepared: z.object({ requestHash: z.string() }),
          }) })).length(1) }).safeParse(selected?.requestPayload);
          if (!prepared.success) continue;
          const match = await s.db.collection<AssessmentV2>("bookletAssessments").findOne({
            ...owned, "assessment.mode": "image_request",
            "assessment.targetHash": prepared.data.items[0].input.prepared.requestHash,
            "assessment.coverage.targetIds": selected!.targetIds,
            "assessment.disposition": "pass", complete: true,
            policyBinding: binding.policyBinding, reviewerBinding: binding.reviewerBinding,
          }, { projection: { assessment: 1, complete: 1, policyBinding: 1, reviewerBinding: 1 } });
          if (match) fact.preflight = {
            mode: match.assessment.mode, targetHash: match.assessment.targetHash,
            disposition: match.assessment.disposition, complete: match.complete,
            policyBinding: match.policyBinding, reviewerBinding: match.reviewerBinding,
          };
        }
        while (Buffer.byteLength(JSON.stringify(workFacts)) > 8192) {
          if (workFacts.length === 1) throw bookletConflict("Pending work summary exceeds context capacity; read its document.");
          workFacts.pop();
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
        // Whole-book evidence is an exact immutable selection, not the recent preview.
        const manifestEntry = s.production.subjects.find((subject) => subject.kind === "book")?.artifacts
          .find((artifact) => artifact.kind === "book-manifest");
        const state = z.object({ lastResult: z.object({ kind: z.string().optional(), id: id.optional(),
          revisionId: id.optional(), assessmentId: id.optional() }).optional() }).safeParse(s.production.checkpoint);
        const last = state.success ? state.data.lastResult : undefined;
        let focused = last?.revisionId ?? (last?.kind === "revision" ? last.id : undefined);
        const assessmentId = last?.assessmentId ?? (last?.kind === "assessment" ? last.id : undefined);
        if (!focused && assessmentId) {
          const row = await s.db.collection<AssessmentV2>("bookletAssessments").findOne({ ...owned, _id: assessmentId });
          const exact = row?.assessment.sources.filter((source) => source.contentHash === row.assessment.targetHash);
          focused = row?.assessment.sources.find((source) => source.artifactId === manifestEntry?.id)?.revisionId ??
            (exact?.length === 1 ? exact[0].revisionId : undefined);
        }
        const selectedRevision = focused ? await s.db.collection<RevisionV2>("bookletRevisions").findOne({ ...owned, _id: focused }) : null;
        let acceptanceReview = null;
        if (selectedRevision && selectedRevision.kind !== "book-manifest") {
          const subject = s.production.subjects.find((subject) => subject.id === selectedRevision.subjectId &&
            subject.artifacts.some((artifact) => artifact.id === selectedRevision.artifactId && artifact.kind === selectedRevision.kind));
          const image = ["reference", "page-image"].includes(selectedRevision.kind);
          const modes = image ? ["image", "correction"] : ["text", "specification", "correction"];
          const visited = new Set<string>();
          let candidate: RevisionV2 | null = subject ? selectedRevision : null;
          while (candidate && !visited.has(candidate._id) && !acceptanceReview) {
            visited.add(candidate._id);
            const source = { artifactId: candidate.artifactId, revisionId: candidate._id, contentHash: candidate.contentHash };
            for await (const row of s.db.collection<AssessmentV2>("bookletAssessments").find({
              ...owned, complete: true, policyBinding: binding.policyBinding, reviewerBinding: binding.reviewerBinding,
              "assessment.disposition": "pass", "assessment.mode": { $in: modes as AssessmentV2["assessment"]["mode"][] },
              "assessment.sources": { $elemMatch: source },
            }).batchSize(1)) {
              const assessment = row.assessment;
              const aliases = [candidate.artifactId, candidate.subjectId];
              const targets = assessment.sources.filter((source) => assessment.coverage.targetIds.includes(source.artifactId) ||
                s.production.subjects.some((subject) => assessment.coverage.targetIds.includes(subject.id) &&
                  subject.artifacts.some((artifact) => artifact.id === source.artifactId)));
              if (!aliases.some((alias) => assessment.coverage.targetIds.includes(alias)) ||
                (assessment.targetHash !== candidate.contentHash && assessment.targetHash !== fingerprint(targets)) ||
                (image && candidate.assets.some((asset) => !(assessment.coverage.assetIds ?? []).includes(asset.assetId)))) continue;
              acceptanceReview = { revisionId: selectedRevision._id, contentHash: selectedRevision.contentHash,
                reviewedRevisionId: candidate._id, assessmentId: row._id, targetIds: aliases,
                assetIds: selectedRevision.assets.map((asset) => asset.assetId), mode: assessment.mode,
                disposition: assessment.disposition, complete: row.complete,
                policyBinding: row.policyBinding, reviewerBinding: row.reviewerBinding };
              break;
            }
            if (acceptanceReview || !candidate.revalidatedFrom) break;
            candidate = await s.db.collection<RevisionV2>("bookletRevisions").findOne({ ...owned,
              _id: candidate.revalidatedFrom, artifactId: selectedRevision.artifactId, kind: selectedRevision.kind,
            });
            if (candidate && (candidate.contentHash !== selectedRevision.contentHash ||
              fingerprint(candidate.assets) !== fingerprint(selectedRevision.assets))) candidate = null;
          }
        }
        const manifestFilter = { ...owned, artifactId: manifestEntry?.id, kind: "book-manifest" as const };
        let selectedManifest = selectedRevision?.kind === "book-manifest" && selectedRevision.artifactId === manifestEntry?.id ? selectedRevision : null;
        const defaultManifest = manifestEntry?.acceptedRevisionId ?? manifestEntry?.currentRevisionId;
        if (!selectedManifest && defaultManifest)
          selectedManifest = await s.db.collection<RevisionV2>("bookletRevisions").findOne({ ...manifestFilter, _id: defaultManifest });
        let manifestReview = null;
        if (selectedManifest?.content.kind === "book-manifest") {
          const required = {
            pages: new Set(selectedManifest.content.pages.map((page) => page.pageId)),
            originals: new Set(selectedManifest.content.pages.map((page) => page.assetId)),
            comparisons: new Set(selectedManifest.content.continuityPairs.map((pair) => fingerprint(pair))),
          };
          const covered = { pages: new Set<string>(), originals: new Set<string>(), comparisons: new Set<string>() };
          for await (const row of s.db.collection<AssessmentV2>("bookletAssessments").find({
            ...owned, complete: true, policyBinding: binding.policyBinding, reviewerBinding: binding.reviewerBinding,
            "assessment.mode": "whole_book", "assessment.disposition": "pass", "assessment.targetHash": selectedManifest.contentHash,
            "assessment.sources": { $elemMatch: { artifactId: selectedManifest.artifactId,
              revisionId: selectedManifest._id, contentHash: selectedManifest.contentHash } },
          }, { projection: { "assessment.coverage": 1 } }).batchSize(20)) {
            for (const page of row.assessment.coverage.targetIds) if (required.pages.has(page)) covered.pages.add(page);
            for (const asset of row.assessment.coverage.assetIds ?? []) if (required.originals.has(asset)) covered.originals.add(asset);
            for (const pair of row.assessment.coverage.continuityPairs ?? []) {
              const hash = fingerprint(pair);
              if (required.comparisons.has(hash)) covered.comparisons.add(hash);
            }
          }
          manifestReview = { manifestRevisionId: selectedManifest._id, manifestHash: selectedManifest.contentHash,
            policyBinding: binding.policyBinding, reviewerBinding: binding.reviewerBinding,
            required: { pages: required.pages.size, originals: required.originals.size, comparisons: required.comparisons.size },
            covered: { pages: covered.pages.size, originals: covered.originals.size, comparisons: covered.comparisons.size } };
        }
        const workAttempts = await bookletWorkUsageV2(s.db, s.production);
        const costs = await bookletNativeCostsV2(s.db, s.production);
        const execution = await bookletRunBoundsV2(s.db, s.production);
        const textLimit = s.production.creativeConfigSnapshot.execution.maxTextCalls;
        const canDispatch = s.production.lifecycleState === "in-progress" && workAttempts.paidLlm < textLimit && !costs.overCeiling && !execution.overLimit;
        const canDispatchImage = s.production.lifecycleState === "in-progress" && workAttempts.paidImage < s.production.creativeConfigSnapshot.execution.maxImageCalls &&
          !costs.overCeiling && !execution.overLimit;
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
          acceptanceHistoryDocument: { kind: "acceptance_history", id: s.production._id },
          humanHistoryDocument: { kind: "human_history", id: s.production._id },
          executionHistoryDocument: { kind: "execution_history", id: s.production._id },
          productionHistoryDocument: { kind: "production_history", id: s.production.bookletId },
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
          manifestReview,
          acceptanceReview,
          corrections: correctionFacts,
          correctionsComplete:
            workFacts.length === work.length &&
            correctionFacts.length === correctionRoots.length,
          usage: {
            canDispatch,
            canDispatchImage,
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
      "record_assessment",
      "Record an exact retained Reviewer proposal with server-derived policy identity. Model claims cannot create execution, coverage or Reviewer authority.",
      async (raw, s) => {
        const request = z.strictObject({
          assessment: bookletAssessmentV2Schema,
          executionLocator: z.strictObject({
            runId: id,
            nodeId: z.literal("child-quality-reviewer"),
            executionId: id,
          }),
          fence: count,
        }).parse(raw);
        const candidates = await s.db.collection<WorkV2>("bookletWork").find({
          ownerId: s.actor.uid, productionId: s.production._id,
          service: "quality-reviewer", status: { $in: ["succeeded", "partial"] },
          "resultObservation.runId": request.executionLocator.runId,
          "resultObservation.nodeId": request.executionLocator.nodeId,
          "resultObservation.executionId": request.executionLocator.executionId,
        }).limit(2).toArray();
        if (candidates.length !== 1 || candidates[0].requestPayload === undefined)
          throw bookletConflict("An unambiguous retained Reviewer execution is required.");
        const work = candidates[0];
        const parent = await s.db.collection<AiJob>("aiJobs").findOne({
          _id: work.runId, uid: s.actor.uid, runId: request.executionLocator.runId,
          "run.target.adapter": "booklet", "run.target.version": "2", "run.target.id": s.production._id,
        });
        if (!parent) throw bookletMissing();
        // Retain the originating Run's immutable configured policy across continuation.
        const binding = await readBookletSuiteV2(s.db, s.production, parent);
        const m = await mutation(s, "recordAssessment", request, request.fence);
        const receipt = await bookletRepositoryV2(s.db, s.actor, undefined, { atomicMutations: true })
          .recordAssessment(s.production._id, {
            ...m, callId: work.callId,
            policyBinding: binding.policyBinding, reviewerBinding: binding.reviewerBinding,
            assessment: request.assessment, evidenceIds: work.evidenceIds,
          });
        const recorded = await s.db.collection<AssessmentV2>("bookletAssessments").findOne({
          _id: receipt.assessmentId!, ownerId: s.actor.uid, productionId: s.production._id,
        }, { projection: { complete: 1 } });
        if (!recorded) throw bookletMissing();
        return { assessmentId: receipt.assessmentId, complete: recorded.complete, fence: receipt.fence };
      },
    ),
    tool(
      "complete",
      "Complete the explicitly selected immutable manifest after owned structural/product/original checks. Manager owns quality and human policy; this does not terminate or replay its native Run.",
      async (raw, s) => {
        const request = z.strictObject({ manifestRevisionId: id, fence: count }).parse(raw);
        const m = await mutation(s, "complete", request, request.fence);
        const receipt = await bookletRepositoryV2(s.db, s.actor, undefined, { atomicMutations: true })
          .complete(s.production._id, { ...m, runId: s.job._id, manifestRevisionId: request.manifestRevisionId });
        return { status: "complete", manifestRevisionId: receipt.revisionId, version: receipt.version, fence: receipt.fence };
      },
    ),
    tool(
      "request_human",
      "Retain an exact current-target presentation for the existing native Human Input. Read human_response by requestId for authenticated replies; this never creates an answer or acceptance.",
      async (raw, s) => {
        const request = humanRequestInputV2Schema.extend({ fence: count }).parse(raw);
        if (s.job.run?.orchestrator.responseMode !== "raw-v1")
          throw bookletConflict("Booklet Human Input requires the accepted raw-v1 response mode.");
        const m = await mutation(s, "requestHuman", request, request.fence);
        const receipt = await bookletRepositoryV2(s.db, s.actor, undefined, { atomicMutations: true })
          .requestHuman(s.production._id, { ...m, ...request, runId: s.job._id });
        const human = receipt.humanRequest!;
        return { requestId: human.requestId, presentationHash: human.presentationHash,
          formContent: human.formContent, fence: receipt.fence };
      },
    ),
    tool(
      "record_acceptance",
      "Record the current Manager's selection of an exact owned revision, sources and originals. This is distinct from a Reviewer assessment or authenticated human response.",
      async (raw, s) => {
        const request = z.strictObject({
          revisionId: id, contentHash: z.string().regex(/^[a-f0-9]{64}$/),
          targetIds: z.array(id).min(1), assetIds: z.array(id),
          sources: z.array(bookletSourceV2Schema), evidence: z.array(id), fence: count,
        }).parse(raw);
        const repo = bookletRepositoryV2(s.db, s.actor, undefined, { atomicMutations: true });
        const revision = await repo.getRevision(s.production._id, request.revisionId);
        if (fingerprint(revision.sources) !== fingerprint(request.sources))
          throw bookletConflict("Acceptance sources differ from the selected immutable revision.");
        const m = await mutation(s, "recordAcceptance", request, request.fence);
        const receipt = await repo.recordAcceptance(s.production._id, {
          ...m, runId: s.job._id, revisionId: request.revisionId,
          contentHash: request.contentHash, targetIds: request.targetIds,
          assetIds: request.assetIds, evidenceIds: request.evidence,
        });
        return { acceptanceId: receipt.acceptanceId, version: receipt.version, fence: receipt.fence };
      },
    ),
    tool(
      "retain_original",
      "Retain one exact observed native image output using the restricted Dify downloader and existing original-byte store. Storage retries never regenerate.",
      async (raw, s) => {
        const request = z.strictObject({ callId: id, outputKey: id, nativeFile: z.json(), fence: count }).parse(raw);
        const repo = bookletRepositoryV2(s.db, s.actor, undefined, { atomicMutations: true });
        const work = await repo.getWork(s.production._id, request.callId);
        const result = z.object({ items: z.array(z.object({ outputs: z.array(z.object({
          outputKey: id, nativeFile: z.json(),
        })) })).length(1) }).safeParse(work.resultPayload);
        const selected = result.success ? result.data.items[0].outputs.filter((output) => output.outputKey === request.outputKey) : [];
        if (work.service !== "image-executor" || work.operation !== "generate" || work.category !== "paidImage" ||
          !["succeeded", "partial"].includes(work.status) || !work.resultObservation || selected.length !== 1 ||
          fingerprint(selected[0].nativeFile) !== fingerprint(request.nativeFile))
          throw bookletConflict("Retain only the exact observed native image output.");
        const m = await mutation(s, "refreshFence", request, request.fence);
        const receipt = await repo.refreshFence(s.production._id, m);
        const media = bookletMedia(s.db, s.actor, { documentVersion: 2, maxBytes: 8 * 1024 * 1024 });
        const assetId = fingerprint([s.actor.uid, s.production._id, request.callId, request.outputKey, null]);
        const prior = await s.db.collection("bookletAssets").findOne({
          _id: assetId as never, ownerId: s.actor.uid, productionId: s.production._id, state: "ready", originalAssetId: null,
        });
        if (prior) return { asset: (await media.read(s.production._id, assetId)).asset, fence: receipt.fence };
        const file = z.object({ type: z.literal("image"), transfer_method: z.literal("tool_file"),
          related_id: z.string().uuid(), url: z.string().max(2048),
        }).parse(request.nativeFile);
        const config = parseDifyConfig(process.env);
        if (config.mode !== "live") throw bookletConflict("Native original download configuration is unavailable.");
        const bytes = await downloadProviderImage(file, config.baseUrl, 8 * 1024 * 1024);
        s.signal.throwIfAborted();
        const payload = z.object({ items: z.array(z.object({ input: z.object({ prepared: z.object({
          settings: z.object({ format: z.enum(["png", "jpeg", "webp"]) }),
        }) }) })).length(1) }).parse(work.requestPayload);
        const asset = await media.retainOriginal(s.production._id, { operationId: work.callId,
          outputKey: request.outputKey, mime: `image/${payload.items[0].input.prepared.settings.format}`,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        }, bytes);
        return { asset, fence: receipt.fence };
      },
    ),
    tool(
      "save_revision",
      "Publish an exact retained proposal/original, or a Manager-assembled manifest bound to immutable page-image sources and originals. Text/image producer evidence and creative funding/locks remain required; manifest assembly needs no provider call. Prefer content {callId,itemId,proposalIndex} for text.",
      async (raw, s) => {
        const request = z
          .strictObject({
            artifactId: id,
            content: z.union([
              bookletContentV2Schema,
              z.strictObject({ transferId: id }),
              z.strictObject({ callId: id, itemId: id, proposalIndex: count }),
            ]).optional(),
            revalidatedFrom: id.optional(),
            sources: z.array(bookletSourceV2Schema),
            assets: z.array(assetIdentitySchema),
            evidence: z.array(id),
            mutationKey: id,
            fence: count,
          })
          .parse(raw);
        let resolved = request.content;
        if (resolved === undefined) {
          if (!request.revalidatedFrom) throw bookletConflict("Content or a revalidatedFrom revision is required.");
          resolved = (await bookletRepositoryV2(s.db, s.actor).getRevision(s.production._id, request.revalidatedFrom)).content;
        } else if (!("kind" in resolved) && "transferId" in resolved) {
          resolved = bookletContentV2Schema.parse(JSON.parse((await bookletTransfers(s.db, s.actor, s.production._id, 2)
            .read(resolved.transferId, "revision", s.signal)).toString("utf8")));
        }
        const manifest = "kind" in resolved && resolved.kind === "book-manifest";
        if (!manifest && !request.evidence.length) throw bookletConflict("Retained producer evidence is required.");
        const producers = manifest ? [] : await s.db
          .collection<WorkV2>("bookletWork")
          .find({
            ownerId: s.actor.uid,
            productionId: s.production._id,
            status: { $in: ["succeeded", "partial"] },
            evidenceIds: { $all: request.evidence },
          })
          .limit(2)
          .toArray();
        if (!manifest && producers.length !== 1)
          throw bookletConflict(
            "An unambiguous retained producer is required.",
          );
        let content: z.infer<typeof bookletContentV2Schema>;
        if ("kind" in resolved) content = resolved;
        else if ("callId" in resolved) {
          const reference = resolved;
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
        } else throw bookletConflict("Revision content could not be resolved.");
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
          ...(request.revalidatedFrom ? { revalidatedFrom: request.revalidatedFrom } : {}),
          provenance: {
            runId: s.job._id,
            operationId: manifest ? "manifest:" + fingerprint([request.artifactId, content, request.sources, request.assets]) : producers[0].callId,
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
    {
      name: "booklet_sources_v2",
      description: "Verify owned immutable sources and return exact original pixels in requested order. Never return derivatives or resize originals.",
      permission: "extension:booklets:read",
      write: false,
      runContext: true,
      input,
      // Strip the internal binary carrier before JSON output. The existing MCP
      // handler projects it separately as ordered image content blocks.
      output: z.object({ result: z.object({ references: bookletReferencesV2Schema }) }),
      images: (result) => z.array(z.object({ data: z.instanceof(Uint8Array), mimeType: z.string() })).parse(result.images),
      async run(raw, context) {
        const value = input.parse(raw);
        const s = await scope(value.runContext, "booklet_sources_v2", context);
        const payload: unknown = JSON.parse(value.request);
        if (JSON.stringify(payload).includes(s.secret)) throw bookletConflict("Private Run context cannot enter source requests.");
        const request = z.strictObject({
          sources: z.array(bookletSourceV2Schema),
          references: bookletReferencesV2Schema,
        }).parse(payload);
        const records = await s.db.collection<RevisionV2>("bookletRevisions").find({
          ownerId: s.actor.uid,
          productionId: s.production._id,
          documentVersion: 2,
          _id: { $in: request.sources.map((source) => source.revisionId) },
        }, { projection: { _id: 1, artifactId: 1, contentHash: 1 } }).toArray();
        for (const source of request.sources)
          if (!records.some((row) => row._id === source.revisionId && row.artifactId === source.artifactId && row.contentHash === source.contentHash))
            throw bookletConflict("Source identity differs from its owned immutable revision.");
        const media = bookletMedia(s.db, s.actor, { documentVersion: 2, maxBytes: 8 * 1024 * 1024 });
        const images: { data: Uint8Array; mimeType: string }[] = [];
        const references: { assetId: string; sha256: string; bytes: number }[] = [];
        for (const ref of request.references) {
          s.signal.throwIfAborted();
          if (!await s.db.collection("bookletAssets").findOne({
            _id: ref.assetId as never, ownerId: s.actor.uid, originalAssetId: null, state: "ready",
            sha256: ref.sha256, bytes: ref.bytes,
          }, { projection: { _id: 1 } }))
            throw bookletConflict("Source must match its exact retained original identity.");
          const original = await media.read(s.production._id, ref.assetId);
          if (original.asset.originalAssetId || original.asset.sha256 !== ref.sha256 || original.asset.bytes !== ref.bytes)
            throw bookletConflict("Source must match its exact retained original identity.");
          references.push({ assetId: ref.assetId, sha256: ref.sha256, bytes: ref.bytes });
          images.push({ data: original.bytes, mimeType: original.asset.mime });
        }
        s.signal.throwIfAborted();
        if (JSON.stringify(references).includes(s.secret)) throw bookletConflict("Private Run context cannot be returned.");
        return { result: { references }, images };
      },
    },
    tool(
      "begin_work",
      "Register child intent or atomically authorize configured text/image work or unpaid preparation, checking ownership, funding, locks and usage.",
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
          const payload = z.object({ references: bookletReferencesV2Schema }).safeParse(work.requestPayload);
          const prepare = work.service === "image-executor" && work.operation === "prepare" && work.category === "nonPaid";
          const generate = work.service === "image-executor" && work.operation === "generate" && work.category === "paidImage";
          if ((!prepare && !generate && work.category !== "paidLlm") || work.service === "manager" || (work.service === "image-executor" && !prepare && !generate) ||
            (work.service === "quality-reviewer" && !["text", "specification", "image_request", "image", "whole_book", "correction"].includes(work.operation)) || !payload.success)
            throw bookletConflict("Only registered specialist work with bounded original references is available for dispatch.");
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
