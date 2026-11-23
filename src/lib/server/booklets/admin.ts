import "server-only";
import { z } from "zod";
import { ObjectId, type Db, type ClientSession } from "mongodb";
import { fingerprint } from "../foundation/canonical";
import { AppError } from "../../auth-policy";
import { accessTransaction } from "../store/access";
import { requireModule } from "../modules";
import { bookletPolicyDefaultsSchema } from "./application";

type Actor = { uid: string; auth_time: number };
const retryDefaults = bookletPolicyDefaultsSchema.shape.retryDefaults;
const policies = (db: Db) => db.collection("bookletWorkflowPolicies");
function invalid() {
  return new AppError("INVALID_INPUT", "Check the submitted values.", 400);
}

/** Read-only binding identity, capacity summary and editable action-retry
 * defaults. Provider/suite/reviewer publication details are not returned. */
export async function bookletAdminView(db: Db, actor: Actor) {
  requireModule("booklets");
  return accessTransaction(
    db,
    actor.uid,
    async (session) => {
      const rows = await policies(db)
        .find(
          {},
          { session, sort: { profileId: 1, profileRevision: -1 }, limit: 50 },
        )
        .toArray();
      const orchestrators = await db
        .collection<{ _id: string; revision: number }>("orchestrators")
        .find(
          { _id: { $in: rows.map((r) => String(r.orchestratorId)) } },
          { session, projection: { revision: 1 } },
        )
        .toArray();
      const events = await db
        .collection("auditEvents")
        .find(
          { event: "booklet-action-retry-authorized" },
          { session, sort: { timestamp: -1 }, limit: 20 },
        )
        .toArray();
      return {
        policies: rows.map((row) => {
          const capacity = bookletPolicyDefaultsSchema.shape.capacity.safeParse(
            row.capacity,
          );
          const defaults = retryDefaults.safeParse(row.retryDefaults);
          const reviewer = z
            .object({ id: z.string(), revision: z.number() })
            .safeParse(row.reviewer);
          return {
            id: String(row._id),
            profileId: String(row.profileId),
            profileRevision: Number(row.profileRevision),
            orchestratorId: String(row.orchestratorId),
            configurationRevision: Number(row.configurationRevision),
            current:
              orchestrators.find((o) => o._id === String(row.orchestratorId))
                ?.revision === Number(row.configurationRevision),
            capacity: capacity.success
              ? {
                  maxStoryPages: capacity.data.maxStoryPages,
                  coverSupported: capacity.data.coverSupported,
                  maxCharacters: capacity.data.maxCharacters,
                  maxLocations: capacity.data.maxLocations,
                  languages: capacity.data.languages.map((l) => l.tag),
                }
              : null,
            retryDefaults: defaults.success ? defaults.data : null,
            // Raw stored state, so missing or malformed values can be repaired.
            retryDefaultsState: defaults.success
              ? ("valid" as const)
              : row.retryDefaults === undefined
                ? ("missing" as const)
                : ("invalid" as const),
            retryDefaultsVersion: storedVersion(row.retryDefaults),
            reviewer: reviewer.success
              ? { id: reviewer.data.id, revision: reviewer.data.revision }
              : null,
          };
        }),
        retryEvidence: events.map((event) => ({
          at:
            event.timestamp instanceof Date
              ? event.timestamp.toISOString()
              : null,
          productionId: String(event.productionId ?? ""),
          category: String(event.category ?? ""),
          retryOrdinal: Number(event.retryOrdinal ?? 0),
        })),
      };
    },
    actor.auth_time,
  );
}

export const bookletRetryDefaultsUpdateSchema = z.strictObject({
  // Row identity as listed by the view (ObjectId hex or a string _id).
  policyId: z.string().min(1).max(128),
  // Version of the stored value the administrator read (any state, including
  // missing or malformed); a concurrent edit conflicts.
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  next: retryDefaults,
});

/** Version of the raw stored value, independent of key order and validity. */
function storedVersion(value: unknown) {
  return fingerprint({ retryDefaults: value === undefined ? null : value });
}

async function policyRow(db: Db, policyId: string, session: ClientSession) {
  const ids: unknown[] = [policyId];
  if (/^[a-f0-9]{24}$/.test(policyId)) ids.push(new ObjectId(policyId));
  const rows = await policies(db)
    .find({ _id: { $in: ids as never[] } }, { session, limit: 2 })
    .toArray();
  if (rows.length !== 1)
    throw new AppError("NOT_FOUND", "Booklet binding not found.", 404);
  return rows[0];
}

/** Edits only retry defaults; new productions snapshot them, existing keep theirs. */
export async function updateBookletRetryDefaults(
  db: Db,
  actor: Actor,
  raw: unknown,
) {
  requireModule("booklets");
  const parsed = bookletRetryDefaultsUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid();
  const input = parsed.data;
  return accessTransaction(
    db,
    actor.uid,
    async (session) => {
      const row = await policyRow(db, input.policyId, session);
      if (storedVersion(row.retryDefaults) !== input.expectedVersion)
        throw new AppError(
          "CONFLICT",
          "These settings changed after you opened them. Reload and try again.",
          409,
        );
      // The transaction makes this read-compare-write atomic against other edits.
      await policies(db).updateOne(
        { _id: row._id },
        { $set: { retryDefaults: input.next } },
        { session },
      );
      const previous = retryDefaults.safeParse(row.retryDefaults);
      await db.collection("auditEvents").insertOne(
        {
          event: "booklet-retry-defaults-updated",
          actorUid: actor.uid,
          target: String(row._id),
          previous: previous.success
            ? previous.data
            : row.retryDefaults === undefined
              ? "missing"
              : "invalid",
          next: input.next,
          timestamp: new Date(),
        },
        { session },
      );
      return {
        policyId: String(row._id),
        retryDefaults: input.next,
        retryDefaultsVersion: storedVersion(input.next),
      };
    },
    actor.auth_time,
  );
}
