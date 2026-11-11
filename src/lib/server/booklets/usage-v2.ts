import "server-only";
import type { Db, ClientSession } from "mongodb";
import type { AiJob, AiUsage } from "../ai/jobs";
import type { ProductionV2 } from "./documents-v2";
import { bookletConflict } from "./context";

// Native Dify decimals have at most 18 fractional digits. Keep money arithmetic
// exact; these are reported subtotals, not a guarantee of provider spending.
const scale = BigInt(10) ** BigInt(18);
function amount(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(18, "0"));
}
function decimal(value: bigint) {
  const fraction = (value % scale)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return (value / scale).toString() + (fraction ? "." + fraction : "");
}

export async function bookletNativeCostsV2(
  db: Db,
  production: ProductionV2,
  session?: ClientSession,
) {
  const jobs = await db
    .collection<AiJob>("aiJobs")
    .find(
      {
        uid: production.ownerId,
        "run.target.adapter": "booklet",
        "run.target.version": "2",
        "run.target.id": production._id,
      },
      { projection: { _id: 1 }, session },
    )
    .toArray();
  const totals = new Map<string, { summary: bigint | null; nodes: bigint }>();
  let unknownNativeRecords = 0,
    otherCurrencyRecords = 0;
  const currency =
    production.creativeConfigSnapshot.execution.spendingCeiling.currency;
  for await (const row of db.collection<AiUsage>("aiUsage").find(
    {
      uid: production.ownerId,
      jobId: { $in: jobs.map((job) => job._id) },
      scope: { $in: ["node", "execution"] },
    },
    { session, projection: { _id: 0, jobId: 1, scope: 1, cost: 1 } },
  )) {
    const current = totals.get(row.jobId) ?? {
      summary: null,
      nodes: BigInt(0),
    };
    totals.set(row.jobId, current);
    const parsed = row.cost ? amount(row.cost.amount) : null;
    if (parsed === null) {
      unknownNativeRecords++;
      continue;
    }
    if (row.cost!.currency !== currency) {
      otherCurrencyRecords++;
      continue;
    }
    if (row.scope === "execution") current.summary = parsed;
    else if (row.scope === "node") current.nodes += parsed;
  }
  let subtotal = BigInt(0);
  for (const total of totals.values())
    subtotal +=
      total.summary !== null && total.summary > total.nodes
        ? total.summary
        : total.nodes;
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined || digits > 18)
    throw bookletConflict("Unsupported currency precision.");
  const ceiling =
    BigInt(
      production.creativeConfigSnapshot.execution.spendingCeiling.amountMinor,
    ) *
    (scale / BigInt(10) ** BigInt(digits));
  return {
    currency,
    reportedSubtotal: decimal(subtotal),
    unknownNativeRecords,
    otherCurrencyRecords,
    overCeiling: subtotal >= ceiling,
    coverage: "native-run-reports" as const,
    // Nested providers/SDK retries can be absent even when every row has a price.
    complete: false,
  };
}
