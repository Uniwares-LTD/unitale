import { AdminStateLabel as StateLabel } from "@/components/admin-state-label";

import Link from "next/link";
import { events } from "@/lib/diagnostics";
import { auditEvents, type ReportFilters } from "@/lib/contracts/reports";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";

export function ReportFiltersForm({ filters }: { filters: ReportFilters }) {
  const eventOptions = filters.kind === "audit" ? auditEvents : events;
  return (
    <form
      action="/admin/reports"
      method="get"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <input type="hidden" name="kind" value={filters.kind} />
      <Field className="space-y-2">
        <FieldLabel htmlFor="report-event">Event</FieldLabel>
        <Select name="event" defaultValue={filters.event ?? "any"}>
          <SelectTrigger id="report-event" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All events</SelectItem>
            {eventOptions.map((event) => (
              <SelectItem key={event} value={event}>
                <StateLabel value={event} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {filters.kind === "runtime" ? (
        <>
          <Field className="space-y-2">
            <FieldLabel htmlFor="report-severity">Severity</FieldLabel>
            <Select name="severity" defaultValue={filters.severity ?? "any"}>
              <SelectTrigger id="report-severity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All severities</SelectItem>
                {["info", "warn", "error"].map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    <StateLabel value={severity} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="space-y-2">
            <FieldLabel htmlFor="report-request">Request ID</FieldLabel>
            <Input
              id="report-request"
              name="requestId"
              defaultValue={filters.requestId}
              maxLength={36}
            />
          </Field>
        </>
      ) : (
        <>
          <Field className="space-y-2">
            <FieldLabel htmlFor="report-actor">Actor UID</FieldLabel>
            <Input
              id="report-actor"
              name="actorUid"
              defaultValue={filters.actorUid}
              maxLength={128}
            />
          </Field>
          <Field className="space-y-2">
            <FieldLabel htmlFor="report-target">Target UID</FieldLabel>
            <Input
              id="report-target"
              name="targetUid"
              defaultValue={filters.targetUid}
              maxLength={128}
            />
          </Field>
        </>
      )}
      <Field className="space-y-2">
        <FieldLabel htmlFor="report-from">From (UTC)</FieldLabel>
        <Input
          id="report-from"
          name="from"
          type="date"
          defaultValue={filters.from}
        />
      </Field>
      <Field className="space-y-2">
        <FieldLabel htmlFor="report-to">Through (UTC)</FieldLabel>
        <Input id="report-to" name="to" type="date" defaultValue={filters.to} />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" asChild>
          <Link href={`/admin/reports?kind=${filters.kind}`}>
            Clear filters
          </Link>
        </Button>
      </div>
    </form>
  );
}
