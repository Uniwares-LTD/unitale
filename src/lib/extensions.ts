import type { useTranslations } from "next-intl";
import type { IconName } from "lucide-react/dynamic";

// Client-safe extension contract. Project features and samples contribute
// through src/project/extensions.ts instead of editing core lists. Keep these
// definitions pure data: they are bundled for the browser.
export type ModuleConfiguration =
  "credits" | "payments" | "runs" | "mcp" | "assets";
export type WorkerKind = "payment" | "ai";
export type ModuleDescriptor<Id extends string = string> = {
  requires: Id[];
  configuration: ModuleConfiguration[];
  routes: string[];
  workers: WorkerKind[];
  collections: string[];
};
export type ExtensionRoute = {
  href: string;
  placement: "main" | "account";
  // Use a literal t("m…") call so i18n-client-sections can find the key.
  label: (t: ReturnType<typeof useTranslations<"ui">>) => string;
  // A Lucide icon name. Server scripts load this registry, so it holds no
  // React components; the shell renders the icon on the client.
  icon: IconName;
};
// Administration is English-only: copy lives in source, not catalogs.
export type ExtensionAdminSection = {
  href: `/admin/${string}`;
  label: string;
  description: string;
};
export type ProjectExtension<Id extends string = string> = {
  id: Id;
  module: ModuleDescriptor;
  routes?: ExtensionRoute[];
  adminSections?: ExtensionAdminSection[];
  // Page paths (and their subpaths) rendered in the focused frame: no sidebar
  // or browsing header, only Back and the colour-mode toggle. Each must lie
  // inside this extension's module routes and must not be an API path.
  focusedRoutes?: string[];
};

export function defineExtension<const Id extends string>(
  extension: ProjectExtension<Id>,
) {
  return extension;
}

const extensionId = /^[a-z][a-z0-9-]{1,39}$/;
// Rejects collisions and malformed entries when the registry loads, so a bad
// definition fails the build instead of shadowing core behavior at runtime.
export function validateExtensions(
  core: {
    ids: readonly string[];
    collections: readonly string[];
    routes: readonly string[];
  },
  extensions: readonly ProjectExtension[],
) {
  const ids = new Set(core.ids),
    collections = new Set(core.collections),
    routes = [...core.routes],
    hrefs = new Set<string>();
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
  for (const extension of extensions) {
    if (!extensionId.test(extension.id) || ids.has(extension.id))
      throw new Error(`Invalid or duplicate extension id: ${extension.id}`);
    ids.add(extension.id);
  }
  // Dependencies must be core or listed earlier, which also rules out cycles
  // in the recursive moduleEnabled check.
  const earlier = new Set(core.ids);
  for (const extension of extensions) {
    for (const dependency of extension.module.requires)
      if (!earlier.has(dependency))
        throw new Error(`Extension ${extension.id} requires unknown module.`);
    earlier.add(extension.id);
    for (const name of extension.module.collections) {
      if (collections.has(name))
        throw new Error(`Collection ${name} already has an owner.`);
      collections.add(name);
    }
    // moduleForPath returns the first owner, so overlapping prefixes would
    // gate an extension's paths by another module.
    for (const route of extension.module.routes) {
      if (
        !/^\/[a-z0-9/-]+$/.test(route) ||
        routes.some((owned) => overlaps(owned, route))
      )
        throw new Error(`Extension ${extension.id} has an invalid route.`);
      routes.push(route);
    }
    for (const { href } of [
      ...(extension.routes ?? []),
      ...(extension.adminSections ?? []),
    ]) {
      if (hrefs.has(href)) throw new Error(`Duplicate extension link ${href}.`);
      hrefs.add(href);
    }
    for (const route of extension.routes ?? [])
      if (
        !extension.module.routes.some(
          (owned) => route.href === owned || route.href.startsWith(owned + "/"),
        )
      )
        throw new Error(`Link ${route.href} is outside its module routes.`);
    const focused = extension.focusedRoutes ?? [];
    if (new Set(focused).size !== focused.length)
      throw new Error(`Extension ${extension.id} repeats a focused route.`);
    for (const path of focused)
      if (
        !/^\/[a-z0-9/-]+$/.test(path) ||
        path === "/api" ||
        path.startsWith("/api/") ||
        !extension.module.routes.some(
          (owned) => path === owned || path.startsWith(owned + "/"),
        )
      )
        throw new Error(`Focused route ${path} is outside its module pages.`);
  }
}

// Whether a page path renders in the focused frame. The shell still requires
// the owning module to be enabled.
export function isFocusedPath(
  extensions: readonly ProjectExtension[],
  pathname: string,
) {
  return extensions.some((extension) =>
    (extension.focusedRoutes ?? []).some(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ),
  );
}

// Navigation entries for one placement. The shell still filters them through
// moduleForPath/moduleEnabled like core links.
export function extensionLinks(
  extensions: readonly ProjectExtension[],
  placement: ExtensionRoute["placement"],
  translate: Parameters<ExtensionRoute["label"]>[0],
) {
  return extensions.flatMap((extension) =>
    (extension.routes ?? [])
      .filter((route) => route.placement === placement)
      .map(({ href, label, icon }) => ({
        href,
        label: label(translate),
        icon,
      })),
  );
}

export function extensionAdminSections<Id extends string>(
  extensions: readonly ProjectExtension<Id>[],
  enabled: (id: Id) => boolean,
) {
  return extensions
    .filter((extension) => enabled(extension.id))
    .flatMap((extension) => extension.adminSections ?? []);
}
