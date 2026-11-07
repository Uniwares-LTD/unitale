// Canonical drawing source for the proposed model. See docs/features/booklet-generation/model.md.
// No runtime dependency or external renderer is required.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reviewViews } from "./booklet-model-review-data.mjs";
import { renderMermaidModels } from "./booklet-model-mermaid.mjs";

const sections = [
  {
    title: "1. Creative content",
    note: "A stable subject has several creative responsibilities; each artifact has immutable revisions.",
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
    entities: [
      [
        "Booklet",
        "C: contract only",
        [
          "id [PK]",
          "ownerId",
          "title",
          "currentProductionId [FK]",
          "version",
          "createdAt",
          "deletedAt?",
          "recoverUntil?",
        ],
      ],
      [
        "Production",
        "C: contract; refinement proposed",
        [
          "id [PK]",
          "bookletId [FK]",
          "orderId [FK]",
          "sourceProductionId? [FK]",
          "creativeConfigSnapshot",
          "brief",
          "lifecycleState",
          "stageLocks",
          "activeRunId? [FK]",
          "currentManifestRevisionId? [FK]",
          "version / createdAt / expiresAt?",
        ],
      ],
      [
        "Subject",
        "P: proposed entity",
        [
          "id [PK]",
          "productionId [FK]",
          "kind",
          "label",
          "pageRole?",
          "",
          "Kinds: book, character, location,",
          "style-sample, page",
          "",
          "Stable identity; no page position.",
        ],
      ],
      [
        "Artifact",
        "C: contract; refinement proposed",
        [
          "id [PK]",
          "subjectId [FK]",
          "kind",
          "currentRevisionId? [FK]",
          "acceptedRevisionId? [FK]",
          "version",
          "",
          "Examples: description, reference,",
          "manuscript, page-plan, page-image,",
          "book-manifest",
        ],
      ],
      [
        "Artifact revision",
        "C: contract; refined shape P",
        [
          "id [PK]",
          "artifactId [FK]",
          "operationId [FK]",
          "ordinal",
          "typedContent",
          "contentHash",
          "evidenceRefs[]",
          "createdAt",
          "",
          "Immutable content and provenance.",
        ],
      ],
    ],
  },
  {
    title: "2. Work and measurements",
    note: "One authorized operation may have several attempts. Retrying never silently creates another customer charge.",
    links: [
      [1, 2],
      [2, 3],
    ],
    entities: [
      [
        "Run",
        "I: Unibase service",
        [
          "id [PK]",
          "ownerId",
          "executionState",
          "",
          "Hosts execution attempts.",
          "Several Runs may continue",
          "the same paid production.",
        ],
      ],
      [
        "Operation",
        "C: contract; refinement proposed",
        [
          "id [PK]",
          "productionId [FK]",
          "subjectId [FK]",
          "kind / state",
          "idempotencyKey / inputHash",
          "fundingKind",
          "allocationId? [FK]",
          "failedReviewId? [FK]",
          "repairOrdinal?",
          "",
          "Funding: production, revision, repair",
        ],
      ],
      [
        "Execution attempt",
        "P: proposed entity",
        [
          "id [PK]",
          "operationId [FK]",
          "runId [FK]",
          "attemptNumber",
          "invocationId",
          "workflowRunId?",
          "publicationId",
          "outcome",
          "startedAt? / completedAt?",
          "",
          "Unknown outcomes need reconciliation.",
        ],
      ],
      [
        "Execution measurement",
        "I: Unibase; attempt link P",
        [
          "id [PK]",
          "operationId [FK] / attemptId [FK]",
          "provider / model? / requestId?",
          "inputTokens? / outputTokens?",
          "additionalUsage[]",
          "reportedCost? / estimatedCost?",
          "pricing provenance / currency",
          "queuedAt? / startedAt? / completedAt?",
          "elapsedMs? / providerDurationMs?",
          "outcome / authority / scope",
          "evidenceRefs[]",
        ],
      ],
    ],
  },
  {
    title: "3. Decisions, quality and original bytes",
    note: "Approval and quality bind exact revisions. Original assets are durable content, not disposable diagnostic logs.",
    links: [[0, 1]],
    entities: [
      [
        "Human decision",
        "C: contract; refined shape P",
        [
          "id [PK]",
          "productionId [FK]",
          "actorId [FK]",
          "runId [FK]",
          "formId / submissionId",
          "action",
          "answerOrInstruction?",
          "quoteId? [FK]",
          "submittedAt",
          "",
          "Actions: approve, clarify, revise",
        ],
      ],
      [
        "Decision target",
        "P: embedded relationship",
        [
          "decisionId [FK]",
          "revisionId [FK]",
          "",
          "A decision can concern many",
          "exact artifact revisions.",
          "Clarification may have no target.",
        ],
      ],
      [
        "Quality review",
        "C: contract only",
        [
          "id [PK]",
          "productionId [FK]",
          "targetRevisionId [FK]",
          "operationId [FK]",
          "policyRevisionId [FK]",
          "asset identity + source identities",
          "disposition",
          "findings[] / evidenceRefs[]",
          "createdAt",
          "",
          "Disposition: pass, repair, blocked",
        ],
      ],
      [
        "Original asset receipt",
        "C: receipt; reuse storage",
        [
          "id [PK]",
          "operationId [FK]",
          "storageObjectId [FK; private]",
          "sha256 / mime / bytes",
          "width / height",
          "provenanceEvidenceRef",
          "retainedAt",
          "",
          "Storage locator stays server-side.",
          "Display derivatives are separate.",
        ],
      ],
    ],
  },
  {
    title: "4. Commerce and bounded relationships",
    note: "Orders and allocations reuse Unibase. Relationship rows can be embedded arrays; they do not imply collections.",
    links: [[0, 1]],
    entities: [
      [
        "Consumption order",
        "I: Unibase service",
        [
          "id [PK]",
          "ownerId",
          "acceptedTermsSnapshot",
          "chargedCredits",
          "state",
          "",
          "Authoritative commercial terms",
          "and charge identity.",
        ],
      ],
      [
        "Entitlement allocation",
        "I: Unibase service",
        [
          "id [PK]",
          "orderId [FK]",
          "requestId",
          "subjectId",
          "category / units / state",
          "",
          "Categories: story, style,",
          "reference, page",
          "",
          "Idempotent allocation per subject.",
        ],
      ],
      [
        "Revision source",
        "P: embedded relationship",
        [
          "revisionId [FK]",
          "sourceRevisionId [FK]",
          "role",
          "",
          "Exact dependency identity.",
          "Roles: story, style, character,",
          "location, layout",
        ],
      ],
      [
        "Revision asset",
        "P: embedded relationship",
        [
          "revisionId [FK]",
          "assetId [FK]",
          "role",
          "",
          "Roles: original, reference",
          "Hashes fence the original bytes.",
        ],
      ],
      [
        "Manifest page entry",
        "C: embedded manifest payload",
        [
          "subjectId [FK]",
          "role / position",
          "imageRevisionId [FK]",
          "assetId [FK]",
          "qualityReviewId [FK]",
          "approvalDecisionId [FK]",
          "",
          "Manifest typedContent also holds",
          "title, language, accepted sources.",
          "No separate Edition collection.",
        ],
      ],
    ],
  },
];

const relationships = [
  "Booklet 1 -> many Productions; each Production has one owning Booklet.",
  "Production 1 -> many Subjects, Operations and Human decisions.",
  "Production 1 -> many Runs through the owned continuation binding.",
  "Subject 1 -> many Artifacts; Artifact 1 -> many immutable Revisions.",
  "Operation 1 -> many Attempts and resulting Artifact revisions.",
  "Run 1 -> many Attempts; Attempt 1 -> many per-call Measurements.",
  "Decision 1 -> many Targets; each Target references one exact Revision.",
  "Revision 1 -> many Quality reviews; each review names its operation.",
  "Revision sources reference other exact Revisions (dependency graph).",
  "Revision asset links connect Revisions to retained Original assets.",
  "Consumption order 1 -> zero or one Production, and many Allocations.",
  "Allocation 1 -> many funded Operations; other funding has no allocation.",
  "Manifest revision 1 -> many ordered entries with exact acceptance evidence.",
  "Current/accepted pointers refer to revisions of the same owned Artifact.",
  "Production source points to an earlier Production, never to itself.",
  "Ownership and reference validity are enforced by services, not by arrows.",
];

function render(view) {
  const { sections, relationships } = view;
  for (const section of sections) {
    if (
      section.entities.length > 5 ||
      section.entities.some((entity) => entity[2].length > 11)
    ) {
      throw new Error(`${view.file}: split overflowing cards into another row.`);
    }
  }
  const esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const width = 1880;
  const cardWidth = 320;
  const cardHeight = 350;
  const gap = 48;
  const rowHeight = 438;
  const parts = [];
  const label = (x, y, value, size = 17, color = "#172033", weight = 400) =>
    parts.push(
      `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${esc(value)}</text>`,
    );
  const relationTop = 180 + sections.length * rowHeight + 38;
  const relationRows = Math.ceil(relationships.length / 2);
  const height = relationTop + 90 + relationRows * 35;
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
  );
  parts.push(
    `<title id="title">${esc(view.title)}: entities, fields and relationships</title>`,
  );
  parts.push(
    '<desc id="description">Proposed logical model, not an implemented database schema. Groups show the entities and review fields for this model view. A relationship register specifies cross-group links. Fixed dark text on light backgrounds avoids theme-dependent unreadable rows.</desc>',
  );
  parts.push(
    '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#334155"/></marker></defs>',
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#f1f5f9"/>`);
  parts.push('<g font-family="Arial, Helvetica, sans-serif">');
  label(36, 48, view.title, 32, "#0f172a", 700);
  label(
    36,
    82,
    "PROPOSED DESIGN — under review, not a collection or migration specification",
    20,
    "#92400e",
    700,
  );
  label(
    36,
    112,
    "PK = primary identity   FK = reference   ? = optional/nullable   [] = list   1:N arrows show one-to-many ownership",
    17,
  );
  label(36, 138, view.scope, 17);

  for (const [sectionIndex, section] of sections.entries()) {
    const top = 180 + sectionIndex * rowHeight;
    label(36, top, section.title, 24, "#0f172a", 700);
    label(36, top + 28, section.note, 17);
    const y = top + 48;
    for (const [i, [name, status, fields]] of section.entities.entries()) {
      const x = 36 + i * (cardWidth + gap);
      parts.push(
        `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="8" fill="#ffffff" stroke="#64748b" stroke-width="1.5"/>`,
      );
      parts.push(
        `<path d="M${x + 8},${y} H${x + cardWidth - 8} Q${x + cardWidth},${y} ${x + cardWidth},${y + 8} V${y + 72} H${x} V${y + 8} Q${x},${y} ${x + 8},${y}Z" fill="#17324d"/>`,
      );
      label(x + 14, y + 29, name, 21, "#ffffff", 700);
      label(x + 14, y + 53, status, 14, "#e2e8f0");
      for (const [j, field] of fields.entries()) {
        if (field && j % 2 === 0)
          parts.push(
            `<rect x="${x + 1}" y="${y + 79 + j * 24}" width="${cardWidth - 2}" height="24" fill="#eef2f6"/>`,
          );
        label(x + 14, y + 97 + j * 24, field, 16);
      }
    }
    for (const [from, to] of section.links) {
      const start = 36 + from * (cardWidth + gap) + cardWidth + 3;
      const end = 36 + to * (cardWidth + gap) - 5;
      const cy = y + 170;
      parts.push(
        `<path d="M${start},${cy} H${end}" fill="none" stroke="#334155" stroke-width="2" marker-end="url(#arrow)"/>`,
      );
      label(start + 5, cy - 10, "1:N", 13, "#334155", 700);
    }
  }
  label(
    36,
    relationTop,
    "Cross-group relations and invariants",
    24,
    "#0f172a",
    700,
  );
  for (const [i, relation] of relationships.entries()) {
    const col = i < relationRows ? 0 : 1;
    label(
      36 + col * 930,
      relationTop + 38 + (i % relationRows) * 35,
      relation,
      16,
    );
  }
  label(
    36,
    height - 30,
    "Maintained source: scripts/booklet-model-diagram.mjs  |  Guide: docs/features/booklet-generation/model.md",
    17,
    "#334155",
  );
  parts.push("</g></svg>");
  const svg = `${parts.join("\n")}\n`;
  const target = fileURLToPath(
    new URL(
      `../docs/features/booklet-generation/${view.file}`,
      import.meta.url,
    ),
  );
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== svg) {
      throw new Error(`${view.file} is stale. Run npm run docs:booklet-model.`);
    }
    console.log(`${view.file} matches its maintained source.`);
  } else {
    writeFileSync(target, svg);
    console.log(`Updated ${view.file}`);
  }
}

render({
  file: "model.svg",
  title: "Unitale booklet model",
  scope:
    "Overview only. I = implemented service; C = contract only; P = proposed. See the guide for detailed review views.",
  sections,
  relationships,
});
for (const view of reviewViews) render(view);
renderMermaidModels(sections, reviewViews);
