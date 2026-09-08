import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { SettingsForm, useSettingsForm } from "@/features/settings";
import { useServerConnectionSettings } from "@/features/settings/hooks/useServerConnectionSettings";
import { useClientDeviceDeletion } from "@/features/settings/hooks/useClientDevices";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function SettingsPage() {
  const location = useLocation();
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const settings = useSettingsForm({ telegramAuthorized: authStatus.authorized });
  const connection = useServerConnectionSettings();
  const deletingId = useClientDeviceDeletion();
  const [confirmLeaving, setConfirmLeaving] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const dirty = settings.dirty || connection.dirty;
  const busy = settings.saving || deletingId !== null;
  const clearPendingNavigation = useCallback(() => {
    pendingNavigation.current = null;
    setConfirmLeaving(false);
  }, []);
  useEffect(() => {
    // Category history preserves drafts, but an earlier leave prompt no longer
    // owns navigation after the user has moved to another category.
    clearPendingNavigation();
  }, [location.key, clearPendingNavigation]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);

  function requestNavigation(action: () => void) {
    if (busy) return;
    if (dirty) { pendingNavigation.current = action; setConfirmLeaving(true); }
    else action();
  }

  return <AppShell activeTab="settings" authStatus={authStatus} authLoading={authLoading} onLoginSuccess={handleLoginSuccess} onNavigateRequest={requestNavigation} navigationGuard={{ dirty, busy, preserveWithin: "/settings", onHistoryBlock: clearPendingNavigation }}>
    <SettingsForm settings={settings} connection={connection} onNavigateRequest={requestNavigation} />
    <AlertDialog open={confirmLeaving} onOpenChange={setConfirmLeaving}>
      <AlertDialogContent className="settings-theme" size="sm">
        <AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>离开设置后，尚未保存的修改将不会保留。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (busy) return; const action = pendingNavigation.current; pendingNavigation.current = null; setConfirmLeaving(false); action?.(); }}>放弃修改</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </AppShell>;
}
