import "server-only";

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type ProviderStatus =
  | "running"
  | "paused"
  | "succeeded"
  | "partial-succeeded"
  | "failed"
  | "stopped";
export type ProviderFailure =
  | "authentication"
  | "invalid-request"
  | "rate-limit"
  | "unavailable"
  | "invalid-response"
  | "timeout"
  | "transport";
export type UsageObservation = {
  // Never sum execution summaries with the individual nodes they summarize.
  scope: "execution" | "node" | "message";
  id: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: { amount: string; currency: string; source: "provider" } | null;
  elapsedMs: number | null;
};
export type ProviderExecution = {
  runId: string;
  workflowId: string | null;
  status: ProviderStatus;
  outputs: Record<string, Json> | null;
  // Safe, fixed diagnostic summary, never the raw provider error.
  failure?: string | null;
  usage: UsageObservation;
};
// Private server observation; never a public Run event or diagnostic payload.
export type ProviderNodeObservation = {
  runId: string;
  id: string;
  nodeId: string;
  nodeType: string | null;
  status: string;
  retryIndex: number | null;
  iterationId: string | null;
  loopId: string | null;
  outputs: Record<string, Json> | null;
  outputsTruncated: boolean | null;
  error: string | null;
  executionMetadata: Record<string, Json> | null;
};
export type ProviderEvent =
  | { type: "node-observation"; node: ProviderNodeObservation }
  | {
      type: "stage";
      id: string;
      nodeId: string;
      title: string;
      status: "running" | "succeeded" | "failed";
      elapsedMs: number | null;
    }
  | { type: "decision"; nodeId: string; title: string; token: string }
  | { type: "decision-expired"; nodeId: string }
  | {
      type: "decision-filled";
      nodeId: string;
      action: string;
      inputs: Record<string, Json>;
    }
  | {
      type: "identity";
      runId: string;
      taskId: string;
    }
  | { type: "execution"; execution: ProviderExecution }
  | { type: "usage"; usage: UsageObservation };
export type ProviderOutcome<T> =
  | { kind: "ok"; value: T }
  | {
      kind: "rejected" | "unknown";
      failure: ProviderFailure;
      retryAfterMs?: number;
      evidence?: T;
    };
export type WorkflowInput = {
  user: string;
  inputs: Record<string, Json>;
};
export interface WorkflowProvider {
  stream?(
    runId: string,
    user: string,
    observe: (event: ProviderEvent) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ProviderOutcome<ProviderExecution>>;
  form?(token: string): Promise<unknown>;
  submit?(
    token: string,
    user: string,
    action: string,
    inputs: Record<string, Json>,
  ): Promise<void>;
  start(
    input: WorkflowInput,
    observe: (event: ProviderEvent) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ProviderOutcome<ProviderExecution>>;
  retrieve(
    runId: string,
    signal?: AbortSignal,
  ): Promise<ProviderOutcome<ProviderExecution>>;
  stop(
    taskId: string,
    user: string,
    signal?: AbortSignal,
  ): Promise<ProviderOutcome<void>>;
}
