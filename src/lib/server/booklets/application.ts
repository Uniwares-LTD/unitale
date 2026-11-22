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
  type BookletPackagePage,
  type BookletPackageSummary,
  type BookletRetryResult,
  type BookletRevisionQuote,
  type BookletRunReference,
  type BookletView,
  type BookletHistory,
  bookletHistoryKinds,
} from "../../../project/booklets/application-contract";
import { AppError } from "../../auth-policy";
import { bookletConflict, bookletMissing } from "./context";
import { creativeFieldsSchema, id } from "./documents";
import { bookletRepository } from "./repository";
import { bookletRepositoryV2 } from "./repository-v2";
import { bookletLifecycleV2 } from "./lifecycle-v2";
import { enqueueBookletRun } from "./runs";
import { bookletMedia } from "./media";
import { readBookletDocumentV2 } from "./read-v2";
import { readSettings } from "../settings";
import { accessPermitsSession, accountAccess } from "../store/access";
import { readWallet } from "../store/credits";

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

  /** Exactly one enabled, validated booklet v2 orchestrator at its current
   * revision must carry a policy row for the profile. Never inferred. */
  async function configuration(
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

  async function summary(
    catalogId: string,
  ): Promise<BookletPackageSummary | null> {
    const publication = await publishedCatalog(db, catalogId);
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
        pack.executionProfileId,
        pack.executionProfileRevision,
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
    const p = await repo.getProduction(productionId);
    const config = await configuration(
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
      continue: live && terminal,
      retry,
      revisions,
    };
  }

  async function continueWith(
    productionId: string,
    key: string,
  ): Promise<BookletRunReference> {
    const runKey = "booklet-continue:" + key;
    const prior = await existingRun(runKey, productionId);
    if (prior) return prior;
    const predecessorId = successorOf(await latestRun(productionId));
    const workflowId = await lifecycle.continue(productionId, key);
    return enqueue(productionId, runKey, workflowId, predecessorId);
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
      return {
        rows: page.map((b) => ({ id: b.currentProductionId!, title: b.title })),
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
        const item = await summary(head._id);
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
      const item = await summary(command.catalogId);
      if (!item?.available) throw unavailable();
      return item;
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
      const runKey = "booklet-start:" + input.key;
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
        const item = await summary(input.catalogId);
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
            pack.executionProfileId,
            pack.executionProfileRevision,
            session,
          );
          validatePackageCapacity(pack, config.capacity);
          validateBrief(pack, input.brief);
        },
      );
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
      // Before charging only: refusing here avoids paying for a Run that cannot
      // be admitted. Once charged, a refusal is reported as START_PENDING below.
      if (
        (existing?.lifecycleState ?? "draft") === "draft" &&
        !(await readSettings(db)).settings.runs.enabled
      )
        throw bookletConflict("Runs are disabled.");
      const { workflowId } = await lifecycle.start(productionId);
      try {
        return await enqueue(productionId, runKey, workflowId, null);
      } catch (error) {
        // Paid and saved: the browser must retry this exact request, never edit
        // it into a new key (which would be a second booklet and charge).
        if (error instanceof AppError && error.status < 500)
          throw new AppError(
            "BOOKLET_START_PENDING",
            "Your book is paid and saved, but it couldn’t start yet. Try again.",
            409,
          );
        throw error;
      }
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
      BookletRevisionQuote | BookletRunReference | BookletRetryResult
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
          const runKey = "booklet-revision:" + command.requestId;
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
          const prior = await existingRun(
            "booklet-continue:" + command.key,
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
      }
    },
  };
}
