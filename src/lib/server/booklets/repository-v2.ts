import "server-only";
import { BSON, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  bookletContentV2Schema,
  bookletRetryPolicySchema,
  bookletSourceV2Schema,
} from "../../../project/booklets/contracts-v2";
import { assetIdentitySchema } from "../../../project/booklets/contracts";
import type { CreditActor } from "../store/credit-types";
import { fingerprint } from "../foundation/canonical";
import { bookletRepository } from "./repository";
import { bookletContext, bookletConflict, bookletMissing } from "./context";
import {
  id,
  mutationSchema,
  type Mutation,
  type ProductionDocument,
  subjectInputSchema,
  revisionDocumentSchema,
} from "./documents";
import {
  artifactKindV2Schema,
  productionV2Schema,
  revisionV2Schema,
  storedProductionSchema,
  type ProductionV2,
  type RevisionV2,
} from "./documents-v2";
import type { BookletAsset } from "./media";

type CreateInput = Parameters<
  ReturnType<typeof bookletRepository>["createProduction"]
>[0];
type Receipt = {
  _id: string;
  ownerId: string;
  productionId: string;
  scope: string;
  key: string;
  inputHash: string;
  result: {
    id: string;
    version: number;
    checkpointVersion?: number;
    fence?: number;
    revisionId?: string;
    ordinal?: number;
  };
  createdAt: Date;
};

// Explicit v2 entry point. Reuse v1 admission validation for newly created records
// inside the same transaction; no existing record is converted or exposed as v1.
export function bookletRepositoryV2(
  db: Db,
  actor: CreditActor,
  now = () => new Date(),
) {
  const base = bookletRepository(db, actor, { now });
  const context = bookletContext(db, actor, now);
  const productions = db.collection<ProductionV2>("bookletProductions");
  const mixedProductions = db.collection<ProductionV2 | ProductionDocument>(
    "bookletProductions",
  );
  const receipts = db.collection<Receipt>("bookletRepositoryWrites");
  const revisions = db.collection<RevisionV2>("bookletRevisions");
  async function owned(productionId: string, session: ClientSession) {
    const row = await productions.findOne(
      { _id: id.parse(productionId), ownerId: actor.uid },
      { session },
    );
    if (!row) throw bookletMissing();
    await base.getBook(row.bookletId);
    return productionV2Schema.parse(row);
  }
  function mutable(p: ProductionV2, expectedVersion: number) {
    if (
      p.version !== expectedVersion ||
      ["completed", "closed"].includes(p.lifecycleState) ||
      (p.expiresAt && p.expiresAt <= now())
    )
      throw bookletConflict("Production changed or is not mutable.");
  }
  function fenced(p: ProductionV2, value: Mutation) {
    mutable(p, value.expectedVersion);
    if (
      !p.mutationLease ||
      p.mutationLease.holderId !== value.holderId ||
      p.mutationLease.fence !== value.fence ||
      p.mutationLease.expiresAt <= now()
    )
      throw bookletConflict("Production mutation lease expired or changed.");
  }
  async function save(
    p: ProductionV2,
    previousVersion: number,
    session: ClientSession,
  ) {
    p.version = previousVersion + 1;
    p.updatedAt = now();
    productionV2Schema.parse(p);
    if (BSON.calculateObjectSize(p) > 1024 * 1024)
      throw bookletConflict("Production exceeds its storage limit.");
    const result = await productions.replaceOne(
      { _id: p._id, ownerId: actor.uid, version: previousVersion },
      p,
      { session },
    );
    if (result.modifiedCount !== 1)
      throw bookletConflict("Production changed.");
  }
  async function mutate(
    productionId: string,
    value: Mutation,
    method: string,
    input: unknown,
    effect: (
      p: ProductionV2,
      session: ClientSession,
    ) => void | Promise<void | { revisionId: string; ordinal: number }>,
  ) {
    return context.transaction(async (session) => {
      const p = await owned(productionId, session);
      const identity = fingerprint([
        actor.uid,
        "production-v2",
        p._id,
        value.key,
      ]);
      const inputHash = fingerprint({ method, input });
      const prior = await receipts.findOne({ _id: identity }, { session });
      if (prior) {
        if (prior.inputHash !== inputHash)
          throw bookletConflict("Changed idempotency payload.");
        return prior.result;
      }
      fenced(p, value);
      const details = await effect(p, session);
      await save(p, value.expectedVersion, session);
      const result = {
        ...details,
        id: p._id,
        version: p.version,
        checkpointVersion: p.checkpointVersion,
      };
      await receipts.insertOne(
        {
          _id: identity,
          ownerId: actor.uid,
          productionId: p._id,
          scope: "production-v2:" + p._id,
          key: value.key,
          inputHash,
          result,
          createdAt: now(),
        },
        { session },
      );
      return result;
    });
  }
  return {
    async createProduction(
      input: CreateInput,
      rawRetryPolicy: z.input<typeof bookletRetryPolicySchema> = {},
    ) {
      const retryPolicy = bookletRetryPolicySchema.parse(rawRetryPolicy);
      const creationHash = fingerprint(
        JSON.parse(JSON.stringify({ input, retryPolicy })),
      );
      return context.transaction(async (session) => {
        const existing = await productions.findOne(
          { _id: id.parse(input.id) },
          { session },
        );
        if (existing) {
          const p = await owned(input.id, session);
          if (p.creationHash !== creationHash)
            throw bookletConflict("Changed production creation payload.");
          return { id: p._id, version: p.version };
        }
        if (input.sourceProductionId) {
          const source = await mixedProductions.findOne(
            { _id: input.sourceProductionId, ownerId: actor.uid },
            { session },
          );
          if (
            !source ||
            source.bookletId !== input.bookletId ||
            source._id === input.id
          )
            throw bookletMissing();
          storedProductionSchema.parse(source);
          await base.getBook(source.bookletId);
        }
        // Source ownership was checked with the mixed reader above. V1 validation
        // supplies order/package/brief checks without interpreting a v2 predecessor.
        const { sourceProductionId, ...creation } = input;
        await base.createProduction(creation, session);
        const created = await productions.findOne(
          { _id: input.id, ownerId: actor.uid },
          { session },
        );
        if (!created) throw bookletMissing();
        const p = productionV2Schema.parse({
          ...created,
          documentVersion: 2,
          sourceProductionId: sourceProductionId ?? null,
          creationHash,
          retryPolicy,
          checkpointVersion: 0,
          checkpoint: null,
        });
        const result = await mixedProductions.replaceOne(
          { _id: p._id, ownerId: actor.uid, documentVersion: 1 },
          p,
          { session },
        );
        if (result.modifiedCount !== 1)
          throw bookletConflict("Production creation changed.");
        return { id: p._id, version: p.version };
      });
    },
    getProduction(productionId: string) {
      return context.transaction((session) => owned(productionId, session));
    },
    getRevision(productionId: string, revisionId: string) {
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const row = await revisions.findOne(
          {
            _id: id.parse(revisionId),
            ownerId: actor.uid,
            productionId: p._id,
          },
          { session },
        );
        if (!row) throw bookletMissing();
        const subject = p.subjects.find((s) => s.id === row.subjectId);
        if (
          !subject?.artifacts.some(
            (a) => a.id === row.artifactId && a.kind === row.kind,
          )
        )
          throw bookletConflict(
            "Revision identity differs from embedded index.",
          );
        return revisionV2Schema.parse(row);
      });
    },
    addSubject(
      productionId: string,
      input: Mutation & { subject: z.input<typeof subjectInputSchema> },
    ) {
      const value = mutationSchema
        .extend({ subject: subjectInputSchema })
        .parse(input);
      return mutate(productionId, value, "addSubject", value, (p) => {
        const limits = {
          book: 1,
          character: p.creativeConfigSnapshot.maxCharacters,
          location: p.creativeConfigSnapshot.maxLocations,
          "style-sample": p.creativeConfigSnapshot.styleSamples,
          page:
            p.creativeConfigSnapshot.storyPages +
            Number(p.creativeConfigSnapshot.includeCover),
        };
        if (
          p.subjects.filter((s) => s.kind === value.subject.kind).length >=
          limits[value.subject.kind]
        )
          throw bookletConflict("Subject capacity exceeded.");
        if (
          value.subject.pageRole === "cover" &&
          (!p.creativeConfigSnapshot.includeCover ||
            p.subjects.some((s) => s.pageRole === "cover"))
        )
          throw bookletConflict("Cover capacity exceeded.");
        if (
          value.subject.pageRole === "story" &&
          p.subjects.filter((s) => s.pageRole === "story").length >=
            p.creativeConfigSnapshot.storyPages
        )
          throw bookletConflict("Story page capacity exceeded.");
        p.subjects.push({ ...value.subject, artifacts: [] });
      });
    },
    addArtifact(
      productionId: string,
      input: Mutation & {
        subjectId: string;
        artifactId: string;
        kind: z.infer<typeof artifactKindV2Schema>;
      },
    ) {
      const value = mutationSchema
        .extend({ subjectId: id, artifactId: id, kind: artifactKindV2Schema })
        .parse(input);
      return mutate(productionId, value, "addArtifact", value, (p) => {
        const subject = p.subjects.find((s) => s.id === value.subjectId);
        if (!subject) throw bookletMissing();
        const kinds: Record<typeof subject.kind, readonly string[]> = {
          book: [
            "concept",
            "outline",
            "manuscript",
            "roster",
            "style",
            "book-layout",
            "book-manifest",
          ],
          character: ["description", "image-spec", "reference"],
          location: ["description", "image-spec", "reference"],
          "style-sample": ["image-spec", "reference"],
          page: ["page-spec", "page-image"],
        };
        if (!kinds[subject.kind].includes(value.kind))
          throw bookletConflict("Artifact responsibility mismatch.");
        subject.artifacts.push({
          id: value.artifactId,
          kind: value.kind,
          currentRevisionId: null,
          acceptedRevisionId: null,
        });
      });
    },
    appendRevision(
      productionId: string,
      input: Mutation & {
        artifactId: string;
        content: z.input<typeof bookletContentV2Schema>;
        sources: z.input<typeof bookletSourceV2Schema>[];
        assets: z.input<typeof assetIdentitySchema>[];
        provenance: z.input<typeof revisionDocumentSchema.shape.provenance>;
      },
    ) {
      const value = mutationSchema
        .extend({
          artifactId: id,
          content: bookletContentV2Schema,
          sources: z.array(bookletSourceV2Schema),
          assets: z.array(assetIdentitySchema),
          provenance: revisionDocumentSchema.shape.provenance,
        })
        .parse(input);
      return mutate(
        productionId,
        value,
        "appendRevision",
        value,
        async (p, session) => {
          // Active paid writes need the v2 work/entitlement guard added in 09.
          // Keep this repository-construction slice closed to admitted productions.
          if (p.lifecycleState !== "draft")
            throw bookletConflict(
              "Active v2 writes require workflow admission.",
            );
          const subject = p.subjects.find((s) =>
            s.artifacts.some((a) => a.id === value.artifactId),
          );
          const artifact = subject?.artifacts.find(
            (a) => a.id === value.artifactId,
          );
          if (!subject || !artifact) throw bookletMissing();
          if (artifact.kind !== value.content.kind)
            throw bookletConflict("Revision kind mismatch.");
          if (
            new Set(value.sources.map((s) => s.artifactId)).size !==
              value.sources.length ||
            new Set(value.assets.map((a) => a.assetId)).size !==
              value.assets.length
          )
            throw bookletConflict("Duplicate source or asset identity.");
          for (const source of value.sources) {
            const row = await revisions.findOne(
              {
                _id: source.revisionId,
                ownerId: actor.uid,
                productionId: p._id,
              },
              { session },
            );
            if (
              !row ||
              row.artifactId !== source.artifactId ||
              row.contentHash !== source.contentHash
            )
              throw bookletConflict("Source identity or hash mismatch.");
          }
          for (const asset of value.assets) {
            const row = await db
              .collection<BookletAsset>("bookletAssets")
              .findOne(
                {
                  _id: asset.assetId,
                  ownerId: actor.uid,
                  productionId: p._id,
                  sha256: asset.sha256,
                  state: "ready",
                  originalAssetId: null,
                },
                { session },
              );
            if (!row)
              throw bookletConflict("Original asset identity mismatch.");
          }
          if (
            value.content.kind === "reference" ||
            value.content.kind === "page-image"
          ) {
            const original = value.content.asset;
            if (
              !value.assets.some(
                (a) =>
                  a.assetId === original.assetId &&
                  a.sha256 === original.sha256,
              )
            )
              throw bookletConflict("Content original is not attached.");
          }
          if (
            (value.content.kind === "description" &&
              value.content.subjectKind !== subject.kind) ||
            (value.content.kind === "page-spec" &&
              value.content.pageId !== subject.id)
          )
            throw bookletConflict("Content subject identity mismatch.");
          const prior = await revisions
            .find(
              {
                ownerId: actor.uid,
                productionId: p._id,
                artifactId: artifact.id,
              },
              { session },
            )
            .sort({ ordinal: -1 })
            .limit(1)
            .next();
          const row = revisionV2Schema.parse({
            _id: randomUUID(),
            documentVersion: 2,
            ownerId: actor.uid,
            productionId: p._id,
            artifactId: artifact.id,
            subjectId: subject.id,
            kind: artifact.kind,
            ordinal: (prior?.ordinal ?? 0) + 1,
            content: value.content,
            sources: value.sources,
            assets: value.assets,
            provenance: value.provenance,
            contentHash: fingerprint(value.content),
            createdAt: now(),
          });
          if (BSON.calculateObjectSize(row) > 4 * 1024 * 1024)
            throw bookletConflict("Revision exceeds its storage limit.");
          await revisions.insertOne(row, { session });
          for (const asset of value.assets)
            await db
              .collection<BookletAsset>("bookletAssets")
              .updateOne(
                { _id: asset.assetId, ownerId: actor.uid, productionId: p._id },
                { $addToSet: { attachments: row._id } },
                { session },
              );
          artifact.currentRevisionId = row._id;
          return { revisionId: row._id, ordinal: row.ordinal };
        },
      );
    },
    async acquireLease(
      productionId: string,
      input: {
        key: string;
        holderId: string;
        expectedVersion: number;
        durationMs: number;
      },
    ) {
      const value = z
        .strictObject({
          key: id,
          holderId: id,
          expectedVersion: z.number().int().positive().safe(),
          durationMs: z.number().int().min(1000).max(300000),
        })
        .parse(input);
      return context.transaction(async (session) => {
        const p = await owned(productionId, session);
        const identity = fingerprint([
          actor.uid,
          "production-v2",
          p._id,
          value.key,
        ]);
        const inputHash = fingerprint({ method: "acquireLease", input: value });
        const prior = await receipts.findOne({ _id: identity }, { session });
        if (prior) {
          if (prior.inputHash !== inputHash)
            throw bookletConflict("Changed idempotency payload.");
          return prior.result;
        }
        mutable(p, value.expectedVersion);
        if (p.mutationLease && p.mutationLease.expiresAt > now())
          throw bookletConflict("Production already leased.");
        p.fenceCounter++;
        p.mutationLease = {
          holderId: value.holderId,
          fence: p.fenceCounter,
          expiresAt: new Date(now().getTime() + value.durationMs),
        };
        await save(p, value.expectedVersion, session);
        const result = { id: p._id, version: p.version, fence: p.fenceCounter };
        await receipts.insertOne(
          {
            _id: identity,
            ownerId: actor.uid,
            productionId: p._id,
            scope: "production-v2:" + p._id,
            key: value.key,
            inputHash,
            result,
            createdAt: now(),
          },
          { session },
        );
        return result;
      });
    },
    checkpoint(
      productionId: string,
      input: Mutation & { expectedCheckpointVersion: number; state: unknown },
    ) {
      const value = mutationSchema
        .extend({
          expectedCheckpointVersion: z.number().int().nonnegative().safe(),
          state: z.json(),
        })
        .parse(input);
      return mutate(productionId, value, "checkpoint", value, (p) => {
        if (p.checkpointVersion !== value.expectedCheckpointVersion)
          throw bookletConflict("Checkpoint changed.");
        p.checkpoint = value.state;
        p.checkpointVersion++;
      });
    },
    releaseLease(productionId: string, input: Mutation) {
      const value = mutationSchema.parse(input);
      return mutate(productionId, value, "releaseLease", value, (p) => {
        p.mutationLease = null;
      });
    },
  };
}
