import type { ComponentProps, ReactNode } from "react";
import { CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { noticeAction, type NoticeActionState } from "@/lib/design-helpers";
import { Card, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0 flex-1 basis-72">
        {eyebrow && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="reading-copy mt-3 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const tones = {
  info: {
    style: "border-info-foreground/25 bg-info text-info-foreground",
    Icon: Info,
  },
  success: {
    style: "border-success-foreground/25 bg-success text-success-foreground",
    Icon: CircleCheck,
  },
  warning: {
    style: "border-warning-foreground/25 bg-warning text-warning-foreground",
    Icon: TriangleAlert,
  },
  error: {
    style: "border-destructive/30 bg-card text-destructive",
    Icon: TriangleAlert,
  },
};
/** Optional Notice action (spec §11): the feature owns the state; the notice never changes it. */
export type NoticeAction = {
  state: NoticeActionState;
  labels: { available: string; pending: string; success: string };
  receipt?: string;
  onAction: () => void;
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof tones;
  title: string;
  children?: ReactNode;
  action?: NoticeAction;
}) {
  const { style, Icon } = tones[tone];
  const control = action && noticeAction(action.state, action.labels);
  return (
    <Alert
      className={cn("p-4", style)}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {children && (
        <AlertDescription className="text-current">{children}</AlertDescription>
      )}
      {action && control && (
        <div className="col-start-2 mt-3 flex flex-col items-start gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            // aria-disabled keeps focus on the button while pending or done (P-18).
            aria-disabled={control.ariaDisabled || undefined}
            aria-busy={control.ariaBusy || undefined}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
            onClick={() => {
              if (control.activatable) action.onAction();
            }}
          >
            {control.ariaBusy && (
              <LoaderCircle
                aria-hidden="true"
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            {control.label}
          </Button>
          {/* Kept mounted so screen readers announce the first receipt. */}
          <p role="status" className="text-sm empty:hidden">
            {action.receipt}
          </p>
        </div>
      )}
    </Alert>
  );
}

/** Pending submit (spec §5): disabled and busy while pending; the label never changes. */
export function SubmitButton({
  pending,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { pending: boolean }) {
  return (
    <Button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
    >
      {pending && (
        <LoaderCircle
          aria-hidden="true"
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
        />
      )}
      {children}
    </Button>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed bg-muted/30 shadow-none">
      <CardHeader className="py-8">
        <CardTitle className="text-card-title! leading-(--text-card-title--line-height)! font-(number:--text-card-title--font-weight)!">
          {title}
        </CardTitle>
        <CardDescription className="reading-copy">
          {description}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
