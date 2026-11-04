import "server-only";

export type Wallet = {
  _id: string;
  balance: number;
  reserved: number;
  debt: number;
  sequence: number;
  revision: number;
  updatedAt: Date;
};
export type CreditLot = {
  _id: string;
  uid: string;
  source: "promotion" | "purchase" | "subscription";
  expiredCredits?: number;
  appliedReversedCredits?: number;
  reference: string;
  originalCredits: number;
  reversedCredits: number;
  remaining: number;
  reserved: number;
  expiresAt: Date | null;
  createdAt: Date;
};
export type Reservation = {
  _id: string;
  uid: string;
  amount: number;
  allocations: { lotId: string; amount: number }[];
  status: "active" | "committed" | "released" | "expired" | "cancelled";
  createdAt: Date;
  expiresAt: Date;
  // Managed executions retain the hold until explicit, idempotent settlement.
  managedJobId?: string;
  committedCredits?: number;
};
export type LedgerEntry = {
  _id: string;
  uid: string;
  sequence: number;
  kind:
    | "grant"
    | "deduction"
    | "reserve"
    | "commit"
    | "release"
    | "hold-expired"
    | "hold-cancelled"
    | "expiry"
    | "purchase-reversal"
    | "purchase-restoration";
  delta: number;
  reservedDelta: number;
  balanceAfter: number;
  reservedAfter: number;
  debtAfter: number;
  reference: string;
  operationId: string;
  actorUid?: string;
  reason?: string;
  timestamp: Date;
};
export type WalletView = {
  balance: number;
  available: number;
  reserved: number;
  debt: number;
};
export type CreditResult = WalletView & {
  lotId?: string;
  ledgerId?: string;
  reservationId?: string;
  status?: Reservation["status"];
  expiresAt?: string;
};
export type CreditOperation = {
  _id: string;
  uid: string;
  fingerprint: string;
  result: CreditResult;
  timestamp: Date;
};
// Constructed only by trusted server callers from a verified Firebase session.
export type CreditActor = { uid: string; authTime: number };
