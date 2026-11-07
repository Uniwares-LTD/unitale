import "server-only";
import { BSON, type Db, type ClientSession } from "mongodb";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AppError } from "../../auth-policy";
import { fingerprint } from "../foundation/canonical";
import {
  accountAccess,
  accessPermitsSession,
  accessTransaction,
} from "../store/access";
import type { CreditActor } from "../store/credit-types";
import { consumptionOrderSchema } from "../../contracts/commerce";
import {
  briefSchema,
  validatePackageCapacity,
  validateManifestPackage,
  executionCapacitySchema,
} from "../../../project/booklets/contracts";
import {
  id,
  writeReceiptSchema,
  type WriteResult,
  type WriteReceipt,
  bookDocumentSchema,
  productionDocumentSchema,
  revisionDocumentSchema,
  subjectInputSchema,
  artifactKind,
  creativeFieldsSchema,
  mutationSchema,
  appendInputSchema,
  responsibilities,
  bookView,
  productionView,
  revisionView,
  type BookDocument,
  type ProductionDocument,
  type RevisionDocument,
  type SubjectInput,
  type ArtifactKind,
  type Mutation,
  type AppendInput,
} from "./documents";

export const bookletCollections = [
  "bookletBooks",
  "bookletProductions",
  "bookletRevisions",
  "bookletRepositoryWrites",
] as const;
export async function createBookletIndexes(db: Db) {
  await db.collection("bookletBooks").createIndex({ ownerId: 1, _id: 1 });
  await db
    .collection("bookletProductions")
    .createIndex({ ownerId: 1, bookletId: 1, _id: 1 });
  await db
    .collection("bookletProductions")
    .createIndex({ orderId: 1 }, { unique: true });
  await db
    .collection("bookletRevisions")
    .createIndex(
      { productionId: 1, artifactId: 1, ordinal: 1 },
      { unique: true },
    );
  await db
    .collection("bookletRevisions")
    .createIndex({ ownerId: 1, productionId: 1, _id: 1 });
  await db
    .collection("bookletRevisions")
    .createIndex({ productionId: 1, "sources.revisionId": 1 });
  await db
    .collection("bookletRepositoryWrites")
    .createIndex({ ownerId: 1, scope: 1, key: 1 }, { unique: true });
}
export type { WriteResult } from "./documents";
export type RepositoryLimits = {
  productionBytes: number;
  revisionBytes: number;
};
const defaults: RepositoryLimits = {
  productionBytes: 1024 * 1024,
  revisionBytes: 4 * 1024 * 1024,
};
const notFound = () =>
  new AppError("BOOKLET_NOT_FOUND", "Booklet record not found.", 404);
const conflict = (message: string) =>
  new AppError("BOOKLET_CONFLICT", message, 409);
const invalid = (message: string) =>
  new AppError("BOOKLET_INVALID", message, 400);
const unique = (values: string[]) => new Set(values).size === values.length;
const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(2048).optional(),
});

// actor is supplied only by trusted server callers from a verified session.
export function bookletRepository(
  db: Db,
  actor: CreditActor,
  options: { now?: () => Date; limits?: Partial<RepositoryLimits> } = {},
) {
  const now = options.now ?? (() => new Date());
  const limits = { ...defaults, ...options.limits };
  for (const limit of Object.values(limits))
    if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 8 * 1024 * 1024)
      throw invalid("Invalid trusted storage limit.");
  const books = db.collection<BookDocument>("bookletBooks");
  const productions = db.collection<ProductionDocument>("bookletProductions");
  const revisions = db.collection<RevisionDocument>("bookletRevisions");
  const receipts = db.collection<WriteReceipt>("bookletRepositoryWrites");
  async function authorize(session?: ClientSession) {
    if (
      !accessPermitsSession(
        await accountAccess(db, actor.uid, session),
        actor.authTime,
      )
    )
      throw new AppError("FORBIDDEN", "Account access is unavailable.", 403);
  }
  async function transaction<T>(
    action: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ) {
    if (session) {
      if (!session.inTransaction())
        throw invalid(
          "An active transaction on this database client is required.",
        );
      // Serialize access changes just like accessTransaction; the driver rejects
      // sessions belonging to another MongoClient before any write can occur.
      await db
        .collection<{ _id: string; tick: number }>("control")
        .updateOne(
          { _id: "admin-access" },
          { $inc: { tick: 1 } },
          { upsert: true, session },
        );
      await authorize(session);
      return action(session);
    }
    return accessTransaction(db, null, async (s) => {
      await authorize(s);
      return action(s);
    });
  }
  async function book(bookId: string, session?: ClientSession) {
    id.parse(bookId);
    const row = await books.findOne(
      { _id: bookId, ownerId: actor.uid, "deletion.deletedAt": null },
      { session },
    );
    if (!row) throw notFound();
    return bookDocumentSchema.parse(row);
  }
  async function production(productionId: string, session?: ClientSession) {
    id.parse(productionId);
    const row = await productions.findOne(
      { _id: productionId, ownerId: actor.uid },
      { session },
    );
    if (!row) throw notFound();
    await book(row.bookletId, session);
    return productionDocumentSchema.parse(row);
  }
  function bound(value: object, ceiling: number) {
    if (BSON.calculateObjectSize(value) > ceiling)
      throw new AppError(
        "BOOKLET_TOO_LARGE",
        "Document exceeds the configured storage limit.",
        413,
      );
  }
  async function write(
    scope: string,
    key: string,
    input: unknown,
    s: ClientSession,
    effect: () => Promise<WriteResult>,
  ) {
    id.parse(key);
    const identity = fingerprint([actor.uid, scope, key]);
    const inputHash = fingerprint(input);
    const prior = await receipts.findOne({ _id: identity }, { session: s });
    if (prior) {
      if (prior.inputHash !== inputHash)
        throw conflict("Idempotency key was already used for different input.");
      return writeReceiptSchema.parse(prior).result;
    }
    const result = await effect();
    await receipts.insertOne(
      {
        _id: identity,
        ownerId: actor.uid,
        scope,
        key,
        inputHash,
        result,
        createdAt: now(),
      },
      { session: s },
    );
    return result;
  }
  function mutable(p: ProductionDocument, expectedVersion: number) {
    if (p.version !== expectedVersion)
      throw conflict("Production version is stale.");
    if (
      ["completed", "closed"].includes(p.lifecycleState) ||
      (p.expiresAt && p.expiresAt <= now())
    )
      throw conflict("Production is not mutable.");
  }
  function fenced(p: ProductionDocument, m: Mutation) {
    mutable(p, m.expectedVersion);
    if (
      !p.mutationLease ||
      p.mutationLease.holderId !== m.holderId ||
      p.mutationLease.fence !== m.fence ||
      p.mutationLease.expiresAt <= now()
    )
      throw conflict("Mutation lease is expired or superseded.");
  }
  function validateIndex(p: ProductionDocument) {
    if (
      !unique(p.subjects.map((s) => s.id)) ||
      !unique(p.subjects.flatMap((s) => s.artifacts.map((a) => a.id)))
    )
      throw invalid("Duplicate embedded identity.");
    const config = p.creativeConfigSnapshot;
    const maxima = {
      book: 1,
      character: config.maxCharacters,
      location: config.maxLocations,
      "style-sample": config.styleSamples,
      page: config.storyPages + Number(config.includeCover),
    };
    for (const [kind, max] of Object.entries(maxima))
      if (p.subjects.filter((s) => s.kind === kind).length > max)
        throw invalid("Subject count exceeds the accepted package.");
    if (
      p.subjects.filter((s) => s.pageRole === "cover").length >
        Number(config.includeCover) ||
      p.subjects.filter((s) => s.pageRole === "story").length >
        config.storyPages
    )
      throw invalid("Page roles exceed the accepted package.");
    for (const subject of p.subjects) {
      if (!unique(subject.artifacts.map((a) => a.kind)))
        throw invalid("Duplicate responsibility for subject.");
      for (const artifact of subject.artifacts)
        if (!responsibilities[subject.kind].includes(artifact.kind))
          throw invalid("Artifact responsibility does not match its subject.");
    }
    bound(p, limits.productionBytes);
  }
  async function save(
    p: ProductionDocument,
    previousVersion: number,
    session: ClientSession,
  ) {
    validateIndex(p);
    productionDocumentSchema.parse(p);
    const result = await productions.replaceOne(
      { _id: p._id, ownerId: actor.uid, version: previousVersion },
      p,
      { session },
    );
    if (result.modifiedCount !== 1) throw conflict("Production changed.");
  }
  function resolveArtifact(p: ProductionDocument, artifactId: string) {
    for (const subject of p.subjects) {
      const artifact = subject.artifacts.find((a) => a.id === artifactId);
      if (artifact) return { subject, artifact };
    }
    throw notFound();
  }
  async function revision(
    p: ProductionDocument,
    revisionId: string,
    session?: ClientSession,
  ) {
    id.parse(revisionId);
    const row = await revisions.findOne(
      { _id: revisionId, ownerId: actor.uid, productionId: p._id },
      { session },
    );
    if (!row) throw notFound();
    const { subject, artifact } = resolveArtifact(p, row.artifactId);
    if (subject.id !== row.subjectId || artifact.kind !== row.kind)
      throw conflict("Revision identity does not match the embedded index.");
    return revisionDocumentSchema.parse(row);
  }
  function cursorScope(kind: string, parent: string) {
    return fingerprint([actor.uid, kind, parent]);
  }
  function decodeCursor(
    raw: string | undefined,
    scope: string,
  ): string | undefined {
    if (!raw) return;
    try {
      const value = z
        .strictObject({ scope: z.string(), after: id })
        .parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
      if (value.scope !== scope)
        throw invalid("Cursor belongs to another query.");
      return value.after;
    } catch {
      throw invalid("Invalid pagination cursor.");
    }
  }
  function page<T extends { _id: string }>(
    rows: T[],
    limit: number,
    scope: string,
  ) {
    const items = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? Buffer.from(
            JSON.stringify({ scope, after: items.at(-1)!._id }),
          ).toString("base64url")
        : null;
    return { items, cursor };
  }
  return {
    async createBook(
      input: { id: string; title: string; key: string },
      session?: ClientSession,
    ) {
      const value = z
        .strictObject({ id, title: z.string().trim().min(1).max(160), key: id })
        .parse(input);
      return transaction(async (s) => {
        const existing = await books.findOne({ _id: value.id }, { session: s });
        if (existing) await book(value.id, s);
        return write(
          "book:" + value.id,
          value.key,
          { method: "createBook", value },
          s,
          async () => {
            if (existing) throw conflict("Booklet already exists.");
            const at = now();
            await books.insertOne(
              bookDocumentSchema.parse({
                _id: value.id,
                documentVersion: 1,
                ownerId: actor.uid,
                title: value.title,
                currentProductionId: null,
                version: 1,
                createdAt: at,
                updatedAt: at,
                deletion: { deletedAt: null, recoverUntil: null },
              }),
              { session: s },
            );
            return { id: value.id, version: 1 };
          },
        );
      }, session);
    },
    async createProduction(
      input: {
        id: string;
        bookletId: string;
        orderId: string;
        brief: z.input<typeof briefSchema>;
        capacity: z.input<typeof executionCapacitySchema>;
        key: string;
      },
      session?: ClientSession,
    ) {
      const value = z
        .strictObject({
          id,
          bookletId: id,
          orderId: id,
          brief: briefSchema,
          capacity: executionCapacitySchema,
          key: id,
        })
        .parse(input);
      return transaction(async (s) => {
        const b = await book(value.bookletId, s);
        const existing = await productions.findOne(
          { _id: value.id },
          { session: s },
        );
        if (existing && existing.ownerId !== actor.uid) throw notFound();
        // Read the frozen order even in caller-owned transactions; no caller-supplied order/price assertion.
        const orderRow = await db
          .collection("consumptionOrders")
          .findOne(
            { "value.id": value.orderId, "value.ownerId": actor.uid },
            { session: s },
          );
        if (!orderRow) throw notFound();
        const order = consumptionOrderSchema.parse(orderRow.value);
        if (
          order.targetId !== value.id ||
          order.terms.productType !== "booklet"
        )
          throw notFound();
        return write(
          "production:" + value.id,
          value.key,
          { method: "createProduction", value },
          s,
          async () => {
            if (existing) throw conflict("Production already exists.");
            if (
              !["queued", "started"].includes(order.state) ||
              (order.expiresAt && new Date(order.expiresAt) <= now())
            )
              throw conflict("Order cannot create a production.");
            const fields = creativeFieldsSchema.parse(orderRow.fields);
            const allowances = Object.fromEntries(
              order.terms.allowances.map((a) => [
                a.category,
                { included: a.included, extraCredits: a.extraCredits },
              ]),
            );
            const pack = validatePackageCapacity(
              {
                ...fields,
                schemaVersion: 1,
                id: order.terms.identity.id,
                revision: order.terms.identity.revision,
                credits: order.terms.credits,
                allowances,
                entitlementDays: order.terms.entitlementDays,
              },
              value.capacity,
            );
            if (
              !pack.languages.some(
                (l) =>
                  l.tag === value.brief.language.tag &&
                  l.direction === value.brief.language.direction,
              ) ||
              value.brief.characters.length > pack.maxCharacters ||
              value.brief.locations.length > pack.maxLocations
            )
              throw invalid("Brief exceeds the accepted package.");
            const at = now();
            const p = productionDocumentSchema.parse({
              _id: value.id,
              documentVersion: 1,
              ownerId: actor.uid,
              bookletId: b._id,
              orderId: order.id,
              sourceProductionId: null,
              brief: value.brief,
              creativeConfigSnapshot: {
                ...fields,
                id: pack.id,
                revision: pack.revision,
              },
              lifecycleState: "draft",
              subjects: [],
              stageLocks: { story: null, style: null, references: null },
              mutationLease: null,
              fenceCounter: 0,
              version: 1,
              currentManifestRevisionId: null,
              createdAt: at,
              updatedAt: at,
              expiresAt: order.expiresAt ? new Date(order.expiresAt) : null,
            });
            validateIndex(p);
            await productions.insertOne(p, { session: s });
            const result = await books.updateOne(
              {
                _id: b._id,
                ownerId: actor.uid,
                version: b.version,
                "deletion.deletedAt": null,
              },
              {
                $set: { currentProductionId: p._id, updatedAt: at },
                $inc: { version: 1 },
              },
              { session: s },
            );
            if (result.modifiedCount !== 1) throw conflict("Booklet changed.");
            return { id: p._id, version: 1 };
          },
        );
      }, session);
    },
    async getBook(bookId: string) {
      await authorize();
      return bookView(await book(bookId));
    },
    async getProduction(productionId: string) {
      await authorize();
      return productionView(await production(productionId));
    },
    async getArtifact(productionId: string, artifactId: string) {
      await authorize();
      const p = await production(productionId);
      const result = resolveArtifact(p, id.parse(artifactId));
      for (const pointer of [
        result.artifact.currentRevisionId,
        result.artifact.acceptedRevisionId,
      ])
        if (pointer && (await revision(p, pointer)).artifactId !== artifactId)
          throw conflict("Invalid revision pointer.");
      return {
        productionId: p._id,
        productionVersion: p.version,
        subjectId: result.subject.id,
        ...result.artifact,
      };
    },
    async getRevision(productionId: string, revisionId: string) {
      await authorize();
      return revisionView(
        await revision(await production(productionId), revisionId),
      );
    },
    async listBooks(input: z.input<typeof pageSchema> = {}) {
      await authorize();
      const { limit, cursor } = pageSchema.parse(input);
      const scope = cursorScope("books", "");
      const after = decodeCursor(cursor, scope);
      const rows = await books
        .find({
          ownerId: actor.uid,
          "deletion.deletedAt": null,
          ...(after ? { _id: { $gt: after } } : {}),
        })
        .sort({ _id: 1 })
        .limit(limit + 1)
        .toArray();
      const result = page(rows, limit, scope);
      return {
        ...result,
        items: result.items.map((row) =>
          bookView(bookDocumentSchema.parse(row)),
        ),
      };
    },
    async listProductions(
      bookletId: string,
      input: z.input<typeof pageSchema> = {},
    ) {
      await authorize();
      await book(bookletId);
      const { limit, cursor } = pageSchema.parse(input);
      const scope = cursorScope("productions", bookletId);
      const after = decodeCursor(cursor, scope);
      const result = page(
        await productions
          .find({
            ownerId: actor.uid,
            bookletId,
            ...(after ? { _id: { $gt: after } } : {}),
          })
          .sort({ _id: 1 })
          .limit(limit + 1)
          .toArray(),
        limit,
        scope,
      );
      return {
        ...result,
        items: result.items.map((row) =>
          productionView(productionDocumentSchema.parse(row)),
        ),
      };
    },
    async listRevisions(
      productionId: string,
      artifactId: string,
      input: z.input<typeof pageSchema> = {},
    ) {
      await authorize();
      const p = await production(productionId);
      resolveArtifact(p, id.parse(artifactId));
      const { limit, cursor } = pageSchema.parse(input);
      const scope = cursorScope(
        "revisions",
        JSON.stringify([productionId, artifactId]),
      );
      const raw = decodeCursor(cursor, scope);
      const after =
        raw === undefined
          ? 0
          : z.coerce.number().int().nonnegative().safe().parse(raw);
      const rows = await revisions
        .find({
          ownerId: actor.uid,
          productionId,
          artifactId,
          ordinal: { $gt: after },
        })
        .sort({ ordinal: 1 })
        .limit(limit + 1)
        .toArray();
      const items = rows.slice(0, limit);
      return {
        items: items.map((row) =>
          revisionView(revisionDocumentSchema.parse(row)),
        ),
        cursor:
          rows.length > limit
            ? Buffer.from(
                JSON.stringify({ scope, after: String(items.at(-1)!.ordinal) }),
              ).toString("base64url")
            : null,
      };
    },
    async acquireLease(
      productionId: string,
      input: {
        key: string;
        expectedVersion: number;
        holderId: string;
        durationMs: number;
      },
    ) {
      const value = z
        .strictObject({
          key: id,
          expectedVersion: z.number().int().positive(),
          holderId: id,
          durationMs: z.number().int().min(1000).max(300000),
        })
        .parse(input);
      return transaction(async (s) => {
        const p = await production(productionId, s);
        return write(
          "production:" + p._id,
          value.key,
          { method: "acquireLease", value },
          s,
          async () => {
            mutable(p, value.expectedVersion);
            if (p.mutationLease && p.mutationLease.expiresAt > now())
              throw conflict(
                "Production already has an active mutation lease.",
              );
            p.fenceCounter++;
            p.mutationLease = {
              holderId: value.holderId,
              fence: p.fenceCounter,
              expiresAt: new Date(now().getTime() + value.durationMs),
            };
            p.version++;
            p.updatedAt = now();
            await save(p, value.expectedVersion, s);
            return {
              id: p._id,
              version: p.version,
              fence: p.fenceCounter,
              expiresAt: p.mutationLease.expiresAt.toISOString(),
            };
          },
        );
      });
    },
    async renewLease(
      productionId: string,
      input: Mutation & { durationMs: number },
    ) {
      const value = mutationSchema
        .extend({ durationMs: z.number().int().min(1000).max(300000) })
        .parse(input);
      return mutate(productionId, value, "renewLease", async (p) => {
        p.mutationLease!.expiresAt = new Date(
          now().getTime() + value.durationMs,
        );
        return {
          fence: p.mutationLease!.fence,
          expiresAt: p.mutationLease!.expiresAt.toISOString(),
        };
      });
    },
    async releaseLease(productionId: string, input: Mutation) {
      const value = mutationSchema.parse(input);
      return mutate(productionId, value, "releaseLease", async (p) => {
        p.mutationLease = null;
        return {};
      });
    },
    async addSubject(
      productionId: string,
      input: Mutation & { subject: SubjectInput },
    ) {
      const value = mutationSchema
        .extend({ subject: subjectInputSchema })
        .parse(input);
      return mutate(productionId, value, "addSubject", async (p) => {
        p.subjects.push({ ...value.subject, artifacts: [] });
        return {};
      });
    },
    async addArtifact(
      productionId: string,
      input: Mutation & {
        subjectId: string;
        artifactId: string;
        kind: ArtifactKind;
      },
    ) {
      const value = mutationSchema
        .extend({ subjectId: id, artifactId: id, kind: artifactKind })
        .parse(input);
      return mutate(productionId, value, "addArtifact", async (p) => {
        const subject = p.subjects.find((v) => v.id === value.subjectId);
        if (!subject) throw notFound();
        subject.artifacts.push({
          id: value.artifactId,
          kind: value.kind,
          currentRevisionId: null,
          acceptedRevisionId: null,
        });
        return {};
      });
    },
    async appendRevision(productionId: string, input: AppendInput) {
      const value = appendInputSchema.parse(input);
      return mutate(productionId, value, "appendRevision", async (p, s) => {
        const { subject, artifact } = resolveArtifact(p, value.artifactId);
        if (artifact.kind !== value.content.kind)
          throw invalid("Content kind differs from artifact responsibility.");
        if (
          !unique(value.sources.map((v) => v.artifactId)) ||
          !unique(value.assets.map((v) => v.assetId))
        )
          throw invalid("Duplicate source or asset identity.");
        const sourceRows: RevisionDocument[] = [];
        for (const source of value.sources) {
          const row = await revision(p, source.revisionId, s);
          if (
            row.artifactId !== source.artifactId ||
            row.contentHash !== source.sha256
          )
            throw invalid("Source identity or hash mismatch.");
          sourceRows.push(row);
        }
        validateContent(p, value, sourceRows);
        const prior = artifact.currentRevisionId
          ? await revision(p, artifact.currentRevisionId, s)
          : null;
        if (prior && prior.artifactId !== artifact.id)
          throw conflict("Invalid current revision pointer.");
        const ordinal =
          (
            await revisions
              .find(
                { productionId: p._id, artifactId: artifact.id },
                { session: s },
              )
              .sort({ ordinal: -1 })
              .limit(1)
              .next()
          )?.ordinal ?? 0;
        const contentHash = fingerprint({
          hashVersion: 1,
          productionId: p._id,
          subjectId: subject.id,
          artifactId: artifact.id,
          content: value.content,
          sources: value.sources,
          assets: value.assets,
        });
        const row = revisionDocumentSchema.parse({
          _id: randomUUID(),
          documentVersion: 1,
          ownerId: actor.uid,
          productionId: p._id,
          artifactId: artifact.id,
          subjectId: subject.id,
          kind: artifact.kind,
          ordinal: ordinal + 1,
          content: value.content,
          sources: value.sources,
          assets: value.assets,
          provenance: value.provenance,
          contentHash,
          createdAt: now(),
        });
        bound(row, limits.revisionBytes);
        await revisions.insertOne(row, { session: s });
        artifact.currentRevisionId = row._id;
        return { revisionId: row._id, ordinal: row.ordinal };
      });
    },
  };
  async function mutate(
    productionId: string,
    value: Mutation,
    method: string,
    effect: (
      p: ProductionDocument,
      s: ClientSession,
    ) => Promise<Partial<WriteResult>>,
  ) {
    return transaction(async (s) => {
      const p = await production(productionId, s);
      return write(
        "production:" + p._id,
        value.key,
        { method, value },
        s,
        async () => {
          fenced(p, value);
          const admittedUntil = p.mutationLease!.expiresAt;
          const extra = await effect(p, s);
          if (admittedUntil <= now())
            throw conflict("Mutation lease expired before persistence.");
          p.version++;
          p.updatedAt = now();
          await save(p, value.expectedVersion, s);
          return { id: p._id, version: p.version, ...extra };
        },
      );
    });
  }
  function validateContent(
    p: ProductionDocument,
    value: AppendInput,
    sourceRows: RevisionDocument[],
  ) {
    const content = value.content;
    const hasSubject = (identity: string, kind: SubjectInput["kind"]) =>
      p.subjects.some((s) => s.id === identity && s.kind === kind);
    const entities = (characters: string[], locations: string[]) => {
      if (
        characters.some((v) => !hasSubject(v, "character")) ||
        locations.some((v) => !hasSubject(v, "location"))
      )
        throw invalid("Unknown or incompatible content subject.");
    };
    if (content.kind === "roster")
      entities(content.characterIds, content.locationIds);
    if (content.kind === "manuscript")
      for (const unit of content.units)
        entities(unit.characterIds, unit.locationIds);
    if (content.kind === "page-plan") {
      if (content.panels.length > p.creativeConfigSnapshot.maxPanelsPerPage)
        throw invalid("Panel count exceeds package.");
      const units = new Set(
        sourceRows.flatMap((r) =>
          r.content.kind === "manuscript"
            ? r.content.units.map((u) => u.id)
            : [],
        ),
      );
      for (const panel of content.panels) {
        entities(panel.characterIds, panel.locationIds);
        if (panel.manuscriptUnitIds.some((v) => !units.has(v)))
          throw invalid(
            "Panel refers to a unit outside its source manuscript.",
          );
        for (const lettering of panel.lettering)
          if (
            lettering.speakerId &&
            !panel.characterIds.includes(lettering.speakerId)
          )
            throw invalid("Speaker must be a character in this panel.");
      }
    }
    if (content.kind === "reference" || content.kind === "page-image") {
      if (
        !value.assets.some(
          (a) =>
            a.assetId === content.asset.assetId &&
            a.sha256 === content.asset.sha256,
        )
      )
        throw invalid("Content asset must match an explicit asset reference.");
    }
    if (content.kind === "book-manifest") {
      // Existing validator needs only package page counts and language; preserve its typed contract.
      const pack = {
        ...p.creativeConfigSnapshot,
        schemaVersion: 1 as const,
        credits: 1,
        allowances: {
          story: { included: 0, extraCredits: null },
          style: { included: 0, extraCredits: null },
          reference: { included: 0, extraCredits: null },
          page: { included: 0, extraCredits: null },
        },
        entitlementDays: null,
      };
      validateManifestPackage(content, pack);
      if (
        content.language.tag !== p.brief.language.tag ||
        content.language.direction !== p.brief.language.direction
      )
        throw invalid("Manifest language differs from production.");
      for (const accepted of content.acceptedSources)
        if (
          !value.sources.some(
            (s) =>
              s.revisionId === accepted.revisionId &&
              s.artifactId === accepted.artifactId &&
              s.sha256 === accepted.sha256,
          )
        )
          throw invalid("Manifest source is absent from revision sources.");
      for (const entry of content.pages) {
        const page = p.subjects.find(
          (s) =>
            s.id === entry.subjectId &&
            s.kind === "page" &&
            s.pageRole === entry.role,
        );
        const image = sourceRows.find(
          (r) =>
            r._id === entry.revision.revisionId &&
            r.artifactId === entry.revision.artifactId &&
            r.contentHash === entry.revision.sha256,
        );
        if (
          !page ||
          !image ||
          image.subjectId !== page.id ||
          image.content.kind !== "page-image" ||
          image.content.asset.assetId !== entry.asset.assetId ||
          image.content.asset.sha256 !== entry.asset.sha256 ||
          !value.assets.some(
            (a) =>
              a.assetId === entry.asset.assetId &&
              a.sha256 === entry.asset.sha256,
          )
        )
          throw invalid(
            "Manifest page does not match its source image and asset.",
          );
      }
    }
  }
}
