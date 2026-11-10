import { defineExtension } from "../../lib/extensions";
export const bookletsExtension = defineExtension({
  id: "booklets",
  module: {
    requires: ["credits", "runs"],
    configuration: [],
    routes: [],
    workers: [],
    collections: [
      "bookletBooks",
      "bookletProductions",
      "bookletRevisions",
      "bookletRepositoryWrites",
      "bookletWork",
      "bookletAssessments",
      "bookletAcceptances",
    ],
  },
});
