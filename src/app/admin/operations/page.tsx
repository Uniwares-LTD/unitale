import { DataOperationsPanel } from "@/components/data-operations-panel";
import { currentDataOperations } from "@/lib/server/data-operations";
import { formatAdminNumber } from "@/lib/admin-labels";
import { DateLabel } from "@/components/localized-value";
import { AdminStateLabel as StateLabel } from "@/components/admin-state-label";
import { PageMessages } from "@/components/page-messages";

import Link from "next/link";
import { moduleEnabled } from "@/lib/project";
import { EmptyState, PageHeader } from "@/components/page-patterns";
import { AdminCleanup, PaymentReview } from "@/components/admin-operations";
import { adminPageSession } from "@/lib/server/admin-view";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  operationsSummary,
  cleanupReports,
  paymentOperations,
} from "@/lib/server/operations";
import { readSettings } from "@/lib/server/settings";
export async function generateMetadata() {
  return { title: "Operations" };
}
export default async function OperationsPage() {
  await adminPageSession();
  const { settings } = await readSettings();
  const [summary, reports, payments, dataOperations] = await Promise.all([
    operationsSummary(),
    cleanupReports(),
    paymentOperations(),
    currentDataOperations().catch(() => null),
  ]);
  return (
    <PageMessages path="/admin/operations">
      <div className="page-stack">
        <PageHeader
          title="Operations"
          description="Worker health, payment recovery and content cleanup. Changes require administrator access."
          actions={
            moduleEnabled("runs") && (
              <Button variant="outline" asChild>
                <Link href="/admin/ai">Review uncertain AI executions</Link>
              </Button>
            )
          }
        />
        <DataOperationsPanel status={dataOperations} />
        <Card>
          <CardHeader>
            <CardTitle>Workers and queues</CardTitle>
            <CardDescription>
              A worker is unhealthy after five minutes without progress or after
              a failed cycle. Refresh for current readings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.workers.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.workers.map((w) => (
                    <TableRow key={w.kind}>
                      <TableCell>
                        <StateLabel value={w.kind} />
                      </TableCell>
                      <TableCell>
                        <StateLabel value={w.state} />
                      </TableCell>
                      <TableCell>
                        {w.ageSeconds === null
                          ? "Not reported"
                          : w.ageSeconds + " seconds ago"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No worker readings"
                description="Workers report here after their first cycle."
              />
            )}
            <p>
              {summary.paymentPending
                ? (summary.paymentPending === 1
                    ? formatAdminNumber(summary.paymentPending) +
                      " payment notification pending"
                    : formatAdminNumber(summary.paymentPending) +
                      " payment notifications pending") +
                  ", oldest " +
                  (summary.paymentAgeSeconds ?? 0) +
                  " seconds ago."
                : "No payment notifications are pending."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Manual payment reconciliation</CardTitle>
            <CardDescription>
              An attempt that started but never reported back needs review.
              Check Stripe, then retry verification. Never grant credits from a
              browser return URL alone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PaymentReview enabled={summary.stripeEnabled} />
            <section className="space-y-3">
              <h3 className="font-semibold">
                Oldest 25 pending or disputed orders
              </h3>
              {payments.orders.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">
                          <bdi>{o.id}</bdi>
                        </TableCell>
                        <TableCell>
                          <StateLabel value={o.status} />
                        </TableCell>
                        <TableCell>
                          <Link
                            className="font-mono text-xs underline"
                            href={`/admin/users/${encodeURIComponent(o.uid)}`}
                          >
                            <bdi>{o.uid}</bdi>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="No pending or disputed orders."
                  description="Orders that need attention appear here."
                />
              )}
            </section>
            <section className="space-y-3">
              <h3 className="font-semibold">Latest 20 review attempts</h3>
              {payments.reviews.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.reviews.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          <bdi>{r.orderId}</bdi>
                        </TableCell>
                        <TableCell>
                          <StateLabel value={r.state} />
                        </TableCell>
                        <TableCell>
                          <DateLabel value={r.createdAt} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="No review attempts yet"
                  description="Verification attempts appear here after you run one."
                />
              )}
            </section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Local AI cleanup</CardTitle>
            <CardDescription>
              Approved storage removals retry automatically. Refresh to update
              reports; if a removal keeps failing, check the maintenance worker
              and storage permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AdminCleanup defaultDays={settings.runs.cleanupDays} />
            <section className="space-y-3">
              <h3 className="font-semibold">Latest 20 cleanup reports</h3>
              {reports.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Removed content</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Storage removals</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <DateLabel value={r.createdAt} />
                        </TableCell>
                        <TableCell>
                          <StateLabel value={r.state} />
                        </TableCell>
                        <TableCell>
                          {(r.jobs === 1
                            ? formatAdminNumber(r.jobs) + " execution"
                            : formatAdminNumber(r.jobs) + " executions") +
                            ", " +
                            (r.files === 1
                              ? formatAdminNumber(r.files) + " upload"
                              : formatAdminNumber(r.files) + " uploads") +
                            ", " +
                            (r.abandonedUploads === 1
                              ? formatAdminNumber(r.abandonedUploads) +
                                " abandoned upload"
                              : formatAdminNumber(r.abandonedUploads) +
                                " abandoned uploads")}
                        </TableCell>
                        <TableCell>
                          {r.changed +
                            " changed or queued, " +
                            r.skipped +
                            " skipped"}
                        </TableCell>
                        <TableCell>
                          {r.storageDeleted +
                            " complete, " +
                            r.storagePending +
                            " pending, " +
                            r.storageFailed +
                            " failed (retry scheduled)"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="No cleanup reports yet"
                  description="Reports appear here after a cleanup runs."
                />
              )}
            </section>
          </CardContent>
        </Card>
      </div>
    </PageMessages>
  );
}
