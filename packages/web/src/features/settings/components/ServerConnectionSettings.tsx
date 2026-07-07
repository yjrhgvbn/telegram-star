import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Save,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SettingsItem } from "./SettingsSection";
import type { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";

type ServerConnectionSettingsState = ReturnType<typeof useServerConnectionSettings>;

function getStatusBadgeVariant(
  tone: ServerConnectionSettingsState["summary"]["tone"],
): "default" | "secondary" | "destructive" | "outline" {
  if (tone === "connected") return "secondary";
  if (tone === "failed") return "destructive";
  return "outline";
}

export function ServerConnectionSettings({
  settings,
}: {
  settings: ServerConnectionSettingsState;
}) {
  const StatusIcon = settings.connectionError
    ? AlertCircle
    : settings.connectionState === "checking"
      ? LoaderCircle
      : CheckCircle2;
  const hasConnectionFeedback = settings.notice || settings.connectionError || settings.health;

  return (
    <>
      <SettingsItem
        title="后端地址"
        description="服务器根地址，留空时使用当前站点的 /api。"
        meta={
          <Badge
            variant={getStatusBadgeVariant(settings.summary.tone)}
            className="h-6 px-2"
          >
            {settings.summary.title}
          </Badge>
        }
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <label htmlFor="server-url" className="sr-only">
            后端地址
          </label>
          <Input
            id="server-url"
            value={settings.serverUrlInput}
            onChange={(event) => settings.setServerUrlInput(event.target.value)}
            placeholder="https://star.example.com"
            className="h-9 min-w-0 flex-1 bg-background/86"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={settings.testConnection}
            disabled={settings.checking}
          >
            {settings.checking ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Wifi data-icon="inline-start" />
            )}
            测试
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={settings.saveConnection}
            disabled={!settings.dirty}
          >
            <Save data-icon="inline-start" />
            保存地址
          </Button>
        </div>
      </SettingsItem>

      <SettingsItem title="保存状态" description="当前生效地址和输入框即将使用的模式。">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="min-w-0 rounded-lg bg-background/60 px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground">当前保存</div>
            <div className="mt-0.5 truncate font-medium text-foreground">{settings.currentLabel}</div>
          </div>
          <div className="min-w-0 rounded-lg bg-background/60 px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground">待使用模式</div>
            <div className="mt-0.5 truncate font-medium text-foreground">{settings.modeLabel}</div>
          </div>
        </div>
      </SettingsItem>

      {hasConnectionFeedback && (
        <SettingsItem title="连接结果">
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
              settings.connectionError
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            <StatusIcon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                settings.connectionState === "checking" && "animate-spin",
              )}
            />
            <div className="min-w-0">
              <div>{settings.connectionError || settings.notice || "连接正常"}</div>
              {settings.health && (
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline" className="h-5 px-1.5">
                    API {settings.health.apiVersion}
                  </Badge>
                  <Badge variant="outline" className="h-5 px-1.5">
                    Telegram {settings.health.telegram.connected ? "已连接" : "未连接"}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </SettingsItem>
      )}

      <SettingsItem title="地址模式">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={settings.clearConnection}
          disabled={!settings.currentServerUrl && !settings.serverUrlInput}
        >
          <RotateCcw data-icon="inline-start" />
          清空为同源
        </Button>
      </SettingsItem>
    </>
  );
}
