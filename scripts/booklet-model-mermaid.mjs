// Mermaid projections reuse the SVG review fields, including proposal status.
import { readFileSync, writeFileSync } from "node:fs";

const coreEdges = [
  ["Booklet", "Production", "1 to many versions"],
  ["Production", "Subject", "1 to many stable subjects"],
  ["Subject", "Artifact", "1 to many responsibilities"],
  ["Artifact", "Artifact revision", "1 to many immutable revisions"],
  ["Production", "Operation", "1 to many authorized operations"],
  ["Operation", "Artifact revision", "produces"],
  ["Operation", "Execution attempt", "1 to many attempts"],
  ["Run", "Execution attempt", "hosts"],
  ["Execution attempt", "Execution measurement", "per-call measurements"],
  ["Consumption order", "Production", "funds zero or one production"],
  ["Consumption order", "Entitlement allocation", "allocates revision units"],
  ["Entitlement allocation", "Operation", "funds customer revisions"],
  ["Human decision", "Artifact revision", "targets exact revisions"],
  ["Quality review", "Artifact revision", "reviews exact revision"],
  ["Artifact revision", "Original asset receipt", "references original bytes"],
];

const detailEdges = [
  ["Production", "Run binding", "continuation history"],
  ["Run binding", "Run", "owned execution"],
  ["Production", "Stage lock", "embeds irreversible boundaries"],
  ["Stage lock", "Operation", "authorizing downstream operation"],
  ["Production", "Mutation lease", "at most one active mutation"],
  ["Production", "Human input request", "requests authenticated input"],
  ["Human input request", "Human decision", "answered through Run UI"],
  ["Human decision", "Decision target", "embeds exact targets"],
  ["Decision target", "Artifact revision", "identifies"],
  ["Production", "Revision request", "customer revision rounds"],
  ["Revision request", "Human decision", "authenticated instruction"],
  ["Revision request", "Revision quote", "accepted quote"],
  ["Revision request", "Entitlement allocation", "reuses allocations on retry"],
  ["Revision request", "Operation", "authorizes work"],
  ["Production", "Content reuse acceptance", "explicit reuse in new version"],
  ["Content reuse acceptance", "Human decision", "acceptance evidence"],
  ["Content reuse acceptance", "Artifact revision", "source content"],
  ["Production", "Repair budget", "separate platform funding"],
  ["Repair budget", "Quality review", "failed output identity"],
  ["Repair budget", "Operation", "bounded repair work"],
  ["Artifact revision", "Revision source", "embeds dependencies"],
  ["Revision source", "Artifact revision", "exact source revision"],
  ["Artifact revision", "Revision asset", "embeds asset references"],
  ["Revision asset", "Original asset receipt", "hash-bound original"],
  ["Production", "Creator brief", "creator inputs"],
  ...[
    "Concept",
    "Outline",
    "Manuscript",
    "Entity description",
    "Creative roster",
    "Style definition",
    "Reference image",
    "Page plan",
    "Book manifest",
  ].map((name) => ["Artifact revision", name, "typed payload variant"]),
  ["Entity description", "Subject", "one character or location"],
  ["Creative roster", "Subject", "ordered membership"],
  ["Page plan", "Subject", "stable physical page"],
  ["Page plan", "Panel", "embeds ordered panels"],
  ["Panel", "Lettering", "embeds required text"],
  ["Panel", "Manuscript", "source unit identities"],
  ["Book manifest", "Manifest page entry", "embeds accepted order"],
  ["Manifest page entry", "Subject", "page identity"],
  ["Manifest page entry", "Artifact revision", "accepted image revision"],
  ["Manifest page entry", "Original asset receipt", "accepted original"],
  ["Manifest page entry", "Quality review", "required quality evidence"],
  ["Manifest page entry", "Human decision", "approval evidence"],
  ["Purchase offer", "Billing intent", "accepted purchase terms"],
  ["Billing intent", "Verified payment", "server verification"],
  ["Purchase offer", "Subscription", "accepted recurring terms"],
  ["Subscription", "Verified payment", "verified renewals"],
  ["Promotion", "Promotion reservation", "bounded redemption"],
  ["Billing intent", "Promotion reservation", "optional checkout benefit"],
  ["Verified payment", "Promotion reservation", "finalizes redemption"],
  ["Verified payment", "Credit lot", "idempotent grant"],
  ["Wallet", "Credit lot", "account credit lots"],
  ["Wallet", "Ledger entry", "audited balance changes"],
  ["Credit reservation", "Credit lot", "generic holds against lots"],
  ["Consumption product", "Consumption order", "frozen accepted terms"],
  ["Consumption order", "Ledger entry", "charge and refund references"],
  [
    "Entitlement allocation",
    "Consumption order",
    "optional extra-revision paid order",
  ],
  ["Catalog publication", "Purchase offer", "published revision"],
  ["Catalog publication", "Consumption product", "published revision"],
  ["Consumption product", "Booklet package fields", "validated extension"],
  ["Production", "Booklet package fields", "accepted configuration snapshot"],
  ["Booklet package fields", "Execution profile", "versioned compatibility"],
  ["Quality review", "Quality policy", "exact policy revision"],
  [
    "Original asset receipt",
    "Display derivative",
    "separate display transforms",
  ],
  ["Attachment receipt", "Original asset receipt", "retained asset"],
  ["Attachment receipt", "Artifact revision", "durable attachment"],
  ...[
    "Operation",
    "Execution measurement",
    "Quality review",
    "Original asset receipt",
  ].map((name) => [name, "Evidence reference", "referenced evidence"]),
  ["Booklet", "Deletion and recovery", "retention state"],
  ["Booklet", "Access and audit", "owned access and audited actions"],
  ["Book manifest", "PDF export", "exact manifest revision - later T23"],
  ["Book manifest", "Share grant", "exact manifest revision - later T24"],
  ["Deletion and recovery", "Share grant", "immediate revocation"],
];

const aliases = new Map([
  ["Production lifecycle", "Production"],
  ["Original receipt", "Original asset receipt"],
]);
const id = (name) => name.replaceAll(/[^a-zA-Z0-9]/g, "_");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function renderMermaidModels(overview, views) {
  const entities = new Map();
  const groups = [
    ["Core records", overview.flatMap((section) => section.entities)],
    ...views.map((view) => [
      view.title,
      view.sections.flatMap((section) => section.entities),
    ]),
  ];
  for (const [group, cards] of groups) {
    for (const [rawName, status, fields] of cards) {
      const name = aliases.get(rawName) ?? rawName;
      const previous = entities.get(name);
      entities.set(name, {
        group: previous?.group ?? group,
        status: [...new Set([...(previous?.status ?? []), status])],
        fields: [
          ...new Set([...(previous?.fields ?? []), ...fields.filter(Boolean)]),
        ],
      });
    }
  }
  for (const [from, to] of [...coreEdges, ...detailEdges]) {
    if (!entities.has(from) || !entities.has(to))
      throw new Error(`Unknown Mermaid relationship: ${from} -> ${to}`);
  }
  for (const complete of [false, true]) {
    const selected = complete
      ? entities
      : new Map(
          [...entities].filter(([name]) =>
            coreEdges.some(([from, to]) => name === from || name === to),
          ),
        );
    const title = `Booklet schema — ${complete ? "complete review" : "simple core"}`;
    const lines = [
      `# ${title}`,
      "",
      "<!-- Generated by npm run docs:booklet-model; edit diagram sources, not this file. -->",
      "",
      "[Model guide and decision agenda](model.md) · " +
        (complete
          ? "[Simple core](model-core-mermaid.md)"
          : "[Complete review](model-complete-mermaid.md)"),
      "",
      "Proposed logical schema for T14 review, not an implemented database schema. I = implemented capability, C = contract only, P = proposal. Boxes can represent embedded payloads or service views; they do not imply collections. Arrows name relationships, not execution order or authorization.",
      "",
      complete
        ? "Includes every entity and field summary in the maintained SVG review views. Repeated views of the same entity are combined. PDF and sharing remain later-task proposals. Field summaries are not exhaustive runtime DTOs."
        : "Core identities and selected fields only. A completed book is a book-manifest artifact revision; there is no separate Edition collection.",
      "",
      "```mermaid",
      '%%{init: {"theme":"base","themeVariables":{"primaryColor":"#f1f5f9","primaryTextColor":"#172033","primaryBorderColor":"#64748b","lineColor":"#64748b","secondaryColor":"#e2e8f0","tertiaryColor":"#ffffff","clusterBkg":"#ffffff","clusterBorder":"#64748b","edgeLabelBackground":"#ffffff"},"flowchart":{"htmlLabels":false,"useMaxWidth":false}}}%%',
      "flowchart TB",
    ];
    for (const [index, [group]] of groups.entries()) {
      const members = [...selected].filter(
        ([, value]) => value.group === group,
      );
      if (!members.length) continue;
      if (complete) lines.push(`  subgraph group_${index}["${escape(group)}"]`);
      for (const [name, entity] of members) {
        const fields = complete ? entity.fields : entity.fields.slice(0, 3);
        lines.push(
          `    ${id(name)}["${[name, entity.status.join("; "), ...fields].map(escape).join("<br/>")}"]`,
        );
      }
      if (complete) lines.push("  end");
    }
    for (const [from, to, label] of complete
      ? [...coreEdges, ...detailEdges]
      : coreEdges) {
      lines.push(`  ${id(from)} -->|"${escape(label)}"| ${id(to)}`);
    }
    lines.push("```", "");
    const content = lines.join("\n");
    const file = `model-${complete ? "complete" : "core"}-mermaid.md`;
    const target = new URL(
      `../docs/features/booklet-generation/${file}`,
      import.meta.url,
    );
    if (process.argv.includes("--check")) {
      if (readFileSync(target, "utf8") !== content)
        throw new Error(`${file} is stale. Run npm run docs:booklet-model.`);
      console.log(`${file} matches its maintained source.`);
    } else {
      writeFileSync(target, content);
      console.log(`Updated ${file}`);
    }
  }
}
