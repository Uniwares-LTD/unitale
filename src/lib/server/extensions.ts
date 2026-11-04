import "server-only";
import type { Db } from "mongodb";
import type { ModuleId } from "../project";
import type { DomainAdapter } from "./domains";
import type { RegisteredTool } from "./mcp/tools";
import type { Migration } from "./migrations";

// Server-only half of the extension contract; see src/lib/extensions.ts.
// Entries run with the same permission, module and ownership checks as core.
export type ServerExtension = {
  // Contributions are disabled when this module is not enabled.
  module: ModuleId;
  mcpTools?: readonly RegisteredTool[];
  productTypes?: readonly import("./commerce/catalogs").ProductType[];
  domainAdapters?: readonly DomainAdapter[];
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
