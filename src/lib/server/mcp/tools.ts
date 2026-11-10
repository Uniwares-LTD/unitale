import { project, moduleEnabled, moduleIds } from "@/lib/project";
import "server-only";
import { z } from "zod";
import { demoScenarioTools } from "./demo-scenarios";
import { privateTools } from "./private-tools";
import { serverExtensions } from "../../../project/server";
import { extensionTools, validateServerExtensions } from "../extensions";

export const catalogVersion = "1.3.0";
export type ToolContext = {
  clientId: string;
  appName: string;
  requestId: string;
  signal: AbortSignal;
  ownedRun?: import("../ai/jobs").AiJob;
};
export type RegisteredTool = {
  name: string;
  description: string;
  permission: string;
  write?: boolean;
  runContext?: boolean;
  input: z.ZodObject;
  output: z.ZodObject;
  // Pure projection of already-authorized bytes; output must exclude binary carriers.
  images?: (result: Record<string, unknown>) => readonly {
    data: Uint8Array;
    mimeType: string;
  }[];
  run: (
    input: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<Record<string, unknown>>;
};

// Only synthetic, intentionally shareable content belongs in these examples.
const reference = {
  id: "unibase-demo",
  revision: "1",
  title: "Demo observatory visitor guide",
  body: "The fictional Cedar Observatory opens at 19:30 on Fridays. Its visitor password is silver-lantern. Admission includes a telescope demonstration. This is synthetic test data, not a real venue.",
};

const registeredTools: readonly RegisteredTool[] = [
  {
    name: "get_connection_info_v1",
    description:
      "Read the authenticated deployment identity for environment binding.",
    permission: "server:read",
    input: z.strictObject({}),
    output: z.strictObject({
      project: z.string(),
      environment: z.enum(["local", "staging", "production"]),
      origin: z.string(),
    }),
    async run() {
      return {
        project: project.slug,
        environment: z
          .enum(["local", "staging", "production"])
          .parse(process.env.APP_ENV ?? "local"),
        origin: process.env.APP_ORIGIN ?? "http://localhost:3000",
      };
    },
  },
  {
    name: "get_server_info_v1",
    description:
      "Read the public application name and MCP tool catalog version.",
    permission: "server:read",
    input: z.strictObject({}),
    output: z.strictObject({ appName: z.string(), catalogVersion: z.string() }),
    async run(_input, context) {
      return { appName: context.appName, catalogVersion };
    },
  },
  {
    name: "get_reference_document_v1",
    description:
      "Read an allowlisted synthetic reference document for integration testing. Contains no user data.",
    permission: "reference:read",
    input: z.strictObject({ documentId: z.literal("unibase-demo") }),
    output: z.strictObject({
      id: z.string(),
      revision: z.string(),
      title: z.string(),
      body: z.string(),
      requestId: z.string().uuid(),
    }),
    async run(_input, context) {
      context.signal.throwIfAborted();
      return { ...reference, requestId: context.requestId };
    },
  },
  ...demoScenarioTools,
  ...privateTools,
];

validateServerExtensions(
  registeredTools.map((tool) => tool.name),
  serverExtensions,
  moduleIds,
);
export const tools = [
  ...registeredTools.filter(
    (tool) =>
      (project.examples ||
        !["reference:read", "demo:read"].includes(tool.permission)) &&
      (!tool.permission.startsWith("artifact:") ||
        moduleEnabled("artifacts")) &&
      (!tool.permission.startsWith("run:") || moduleEnabled("runs")),
  ),
  ...extensionTools(serverExtensions, moduleEnabled),
];
