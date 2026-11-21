import { z } from "zod";
import { designStyleSchema } from "./design-styles";
import manifest from "../../project.config.json";
import { extensions } from "../project/extensions";
import {
  validateExtensions,
  type ModuleConfiguration,
  type ModuleDescriptor,
  type ProjectExtension,
} from "./extensions";
export type { ModuleConfiguration } from "./extensions";
import { projectLimitsSchema } from "./limits";

export const coreModuleIds = [
  "credits",
  "payments",
  "runs",
  "mcp",
  "files",
  "notifications",
  "artifacts",
] as const;
type CoreModuleId = (typeof coreModuleIds)[number];
export type ModuleId = CoreModuleId | (typeof extensions)[number]["id"];
// Widened view for iteration; ModuleId keeps the literal extension IDs.
export const projectExtensions: readonly ProjectExtension<ModuleId>[] =
  extensions;
export const moduleIds = [
  ...coreModuleIds,
  ...projectExtensions.map((extension) => extension.id),
] as [ModuleId, ...ModuleId[]];
export const projectSchema = z
  .strictObject({
    version: z.literal(1),
    slug: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[^\r\n\0]+$/),
    defaultStyle: designStyleSchema,
    theme: z.boolean().default(false),
    modules: z
      .array(z.enum(moduleIds))
      .refine((v) => new Set(v).size === v.length),
    locales: z
      .array(z.enum(["en", "ar"]))
      .min(1)
      .refine((v) => new Set(v).size === v.length),
    defaultLocale: z.enum(["en", "ar"]),
    examples: z.boolean(),
    limits: projectLimitsSchema.optional(),
    android: z
      .strictObject({
        packageName: z
          .string()
          .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.locales.includes(value.defaultLocale))
      ctx.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "Default locale must be supported.",
      });
    for (const [id, dependencies] of Object.entries(moduleDescriptors))
      if (value.modules.includes(id as ModuleId))
        for (const dependency of dependencies.requires)
          if (!value.modules.includes(dependency))
            ctx.addIssue({
              code: "custom",
              path: ["modules"],
              message: "Missing module dependency.",
            });
  });
const coreModuleDescriptors: Record<
  CoreModuleId,
  ModuleDescriptor<ModuleId> & { configuration: ModuleConfiguration[] }
> = {
  credits: {
    configuration: ["credits"],
    requires: [],
    routes: ["/credits", "/api/credits"],
    workers: ["payment"],
    collections: [
      "creditWallets",
      "creditLots",
      "creditReservations",
      "creditOperations",
      "creditLedger",
    ],
  },
  payments: {
    configuration: ["payments"],
    requires: ["credits"],
    routes: ["/api/payments", "/admin/commerce", "/api/admin/commerce"],
    workers: ["payment"],
    collections: ["purchaseOrders", "paymentInbox"],
  },
  runs: {
    configuration: ["runs"],
    requires: ["credits"],
    // Administration for Runs is part of the module, so the proxy and
    // endpoint() hide it when Runs are disabled.
    routes: [
      "/runs",
      "/api/runs",
      "/api/run-uploads",
      "/api/run-assets",
      "/admin/ai",
      "/admin/orchestrators",
      "/admin/personas",
      "/api/admin/ai",
      "/api/admin/orchestrators",
      "/api/admin/personas",
    ],
    workers: ["ai"],
    collections: ["aiJobs", "runEvents", "runDecisions"],
  },
  mcp: {
    configuration: ["mcp"],
    requires: [],
    routes: ["/api/mcp"],
    workers: [],
    collections: [],
  },
  files: {
    configuration: ["assets"],
    requires: [],
    routes: ["/files", "/api/files"],
    workers: ["payment"],
    collections: ["privateFiles"],
  },
  notifications: {
    configuration: [],
    requires: [],
    routes: ["/notifications", "/api/notifications"],
    workers: ["payment"],
    collections: ["notifications", "notificationOutbox"],
  },
  artifacts: {
    configuration: [],
    requires: ["runs"],
    routes: ["/artifacts", "/api/artifacts"],
    workers: ["ai"],
    collections: ["artifacts", "artifactRevisions"],
  },
};
// Always-on core routes that no module owns; extensions may not claim them.
const unownedCoreRoutes = [
  "/account",
  "/admin",
  "/design-system",
  "/preferences",
  "/api/admin",
  "/api/auth",
  "/api/diagnostics",
  "/api/health",
  "/api/profile",
];
validateExtensions(
  {
    ids: coreModuleIds,
    collections: Object.values(coreModuleDescriptors).flatMap(
      (module) => module.collections,
    ),
    routes: [
      ...unownedCoreRoutes,
      ...Object.values(coreModuleDescriptors).flatMap(
        (module) => module.routes,
      ),
    ],
  },
  projectExtensions,
);
export const moduleDescriptors = {
  ...coreModuleDescriptors,
  ...Object.fromEntries(
    projectExtensions.map((extension) => [extension.id, extension.module]),
  ),
} as Record<ModuleId, ModuleDescriptor<ModuleId>>;
export const project = projectSchema.parse(manifest);
export const namespace = (name: string) => `${project.slug}-${name}`;
export const databasePrefix = project.slug.replaceAll("-", "_");
// A module is enabled only when its dependencies are, so an extension that
// requires artifacts follows the examples selection too.
export const moduleEnabled = (id: ModuleId): boolean =>
  project.modules.includes(id) &&
  (id !== "artifacts" || project.examples) &&
  moduleDescriptors[id].requires.every(moduleEnabled);
export function moduleForPath(path: string): ModuleId | undefined {
  return moduleIds.find((id) =>
    moduleDescriptors[id].routes.some(
      (route) => path === route || path.startsWith(route + "/"),
    ),
  );
}

export const requiredWorkers = [
  ...new Set(project.modules.flatMap((id) => moduleDescriptors[id].workers)),
];
export function collectionEnabled(name: string) {
  const owner = moduleIds.find((id) =>
    moduleDescriptors[id].collections.includes(name),
  );
  return !owner || moduleEnabled(owner);
}

export const requiredModuleConfigurations = new Set(
  project.modules
    .filter(moduleEnabled)
    .flatMap((id) => moduleDescriptors[id].configuration),
);
