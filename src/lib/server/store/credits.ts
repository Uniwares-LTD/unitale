import { enqueueNotification } from "../notifications";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { MongoServerError, type ClientSession, type Db } from "mongodb";
import { AppError } from "../../auth-policy";
import type { CreditAccount } from "../../contracts/credits";
import {
  accessPermitsSession,
  accessTransaction,
  type AccountAccess,
  type AuditEntry,
} from "./access";
import type {
  CreditActor,
  CreditLot,
  CreditOperation,
  CreditResult,
  LedgerEntry,
  Reservation,
  Wallet,
} from "./credit-types";

import { readSettings } from "../settings";
const wallets = (db: Db) => db.collection<Wallet>("creditWallets");
const lots = (db: Db) => db.collection<CreditLot>("creditLots");
const holds = (db: Db) => db.collection<Reservation>("creditReservations");
const operations = (db: Db) =>
  db.collection<CreditOperation>("creditOperations");
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bad = (message: string) => new AppError("INVALID_CREDIT_INPUT", message);
function identifier(value: string, max = 128) {
  if (typeof value !== "string" || !value.length || value.length > max)
    throw bad("A valid credit reference is required.");
  return value;
}
function quantity(value: number, zero = false) {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1))
    throw bad("Credits must be whole, positive numbers.");
  return value;
}
function date(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw bad("A valid credit date is required.");
  return value;
}
function reason(value: string = "") {
  if (typeof value !== "string" || value.length > 300)
    throw bad("Use at most 300 characters for the reason.");
  return value.trim();
}
function view(wallet: Wallet): CreditResult {
  return {
    balance: wallet.balance,
    available: wallet.debt ? 0 : wallet.balance - wallet.reserved,
    reserved: wallet.reserved,
    debt: wallet.debt,
  };
}

type Context = {
  db: Db;
  session: ClientSession;
  wallet: Wallet;
  now: Date;
  operationId: string;
  actorUid?: string;
  reason?: string;
};
type MutationOptions = {
  now?: Date;
  actor?: CreditActor;
  admin?: CreditActor;
  reason?: string;
  persist?: (session: ClientSession, result: CreditResult) => Promise<void>;
};

// Initialize outside transactions: concurrent first-use upserts can throw a
// non-retryable duplicate-key error on newer MongoDB versions. Zero is not a grant.
async function initialize(db: Db, uid: string, actor?: CreditActor) {
  identifier(uid);
  try {
    await wallets(db).updateOne(
      { _id: uid },
      {
        $setOnInsert: {
          balance: 0,
          reserved: 0,
          debt: 0,
          sequence: 0,
          revision: 0,
          updatedAt: new Date(0),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
  }
  if (actor) {
    if (actor.uid !== uid || !Number.isFinite(actor.authTime))
      throw new AppError("FORBIDDEN", "This wallet is not accessible.", 403);
    try {
      await db.collection<AccountAccess>("accountAccess").updateOne(
        { _id: uid },
        {
          $setOnInsert: {
            role: "member",
            status: "active",
            notBefore: 0,
            revision: 0,
            updatedAt: new Date(0),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000)
        throw error;
    }
  }
}

async function append(
  ctx: Context,
  kind: LedgerEntry["kind"],
  delta: number,
  reservedDelta: number,
  reference: string,
) {
  const w = ctx.wallet;
  w.sequence++;
  for (const number of [
    w.balance,
    w.reserved,
    w.debt,
    w.sequence,
    delta,
    reservedDelta,
  ])
    if (!Number.isSafeInteger(number))
      throw bad("Credit balance exceeds the supported range.");
  if (
    w.reserved < 0 ||
    w.debt < 0 ||
    (w.debt
      ? w.balance !== -w.debt || w.reserved !== 0
      : w.balance < w.reserved)
  )
    throw new AppError(
      "CREDIT_INVARIANT",
      "Credit accounting is temporarily unavailable.",
      503,
    );
  const ledgerId = randomUUID();
  await ctx.db.collection<LedgerEntry>("creditLedger").insertOne(
    {
      _id: ledgerId,
      uid: w._id,
      sequence: w.sequence,
      kind,
      delta,
      reservedDelta,
      balanceAfter: w.balance,
      reservedAfter: w.reserved,
      debtAfter: w.debt,
      reference,
      operationId: ctx.operationId,
      ...(ctx.actorUid ? { actorUid: ctx.actorUid } : {}),
      ...(ctx.reason ? { reason: ctx.reason } : {}),
      timestamp: ctx.now,
    },
    { session: ctx.session },
  );
  return ledgerId;
}

async function releaseHold(
  ctx: Context,
  hold: Reservation,
  status: "released" | "expired" | "cancelled",
) {
  for (const allocation of hold.allocations) {
    const result = await lots(ctx.db).updateOne(
      {
        _id: allocation.lotId,
        uid: ctx.wallet._id,
        reserved: { $gte: allocation.amount },
      },
      { $inc: { reserved: -allocation.amount } },
      { session: ctx.session },
    );
    if (result.matchedCount !== 1)
      throw new AppError(
        "CREDIT_INVARIANT",
        "Credit accounting is temporarily unavailable.",
        503,
      );
  }
  ctx.wallet.reserved -= hold.amount;
  await holds(ctx.db).updateOne(
    { _id: hold._id },
    { $set: { status } },
    { session: ctx.session },
  );
  await append(
    ctx,
    status === "expired"
      ? "hold-expired"
      : status === "cancelled"
        ? "hold-cancelled"
        : "release",
    0,
    -hold.amount,
    hold._id,
  );
}

async function expireLots(ctx: Context) {
  const cursor = lots(ctx.db)
    .find(
      {
        uid: ctx.wallet._id,
        expiresAt: { $ne: null, $lte: ctx.now },
        remaining: { $gt: 0 },
      },
      { session: ctx.session },
    )
    .sort({ expiresAt: 1, createdAt: 1, _id: 1 });
  for await (const lot of cursor) {
    const expired = lot.remaining - lot.reserved;
    if (!expired) continue; // A valid hold can commit after the grant expires.
    await lots(ctx.db).updateOne(
      { _id: lot._id },
      { $inc: { remaining: -expired } },
      { session: ctx.session },
    );
    ctx.wallet.balance -= expired;
    await append(ctx, "expiry", -expired, 0, lot._id);
  }
}

async function settle(ctx: Context) {
  const cursor = holds(ctx.db)
    .find(
      {
        uid: ctx.wallet._id,
        status: "active",
        expiresAt: { $lte: ctx.now },
        managedJobId: { $exists: false },
      },
      { session: ctx.session },
    )
    .sort({ expiresAt: 1, _id: 1 });
  for await (const hold of cursor) await releaseHold(ctx, hold, "expired");
  await expireLots(ctx);
}

async function transaction<T extends CreditResult>(
  db: Db,
  uid: string,
  key: string | null,
  request: unknown,
  action: (ctx: Context) => Promise<T>,
  options: MutationOptions = {},
) {
  if (key !== null && !/^[A-Za-z0-9_:-]{1,128}$/.test(key))
    throw bad("Provide a valid idempotency key.");
  if (options.admin && options.actor) throw bad("Choose one credit actor.");
  await initialize(db, uid, options.actor);
  const operationId = key === null ? randomUUID() : hash([uid, key]);
  const fingerprint = hash(request);
  const run = async (session: ClientSession) => {
    if (options.actor) {
      // Write the access document as well as read it so suspension racing a
      // wallet mutation conflicts and retries with fresh authorization.
      const access = await db
        .collection<AccountAccess>("accountAccess")
        .findOneAndUpdate(
          { _id: uid },
          { $inc: { revision: 1 } },
          { session, returnDocument: "after" },
        );
      if (!access || !accessPermitsSession(access, options.actor.authTime))
        throw new AppError("FORBIDDEN", "This wallet is not accessible.", 403);
    }
    const wallet = await wallets(db).findOneAndUpdate(
      { _id: uid },
      { $inc: { revision: 1 } },
      { session, returnDocument: "after" },
    );
    if (!wallet)
      throw new AppError(
        "CREDIT_INVARIANT",
        "Credit accounting is temporarily unavailable.",
        503,
      );
    if (key !== null) {
      const prior = await operations(db).findOne(
        { _id: operationId },
        { session },
      );
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new AppError(
            "IDEMPOTENCY_CONFLICT",
            "This request key was already used for a different operation.",
            409,
          );
        await options.persist?.(session, prior.result);
        return prior.result as T;
      }
    }
    // Recompute on transaction retries; a hold cannot outlive its deadline while
    // waiting on a conflicting write. Injected clocks are only used by store tests.
    const now = date(options.now ?? new Date());
    const ctx: Context = {
      db,
      session,
      wallet,
      now,
      operationId,
      actorUid: options.admin?.uid ?? options.actor?.uid,
      reason: options.reason,
    };
    await settle(ctx);
    const result = await action(ctx);
    await options.persist?.(session, result);
    wallet.updatedAt = now;
    await wallets(db).replaceOne({ _id: uid }, wallet, { session });
    if (key !== null)
      await operations(db).insertOne(
        { _id: operationId, uid, fingerprint, result, timestamp: now },
        { session },
      );
    return result;
  };
  if (options.admin)
    return accessTransaction(
      db,
      options.admin.uid,
      run,
      options.admin.authTime,
    );
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => run(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } finally {
    await session.endSession();
  }
}

// FIFO within each expiry date; perpetual lots always follow expiring grants.
async function eligibleLots(ctx: Context) {
  const available = await lots(ctx.db)
    .find(
      { uid: ctx.wallet._id, remaining: { $gt: 0 } },
      { session: ctx.session },
    )
    .toArray();
  return available
    .filter(
      (lot) =>
        lot.remaining > lot.reserved &&
        (!lot.expiresAt || lot.expiresAt > ctx.now),
    )
    .sort(
      (a, b) =>
        (a.expiresAt?.getTime() ?? Infinity) -
          (b.expiresAt?.getTime() ?? Infinity) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a._id.localeCompare(b._id),
    );
}

async function consumeAvailable(
  ctx: Context,
  amount: number,
  preferredId?: string,
) {
  const available = await eligibleLots(ctx);
  if (preferredId)
    available.sort(
      (a, b) => Number(b._id === preferredId) - Number(a._id === preferredId),
    );
  let left = amount;
  for (const lot of available) {
    const take = Math.min(left, lot.remaining - lot.reserved);
    if (!take) break;
    await lots(ctx.db).updateOne(
      { _id: lot._id },
      { $inc: { remaining: -take } },
      { session: ctx.session },
    );
    left -= take;
  }
  return left;
}
function requireFunds(wallet: Wallet, amount: number) {
  if (wallet.debt)
    throw new AppError(
      "CREDIT_DEBT",
      "Cover the outstanding credit debt before spending.",
      409,
    );
  if (wallet.balance - wallet.reserved < amount)
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "There are not enough available credits.",
      409,
    );
}

export async function readWallet(
  db: Db,
  uid: string,
  options: Pick<MutationOptions, "actor" | "now" | "persist"> = {},
) {
  return transaction(
    db,
    uid,
    null,
    null,
    async (ctx) => view(ctx.wallet),
    options,
  );
}

export async function readCreditAccount(
  db: Db,
  uid: string,
  before?: number,
  options: Pick<MutationOptions, "actor" | "admin" | "now"> = {},
): Promise<CreditAccount> {
  if (before !== undefined) quantity(before);
  return transaction(
    db,
    uid,
    null,
    null,
    async (ctx) => {
      const entries = await db
        .collection<LedgerEntry>("creditLedger")
        .find(
          {
            uid,
            ...(before === undefined ? {} : { sequence: { $lt: before } }),
          },
          { session: ctx.session },
        )
        .sort({ sequence: -1 })
        .limit(26)
        .toArray();
      const upcoming = await lots(db)
        .find(
          {
            uid,
            expiresAt: { $gt: ctx.now },
            $expr: { $gt: ["$remaining", "$reserved"] },
          },
          { session: ctx.session },
        )
        .sort({ expiresAt: 1, createdAt: 1, _id: 1 })
        .limit(10)
        .toArray();
      const activeHolds = await holds(db)
        .find(
          {
            uid,
            status: "active",
            $or: [
              { expiresAt: { $gt: ctx.now } },
              { managedJobId: { $exists: true } },
            ],
          },
          { session: ctx.session },
        )
        .sort({ expiresAt: 1, _id: 1 })
        .limit(25)
        .toArray();
      return {
        ...view(ctx.wallet),
        history: entries.slice(0, 25).map((item) => ({
          id: item._id,
          sequence: item.sequence,
          kind: item.kind,
          delta: item.delta,
          reservedDelta: item.reservedDelta,
          balanceAfter: item.balanceAfter,
          debtAfter: item.debtAfter,
          timestamp: item.timestamp.toISOString(),
          ...(item.reason ? { reason: item.reason } : {}),
        })),
        nextBefore: entries.length > 25 ? entries[24].sequence : null,
        upcoming: upcoming.map((item) => ({
          credits: item.remaining - item.reserved,
          expiresAt: item.expiresAt!.toISOString(),
        })),
        holds: activeHolds.map((item) => ({
          id: item._id,
          credits: item.amount,
          expiresAt: item.expiresAt.toISOString(),
          ...(item.managedJobId ? { managedJobId: item.managedJobId } : {}),
        })),
      };
    },
    options,
  );
}

type Grant = {
  amount: number;
  source: CreditLot["source"];
  reference: string;
  expiresAt?: Date | null;
};
async function grant(ctx: Context, input: Grant) {
  const expiresAt =
    input.source === "purchase"
      ? null
      : input.expiresAt === undefined
        ? new Date(
            ctx.now.getTime() +
              (await readSettings(ctx.db)).settings.credits.promotionDays *
                86400000,
          )
        : input.expiresAt;
  if (expiresAt && expiresAt <= ctx.now)
    throw bad("Grant expiry must be in the future.");
  if (
    input.source === "purchase" &&
    (await lots(ctx.db).findOne(
      { source: "purchase", reference: input.reference },
      { session: ctx.session },
    ))
  )
    throw new AppError(
      "PURCHASE_ALREADY_CREDITED",
      "This purchase has already been credited.",
      409,
    );
  const debtPaid = Math.min(input.amount, ctx.wallet.debt);
  const lot: CreditLot = {
    _id:
      input.source === "purchase"
        ? hash(["purchase", input.reference])
        : randomUUID(),
    uid: ctx.wallet._id,
    source: input.source,
    reference: input.reference,
    originalCredits: input.amount,
    reversedCredits: 0,
    remaining: input.amount - debtPaid,
    reserved: 0,
    expiresAt,
    createdAt: ctx.now,
  };
  ctx.wallet.debt -= debtPaid;
  ctx.wallet.balance += input.amount;
  await lots(ctx.db).insertOne(lot, { session: ctx.session });
  await append(ctx, "grant", input.amount, 0, lot._id);
  return { ...view(ctx.wallet), lotId: lot._id };
}
function validateGrant(input: Grant) {
  quantity(input.amount);
  identifier(input.reference, 256);
  if (!["promotion", "purchase"].includes(input.source))
    throw bad("Unknown credit source.");
  if (input.expiresAt) date(input.expiresAt);
  if (input.source === "purchase" && input.expiresAt != null)
    throw bad("Purchased credits cannot expire.");
}
export async function grantCredits(
  db: Db,
  uid: string,
  key: string,
  input: Grant,
  options: Pick<MutationOptions, "now" | "actor" | "persist"> = {},
) {
  validateGrant(input);
  return transaction(
    db,
    uid,
    key,
    [
      "grant",
      input.amount,
      input.source,
      input.reference,
      input.expiresAt === undefined ? "default" : input.expiresAt,
    ],
    async (ctx) => {
      const result = await grant(ctx, input);
      if (input.source === "purchase")
        await enqueueNotification(
          db,
          uid,
          `purchase:${key}`,
          "credit-purchase",
          { amount: input.amount },
          ctx.session,
          ctx.now,
        );
      return result;
    },
    options,
  );
}

export async function adjustCredits(
  db: Db,
  admin: CreditActor,
  uid: string,
  key: string,
  input: {
    amount: number;
    direction: "grant" | "deduct";
    reason?: string;
    expiresAt?: Date | null;
  },
  options: Pick<MutationOptions, "now" | "persist"> = {},
) {
  quantity(input.amount);
  const explanation = reason(input.reason);
  if (!["grant", "deduct"].includes(input.direction))
    throw bad("Unknown credit adjustment.");
  const grantInput: Grant = {
    amount: input.amount,
    source: "promotion",
    reference: key,
    expiresAt: input.expiresAt,
  };
  validateGrant(grantInput);
  return transaction(
    db,
    uid,
    key,
    [
      "adjust",
      admin.uid,
      input.amount,
      input.direction,
      explanation,
      input.expiresAt === undefined ? "default" : input.expiresAt,
    ],
    async (ctx) => {
      const before = view(ctx.wallet);
      let result: CreditResult;
      if (input.direction === "grant") result = await grant(ctx, grantInput);
      else {
        requireFunds(ctx.wallet, input.amount);
        if (await consumeAvailable(ctx, input.amount))
          throw new AppError(
            "CREDIT_INVARIANT",
            "Credit accounting is temporarily unavailable.",
            503,
          );
        ctx.wallet.balance -= input.amount;
        await append(ctx, "deduction", -input.amount, 0, ctx.operationId);
        result = view(ctx.wallet);
      }
      await db.collection<AuditEntry>("auditEvents").insertOne(
        {
          _id: randomUUID(),
          event: "credit-adjustment",
          actorUid: admin.uid,
          targetUid: uid,
          reason: explanation,
          timestamp: ctx.now,
          before: { balance: before.balance, debt: before.debt },
          after: { balance: result.balance, debt: result.debt },
        },
        { session: ctx.session },
      );
      return result;
    },
    { ...options, admin, reason: explanation },
  );
}

// Trusted product services use this for upfront charges, with atomic domain persistence.
// Zero supports included/free revision requests without creating a debit.
export async function spendCredits(
  db: Db,
  actor: CreditActor,
  key: string,
  amount: number,
  reference: string,
  options: Pick<MutationOptions, "now"> & {
    persist: NonNullable<MutationOptions["persist"]>;
  },
) {
  quantity(amount, true);
  identifier(reference);
  return transaction(
    db,
    actor.uid,
    key,
    ["spend", amount, reference],
    async (ctx) => {
      if (!amount) return view(ctx.wallet);
      requireFunds(ctx.wallet, amount);
      if (await consumeAvailable(ctx, amount))
        throw bad("Credit lot balance is inconsistent.");
      ctx.wallet.balance -= amount;
      const ledgerId = await append(ctx, "deduction", -amount, 0, reference);
      return { ...view(ctx.wallet), ledgerId };
    },
    { ...options, actor },
  );
}

export async function reserveCredits(
  db: Db,
  actor: CreditActor,
  key: string,
  amount: number,
  options: Pick<MutationOptions, "now" | "persist"> & {
    managedJobId?: string;
  } = {},
) {
  quantity(amount);
  if (options.managedJobId) {
    identifier(options.managedJobId);
    if (!options.persist)
      throw bad("Managed reservations require atomic persistence.");
  }
  return transaction(
    db,
    actor.uid,
    key,
    options.managedJobId
      ? ["reserve", amount, options.managedJobId]
      : ["reserve", amount],
    async (ctx) => {
      requireFunds(ctx.wallet, amount);
      let left = amount;
      const allocations: Reservation["allocations"] = [];
      for (const lot of await eligibleLots(ctx)) {
        const take = Math.min(left, lot.remaining - lot.reserved);
        if (!take) break;
        allocations.push({ lotId: lot._id, amount: take });
        await lots(db).updateOne(
          { _id: lot._id },
          { $inc: { reserved: take } },
          { session: ctx.session },
        );
        left -= take;
      }
      if (left)
        throw new AppError(
          "CREDIT_INVARIANT",
          "Credit accounting is temporarily unavailable.",
          503,
        );
      const hold: Reservation = {
        _id: randomUUID(),
        uid: actor.uid,
        amount,
        allocations,
        status: "active",
        createdAt: ctx.now,
        expiresAt: new Date(
          ctx.now.getTime() +
            (await readSettings(db)).settings.credits.holdMinutes * 60000,
        ),
        ...(options.managedJobId ? { managedJobId: options.managedJobId } : {}),
      };
      await holds(db).insertOne(hold, { session: ctx.session });
      ctx.wallet.reserved += amount;
      await append(ctx, "reserve", 0, amount, hold._id);
      return {
        ...view(ctx.wallet),
        reservationId: hold._id,
        expiresAt: hold.expiresAt.toISOString(),
        status: hold.status,
      };
    },
    { ...options, actor },
  );
}

export async function finishReservation(
  db: Db,
  actor: CreditActor,
  key: string,
  reservationId: string,
  mode: "commit" | "release",
  options: Pick<MutationOptions, "now"> = {},
) {
  return finishReservationInternal(
    db,
    actor,
    key,
    reservationId,
    mode,
    options,
  );
}

// Worker-only settlement of a previously authorized execution. The caller must
// fence its job and persist the terminal state in this same transaction.
export async function finishManagedReservation(
  db: Db,
  uid: string,
  key: string,
  reservationId: string,
  mode: "commit" | "release",
  options: Pick<MutationOptions, "now"> & {
    managedJobId: string;
    persist: NonNullable<MutationOptions["persist"]>;
    chargeAmount?: number;
  },
) {
  identifier(options.managedJobId);
  return finishReservationInternal(
    db,
    { uid, authTime: 0 },
    key,
    reservationId,
    mode,
    options,
  );
}

async function finishReservationInternal(
  db: Db,
  actor: CreditActor,
  key: string,
  reservationId: string,
  mode: "commit" | "release",
  options: Pick<MutationOptions, "now" | "persist"> & {
    managedJobId?: string;
    chargeAmount?: number;
  },
) {
  identifier(reservationId);
  if (options.chargeAmount !== undefined) {
    quantity(options.chargeAmount, true);
    if (!options.managedJobId || mode !== "commit")
      throw bad("Partial settlement requires a managed commit.");
  }
  if (!["commit", "release"].includes(mode))
    throw bad("Unknown reservation action.");
  return transaction(
    db,
    actor.uid,
    key,
    options.managedJobId
      ? [
          mode,
          reservationId,
          options.managedJobId,
          ...(options.chargeAmount === undefined ? [] : [options.chargeAmount]),
        ]
      : [mode, reservationId],
    async (ctx) => {
      const hold = await holds(db).findOne(
        { _id: reservationId, uid: actor.uid },
        { session: ctx.session },
      );
      if (!hold)
        throw new AppError(
          "RESERVATION_NOT_FOUND",
          "Credit reservation was not found.",
          404,
        );
      if (hold.managedJobId !== options.managedJobId)
        throw new AppError(
          "RESERVATION_MANAGED",
          "This reservation must be settled by its execution.",
          409,
        );
      const charge = options.chargeAmount ?? hold.amount;
      if (charge > hold.amount) throw bad("Charge exceeds reserved credits.");
      if (hold.status !== "active") {
        if (
          mode === "commit" &&
          hold.status === "committed" &&
          (hold.committedCredits ?? hold.amount) !== charge
        )
          throw bad("Reservation was committed for a different amount.");
        if (
          (mode === "commit" && hold.status !== "committed") ||
          (mode === "release" && hold.status === "committed")
        )
          throw new AppError(
            "RESERVATION_CLOSED",
            "This credit reservation is already closed.",
            409,
          );
        return { ...view(ctx.wallet), reservationId, status: hold.status };
      }
      if (mode === "release") {
        await releaseHold(ctx, hold, "released");
        await expireLots(ctx);
      } else {
        let remainingCharge = charge;
        for (const allocation of hold.allocations) {
          const consumed = Math.min(remainingCharge, allocation.amount);
          const result = await lots(db).updateOne(
            {
              _id: allocation.lotId,
              uid: actor.uid,
              remaining: { $gte: allocation.amount },
              reserved: { $gte: allocation.amount },
            },
            {
              $inc: {
                remaining: -consumed,
                reserved: -allocation.amount,
              },
            },
            { session: ctx.session },
          );
          if (result.matchedCount !== 1)
            throw new AppError(
              "CREDIT_INVARIANT",
              "Credit accounting is temporarily unavailable.",
              503,
            );
          remainingCharge -= consumed;
        }
        if (remainingCharge !== 0)
          throw bad("Invalid reservation allocations.");
        ctx.wallet.balance -= charge;
        ctx.wallet.reserved -= charge;
        await holds(db).updateOne(
          { _id: hold._id },
          { $set: { status: "committed", committedCredits: charge } },
          { session: ctx.session },
        );
        await append(ctx, "commit", -charge, -charge, hold._id);
        const unused = hold.amount - charge;
        if (unused) {
          ctx.wallet.reserved -= unused;
          await append(ctx, "release", 0, -unused, hold._id);
          // Released promotional funds may already have expired while held.
          await expireLots(ctx);
        }
      }
      return {
        ...view(ctx.wallet),
        reservationId,
        status: mode === "commit" ? "committed" : "released",
      };
    },
    { ...options, ...(options.managedJobId ? {} : { actor }) },
  );
}

// Trusted provider reconciliation passes its verified cumulative reversal target.
// Refund/dispute event ordering and money-to-credit rounding belong to billing.
export async function reversePurchase(
  db: Db,
  uid: string,
  key: string,
  reference: string,
  targetReversed: number,
  options: Pick<MutationOptions, "now" | "actor" | "persist"> = {},
) {
  identifier(reference, 256);
  quantity(targetReversed, true);
  return transaction(
    db,
    uid,
    key,
    ["reversal", reference, targetReversed],
    async (ctx) => {
      const purchase = await lots(db).findOne(
        { uid, source: "purchase", reference },
        { session: ctx.session },
      );
      if (!purchase)
        throw new AppError(
          "PURCHASE_NOT_FOUND",
          "Credited purchase was not found.",
          404,
        );
      if (targetReversed > purchase.originalCredits)
        throw bad("Reversal exceeds the original purchase.");
      const delta = targetReversed - purchase.reversedCredits;
      if (delta > 0) {
        // Only holds backed by the reversed lot need cancellation if that lot can
        // cover the reversal. If other funds/debt are needed, cancel all wallet holds.
        const cancelAll = delta > purchase.remaining;
        const active = holds(db).find(
          {
            uid,
            status: "active",
            ...(cancelAll ? {} : { "allocations.lotId": purchase._id }),
          },
          { session: ctx.session },
        );
        for await (const hold of active)
          await releaseHold(ctx, hold, "cancelled");
        await expireLots(ctx);
        const debt = await consumeAvailable(ctx, delta, purchase._id);
        ctx.wallet.balance -= delta;
        ctx.wallet.debt += debt;
        await append(ctx, "purchase-reversal", -delta, 0, purchase._id);
      } else if (delta < 0) {
        const restored = -delta;
        const debtPaid = Math.min(restored, ctx.wallet.debt);
        await lots(db).updateOne(
          { _id: purchase._id },
          { $inc: { remaining: restored - debtPaid } },
          { session: ctx.session },
        );
        ctx.wallet.debt -= debtPaid;
        ctx.wallet.balance += restored;
        await append(ctx, "purchase-restoration", restored, 0, purchase._id);
      }
      await lots(db).updateOne(
        { _id: purchase._id },
        { $set: { reversedCredits: targetReversed } },
        { session: ctx.session },
      );
      if (delta !== 0)
        await enqueueNotification(
          db,
          uid,
          `reversal:${key}`,
          "credit-reversal",
          { amount: targetReversed },
          ctx.session,
          ctx.now,
        );
      return { ...view(ctx.wallet), lotId: purchase._id };
    },
    options,
  );
}

export async function createCreditIndexes(db: Db) {
  await db
    .collection("creditLedger")
    .createIndex(
      { uid: 1, sequence: -1 },
      { unique: true, name: "unique_credit_sequence" },
    );
  await lots(db).createIndex(
    { source: 1, reference: 1 },
    {
      unique: true,
      partialFilterExpression: { source: "purchase" },
      name: "unique_credited_purchase",
    },
  );
  await lots(db).createIndex({ uid: 1, expiresAt: 1, createdAt: 1 });
  await holds(db).createIndex({ uid: 1, status: 1, expiresAt: 1 });
  // No ledger, lot, reservation or idempotency TTL: retries must remain safe.
}
