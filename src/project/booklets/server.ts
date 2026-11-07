import "server-only";
import { defineServerExtension } from "../../lib/server/extensions";
import { createBookletIndexes } from "../../lib/server/booklets/repository";
export const bookletsServerExtension = defineServerExtension({
  module: "booklets",
  indexes: createBookletIndexes,
  migrations: [
    {
      id: "booklets:0001-repositories",
      description:
        "Create owned booklet repository indexes without converting existing records.",
      run: createBookletIndexes,
    },
  ],
});
