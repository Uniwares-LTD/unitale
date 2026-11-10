import "server-only";
import { z } from "zod";
import type { Db } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import { bookletRepositoryV2 } from "./repository-v2";
import { assessmentDocumentV2Schema } from "./documents-v2";
import { bookletConflict, bookletMissing } from "./context";
import { id } from "./documents";

export const bookletReadV2Schema = z.strictObject({
  kind: z.enum(["revision", "work", "assessment"]),
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
  let document: unknown;
  if (request.kind === "revision") {
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
    };
  } else if (request.kind === "work") {
    const row = await repo.getWork(productionId, request.id);
    document = {
      callId: row.callId,
      runId: row.runId,
      service: row.service,
      operation: row.operation,
      requestHash: row.requestHash,
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
