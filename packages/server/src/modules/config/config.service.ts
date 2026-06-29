import type { AppConfigStatus, AppConfigUpdate } from "@telegram-star/shared/contracts/config";
import {
  getAppConfigStatus as loadAppConfigStatus,
  saveAppConfig as persistAppConfig,
} from "../../services/appConfig.js";
import { clearMediaCache as clearRuntimeMediaCache } from "../../services/mediaCache.js";
import { getClient, setClient, setConnected } from "../../services/telegram.js";

export interface ConfigChangeFlags {
  telegram: boolean;
  media: boolean;
}

interface ConfigRuntimeEffects {
  getTelegramClient: () => { connected?: boolean } | null | undefined;
  resetTelegramClient: () => void;
  clearMediaCache: () => void;
}

const defaultRuntimeEffects: ConfigRuntimeEffects = {
  getTelegramClient: getClient,
  resetTelegramClient: () => {
    setClient(null);
    setConnected(false);
  },
  clearMediaCache: clearRuntimeMediaCache,
};

export function shouldResetTelegramClientAfterConfigChange(
  changed: ConfigChangeFlags,
  client: { connected?: boolean } | null | undefined,
): boolean {
  return changed.telegram && !client?.connected;
}

export function applyConfigUpdateSideEffects(
  changed: ConfigChangeFlags,
  effects: ConfigRuntimeEffects = defaultRuntimeEffects,
): void {
  // Telegram 凭证变化后，断开的 client 必须清空，下一次登录/初始化才会读取新配置。
  // 已连接 client 保持运行，避免用户保存其他配置时意外中断监听。
  if (shouldResetTelegramClientAfterConfigChange(changed, effects.getTelegramClient())) {
    effects.resetTelegramClient();
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
  applyConfigUpdateSideEffects(result.changed);
  return result.status;
}
