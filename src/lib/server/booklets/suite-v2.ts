import "server-only";
import { z } from "zod";
import { fingerprint } from "../foundation/canonical";
import { bookletConflict } from "./context";
import { id } from "./documents";
import type { Db } from "mongodb";
import type { AiJob } from "../ai/jobs";
import type { ProductionV2 } from "./documents-v2";

const roles = [
  "story-planner",
  "manuscript",
  "art-director",
  "page-composer",
  "image-executor",
  "quality-reviewer",
] as const;
const binding = z.strictObject({
  appId: z.uuid(),
  workflowId: z.uuid(),
  providerId: id,
  toolName: id,
});
const schema = z.strictObject({
  managerWorkflowId: z.uuid(),
  providerPackages: z
    .array(
      z
        .string()
        .max(256)
        .regex(/^[a-z0-9_-]+\/[a-z0-9_-]+:[A-Za-z0-9._+-]+@[a-f0-9]{64}$/),
    )
    .min(2)
    .max(32),
  children: z.strictObject(
    Object.fromEntries(roles.map((role) => [role, binding])) as Record<
      (typeof roles)[number],
      typeof binding
    >,
  ),
});

/** Validate server-owned readback metadata against the accepted Manager export.
 * This does not query Dify or prove that a mutable remote tool still has this
 * publication. Operator readback must supply the records; no model input may. */
export function validateBookletSuiteV2(
  raw: unknown,
  manager: { workflowId: string; graph: unknown },
) {
  const suite = schema.parse(raw);
  if (suite.managerWorkflowId !== manager.workflowId)
    throw bookletConflict("Suite belongs to another Manager publication.");
  const packageIds = suite.providerPackages.map((value) => value.split(":")[0]);
  if (
    new Set(packageIds).size !== packageIds.length ||
    !["langgenius/openai", "langgenius/openai_tool"].every((name) =>
      packageIds.includes(name),
    )
  )
    throw bookletConflict(
      "Suite requires unambiguous text and image provider package snapshots.",
    );
  const { nodes } = z
    .object({
      nodes: z.array(
        z.object({
          id: z.string(),
          data: z.record(z.string(), z.unknown()),
        }),
      ),
    })
    .parse(manager.graph);
  const toolIdentities = new Set<string>();
  const appIds = new Set<string>();
  const workflowIds = new Set<string>([suite.managerWorkflowId]);
  for (const role of roles) {
    const child = suite.children[role];
    const matches = nodes.filter((node) => node.id === `child-${role}`);
    const data = matches[0]?.data;
    const key = fingerprint([child.providerId, child.toolName]);
    if (
      matches.length !== 1 ||
      data?.type !== "tool" ||
      data.provider_type !== "workflow" ||
      data.provider_id !== child.providerId ||
      data.tool_name !== child.toolName ||
      child.providerId.endsWith("_REQUIRED") ||
      appIds.has(child.appId) ||
      workflowIds.has(child.workflowId) ||
      toolIdentities.has(key)
    )
      throw bookletConflict(
        "Suite child differs from the Manager workflow-tool binding.",
      );
    toolIdentities.add(key);
    appIds.add(child.appId);
    workflowIds.add(child.workflowId);
  }
  return suite;
}

export async function readBookletSuiteV2(
  db: Db,
  production: ProductionV2,
  job: AiJob,
) {
  const run = job.run!;
  const row = await db.collection("bookletWorkflowPolicies").findOne({
    profileId: production.creativeConfigSnapshot.executionProfileId,
    profileRevision: production.creativeConfigSnapshot.executionProfileRevision,
    orchestratorId: run.orchestrator.id,
    configurationRevision: run.configurationRevision,
  });
  if (!row || !run.orchestrator.workflowId)
    throw bookletConflict("Configured booklet suite is unavailable.");
  const suite = validateBookletSuiteV2(row.suite, {
    workflowId: run.orchestrator.workflowId,
    graph: row.managerGraph,
  });
  const reviewer = z
    .strictObject({
      id,
      revision: z.number().int().positive(),
      publicationId: z.uuid(),
    })
    .parse(row.reviewer);
  if (reviewer.publicationId !== suite.children["quality-reviewer"].workflowId)
    throw bookletConflict(
      "Reviewer policy differs from its suite publication.",
    );
  return {
    suite,
    policyBinding: fingerprint(reviewer),
    reviewerBinding: reviewer.publicationId,
  };
}
