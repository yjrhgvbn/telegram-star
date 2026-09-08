import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { ClientDevice } from "@/types";
import { Button } from "@/components/ui/button";
import {
  buildClientDeviceName,
  detectClientRuntime,
} from "@/shared/runtime/clientRuntime";
import {
  useDesktopBridge,
  type DesktopBridgeCommand,
} from "@/shared/runtime/desktopBridge";
import {
  useMobileBridge,
  type MobileBridgeCommand,
} from "@/shared/runtime/mobileBridge";
import "./SettingsDevices.css";

type DeviceDescription = Pick<ClientDevice, "type" | "os" | "appVersion">;

const runtimeLabels = {
  web: "浏览器",
  pwa: "PWA",
  desktop: "桌面客户端",
  mobile: "手机客户端",
};
const osLabels = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
};

export function describeClientDevice(device: DeviceDescription): string {
  return [
    device.os ? osLabels[device.os] : null,
    runtimeLabels[device.type],
    device.appVersion ? `v${device.appVersion}` : null,
  ].filter(Boolean).join(" · ");
}

interface LocalAction {
  command: DesktopBridgeCommand | MobileBridgeCommand;
  label: string;
  enabled: boolean;
  run: () => Promise<unknown>;
}

function getCurrentPageUrl(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.href;
}

export function ClientRuntimeSettings({ device, onNavigateRequest }: {
  device?: ClientDevice;
  onNavigateRequest?: (action: () => void) => void;
}) {
  const [runtime] = useState(() => detectClientRuntime());
  const [actionError, setActionError] = useState<string | null>(null);
  const desktopBridge = useDesktopBridge();
  const mobileBridge = useMobileBridge();
  const desktopCapabilities = desktopBridge.available ? desktopBridge.capabilities : null;
  const mobileCapabilities = mobileBridge.available ? mobileBridge.capabilities : null;
  const bridge = desktopCapabilities ? desktopBridge : mobileCapabilities ? mobileBridge : null;
  // A hosted page can detect its iframe as a browser; the native bridge is the
  // authoritative source for the surrounding client's available actions.
  const currentType = desktopCapabilities
    ? "desktop"
    : mobileCapabilities ? "mobile" : device?.type ?? runtime.type;
  const currentRuntime = { ...runtime, type: currentType };
  const name = device?.name.trim() || buildClientDeviceName(currentRuntime);
  const description = describeClientDevice({
    type: currentType,
    os: device?.os ?? runtime.os,
    appVersion: device?.appVersion ?? runtime.appVersion,
  });

  let actions: LocalAction[] = [];
  if (desktopCapabilities) {
    const run = (command: DesktopBridgeCommand) => desktopBridge.sendCommand(command, {
      url: command === "open-external" ? getCurrentPageUrl() : undefined,
    });
    actions = [
      { command: "reload", label: "重新加载", enabled: desktopCapabilities.reload, run: () => run("reload") },
      { command: "open-external", label: "浏览器打开", enabled: desktopCapabilities.openExternal, run: () => run("open-external") },
      { command: "test-notification", label: "测试系统通知", enabled: desktopCapabilities.nativeNotification, run: () => run("test-notification") },
      { command: "check-update", label: "检查更新", enabled: desktopCapabilities.appUpdater, run: () => run("check-update") },
      { command: "switch-server", label: "更换客户端站点", enabled: desktopCapabilities.switchServer, run: () => run("switch-server") },
    ];
  } else if (mobileCapabilities) {
    const run = (command: MobileBridgeCommand) => mobileBridge.sendCommand(command, {
      url: command === "open-external" ? getCurrentPageUrl() : undefined,
    });
    actions = [
      { command: "reload", label: "重新加载", enabled: mobileCapabilities.reload, run: () => run("reload") },
      { command: "open-external", label: "浏览器打开", enabled: mobileCapabilities.openExternal, run: () => run("open-external") },
      { command: "switch-server", label: "更换客户端站点", enabled: mobileCapabilities.switchServer, run: () => run("switch-server") },
    ];
  }
  const availableActions = actions.filter((action) => action.enabled);
  const lastResult = bridge?.lastResult;

  async function runAction(action: LocalAction) {
    if (bridge?.pendingCommand) return;
    setActionError(null);
    try {
      await action.run();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败，请重试。");
    }
  }

  return (
    <section className="settings-runtime" aria-label="当前设备">
      <div className="settings-runtime__heading">
        <div className="settings-runtime__name">
          <h2>{name}</h2>
          <span>当前设备</span>
        </div>
        <p className="settings-runtime__description">{description}</p>
      </div>
      {availableActions.length > 0 ? (
        <div className="settings-runtime__actions" aria-label="本机操作">
          {availableActions.map((action) => (
            <Button
              key={action.command}
              type="button"
              variant="ghost"
              size="sm"
              disabled={Boolean(bridge?.pendingCommand)}
              title={action.command === "switch-server" ? "返回客户端连接设置，更换加载的站点" : undefined}
              onClick={() => {
                const execute = () => { void runAction(action); };
                // Reload and switching the native host both replace this page.
                // Let its owner protect unsaved settings before either command.
                if (onNavigateRequest && (action.command === "reload" || action.command === "switch-server")) {
                  onNavigateRequest(execute);
                } else execute();
              }}
            >
              {bridge?.pendingCommand === action.command ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : null}
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
      {actionError || lastResult ? (
        <p
          className="settings-runtime__feedback"
          data-error={Boolean(actionError || !lastResult?.ok) || undefined}
          role={actionError || !lastResult?.ok ? "alert" : "status"}
        >
          {actionError || lastResult?.message}
        </p>
      ) : null}
    </section>
  );
}
