import {
  Bell,
  CloudDownload,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDesktopBridge,
  type DesktopBridgeCommand,
} from "@/shared/runtime/desktopBridge";
import {
  useMobileBridge,
  type MobileBridgeCommand,
} from "@/shared/runtime/mobileBridge";
import { SettingsItem } from "./SettingsSection";

interface DesktopAction {
  command: DesktopBridgeCommand;
  label: string;
  icon: typeof RefreshCw;
  enabled: boolean;
  variant?: "secondary" | "outline" | "destructive";
}

interface MobileAction {
  command: MobileBridgeCommand;
  label: string;
  icon: typeof RefreshCw;
  enabled: boolean;
  variant?: "secondary" | "outline" | "destructive";
}

function getCurrentPageUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.href;
}

export function ClientRuntimeSettings() {
  const desktopBridge = useDesktopBridge();
  const mobileBridge = useMobileBridge();
  const desktopCapabilities = desktopBridge.capabilities;
  const mobileCapabilities = mobileBridge.capabilities;

  if (desktopBridge.available && desktopCapabilities) {
    const actions: DesktopAction[] = [
      {
        command: "reload",
        label: "刷新页面",
        icon: RefreshCw,
        enabled: desktopCapabilities.reload,
        variant: "secondary",
      },
      {
        command: "open-external",
        label: "浏览器打开",
        icon: ExternalLink,
        enabled: desktopCapabilities.openExternal,
        variant: "outline",
      },
      {
        command: "test-notification",
        label: "通知测试",
        icon: Bell,
        enabled: desktopCapabilities.nativeNotification,
        variant: "outline",
      },
      {
        command: "check-update",
        label: "检查更新",
        icon: CloudDownload,
        enabled: desktopCapabilities.appUpdater,
        variant: "outline",
      },
      {
        command: "switch-server",
        label: "切换服务器",
        icon: RotateCcw,
        enabled: desktopCapabilities.switchServer,
        variant: "destructive",
      },
    ];

    async function runDesktopAction(command: DesktopBridgeCommand) {
      await desktopBridge.sendCommand(command, {
        url: command === "open-external" ? getCurrentPageUrl() : undefined,
      });
    }

    return (
      <SettingsItem
        title="桌面能力"
        description="当前窗口由 Tauri 桌面壳承载时可用。"
        meta={
          <Badge variant="secondary" className="h-6 px-2">
            桌面壳已连接
          </Badge>
        }
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="h-6 px-2">
              桌面 WebView
            </Badge>
            {desktopCapabilities.tray && (
              <Badge variant="outline" className="h-6 px-2">
                托盘菜单
              </Badge>
            )}
            {desktopCapabilities.appUpdater && (
              <Badge variant="outline" className="h-6 px-2">
                应用更新
              </Badge>
            )}
            {desktopCapabilities.nativeNotification && (
              <Badge variant="outline" className="h-6 px-2">
                系统通知
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {actions
              .filter((action) => action.enabled)
              .map((action) => {
                const Icon = action.icon;
                const pending = desktopBridge.pendingCommand === action.command;
                return (
                  <Button
                    key={action.command}
                    type="button"
                    size="sm"
                    variant={action.variant}
                    className="justify-start"
                    disabled={Boolean(desktopBridge.pendingCommand)}
                    onClick={() => {
                      void runDesktopAction(action.command);
                    }}
                  >
                    {pending ? (
                      <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Icon data-icon="inline-start" />
                    )}
                    {action.label}
                  </Button>
                );
              })}
          </div>

          {desktopBridge.lastResult && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                desktopBridge.lastResult.ok
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive",
              )}
              role="status"
            >
              {desktopBridge.lastResult.message}
            </div>
          )}
        </div>
      </SettingsItem>
    );
  }

  if (!mobileBridge.available || !mobileCapabilities) return null;

  const mobileActions: MobileAction[] = [
    {
      command: "reload",
      label: "刷新页面",
      icon: RefreshCw,
      enabled: mobileCapabilities.reload,
      variant: "secondary",
    },
    {
      command: "open-external",
      label: "浏览器打开",
      icon: ExternalLink,
      enabled: mobileCapabilities.openExternal,
      variant: "outline",
    },
    {
      command: "switch-server",
      label: "切换服务器",
      icon: RotateCcw,
      enabled: mobileCapabilities.switchServer,
      variant: "destructive",
    },
  ];

  async function runMobileAction(command: MobileBridgeCommand) {
    await mobileBridge.sendCommand(command, {
      url: command === "open-external" ? getCurrentPageUrl() : undefined,
    });
  }

  return (
    <SettingsItem
      title="移动能力"
      description="当前窗口由手机端轻壳承载时可用。"
      meta={
        <Badge variant="secondary" className="h-6 px-2">
          移动壳已连接
        </Badge>
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="h-6 px-2">
            移动 WebView
          </Badge>
          {mobileCapabilities.deviceRegistration && (
            <Badge variant="outline" className="h-6 px-2">
              设备注册
            </Badge>
          )}
          {mobileCapabilities.openExternal && (
            <Badge variant="outline" className="h-6 px-2">
              系统外链
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {mobileActions
            .filter((action) => action.enabled)
            .map((action) => {
              const Icon = action.icon;
              const pending = mobileBridge.pendingCommand === action.command;
              return (
                <Button
                  key={action.command}
                  type="button"
                  size="sm"
                  variant={action.variant}
                  className="justify-start"
                  disabled={Boolean(mobileBridge.pendingCommand)}
                  onClick={() => {
                    void runMobileAction(action.command);
                  }}
                >
                  {pending ? (
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Icon data-icon="inline-start" />
                  )}
                  {action.label}
                </Button>
              );
            })}
        </div>

        {mobileBridge.lastResult && (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              mobileBridge.lastResult.ok
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive",
            )}
            role="status"
          >
            {mobileBridge.lastResult.message}
          </div>
        )}
      </div>
    </SettingsItem>
  );
}
