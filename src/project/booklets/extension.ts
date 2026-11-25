import { defineExtension } from "../../lib/extensions";
export const bookletsExtension = defineExtension({
  id: "booklets",
  module: {
    requires: ["credits", "runs"],
    configuration: [],
    routes: ["/api/booklets", "/books"],
    workers: [],
    collections: [
      "bookletBooks",
      "bookletProductions",
      "bookletRevisions",
      "bookletRepositoryWrites",
      "bookletWork",
      "bookletAssessments",
      "bookletAcceptances",
      "bookletSettings",
    ],
  },
  // The conversation entry and pages use Unibase's focused frame (Back and
  // theme only), as the Unitale chat header specifies.
  focusedRoutes: ["/books"],
  routes: [
    {
      href: "/books",
      placement: "main",
      label: (t) => t("m1ad84286274b"),
      icon: "library",
    },
  ],
  adminSections: [
    {
      href: "/admin/booklets",
      label: "Booklets",
      description: "Action retry defaults for new booklet productions.",
    },
  ],
});
