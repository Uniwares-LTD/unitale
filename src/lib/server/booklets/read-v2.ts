import "server-only";
import { z } from "zod";
import type { Db, Document } from "mongodb";
import type { AiJob } from "../ai/jobs";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import { bookletRepositoryV2 } from "./repository-v2";
import {
  acceptanceDocumentV2Schema,
  assessmentDocumentV2Schema,
  revisionV2Schema,
  humanRequestV2Schema,
} from "./documents-v2";
import { rawResponseTextSchema } from "../../contracts/runs";
import type { Decision } from "../runs/service";
import { bookletConflict, bookletMissing } from "./context";
import { id } from "./documents";

export const bookletReadV2Schema = z.strictObject({
  kind: z.enum([
    "production",
    "checkpoint",
    "correction",
    "revision",
    "work",
    "assessment",
    "acceptance",
    "human_response",
    "history",
    "work_history",
    "assessment_history",
    "acceptance_history",
    "human_history",
    "execution",
    "execution_history",
    "production_history",
  ]),
  id,
  cursor: z.string().max(16384).optional(),
});
const cursorSchema = z.strictObject({
  scope: z.string().regex(/^[a-f0-9]{64}$/),
  path: z
    .array(z.union([z.string(), z.number().int().nonnegative().safe()]))
    .max(32),
  offset: z.number().int().nonnegative().safe(),
});
type Json = z.infer<ReturnType<typeof z.json>>;
const bodyBytes = 8192;
const replyBytes = 20 * 1024;

/** Decoded, bounded sections of an allowlisted owned document. Cursors select only
 * that DTO; they grant no access and cannot traverse database/private fields. */
export async function readBookletDocumentV2(
  db: Db,
  actor: CreditActor,
  productionId: string,
  raw: unknown,
) {
  const request = bookletReadV2Schema.parse(raw);
  const repo = bookletRepositoryV2(db, actor);
  if (
    request.kind === "work_history" ||
    request.kind === "assessment_history" ||
    request.kind === "acceptance_history" ||
    request.kind === "human_history" ||
    request.kind === "execution_history" ||
    request.kind === "production_history"
  ) {
    const production = await repo.getProduction(productionId);
    const productionHistory = request.kind === "production_history";
    if (
      request.id !== (productionHistory ? production.bookletId : productionId)
    )
      throw bookletMissing();
    let name: string, filter: Document, projection: Document;
    switch (request.kind) {
      case "work_history":
        name = "bookletWork";
        projection = { _id: 1, callId: 1, service: 1, operation: 1, status: 1 };
        break;
      case "assessment_history":
        name = "bookletAssessments";
        projection = {
          _id: 1,
          callId: 1,
          "assessment.mode": 1,
          "assessment.targetHash": 1,
          "assessment.disposition": 1,
          complete: 1,
        };
        break;
      case "acceptance_history":
        name = "bookletAcceptances";
        projection = {
          _id: 1,
          runId: 1,
          revisionId: 1,
          contentHash: 1,
          createdAt: 1,
        };
        break;
      case "human_history":
        name = "bookletRepositoryWrites";
        projection = {
          _id: 1,
          "result.humanRequest.requestId": 1,
          "result.humanRequest.runId": 1,
          "result.humanRequest.presentationHash": 1,
          createdAt: 1,
        };
        break;
      case "execution_history":
        name = "aiJobs";
        projection = {
          _id: 1,
          status: 1,
          runId: 1,
          "run.logicalId": 1,
          createdAt: 1,
        };
        break;
      default:
        name = "bookletProductions";
        projection = {
          _id: 1,
          documentVersion: 1,
          version: 1,
          lifecycleState: 1,
          sourceProductionId: 1,
          currentManifestRevisionId: 1,
          createdAt: 1,
        };
    }
    const collection = db.collection(name);
    if (request.kind === "execution_history")
      filter = {
        uid: actor.uid,
        "run.target.adapter": "booklet",
        "run.target.version": "2",
        "run.target.id": productionId,
      };
    else if (request.kind === "human_history")
      filter = {
        ownerId: actor.uid,
        productionId,
        "result.humanRequest": { $exists: true },
      };
    else if (productionHistory)
      filter = {
        ownerId: actor.uid,
        bookletId: production.bookletId,
        documentVersion: { $in: [1, 2] },
      };
    else filter = { ownerId: actor.uid, productionId, documentVersion: 2 };
    const inventoryCount = await collection.countDocuments(filter);
    const scope = fingerprint([
      actor.uid,
      productionId,
      request.kind,
      production.version,
      inventoryCount,
    ]);
    const position = request.cursor
      ? z
          .strictObject({
            scope: z.string(),
            after: id,
          })
          .parse(
            JSON.parse(
              Buffer.from(request.cursor, "base64url").toString("utf8"),
            ),
          )
      : { scope, after: "" };
    if (position.scope !== scope)
      throw bookletConflict(
        "History changed or cursor belongs to another query; restart the read.",
      );
    const rows = await collection
      .find(
        {
          ...filter,
          _id: { $gt: position.after as never },
        },
        { projection },
      )
      .sort({ _id: 1 })
      .limit(21)
      .toArray();
    const items = rows.slice(0, 20).map((row) => {
      const createdAt =
        row.createdAt instanceof Date ? row.createdAt.toISOString() : null;
      switch (request.kind) {
        case "work_history":
          return {
            callId: row.callId,
            service: row.service,
            operation: row.operation,
            status: row.status,
            document: { kind: "work", id: row.callId },
          };
        case "assessment_history":
          return {
            assessmentId: row._id,
            callId: row.callId,
            ...row.assessment,
            complete: row.complete,
            document: { kind: "assessment", id: row._id },
          };
        case "acceptance_history":
          return {
            acceptanceId: row._id,
            runId: row.runId,
            revisionId: row.revisionId,
            contentHash: row.contentHash,
            createdAt,
            document: { kind: "acceptance", id: row._id },
          };
        case "human_history":
          return {
            requestId: row.result.humanRequest.requestId,
            runId: row.result.humanRequest.runId,
            presentationHash: row.result.humanRequest.presentationHash,
            createdAt,
            document: {
              kind: "human_response",
              id: row.result.humanRequest.requestId,
            },
          };
        case "execution_history":
          return {
            runId: row._id,
            logicalId: row.run?.logicalId ?? null,
            nativeRunId: row.runId ?? null,
            status: row.status,
            createdAt,
            document: { kind: "execution", id: row._id },
          };
        default:
          return {
            productionId: row._id,
            documentVersion: row.documentVersion,
            version: row.version,
            state: row.lifecycleState,
            sourceProductionId: row.sourceProductionId,
            manifestRevisionId: row.currentManifestRevisionId,
            createdAt,
          };
      }
    });
    while (
      items.length &&
      Buffer.byteLength(JSON.stringify(items)) > replyBytes - 1024
    )
      items.pop();
    if (rows.length && !items.length)
      throw bookletConflict("History metadata exceeds response capacity.");
    return {
      kind: request.kind,
      id: request.id,
      items,
      productionVersion: production.version,
      complete: !request.cursor && rows.length === items.length,
      cursor:
        rows.length > items.length
          ? Buffer.from(
              JSON.stringify({ scope, after: rows[items.length - 1]._id }),
            ).toString("base64url")
          : null,
    };
  }
  if (request.kind === "history") {
    const production = await repo.getProduction(productionId);
    const artifact = production.subjects
      .flatMap((subject) => subject.artifacts)
      .find((artifact) => artifact.id === request.id);
    if (!artifact) throw bookletMissing();
    const filter = {
      ownerId: actor.uid,
      productionId,
      artifactId: request.id,
      documentVersion: 2,
    };
    const scope = fingerprint([actor.uid, productionId, "history", request.id]);
    const latest = request.cursor
      ? null
      : await db
          .collection("bookletRevisions")
          .find(filter, { projection: { ordinal: 1 } })
          .sort({ ordinal: -1 })
          .limit(1)
          .next();
    const position = request.cursor
      ? z
          .strictObject({
            scope: z.string(),
            after: z.number().int().nonnegative().safe(),
            through: z.number().int().nonnegative().safe(),
          })
          .parse(
            JSON.parse(
              Buffer.from(request.cursor, "base64url").toString("utf8"),
            ),
          )
      : {
          scope,
          after: 0,
          through: z
            .number()
            .int()
            .nonnegative()
            .safe()
            .parse(latest?.ordinal ?? 0),
        };
    if (position.scope !== scope || position.after > position.through)
      throw bookletConflict("History cursor belongs to another query.");
    const metadata = z.strictObject({
      _id: revisionV2Schema.shape._id,
      ordinal: revisionV2Schema.shape.ordinal,
      kind: revisionV2Schema.shape.kind,
      contentHash: revisionV2Schema.shape.contentHash,
      createdAt: revisionV2Schema.shape.createdAt,
    });
    const rows = await db
      .collection("bookletRevisions")
      .find(
        { ...filter, ordinal: { $gt: position.after, $lte: position.through } },
        {
          projection: {
            _id: 1,
            ordinal: 1,
            kind: 1,
            contentHash: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ ordinal: 1 })
      .limit(21)
      .toArray();
    const items = rows.slice(0, 20).map((stored) => {
      const row = metadata.parse(stored);
      if (row.kind !== artifact.kind)
        throw bookletConflict("Revision kind differs from the artifact index.");
      return {
        revisionId: row._id,
        ordinal: row.ordinal,
        kind: row.kind,
        contentHash: row.contentHash,
        createdAt: row.createdAt.toISOString(),
      };
    });
    return {
      kind: "history",
      id: request.id,
      items,
      snapshotOrdinal: position.through,
      complete: position.after === 0 && rows.length <= 20,
      cursor:
        rows.length > 20
          ? Buffer.from(
              JSON.stringify({ ...position, after: items.at(-1)!.ordinal }),
            ).toString("base64url")
          : null,
    };
  }
  let document: unknown;
  if (request.kind === "correction") {
    document = await repo.getCorrection(productionId, request.id);
  } else if (request.kind === "checkpoint") {
    if (request.id !== productionId) throw bookletMissing();
    const row = await repo.getProduction(productionId);
    document = {
      checkpointVersion: row.checkpointVersion,
      state: row.checkpoint,
    };
  } else if (request.kind === "production") {
    if (request.id !== productionId) throw bookletMissing();
    const row = await repo.getProduction(productionId);
    document = {
      productionId: row._id,
      bookletId: row.bookletId,
      version: row.version,
      state: row.lifecycleState,
      brief: row.brief,
      creativeConfig: row.creativeConfigSnapshot,
      subjects: row.subjects,
      stageLocks: row.stageLocks,
      currentManifestRevisionId: row.currentManifestRevisionId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  } else if (request.kind === "revision") {
    const row = await repo.getRevision(productionId, request.id);
    document = {
      revisionId: row._id,
      artifactId: row.artifactId,
      subjectId: row.subjectId,
      ordinal: row.ordinal,
      kind: row.kind,
      content: row.content,
      sources: row.sources,
      assets: row.assets,
      contentHash: row.contentHash,
      ...(row.revalidatedFrom ? { revalidatedFrom: row.revalidatedFrom } : {}),
    };
  } else if (request.kind === "work") {
    const row = await repo.getWork(productionId, request.id);
    document = {
      callId: row.callId,
      runId: row.runId,
      service: row.service,
      operation: row.operation,
      requestHash: row.requestHash,
      ...(row.requestPayload === undefined
        ? {}
        : { requestPayload: row.requestPayload }),
      actionKey: row.actionKey,
      status: row.status,
      category: row.category,
      retryOrdinal: row.retryOrdinal,
      retryable: row.retryable,
      sources: row.sources,
      targetIds: row.targetIds,
      correctionRootId: row.correctionRootId,
      correction: row.correction,
      reviewScope: row.reviewScope,
      evidenceIds: row.evidenceIds,
      ...(row.reconciliation ? { reconciliation: {
        nextAt: row.reconciliation.nextAt?.toISOString() ?? null,
        failedReads: row.reconciliation.failedReads, reason: row.reconciliation.reason,
      } } : {}),
      ...(row.resultPayload === undefined
        ? {}
        : { resultPayload: row.resultPayload }),
      ...(row.resultObservation === undefined
        ? {}
        : { resultObservation: row.resultObservation }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  } else if (request.kind === "execution") {
    await repo.getProduction(productionId);
    const row = await db
      .collection<AiJob>("aiJobs")
      .findOne({
        _id: request.id,
        uid: actor.uid,
        "run.target.adapter": "booklet",
        "run.target.version": "2",
        "run.target.id": productionId,
      });
    if (!row) throw bookletMissing();
    const usage = row.execution?.usage;
    document = {
      runId: row._id,
      logicalId: row.run?.logicalId ?? null,
      nativeRunId: row.runId,
      workflowId:
        row.execution?.workflowId ?? row.run?.orchestrator.workflowId ?? null,
      status: row.status,
      nativeStatus: row.execution?.status ?? null,
      cancelRequested: row.cancelRequested,
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
      usage: usage
        ? {
            scope: usage.scope,
            id: usage.id,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            elapsedMs: usage.elapsedMs,
            cost: usage.cost
              ? {
                  amount: usage.cost.amount,
                  currency: usage.cost.currency,
                  source: usage.cost.source,
                }
              : null,
          }
        : null,
    };
  } else if (request.kind === "human_response") {
    const production = await repo.getProduction(productionId);
    const receipt = await db.collection("bookletRepositoryWrites").findOne({
      ownerId: actor.uid, productionId, "result.humanRequest.requestId": request.id,
    });
    if (!receipt) throw bookletMissing();
    const human = humanRequestV2Schema.parse(receipt.result.humanRequest);
    const stale = human.targets.some((target) => !production.subjects.some((subject) =>
      subject.artifacts.some((artifact) => artifact.id === target.artifactId && artifact.currentRevisionId === target.revisionId)));
    const matches = await db.collection<Decision>("runDecisions").find({
      uid: actor.uid, jobId: human.runId, nodeId: "human",
      "form.form_content": human.formContent + "\n{{#$output.response#}}",
    }).limit(2).toArray();
    if (matches.length > 1) throw bookletConflict("Human presentation has ambiguous native decisions; reconcile before reuse.");
    const decision = matches[0];
    let status = stale ? "stale" : "pending";
    let response: Json = null;
    if (!stale && decision?.status === "submitted" && decision.answerSource?.type === "user" && decision.intent) {
      const action = decision.confirmedAction ?? decision.intent.action;
      const original = "response" in decision.intent ? decision.intent.response : decision.intent.inputs.response;
      const sent = rawResponseTextSchema.parse(original);
      const confirmed = z.object({ response: z.string() }).safeParse(decision.confirmedInputs);
      if (action !== "continue" || decision.intent.action !== "continue" || decision.intent.inputs.response !== sent ||
        (decision.confirmedInputs !== undefined && (!confirmed.success || confirmed.data.response !== sent)))
        throw bookletConflict("Human response differs from its authenticated submission.");
      status = "submitted";
      response = z.json().parse(original);
    } else if (!stale && (decision?.status === "expired" ||
      (decision?.form?.expiration_time && decision.form.expiration_time * 1000 < Date.now()))) status = "expired";
    document = { ...human, status, decisionId: decision?._id ?? null, response };
  } else if (request.kind === "acceptance") {
    await repo.getProduction(productionId);
    const stored = await db.collection("bookletAcceptances").findOne({
      _id: request.id as never, ownerId: actor.uid, productionId,
    });
    if (!stored) throw bookletMissing();
    const row = acceptanceDocumentV2Schema.parse(stored);
    document = { acceptanceId: row._id, runId: row.runId, revisionId: row.revisionId,
      contentHash: row.contentHash, targetIds: row.targetIds, assetIds: row.assetIds,
      evidenceIds: row.evidenceIds, createdAt: row.createdAt.toISOString() };
  } else {
    await repo.getProduction(productionId);
    const stored = await db.collection("bookletAssessments").findOne({
      _id: request.id as never,
      ownerId: actor.uid,
      productionId,
    });
    if (!stored) throw bookletMissing();
    const row = assessmentDocumentV2Schema.parse(stored);
    document = {
      assessmentId: row._id,
      callId: row.callId,
      policyBinding: row.policyBinding,
      reviewerBinding: row.reviewerBinding,
      assessment: row.assessment,
      complete: row.complete,
      evidenceIds: row.evidenceIds,
      createdAt: row.createdAt.toISOString(),
    };
  }
  const root = z.json().parse(document);
  const documentHash = fingerprint(root);
  const scope = fingerprint([
    actor.uid,
    productionId,
    request.kind,
    request.id,
    documentHash,
  ]);
  const position = request.cursor
    ? cursorSchema.parse(
        JSON.parse(Buffer.from(request.cursor, "base64url").toString("utf8")),
      )
    : { scope, path: [], offset: 0 };
  if (position.scope !== scope)
    throw bookletConflict(
      "Read cursor belongs to another document or the document changed.",
    );
  let value: Json = root;
  for (const key of position.path) {
    if (
      value === null ||
      typeof value !== "object" ||
      (Array.isArray(value)
        ? typeof key !== "number"
        : typeof key !== "string") ||
      !Object.hasOwn(value, key)
    )
      throw bookletConflict("Read section is unavailable.");
    value = (value as Record<string | number, Json>)[key];
  }
  function cursor(path: (string | number)[], offset = 0) {
    const encoded = Buffer.from(
      JSON.stringify({ scope, path, offset }),
    ).toString("base64url");
    if (encoded.length > 16384 || path.length > 32)
      throw bookletConflict("Read section exceeds cursor capacity.");
    return encoded;
  }
  const base = {
    kind: request.kind,
    id: request.id,
    documentHash,
    path: position.path,
  };
  const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");
  let response: unknown;
  if (position.offset === 0 && size(value) <= bodyBytes) {
    response = { ...base, type: "value", value, complete: true, cursor: null };
  } else if (typeof value === "string") {
    const points = [...value];
    if (position.offset >= points.length)
      throw bookletConflict("Read offset is unavailable.");
    let end = position.offset;
    let bytes = 2; // JSON quotes; escaped characters count toward the byte bound.
    const fragment: string[] = [];
    while (end < points.length) {
      const nextBytes = size(points[end]) - 2;
      if (bytes + nextBytes > bodyBytes) break;
      bytes += nextBytes;
      fragment.push(points[end++]);
    }
    const text = fragment.join("");
    response = {
      ...base,
      type: "text",
      text,
      offset: position.offset,
      end,
      total: points.length,
      complete: position.offset === 0 && end === points.length,
      cursor: end < points.length ? cursor(position.path, end) : null,
    };
  } else if (value !== null && typeof value === "object") {
    const keys = Array.isArray(value)
      ? value.map((_, index) => index)
      : Object.keys(value).sort();
    if (position.offset >= keys.length)
      throw bookletConflict("Read offset is unavailable.");
    const sections: {
      key: string | number;
      complete: boolean;
      value?: Json;
      cursor?: string;
    }[] = [];
    let end = position.offset;
    while (end < keys.length && sections.length < 8) {
      const key = keys[end];
      const child = (value as Record<string | number, Json>)[key];
      const section =
        size(child) <= bodyBytes
          ? { key, complete: true, value: child }
          : { key, complete: false, cursor: cursor([...position.path, key]) };
      if (size([...sections, section]) > 12 * 1024) break;
      sections.push(section);
      end++;
    }
    if (!sections.length)
      throw bookletConflict("Read section exceeds response capacity.");
    response = {
      ...base,
      type: Array.isArray(value) ? "array" : "object",
      sections,
      offset: position.offset,
      end,
      total: keys.length,
      complete:
        position.offset === 0 &&
        end === keys.length &&
        sections.every((section) => section.complete),
      cursor: end < keys.length ? cursor(position.path, end) : null,
    };
  } else throw bookletConflict("Read offset is unavailable.");
  if (size(response) > replyBytes)
    throw bookletConflict("Read section exceeds response capacity.");
  return z.json().parse(response);
}
