import "server-only";
import type { Db } from "mongodb";

export const defaultBookletPackageId = "default-package";

export function bookletSettings(db: Db) {
  return db.collection<{ _id: string; catalogId: string; updatedAt: Date }>(
    "bookletSettings",
  );
}

export async function readDefaultBookletPackage(db: Db) {
  const row = await bookletSettings(db).findOne({
    _id: defaultBookletPackageId,
  });
  return row?.catalogId ?? null;
}
