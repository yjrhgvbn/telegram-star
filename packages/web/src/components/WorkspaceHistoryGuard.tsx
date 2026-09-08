import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface WorkspaceNavigationGuard {
  dirty: boolean;
  busy?: boolean;
  /** These workspaces keep drafts mounted while navigating within their list/detail routes. */
  preserveWithin?: string;
  onDiscard?: () => void;
  onHistoryBlock?: () => void;
}

const GuardRegistration = createContext<((guard: WorkspaceNavigationGuard | undefined) => void) | null>(null);

export function useWorkspaceHistoryGuard(guard?: WorkspaceNavigationGuard) {
  const register = useContext(GuardRegistration);
  const { dirty = false, busy = false, preserveWithin, onDiscard, onHistoryBlock } = guard ?? {};
  useLayoutEffect(() => {
    register?.({ dirty, busy, preserveWithin, onDiscard, onHistoryBlock });
    return () => register?.(undefined);
  }, [register, dirty, busy, preserveWithin, onDiscard, onHistoryBlock]);
}

/** Page controls already confirm their own PUSH/REPLACE navigation. Only browser
 * history needs this shared blocker; keeping it here also avoids duplicate prompts. */
export function WorkspaceHistoryGuardProvider({ children }: { children: ReactNode }) {
  const [guard, setGuard] = useState<WorkspaceNavigationGuard>();
  const guardRef = useRef<WorkspaceNavigationGuard | undefined>(undefined);
  const register = useCallback((next: WorkspaceNavigationGuard | undefined) => {
    // Page-confirmed returns can run in a passive effect immediately after the
    // draft is cleared. Read the layout-committed guard without waiting for the
    // router to re-register a shouldBlock closure in a later passive effect.
    guardRef.current = next;
    setGuard(next);
  }, []);
  const shouldBlock = useCallback<BlockerFunction>(({ historyAction, currentLocation, nextLocation }) => {
    const guard = guardRef.current;
    if (historyAction !== "POP" || !guard) return false;
    if (currentLocation.pathname === nextLocation.pathname && currentLocation.search === nextLocation.search) return false;
    if (guard.busy) return true;
    const staysWithinWorkspace = guard.preserveWithin && (
      nextLocation.pathname === guard.preserveWithin || nextLocation.pathname.startsWith(`${guard.preserveWithin}/`)
    );
    return guard.dirty && !staysWithinWorkspace;
  }, []);
  const blocker = useBlocker(shouldBlock);
  const handledBlock = useRef<typeof blocker | null>(null);

  useLayoutEffect(() => {
    if (blocker.state !== "blocked") { handledBlock.current = null; return; }
    if (handledBlock.current === blocker) return;
    handledBlock.current = blocker;
    guardRef.current?.onHistoryBlock?.();
  }, [blocker]);

  useEffect(() => {
    // Ignore a back gesture while a mutation is running, just like the page's
    // own navigation controls. It must not unexpectedly execute when saving ends.
    if (blocker.state === "blocked" && (guard?.busy || !guard?.dirty)) blocker.reset();
  }, [blocker, guard?.busy, guard?.dirty]);

  return (
    <GuardRegistration.Provider value={register}>
      {children}
      <AlertDialog open={blocker.state === "blocked" && !guard?.busy} onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") blocker.reset();
      }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>离开后，尚未保存的修改将不会保留。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (blocker.state !== "blocked") return;
              guard?.onDiscard?.();
              blocker.proceed();
            }}>放弃修改</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardRegistration.Provider>
  );
}
