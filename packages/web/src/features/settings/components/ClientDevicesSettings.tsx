import { useDeferredValue, useMemo, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ClientDevice } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import type { useClientDevices } from "../hooks/useClientDevices";
import { ClientRuntimeSettings, describeClientDevice } from "./ClientRuntimeSettings";
import "./SettingsDevices.css";

type ClientDevicesState = ReturnType<typeof useClientDevices>;
type DeviceFilter = "all" | "desktop" | "mobile" | "browser";

const deviceFilters: Array<{ value: DeviceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "desktop", label: "桌面" },
  { value: "mobile", label: "手机" },
  { value: "browser", label: "浏览器" },
];

function matchesDeviceFilter(device: ClientDevice, filter: DeviceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "browser") return device.type === "web" || device.type === "pwa";
  return device.type === filter;
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

export function ClientDevicesSettings({ state, onNavigateRequest }: {
  state: ClientDevicesState;
  onNavigateRequest?: (action: () => void) => void;
}) {
  const { devices, currentClientId, deletingId, loading, error, deleteDevice } = state;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [removingDevice, setRemovingDevice] = useState<ClientDevice | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const currentDevice = devices.find((device) => device.id === currentClientId);
  const visibleDevices = useMemo(() => devices.filter((device) => {
    if (!matchesDeviceFilter(device, filter)) return false;
    if (!deferredQuery) return true;
    const searchable = [
      device.name,
      describeClientDevice(device),
      device.type,
      device.platform,
      device.os,
      device.appVersion,
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(deferredQuery);
  }), [deferredQuery, devices, filter]);

  async function removeRecord() {
    if (!removingDevice || removingDevice.id === currentClientId || removing || deletingId) return;
    const device = removingDevice;
    setRemoving(true);
    setRemoveError(null);
    try {
      // Records are presence metadata, not sessions; removal does not revoke access.
      await deleteDevice(device.id);
      setFeedback(`已移除“${device.name || "未命名设备"}”的记录`);
      setRemovingDevice(null);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "移除失败，请重试。");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="settings-devices">
      <ClientRuntimeSettings device={currentDevice} onNavigateRequest={onNavigateRequest} />
      <section className="settings-devices__records" aria-labelledby="settings-devices-title">
        <div className="settings-devices__heading">
          <h2 id="settings-devices-title">设备记录 <span>{devices.length}</span></h2>
          <span className="settings-devices__feedback" role="status">{feedback}</span>
        </div>
        <div className="settings-devices__toolbar">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="搜索设备或平台"
            aria-label="搜索设备记录"
            clearLabel="清空设备搜索"
            containerClassName="settings-devices__search"
          />
          <ToggleGroup
            className="settings-devices__filters"
            aria-label="设备类型"
            value={[filter]}
            onValueChange={(values) => { if (values[0]) setFilter(values[0]); }}
          >
            {deviceFilters.map((item) => (
              <Toggle key={item.value} value={item.value}>{item.label}</Toggle>
            ))}
          </ToggleGroup>
        </div>
        {error ? (
          <div className="settings-devices__error" role="alert">
            <AlertCircle aria-hidden className="size-4" />
            <span>{error}</span>
          </div>
        ) : null}
        {loading && devices.length === 0 ? (
          <div className="settings-devices__loading" role="status" aria-label="读取设备记录中">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
        ) : (
          <>
            <div className="settings-devices__columns" aria-hidden="true">
              <span>名称与平台</span><span>最近活动</span><span />
            </div>
            <ul className="settings-devices__list" aria-label="设备记录列表">
              {visibleDevices.map((device) => {
                const current = device.id === currentClientId;
                return (
                  <li className="settings-devices__row" key={device.id}>
                    <div className="settings-devices__identity">
                      <div className="settings-devices__name">
                        <strong>{device.name || "未命名设备"}</strong>
                        {current ? <span>当前</span> : null}
                      </div>
                      <span className="settings-devices__platform">{describeClientDevice(device)}</span>
                    </div>
                    <span className="settings-devices__recent">
                      <span>最近活动 </span>{formatLastSeenAt(device.lastSeenAt)}
                    </span>
                    <Button
                      className="settings-devices__remove"
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`移除 ${device.name || device.id} 的记录`}
                      title={current ? "当前设备不可移除" : undefined}
                      disabled={current || Boolean(deletingId) || removing}
                      onClick={() => { setRemoveError(null); setRemovingDevice(device); }}
                    >
                      {deletingId === device.id ? <LoaderCircle className="animate-spin" /> : "移除"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {visibleDevices.length === 0 ? (
              <div className="settings-devices__empty">
                <p>{devices.length ? "没有找到匹配的设备" : "还没有设备记录"}</p>
                {devices.length ? (
                  <Button variant="ghost" onClick={() => { setQuery(""); setFilter("all"); }}>
                    查看全部记录
                  </Button>
                ) : null}
              </div>
            ) : null}
            <p className="settings-devices__count">显示 {visibleDevices.length} / {devices.length} 条记录</p>
          </>
        )}
      </section>
      <AlertDialog
        open={removingDevice !== null}
        onOpenChange={(open) => { if (!open && !removing) setRemovingDevice(null); }}
      >
        <AlertDialogContent className="settings-theme" size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>移除“{removingDevice?.name || "未命名设备"}”的记录？</AlertDialogTitle>
            <AlertDialogDescription>
              这不会中断设备访问。仍在运行的设备可能在下次上报时重新出现。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? <p className="settings-devices__error" role="alert">{removeError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void removeRecord()} disabled={removing}>
              {removing ? "移除中…" : "移除记录"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
