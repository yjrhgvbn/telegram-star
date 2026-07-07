import {
  clientCapabilitiesSchema,
  clientDeviceActionResponseSchema,
  clientDeviceHeartbeatResponseSchema,
  clientDeviceListSchema,
  clientDeviceSchema,
  type ClientCapabilities,
  type ClientDevice,
  type ClientDeviceActionResponse,
  type ClientDeviceHeartbeatResponse,
  type ClientDeviceRegisterInput,
} from "@telegram-star/shared/contracts/clients";
import {
  deleteClientDeviceRow,
  findClientDeviceById,
  findClientDeviceRows,
  updateClientDeviceHeartbeatRow,
  upsertClientDeviceRow,
  type ClientDeviceRow,
} from "./clients.repository.js";

// 兜底能力集只用于异常数据恢复，正常路径仍以客户端上报并经过 schema 校验的能力为准。
const DEFAULT_CLIENT_CAPABILITIES: ClientCapabilities = {
  nativeNotification: false,
  secureStorage: false,
  openExternal: false,
  scanQrCode: false,
  backgroundRefresh: false,
  tray: false,
  appUpdater: false,
};

export class ClientDeviceNotFoundError extends Error {
  constructor() {
    super("Client device not found");
  }
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseCapabilities(value: string): ClientCapabilities {
  try {
    return clientCapabilitiesSchema.parse(JSON.parse(value || "{}"));
  } catch {
    // 数据库里只写入后端校验过的 JSON；这里兜底是为了避免旧数据或手工改库导致设备列表整体不可用。
    return DEFAULT_CLIENT_CAPABILITIES;
  }
}

export function toApiClientDevice(row: ClientDeviceRow): ClientDevice {
  return clientDeviceSchema.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    platform: row.platform,
    os: row.os ?? undefined,
    appVersion: row.appVersion ?? undefined,
    capabilities: parseCapabilities(row.capabilities),
    pushToken: row.pushToken ?? undefined,
    lastSeenAt: toIsoString(row.lastSeenAt),
    createdAt: toIsoString(row.createdAt),
    revokedAt: toIsoString(row.revokedAt),
  });
}

export async function listClientDevices(): Promise<ClientDevice[]> {
  const devices = await findClientDeviceRows();
  return clientDeviceListSchema.parse(devices.map(toApiClientDevice));
}

export async function registerClientDevice(
  input: ClientDeviceRegisterInput,
): Promise<ClientDevice> {
  return toApiClientDevice(await upsertClientDeviceRow(input));
}

export async function heartbeatClientDevice(
  id: string,
): Promise<ClientDeviceHeartbeatResponse> {
  const existing = await findClientDeviceById(id);
  // 心跳不自动创建设备，避免拼错 id 或旧端残留请求悄悄污染设备列表；前端会在失败后重新 register。
  if (!existing) throw new ClientDeviceNotFoundError();

  const updated = await updateClientDeviceHeartbeatRow(id);
  return clientDeviceHeartbeatResponseSchema.parse({
    success: true,
    lastSeenAt: toIsoString(updated.lastSeenAt),
  });
}

export async function deleteClientDevice(id: string): Promise<ClientDeviceActionResponse> {
  const existing = await findClientDeviceById(id);
  if (!existing) throw new ClientDeviceNotFoundError();

  // 删除设备记录不撤销访问权限；本项目当前不做单用户认证，这里只维护“端列表”体验状态。
  await deleteClientDeviceRow(id);
  return clientDeviceActionResponseSchema.parse({ success: true });
}
