import "server-only";
import { createHash } from "node:crypto";
import type { Document, Filter } from "mongodb";
import { z } from "zod";
import { AppError } from "../../../auth-policy";
import {
  privateContextInputName,
  publicRunInputs,
} from "../../../contracts/runs";
import type { AiJob } from "../../ai/jobs";
import { jobTarget } from "../../domains";
import type { Reservation } from "../../store/credit-types";
import type { WorkerHeartbeat } from "../../worker-heartbeat";
import { privateToolPermissions } from "../../mcp/private-catalog";
import {
  inspectPrivateContextConfiguration,
  inspectStoredCapability,
  privateContextReasons,
} from "../../runs/capabilities";
import {
  before,
  cursorInput,
  dateInput,
  dateRange,
  define,
  idInput,
  iso,
  PAGE_SIZE,
  paged,
  uidInput,
  type DiagnosticContext,
} from "../context";
import { bounded, clean } from "../shape";

const jobs = (context: DiagnosticContext) =>
  context.db.collection<AiJob>("aiJobs");
const missing = () =>
  new AppError("DIAGNOSTIC_NOT_FOUND", "No matching record.", 404);
const statuses = [
  "queued",
  "dispatching",
  "running",
  "paused",
  "unknown",
  "needs-review",
  "settlement-blocked",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/** Event metadata only; drop answers and any other free-form payload. */
function transition(event: unknown) {
  if (!event || typeof event !== "object") return null;
  const value = event as Record<string, unknown>;
  const pick = (key: string) =>
    typeof value[key] === "string" || typeof value[key] === "number"
      ? { [key]: value[key] }
      : {};
  return {
    ...pick("type"),
    ...pick("id"),
    ...pick("nodeId"),
    ...pick("title"),
    ...pick("status"),
    ...pick("action"),
    ...pick("elapsedMs"),
  };
}
/** Metadata summary of one attempt; inputs and outputs are content. */
function attemptSummary(job: AiJob) {
  const target = job.run ? jobTarget(job) : undefined;
  return {
    attemptId: job._id,
    logicalId: job.run?.logicalId ?? null,
    attempt: job.run?.attempt ?? null,
    predecessorId: job.run?.predecessorId ?? null,
    successorId: job.runSuccessorId ?? null,
    accountUid: job.uid,
    orchestrator: job.run
      ? {
          id: job.run.orchestrator.id,
          configurationRevision: job.run.configurationRevision,
          settingsRevision: job.run.settingsRevision,
          contextInput: !!privateContextInputName(job.run.orchestrator),
          privateTools: job.run.orchestrator.privateTools ?? [],
        }
      : null,
    capability: job.capability,
    target: target
      ? {
          adapter: target.adapter,
          version: target.version,
          kind: target.kind,
          id: target.id,
        }
      : null,
    binding: {
      name: job.binding.name,
      revision: job.binding.revision,
      kind: job.binding.kind,
      mode: job.binding.mode,
    },
    responder: job.responder
      ? {
          parentId: job.responder.parentId,
          decisionId: job.responder.decisionId,
        }
      : null,
    status: job.status,
    failure: job.failure,
    failureDetail: job.failureDetail
      ? { reason: job.failureDetail.reason, at: iso(job.failureDetail.at) }
      : null,
    terminationEvidence: job.terminationEvidence ?? null,
    operatorResolved: !!job.operatorResolved,
    cancelRequested: job.cancelRequested,
    dispatch: {
      providerRunId: job.runId,
      providerTaskId: job.taskId,
      executionStatus: job.execution?.status ?? null,
      executionFailure: job.execution?.failure ?? null,
      attempts: job.attempts,
      nextAttemptAt: iso(job.nextAttemptAt),
      leased: !!job.lease,
      leaseUntil: iso(job.leaseUntil),
      reviewAfter: iso(job.reviewAfter),
    },
    accounting: {
      credits: job.credits,
      reservationId: job.reservationId,
      charge: job.charge ? clean(job.charge) : null,
      responderCharge: job.responderCharge ?? null,
      parentCharge: job.parentCharge ?? null,
    },
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
    cleanedAt: iso(job.cleanedAt),
  };
}
/** Accept a logical Run ID (latest attempt) or an exact attempt ID. */
async function resolveAttempt(context: DiagnosticContext, id: string) {
  const options = { timeoutMS: context.timeoutMS() };
  const exact = await jobs(context).findOne({ _id: id }, options);
  if (exact) return exact;
  const latest = await jobs(context)
    .find({ "run.logicalId": id }, options)
    .sort({ "run.attempt": -1 })
    .limit(1)
    .next();
  if (!latest) throw missing();
  return latest;
}

const searchInput = z.strictObject({
  accountUid: uidInput.optional(),
  status: z.enum(statuses).optional(),
  failure: z.string().max(80).optional(),
  orchestratorId: z.string().max(64).optional(),
  from: dateInput.optional(),
  to: dateInput.optional(),
  cursor: cursorInput,
});
export const runSearch = define({
  description:
    "Find Run attempts by account, status, failure, orchestrator and date.",
  inputs: {
    accountUid: "optional exact Firebase UID",
    status: `optional, one of ${statuses.join(", ")}`,
    failure: "optional exact failure code, e.g. private-context-unavailable",
    orchestratorId: "optional exact orchestrator ID",
    from: "optional YYYY-MM-DD (inclusive)",
    to: "optional YYYY-MM-DD (inclusive)",
    cursor: "optional nextCursor from the previous page",
  },
  input: searchInput,
  async run(context, input: z.infer<typeof searchInput>) {
    const { cursor, ...criteria } = input;
    const range = dateRange(input.from, input.to);
    if (!range) throw new AppError("INVALID_INPUT", "Invalid date range.");
    const after = context.readCursor(criteria, cursor);
    const query: Filter<AiJob> = {
      ...(input.accountUid ? { uid: input.accountUid } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.failure ? { failure: input.failure } : {}),
      ...(input.orchestratorId
        ? { "run.orchestrator.id": input.orchestratorId }
        : {}),
      ...(Object.keys(range).length ? { createdAt: range } : {}),
      ...before("createdAt", after),
    };
    if (input.accountUid)
      context.target({ resource: "runs", accountUid: input.accountUid });
    const rows = await jobs(context)
      .find(query, { timeoutMS: context.timeoutMS() })
      .sort({ createdAt: -1, _id: -1 })
      .limit(PAGE_SIZE + 1)
      .toArray();
    return paged(
      context,
      criteria,
      rows,
      (row) => ({ value: row.createdAt.toISOString(), id: row._id }),
      (row) => ({
        attemptId: row._id,
        logicalId: row.run?.logicalId ?? null,
        attempt: row.run?.attempt ?? null,
        accountUid: row.uid,
        orchestratorId: row.run?.orchestrator.id ?? null,
        status: row.status,
        failure: row.failure,
        failureReason: row.failureDetail?.reason ?? null,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }),
    );
  },
});

const getInput = z.strictObject({ id: idInput, cursor: cursorInput });
export const runGet = define({
  description:
    "One logical Run: paged attempts, decisions, dispatch/accounting evidence, saved-result application and owned asset metadata.",
  inputs: {
    id: "logical Run ID or attempt ID",
    cursor: "optional nextCursor for further attempts",
  },
  input: getInput,
  async run(context, input: z.infer<typeof getInput>) {
    const anchor = await resolveAttempt(context, input.id);
    const logicalId = anchor.run?.logicalId;
    context.target({
      resource: "run",
      id: logicalId ?? anchor._id,
      accountUid: anchor.uid,
    });
    const criteria = { id: logicalId ?? anchor._id };
    const after = context.readCursor(criteria, input.cursor);
    const options = { timeoutMS: context.timeoutMS() };
    const attempts = logicalId
      ? await jobs(context)
          .find(
            {
              "run.logicalId": logicalId,
              ...(after ? { "run.attempt": { $lt: Number(after.value) } } : {}),
            },
            options,
          )
          .sort({ "run.attempt": -1 })
          .limit(PAGE_SIZE + 1)
          .toArray()
      : [anchor];
    const page = paged(
      context,
      criteria,
      attempts,
      (row) => ({ value: row.run?.attempt ?? 0, id: row._id }),
      (row) => attemptSummary(row as AiJob),
    );
    const ids = attempts.slice(0, PAGE_SIZE).map((row) => row._id);
    const events = await context.db
      .collection<Document & { _id: string }>("runEvents")
      .find({ jobId: { $in: ids } }, { timeoutMS: context.timeoutMS() })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    const decisions = await context.db
      .collection<Document & { _id: string }>("runDecisions")
      .find(
        { jobId: { $in: ids } },
        {
          timeoutMS: context.timeoutMS(),
          projection: {
            jobId: 1,
            nodeId: 1,
            title: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            responderId: 1,
            answerSource: 1,
            confirmedAction: 1,
            automaticError: 1,
            error: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const reservations = await context.db
      .collection<Reservation>("creditReservations")
      .find(
        {
          _id: {
            $in: attempts
              .map((row) => row.reservationId)
              .filter((id): id is string => !!id),
          },
        },
        { timeoutMS: context.timeoutMS() },
      )
      .toArray();
    const [applications, assets, productAssets] = await Promise.all([
      context.db
        .collection<Document & { _id: string }>("resultApplications")
        .find(
          { uid: anchor.uid, jobId: { $in: ids } },
          {
            timeoutMS: context.timeoutMS(),
            projection: {
              jobId: 1,
              status: 1,
              artifactId: 1,
              nextAttemptAt: 1,
              "failure.code": 1,
              "failure.phase": 1,
              "failure.at": 1,
            },
          },
        )
        .limit(PAGE_SIZE + 1)
        .toArray(),
      context.db
        .collection<Document & { _id: string }>("runAssets")
        .find(
          { uid: anchor.uid, jobId: { $in: ids } },
          {
            timeoutMS: context.timeoutMS(),
            projection: { jobId: 1, status: 1, bytes: 1, retained: 1 },
          },
        )
        .limit(PAGE_SIZE * 10 + 1)
        .toArray(),
      context.db
        .collection<Document & { _id: string }>("productAssets")
        .find(
          { uid: anchor.uid, jobId: { $in: ids } },
          {
            timeoutMS: context.timeoutMS(),
            projection: { jobId: 1, state: 1, references: 1 },
          },
        )
        .limit(PAGE_SIZE * 10 + 1)
        .toArray(),
    ]);
    return {
      logicalId: logicalId ?? null,
      accountUid: anchor.uid,
      attempts: page.rows,
      nextCursor: page.nextCursor,
      resultApplications: applications.slice(0, PAGE_SIZE).map((row) => ({
        id: row._id,
        attemptId: row.jobId,
        status: row.status,
        artifactId: row.artifactId ?? null,
        nextAttemptAt: iso(row.nextAttemptAt),
        failure: row.failure
          ? {
              code: row.failure.code,
              phase: row.failure.phase,
              at: iso(row.failure.at),
            }
          : null,
      })),
      assets: assets.slice(0, PAGE_SIZE * 10).map((row) => ({
        id: row._id,
        attemptId: row.jobId,
        status: row.status,
        bytes: row.bytes,
        retained: !!row.retained,
      })),
      productAssets: productAssets.slice(0, PAGE_SIZE * 10).map((row) => ({
        id: row._id,
        attemptId: row.jobId,
        state: row.state,
        references: Array.isArray(row.references)
          ? row.references
              .filter((value): value is string => typeof value === "string")
              .slice(0, 20)
              .map((value) => value.slice(0, 256))
          : [],
        referencesTruncated:
          Array.isArray(row.references) && row.references.length > 20,
      })),
      resultMetadataTruncated:
        applications.length > PAGE_SIZE ||
        assets.length > PAGE_SIZE * 10 ||
        productAssets.length > PAGE_SIZE * 10,
      transitions: events.map((event) => ({
        attemptId: event.jobId,
        timestamp: iso(event.timestamp),
        // Answers in decision-filled events are content (run.content only).
        event: transition(event.event),
      })),
      decisions: decisions.map((decision) => clean(decision)),
      reservations: reservations.map((hold) => ({
        id: hold._id,
        amount: hold.amount,
        status: hold.status,
        committedCredits: hold.committedCredits ?? null,
        managedJobId: hold.managedJobId ?? null,
        createdAt: iso(hold.createdAt),
        expiresAt: iso(hold.expiresAt),
      })),
    };
  },
});

const reasonExplanations: Record<
  (typeof privateContextReasons)[number],
  string
> = {
  "mcp-configuration-invalid": "MCP configuration failed validation.",
  "mcp-disabled": "MCP is disabled, so no Run MCP client is available.",
  "mcp-client-missing":
    "The Run MCP client named by RUN_MCP_CLIENT_ID is not configured.",
  "private-tools-missing":
    "The orchestrator snapshot declares no private tools.",
  "mcp-permissions-missing":
    "The Run MCP client lacks permissions the private tools require.",
  "encryption-key-missing":
    "Neither DIFY_CREDENTIAL_ENCRYPTION_KEY nor DIFY_MANAGEMENT_KEY is configured.",
  "encryption-key-invalid":
    "DIFY_CREDENTIAL_ENCRYPTION_KEY is not 64 hexadecimal characters.",
  "decryption-failed":
    "The saved Run context exists but no longer decrypts; the key or APP_ORIGIN changed since it was created.",
};
const diagnoseInput = z.strictObject({ id: idInput });
export const runDiagnose = define({
  description:
    "Explain the evidence behind an attempt's failure, separating recorded evidence from current checks.",
  inputs: { id: "logical Run ID (latest attempt) or attempt ID" },
  input: diagnoseInput,
  async run(context, input: z.infer<typeof diagnoseInput>) {
    const job = await resolveAttempt(context, input.id);
    context.target({ resource: "run", id: job._id, accountUid: job.uid });
    const summary = attemptSummary(job);
    const operations = job.run?.orchestrator.privateTools ?? [];
    const needsContext = !!(
      job.run && privateContextInputName(job.run.orchestrator)
    );
    const recordedReason = job.failureDetail?.reason ?? null;
    const required = [
      ...new Set(
        operations.map((op) => privateToolPermissions[op] ?? `unknown:${op}`),
      ),
    ];
    let privateContext = null;
    if (needsContext || job.failure === "private-context-unavailable") {
      const web = await inspectPrivateContextConfiguration(operations);
      const stored = await inspectStoredCapability(context.db, job._id, {
        maxTimeMS: context.timeoutMS(),
      });
      const workers = await context.db
        .collection<WorkerHeartbeat>("workerHeartbeats")
        .find({ kind: "ai" }, { timeoutMS: context.timeoutMS() })
        .sort({ updatedAt: -1 })
        .limit(5)
        .toArray();
      privateContext = {
        required: needsContext,
        operations,
        requiredPermissions: required,
        recorded: {
          source: "attempt",
          reason: recordedReason,
          explanation:
            recordedReason && recordedReason in reasonExplanations
              ? reasonExplanations[
                  recordedReason as keyof typeof reasonExplanations
                ]
              : null,
          observedAt: iso(job.failureDetail?.at),
        },
        storedCapability: {
          source: "database",
          observedAt: context.now.toISOString(),
          ...stored,
        },
        current: {
          note: "Current checks describe configuration now; they do not prove the historical cause.",
          web: {
            source: "web",
            observedAt: new Date().toISOString(),
            mcp: web.mcp,
            clientId: web.clientId,
            clientConfigured: web.clientConfigured,
            missingPermissions: web.missingPermissions,
            keySource: web.keySource,
            wouldFailWith: web.reason,
          },
          workers: workers.map((row) => ({
            source: `worker:${row.kind}`,
            instance: row._id,
            release: row.commit,
            heartbeatAt: iso(row.updatedAt),
            observedAt: iso(row.checks?.observedAt),
            privateContext: row.checks?.privateContext
              ? {
                  ...row.checks.privateContext,
                  missingPermissions:
                    row.checks.privateContext.missingPermissions.filter(
                      (permission) => required.includes(permission),
                    ),
                }
              : null,
          })),
        },
      };
    }
    const historical =
      job.failure === "private-context-unavailable"
        ? recordedReason
          ? {
              basis: "recorded" as const,
              cause: recordedReason,
              explanation:
                reasonExplanations[
                  recordedReason as keyof typeof reasonExplanations
                ] ?? null,
            }
          : {
              basis: "unrecorded" as const,
              cause: null,
              explanation:
                "This attempt predates recorded sub-reasons. Only the generic failure is known; compare current checks without treating them as proof.",
            }
        : null;
    return {
      attempt: summary,
      failure: {
        code: job.failure,
        status: job.status,
        terminationEvidence: job.terminationEvidence ?? null,
        historical,
      },
      privateContext,
    };
  },
});

/**
 * The private-context token is stored only as its SHA-256. Replace any
 * token-shaped substring whose hash matches, e.g. a form default that echoed it.
 */
function withoutCapabilityToken(value: unknown, tokenHash: string | null) {
  if (!tokenHash) return value;
  const scrub = (item: unknown): unknown => {
    if (typeof item === "string")
      return item.replace(/[A-Za-z0-9_-]{43}/g, (candidate) =>
        createHash("sha256").update(candidate).digest("hex") === tokenHash
          ? "[private-context]"
          : candidate,
      );
    if (Array.isArray(item)) return item.map(scrub);
    if (item && typeof item === "object" && !(item instanceof Date))
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, scrub(entry)]),
      );
    return item;
  };
  return scrub(value);
}
const contentInput = z.strictObject({ id: idInput, cursor: cursorInput });
export const runContent = define({
  description:
    "Stored public inputs, decisions (prompts, answers) and outputs for one exact attempt, with decisions paged oldest first. Server-injected private context is omitted.",
  inputs: {
    id: "exact attempt ID",
    cursor:
      "optional decisions.nextCursor; later pages return only further decisions",
  },
  input: contentInput,
  async run(context, input: z.infer<typeof contentInput>) {
    const job = await jobs(context).findOne(
      { _id: input.id },
      { timeoutMS: context.timeoutMS() },
    );
    if (!job) throw missing();
    context.target({
      resource: "run-content",
      id: job._id,
      accountUid: job.uid,
    });
    const criteria = { id: job._id };
    const after = context.readCursor(criteria, input.cursor);
    const afterAt = after ? new Date(after.value) : null;
    if (afterAt && Number.isNaN(afterAt.getTime()))
      throw new AppError("INVALID_CURSOR", "The page cursor is invalid.");
    const rows = await context.db
      .collection<Document & { _id: string; createdAt: Date }>("runDecisions")
      .find(
        {
          jobId: job._id,
          ...(afterAt
            ? {
                $or: [
                  { createdAt: { $gt: afterAt } },
                  { createdAt: afterAt, _id: { $gt: after!.id } },
                ],
              }
            : {}),
        },
        {
          timeoutMS: context.timeoutMS(),
          projection: {
            token: 0,
            uid: 0,
            "intent.key": 0,
            "intent.hash": 0,
          },
        },
      )
      .sort({ createdAt: 1, _id: 1 })
      .limit(PAGE_SIZE + 1)
      .toArray();
    const decisions = paged(
      context,
      criteria,
      rows,
      (row) => ({ value: row.createdAt.toISOString(), id: row._id }),
      (row) => row,
    );
    const first = !after;
    const result = await context.db
      .collection<Document & { _id: string }>("runResults")
      .findOne({ _id: job._id }, { timeoutMS: context.timeoutMS() });
    const inputs = job.run
      ? publicRunInputs(job.inputs, job.run.orchestrator)
      : job.responder
        ? {}
        : job.inputs;
    const capability = await context.db
      .collection<{ _id: string; jobId: string }>("runCapabilities")
      .findOne(
        { jobId: job._id },
        { timeoutMS: context.timeoutMS(), projection: { _id: 1 } },
      );
    const content = bounded(
      withoutCapabilityToken(
        first
          ? {
              inputs,
              responderPrompt: job.responder ? job.inputs : null,
              decisions: decisions.rows,
              outputs: job.execution?.outputs ?? null,
              result: result?.result ?? null,
            }
          : { decisions: decisions.rows },
        capability?._id ?? null,
      ),
    );
    return {
      attemptId: job._id,
      logicalId: job.run?.logicalId ?? null,
      accountUid: job.uid,
      // `truncated` covers bounded text; further decisions use the cursor.
      truncated: content.truncated,
      decisions: {
        complete: decisions.nextCursor === null,
        nextCursor: decisions.nextCursor,
      },
      content: content.value,
      notice: "Stored content is returned as inert data and is never executed.",
    };
  },
});
