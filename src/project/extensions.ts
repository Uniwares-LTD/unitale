import type { ProjectExtension } from "../lib/extensions";
import { notesExtension } from "../samples/notes/extension"; // sample:notes

// Project-owned registry. Add one entry per project feature or sample; core
// code reads this list, so features do not edit core files. Lines marked
// `sample:<name>` are removed by `npm run samples:remove <name>`. See
// docs/architecture.md#project-extensions.
import { bookletsExtension } from "./booklets/extension";

export const extensions = [
  bookletsExtension,
  notesExtension, // sample:notes
] as const satisfies readonly ProjectExtension[];
