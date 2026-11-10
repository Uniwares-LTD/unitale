import "server-only";
import type { Db } from "mongodb";
import type { ModuleId } from "../project";
import type { DomainAdapter } from "./domains";
import type { RegisteredTool } from "./mcp/tools";
import type { Migration } from "./migrations";

// Server-only half of the extension contract; see src/lib/extensions.ts.
// Entries run with the same permission, module and ownership checks as core.
export type ServerExtension = {
  // New user-facing contributions are disabled when the module is not enabled.
  // Reconciliation still handles accepted work through the existing worker.
  module: ModuleId;
  mcpTools?: readonly RegisteredTool[];
  productTypes?: readonly import("./commerce/catalogs").ProductType[];
  domainAdapters?: readonly DomainAdapter[];
  // One bounded, leased, non-paid readback/retention pass over accepted work.
  // Never admit or dispatch work here, including when module admission is disabled.
  reconcile?: (db: Db, now: Date) => Promise<boolean>;
  // Idempotent index setup run by db:indexes.
  indexes?: (db: Db) => Promise<void>;
  // Forward-only migrations run by db:migrate; IDs start with `<module>:`.
  migrations?: readonly Migration[];
};

export function defineServerExtension(extension: ServerExtension) {
  return extension;
}

export function validateServerExtensions(
  coreToolNames: readonly string[],
  extensions: readonly ServerExtension[],
  moduleIds: readonly string[],
) {
  const names = new Set(coreToolNames);
  for (const extension of extensions) {
    if (!moduleIds.includes(extension.module))
      throw new Error(
        `Server extension module ${extension.module} is unknown.`,
      );
    for (const tool of extension.mcpTools ?? []) {
      if (names.has(tool.name))
        throw new Error(`Duplicate MCP tool ${tool.name}.`);
      names.add(tool.name);
      if (
        tool.permission.startsWith("extension:") &&
        ![
          "extension:" + extension.module + ":read",
          "extension:" + extension.module + ":write",
        ].includes(tool.permission)
      )
        throw new Error(
          `Tool ${tool.name} permission must belong to module ${extension.module}.`,
        );
      if (tool.runContext && !tool.input.shape.runContext)
        throw new Error(
          `Private MCP tool ${tool.name} must declare runContext.`,
        );
    }
    for (const migration of extension.migrations ?? [])
      if (!migration.id.startsWith(`${extension.module}:`))
        throw new Error(
          `Migration ${migration.id} must belong to module ${extension.module}.`,
        );
  }
}

export function extensionTools(
  extensions: readonly ServerExtension[],
  enabled: (id: ModuleId) => boolean,
) {
  return extensions
    .filter((extension) => enabled(extension.module))
    .flatMap((extension) => extension.mcpTools ?? []);
}

export function extensionProductTypes(
  extensions: readonly ServerExtension[],
  enabled: (id: ModuleId) => boolean,
) {
  const types = extensions
    .filter((e) => enabled(e.module))
    .flatMap((e) => e.productTypes ?? []);
  const keys = types.map((t) => t.id + ":" + t.schemaVersion);
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate product type version.");
  return types;
}

// Admission filters do not suppress retention of already accepted work.
export async function reconcileExtensions(
  extensions: readonly ServerExtension[],
  db: Db,
  now: Date,
) {
  let worked = false;
  for (const extension of extensions)
    worked = (await extension.reconcile?.(db, now)) || worked;
  return worked;
}
