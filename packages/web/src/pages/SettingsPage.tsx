import { AppShell } from "@/components/AppShell";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import {
  SettingsForm,
  useSettingsForm,
} from "@/features/settings";

export function SettingsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const settings = useSettingsForm({ telegramAuthorized: authStatus.authorized });

  return (
    <AppShell
      activeTab="settings"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SettingsForm settings={settings} />
      </div>
    </AppShell>
  );
}
