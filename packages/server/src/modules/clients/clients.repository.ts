import { db } from "../../db/index.js";
import type { ClientDeviceRegisterInput } from "@telegram-star/shared/contracts/clients";

export type ClientDeviceRow = Awaited<ReturnType<typeof findClientDeviceRows>>[number];

export async function findClientDeviceRows() {
  return db.clientDevice.findMany({
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function findClientDeviceById(id: string) {
  return db.clientDevice.findUnique({ where: { id } });
}

export async function upsertClientDeviceRow(
  input: ClientDeviceRegisterInput,
  lastSeenAt = new Date(),
): Promise<ClientDeviceRow> {
  // DB 层用字符串保存能力集，API 层仍通过 shared schema 暴露结构化对象。
  const capabilities = JSON.stringify(input.capabilities);

  // 注册接口保持幂等：同一个端重复打开只刷新设备信息和最后在线时间，不新增重复记录。
  return db.clientDevice.upsert({
    where: { id: input.clientId },
    update: {
      name: input.name,
      type: input.type,
      platform: input.platform,
      os: input.os,
      appVersion: input.appVersion,
      capabilities,
      pushToken: input.pushToken,
      lastSeenAt,
      revokedAt: null,
    },
    create: {
      id: input.clientId,
      name: input.name,
      type: input.type,
      platform: input.platform,
      os: input.os,
      appVersion: input.appVersion,
      capabilities,
      pushToken: input.pushToken,
      lastSeenAt,
    },
  });
}

export async function updateClientDeviceHeartbeatRow(
  id: string,
  lastSeenAt = new Date(),
): Promise<ClientDeviceRow> {
  // 心跳只更新在线时间，不修改端类型和能力集，避免运行时检测偶发差异污染设备信息。
  return db.clientDevice.update({
    where: { id },
    data: { lastSeenAt },
  });
}

export async function deleteClientDeviceRow(id: string): Promise<void> {
  // 当前阶段设备记录不是权限凭据，删除只是从设置页移除该端展示记录。
  await db.clientDevice.delete({ where: { id } });
}
