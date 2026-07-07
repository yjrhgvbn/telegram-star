import {
  AlertCircle,
  Globe,
  Laptop,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import type { ClientDevice, ClientRuntimeType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsItem } from "./SettingsSection";
import { useClientDevices } from "../hooks/useClientDevices";

function getRuntimeLabel(type: ClientRuntimeType): string {
  if (type === "pwa") return "PWA";
  if (type === "desktop") return "桌面端";
  if (type === "mobile") return "手机端";
  return "Web";
}

function getPlatformLabel(device: ClientDevice): string {
  if (device.platform === "tauri") return "Tauri";
  return device.os ?? "browser";
}

function getDeviceIcon(device: ClientDevice) {
  if (device.type === "mobile") return Smartphone;
  if (device.type === "desktop") return Laptop;
  if (device.type === "pwa") return MonitorSmartphone;
  return Globe;
}

function formatLastSeenAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";

  // 设置页只需要轻量展示“最后在线”，完整 ISO 时间仍由 API 保留给后续高级视图使用。
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ClientDevicesSettings() {
  const {
    devices,
    currentClientId,
    deletingId,
    loading,
    refreshing,
    error,
    deleteDevice,
    refresh,
  } = useClientDevices();

  return (
    <SettingsItem
      title="已注册设备"
      description="Web、PWA、桌面端和手机端最近在线记录。"
      meta={
        <Badge variant="secondary" className="h-6 px-2">
          {devices.length}
        </Badge>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn(refreshing && "animate-spin")}
              data-icon="inline-start"
            />
            刷新设备
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && devices.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg bg-background/58 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            读取设备中
          </div>
        ) : devices.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-lg bg-background/58 px-3 text-center text-sm text-muted-foreground">
            暂无设备记录，打开 Web 或 PWA 后会自动注册。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device);
              const current = device.id === currentClientId;
              const deleting = deletingId === device.id;
              // 当前设备仍会持续心跳，删除后会很快重新注册，因此只允许清理其他端的记录。

              return (
                <div
                  key={device.id}
                  className="grid gap-3 rounded-lg bg-background/60 px-3 py-2.5 shadow-[0_8px_24px_color-mix(in_oklab,var(--foreground)_5%,transparent)] sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
                      <DeviceIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {device.name || "未命名设备"}
                        </span>
                        {current && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                            当前
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <span>{getRuntimeLabel(device.type)}</span>
                        <span>{getPlatformLabel(device)}</span>
                        {device.appVersion && <span>v{device.appVersion}</span>}
                        <span>最后在线 {formatLastSeenAt(device.lastSeenAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除设备 ${device.name || device.id}`}
                      onClick={() => void deleteDevice(device.id)}
                      disabled={deleting || current}
                    >
                      {deleting ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SettingsItem>
  );
}
