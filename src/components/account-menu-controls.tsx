"use client";
import { useTranslations } from "next-intl";

import { NotificationBadge } from "./notifications";
import { moduleEnabled } from "@/lib/project";
import { ChevronDown, LogIn, UserRound, ShieldCheck } from "lucide-react";
import { useAccountRoutes } from "@/components/app-shell";
import Link from "next/link";
import { useGuardedNavigation } from "@/components/leave-guard";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SessionControls } from "@/components/session-controls";

export function AccountMenuControls({
  hasSession,
  isAdmin,
  email,
  displayName,
  picture,
}: {
  hasSession: boolean;
  isAdmin: boolean;
  email: string | null;
  displayName: string | null;
  picture: string | null;
}) {
  const translate = useTranslations("ui");
  const routes = useAccountRoutes();
  const pathname = usePathname();
  const guarded = useGuardedNavigation();

  if (!hasSession)
    return pathname === "/account" ? null : (
      <Button asChild className="h-11">
        <Link href="/account" onNavigate={guarded("/account")}>
          <LogIn aria-hidden="true" />
          {translate("mbfd402b2f6f3")}
        </Link>
      </Button>
    );
  return (
    <div className="flex items-center gap-2">
      {moduleEnabled("notifications") && <NotificationBadge />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 gap-2 rounded-full px-2"
            data-leave-return="account"
            aria-label={translate("m04b5bfe665e3")}
          >
            <Avatar className="size-8">
              {picture && (
                <AvatarImage
                  src={picture}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              )}
              <AvatarFallback className="bg-secondary">
                <UserRound className="size-4" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm sm:inline">
              {displayName ? (
                <bdi>{displayName}</bdi>
              ) : (
                translate("mdbb5f6371b6a")
              )}
            </span>
            <ChevronDown
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {email && (
            <>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                <bdi>{email}</bdi>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {routes.map(({ href, label, Icon }) => (
            <DropdownMenuItem key={href} asChild>
              <Link href={href} onNavigate={guarded(href)}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </DropdownMenuItem>
          ))}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin" onNavigate={guarded("/admin")}>
                <ShieldCheck aria-hidden="true" />
                Administration
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <SessionControls />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
