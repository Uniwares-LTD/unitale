import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(".");
const references = {};
for (const file of fs
  .readdirSync("src", { recursive: true })
  .filter((f) => /\.tsx?$/.test(f))) {
  const name = "src/" + file.replaceAll("\\", "/");
  references[name] = [
    ...fs
      .readFileSync(name, "utf8")
      .matchAll(/(?:translate|t)\(\s*['"](m[a-f0-9]{12})['"]/g),
  ].map((m) => m[1]);
}
const all = fs
  .readdirSync("src/app", { recursive: true })
  .filter((p) => p.endsWith("page.tsx"))
  .map((p) => "src/app/" + p.replaceAll("\\", "/"))
  .sort();
const normalize = (p) => path.relative(root, p).replaceAll("\\", "/");
function resolve(from, id) {
  if (!id.startsWith(".") && !id.startsWith("@/")) return null;
  const base = id.startsWith("@/")
    ? path.resolve("src", id.slice(2))
    : path.resolve(path.dirname(from), id);
  for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (fs.existsSync(base + suffix)) return normalize(base + suffix);
  }
  return null;
}
function keys(entry) {
  const result = new Set(),
    visited = new Set();
  function walk(file, client = false) {
    if (visited.has(file + client)) return;
    visited.add(file + client);
    const content = fs.readFileSync(file, "utf8"),
      source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    client ||= /^['"]use client['"];/.test(content);
    if (client) for (const key of references[file] ?? []) result.add(key);
    for (const statement of source.statements)
      if (
        ts.isImportDeclaration(statement) &&
        !statement.importClause?.isTypeOnly &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const child = resolve(file, statement.moduleSpecifier.text);
        if (child) walk(child, client);
      }
  }
  walk(entry);
  return result;
}
const common = new Set([
  ...keys("src/app/layout.tsx"),
  ...keys("src/app/error.tsx"),
]);
const routes = all.map((file) => ({
  route: file.slice(7).replace(/\/page\.tsx$/, "") || "/",
  keys: [...new Set([...common, ...keys(file)])].sort(),
}));
const output =
  JSON.stringify({ common: [...common].sort(), routes }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync("messages/client-sections.json", "utf8") !== output)
    throw new Error("Client message sections are stale");
} else fs.writeFileSync("messages/client-sections.json", output);
