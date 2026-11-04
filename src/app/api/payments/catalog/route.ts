import { z } from "zod";
import { endpoint, json, readText } from "@/lib/server/http";
import { database } from "@/lib/server/mongo";
import { getConfig } from "@/lib/server/config";
import {
  startCatalogPurchase,
  restoreCatalogPurchase,
  changeCatalogSubscription,
} from "@/lib/server/commerce/billing-service";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const inputSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("start"),
    checkoutId: id,
    offerId: id,
    offerRevision: z.number().int().positive(),
  }),
  z.strictObject({
    action: z.literal("restore"),
    checkoutId: id,
    providerId: z.string().min(1).max(4096),
  }),
  z.strictObject({
    action: z.literal("change"),
    checkoutId: id,
    key: id,
    kind: z.enum(["cancel", "plan-change"]),
    nextOffer: z
      .strictObject({ id, revision: z.number().int().positive() })
      .optional(),
  }),
]);
export async function POST(request: Request) {
  return endpoint(request, async (session) => {
    const input = inputSchema.parse(JSON.parse(await readText(request, 16384)));
    const actor = { uid: session.uid, authTime: session.auth_time };
    const db = database();
    if (input.action === "restore")
      return json(
        await restoreCatalogPurchase(
          db,
          actor,
          input.checkoutId,
          input.providerId,
        ),
      );
    if (input.action === "change")
      return json(
        await changeCatalogSubscription(
          db,
          actor,
          input,
          getConfig().server.origin,
        ),
      );
    const { action: _action, ...purchase } = input;
    void _action;
    return json(
      await startCatalogPurchase(
        db,
        actor,
        purchase,
        getConfig().server.origin,
      ),
    );
  });
}

export async function GET(request: Request) {
  return endpoint(request, async (session) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor && cursor.length > 1024)
      throw new Error("Invalid purchase cursor.");
    const after = cursor
      ? z
          .strictObject({ createdAt: z.iso.datetime(), checkoutId: id })
          .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")))
      : null;
    const rows = await database()
      .collection("billingIntents")
      .find(
        {
          uid: session.uid,
          ...(after
            ? {
                $or: [
                  { createdAt: { $lt: new Date(after.createdAt) } },
                  {
                    createdAt: new Date(after.createdAt),
                    checkoutId: { $lt: after.checkoutId },
                  },
                ],
              }
            : {}),
        },
        {
          projection: {
            _id: 0,
            checkoutId: 1,
            state: 1,
            "terms.channel": 1,
            "terms.label": 1,
            "terms.provider": 1,
            "terms.credits": 1,
            periodEnd: 1,
            cancelAtPeriodEnd: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1, checkoutId: -1 })
      .limit(101)
      .toArray();
    const last = rows[99];
    return json({
      purchases: rows.slice(0, 100),
      cursor:
        rows.length > 100
          ? Buffer.from(
              JSON.stringify({
                createdAt: last.createdAt.toISOString(),
                checkoutId: last.checkoutId,
              }),
            ).toString("base64url")
          : null,
    });
  });
}
