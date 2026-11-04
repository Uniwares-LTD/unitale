import "server-only";
import { privateToolPermissions as core } from "./private-tools";
import { serverExtensions } from "../../../project/server";
import {
  extensionTools,
  validateServerExtensions,
  type ServerExtension,
} from "../extensions";
import { moduleEnabled, moduleIds, type ModuleId } from "../../project";
export function privatePermissionsFor(
  extensions: readonly ServerExtension[],
  enabled: (id: ModuleId) => boolean,
) {
  validateServerExtensions(Object.keys(core), extensions, moduleIds);
  return {
    ...core,
    ...Object.fromEntries(
      extensionTools(extensions, enabled)
        .filter((tool) => tool.runContext)
        .map((tool) => [tool.name, tool.permission]),
    ),
  };
}
export const privateToolPermissions: Record<string, string> =
  privatePermissionsFor(serverExtensions, moduleEnabled);
