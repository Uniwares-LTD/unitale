import { cpSync, existsSync } from "node:fs";
import path from "node:path";

export function prepareStandalone() {
  const root = path.resolve(".next/standalone");
  const server = path.join(root, "server.js");
  if (!existsSync(server))
    throw new Error("Run npm run build before starting the standalone server.");
  if (existsSync("dist/migration-manifest.json"))
    cpSync(
      "dist/migration-manifest.json",
      path.join(root, "migration-manifest.json"),
    );
  cpSync("dify", path.join(root, "dify"), { recursive: true });
  cpSync("public", path.join(root, "public"), { recursive: true });
  cpSync(".next/static", path.join(root, ".next/static"), { recursive: true });
  return server;
}
