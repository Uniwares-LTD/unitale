"use client";

// Leave guard (spec §6, decision D-10): stops in-app navigation from silently discarding unsaved edits.
// Covers guarded <Link onNavigate>, programmatic exits through `navigate`, and the browser's
// beforeunload warning. Back/Forward and links outside Unibase's Link are not intercepted.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/page-patterns";
import {
  leaveActions,
  leaveGuard,
  type LeaveEvent,
  type LeaveState,
  type SaveResult,
} from "@/lib/design-helpers";

type Guard = { dirty: boolean; save?: () => Promise<SaveResult> };
type Context = {
  register: (guard: Guard) => () => void;
  request: (href: string) => boolean;
};

const LeaveGuardContext = createContext<Context | null>(null);

type Reducer = { state: LeaveState; go?: string; seq: number };
function reduce(current: Reducer, event: LeaveEvent): Reducer {
  const { state, effect } = leaveGuard(current.state, event);
  return { state, go: effect.go, seq: current.seq + 1 };
}

/** Where focus returns when the dialog closes without leaving. */
function returnTarget(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  // Links inside the closed mobile sheet or account dropdown unmount; use their trigger instead.
  if (active.closest('[data-slot="sheet-content"]'))
    return document.querySelector<HTMLElement>('[data-leave-return="menu"]');
  if (active.closest('[role="menu"]'))
    return document.querySelector<HTMLElement>('[data-leave-return="account"]');
  return active;
}

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const translate = useTranslations("ui");
  const router = useRouter();
  const guards = useRef(new Set<Guard>());
  const focusBack = useRef<HTMLElement | null>(null);
  const [canSave, setCanSave] = useState(false);
  const [{ state, go, seq }, dispatch] = useReducer(reduce, {
    state: { phase: "closed", intent: null },
    seq: 0,
  });

  // Each navigation effect is handled once, even if the router identity changes.
  const handled = useRef(0);
  useEffect(() => {
    if (go && handled.current !== seq) {
      handled.current = seq;
      router.push(go);
    }
  }, [go, seq, router]);
  // A save result only applies to the dialog that started it; Keep editing invalidates it.
  const saveToken = useRef(0);

  const register = useCallback((guard: Guard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);
  const request = useCallback((href: string) => {
    // A clean form is not intercepted: the caller navigates normally.
    const dirty = [...guards.current].filter((guard) => guard.dirty);
    if (!dirty.length) return false;
    focusBack.current = returnTarget();
    setCanSave(dirty.every((guard) => guard.save));
    dispatch({ type: "navigate", href, dirty: true });
    return true;
  }, []);
  const value = useMemo(() => ({ register, request }), [register, request]);

  const save = async () => {
    const saves = [...guards.current]
      .filter((guard) => guard.dirty)
      .map((guard) => guard.save);
    if (saves.some((run) => !run)) return;
    const token = ++saveToken.current;
    dispatch({ type: "save" });
    let result: SaveResult = "saved";
    try {
      for (const run of saves) {
        if (!run || token !== saveToken.current) return;
        result = await run();
        if (result !== "saved") break;
      }
    } catch {
      result = "unknown";
    }
    if (token !== saveToken.current) return;
    dispatch({ type: "saveResult", result });
  };

  const open = state.phase !== "closed";
  const actions = leaveActions(state.phase, canSave);
  const saving = state.phase === "saving";

  return (
    <LeaveGuardContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Escape acts as Keep editing.
          if (!next) {
            saveToken.current++;
            dispatch({ type: "keep" });
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            const target = focusBack.current;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("mf558f0afb8ac")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("m0d91424ab791")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state.phase === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              {translate("m708a1a4872eb")}
            </p>
          )}
          {state.phase === "unknown" && (
            <p role="alert" className="text-sm text-warning-foreground">
              {translate("m836cdc7d346b")}
            </p>
          )}
          {saving && (
            <p role="status" className="text-sm text-muted-foreground">
              {translate("m23e39291d613")}
            </p>
          )}
          <AlertDialogFooter>
            {/* Cancel receives Radix's initial focus: Keep editing is the least destructive action. */}
            <AlertDialogCancel>{translate("me76fd2add010")}</AlertDialogCancel>
            {actions.save && (
              <SubmitButton pending={saving} onClick={() => void save()}>
                {translate("m0bd63bf3d32e")}
              </SubmitButton>
            )}
            {actions.discard && (
              <Button
                type="button"
                variant="destructive"
                disabled={actions.discardDisabled}
                onClick={() => dispatch({ type: "discard" })}
              >
                {translate("m815c05bc9215")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LeaveGuardContext.Provider>
  );
}

/** Registers the current form's guard. Use `navigate(href)` for programmatic exits. */
export function useLeaveGuard({
  dirty,
  save,
}: {
  dirty: boolean;
  save?: () => Promise<SaveResult>;
}) {
  const context = useContext(LeaveGuardContext);
  const router = useRouter();
  useEffect(() => context?.register({ dirty, save }), [context, dirty, save]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return {
    navigate: (href: string) => {
      if (!context?.request(href)) router.push(href);
    },
  };
}

/** For `<Link onNavigate={guardedNavigation(href)}>`: blocks the navigation while a guard is dirty. */
export function useGuardedNavigation() {
  const context = useContext(LeaveGuardContext);
  return useCallback(
    (href: string) => (event: { preventDefault: () => void }) => {
      if (context?.request(href)) event.preventDefault();
    },
    [context],
  );
}
