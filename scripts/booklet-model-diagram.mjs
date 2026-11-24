// Generate the simple and complete Mermaid views from one maintained model.
import { readFileSync, writeFileSync } from "node:fs";
import { documents, relationships } from "./booklet-model-review-data.mjs";
import { renderMermaid } from "./booklet-model-mermaid.mjs";

const names = new Set(documents.map((d) => d.name));
if (names.size !== documents.length) throw new Error("Duplicate document name");
for (const [from, to] of relationships) {
  if (!names.has(from) || !names.has(to))
    throw new Error(`Unknown reference ${from} -> ${to}`);
}
const coreNames = new Set([
  "Booklet",
  "Production",
  "Artifact revision",
  "Operation",
  "Review request",
  "Quality review",
  "Work attempt",
  "Scoped assessment",
  "Manager acceptance",
  "Original asset receipt",
  "Consumption order",
]);
function emit(file, content) {
  const target = new URL(
    `../docs/features/booklet-generation/${file}`,
    import.meta.url,
  );
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== content)
      throw new Error(`${file} is stale. Run npm run docs:booklet-model.`);
    console.log(`${file} matches its maintained source.`);
  } else {
    writeFileSync(target, content);
    console.log(`Updated ${file}`);
  }
}
const core = documents.filter((d) => coreNames.has(d.name));
emit("model-core-mermaid.md", renderMermaid(core, relationships, false));
emit(
  "model-complete-mermaid.md",
  renderMermaid(documents, relationships, true),
);
