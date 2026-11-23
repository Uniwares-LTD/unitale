import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const result = spawnSync(
  process.execPath,
  [
    "--conditions=react-server",
    "--import",
    "tsx",
    "scripts/db-migrate.ts",
    "--manifest",
  ],
  { encoding: "utf8", windowsHide: true },
);
if (result.status !== 0)
  throw new Error("Source migration manifest generation failed.");
const manifest = JSON.parse(result.stdout);
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["scripts/db-migrate.ts"],
  outfile: "dist/migration-runner.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["sharp"],
  define: {
    MIGRATION_PACKAGED: "true",
    MIGRATION_SOURCE_CHECKSUMS: JSON.stringify(
      Object.fromEntries(manifest.migrations.map((m) => [m.id, m.checksum])),
    ),
  },
  plugins: [
    {
      name: "server-only-runner",
      setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "empty",
        }));
        builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({
          contents: "",
        }));
      },
    },
  ],
});
manifest.runnerSha256 = createHash("sha256")
  .update(await readFile("dist/migration-runner.cjs"))
  .digest("hex");
await writeFile(
  "dist/migration-manifest.json",
  JSON.stringify(manifest) + "\n",
);
