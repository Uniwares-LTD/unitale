import { EmptyState, Notice } from "./page-patterns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { DateLabel } from "./localized-value";
import { AdminRefresh } from "./admin-operations";
import type { readDataOperations } from "@/lib/server/data-operations";

type Status = Awaited<ReturnType<typeof readDataOperations>>;
export function DataOperationsPanel({ status }: { status: Status | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment data operations</CardTitle>
        <CardDescription>
          Last recorded evidence. Refresh manually for new reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AdminRefresh />
        {!status ? (
          <Notice tone="error" title="Data-operation status unavailable">
            Refresh or inspect the workflow and authoritative host status. An
            unavailable report does not establish completion or failure.
          </Notice>
        ) : (
          <>
            {status.ledger ? (
              <>
                <p>
                  {status.ledger.appliedCount} ledger IDs;{" "}
                  {status.ledger.pendingCount} pending, including{" "}
                  {status.ledger.requiredCount} required before release.
                </p>
                {status.ledger.pending.length > 0 && (
                  <ul className="list-disc space-y-1 ps-5">
                    {status.ledger.pending.map((row) => (
                      <li key={row.id}>
                        <code dir="ltr" className="break-all">
                          {row.id}
                        </code>{" "}
                        - {row.releasePhase}
                      </li>
                    ))}
                  </ul>
                )}
                {status.ledger.changedCount + status.ledger.unknownCount >
                  0 && (
                  <Notice tone="warning" title="Compatibility review required">
                    Changed checksums or unknown ledger IDs require data-owner
                    review before release.
                  </Notice>
                )}
                {status.ledger.paging.nextOffset !== null && (
                  <p>
                    Additional ledger details are available through the
                    data-operations.status diagnostic capability.
                  </p>
                )}
              </>
            ) : (
              <Notice tone="warning" title="Candidate manifest unavailable">
                Build the migration package to report pending declarations. The
                recorded reports below remain historical evidence.
              </Notice>
            )}
            <p className="text-muted-foreground">
              Ledger IDs alone do not establish verification. When a final
              report is missing, verification is not recorded here. Investigate
              active or unknown operations through workflow and host status.
            </p>
            {status.reports.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operation and revision</TableHead>
                    <TableHead>Recorded result</TableHead>
                    <TableHead>Backup</TableHead>
                    <TableHead>Observed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.reports.map((report) => {
                    const repository = report.image
                      .slice("ghcr.io/".length)
                      .split("@")[0];
                    return (
                      <TableRow key={report.operationId}>
                        <TableCell className="max-w-72 whitespace-normal align-top">
                          <p>
                            <code dir="ltr" className="break-all">
                              {report.operationId}
                            </code>
                          </p>
                          <p>
                            <code dir="ltr" className="break-all">
                              {report.sourceCommit}
                            </code>
                          </p>
                          <a
                            className="underline"
                            href={`https://github.com/${repository}/actions/workflows/data-operations.yml`}
                          >
                            Workflow and status
                          </a>
                        </TableCell>
                        <TableCell className="max-w-72 whitespace-normal align-top">
                          <p>
                            {report.state}; migration {report.migrationOutcome};
                            deployment {report.deploymentOutcome}
                          </p>
                          {report.resolution && (
                            <p>
                              Recovery acknowledged:{" "}
                              {report.resolution.disposition}. Original outcome
                              retained.
                            </p>
                          )}
                          {report.warnings.map((warning, index) => (
                            <p key={index}>{warning}</p>
                          ))}
                        </TableCell>
                        <TableCell className="max-w-72 whitespace-normal align-top">
                          {report.backup?.verified ? (
                            <>
                              Verified archive
                              <p>
                                <code dir="ltr" className="break-all">
                                  {report.backup.backupId}
                                </code>
                              </p>
                            </>
                          ) : (
                            "Verification not recorded"
                          )}
                        </TableCell>
                        <TableCell className="max-w-72 whitespace-normal align-top">
                          <DateLabel value={report.observedAt} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No recorded data operations"
                description="A terminal report appears after approved execution. Use the report/status workflow to investigate a missing or interrupted operation."
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
