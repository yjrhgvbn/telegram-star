import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings,
} from "lucide-react";
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
        <main className="min-w-0 flex-1 overflow-auto px-3 py-3 sm:px-4 lg:px-5">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
            <header className="rounded-lg bg-card/80 p-4 shadow-sm ring-1 ring-foreground/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Settings className="size-4" />
                    系统设置
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                    当前配置
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
              </div>
            </header>

            {(settings.error || settings.notice) && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1",
                  settings.error
                    ? "bg-destructive/10 text-destructive ring-destructive/20"
                    : "bg-primary/10 text-primary ring-primary/20",
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
