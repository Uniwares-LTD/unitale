import "server-only";
import { z } from "zod";
import {
  diagnosticCapabilities,
  type DiagnosticCapability,
} from "../../contracts/diagnostics";
import { define, type CapabilityDefinition } from "./context";
import {
  configurationCheck,
  runtimeStatus,
  workersStatus,
} from "./capabilities/runtime";
import {
  runContent,
  runDiagnose,
  runGet,
  runSearch,
} from "./capabilities/runs";
import {
  accountGet,
  accountSearch,
  creditsGet,
  creditsHolds,
  creditsLedger,
  paymentsGet,
  paymentsSearch,
} from "./capabilities/accounts";
import {
  artifactContent,
  artifactGet,
  artifactRevisions,
  artifactSearch,
  fileGet,
  fileSearch,
  notificationsGet,
  notificationsSearch,
} from "./capabilities/content";
import {
  orchestratorGet,
  orchestratorSearch,
  personaGet,
  personaSearch,
  reportsGet,
  reportsSearch,
  settingsGet,
} from "./capabilities/administration";

import { dataOperationsStatus } from "./capabilities/data-operations";

const capabilitiesList = define({
  description: "Capabilities this grant permits, with scope and inputs.",
  inputs: {},
  input: z.strictObject({}),
  async run(context) {
    return {
      grantId: context.operator.grantId,
      expiresAt: new Date(context.operator.expiresAt).toISOString(),
      capabilities: Object.entries(registry)
        .filter(([name]) => context.operator.capabilities.has(name))
        .map(([name, definition]) => ({
          name,
          scope: diagnosticCapabilities[name as DiagnosticCapability],
          description: definition.description,
          inputs: definition.inputs,
        })),
    };
  },
});

/** Typed, closed registry: every contract capability has exactly one handler. */
export const registry: Record<DiagnosticCapability, CapabilityDefinition> = {
  "capabilities.list": capabilitiesList,
  "runtime.status": runtimeStatus,
  "data-operations.status": dataOperationsStatus,
  "workers.status": workersStatus,
  "configuration.check": configurationCheck,
  "reports.search": reportsSearch,
  "reports.get": reportsGet,
  "run.search": runSearch,
  "run.get": runGet,
  "run.diagnose": runDiagnose,
  "run.content": runContent,
  "account.search": accountSearch,
  "account.get": accountGet,
  "credits.get": creditsGet,
  "credits.ledger": creditsLedger,
  "credits.holds": creditsHolds,
  "payments.search": paymentsSearch,
  "payments.get": paymentsGet,
  "file.search": fileSearch,
  "file.get": fileGet,
  "artifact.search": artifactSearch,
  "artifact.get": artifactGet,
  "artifact.revisions": artifactRevisions,
  "artifact.content": artifactContent,
  "notifications.search": notificationsSearch,
  "notifications.get": notificationsGet,
  "orchestrator.search": orchestratorSearch,
  "orchestrator.get": orchestratorGet,
  "persona.search": personaSearch,
  "persona.get": personaGet,
  "settings.get": settingsGet,
};
