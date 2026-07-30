import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SettingsItem } from "./SettingsSection";
import type { useServerConnectionSettings } from "../hooks/useServerConnectionSettings";

type ServerConnectionSettingsState = ReturnType<typeof useServerConnectionSettings>;

export function ServerConnectionSettings({
  settings,
}: {
  settings: ServerConnectionSettingsState;
}) {
  const StatusIcon = settings.connectionError
    ? AlertCircle
    : settings.connectionState === "checking"
      ? LoaderCircle
      : settings.health
        ? CheckCircle2
        : Wifi;
  const hasConnectionFeedback = settings.notice || settings.connectionError || settings.health;

  return (
    <>
      <SettingsItem
        title="服务器地址"
        description="服务器根地址；留空时使用当前站点的 /api。"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <label htmlFor="server-url" className="sr-only">
              后端地址
            </label>
            <Input
              id="server-url"
              value={settings.serverUrlInput}
              onChange={(event) => settings.setServerUrlInput(event.target.value)}
              placeholder="https://star.example.com"
              className="h-10 min-w-0 flex-1 bg-card font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={settings.testConnection}
              disabled={settings.checking}
            >
              {settings.checking ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Wifi data-icon="inline-start" />
              )}
              {settings.checking ? "测试中" : "测试连接"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            输入服务器根地址，不需要附加 <span className="font-mono">/api</span>。
          </p>
        </div>
      </SettingsItem>

      <SettingsItem title="请求路径" description="确认保存值与输入框当前代表的连接模式。">
        <dl className="border-y border-border text-sm">
          <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2">
            <dt className="text-muted-foreground">当前保存</dt>
            <dd className="min-w-0 truncate font-mono font-medium text-foreground">
              {settings.currentLabel}
            </dd>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">待使用模式</dt>
            <dd className="min-w-0 truncate font-medium text-foreground">
              {settings.modeLabel}
            </dd>
          </div>
        </dl>
      </SettingsItem>

      <SettingsItem title="连接检查" description="测试只检查可达性，不会自动保存地址。">
        <div
          className={cn(
            "flex min-h-10 items-start gap-2 text-sm",
            settings.connectionError ? "text-destructive" : "text-muted-foreground",
            settings.health && "text-primary",
          )}
          role="status"
        >
          <StatusIcon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              settings.connectionState === "checking" && "animate-spin",
            )}
          />
          <div className="min-w-0">
            <div>
              {settings.connectionError ||
                settings.notice ||
                (hasConnectionFeedback ? "连接正常" : "尚未进行连接测试")}
            </div>
            {settings.health ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline" className="h-6 px-2">
                  API {settings.health.apiVersion}
                </Badge>
                <Badge variant="outline" className="h-6 px-2">
                  Telegram {settings.health.telegram.connected ? "已连接" : "未连接"}
                </Badge>
              </div>
            ) : null}
          </div>
        </div>
      </SettingsItem>

      <SettingsItem
        title="恢复同源"
        description="清空自定义地址，保存后重新通过当前站点的 /api 请求后端。"
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => settings.setServerUrlInput("")}
          disabled={!settings.serverUrlInput}
        >
          <RotateCcw data-icon="inline-start" />
          恢复同源模式
        </Button>
      </SettingsItem>
    </>
  );
}
