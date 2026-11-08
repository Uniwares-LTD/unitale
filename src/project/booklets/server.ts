import "server-only";
import { defineServerExtension } from "../../lib/server/extensions";
import { createBookletIndexes } from "../../lib/server/booklets/repository";
import { createBookletServiceIndexes } from "../../lib/server/booklets/lifecycle";
import { createBookletMediaIndexes } from "../../lib/server/booklets/media";
import { bookletDomain } from "./domain";
import { bookletMcpTools } from "../../lib/server/booklets/mcp-tools";
import { createBookletMcpIndexes } from "../../lib/server/booklets/mcp-transfers";
async function indexes(db: Parameters<typeof createBookletIndexes>[0]) {
  await createBookletIndexes(db);
  await createBookletServiceIndexes(db);
  await createBookletMediaIndexes(db);
}
export const bookletsServerExtension = defineServerExtension({
  module: "booklets",
  indexes: async (db) => {
    await indexes(db);
    await createBookletMcpIndexes(db);
  },
  domainAdapters: [bookletDomain],
  mcpTools: bookletMcpTools,
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
    {
      id: "booklets:0003-mcp",
      description:
        "Add bounded booklet MCP transfer and trusted publication binding indexes.",
      run: createBookletMcpIndexes,
    },
  ],
});
