import type { AppConfigStatus, AppConfigUpdate } from "@telegram-star/shared/contracts/config";
import {
  getAppConfigStatus as loadAppConfigStatus,
  saveAppConfig as persistAppConfig,
} from "../../services/appConfig.js";
import { clearMediaCache as clearRuntimeMediaCache } from "../../services/mediaCache.js";
import { getClient, getConnectionStatus } from "../../services/telegram/client.js";
import { resetTelegramClient } from "../../services/telegram/auth.js";

export interface ConfigChangeFlags {
  telegram: boolean;
  media: boolean;
}

interface ConfigRuntimeEffects {
  getTelegramClient: () => { connected?: boolean; authorized?: boolean } | null | undefined;
  resetTelegramClient: () => void | Promise<void>;
  clearMediaCache: () => void;
}

const defaultRuntimeEffects: ConfigRuntimeEffects = {
  getTelegramClient: () => ({ connected: getClient()?.connected, authorized: getConnectionStatus().authorized }),
  resetTelegramClient,
  clearMediaCache: clearRuntimeMediaCache,
};

export function shouldResetTelegramClientAfterConfigChange(
  changed: ConfigChangeFlags,
  client: { connected?: boolean; authorized?: boolean } | null | undefined,
): boolean {
  return changed.telegram && (!client?.connected || client.authorized === false);
}

export async function applyConfigUpdateSideEffects(
  changed: ConfigChangeFlags,
  effects: ConfigRuntimeEffects = defaultRuntimeEffects,
): Promise<void> {
  // Telegram 凭证变化后，断开的 client 必须清空，下一次登录/初始化才会读取新配置。
  // 已连接 client 保持运行，避免用户保存其他配置时意外中断监听。
  if (shouldResetTelegramClientAfterConfigChange(changed, effects.getTelegramClient())) {
    await effects.resetTelegramClient();
  }

  // 缩略图质量配置会进入 cache key，保存媒体配置后清缓存能避免旧质量预览残留。
  if (changed.media) {
    effects.clearMediaCache();
  }
}

export async function getConfigStatus(): Promise<AppConfigStatus> {
  return loadAppConfigStatus();
}

export async function updateConfig(input: AppConfigUpdate): Promise<AppConfigStatus> {
  const result = await persistAppConfig(input);
  await applyConfigUpdateSideEffects(result.changed);
  return result.status;
}
