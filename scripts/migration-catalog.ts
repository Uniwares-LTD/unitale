import {
  moduleEnabled,
  moduleIds,
  project,
  type ModuleId,
} from "../src/lib/project";
import { coreMigrations } from "../src/lib/server/core-migrations";
import { validateMigrations } from "../src/lib/server/migrations";
import { validateServerExtensions } from "../src/lib/server/extensions";
import { serverExtensions } from "../src/project/server";
import { migrationManifest } from "../src/lib/server/migration-report";

export const migrations = [
  ...coreMigrations,
  ...serverExtensions.flatMap((extension) => extension.migrations ?? []),
];
validateServerExtensions([], serverExtensions, moduleIds);
validateMigrations(migrations, ["core", ...moduleIds]);
export const ownerEnabled = (owner: string) =>
  owner === "core" || moduleEnabled(owner as ModuleId);
export const manifest = migrationManifest(project.slug, migrations, [
  "core",
  ...moduleIds.filter(ownerEnabled),
]);
