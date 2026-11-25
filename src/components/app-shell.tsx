"use client";
import { useTranslations, useLocale } from "next-intl";

import { moduleEnabled, moduleForPath, projectExtensions } from "@/lib/project";
import { extensionLinks, isFocusedPath } from "@/lib/extensions";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bookmark,
  Folder,
  Home,
  ListChecks,
  Menu,
  Settings2,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { UnreadProvider } from "@/components/notifications";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Button } from "@/components/ui/button";
import { useGuardedNavigation } from "@/components/leave-guard";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

// Extension links name a Lucide icon; one stable component per name keeps
// re-renders from remounting it.
type IconProps = Omit<ComponentProps<typeof DynamicIcon>, "name">;
const extensionIcons = new Map<
  IconName,
  (props: IconProps) => React.ReactNode
>();
function extensionIcon(name: IconName) {
  let Icon = extensionIcons.get(name);
  if (!Icon) {
    Icon = function ExtensionIcon(props: IconProps) {
      return <DynamicIcon name={name} {...props} />;
    };
    extensionIcons.set(name, Icon);
  }
  return Icon;
}
function extensionRoutes(
  placement: "main" | "account",
  translate: Parameters<typeof extensionLinks>[2],
) {
  return extensionLinks(projectExtensions, placement, translate).map(
    ({ icon, ...link }) => ({ ...link, Icon: extensionIcon(icon) }),
  );
}

function useRoutes(signedIn: boolean) {
  const translate = useTranslations("ui");
  const home = { href: "/", label: translate("m3a78695388b3"), Icon: Home };
  // Every other destination requires an account; signed-out visitors only see Home.
  if (!signedIn) return [home];
  return [
    home,
    { href: "/runs/new", label: translate("mcdffd2693a0c"), Icon: Sparkles },
    { href: "/runs", label: translate("m848f54e89660"), Icon: ListChecks },
    { href: "/files", label: translate("mabc7e9892806"), Icon: Folder },
    { href: "/artifacts", label: translate("m068c9472b061"), Icon: Bookmark },
    ...extensionRoutes("main", translate),
  ].filter((route) => {
    const id = moduleForPath(route.href);
    return !id || moduleEnabled(id);
  });
}

// Signed-in destinations reached from the account menu rather than the sidebar.
export function useAccountRoutes() {
  const translate = useTranslations("ui");
  return [
    { href: "/account", label: translate("m7e1b0d5641f2"), Icon: UserRound },
    { href: "/credits", label: translate("m2a6b24ad2872"), Icon: Wallet },
    {
      href: "/notifications",
      label: translate("m788011833a5a"),
      Icon: Bell,
    },
    {
      href: "/preferences",
      label: translate("m66962f72a088"),
      Icon: Settings2,
    },
    ...extensionRoutes("account", translate),
  ].filter((route) => {
    const id = moduleForPath(route.href);
    return !id || moduleEnabled(id);
  });
}

export function matchesRoute(pathname: string, href: string) {
  if (href === "/runs" && pathname === "/runs/new") return false;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function Brand({ name }: { name: string }) {
  const common = useTranslations("common");
  const guarded = useGuardedNavigation();
  return (
    <Link
      href="/"
      onNavigate={guarded("/")}
      aria-label={common("home", { name })}
      className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <BookOpen className="size-5" aria-hidden="true" />
      </span>
      <span className="truncate text-xl font-semibold tracking-tight">
        {name}
      </span>
    </Link>
  );
}

function Navigation({
  label,
  signedIn,
  onNavigate,
}: {
  label: string;
  signedIn: boolean;
  onNavigate?: () => void;
}) {
  const routes = useRoutes(signedIn);
  const pathname = usePathname();
  const guarded = useGuardedNavigation();
  return (
    <nav aria-label={label} className="space-y-1.5">
      {routes.map(({ href, label: routeLabel, Icon }) => (
        <Button
          key={href}
          variant="ghost"
          asChild
          className={cn(
            "h-11 w-full justify-start gap-3 px-3 text-sm",
            matchesRoute(pathname, href) &&
              "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
          )}
        >
          <Link
            href={href}
            aria-current={matchesRoute(pathname, href) ? "page" : undefined}
            onClick={onNavigate}
            onNavigate={guarded(href)}
          >
            <Icon aria-hidden="true" className="size-[18px]" />
            {routeLabel}
          </Link>
        </Button>
      ))}
    </nav>
  );
}

export function AppShell({
  appName,
  signedIn,
  children,
  accountMenu,
}: {
  appName: string;
  signedIn: boolean;
  children: React.ReactNode;
  accountMenu: React.ReactNode;
}) {
  const translate = useTranslations("ui");
  const direction = useLocale() === "ar" ? "right" : "left";

  const routes = useRoutes(signedIn);
  const accountRoutes = useAccountRoutes();
  const pathname = usePathname();
  const guarded = useGuardedNavigation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title =
    [...routes, ...accountRoutes].find((route) =>
      matchesRoute(pathname, route.href),
    )?.label ??
    (pathname.startsWith("/admin")
      ? "Administration"
      : pathname === "/design-system"
        ? translate("m4a866105af15")
        : appName);
  const focusedModule = moduleForPath(pathname);
  const focused =
    isFocusedPath(projectExtensions, pathname) &&
    (!focusedModule || moduleEnabled(focusedModule));
  const skipLink = (
    <a
      href="#main-content"
      className="sr-only fixed top-3 start-3 z-[100] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
    >
      {translate("mac576a66d456")}
    </a>
  );
  // Focused frame (declared by an extension's focusedRoutes): the page keeps
  // the whole width and window scrolling. Only Back and the colour-mode toggle
  // remain; navigation and account controls are one step away on Home.
  const focusedShell = (
    <div className="min-h-svh">
      {skipLink}
      <header className="shell-surface flex h-14 items-center justify-between gap-2 px-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-(--control-touch-sm)"
          asChild
        >
          <Link
            href="/"
            onNavigate={guarded("/")}
            aria-label={translate("m76900f1bfd16")}
          >
            <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
        <ThemeToggle />
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 pt-4 pb-6 outline-none sm:px-6 sm:pt-6"
      >
        {children}
      </main>
    </div>
  );
  const shell = focused ? (
    focusedShell
  ) : (
    <div className="min-h-svh">
      {skipLink}
      <aside className="shell-surface fixed inset-y-0 start-0 hidden w-64 flex-col border-e bg-sidebar p-6 text-sidebar-foreground md:flex">
        <Brand name={appName} />
        <p className="mt-12 mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {translate("m478e47e459be")}
        </p>
        <Navigation label={translate("meb355944b92d")} signedIn={signedIn} />
      </aside>
      <div className="md:ps-64">
        <header className="shell-surface flex h-20 items-center justify-between gap-4 border-b bg-background px-5 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:hidden"
                  data-leave-return="menu"
                  aria-label={translate("m0ed77fd2619b")}
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side={direction}
                className="w-72 overflow-y-auto overscroll-contain bg-sidebar p-6"
              >
                <SheetHeader className="px-0 pt-6">
                  <SheetTitle>{appName}</SheetTitle>
                  <SheetDescription>
                    {translate("m8e1a07e2f468")}
                  </SheetDescription>
                </SheetHeader>
                <Navigation
                  label={translate("m806f228ffbd4")}
                  signedIn={signedIn}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <span className="truncate text-sm font-medium text-muted-foreground">
              {title}
            </span>
          </div>
          {accountMenu}
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-6xl px-5 py-10 outline-none sm:px-8 sm:py-12 lg:px-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
  return signedIn && moduleEnabled("notifications") ? (
    <UnreadProvider>{shell}</UnreadProvider>
  ) : (
    shell
  );
}
