import "server-only";
import { defineServerExtension } from "../../lib/server/extensions";
import { createBookletIndexes } from "../../lib/server/booklets/repository";
import { createBookletServiceIndexes } from "../../lib/server/booklets/lifecycle";
import { createBookletMediaIndexes } from "../../lib/server/booklets/media";
import { bookletDomain } from "./domain";
async function indexes(db: Parameters<typeof createBookletIndexes>[0]) {
  await createBookletIndexes(db);
  await createBookletServiceIndexes(db);
  await createBookletMediaIndexes(db);
}
export const bookletsServerExtension = defineServerExtension({
  module: "booklets",
  indexes,
  domainAdapters: [bookletDomain],
  migrations: [
    {
      id: "booklets:0001-repositories",
      description:
        "Create owned booklet repository indexes without converting existing records.",
      run: createBookletIndexes,
    },
    {
      id: "booklets:0002-lifecycle-media",
      description:
        "Add booklet lifecycle receipts and immutable private media indexes.",
      run: indexes,
    },
  ],
});
