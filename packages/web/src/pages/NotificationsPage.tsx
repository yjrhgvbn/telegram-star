import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { TargetEditor, TargetList, useForwardTargets } from "@/features/notifications";
import { NEW_FORWARD_TARGET_ID } from "@/features/notifications/types";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import "./NotificationsPage.css";

const mobileQuery = "(max-width: 680px)";

function subscribeViewport(onChange: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function NotificationsPage() {
  const { targetId: routeTargetId } = useParams<{ targetId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useSyncExternalStore(
    subscribeViewport,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters, chats, loading: filtersLoading, error: filtersError, refresh: refreshFilters } = useFilters();
  const forwardTargets = useForwardTargets({ autoSelect: false });
  const [rootTargetId, setRootTargetId] = useState<string | null>(null);
  // The first response establishes the root's selection. A background insertion
  // must not replace that editor; only a removed selection needs a fallback.
  const rootTarget = forwardTargets.targets.find((target) => String(target.id) === rootTargetId)
    ?? forwardTargets.targets[0];
  const resolvedRootId = rootTarget ? String(rootTarget.id) : null;
  useEffect(() => {
    if (resolvedRootId !== rootTargetId) setRootTargetId(resolvedRootId);
  }, [resolvedRootId, rootTargetId]);
  // The default detail does not rewrite /notifications. Keep it mounted while
  // hidden on mobile so resizing cannot silently discard an edited form.
  const selectedTargetId = routeTargetId ?? resolvedRootId;
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const mountedRef = useRef(true);
  const routeRef = useRef({ routeTargetId, selectedTargetId });
  // Preserve identity across ordinary renders, but not across a history trip
  // away and back to the same ID: an older save must not clear a newer draft.
  if (routeRef.current.routeTargetId !== routeTargetId || routeRef.current.selectedTargetId !== selectedTargetId)
    routeRef.current = { routeTargetId, selectedTargetId };
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [confirmLeaving, setConfirmLeaving] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setEditorDirty(dirty);
  }, []);
  const setBusy = useCallback((busy: boolean) => {
    busyRef.current = busy;
    setEditorBusy(busy);
  }, []);
  const clearPendingNavigation = useCallback(() => {
    pendingNavigation.current = null;
    setConfirmLeaving(false);
  }, []);
  useEffect(() => {
    // Once another navigation wins, the previous dialog must not retain an
    // action pointing at its abandoned destination. Editor/save identity stays intact.
    clearPendingNavigation();
  }, [location.key, clearPendingNavigation]);
  const discardDraft = useCallback(() => {
    clearPendingNavigation();
    setDirty(false);
    // Root and explicit detail URLs can resolve to the same mounted editor.
    // A confirmed discard must reset it even when its target ID does not change.
    setEditorRevision((current) => current + 1);
    if (routeRef.current.selectedTargetId === NEW_FORWARD_TARGET_ID)
      forwardTargets.setDraftTarget(null);
  }, [forwardTargets.setDraftTarget, setDirty, clearPendingNavigation]);
  const requestNavigation = useCallback((action: () => void) => {
    if (busyRef.current) return;
    if (dirtyRef.current) {
      pendingNavigation.current = action;
      setConfirmLeaving(true);
    } else action();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const handleUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  useEffect(() => {
    if (selectedTargetId === NEW_FORWARD_TARGET_ID) forwardTargets.addTarget();
  }, [forwardTargets.addTarget, selectedTargetId]);

  useEffect(() => {
    if (selectedTargetId !== NEW_FORWARD_TARGET_ID && forwardTargets.selectedTargetId !== selectedTargetId)
      forwardTargets.setSelectedTargetId(selectedTargetId);
  }, [forwardTargets.setSelectedTargetId, forwardTargets.selectedTargetId, selectedTargetId]);

  // Resolve the editor from the route or its default directly, rather than
  // showing the hook's previous selection while synchronization runs.
  const selectedTarget = selectedTargetId === NEW_FORWARD_TARGET_ID
    ? forwardTargets.visibleTargets.find((target) => target.id === 0)
    : forwardTargets.targets.find((target) => String(target.id) === selectedTargetId);

  return (
    <AppShell
      activeTab="notifications"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
      onNavigateRequest={requestNavigation}
      navigationGuard={{ dirty: editorDirty, busy: editorBusy, onDiscard: discardDraft, onHistoryBlock: clearPendingNavigation }}
    >
      <div className="forward-page">
        <div
          className="forward-workspace"
          data-detail={routeTargetId !== undefined || undefined}
        >
          <aside className="forward-workspace__sidebar" hidden={mobile && routeTargetId !== undefined}>
            <TargetList
              targets={forwardTargets.visibleTargets}
              selectedTargetId={mobile && routeTargetId === undefined ? null : selectedTargetId}
              loading={forwardTargets.loading}
              error={forwardTargets.error}
              onRetry={forwardTargets.refresh}
              onAdd={() => {
                if (routeTargetId !== NEW_FORWARD_TARGET_ID)
                  requestNavigation(() => {
                    forwardTargets.addTarget();
                    navigate(`/notifications/${NEW_FORWARD_TARGET_ID}`);
                  });
              }}
              onSelect={(id) => {
                if (id === selectedTargetId) {
                  if (routeTargetId === undefined && !busyRef.current)
                    navigate(`/notifications/${id}`);
                  return;
                }
                requestNavigation(() => navigate(`/notifications/${id}`));
              }}
            />
          </aside>
          <main
            className="forward-workspace__detail"
            hidden={mobile && routeTargetId === undefined}
            inert={mobile && routeTargetId === undefined}
          >
            {mobile && selectedTarget && forwardTargets.error ? (
              <div className="forward-page__error" role="alert">
                <span>通道读取失败：{forwardTargets.error}</span>
                <Button variant="ghost" size="sm" onClick={forwardTargets.refresh}>重试读取通道</Button>
              </div>
            ) : null}
            {selectedTarget ? (
              <TargetEditor
                key={`${selectedTarget.id || "new"}-${editorRevision}`}
                target={selectedTarget}
                allFilters={filters}
                chats={chats}
                filtersLoading={filtersLoading}
                filtersError={filtersError}
                onRetryFilters={refreshFilters}
                onBack={() => requestNavigation(() => navigate("/notifications"))}
                onDraftChange={forwardTargets.setDraftTarget}
                onDirtyChange={setDirty}
                onBusyChange={setBusy}
                onSave={async (target, data) => {
                  const origin = routeRef.current;
                  const saved = await forwardTargets.saveTarget(target, data);
                  if (
                    mountedRef.current &&
                    routeRef.current === origin &&
                    routeRef.current.selectedTargetId ===
                    (target.id === 0 ? NEW_FORWARD_TARGET_ID : String(target.id))
                  ) {
                    setDirty(false);
                    if (target.id === 0)
                      navigate(`/notifications/${saved.id}`, { replace: true });
                  }
                  return saved;
                }}
                onDelete={async (target) => {
                  const origin = routeRef.current;
                  await forwardTargets.deleteTarget(target);
                  if (
                    mountedRef.current &&
                    routeRef.current === origin &&
                    routeRef.current.selectedTargetId ===
                    (target.id === 0 ? NEW_FORWARD_TARGET_ID : String(target.id))
                  ) {
                    setDirty(false);
                    if (origin.routeTargetId !== undefined)
                      navigate("/notifications", { replace: true });
                  }
                }}
                onTest={forwardTargets.testTarget}
              />
            ) : (
              <div className="forward-page__empty" role="status">
                {forwardTargets.loading ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    读取通道中
                  </>
                ) : forwardTargets.error ? (
                  <>
                    <AlertCircle className="size-4" />
                    <span>通道读取失败：{forwardTargets.error}</span>
                    <Button variant="outline" size="sm" onClick={forwardTargets.refresh}>重试读取通道</Button>
                  </>
                ) : routeTargetId ? (
                  "该通道不存在，请选择其他通道"
                ) : (
                  "新建一个转发通道"
                )}
              </div>
            )}
          </main>
        </div>
      </div>
      <AlertDialog open={confirmLeaving} onOpenChange={setConfirmLeaving}>
        <AlertDialogContent className="forward-theme" size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              离开后，当前通道未保存的修改将不会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingNavigation.current;
                pendingNavigation.current = null;
                setConfirmLeaving(false);
                discardDraft();
                action?.();
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
