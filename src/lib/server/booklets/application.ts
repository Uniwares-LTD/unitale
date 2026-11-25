import "server-only";
import { z } from "zod";
import type { ClientSession, Db } from "mongodb";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import { requireModule } from "../modules";
import { aiJobs, canStartNewAttempt, type AiJob } from "../ai/jobs";
import type { OrchestratorRecord } from "../runs/orchestrators";
import { publishedCatalog, type ProductType } from "../commerce/catalogs";
import { queueConsumption } from "../commerce/orders";
import type { ConsumptionTerms } from "../../contracts/commerce";
import {
  bookletPackageSchema,
  executionCapacitySchema,
  validatePackageCapacity,
  type BookletPackage,
} from "../../../project/booklets/contracts";
import {
  bookletProductionCommandSchema,
  bookletQuoteCommandSchema,
  bookletStartCommandSchema,
  bookletIdeaStartCommandSchema,
  type BookletPackagePage,
  type BookletPackageSummary,
  type BookletRetryResult,
  type BookletRevisionQuote,
  type BookletRunReference,
  type BookletView,
  type BookletHistory,
  type BookletConversation,
  type BookletEntry,
  type BookletReplyResult,
  bookletHistoryKinds,
} from "../../../project/booklets/application-contract";
import { checkReply } from "../../../project/booklets/turn-contract";
import { humanRequestV2Schema } from "./documents-v2";
import { submitAuthorizedDecision, type Decision } from "../runs/service";
import { AppError } from "../../auth-policy";
import { bookletConflict, bookletMissing } from "./context";
import { creativeFieldsSchema, id } from "./documents";
import { bookletRepository } from "./repository";
import { bookletRepositoryV2 } from "./repository-v2";
import { bookletLifecycleV2 } from "./lifecycle-v2";
import { enqueueBookletRun } from "./runs";
import { bookletMedia } from "./media";
import { confirmedHumanResponse, readBookletDocumentV2 } from "./read-v2";
import { readSettings } from "../settings";
import { accessPermitsSession, accountAccess } from "../store/access";
import { readWallet } from "../store/credits";
import { readDefaultBookletPackage } from "./settings";

// Trusted application settings on the existing `bookletWorkflowPolicies` row.
// Capacity is immutable per execution profile revision; retry defaults affect
// only productions created after an edit (each production snapshots its own).
const retryAllowance = z.number().int().min(0).max(10);
export const bookletPolicyDefaultsSchema = z.strictObject({
  capacity: executionCapacitySchema,
  retryDefaults: z.strictObject({
    paidLlm: retryAllowance,
    paidImage: retryAllowance,
    nonPaid: retryAllowance,
  }),
});
export type BookletPolicyDefaults = z.infer<typeof bookletPolicyDefaultsSchema>;

type OrderRow = Awaited<ReturnType<typeof queueConsumption>>;
const unavailable = () =>
  new AppError(
    "BOOKLET_UNAVAILABLE",
    "This booklet package is unavailable.",
    409,
  );
const pageLimit = 20;
// Path and query values: malformed input is a 404/400, never a service error.
function pathId(value: string) {
  if (!id.safeParse(value).success) throw bookletMissing();
}
function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AppError(
      "BOOKLET_INVALID",
      "Check the request and try again.",
      400,
    );
  return parsed.data;
}

/** Rebuilds the frozen package exactly as production creation validates it. */
export function bookletPackageFrom(
  rawFields: unknown,
  terms: ConsumptionTerms,
): BookletPackage {
  const fields = creativeFieldsSchema.parse(rawFields);
  return bookletPackageSchema.parse({
    ...fields,
    schemaVersion: 1 as const,
    id: terms.identity.id,
    revision: terms.identity.revision,
    credits: terms.credits,
    allowances: Object.fromEntries(
      terms.allowances.map((a) => [
        a.category,
        { included: a.included, extraCredits: a.extraCredits },
      ]),
    ),
    entitlementDays: terms.entitlementDays,
  });
}

/** Exactly one enabled, validated booklet v2 orchestrator at its current
 * revision must carry a policy row for the profile. Never inferred. */
async function configuration(
  db: Db,
  profileId: string,
  profileRevision: number,
  session?: ClientSession,
) {
  const records = await db
    .collection<OrchestratorRecord>("orchestrators")
    .find(
      {
        validated: true,
        lifecycle: { $ne: "unregistered" },
        "definition.enabled": true,
        "definition.domainAdapter.id": "booklet",
        "definition.domainAdapter.version": "2",
        "definition.responseMode": "raw-v1",
      },
      { session, limit: 10 },
    )
    .toArray();
  const matches = [];
  for (const record of records) {
    // Mirror Run admission so a paid start never meets a predictable refusal:
    // booklet Runs carry no browser inputs and no legacy mapping.
    if (
      (record.definition.legacyInputs?.length ?? 0) ||
      record.definition.inputs.some((field) => field.required)
    )
      continue;
    const row = await db.collection("bookletWorkflowPolicies").findOne(
      {
        profileId,
        profileRevision,
        orchestratorId: record._id,
        configurationRevision: record.revision,
      },
      { session },
    );
    if (row) matches.push({ record, row });
  }
  if (matches.length !== 1) throw unavailable();
  const [{ record, row }] = matches;
  const parsed = bookletPolicyDefaultsSchema.safeParse({
    capacity: row.capacity,
    retryDefaults: row.retryDefaults,
  });
  if (
    !parsed.success ||
    parsed.data.capacity.id !== profileId ||
    parsed.data.capacity.revision !== profileRevision
  )
    throw unavailable();
  return {
    orchestratorId: record._id,
    configurationRevision: record.revision,
    ...parsed.data,
  };
}

function bookletTerms(terms: ConsumptionTerms) {
  return terms.productType === "booklet" && terms.productSchemaVersion === 1;
}

export async function bookletPackageSummary(
  db: Db,
  catalogId: string,
  session?: ClientSession,
): Promise<BookletPackageSummary | null> {
  // A published version is immutable. Read the live head in the same snapshot
  // as the policy when validating an administrator's selection.
  const revision = session
    ? (
        await db
          .collection<{ _id: string; publishedRevision: number | null }>(
            "commerceCatalogs",
          )
          .findOne(
            { _id: catalogId },
            { session, projection: { publishedRevision: 1 } },
          )
      )?.publishedRevision
    : undefined;
  if (session && !revision) return null;
  const publication = await publishedCatalog(
    db,
    catalogId,
    revision ?? undefined,
  );
  if (
    !publication ||
    publication.definition.kind !== "consumption" ||
    !bookletTerms(publication.definition.terms)
  )
    return null;
  const terms = publication.definition.terms;
  let pack: BookletPackage;
  try {
    pack = bookletPackageFrom(publication.definition.fields, terms);
  } catch {
    return null;
  }
  let available = true;
  try {
    const config = await configuration(
      db,
      pack.executionProfileId,
      pack.executionProfileRevision,
      session,
    );
    validatePackageCapacity(pack, config.capacity);
  } catch {
    available = false;
  }
  return {
    catalogId,
    revision: publication.revision,
    quoteHash: publication.hash,
    credits: terms.credits,
    entitlementDays: terms.entitlementDays,
    storyPages: pack.storyPages,
    includeCover: pack.includeCover,
    maxCharacters: pack.maxCharacters,
    maxLocations: pack.maxLocations,
    maxPanelsPerPage: pack.maxPanelsPerPage,
    styleSamples: pack.styleSamples,
    languages: pack.languages.map((l) => ({ ...l })),
    allowances: terms.allowances.map((a) => ({
      category: a.category,
      unit: a.unit,
      included: a.included,
      extraCredits: a.extraCredits,
    })),
    available,
  };
}

/**
 * Private booklet application facade for routes and Server Components. The actor
 * comes only from a verified session. Each command rechecks module, account and
 * ownership through the delivered services; stable keys make every committed
 * effect resumable, and changed payloads under the same key conflict.
 */
export function bookletApplication(
  db: Db,
  actor: CreditActor,
  options: { types: readonly ProductType[] },
) {
  const base = bookletRepository(db, actor);
  const repo = bookletRepositoryV2(db, actor);
  const lifecycle = bookletLifecycleV2(db, actor);
  const types = options.types;

  function validateBrief(
    pack: BookletPackage,
    brief: z.infer<typeof bookletStartCommandSchema>["brief"],
  ) {
    if (
      !pack.languages.some(
        (l) =>
          l.tag === brief.language.tag &&
          l.direction === brief.language.direction,
      ) ||
      brief.characters.length > pack.maxCharacters ||
      brief.locations.length > pack.maxLocations
    )
      throw new AppError(
        "BOOKLET_INVALID",
        "The brief exceeds the selected package.",
        400,
      );
  }

  // One Run per committed consumption flow. Keys derive from the flow (not the
  // browser key), so a saved-but-unstarted step can be resumed after a reload.
  const flowKey = (flowId: string) => "booklet-flow:" + flowId;
  const startFlow = (orderId: string) =>
    fingerprint([orderId, "booklet-initial"]);
  const pending = (message: string) =>
    new AppError("BOOKLET_START_PENDING", message, 409);

  async function existingRun(
    runKey: string,
    productionId: string,
  ): Promise<BookletRunReference | null> {
    const job = await aiJobs(db).findOne({
      _id: fingerprint([actor.uid, runKey]),
      uid: actor.uid,
    });
    if (!job) return null;
    if (
      job.run?.target?.adapter !== "booklet" ||
      job.run.target.id !== productionId
    )
      throw bookletConflict("Run request key was reused with changed inputs.");
    return { productionId, runId: job.run.logicalId };
  }

  async function latestRun(productionId: string) {
    return aiJobs(db).findOne(
      {
        uid: actor.uid,
        "run.target.adapter": "booklet",
        "run.target.version": "2",
        "run.target.id": productionId,
      },
      { sort: { createdAt: -1, _id: -1 } },
    );
  }

  async function enqueue(
    productionId: string,
    runKey: string,
    workflowId: string,
    predecessorId: string | null,
  ): Promise<BookletRunReference> {
    try {
      const p = await repo.getProduction(productionId);
      const config = await configuration(
        db,
        p.creativeConfigSnapshot.executionProfileId,
        p.creativeConfigSnapshot.executionProfileRevision,
      );
      const run = await enqueueBookletRun(db, actor, productionId, {
        key: runKey,
        workflowId,
        orchestratorId: config.orchestratorId,
        configurationRevision: config.configurationRevision,
        inputs: {},
        predecessorId,
      });
      return { productionId, runId: run.id };
    } catch (error) {
      // The flow (and any charge) is committed: only a same-key retry may
      // resume it. A new key would be refused while this flow stays active.
      if (error instanceof AppError && error.status < 500)
        throw pending(
          "This step is saved, but it couldn’t start yet. Try again.",
        );
      throw error;
    }
  }

  /** The order's committed flow with no Run yet, if any. */
  async function unboundFlow(orderId: string) {
    const order = await db
      .collection<{ _id: string; activeWorkflow: string | null }>(
        "consumptionOrders",
      )
      .findOne(
        { _id: orderId, "value.ownerId": actor.uid },
        { projection: { activeWorkflow: 1 } },
      );
    const flowId = order?.activeWorkflow;
    if (!flowId) return null;
    const flow = await db
      .collection<{ _id: string; jobId: string | null }>("consumptionWorkflows")
      .findOne({ _id: flowId, uid: actor.uid }, { projection: { jobId: 1 } });
    if (!flow || flow.jobId) return null;
    return (await runForFlow(flowId)) ? null : flowId;
  }

  /** Any Run already admitted for this flow, whatever key created it. */
  function runForFlow(flowId: string) {
    return aiJobs(db).findOne(
      { uid: actor.uid, "consumption.workflowId": flowId },
      { projection: { run: 1 } },
    );
  }

  /** Predecessor chaining for an eligible failed/cancelled attempt; a fresh
   * logical Run after verified success. Active or uncertain work keeps control. */
  function successorOf(latest: AiJob | null) {
    if (!latest) throw bookletConflict("Start this booklet before continuing.");
    if (latest.status === "succeeded") return null;
    if (canStartNewAttempt(latest)) return latest._id;
    throw bookletConflict(
      "The current step is still running or its outcome is being confirmed.",
    );
  }

  /** Advisory eligibility for the UI. Commands remain authoritative. */
  async function availableActions(
    p: Awaited<ReturnType<typeof repo.getProduction>>,
  ): Promise<BookletView["actions"]> {
    const latest = await latestRun(p._id);
    const terminal =
      latest !== null &&
      (latest.status === "succeeded" || canStartNewAttempt(latest));
    const running = latest !== null && !terminal;
    // A committed step without a Run is resumed, never replaced.
    const resume = (await unboundFlow(p.orderId)) !== null;
    const live =
      p.lifecycleState === "in-progress" &&
      !(p.expiresAt && p.expiresAt <= new Date());
    let retry: BookletView["actions"]["retry"] = null;
    if (live) {
      const failed = await db
        .collection<{
          callId: string;
          actionKey: string;
          category: "paidLlm" | "paidImage" | "nonPaid";
          retryOrdinal: number;
        }>("bookletWork")
        .find(
          {
            ownerId: actor.uid,
            productionId: p._id,
            status: "failed",
            retryable: true,
            retryAuthorization: { $exists: false },
          },
          {
            projection: {
              callId: 1,
              actionKey: 1,
              category: 1,
              retryOrdinal: 1,
            },
            sort: { updatedAt: -1 },
            limit: 5,
          },
        )
        .toArray();
      for (const row of failed) {
        const newest = await db
          .collection<{ callId: string }>("bookletWork")
          .findOne(
            {
              ownerId: actor.uid,
              productionId: p._id,
              actionKey: row.actionKey,
            },
            { sort: { retryOrdinal: -1 }, projection: { callId: 1 } },
          );
        if (
          newest?.callId === row.callId &&
          row.retryOrdinal >= p.retryPolicy[row.category]
        ) {
          retry = { callId: row.callId };
          break;
        }
      }
    }
    const revisions: BookletView["actions"]["revisions"] = [];
    if (
      !running &&
      !resume &&
      (p.lifecycleState === "in-progress" ||
        p.lifecycleState === "completed") &&
      !(p.expiresAt && p.expiresAt <= new Date())
    ) {
      const order = await db
        .collection<{
          _id: string;
          value: { state: string; terms: ConsumptionTerms };
          locks: string[];
        }>("consumptionOrders")
        .findOne({ _id: p.orderId, "value.ownerId": actor.uid });
      const kinds = {
        story: [],
        style: ["style-sample"],
        reference: ["character", "location"],
        page: ["page"],
      } as const;
      for (const allowance of order?.value.state === "started"
        ? order.value.terms.allowances
        : []) {
        const category = allowance.category as keyof typeof kinds;
        if (!(category in kinds) || order!.locks.includes(category)) continue;
        const lock = category === "reference" ? "references" : category;
        if (lock !== "page" && p.stageLocks[lock]) continue;
        const subjects = p.subjects
          .filter((s) =>
            (kinds[category] as readonly string[]).includes(s.kind),
          )
          .map((s) => ({ id: s.id, label: s.label, pageRole: s.pageRole }));
        if (allowance.unit === "subject" && !subjects.length) continue;
        revisions.push({
          category,
          unit: allowance.unit,
          allSubjectsRequired: category === "style",
          subjects: allowance.unit === "subject" ? subjects : [],
        });
      }
    }
    return {
      running,
      resume,
      continue: live && terminal && !resume,
      retry,
      revisions,
    };
  }

  async function continueWith(
    productionId: string,
    key: string,
  ): Promise<BookletRunReference> {
    const p = await repo.getProduction(productionId);
    const runKey = flowKey(fingerprint([p.orderId, "continue", key]));
    const prior = await existingRun(runKey, productionId);
    if (prior) return prior;
    const predecessorId = successorOf(await latestRun(productionId));
    const workflowId = await lifecycle.continue(productionId, key);
    return enqueue(productionId, runKey, workflowId, predecessorId);
  }

  /** Enqueues the order's committed flow that has no Run (start, continuation
   * or revision). Idempotent by flow; needs no browser key. */
  async function resumeFlow(
    productionId: string,
  ): Promise<BookletRunReference> {
    const p = await repo.getProduction(productionId);
    const order = await db
      .collection<{ activeWorkflow: string | null }>("consumptionOrders")
      .findOne(
        { _id: p.orderId as never, "value.ownerId": actor.uid },
        { projection: { activeWorkflow: 1 } },
      );
    const flowId = order?.activeWorkflow;
    if (!flowId) throw bookletConflict("There is no saved step to resume.");
    const prior = await runForFlow(flowId);
    if (prior?.run) {
      if (prior.run.target?.id !== productionId) throw bookletMissing();
      return { productionId, runId: prior.run.logicalId };
    }
    if (!(await unboundFlow(p.orderId)))
      throw bookletConflict(
        "The current step is still running or its outcome is being confirmed.",
      );
    const revision = await db
      .collection("consumptionCharges")
      .findOne({ _id: flowId as never, uid: actor.uid, kind: "revision" });
    const predecessorId =
      flowId === startFlow(p.orderId) || revision
        ? null
        : successorOf(await latestRun(productionId));
    return enqueue(productionId, flowKey(flowId), flowId, predecessorId);
  }

  function revisionRequest(
    command: Extract<
      z.infer<typeof bookletProductionCommandSchema>,
      { action: "quote-revision" | "start-revision" }
    >,
  ) {
    // Scope only. Creative instructions are collected by Manager through
    // authentic Run decisions, so only the scope is bound by the quote.
    return {
      requestId: command.requestId,
      expectedVersion: command.expectedVersion,
      category: command.category,
      subjects: command.subjects,
      inputHash: fingerprint({
        category: command.category,
        subjects: [...command.subjects].sort(),
      }),
    };
  }

  function encodeCursor(scope: string, after: string) {
    return Buffer.from(JSON.stringify({ scope, after })).toString("base64url");
  }
  function decodeCursor(raw: string | null | undefined, scope: string) {
    if (!raw) return undefined;
    try {
      return z
        .strictObject({ scope: z.literal(scope), after: z.string().max(160) })
        .parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")))
        .after;
    } catch {
      throw new AppError("BOOKLET_INVALID", "Invalid pagination cursor.", 400);
    }
  }

  return {
    /** Domain picker rows: owned live books with a current production. */
    async picker(
      raw: { search?: string | null; cursor?: string | null } = {},
    ): Promise<{ rows: { id: string; title: string }[]; next: string | null }> {
      requireModule("booklets");
      if (
        !accessPermitsSession(
          await accountAccess(db, actor.uid),
          actor.authTime,
        )
      )
        throw new AppError("FORBIDDEN", "Account access is unavailable.", 403);
      const search = input(z.string().trim().max(80), raw.search ?? "");
      const scope = fingerprint([actor.uid, "booklet-picker", search]);
      const after = decodeCursor(raw.cursor, scope);
      const books = await db
        .collection<{
          _id: string;
          title: string;
          currentProductionId: string | null;
        }>("bookletBooks")
        .find(
          {
            ownerId: actor.uid,
            "deletion.deletedAt": null,
            currentProductionId: { $ne: null },
            ...(search
              ? {
                  title: {
                    $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                    $options: "i",
                  },
                }
              : {}),
            ...(after ? { _id: { $gt: after } } : {}),
          },
          {
            projection: { title: 1, currentProductionId: 1 },
            sort: { _id: 1 },
            limit: pageLimit + 1,
          },
        )
        .toArray();
      const page = books.slice(0, pageLimit);
      // Never-started (unpaid) drafts are not booklets the user can open yet.
      const started = new Set(
        (
          await db
            .collection<{ _id: string }>("bookletProductions")
            .find(
              {
                _id: { $in: page.map((b) => b.currentProductionId!) },
                ownerId: actor.uid,
                lifecycleState: { $ne: "draft" },
              },
              { projection: { _id: 1 } },
            )
            .toArray()
        ).map((p) => p._id),
      );
      return {
        rows: page
          .filter((b) => started.has(b.currentProductionId!))
          .map((b) => ({ id: b.currentProductionId!, title: b.title })),
        next:
          books.length > pageLimit
            ? encodeCursor(scope, page.at(-1)!._id)
            : null,
      };
    },

    async packages(
      raw: { cursor?: string | null } = {},
    ): Promise<BookletPackagePage> {
      requireModule("booklets");
      const scope = fingerprint([actor.uid, "booklet-packages"]);
      const after = decodeCursor(raw.cursor, scope);
      const heads = await db
        .collection<{ _id: string; publishedRevision: number | null }>(
          "commerceCatalogs",
        )
        .find(
          {
            _id: after
              ? { $regex: /^consumption:/, $gt: after }
              : { $regex: /^consumption:/ },
            publishedRevision: { $ne: null },
          },
          { projection: { _id: 1 }, sort: { _id: 1 }, limit: pageLimit + 1 },
        )
        .toArray();
      const page = heads.slice(0, pageLimit);
      const rows = [];
      for (const head of page) {
        const item = await bookletPackageSummary(db, head._id);
        if (item) rows.push(item);
      }
      return {
        rows,
        next:
          heads.length > pageLimit
            ? encodeCursor(scope, page.at(-1)!._id)
            : null,
      };
    },

    async quote(raw: unknown): Promise<BookletPackageSummary> {
      requireModule("booklets");
      const command = bookletQuoteCommandSchema.parse(raw);
      const item = await bookletPackageSummary(db, command.catalogId);
      if (!item?.available) throw unavailable();
      return item;
    },

    /** Conversation entry: the admin-selected default package (null when
     * unset or unavailable) and the owner's currently available credits. */
    async entry(): Promise<BookletEntry> {
      requireModule("booklets");
      const catalogId = await readDefaultBookletPackage(db);
      const item = catalogId
        ? await bookletPackageSummary(db, catalogId)
        : null;
      return {
        package: item?.available ? item : null,
        availableCredits: (await readWallet(db, actor.uid, { actor }))
          .available,
      };
    },

    /** Conversational start: the idea alone, with the same explicit consent.
     * Title and brief are derived here; the Manager asks for the rest. */
    async startIdea(raw: unknown): Promise<BookletRunReference> {
      requireModule("booklets");
      const input = bookletIdeaStartCommandSchema.parse(raw);
      const prior = await db.collection<OrderRow>("consumptionOrders").findOne({
        "value.ownerId": actor.uid,
        "value.idempotencyKey": input.key,
      });
      // A saved order can resume with its frozen package even if the default
      // or the published version changes after consent.
      if (!prior && (await readDefaultBookletPackage(db)) !== input.catalogId)
        throw bookletConflict(
          "The default package changed. Review the quote again.",
        );
      if (prior && !bookletTerms(prior.value.terms))
        throw bookletConflict("Changed order retry.");
      const published = prior
        ? null
        : await bookletPackageSummary(db, input.catalogId);
      const languages = prior
        ? bookletPackageFrom(prior.fields, prior.value.terms).languages
        : published?.available
          ? published.languages
          : null;
      if (!languages) throw unavailable();
      const language =
        languages.find((l) => l.tag === input.language) ?? languages[0];
      const first = input.idea.split(/\r?\n/)[0].trim();
      return this.start({
        action: "start",
        key: input.key,
        catalogId: input.catalogId,
        revision: input.revision,
        quoteHash: input.quoteHash,
        acceptedCredits: input.acceptedCredits,
        title: first.length > 80 ? first.slice(0, 79).trimEnd() + "…" : first,
        brief: {
          idea: input.idea,
          audience: audienceNotStated,
          language,
          characters: [],
          locations: [],
          visualPreferences: "",
        },
      });
    },

    /** Resumable: book → queued order → v2 production → paid start → Run. */
    async start(raw: unknown): Promise<BookletRunReference> {
      requireModule("booklets");
      const input = bookletStartCommandSchema.parse(raw);
      const bookletId = fingerprint([
        actor.uid,
        "booklet-start-book",
        input.key,
      ]);
      const productionId = fingerprint([
        actor.uid,
        "booklet-start-production",
        input.key,
      ]);
      // First attempt only: reject a stale/changed quote or an oversized brief
      // before creating the owned book, so refusals leave no empty booklet.
      // Resumes skip this; the queued order already froze the accepted terms.
      if (
        !(await db
          .collection("consumptionOrders")
          .findOne(
            { "value.ownerId": actor.uid, "value.idempotencyKey": input.key },
            { projection: { _id: 1 } },
          ))
      ) {
        const item = await bookletPackageSummary(db, input.catalogId);
        if (!item?.available) throw unavailable();
        if (
          item.revision !== input.revision ||
          item.quoteHash !== input.quoteHash
        )
          throw bookletConflict("The package changed. Review the quote again.");
        if (item.credits !== input.acceptedCredits)
          throw bookletConflict("The price changed. Review the quote again.");
        const publication = await publishedCatalog(db, input.catalogId);
        if (publication?.definition.kind !== "consumption") throw unavailable();
        validateBrief(
          bookletPackageFrom(
            publication.definition.fields,
            publication.definition.terms,
          ),
          input.brief,
        );
        // Refuse before anything is created: a refusal after the draft exists
        // keeps the request (pending), but a closed page would orphan it.
        if (!(await readSettings(db)).settings.runs.enabled)
          throw bookletConflict("Runs are disabled. Try again later.");
        // The paid start rechecks atomically; this only avoids an unpaid draft.
        if (
          (await readWallet(db, actor.uid, { actor })).available <
          input.acceptedCredits
        )
          throw new AppError(
            "INSUFFICIENT_CREDITS",
            "There are not enough available credits.",
            409,
          );
      }
      await base.createBook({
        id: bookletId,
        title: input.title,
        key: input.key,
      });
      const order: OrderRow = await queueConsumption(
        db,
        actor,
        {
          key: input.key,
          targetId: productionId,
          catalogId: input.catalogId,
          revision: input.revision,
          quoteHash: input.quoteHash,
          inputHash: fingerprint({
            title: input.title,
            brief: input.brief,
            acceptedCredits: input.acceptedCredits,
          }),
        },
        types,
        async (session, row) => {
          if (!bookletTerms(row.value.terms)) throw unavailable();
          if (row.value.terms.credits !== input.acceptedCredits)
            throw bookletConflict("The price changed. Review the quote again.");
          const book = await db.collection("bookletBooks").findOne(
            {
              _id: bookletId as never,
              ownerId: actor.uid,
              "deletion.deletedAt": null,
            },
            { session },
          );
          if (!book) throw bookletMissing();
          const pack = bookletPackageFrom(row.fields, row.value.terms);
          const config = await configuration(
            db,
            pack.executionProfileId,
            pack.executionProfileRevision,
            session,
          );
          validatePackageCapacity(pack, config.capacity);
          validateBrief(pack, input.brief);
        },
      );
      const runKey = flowKey(startFlow(order.value.id));
      const prior = await existingRun(runKey, productionId);
      if (prior) return prior;
      const existing = await db.collection("bookletProductions").findOne(
        { _id: productionId as never, ownerId: actor.uid },
        {
          projection: {
            documentVersion: 1,
            bookletId: 1,
            orderId: 1,
            lifecycleState: 1,
          },
        },
      );
      if (!existing) {
        const pack = bookletPackageFrom(order.fields, order.value.terms);
        const config = await configuration(
          db,
          pack.executionProfileId,
          pack.executionProfileRevision,
        );
        await repo.createProduction(
          {
            id: productionId,
            bookletId,
            orderId: order.value.id,
            brief: input.brief,
            capacity: config.capacity,
            key: input.key,
          },
          config.retryDefaults,
        );
      } else if (
        existing.documentVersion !== 2 ||
        existing.bookletId !== bookletId ||
        existing.orderId !== order.value.id
      )
        throw bookletConflict("Production creation changed.");
      // The book, order and draft now exist. Any refusal from here on keeps
      // this exact request (BOOKLET_START_PENDING): editing would create a new
      // key and leave this draft unpaid and orphaned. Nothing is charged
      // before the paid start succeeds.
      if (
        (existing?.lifecycleState ?? "draft") === "draft" &&
        !(await readSettings(db)).settings.runs.enabled
      )
        throw pending(
          "Runs are disabled. Your book is saved; try again later.",
        );
      let workflowId: string;
      try {
        ({ workflowId } = await lifecycle.start(productionId));
      } catch (error) {
        if (error instanceof AppError && error.status < 500)
          throw pending(error.message);
        throw error;
      }
      // Paid and saved: enqueue reports a refusal as BOOKLET_START_PENDING.
      return enqueue(productionId, runKey, workflowId, null);
    },

    /** Allowlisted owned view: saved progress and selected (accepted) results. */
    async view(productionId: string): Promise<BookletView> {
      requireModule("booklets");
      pathId(productionId);
      const p = await repo.getProduction(productionId);
      const book = await db
        .collection<{ _id: string; title: string }>("bookletBooks")
        .findOne(
          { _id: p.bookletId, ownerId: actor.uid, "deletion.deletedAt": null },
          { projection: { title: 1 } },
        );
      if (!book) throw bookletMissing();
      const accepted = p.subjects.flatMap((s) =>
        s.artifacts.flatMap((a) =>
          a.acceptedRevisionId ? [a.acceptedRevisionId] : [],
        ),
      );
      const revisions = accepted.length
        ? await db
            .collection<{
              _id: string;
              artifactId: string;
              assets: { assetId: string; sha256: string }[];
            }>("bookletRevisions")
            .find(
              { ownerId: actor.uid, productionId, _id: { $in: accepted } },
              { projection: { artifactId: 1, assets: 1 } },
            )
            .toArray()
        : [];
      const assetsOf = new Map(
        revisions.map((r) => [
          r._id,
          z
            .array(z.object({ assetId: id }))
            .parse(r.assets ?? [])
            .map((a) => a.assetId),
        ]),
      );
      const url = (assetId: string) =>
        `/api/booklets/${encodeURIComponent(productionId)}/assets/${encodeURIComponent(assetId)}`;
      const config = p.creativeConfigSnapshot;
      const pages = p.subjects.filter((s) => s.kind === "page");
      const actions = await availableActions(p);
      return {
        productionId,
        bookletId: p.bookletId,
        title: book.title,
        state: p.lifecycleState,
        version: p.version,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        completed: p.currentManifestRevisionId !== null,
        predecessorId: p.sourceProductionId,
        stages: {
          story: Boolean(p.stageLocks.story),
          style: Boolean(p.stageLocks.style),
          references: Boolean(p.stageLocks.references),
        },
        pages: {
          accepted: pages.filter((s) =>
            s.artifacts.some(
              (a) => a.kind === "page-image" && a.acceptedRevisionId,
            ),
          ).length,
          total: config.storyPages + Number(config.includeCover),
        },
        actions,
        subjects: p.subjects.map((s) => ({
          id: s.id,
          kind: s.kind,
          label: s.label,
          pageRole: s.pageRole,
          artifacts: s.artifacts.map((a) => ({
            id: a.id,
            kind: a.kind,
            status: a.acceptedRevisionId
              ? ("selected" as const)
              : a.currentRevisionId
                ? ("in-progress" as const)
                : ("not-started" as const),
            images: a.acceptedRevisionId
              ? (assetsOf.get(a.acceptedRevisionId) ?? []).map((assetId) => ({
                  assetId,
                  url: url(assetId),
                }))
              : [],
          })),
        })),
      };
    },

    /** Owned, bounded history pages over the delivered readers' scoped cursors. */
    async history(
      productionId: string,
      raw: {
        kind?: string | null;
        artifactId?: string | null;
        cursor?: string | null;
      },
    ): Promise<BookletHistory> {
      requireModule("booklets");
      pathId(productionId);
      const kind = input(z.enum(bookletHistoryKinds), raw.kind);
      const cursor = raw.cursor
        ? input(z.string().max(16384), raw.cursor)
        : undefined;
      const p = await repo.getProduction(productionId);
      async function read(request: { kind: string; id: string }) {
        try {
          return await readBookletDocumentV2(db, actor, productionId, {
            ...request,
            ...(cursor ? { cursor } : {}),
          });
        } catch (error) {
          // Malformed cursor text is an input error, never a service failure.
          if (cursor && !(error instanceof AppError))
            throw new AppError(
              "BOOKLET_INVALID",
              "Invalid pagination cursor.",
              400,
            );
          throw error;
        }
      }
      if (kind === "runs") {
        const page = (await read({
          kind: "execution_history",
          id: productionId,
        })) as {
          items: {
            logicalId: string | null;
            status: string;
            createdAt: string | null;
          }[];
          cursor: string | null;
        };
        const status = (value: string) =>
          value === "succeeded" || value === "failed" || value === "cancelled"
            ? value
            : ["unknown", "needs-review", "settlement-blocked"].includes(value)
              ? ("confirming" as const)
              : ("active" as const);
        return {
          kind,
          items: page.items.flatMap((item) =>
            item.logicalId
              ? [
                  {
                    runId: item.logicalId,
                    status: status(item.status),
                    createdAt: item.createdAt,
                  },
                ]
              : [],
          ),
          next: page.cursor,
        };
      }
      if (kind === "versions") {
        const page = (await read({
          kind: "production_history",
          id: p.bookletId,
        })) as {
          items: {
            productionId: string;
            state: string;
            createdAt: string | null;
          }[];
          cursor: string | null;
        };
        return {
          kind,
          items: page.items.map((item) => ({
            productionId: item.productionId,
            state: item.state,
            current: item.productionId === productionId,
            predecessor: item.productionId === p.sourceProductionId,
            createdAt: item.createdAt,
          })),
          next: page.cursor,
        };
      }
      const artifactId = input(id, raw.artifactId);
      const artifact = p.subjects
        .flatMap((s) => s.artifacts)
        .find((a) => a.id === artifactId);
      if (!artifact) throw bookletMissing();
      const page = (await read({ kind: "history", id: artifactId })) as {
        items: { revisionId: string; ordinal: number; createdAt: string }[];
        cursor: string | null;
      };
      return {
        kind,
        items: page.items.map((item) => ({
          revisionId: item.revisionId,
          ordinal: item.ordinal,
          selected: item.revisionId === artifact.acceptedRevisionId,
          current: item.revisionId === artifact.currentRevisionId,
          createdAt: item.createdAt,
        })),
        next: page.cursor,
      };
    },

    /** Owned original bytes; fresh ownership and attachment checks per read. */
    async original(productionId: string, assetId: string) {
      requireModule("booklets");
      pathId(productionId);
      pathId(assetId);
      const { asset, bytes } = await bookletMedia(db, actor, {
        documentVersion: 2,
      }).read(productionId, assetId);
      if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mime))
        throw bookletMissing();
      return { mime: asset.mime, sha256: asset.sha256, bytes };
    },

    async command(
      productionId: string,
      raw: unknown,
    ): Promise<
      | BookletRevisionQuote
      | BookletRunReference
      | BookletRetryResult
      | BookletReplyResult
    > {
      requireModule("booklets");
      pathId(productionId);
      const command = bookletProductionCommandSchema.parse(raw);
      // Fresh ownership and v2 shape before any Run, order or quote lookup.
      await repo.getProduction(productionId);
      switch (command.action) {
        case "quote-revision": {
          const quote = await lifecycle.quoteRevision(
            productionId,
            revisionRequest(command),
          );
          return {
            quoteHash: quote.hash,
            credits: quote.credits,
            units: quote.units.length,
          };
        }
        case "start-revision": {
          const { orderId } = await repo.getProduction(productionId);
          const runKey = flowKey(
            fingerprint([orderId, "revision", command.requestId]),
          );
          const prior = await existingRun(runKey, productionId);
          if (prior) return prior;
          const workflowId = await lifecycle.startRevision(
            productionId,
            revisionRequest(command),
            command.quoteHash,
            command.acceptedCredits,
          );
          return enqueue(productionId, runKey, workflowId, null);
        }
        case "retry": {
          await repo.authorizeRetry(productionId, {
            callId: command.callId,
            key: command.key,
          });
          const { orderId } = await repo.getProduction(productionId);
          const prior = await existingRun(
            flowKey(fingerprint([orderId, "continue", command.key])),
            productionId,
          );
          if (prior) return { authorized: true, continued: prior };
          const latest = await latestRun(productionId);
          return {
            authorized: true,
            continued:
              latest && canStartNewAttempt(latest)
                ? await continueWith(productionId, command.key)
                : null,
          };
        }
        case "continue":
          return continueWith(productionId, command.key);
        case "resume":
          return resumeFlow(productionId);
        case "reply":
          return reply(productionId, command);
      }
    },

    /** The owned conversation: Manager turns with their authentic replies. */
    async conversation(productionId: string): Promise<BookletConversation> {
      requireModule("booklets");
      pathId(productionId);
      const p = await repo.getProduction(productionId);
      const book = await db
        .collection<{ _id: string; title: string }>("bookletBooks")
        .findOne(
          { _id: p.bookletId, ownerId: actor.uid, "deletion.deletedAt": null },
          { projection: { title: 1 } },
        );
      if (!book) throw bookletMissing();
      const asked = await humanRequests(productionId);
      const runIds = [...new Set(asked.map((a) => a.human.runId))];
      const [jobs, decisions, latest] = await Promise.all([
        aiJobs(db)
          .find(
            { _id: { $in: runIds }, uid: actor.uid },
            { projection: { status: 1 } },
          )
          .toArray(),
        nativeDecisions(asked.map((a) => a.human)),
        latestRun(productionId),
      ]);
      const statusOf = new Map(jobs.map((j) => [j._id, j.status]));
      const turns = asked.map(({ human, createdAt }) => {
        const matches = decisions.filter(
          (d) =>
            d.jobId === human.runId &&
            d.form?.form_content === human.formContent + placeholder,
        );
        const decision = matches.length === 1 ? matches[0] : undefined;
        const response = confirmedHumanResponse(decision);
        const checked =
          response.status === "submitted"
            ? checkReply(human.turn!, response.response)
            : null;
        const answered = checked?.ok ? checked.reply : null;
        const active = activeStatuses.includes(statusOf.get(human.runId) ?? "");
        let status: BookletConversation["turns"][number]["status"];
        if (answered) status = "answered";
        else if (isStale(p, human.targets)) status = "stale";
        else if (!decision)
          // Ambiguous native matches are never answerable here.
          status = matches.length || !active ? "closed" : "preparing";
        else if (
          decision.status === "expired" ||
          (decision.form?.expiration_time ?? Infinity) * 1000 < Date.now()
        )
          status = "expired";
        else if (
          latest?._id === human.runId &&
          ["submitting", "unknown"].includes(decision.status)
        )
          status = "confirming";
        else
          status = decision.status === "pending" && active ? "open" : "closed";
        return {
          requestId: human.requestId,
          createdAt: createdAt.toISOString(),
          status,
          turn: human.turn!,
          reply: answered,
        };
      });
      const confirming = turns.some((t) => t.status === "confirming");
      const working =
        !!latest &&
        activeStatuses.includes(latest.status) &&
        !confirming &&
        !turns.some((t) => t.status === "open" || t.status === "preparing");
      let activity: BookletConversation["activity"] = null;
      if (
        confirming ||
        (latest &&
          ["unknown", "needs-review", "settlement-blocked"].includes(
            latest.status,
          ))
      )
        activity = "confirming";
      else if (turns.some((turn) => turn.status === "preparing"))
        activity = "preparing-question";
      else if (working && latest) {
        if (latest.applicationWait) activity = "retry";
        else if (latest.status === "queued") activity = "queued";
        else {
          const work = await db
            .collection<{ service: string }>("bookletWork")
            .findOne(
              {
                ownerId: actor.uid,
                productionId,
                runId: latest._id,
                status: "dispatching",
              },
              { sort: { updatedAt: -1 }, projection: { service: 1 } },
            );
          const activities = new Map<string, BookletConversation["activity"]>([
            ["story-planner", "story"],
            ["manuscript", "story"],
            ["art-director", "art"],
            ["page-composer", "layout"],
            ["image-executor", "images"],
            ["quality-reviewer", "review"],
          ]);
          activity = activities.get(work?.service ?? "") ?? "working";
        }
      }
      let reader: BookletConversation["reader"] = null;
      if (p.currentManifestRevisionId) {
        const manifest = await repo.getRevision(
          productionId,
          p.currentManifestRevisionId,
        );
        if (manifest.content.kind === "book-manifest") {
          const cover = p.subjects.find(
            (subject) => subject.pageRole === "cover",
          )?.id;
          const layoutIds = new Set(
            p.subjects.flatMap((subject) =>
              subject.artifacts
                .filter((artifact) => artifact.kind === "book-layout")
                .map((artifact) => artifact.id),
            ),
          );
          const layoutSource = manifest.sources.find((source) =>
            layoutIds.has(source.artifactId),
          );
          const layout = layoutSource
            ? (await repo.getRevision(productionId, layoutSource.revisionId))
                .content
            : null;
          const lettering = new Map(
            layout?.kind === "book-layout"
              ? layout.pages.map((page) => [
                  page.id,
                  page.panels.flatMap((panel) =>
                    panel.lettering.map((span) => span.text),
                  ),
                ])
              : [],
          );
          reader = {
            direction: p.brief.language.direction,
            width: p.creativeConfigSnapshot.canvas.width,
            height: p.creativeConfigSnapshot.canvas.height,
            pages: manifest.content.pages.map((page) => ({
              assetId: page.assetId,
              cover: page.pageId === cover,
              text: lettering.get(page.pageId) ?? [],
            })),
          };
        }
      }
      return {
        productionId,
        title: book.title,
        idea: p.brief.idea,
        state: p.lifecycleState,
        working,
        activity,
        runId: latest?.run?.logicalId ?? null,
        completed: p.currentManifestRevisionId !== null,
        reader,
        turns,
      };
    },
  };

  /** Validated conversational requests (with a turn) for one owned production. */
  async function humanRequests(productionId: string, requestId?: string) {
    const rows = await db
      .collection<{ result: { humanRequest?: unknown }; createdAt: Date }>(
        "bookletRepositoryWrites",
      )
      .find(
        {
          ownerId: actor.uid,
          productionId,
          ...(requestId
            ? { "result.humanRequest.requestId": requestId }
            : { "result.humanRequest.turn": { $type: "object" } }),
        },
        {
          projection: { "result.humanRequest": 1, createdAt: 1 },
          sort: { createdAt: 1, _id: 1 },
          limit: 200,
        },
      )
      .toArray();
    return rows.flatMap((row) => {
      const human = humanRequestV2Schema.safeParse(row.result.humanRequest);
      return human.success && human.data.turn
        ? [{ human: human.data, createdAt: row.createdAt }]
        : [];
    });
  }

  // Native decisions are matched exactly as `human_response` matches them:
  // the original Manager Run, the native `human` node and the exact form.
  function nativeDecisions(humans: { runId: string; formContent: string }[]) {
    if (!humans.length) return Promise.resolve([] as Decision[]);
    return db
      .collection<Decision>("runDecisions")
      .find({
        uid: actor.uid,
        nodeId: "human",
        jobId: { $in: [...new Set(humans.map((h) => h.runId))] },
        "form.form_content": {
          $in: humans.map((h) => h.formContent + placeholder),
        },
      })
      .limit(400)
      .toArray();
  }

  function isStale(
    p: {
      subjects: {
        artifacts: { id: string; currentRevisionId: string | null }[];
      }[];
    },
    targets: { artifactId: string; revisionId: string }[],
  ) {
    return targets.some(
      (t) =>
        !p.subjects.some((s) =>
          s.artifacts.some(
            (a) =>
              a.id === t.artifactId && a.currentRevisionId === t.revisionId,
          ),
        ),
    );
  }

  async function reply(
    productionId: string,
    command: Extract<
      z.infer<typeof bookletProductionCommandSchema>,
      { action: "reply" }
    >,
  ): Promise<BookletReplyResult> {
    const p = await repo.getProduction(productionId);
    const [asked] = await humanRequests(productionId, command.requestId);
    if (!asked) throw bookletMissing();
    const { human } = asked;
    if (isStale(p, human.targets))
      throw bookletConflict("This question changed. Reload the conversation.");
    const checked = checkReply(human.turn!, command.reply);
    if (!checked.ok)
      throw new AppError("BOOKLET_REPLY_INVALID", checked.reason, 400);
    const [matches, job] = await Promise.all([
      nativeDecisions([human]),
      aiJobs(db).findOne({ _id: human.runId, uid: actor.uid }),
    ]);
    if (matches.length !== 1 || !job)
      throw new AppError(
        "DECISION_UNAVAILABLE",
        "This question is not open.",
        409,
      );
    // The existing authentic decision path: ownership, live attempt, first
    // answer wins, and the same key/payload is an idempotent retry.
    const result = await submitAuthorizedDecision(
      db,
      { uid: actor.uid, auth_time: actor.authTime },
      job,
      matches[0],
      { key: command.key, action: "continue", response: checked.reply },
      { type: "user" },
    );
    return {
      status: result.status === "submitted" ? "submitted" : "submitting",
    };
  }
}

// The native Human Input appends this placeholder to the retained form body.
const placeholder = "\n{{#$output.response#}}";
const activeStatuses: string[] = ["queued", "dispatching", "running", "paused"];
// The conversational entry collects only the idea. The brief still requires an
// audience, so it carries this fixed marker and the Manager asks the owner.
export const audienceNotStated = "Not stated yet; ask the owner.";
