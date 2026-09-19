import { appConfig, hasEnvTelegramConfig, updateMediaConfig, updateTelegramConfig } from "../config.js";
import { db } from "../db/index.js";
import type {
  AppConfigStatus,
  AppConfigUpdate,
  MediaConfigStatus,
  TelegramConfigStatus,
} from "@telegram-star/shared/contracts/config";

const TELEGRAM_CONFIG_KEY = "telegram";
const MEDIA_CONFIG_KEY = "media";
const DEFAULT_THUMB_INDEX = 1;

interface StoredTelegramConfig {
  apiId: number;
  apiHash: string;
}

interface StoredMediaConfig {
  thumbIndex: number;
}

function thumbQualityFromIndex(thumbIndex: number): MediaConfigStatus["thumbQuality"] {
  if (thumbIndex === 0) return "low";
  if (thumbIndex === 2) return "high";
  return "medium";
}

function maskApiHash(apiHash: string): string {
  const trimmed = apiHash.trim();
  if (trimmed.length <= 8) {
    return "*".repeat(trimmed.length);
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

async function getStoredTelegramConfig(): Promise<StoredTelegramConfig | null> {
  const record = await db.appConfig.findUnique({
    where: { key: TELEGRAM_CONFIG_KEY },
  });
  return record ? parseTelegramConfig(record.valueJson) : null;
}

async function getStoredMediaConfig(): Promise<StoredMediaConfig | null> {
  const record = await db.appConfig.findUnique({
    where: { key: MEDIA_CONFIG_KEY },
  });
  return record ? parseMediaConfig(record.valueJson) : null;
}

function toStatus(
  source: TelegramConfigStatus["telegramConfigSource"],
  config: StoredTelegramConfig | null,
  databaseConfigured: boolean,
): TelegramConfigStatus {
  return {
    telegramConfigured: Boolean(config),
    telegramConfigSource: config ? source : "missing",
    databaseConfigured,
    apiId: config?.apiId ?? null,
    apiHashMasked: config ? maskApiHash(config.apiHash) : null,
  };
}

function parseTelegramConfig(valueJson: string): StoredTelegramConfig | null {
  try {
    const value = JSON.parse(valueJson) as Partial<StoredTelegramConfig>;
    const apiId = typeof value.apiId === "number" ? value.apiId : Number(value.apiId);
    const apiHash = typeof value.apiHash === "string" ? value.apiHash.trim() : "";
    if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) {
      return null;
    }
    return { apiId, apiHash };
  } catch {
    return null;
  }
}

function parseMediaConfig(valueJson: string): StoredMediaConfig | null {
  try {
    const value = JSON.parse(valueJson) as Partial<StoredMediaConfig>;
    const thumbIndex = Number(value.thumbIndex);
    if (!Number.isInteger(thumbIndex) || thumbIndex < 0 || thumbIndex > 2) {
      return null;
    }
    return { thumbIndex };
  } catch {
    return null;
  }
}

function validateTelegramConfig(
  input: { apiId: unknown; apiHash: unknown },
  currentConfig: StoredTelegramConfig | null,
): StoredTelegramConfig {
  const apiId = typeof input.apiId === "number" ? input.apiId : Number(input.apiId);
  const apiHash = typeof input.apiHash === "string" ? input.apiHash.trim() : "";

  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error("TELEGRAM_API_ID must be a positive number");
  }
  if (!apiHash && !currentConfig?.apiHash) {
    throw new Error("TELEGRAM_API_HASH is required");
  }

  return { apiId, apiHash: apiHash || currentConfig?.apiHash || "" };
}

function validateMediaConfig(input: { thumbIndex: unknown }): StoredMediaConfig {
  const thumbIndex = Number(input.thumbIndex);
  if (!Number.isInteger(thumbIndex) || thumbIndex < 0 || thumbIndex > 2) {
    throw new Error("thumbIndex must be 0, 1, or 2");
  }
  return { thumbIndex };
}

function toMediaStatus(config: StoredMediaConfig): MediaConfigStatus {
  return {
    thumbIndex: config.thumbIndex,
    thumbQuality: thumbQualityFromIndex(config.thumbIndex),
  };
}

export async function loadTelegramConfigFromDatabase(): Promise<TelegramConfigStatus> {
  const storedConfig = await getStoredTelegramConfig();

  if (storedConfig) {
    updateTelegramConfig(storedConfig);
    return toStatus("database", storedConfig, true);
  }

  if (hasEnvTelegramConfig()) {
    const envConfig = {
      apiId: appConfig.telegram.envApiId || 0,
      apiHash: appConfig.telegram.envApiHash || "",
    };
    updateTelegramConfig(envConfig);
    return toStatus("env", envConfig, false);
  }

  return toStatus("missing", null, false);
}

export async function getTelegramConfigStatus(): Promise<TelegramConfigStatus> {
  return loadTelegramConfigFromDatabase();
}

export async function loadMediaConfigFromDatabase(): Promise<MediaConfigStatus> {
  const mediaConfig = (await getStoredMediaConfig()) ?? { thumbIndex: DEFAULT_THUMB_INDEX };
  updateMediaConfig(mediaConfig);
  return toMediaStatus(mediaConfig);
}

export async function getMediaConfigStatus(): Promise<MediaConfigStatus> {
  return loadMediaConfigFromDatabase();
}

export async function getAppConfigStatus(): Promise<AppConfigStatus> {
  const [telegram, media] = await Promise.all([
    getTelegramConfigStatus(),
    getMediaConfigStatus(),
  ]);
  return { telegram, media };
}

export async function saveTelegramConfig(input: {
  apiId: unknown;
  apiHash: unknown;
}): Promise<TelegramConfigStatus> {
  const validated = validateTelegramConfig(input, await getStoredTelegramConfig());
  return (await saveAppConfig({ telegram: validated })).status.telegram;
}

export async function saveMediaConfig(input: { thumbIndex: unknown }): Promise<MediaConfigStatus> {
  const validated = validateMediaConfig(input);
  return (await saveAppConfig({ media: validated })).status.media;
}

export async function saveAppConfig(input: AppConfigUpdate): Promise<{
  status: AppConfigStatus;
  changed: { telegram: boolean; media: boolean };
}> {
  // Validate the entire request before writing. Both rows commit together; runtime state
  // changes only after commit, so a failed request cannot leave half-applied credentials.
  const telegram = input.telegram === undefined ? null : validateTelegramConfig({
    apiId: input.telegram.apiId,
    apiHash: input.telegram.apiHash,
  }, await getStoredTelegramConfig());
  const media = input.media === undefined ? null : validateMediaConfig({ thumbIndex: input.media.thumbIndex });
  const now = new Date().toISOString();
  if (telegram || media) {
    await db.$transaction(async (tx) => {
      for (const [key, value] of [[TELEGRAM_CONFIG_KEY, telegram], [MEDIA_CONFIG_KEY, media]] as const) {
        if (!value) continue;
        const valueJson = JSON.stringify(value);
        await tx.appConfig.upsert({
          where: { key },
          create: { key, valueJson, createdAt: now, updatedAt: now },
          update: { valueJson, updatedAt: now },
        });
      }
    });
  }
  if (telegram) updateTelegramConfig(telegram);
  if (media) updateMediaConfig(media);
  return {
    status: await getAppConfigStatus(),
    changed: { telegram: telegram !== null, media: media !== null },
  };
}
