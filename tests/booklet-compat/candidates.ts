// Offline candidates only: deliberately not imported by application registries.
// Patterns: agentic-poc real-workflow-graph.ts at SOURCE_REVISION (see report).
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { z } from "zod";
import {
  SOURCE_REVISION,
  specialistInputSchema,
  specialistResultSchema,
  verifySpecialistResult,
  type SpecialistInput,
} from "../../src/project/booklets/workflow-contracts";
import { qualityReviewSchema } from "../../src/project/booklets/contracts";

export const identity = "unitale-offline-adapters@1";
export const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
  "base64",
);
export const source = {
  artifactId: "style",
  revisionId: "style-v1",
  sha256: hash("approved-style"),
};
export const original = { assetId: "original", sha256: hash(png) };
export function childInput(
  task: SpecialistInput["task"] = "J01",
): SpecialistInput {
  const payload = {
    schemaVersion: 1 as const,
    task,
    operationId: "operation-1",
    invocationId: "invocation-1",
    parentWorkflowRunId: "parent-run",
    publicationId: `offline-${task}-v1`,
    subject: { kind: "book" as const, id: "book-1" },
    instruction: "Make a short story.",
    sources: [
      {
        revision: source,
        content: {
          kind: "style" as const,
          direction: "Ink",
          palette: ["blue"],
          typography: "Clear",
          continuity: ["Blue ink"],
        },
      },
    ],
    references: [
      {
        subject: { kind: "style-sample" as const, id: "style-1" },
        revision: source,
        asset: original,
        nativeFileId: "file-1",
      },
    ],
  };
  return specialistInputSchema.parse({
    ...payload,
    inputFingerprint: hash(JSON.stringify(payload)),
  });
}

type Selector = string[];
export type Node = {
  id: string;
  type: "custom";
  position: { x: number; y: number };
  data: Record<string, unknown> & { type: string };
};
const noRetry = { retry_enabled: false, max_retries: 0, retry_interval: 0 };
function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): Node {
  return {
    id,
    type: "custom",
    position: { x: 0, y: 0 },
    data: { type, title: id, ...data },
  };
}
function graph(nodes: Node[]) {
  return {
    sourceRevision: SOURCE_REVISION,
    fixtureIdentity: "unitale-booklet-candidates@1",
    nodes,
    edges: nodes.slice(1).map((n, i) => ({
      id: `${nodes[i].id}-${n.id}`,
      source: nodes[i].id,
      target: n.id,
      sourceHandle: "source",
      targetHandle: "target",
      type: "custom",
      data: { sourceType: nodes[i].data.type, targetType: n.data.type },
    })),
  };
}

// Executed directly from the generated node in the harness, not a TS reimplementation.
const consume = `function main({result, invocation, observedRunId, step, maxSteps}) {
  if (!Number.isInteger(step) || !Number.isInteger(maxSteps) || step < 0 || maxSteps < 1 || maxSteps > 8 || step >= maxSteps)
    throw new Error('Bounded loop exhausted');
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Structured object required');
  if (JSON.stringify(result).length > 8192) throw new Error('Output limit exceeded');
  for (const key of ['operationId','invocationId','publicationId','inputFingerprint'])
    if (result[key] !== invocation[key]) throw new Error('Invocation mismatch');
  if (result.workflowRunId !== observedRunId) throw new Error('Execution mismatch');
  return {result, nextStep: step + 1};
}`;
export function candidates() {
  const child = (role: "text" | "image" | "reviewer") =>
    graph([
      node("start", "start", {
        variables: [
          { variable: "invocation", type: "paragraph", required: true },
          {
            variable: "reference_files",
            type: "file-list",
            allowed_file_types: ["image"],
            required: role !== "text",
          },
        ],
      }),
      node("prepare", "code", {
        code_language: "javascript",
        code: `function main({invocation}) {
      if (typeof invocation !== 'string' || invocation.length > 8192) throw new Error('Input limit exceeded');
      return {invocation: JSON.parse(invocation), step: 0, maxSteps: 8};
    }`,
        variables: [
          { variable: "invocation", value_selector: ["start", "invocation"] },
        ],
        outputs: {
          invocation: { type: "object" },
          step: { type: "number" },
          maxSteps: { type: "number" },
        },
      }),
      node("provider", "tool", {
        provider_type: "builtin",
        provider_id: identity,
        tool_name: role,
        retry_config: noRetry,
        tool_parameters: {
          invocation: { type: "variable", value: ["prepare", "invocation"] },
          files: { type: "variable", value: ["start", "reference_files"] },
          observedRunId: {
            type: "variable",
            value: ["sys", "workflow_run_id"],
          },
          adapterIdentity: { type: "constant", value: identity },
          timeoutMs: { type: "constant", value: 1000 },
          maxBytes: { type: "constant", value: 8192 },
        },
      }),
      node("consume", "code", {
        code_language: "javascript",
        code: consume,
        retry_config: noRetry,
        variables: [
          {
            variable: "result",
            value_selector: ["provider", "structured_output"],
          },
          { variable: "invocation", value_selector: ["prepare", "invocation"] },
          {
            variable: "observedRunId",
            value_selector: ["sys", "workflow_run_id"],
          },
          { variable: "step", value_selector: ["prepare", "step"] },
          { variable: "maxSteps", value_selector: ["prepare", "maxSteps"] },
        ],
        outputs: { result: { type: "object" }, nextStep: { type: "number" } },
      }),
      node("end", "end", {
        outputs: [
          {
            variable: "result",
            value_type: "object",
            value_selector: ["consume", "result"],
          },
        ],
      }),
    ]);
  return {
    parent: graph([
      node("start", "start", {
        variables: [
          { variable: "unibase_context", type: "paragraph", required: true },
        ],
      }),
      node("context", "tool", {
        provider_type: "mcp",
        provider_id: "unitale-mcp-candidate",
        tool_name: "booklet_context_v1",
        tool_parameters: {
          context: { type: "variable", value: ["start", "unibase_context"] },
        },
      }),
      ...["text", "image", "reviewer"].map((role) =>
        node(role, "tool", {
          provider_type: "workflow",
          tool_name: `offline-${role}`,
          retry_config: noRetry,
          tool_parameters: {
            invocation: { type: "variable", value: ["context", "invocation"] },
            reference_files: {
              type: "variable",
              value: ["context", "reference_files"],
            },
          },
        }),
      ),
      node("decision", "human-input", {
        delivery_methods: [{ type: "webapp", enabled: true }],
        form_content: "Review these exact revisions",
        inputs: [{ type: "paragraph", output_variable_name: "response" }],
        user_actions: [{ id: "continue", title: "Continue" }],
      }),
      node("end", "end", {
        outputs: [
          {
            variable: "result",
            value_type: "object",
            value_selector: ["reviewer", "result"],
          },
        ],
      }),
    ]),
    text: child("text"),
    image: child("image"),
    reviewer: child("reviewer"),
  };
}

export type Values = Record<string, Record<string, unknown>>;
export function select(values: Values, selector: Selector): unknown {
  if (
    selector.length !== 2 ||
    !Object.hasOwn(values[selector[0]] ?? {}, selector[1])
  )
    throw new Error(`Missing selector ${selector.join(".")}`);
  return values[selector[0]][selector[1]];
}
export function parameters(n: Node, values: Values) {
  const bindings = z
    .record(
      z.string(),
      z.discriminatedUnion("type", [
        z.strictObject({
          type: z.literal("variable"),
          value: z.array(z.string()).length(2),
        }),
        z.strictObject({
          type: z.literal("constant"),
          value: z.union([z.string(), z.number()]),
        }),
      ]),
    )
    .parse(n.data.tool_parameters);
  return Object.fromEntries(
    Object.entries(bindings).map(([key, binding]) => [
      key,
      binding.type === "variable"
        ? select(values, binding.value)
        : binding.value,
    ]),
  );
}
export function executeCode(n: Node, values: Values): Record<string, unknown> {
  if (n.data.code_language !== "javascript")
    throw new Error("Unsupported candidate language");
  const variables = z
    .array(
      z.object({ variable: z.string(), value_selector: z.array(z.string()) }),
    )
    .parse(n.data.variables);
  const args = Object.fromEntries(
    variables.map((v) => [v.variable, select(values, v.value_selector)]),
  );
  // vm is only an offline runner for trusted checked-in code, not an untrusted-code security boundary.
  const result = runInNewContext(
    `${n.data.code}\nJSON.stringify(main(args))`,
    { args },
    { timeout: 100 },
  );
  return JSON.parse(result);
}

const nativeFile = z.strictObject({
  id: z.string().min(1),
  dify_model_identity: z.literal("__dify__file__"),
  type: z.literal("image"),
  mime_type: z.literal("image/png"),
  bytes: z.instanceof(Uint8Array),
});
const adapterParameters = z.strictObject({
  invocation: specialistInputSchema,
  files: z.array(nativeFile),
  observedRunId: z.string().min(1),
  adapterIdentity: z.literal(identity),
  timeoutMs: z.number().int().positive().max(1000),
  maxBytes: z.number().int().positive().max(8192),
});
export const files = () => [
  {
    id: "file-1",
    dify_model_identity: "__dify__file__" as const,
    type: "image" as const,
    mime_type: "image/png" as const,
    bytes: Uint8Array.from(png),
  },
];

// Reviewer wire envelope is provisional until T19, reusing T01's quality record.
export const reviewResultSchema = specialistResultSchema
  .omit({ proposal: true })
  .extend({ review: qualityReviewSchema });
export function verifyReview(
  input: SpecialistInput,
  value: unknown,
  observed: string,
) {
  const result = reviewResultSchema.parse(value);
  const { review, ...binding } = result;
  verifySpecialistResult(
    input,
    { ...binding, proposal: { kind: "page-image", asset: review.asset } },
    observed,
  );
  if (
    JSON.stringify(review.asset) !==
      JSON.stringify(input.references[0]?.asset) ||
    JSON.stringify(review.target) !==
      JSON.stringify(input.references[0]?.revision) ||
    JSON.stringify(review.sources) !==
      JSON.stringify(input.sources.map((s) => s.revision)) ||
    review.operationId !== input.operationId
  )
    throw new Error("Review evidence mismatch");
  return result;
}

export function fakeAdapter(
  role: "text" | "image" | "reviewer",
  raw: unknown,
  mode: "ok" | "unknown" | "malformed" = "ok",
) {
  const p = adapterParameters.parse(raw);
  if (p.files.length !== p.invocation.references.length)
    throw new Error("Missing native references");
  p.files.forEach((file, i) => {
    const ref = p.invocation.references[i];
    if (
      file.id !== ref.nativeFileId ||
      file.bytes.length > p.maxBytes ||
      hash(file.bytes) !== ref.asset.sha256
    )
      throw new Error(
        "Native reference identity, order, hash or byte limit mismatch",
      );
  });
  if (role !== "text" && !p.files.length)
    throw new Error("Original image required");
  if (role === "reviewer" && !p.invocation.sources.length)
    throw new Error("Approved sources required");
  if (mode === "unknown") return { kind: "unknown" as const };
  const proposal =
    role === "text"
      ? {
          kind: "concept",
          title: "Moon",
          premise: "A quiet trip",
          theme: "Friendship",
          tone: "Warm",
          constraints: [],
        }
      : {
          kind: "reference",
          description: "Ink sample",
          requiredFeatures: ["Blue ink"],
          asset: { assetId: "generated-original", sha256: hash(png) },
        };
  const result = {
    schemaVersion: 1,
    operationId: p.invocation.operationId,
    invocationId: p.invocation.invocationId,
    publicationId: p.invocation.publicationId,
    inputFingerprint: p.invocation.inputFingerprint,
    workflowRunId: p.observedRunId,
    proposal,
    evidenceIds: ["evidence-1"],
  };
  const review =
    role === "reviewer"
      ? qualityReviewSchema.parse({
          schemaVersion: 1,
          id: "review-1",
          productionId: "production-1",
          operationId: p.invocation.operationId,
          target: p.invocation.references[0].revision,
          asset: p.invocation.references[0].asset,
          sources: p.invocation.sources.map((s) => s.revision),
          policy: {
            id: "offline-policy",
            revision: 1,
            publicationId: p.invocation.publicationId,
          },
          disposition: "pass",
          findings: [],
          evidenceIds: ["evidence-1"],
          createdAt: "2026-11-03T00:00:00.000Z",
        })
      : null;
  const binding = {
    schemaVersion: result.schemaVersion,
    operationId: result.operationId,
    invocationId: result.invocationId,
    publicationId: result.publicationId,
    inputFingerprint: result.inputFingerprint,
    workflowRunId: result.workflowRunId,
    evidenceIds: result.evidenceIds,
  };
  const structured = review ? { ...binding, review } : result;
  if (Buffer.byteLength(JSON.stringify(structured)) > p.maxBytes)
    throw new Error("Output byte limit exceeded");
  return {
    kind: "ok" as const,
    structured_output: mode === "malformed" ? "not-an-object" : structured,
    usage: {
      provider: "offline",
      model: `fake-${role}-v1`,
      inputTokens: 12,
      outputTokens: 8,
      providerCost: null,
      elapsedMs: 3,
      requestId: "fake-request-1",
    },
    image: role === "image" ? Uint8Array.from(png) : null,
    review,
  };
}
export function runChild(role: "text" | "image" | "reviewer", values: Values) {
  const nodes = candidates()[role].nodes;
  values.prepare = executeCode(nodes[1], values);
  const outcome = fakeAdapter(role, parameters(nodes[2], values));
  if (outcome.kind !== "ok") throw new Error("Reconciliation required");
  values.provider = { structured_output: outcome.structured_output };
  const consumed = executeCode(nodes[3], values);
  values.consume = consumed;
  const endOutputs = z
    .array(
      z.strictObject({
        variable: z.string(),
        value_type: z.literal("object"),
        value_selector: z.array(z.string()).length(2),
      }),
    )
    .parse(nodes[4].data.outputs);
  const outputs = Object.fromEntries(
    endOutputs.map((output) => [
      output.variable,
      select(values, output.value_selector),
    ]),
  );
  const verify = role === "reviewer" ? verifyReview : verifySpecialistResult;
  verify(
    specialistInputSchema.parse(values.prepare.invocation),
    outputs.result,
    String(values.sys.workflow_run_id),
  );
  return { ...outcome, consumed, outputs };
}
