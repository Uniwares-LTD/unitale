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
} from "../../../project/booklets/application-contract";
import { AppError } from "../../auth-policy";
import { bookletConflict, bookletMissing } from "./context";
import { creativeFieldsSchema, id } from "./documents";
import { bookletRepository } from "./repository";
import { bookletRepositoryV2 } from "./repository-v2";
import { bookletLifecycleV2 } from "./lifecycle-v2";
import { enqueueBookletRun } from "./runs";
import { readSettings } from "../settings";

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

  return {
    async packages(
      raw: { cursor?: string | null } = {},
    ): Promise<BookletPackagePage> {
      requireModule("booklets");
      const scope = fingerprint([actor.uid, "booklet-packages"]);
      let after: string | undefined;
      if (raw.cursor) {
        try {
          const value = z
            .strictObject({
              scope: z.literal(scope),
              after: z.string().max(160),
            })
            .parse(
              JSON.parse(Buffer.from(raw.cursor, "base64url").toString("utf8")),
            );
          after = value.after;
        } catch {
          throw new AppError(
            "BOOKLET_INVALID",
            "Invalid pagination cursor.",
            400,
          );
        }
      }
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
            ? Buffer.from(
                JSON.stringify({ scope, after: page.at(-1)!._id }),
              ).toString("base64url")
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
      const existing = await db
        .collection("bookletProductions")
        .findOne(
          { _id: productionId as never, ownerId: actor.uid },
          { projection: { documentVersion: 1, bookletId: 1, orderId: 1 } },
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
      // Run admission rechecks this; refusing here avoids charging for a Run
      // that cannot be admitted. A charged start always resumes to its Run.
      if (!(await readSettings(db)).settings.runs.enabled)
        throw bookletConflict("Runs are disabled.");
      const { workflowId } = await lifecycle.start(productionId);
      return enqueue(productionId, runKey, workflowId, null);
    },

    async command(
      productionId: string,
      raw: unknown,
    ): Promise<
      BookletRevisionQuote | BookletRunReference | BookletRetryResult
    > {
      requireModule("booklets");
      id.parse(productionId);
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
