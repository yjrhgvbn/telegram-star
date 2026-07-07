import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { cn } from "@/lib/utils";
import {
  SETTINGS_FORM_ID,
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
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto px-3 py-4 sm:px-5 lg:px-7">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-normal text-foreground">
                  设置
                </h1>
                <p className="text-sm text-muted-foreground">连接、授权、设备、媒体</p>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-card/64 p-1 shadow-[0_18px_55px_color-mix(in_oklab,var(--foreground)_7%,transparent)] backdrop-blur sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={settings.loadStatus}
                  disabled={settings.loading}
                >
                  <RefreshCw
                    className={cn(settings.loading && "animate-spin")}
                    data-icon="inline-start"
                  />
                  刷新
                </Button>
                <Button
                  type="submit"
                  form={SETTINGS_FORM_ID}
                  disabled={settings.saving || settings.loading}
                >
                  {settings.saving ? (
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  {settings.saving ? "保存中" : "保存设置"}
                </Button>
              </div>
            </header>

            {(settings.error || settings.notice) && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-[0_10px_32px_color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                  settings.error
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                )}
              >
                {settings.error ? (
                  <AlertCircle className="size-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" />
                )}
                <span>{settings.error || settings.notice}</span>
              </div>
            )}

            <SettingsForm settings={settings} />
          </div>
        </main>
      </div>
    </AppShell>
  );
}
