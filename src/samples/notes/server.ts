// Sample: notes. Server registration, listed in src/project/server.ts.
import "server-only";
import { z } from "zod";
import { defineServerExtension } from "@/lib/server/extensions";
import type { RegisteredTool } from "@/lib/server/mcp/tools";
import { noteInputSchema } from "./contract";
import { createNoteIndexes, defaultPinned } from "./store";

// MCP service credentials never identify an account, so the sample tool only
// validates a draft; it cannot read or write anyone's notes.
const validateDraft: RegisteredTool = {
  name: "validate_note_draft_v1",
  description:
    "Validate and normalize a note draft against the sample notes limits. Reads and stores nothing.",
  permission: "notes:read",
  input: z.strictObject({
    title: z.string().max(1000),
    body: z.string().max(20000),
  }),
  output: z.strictObject({
    valid: z.boolean(),
    title: z.string(),
    body: z.string(),
    issues: z.array(z.string()),
  }),
  async run(input, context) {
    context.signal.throwIfAborted();
    const result = noteInputSchema.safeParse(input);
    return result.success
      ? { valid: true, ...result.data, issues: [] }
      : {
          valid: false,
          title: String(input.title),
          body: String(input.body),
          issues: result.error.issues.map((issue) => issue.path.join(".")),
        };
  },
};

export const notesServerExtension = defineServerExtension({
  module: "notes",
  mcpTools: [validateDraft],
  indexes: createNoteIndexes,
  migrations: [
    {
      id: "notes:0001-default-pinned",
      description: "Default the pinned flag on existing sample notes.",
      releasePhase: "after-release",
      async verify(db) {
        if (
          await db.collection("notes").findOne({ pinned: { $exists: false } })
        )
          throw new Error("Notes metadata verification failed.");
      },
      run: defaultPinned,
    },
  ],
});
