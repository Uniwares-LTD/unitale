import "server-only";
import type { Db } from "mongodb";
import { z } from "zod";
import { purchaseOfferSchema } from "../../contracts/purchase-client";
export async function purchaseOffers(
  db: Db,
  channels: readonly string[],
  after?: string,
) {
  const cursor = after ? z.string().max(128).parse(after) : null;
  const rows = await db
    .collection("commerceCatalogs")
    .aggregate([
      {
        $match: {
          _id: { $regex: "^purchase:", ...(cursor ? { $gt: cursor } : {}) },
          publishedRevision: { $ne: null },
        },
      },
      { $sort: { _id: 1 } },
      {
        $lookup: {
          from: "commerceCatalogVersions",
          let: { id: "$_id", revision: "$publishedRevision" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$catalogId", "$$id"] },
                    { $eq: ["$revision", "$$revision"] },
                  ],
                },
              },
            },
            { $project: { definition: 1 } },
          ],
          as: "publication",
        },
      },
      { $unwind: "$publication" },
      {
        $match: {
          "publication.definition.terms.channel": { $in: [...channels] },
        },
      },
      { $limit: 51 },
      {
        $project: {
          id: "$_id",
          revision: "$publishedRevision",
          terms: "$publication.definition.terms",
        },
      },
    ])
    .toArray();
  return {
    offers: rows.slice(0, 50).map((v) => purchaseOfferSchema.parse(v)),
    next: rows.length > 50 ? String(rows[49].id) : null,
  };
}
