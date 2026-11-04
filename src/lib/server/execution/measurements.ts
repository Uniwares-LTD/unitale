import "server-only";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import type { Db, ClientSession } from "mongodb";
import {
  executionMeasurementSchema,
  expenditureCoverage,
  type ExecutionMeasurement,
} from "../../contracts/execution-measurements";
import { AppError } from "../../auth-policy";
import { canonical, fingerprint } from "../foundation/canonical";

import { readSettings } from "../settings";

const ownerSchema = z.string().min(1).max(128);
const identitySchema = z.string().min(1).max(256);
type Measurement = {
  _id: string;
  uid: string;
  hash: string;
  value: ExecutionMeasurement;
};
type Evidence = {
  _id: string;
  uid: string;
  runId: string;
  operationId: string;
  kind: ExecutionMeasurement["evidence"][number]["kind"];
  sha256: string;
  bytes: number;
  parts: number;
  holds: string[];
  expiresAt: Date;
  createdAt: Date;
};
type Operation = {
  _id: string;
  uid: string;
  runId: string;
  operationId: string;
  state: "active" | "unresolved" | "closed";
  fence: number;
};
async function touchOperation(
  db: Db,
  session: ClientSession,
  uid: string,
  runId: string,
  operationId: string,
  unresolved = false,
) {
  const records = db.collection<Operation>("executionOperations");
  const key = evidenceKey(uid, operationId);
  const old = await records.findOne({ _id: key }, { session });
  if (old && (old.runId !== runId || old.state === "closed")) throw conflict();
  if (!old)
    await records.insertOne(
      {
        _id: key,
        uid,
        runId,
        operationId,
        state: unresolved ? "unresolved" : "active",
        fence: 1,
      },
      { session },
    );
  else
    await records.updateOne(
      { _id: key },
      {
        $inc: { fence: 1 },
        ...(unresolved ? { $set: { state: "unresolved" as const } } : {}),
      },
      { session },
    );
}
type Chunk = { _id: string; evidenceId: string; data: string };
const evidenceKey = (uid: string, id: string) => fingerprint([uid, id]);
const conflict = () =>
  new AppError(
    "EXECUTION_IDEMPOTENCY_CONFLICT",
    "The identity already has different evidence.",
    409,
  );
export function redactEvidence(
  value: unknown,
  secrets: readonly string[] = [],
): unknown {
  if (typeof value === "string") {
    let text = value
      .replace(/(Bearer|Basic)\s+[A-Za-z0-9+/=_.-]+/gi, "[REDACTED]")
      .replace(
        /([?&](?:token|key|signature|sig|X-Amz-[^=]+)=)[^&\s]+/gi,
        "$1[REDACTED]",
      );
    for (const secret of secrets)
      if (secret) text = text.split(secret).join("[REDACTED]");
    return text;
  }
  if (Array.isArray(value)) return value.map((v) => redactEvidence(v, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /authorization|cookie|credential|password|secret|api.?key|runContext|unibase_context|token|private.?context/i.test(
          k,
        )
          ? "[REDACTED]"
          : redactEvidence(v, secrets),
      ]),
    );
  return value;
}
export async function retainEvidence(
  db: Db,
  uid: string,
  input: {
    id: string;
    runId: string;
    operationId: string;
    kind: Evidence["kind"];
    payload: unknown;
    secrets?: readonly string[];
    retentionDays?: number;
  },
) {
  ownerSchema.parse(uid);
  identitySchema.parse(input.id);
  identitySchema.parse(input.runId);
  identitySchema.parse(input.operationId);
  const kind = z
    .enum(["prompt", "input", "output", "trace", "provider-receipt"])
    .parse(input.kind);
  const days = z
    .number()
    .int()
    .min(1)
    .max(3650)
    .parse(
      input.retentionDays ??
        (await readSettings(db)).settings.execution.rawLogRetentionDays,
    );
  const data = Buffer.from(
    canonical(redactEvidence(z.json().parse(input.payload), input.secrets)),
  );
  if (data.length > 1024 * 1024)
    throw new AppError(
      "EVIDENCE_TOO_LARGE",
      "Split evidence into bounded records.",
      413,
    );
  const sha256 = createHash("sha256").update(data).digest("hex");
  const id = evidenceKey(uid, input.id);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const rows = db.collection<Evidence>("executionEvidence");
      const old = await rows.findOne({ _id: id }, { session });
      if (old) {
        if (
          old.sha256 !== sha256 ||
          old.runId !== input.runId ||
          old.operationId !== input.operationId ||
          old.kind !== kind
        )
          throw conflict();
        return;
      }
      await touchOperation(db, session, uid, input.runId, input.operationId);
      const encoded = data.toString("base64");
      const parts = Math.ceil(encoded.length / 65536);
      for (let part = 0; part < parts; part++)
        await db.collection<Chunk>("executionEvidenceChunks").insertOne(
          {
            _id: id + ":" + part,
            evidenceId: id,
            data: encoded.slice(part * 65536, (part + 1) * 65536),
          },
          { session },
        );
      await rows.insertOne(
        {
          _id: id,
          uid,
          runId: input.runId,
          operationId: input.operationId,
          kind,
          sha256,
          bytes: data.length,
          parts,
          holds: [input.operationId],
          expiresAt: new Date(Date.now() + days * 86400000),
          createdAt: new Date(),
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return { id: input.id, sha256, bytes: data.length, kind };
}
export async function readEvidence(db: Db, uid: string, id: string) {
  ownerSchema.parse(uid);
  identitySchema.parse(id);
  const row = await db
    .collection<Evidence>("executionEvidence")
    .findOne({ _id: evidenceKey(uid, id), uid });
  if (!row)
    throw new AppError("EVIDENCE_NOT_FOUND", "Evidence not found.", 404);
  const parts: string[] = [];
  for (let i = 0; i < row.parts; i++) {
    const part = await db
      .collection<Chunk>("executionEvidenceChunks")
      .findOne({ _id: row._id + ":" + i });
    if (!part) throw new Error("Evidence bytes unavailable.");
    parts.push(part.data);
  }
  const data = Buffer.from(parts.join(""), "base64");
  if (
    data.length !== row.bytes ||
    createHash("sha256").update(data).digest("hex") !== row.sha256
  )
    throw new Error("Evidence integrity failed.");
  return JSON.parse(data.toString("utf8")) as unknown;
}
export async function recordMeasurement(db: Db, uid: string, raw: unknown) {
  ownerSchema.parse(uid);
  const value = executionMeasurementSchema.parse(raw);
  if (
    value.evidence.length > 256 ||
    Buffer.byteLength(canonical(value)) > 1024 * 1024
  )
    throw new AppError(
      "MEASUREMENT_TOO_LARGE",
      "Use bounded measurement records.",
      413,
    );
  const id = evidenceKey(uid, value.id),
    hash = fingerprint(value);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const records = db.collection<Measurement>("executionMeasurements");
      const old = await records.findOne({ _id: id }, { session });
      if (old) {
        if (old.hash !== hash) throw conflict();
        return;
      }
      await touchOperation(
        db,
        session,
        uid,
        value.runId,
        value.operationId,
        value.outcome === "unknown",
      );
      for (const ref of value.evidence) {
        const evidence = await db
          .collection<Evidence>("executionEvidence")
          .findOneAndUpdate(
            {
              _id: evidenceKey(uid, ref.id),
              uid,
              runId: value.runId,
              operationId: value.operationId,
              sha256: ref.sha256,
              bytes: ref.bytes,
              kind: ref.kind,
            },
            { $addToSet: { holds: value.operationId } },
            { session, returnDocument: "after" },
          );
        if (!evidence)
          throw new AppError(
            "EVIDENCE_MISMATCH",
            "Measurement evidence is unavailable or belongs to other work.",
            409,
          );
      }
      await records.insertOne({ _id: id, uid, hash, value }, { session });
    });
  } finally {
    await session.endSession();
  }
  return value;
}
export async function measurementsForOperation(
  db: Db,
  uid: string,
  operationId: string,
) {
  ownerSchema.parse(uid);
  identitySchema.parse(operationId);
  const rows = await db
    .collection<Measurement>("executionMeasurements")
    .find({ uid, "value.operationId": operationId })
    .limit(1001)
    .toArray();
  if (rows.length > 1000)
    throw new AppError(
      "MEASUREMENT_LIMIT",
      "Read measurements using a narrower operation.",
      413,
    );
  const values = rows.map((row) => executionMeasurementSchema.parse(row.value));
  return { measurements: values, coverage: expenditureCoverage(values) };
}
// Trusted worker call only, after durable operation completion/reconciliation.
// Unknown measurements keep their evidence unless explicitly reconciled.
export async function releaseOperationEvidence(
  db: Db,
  uid: string,
  operationId: string,
  reconciliation?: { evidenceId: string; reason: string },
) {
  ownerSchema.parse(uid);
  identitySchema.parse(operationId);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const operations = db.collection<Operation>("executionOperations");
      const operation = await operations.findOne(
        { _id: evidenceKey(uid, operationId) },
        { session },
      );
      if (!operation || operation.state === "closed") return;
      const active = await db.collection("aiJobs").findOne(
        {
          uid,
          "run.logicalId": operation.runId,
          status: { $nin: ["succeeded", "failed", "cancelled"] },
        },
        { session },
      );
      if (active)
        throw new AppError(
          "EVIDENCE_ACTIVE",
          "Active Runs retain their evidence.",
          409,
        );
      const unknown = await db
        .collection<Measurement>("executionMeasurements")
        .findOne(
          { uid, "value.operationId": operationId, "value.outcome": "unknown" },
          { session },
        );
      if (reconciliation) {
        const resolution = z
          .strictObject({
            evidenceId: identitySchema,
            reason: z.string().trim().min(1).max(1000),
          })
          .parse(reconciliation);
        const receipt = await db
          .collection<Evidence>("executionEvidence")
          .findOne(
            {
              _id: evidenceKey(uid, resolution.evidenceId),
              uid,
              operationId,
              runId: operation.runId,
              kind: "provider-receipt",
            },
            { session },
          );
        if (!receipt)
          throw new AppError(
            "RECONCILIATION_EVIDENCE_REQUIRED",
            "Retain the verified reconciliation receipt first.",
            409,
          );
      }
      if (unknown && !reconciliation)
        throw new AppError(
          "EVIDENCE_UNRESOLVED",
          "Reconcile unknown execution before releasing evidence.",
          409,
        );
      await operations.updateOne(
        { _id: operation._id },
        { $set: { state: "closed" }, $inc: { fence: 1 } },
        { session },
      );
      await db
        .collection<{
          _id: string;
          event: string;
          uid: string;
          operationId: string;
          reconciliation: { evidenceId: string; reason: string } | null;
          timestamp: Date;
        }>("auditEvents")
        .insertOne(
          {
            _id: randomUUID(),
            event: "execution-evidence-release",
            uid,
            operationId,
            reconciliation: reconciliation ?? null,
            timestamp: new Date(),
          },
          { session },
        );
      await db
        .collection<Evidence>("executionEvidence")
        .updateMany(
          { uid, operationId },
          { $pull: { holds: operationId } },
          { session },
        );
    });
  } finally {
    await session.endSession();
  }
}
export async function cleanupEvidence(db: Db, now = new Date()) {
  let removed = 0;
  const candidates = await db
    .collection<Evidence>("executionEvidence")
    .find({ expiresAt: { $lte: now }, holds: { $size: 0 } })
    .limit(100)
    .toArray();
  for (const row of candidates) {
    const session = db.client.startSession();
    try {
      const count = await session.withTransaction(async () => {
        const deleted = await db
          .collection<Evidence>("executionEvidence")
          .deleteOne(
            { _id: row._id, expiresAt: { $lte: now }, holds: { $size: 0 } },
            { session },
          );
        if (deleted.deletedCount) {
          await db
            .collection<Chunk>("executionEvidenceChunks")
            .deleteMany({ evidenceId: row._id }, { session });
          return 1;
        }
        return 0;
      });
      removed += count;
    } finally {
      await session.endSession();
    }
  }
  return removed;
}
export async function createMeasurementIndexes(db: Db) {
  await db
    .collection("executionMeasurements")
    .createIndex({ uid: 1, "value.operationId": 1 });
  await db.collection("executionEvidence").createIndex({ expiresAt: 1 });
  await db.collection("executionEvidenceChunks").createIndex({ evidenceId: 1 });
}
