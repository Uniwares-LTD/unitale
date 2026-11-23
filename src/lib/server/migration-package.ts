import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { migrationManifest } from "./migration-report";

// The build supplies this constant; source execution has no packaged identity.
declare const MIGRATION_PACKAGED: boolean | undefined;
export function checkedManifest(
  source: ReturnType<typeof migrationManifest>,
): ReturnType<typeof migrationManifest> & { runnerSha256?: string } {
  if (typeof MIGRATION_PACKAGED === "undefined") return source;
  const bytes = readFileSync(process.argv[1]);
  const packaged = JSON.parse(
    readFileSync(
      join(dirname(process.argv[1]), "migration-manifest.json"),
      "utf8",
    ),
  );
  const { runnerSha256, ...metadata } = packaged;
  if (
    createHash("sha256").update(bytes).digest("hex") !== runnerSha256 ||
    !isDeepStrictEqual(metadata, source)
  )
    throw new Error("Packaged migration identity mismatch.");
  return packaged as ReturnType<typeof migrationManifest> & {
    runnerSha256: string;
  };
}
