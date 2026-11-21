import type { ReactNode } from "react";
import {
  BookOpen,
  CircleCheck,
  CircleX,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status label whose meaning never rests on colour alone (spec §10, decisions P-14/P-15).
 * A composition beside the shadcn Badge, so the CLI never overwrites it; Badge is unchanged.
 */
export type StatusTone = "neutral" | "info" | "warning" | "success" | "error";

const tones: Record<
  StatusTone,
  {
    variant: "secondary" | "outline" | "default";
    className: string;
    Icon: LucideIcon;
  }
> = {
  neutral: { variant: "secondary", className: "", Icon: BookOpen },
  // The info icon is a static circle; it must not spin.
  info: {
    variant: "default",
    className: "bg-info text-info-foreground",
    Icon: LoaderCircle,
  },
  warning: {
    variant: "default",
    className: "bg-warning text-warning-foreground",
    Icon: TriangleAlert,
  },
  success: {
    variant: "default",
    className: "bg-success text-success-foreground",
    Icon: CircleCheck,
  },
  // P-15: destructive on its 10% tint measured below 4.5:1 in Classic light, so the error tone
  // uses the error Notice styling (card surface, destructive text and border).
  error: {
    variant: "outline",
    className: "border-destructive/30 bg-card text-destructive",
    Icon: CircleX,
  },
};

export function StatusBadge({
  tone,
  icon,
  children,
  className,
}: {
  tone: StatusTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const { variant, className: toneClass, Icon } = tones[tone];
  const Glyph = icon ?? Icon;
  return (
    <Badge
      variant={variant}
      data-tone={tone}
      className={cn(
        "h-auto whitespace-normal [&>svg]:size-3.5!",
        toneClass,
        className,
      )}
    >
      <Glyph aria-hidden="true" />
      {children}
    </Badge>
  );
}
