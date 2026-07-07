import { useCallback, useEffect, useRef, useState } from "react";

export const MOBILE_BRIDGE_CAPABILITY_QUERY_MESSAGE =
  "telegram-star:mobile-capability-query";
export const MOBILE_BRIDGE_CAPABILITIES_MESSAGE =
  "telegram-star:mobile-capabilities";
export const MOBILE_BRIDGE_COMMAND_MESSAGE = "telegram-star:mobile-command";
export const MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE =
  "telegram-star:mobile-command-result";

export type MobileBridgeCommand = "open-external" | "reload" | "switch-server";

export interface MobileBridgeCapabilities {
  openExternal: boolean;
  reload: boolean;
  switchServer: boolean;
  deviceRegistration: boolean;
}

export interface MobileBridgeCapabilitiesMessage {
  type: typeof MOBILE_BRIDGE_CAPABILITIES_MESSAGE;
  capabilities: MobileBridgeCapabilities;
}

export interface MobileBridgeCommandMessage {
  type: typeof MOBILE_BRIDGE_COMMAND_MESSAGE;
  requestId: string;
  command: MobileBridgeCommand;
  url?: string;
}

export interface MobileBridgeCommandResultMessage {
  type: typeof MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE;
  requestId: string;
  ok: boolean;
  message: string;
  status?: string;
}

interface PendingRequest {
  command: MobileBridgeCommand;
  resolve: (result: MobileBridgeCommandResultMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 8_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBooleanRecord(
  value: unknown,
  keys: Array<keyof MobileBridgeCapabilities>,
): value is MobileBridgeCapabilities {
  return isRecord(value) && keys.every((key) => typeof value[key] === "boolean");
}

export function canUseMobileParentBridge(
  targetWindow: Pick<Window, "parent"> | undefined = typeof window === "undefined"
    ? undefined
    : window,
): boolean {
  return Boolean(targetWindow && targetWindow.parent !== targetWindow);
}

export function createMobileBridgeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildMobileCommandMessage(
  requestId: string,
  command: MobileBridgeCommand,
  options: { url?: string } = {},
): MobileBridgeCommandMessage {
  return {
    type: MOBILE_BRIDGE_COMMAND_MESSAGE,
    requestId,
    command,
    ...(options.url ? { url: options.url } : {}),
  };
}

export function parseMobileCapabilitiesMessage(
  data: unknown,
): MobileBridgeCapabilitiesMessage | null {
  if (!isRecord(data) || data.type !== MOBILE_BRIDGE_CAPABILITIES_MESSAGE) {
    return null;
  }

  const capabilityKeys: Array<keyof MobileBridgeCapabilities> = [
    "openExternal",
    "reload",
    "switchServer",
    "deviceRegistration",
  ];

  if (!isBooleanRecord(data.capabilities, capabilityKeys)) {
    return null;
  }

  return {
    type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
    capabilities: data.capabilities,
  };
}

export function parseMobileCommandResultMessage(
  data: unknown,
): MobileBridgeCommandResultMessage | null {
  if (!isRecord(data) || data.type !== MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE) {
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
    type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
    requestId: data.requestId,
    ok: data.ok,
    message: data.message,
    status: typeof data.status === "string" ? data.status : undefined,
  };
}

export function useMobileBridge() {
  const pendingRequests = useRef(new Map<string, PendingRequest>());
  const [available, setAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<MobileBridgeCapabilities | null>(null);
  const [pendingCommand, setPendingCommand] = useState<MobileBridgeCommand | null>(null);
  const [lastResult, setLastResult] = useState<MobileBridgeCommandResultMessage | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !canUseMobileParentBridge(window)) return;

    const parentWindow = window.parent;

    function handleMessage(event: MessageEvent) {
      if (event.source !== parentWindow) return;

      const capabilitiesMessage = parseMobileCapabilitiesMessage(event.data);
      if (capabilitiesMessage) {
        setAvailable(true);
        setCapabilities(capabilitiesMessage.capabilities);
        return;
      }

      const resultMessage = parseMobileCommandResultMessage(event.data);
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
    parentWindow.postMessage({ type: MOBILE_BRIDGE_CAPABILITY_QUERY_MESSAGE }, "*");

    return () => {
      window.removeEventListener("message", handleMessage);
      for (const pending of pendingRequests.current.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingRequests.current.clear();
    };
  }, []);

  const sendCommand = useCallback(
    (command: MobileBridgeCommand, options: { url?: string } = {}) => {
      if (typeof window === "undefined" || !canUseMobileParentBridge(window)) {
        return Promise.resolve<MobileBridgeCommandResultMessage>({
          type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
          requestId: "",
          ok: false,
          message: "当前客户端不支持移动端能力。",
        });
      }

      const requestId = createMobileBridgeRequestId();
      const commandMessage = buildMobileCommandMessage(requestId, command, options);

      return new Promise<MobileBridgeCommandResultMessage>((resolve) => {
        const timer = window.setTimeout(() => {
          pendingRequests.current.delete(requestId);
          setPendingCommand((current) => (current === command ? null : current));

          const timeoutResult: MobileBridgeCommandResultMessage = {
            type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
            requestId,
            ok: false,
            message: "移动端暂无响应。",
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
