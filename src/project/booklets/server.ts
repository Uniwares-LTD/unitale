import "server-only";
import { defineServerExtension } from "../../lib/server/extensions";
import { createBookletIndexes } from "../../lib/server/booklets/repository";
import { createBookletServiceIndexes } from "../../lib/server/booklets/lifecycle";
import { createBookletMediaIndexes } from "../../lib/server/booklets/media";
import { bookletDomain, bookletDomainV2 } from "./domain";
import { bookletMcpTools } from "../../lib/server/booklets/mcp-tools";
import { bookletMcpToolsV2 } from "../../lib/server/booklets/mcp-tools-v2";
import { createBookletMcpIndexes } from "../../lib/server/booklets/mcp-transfers";
import { createBookletV2Indexes } from "../../lib/server/booklets/repository-v2";
import { reconcileOneBookletWorkV2 } from "../../lib/server/booklets/reconcile-v2";
async function indexes(db: Parameters<typeof createBookletIndexes>[0]) {
  await createBookletIndexes(db);
  await createBookletServiceIndexes(db);
  await createBookletMediaIndexes(db);
}
export const bookletsServerExtension = defineServerExtension({
  module: "booklets",
  reconcile: reconcileOneBookletWorkV2,
  indexes: async (db) => {
    await indexes(db);
    await createBookletMcpIndexes(db);
    await createBookletV2Indexes(db);
  },
  domainAdapters: [bookletDomain, bookletDomainV2],
  mcpTools: [...bookletMcpTools, ...bookletMcpToolsV2],
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
    {
      id: "booklets:0004-manager-state",
      description:
        "Add v2 Manager work, assessment and acceptance indexes without converting records.",
      run: createBookletV2Indexes,
    },
  ],
});
