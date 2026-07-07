import { invoke, isTauri } from "@tauri-apps/api/core";

export const EVENT_SWITCH_SERVER = "telegram-star://switch-server";
export const EVENT_CHECK_UPDATE = "telegram-star://check-update";
export const EVENT_RELOAD_REMOTE = "telegram-star://reload-remote";
export const EVENT_OPEN_REMOTE_BROWSER = "telegram-star://open-remote-browser";
export const EVENT_TEST_NOTIFICATION = "telegram-star://test-notification";
export const DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE =
  "telegram-star:desktop-capability-query";
export const DESKTOP_BRIDGE_CAPABILITIES_MESSAGE =
  "telegram-star:desktop-capabilities";
export const DESKTOP_BRIDGE_COMMAND_MESSAGE = "telegram-star:desktop-command";
export const DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE =
  "telegram-star:desktop-command-result";
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel =
  import.meta.env.VITE_DESKTOP_UPDATE_CHANNEL === "beta" ? "beta" : "stable";

export type UpdateChannel = "stable" | "beta";
export type DesktopBridgeCommand =
  | "check-update"
  | "test-notification"
  | "open-external"
  | "reload"
  | "switch-server";

export interface DesktopNotificationInput {
  title: string;
  body?: string;
  url?: string;
  messageId?: number;
}

export interface DesktopNotificationResult {
  delivered: boolean;
  reason: "native" | "web" | "denied" | "unsupported";
}

export interface DesktopUpdateResult {
  channel: UpdateChannel;
  status: "unsupported" | "not-configured" | "available" | "latest" | "failed";
  message: string;
  version?: string;
  currentVersion?: string;
}

export interface DesktopBridgeCapabilities {
  nativeNotification: boolean;
  openExternal: boolean;
  reload: boolean;
  switchServer: boolean;
  tray: boolean;
  appUpdater: boolean;
}

export interface DesktopBridgeCapabilitiesMessage {
  type: typeof DESKTOP_BRIDGE_CAPABILITIES_MESSAGE;
  capabilities: DesktopBridgeCapabilities;
}

export interface DesktopBridgeCommandResultMessage {
  type: typeof DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE;
  requestId: string;
  ok: boolean;
  message: string;
  status?: string;
}

interface NativeUpdateCheckResult {
  channel: UpdateChannel;
  configured: boolean;
  available: boolean;
  currentVersion?: string | null;
  version?: string | null;
  body?: string | null;
  date?: string | null;
}

type RemoteShellMessage =
  | { type: "notification"; payload: DesktopNotificationInput }
  | { type: "open-external"; url: string }
  | { type: "desktop-capability-query" }
  | {
      type: "desktop-command";
      requestId: string;
      command: DesktopBridgeCommand;
      url?: string;
    };

const desktopBridgeCommands = new Set<DesktopBridgeCommand>([
  "check-update",
  "test-notification",
  "open-external",
  "reload",
  "switch-server",
]);

function isDesktopBridgeCommand(value: unknown): value is DesktopBridgeCommand {
  return typeof value === "string" && desktopBridgeCommands.has(value as DesktopBridgeCommand);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toBoundedText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;

  const text = value.trim();
  if (!text) return fallback;

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function toRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const requestId = value.trim();
  if (!requestId) return null;

  return requestId.slice(0, 80);
}

export function getRemoteOrigin(serverUrl: string): string | null {
  try {
    return new URL(serverUrl).origin;
  } catch {
    return null;
  }
}

export function normalizeExternalUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;

  try {
    const parsed = new URL(url.trim());
    if (["http:", "https:", "mailto:", "tel:", "tg:"].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export function parseRemoteShellMessage(
  event: Pick<MessageEvent, "data" | "origin">,
  serverUrl: string,
): RemoteShellMessage | null {
  const expectedOrigin = getRemoteOrigin(serverUrl);
  if (!expectedOrigin || event.origin !== expectedOrigin || !isRecord(event.data)) {
    return null;
  }

  if (event.data.type === "telegram-star:notification") {
    const payload: DesktopNotificationInput = {
      title: toBoundedText(event.data.title, "Telegram Star", 80),
      body: toBoundedText(event.data.body, "", 180),
    };

    const url = normalizeExternalUrl(event.data.url);
    if (url) payload.url = url;

    if (typeof event.data.messageId === "number" && Number.isFinite(event.data.messageId)) {
      payload.messageId = event.data.messageId;
    }

    return { type: "notification", payload };
  }

  if (event.data.type === "telegram-star:open-external") {
    const url = normalizeExternalUrl(event.data.url);
    return url ? { type: "open-external", url } : null;
  }

  if (event.data.type === DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE) {
    return { type: "desktop-capability-query" };
  }

  if (event.data.type === DESKTOP_BRIDGE_COMMAND_MESSAGE) {
    const requestId = toRequestId(event.data.requestId);
    const command = event.data.command;
    if (!requestId || !isDesktopBridgeCommand(command)) {
      return null;
    }

    if (command === "open-external") {
      const url = normalizeExternalUrl(event.data.url);
      return url ? { type: "desktop-command", requestId, command, url } : null;
    }

    return { type: "desktop-command", requestId, command };
  }

  return null;
}

export function getDesktopBridgeCapabilities(): DesktopBridgeCapabilities {
  return {
    nativeNotification: true,
    openExternal: true,
    reload: true,
    switchServer: true,
    tray: true,
    appUpdater: true,
  };
}

export function buildDesktopBridgeCapabilitiesMessage(): DesktopBridgeCapabilitiesMessage {
  return {
    type: DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
    capabilities: getDesktopBridgeCapabilities(),
  };
}

export function buildDesktopCommandResultMessage(
  result: Omit<DesktopBridgeCommandResultMessage, "type">,
): DesktopBridgeCommandResultMessage {
  return {
    type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
    ...result,
  };
}

export function postRemoteFrameMessage(
  target: Window | null | undefined,
  serverUrl: string,
  message: DesktopBridgeCapabilitiesMessage | DesktopBridgeCommandResultMessage,
): boolean {
  const targetOrigin = getRemoteOrigin(serverUrl);
  if (!target || !targetOrigin) return false;

  target.postMessage(message, targetOrigin);
  return true;
}

export async function openExternalUrl(url: string): Promise<void> {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) {
    throw new Error("外链地址不在允许范围内。");
  }

  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(normalized);
    return;
  }

  if (typeof window !== "undefined") {
    window.open(normalized, "_blank", "noopener,noreferrer");
  }
}

export async function revealMainWindow(): Promise<void> {
  if (isTauri()) {
    await invoke("reveal_main_window");
  }
}

export async function sendDesktopNotification(
  input: DesktopNotificationInput,
): Promise<DesktopNotificationResult> {
  const title = toBoundedText(input.title, "Telegram Star", 80);
  const body = toBoundedText(input.body, "", 180);

  if (isTauri()) {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );

    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }

    if (!granted) return { delivered: false, reason: "denied" };

    sendNotification({
      title,
      body,
      autoCancel: true,
      extra: {
        url: input.url,
        messageId: input.messageId,
      },
    });
    return { delivered: true, reason: "native" };
  }

  if (typeof Notification === "undefined") {
    return { delivered: false, reason: "unsupported" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") return { delivered: false, reason: "denied" };

  new Notification(title, { body });
  return { delivered: true, reason: "web" };
}

export async function setupNotificationActionForwarding(): Promise<() => void> {
  if (!isTauri()) return () => {};

  const { onAction } = await import("@tauri-apps/plugin-notification");
  const listener = await onAction(() => {
    void revealMainWindow();
  });

  return () => {
    void listener.unregister();
  };
}

export async function checkDesktopUpdate(
  channel: UpdateChannel = DEFAULT_UPDATE_CHANNEL,
): Promise<DesktopUpdateResult> {
  if (!isTauri()) {
    return {
      channel,
      status: "unsupported",
      message: "浏览器预览模式不支持 Tauri 更新检查。",
    };
  }

  try {
    const result = await invoke<NativeUpdateCheckResult>("check_update_channel", { channel });

    if (!result.configured) {
      return {
        channel: result.channel,
        status: "not-configured",
        message: "更新通道尚未配置。",
      };
    }

    if (result.available) {
      return {
        channel: result.channel,
        status: "available",
        message: `发现新版本 ${result.version ?? ""}`.trim(),
        version: result.version ?? undefined,
        currentVersion: result.currentVersion ?? undefined,
      };
    }

    return {
      channel: result.channel,
      status: "latest",
      message: "当前已经是最新版本。",
      currentVersion: result.currentVersion ?? undefined,
    };
  } catch (error) {
    return {
      channel,
      status: "failed",
      message: error instanceof Error ? error.message : "更新检查失败。",
    };
  }
}

export async function listenToNativeShellEvents(handlers: {
  onSwitchServer: () => void;
  onCheckUpdate: () => void;
  onReloadRemote: () => void;
  onOpenInBrowser: () => void;
  onTestNotification: () => void;
}): Promise<() => void> {
  if (!isTauri()) return () => {};

  const { listen } = await import("@tauri-apps/api/event");
  const unlistenSwitch = await listen(EVENT_SWITCH_SERVER, handlers.onSwitchServer);
  const unlistenUpdate = await listen(EVENT_CHECK_UPDATE, handlers.onCheckUpdate);
  const unlistenReload = await listen(EVENT_RELOAD_REMOTE, handlers.onReloadRemote);
  const unlistenOpenBrowser = await listen(
    EVENT_OPEN_REMOTE_BROWSER,
    handlers.onOpenInBrowser,
  );
  const unlistenTestNotification = await listen(
    EVENT_TEST_NOTIFICATION,
    handlers.onTestNotification,
  );

  return () => {
    unlistenSwitch();
    unlistenUpdate();
    unlistenReload();
    unlistenOpenBrowser();
    unlistenTestNotification();
  };
}

export async function setupWindowStatePersistence(): Promise<() => void> {
  if (!isTauri() || typeof window === "undefined") return () => {};

  const { restoreStateCurrent, saveWindowState, StateFlags } = await import(
    "@tauri-apps/plugin-window-state"
  );

  // 插件会在关闭时自动保存；这里显式恢复/保存一次，方便开发期和异常关闭后行为一致。
  await restoreStateCurrent(StateFlags.ALL).catch(() => undefined);

  const saveCurrentState = () => {
    void saveWindowState(StateFlags.ALL);
  };

  window.addEventListener("beforeunload", saveCurrentState);

  return () => {
    window.removeEventListener("beforeunload", saveCurrentState);
    saveCurrentState();
  };
}
