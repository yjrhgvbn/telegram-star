import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { cn } from "@/lib/utils";
import {
  SETTINGS_FORM_ID,
  SettingsForm,
  useSettingsForm,
} from "@/features/settings";

const sectionTitles: Record<string, string> = {
  connection: "连接",
  telegram: "Telegram",
  clients: "客户端",
  media: "媒体",
};

export function SettingsPage() {
  const { sectionId } = useParams<{ sectionId?: string }>();
  const navigate = useNavigate();
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const settings = useSettingsForm({ telegramAuthorized: authStatus.authorized });
  const isSectionSelected = sectionId !== undefined;
  const showFormSave = sectionId === "telegram" || sectionId === "media";

  return (
    <AppShell
      activeTab="settings"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background/72">
        <WorkspaceHeader
          title={isSectionSelected ? (sectionTitles[sectionId] ?? "设置") : "设置"}
          description="连接、授权、设备与媒体"
          leading={
            isSectionSelected ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                onClick={() => navigate("/settings")}
                aria-label="返回设置分类"
              >
                <ArrowLeft />
              </Button>
            ) : null
          }
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={settings.loadStatus}
                disabled={settings.loading}
                aria-label="刷新设置状态"
              >
                <RefreshCw className={cn(settings.loading && "animate-spin")} />
              </Button>
              <Button
                type="submit"
                size="sm"
                form={SETTINGS_FORM_ID}
                disabled={settings.saving || settings.loading}
                className={cn(!showFormSave && "hidden")}
              >
                {settings.saving ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                {settings.saving ? "保存中" : "保存"}
              </Button>
            </>
          }
        />

        {(settings.error || settings.notice) ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-b px-3 py-2 text-sm",
              settings.error
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : "border-primary/15 bg-secondary text-secondary-foreground",
            )}
          >
            {settings.error ? (
              <AlertCircle className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" />
            )}
            <span>{settings.error || settings.notice}</span>
          </div>
        ) : null}

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <SettingsForm settings={settings} />
        </main>
      </div>
    </AppShell>
  );
}
