import { useCallback, useEffect, useRef, useState } from "react";

export const DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE =
  "telegram-star:desktop-capability-query";
export const DESKTOP_BRIDGE_CAPABILITIES_MESSAGE =
  "telegram-star:desktop-capabilities";
export const DESKTOP_BRIDGE_COMMAND_MESSAGE = "telegram-star:desktop-command";
export const DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE =
  "telegram-star:desktop-command-result";

export type DesktopBridgeCommand =
  | "check-update"
  | "test-notification"
  | "open-external"
  | "reload"
  | "switch-server";

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

export interface DesktopBridgeCommandMessage {
  type: typeof DESKTOP_BRIDGE_COMMAND_MESSAGE;
  requestId: string;
  command: DesktopBridgeCommand;
  url?: string;
}

export interface DesktopBridgeCommandResultMessage {
  type: typeof DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE;
  requestId: string;
  ok: boolean;
  message: string;
  status?: string;
}

interface PendingRequest {
  command: DesktopBridgeCommand;
  resolve: (result: DesktopBridgeCommandResultMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBooleanRecord(
  value: unknown,
  keys: Array<keyof DesktopBridgeCapabilities>,
): value is DesktopBridgeCapabilities {
  return isRecord(value) && keys.every((key) => typeof value[key] === "boolean");
}

export function canUseDesktopParentBridge(
  targetWindow: Pick<Window, "parent"> | undefined = typeof window === "undefined"
    ? undefined
    : window,
): boolean {
  return Boolean(targetWindow && targetWindow.parent !== targetWindow);
}

export function createDesktopBridgeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDesktopCommandMessage(
  requestId: string,
  command: DesktopBridgeCommand,
  options: { url?: string } = {},
): DesktopBridgeCommandMessage {
  return {
    type: DESKTOP_BRIDGE_COMMAND_MESSAGE,
    requestId,
    command,
    ...(options.url ? { url: options.url } : {}),
  };
}

export function parseDesktopCapabilitiesMessage(
  data: unknown,
): DesktopBridgeCapabilitiesMessage | null {
  if (!isRecord(data) || data.type !== DESKTOP_BRIDGE_CAPABILITIES_MESSAGE) {
    return null;
  }

  const capabilityKeys: Array<keyof DesktopBridgeCapabilities> = [
    "nativeNotification",
    "openExternal",
    "reload",
    "switchServer",
    "tray",
    "appUpdater",
  ];

  if (!isBooleanRecord(data.capabilities, capabilityKeys)) {
    return null;
  }

  return {
    type: DESKTOP_BRIDGE_CAPABILITIES_MESSAGE,
    capabilities: data.capabilities,
  };
}

export function parseDesktopCommandResultMessage(
  data: unknown,
): DesktopBridgeCommandResultMessage | null {
  if (!isRecord(data) || data.type !== DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE) {
    return null;
  }

  if (
    typeof data.requestId !== "string" ||
    typeof data.ok !== "boolean" ||
    typeof data.message !== "string"
  ) {
    return null;
  }

  return {
    type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
    requestId: data.requestId,
    ok: data.ok,
    message: data.message,
    status: typeof data.status === "string" ? data.status : undefined,
  };
}

export function useDesktopBridge() {
  const pendingRequests = useRef(new Map<string, PendingRequest>());
  const [available, setAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<DesktopBridgeCapabilities | null>(null);
  const [pendingCommand, setPendingCommand] = useState<DesktopBridgeCommand | null>(null);
  const [lastResult, setLastResult] = useState<DesktopBridgeCommandResultMessage | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !canUseDesktopParentBridge(window)) return;

    const parentWindow = window.parent;

    function handleMessage(event: MessageEvent) {
      if (event.source !== parentWindow) return;

      const capabilitiesMessage = parseDesktopCapabilitiesMessage(event.data);
      if (capabilitiesMessage) {
        setAvailable(true);
        setCapabilities(capabilitiesMessage.capabilities);
        return;
      }

      const resultMessage = parseDesktopCommandResultMessage(event.data);
      if (!resultMessage) return;

      const pending = pendingRequests.current.get(resultMessage.requestId);
      if (!pending) return;

      window.clearTimeout(pending.timer);
      pendingRequests.current.delete(resultMessage.requestId);
      setPendingCommand((current) => (current === pending.command ? null : current));
      setLastResult(resultMessage);
      pending.resolve(resultMessage);
    }

    window.addEventListener("message", handleMessage);
    parentWindow.postMessage({ type: DESKTOP_BRIDGE_CAPABILITY_QUERY_MESSAGE }, "*");

    return () => {
      window.removeEventListener("message", handleMessage);
      for (const pending of pendingRequests.current.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingRequests.current.clear();
    };
  }, []);

  const sendCommand = useCallback(
    (command: DesktopBridgeCommand, options: { url?: string } = {}) => {
      if (typeof window === "undefined" || !canUseDesktopParentBridge(window)) {
        return Promise.resolve<DesktopBridgeCommandResultMessage>({
          type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
          requestId: "",
          ok: false,
          message: "当前客户端不支持桌面能力。",
        });
      }

      const requestId = createDesktopBridgeRequestId();
      const commandMessage = buildDesktopCommandMessage(requestId, command, options);

      return new Promise<DesktopBridgeCommandResultMessage>((resolve) => {
        const timer = window.setTimeout(() => {
          pendingRequests.current.delete(requestId);
          setPendingCommand((current) => (current === command ? null : current));

          const timeoutResult: DesktopBridgeCommandResultMessage = {
            type: DESKTOP_BRIDGE_COMMAND_RESULT_MESSAGE,
            requestId,
            ok: false,
            message: "桌面端暂无响应。",
            status: "timeout",
          };
          setLastResult(timeoutResult);
          resolve(timeoutResult);
        }, REQUEST_TIMEOUT_MS);

        pendingRequests.current.set(requestId, { command, resolve, timer });
        setPendingCommand(command);
        window.parent.postMessage(commandMessage, "*");
      });
    },
    [],
  );

  return {
    available,
    capabilities,
    pendingCommand,
    lastResult,
    sendCommand,
  };
}
