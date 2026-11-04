import { createConsumptionIndexes } from "./commerce/orders";
import { createPromotionIndexes } from "./commerce/promotions";
import { createCatalogIndexes } from "./commerce/catalogs";
import { createMeasurementIndexes } from "./execution/measurements";
import "server-only";
import type { Migration } from "./migrations";
import { migrateDomainReferences } from "./domain-migration";
import type { Db } from "mongodb";

// Generates display variants for result images saved before they existed.
// Repeatable: assets that already have variants are skipped, and images that
// cannot be processed keep serving their originals.
async function backfillAssetVariants(db: Db) {
  const { ensureAssetVariants } = await import("./runs/media");
  // Only servable assets; deleted, deleting and staged records are skipped.
  for (const [collection, filter] of [
    ["runAssets", { status: "ready" }],
    ["productAssets", { state: "ready", "references.0": { $exists: true } }],
  ] as const) {
    const cursor = db
      .collection<Parameters<typeof ensureAssetVariants>[2]>(collection)
      .find({ ...filter, variants: { $exists: false } });
    for await (const asset of cursor)
      await ensureAssetVariants(db, collection, asset).catch(() => undefined);
  }
}

// Template-owned migrations, in order. Never edit or renumber an entry once
// released; add a new one. Owners other than "core" run only while that
// module is enabled.
export const coreMigrations: readonly Migration[] = [
  {
    id: "core:0001-commerce-execution-indexes",
    description: "Add opt-in commerce and execution evidence indexes.",
    async run(db) {
      await createCatalogIndexes(db);
      await createMeasurementIndexes(db);
    },
  },
  {
    id: "runs:0001-domain-references",
    description: "Add domain target references to Run jobs and applications.",
    run: migrateDomainReferences,
  },
  {
    id: "runs:0002-asset-variants",
    description: "Generate thumbnail and preview variants for result images.",
    run: backfillAssetVariants,
  },
  {
    id: "core:0002-consumption-promotions",
    description: "Add consumption order and promotion redemption indexes.",
    async run(db) {
      await createConsumptionIndexes(db);
      await createPromotionIndexes(db);
    },
  },
];
