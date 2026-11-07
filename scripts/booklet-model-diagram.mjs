// Generate document-oriented SVG and Mermaid views from one maintained model.
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
  "Human decision",
  "Quality review",
  "Original asset receipt",
  "Consumption order",
]);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function wrap(line, limit = 62) {
  const indent = line.match(/^ */)[0];
  const words = line.trim().split(/ +/);
  const lines = [];
  let current = indent;
  for (const word of words) {
    if (current.length + word.length + 1 > limit) {
      lines.push(current);
      current = indent + "  ";
    }
    current += (current.trim() ? " " : "") + word;
  }
  lines.push(current);
  return lines;
}
function svg(title, selected) {
  const width = 1680,
    cardWidth = 800,
    gap = 28;
  const parts = [];
  const text = (x, y, value, size = 17, color = "#172033") =>
    parts.push(
      `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" xml:space="preserve">${esc(value)}</text>`,
    );
  let y = 155;
  for (let index = 0; index < selected.length; index += 2) {
    const row = selected
      .slice(index, index + 2)
      .map((d) => ({ ...d, lines: d.fields.flatMap((f) => wrap(f)) }));
    const height = Math.max(...row.map((d) => d.lines.length)) * 24 + 100;
    for (const [column, doc] of row.entries()) {
      const x = 26 + column * (cardWidth + gap);
      parts.push(
        `<rect x="${x}" y="${y}" width="${cardWidth}" height="${height}" rx="8" fill="#ffffff" stroke="#64748b"/>`,
      );
      parts.push(
        `<rect x="${x}" y="${y}" width="${cardWidth}" height="66" rx="8" fill="#17324d"/>`,
      );
      text(x + 16, y + 27, doc.name, 23, "#ffffff");
      text(x + 16, y + 51, doc.status, 15, "#e2e8f0");
      for (const [i, line] of doc.lines.entries()) {
        if (i % 2 === 0)
          parts.push(
            `<rect x="${x + 1}" y="${y + 76 + i * 24}" width="${cardWidth - 2}" height="24" fill="#eef2f6"/>`,
          );
        text(x + 16, y + 95 + i * 24, line);
      }
    }
    y += height + 28;
  }
  text(
    26,
    y + 15,
    "References between documents (embedded objects have no separate boxes)",
    23,
  );
  y += 48;
  const selection = new Set(selected.map((d) => d.name));
  for (const [from, to, label] of relationships.filter(
    ([a, b]) => selection.has(a) || selection.has(b),
  )) {
    for (const line of wrap(`${from} -> ${to}: ${label}`, 150)) {
      text(26, y, line, 16);
      y += 25;
    }
  }
  text(
    26,
    y + 20,
    "Source: scripts/booklet-model-review-data.mjs | Guide: docs/features/booklet-generation/model.md",
    16,
  );
  const heading = `<text x="26" y="43" font-size="30" fill="#0f172a">${esc(title)}</text><text x="26" y="78" font-size="19" fill="#172033">Accepted production content index; persistence implementation pending T14.</text><text x="26" y="108" font-size="17" fill="#172033">Indented objects and arrays are embedded. I = existing service; other statuses identify pending design details.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y + 50}" role="img" aria-labelledby="title"><title id="title">${esc(title)}</title><rect width="100%" height="100%" fill="#f1f5f9"/><g font-family="monospace">${heading}${parts.join("\n")}</g></svg>\n`;
}
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
emit("model.svg", svg("Booklet document boundaries", core));
for (const group of ["content", "lifecycle", "economy", "media"]) {
  const selected = documents.filter(
    (d) =>
      d.group === group || (group === "lifecycle" && d.name === "Production"),
  );
  emit(
    `model-${group}.svg`,
    svg(`Booklet ${group}: documents and nested fields`, selected),
  );
}
emit("model-core-mermaid.md", renderMermaid(core, relationships, false));
emit(
  "model-complete-mermaid.md",
  renderMermaid(documents, relationships, true),
);
