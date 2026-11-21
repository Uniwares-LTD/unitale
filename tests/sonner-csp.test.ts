import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy, sonnerStyleHashes } from "../src/proxy";

test("production allowlists the exact injected styles of pinned Sonner", (t) => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const manifest = JSON.parse(read("../package.json"));
  assert.equal(manifest.dependencies.sonner, "2.0.8");
  const source = read("../node_modules/sonner/dist/index.mjs");
  const match = /__insertCSS\(("(?:\\.|[^"\\])*")\)/.exec(source);
  assert.ok(match);
  const hashes = [JSON.parse(match[1]), ""].map(
    (css: string) =>
      `'sha256-${createHash("sha256").update(css).digest("base64")}'`,
  );
  assert.deepEqual(sonnerStyleHashes, hashes);

  const stylePolicy = (path: string) => {
    const response = proxy(new NextRequest(`http://localhost:3000${path}`));
    return response.headers
      .get("content-security-policy")
      ?.split("; ")
      .find((directive) => directive.startsWith("style-src "));
  };
  const previous = process.env.NODE_ENV;
  t.after(() => {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previous);
  });

  Reflect.set(process.env, "NODE_ENV", "production");
  assert.match(stylePolicy("/") ?? "", /'nonce-[^']+'/);
  for (const hash of hashes) assert.ok(stylePolicy("/")?.includes(hash));
  assert.ok(!stylePolicy("/")?.includes("unsafe-inline"));
  assert.equal(
    stylePolicy("/__/auth/handler"),
    "style-src 'self' 'unsafe-inline'",
  );

  Reflect.set(process.env, "NODE_ENV", "development");
  assert.equal(stylePolicy("/"), "style-src 'self' 'unsafe-inline'");
});
