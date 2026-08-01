import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useClientDevices } from "../hooks/useClientDevices";

type ClientDevicesState = ReturnType<typeof useClientDevices>;
type DeviceFilter = "all" | "web" | "mobile" | "tauri";

const deviceFilters: Array<{ value: DeviceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "手机端" },
  { value: "tauri", label: "Tauri" },
];

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

function matchesDeviceFilter(device: ClientDevice, filter: DeviceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "mobile") return device.type === "mobile";
  if (filter === "tauri") return device.platform === "tauri";
  return device.platform === "browser" && (device.type === "web" || device.type === "pwa");
}

function formatLastSeenAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ClientDevicesSettings({
  state,
}: {
  state: ClientDevicesState;
}) {
  const {
    devices,
    currentClientId,
    deletingId,
    loading,
    refreshing,
    error,
    deleteDevice,
    refresh,
  } = state;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;

    const timer = window.setTimeout(() => {
      setConfirmDeleteId(null);
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  const filterCounts = useMemo(() => {
    const counts: Record<DeviceFilter, number> = {
      all: devices.length,
      web: 0,
      mobile: 0,
      tauri: 0,
    };

    for (const device of devices) {
      if (matchesDeviceFilter(device, "web")) counts.web += 1;
      if (matchesDeviceFilter(device, "mobile")) counts.mobile += 1;
      if (matchesDeviceFilter(device, "tauri")) counts.tauri += 1;
    }

    return counts;
  }, [devices]);

  const visibleDevices = useMemo(() => {
    return devices.filter((device) => {
      if (!matchesDeviceFilter(device, filter)) return false;
      if (!deferredQuery) return true;

      const searchable = [
        device.name,
        device.type,
        device.platform,
        device.os,
        device.appVersion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(deferredQuery);
    });
  }, [deferredQuery, devices, filter]);

  return (
    <div className="min-w-0 pt-3">
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索名称、平台或版本"
          aria-label="搜索设备"
          clearLabel="清空设备搜索"
          containerClassName="w-full sm:max-w-xs"
        />

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs text-muted-foreground">当前设备不可删除</span>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            刷新设备
          </Button>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1 border-b border-border py-2"
        role="group"
        aria-label="设备类型筛选"
      >
        {deviceFilters.map((item) => (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={filter === item.value ? "outline" : "ghost"}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className="h-8"
          >
            {item.label}
            <span className="text-xs text-muted-foreground">{filterCounts[item.value]}</span>
          </Button>
        ))}
      </div>

      {error ? (
        <div
          className="my-3 flex items-start gap-2 border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && devices.length === 0 ? (
        <div className="flex flex-col gap-2 py-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : visibleDevices.length === 0 ? (
        <div className="grid min-h-48 place-items-center border-b border-border px-4 py-10 text-center">
          <div>
            <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <MonitorSmartphone className="size-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">没有匹配的设备</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              调整搜索词或筛选条件后再试。
            </p>
          </div>
        </div>
      ) : (
        <div className="min-w-0 border-b border-border">
          <div className="hidden min-h-9 grid-cols-[minmax(220px,1fr)_92px_112px_128px_76px] items-center gap-3 border-b border-border bg-muted/35 px-3 text-xs font-medium text-muted-foreground xl:grid">
            <span>设备</span>
            <span>客户端</span>
            <span>平台</span>
            <span>最后在线</span>
            <span className="text-right">操作</span>
          </div>

          {visibleDevices.map((device) => {
            const DeviceIcon = getDeviceIcon(device);
            const current = device.id === currentClientId;
            const deleting = deletingId === device.id;
            const confirming = confirmDeleteId === device.id;

            return (
              <div
                key={device.id}
                className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/80 px-2 py-2.5 last:border-b-0 sm:px-3 xl:grid-cols-[minmax(220px,1fr)_92px_112px_128px_76px]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                    <DeviceIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {device.name || "未命名设备"}
                      </span>
                      {current ? (
                        <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                          当前
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground xl:hidden">
                      {getRuntimeLabel(device.type)} · {getPlatformLabel(device)}
                      {device.appVersion ? ` · v${device.appVersion}` : ""}
                      {" · "}
                      {formatLastSeenAt(device.lastSeenAt)}
                    </p>
                  </div>
                </div>

                <span className="hidden truncate text-xs text-muted-foreground xl:block">
                  {getRuntimeLabel(device.type)}
                </span>
                <span className="hidden truncate text-xs text-muted-foreground xl:block">
                  {getPlatformLabel(device)}
                </span>
                <span className="hidden truncate text-xs text-muted-foreground xl:block">
                  {formatLastSeenAt(device.lastSeenAt)}
                </span>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant={confirming ? "destructive" : "ghost"}
                    size={confirming ? "sm" : "icon-sm"}
                    aria-label={
                      confirming
                        ? `确认删除设备 ${device.name || device.id}`
                        : `删除设备 ${device.name || device.id}`
                    }
                    onClick={() => {
                      if (!confirming) {
                        setConfirmDeleteId(device.id);
                        return;
                      }

                      setConfirmDeleteId(null);
                      void deleteDevice(device.id);
                    }}
                    disabled={deleting || current}
                    className={cn(confirming && "h-8")}
                  >
                    {deleting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : confirming ? (
                      "确认"
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

      <div className="flex flex-col gap-1 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          显示 {visibleDevices.length} / {devices.length} 台
        </span>
        <span>删除与刷新会立即生效，无需另行保存。</span>
      </div>
    </div>
  );
}
