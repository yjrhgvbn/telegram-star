import { isTauri } from "@tauri-apps/api/core";
import { getPreferredNativeExternalUrl } from "@telegram-star/shared";

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

export interface MobileBridgeCommandResultMessage {
  type: typeof MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE;
  requestId: string;
  ok: boolean;
  message: string;
  status?: string;
}

type RemoteMobileShellMessage =
  | { type: "mobile-capability-query" }
  | {
      type: "mobile-command";
      requestId: string;
      command: MobileBridgeCommand;
      url?: string;
    };

const mobileBridgeCommands = new Set<MobileBridgeCommand>([
  "open-external",
  "reload",
  "switch-server",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMobileBridgeCommand(value: unknown): value is MobileBridgeCommand {
  return typeof value === "string" && mobileBridgeCommands.has(value as MobileBridgeCommand);
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

export function getMobileBridgeCapabilities(): MobileBridgeCapabilities {
  return {
    openExternal: true,
    reload: true,
    switchServer: true,
    deviceRegistration: true,
  };
}

export function buildMobileBridgeCapabilitiesMessage(): MobileBridgeCapabilitiesMessage {
  return {
    type: MOBILE_BRIDGE_CAPABILITIES_MESSAGE,
    capabilities: getMobileBridgeCapabilities(),
  };
}

export function buildMobileCommandResultMessage(
  result: Omit<MobileBridgeCommandResultMessage, "type">,
): MobileBridgeCommandResultMessage {
  return {
    type: MOBILE_BRIDGE_COMMAND_RESULT_MESSAGE,
    ...result,
  };
}

export function parseRemoteMobileShellMessage(
  event: Pick<MessageEvent, "data" | "origin">,
  serverUrl: string,
): RemoteMobileShellMessage | null {
  const expectedOrigin = getRemoteOrigin(serverUrl);
  if (!expectedOrigin || event.origin !== expectedOrigin || !isRecord(event.data)) {
    return null;
  }

  if (event.data.type === MOBILE_BRIDGE_CAPABILITY_QUERY_MESSAGE) {
    return { type: "mobile-capability-query" };
  }

  if (event.data.type === MOBILE_BRIDGE_COMMAND_MESSAGE) {
    const requestId = toRequestId(event.data.requestId);
    const command = event.data.command;
    if (!requestId || !isMobileBridgeCommand(command)) {
      return null;
    }

    if (command === "open-external") {
      const url = normalizeExternalUrl(event.data.url);
      return url ? { type: "mobile-command", requestId, command, url } : null;
    }

    return { type: "mobile-command", requestId, command };
  }

  return null;
}

export function postRemoteFrameMessage(
  target: Window | null | undefined,
  serverUrl: string,
  message: MobileBridgeCapabilitiesMessage | MobileBridgeCommandResultMessage,
): boolean {
  const targetOrigin = getRemoteOrigin(serverUrl);
  if (!target || !targetOrigin) return false;

  target.postMessage(message, targetOrigin);
  return true;
}

export async function openExternalUrl(url: string): Promise<void> {
  const normalized = normalizeExternalUrl(url);
  if (!normalized) throw new Error("外链地址不在允许范围内。");

  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    const preferredUrl = getPreferredNativeExternalUrl(normalized);
    try {
      await openUrl(preferredUrl);
    } catch (error) {
      if (preferredUrl !== normalized) {
        await openUrl(normalized);
        return;
      }
      throw error;
    }
    return;
  }

  window.open(normalized, "_blank", "noopener,noreferrer");
}
