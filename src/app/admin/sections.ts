import { moduleEnabled, moduleForPath, projectExtensions } from "@/lib/project";
import { extensionAdminSections } from "@/lib/extensions";

// One ordered list feeds the administrator navigation and the overview cards.
// Project extensions append their sections after the core entries.
export async function adminSections() {
  const sections = [
    {
      href: "/admin/commerce",
      label: "Commerce",
      description:
        "Purchase offers, products, coupons, publication and refunds.",
    },
    {
      href: "/admin/users",
      label: "Users",
      description:
        "Find an account to review its profile, access and credit balance.",
    },
    {
      href: "/admin/reports",
      label: "Reports",
      description:
        "Filter recorded application events and administrator changes.",
    },
    {
      href: "/admin/operations",
      label: "Operations",
      description:
        "Worker health, payment recovery and content cleanup. Changes require administrator access.",
    },
    {
      href: "/admin/ai",
      label: "AI operations",
      description:
        "Resolve uncertain executions and inspect provider usage independently of application credits.",
    },
    {
      href: "/admin/settings",
      label: "Application settings",
      description: "Application defaults, credits, and run policies.",
    },
    {
      href: "/admin/orchestrators",
      label: "Orchestrators",
      description: "Create from a template or register a Dify workflow.",
    },
    {
      href: "/admin/personas",
      label: "Personas",
      description:
        "Configure who answers workflow questions and their responder pricing.",
    },
  ];
  // Sections owned by a disabled module are hidden, like their routes.
  const visible = sections.filter((section) => {
    const owner = moduleForPath(section.href);
    return !owner || moduleEnabled(owner);
  });
  const hrefs = new Set(sections.map((section) => section.href));
  for (const section of extensionAdminSections(
    projectExtensions,
    moduleEnabled,
  )) {
    if (hrefs.has(section.href))
      throw new Error(`Admin section ${section.href} is already registered.`);
    visible.push(section);
  }
  return visible;
}
