import { db } from "../db/index.js";

export type NotificationSource = "feishu";

export interface NotificationSettings {
  sources: NotificationSource[];
  feishuWebhookUrl: string;
}

export interface NotificationSettingsInput {
  sources?: string[];
  feishuWebhookUrl?: string;
}

const SUPPORTED_SOURCES: NotificationSource[] = ["feishu"];

function sanitizeSources(input: string[] | undefined): NotificationSource[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized = input
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is NotificationSource => SUPPORTED_SOURCES.includes(item as NotificationSource));

  return Array.from(new Set(normalized));
}

function defaultSettings(): NotificationSettings {
  return {
    sources: [],
    feishuWebhookUrl: "",
  };
}

function mergeSettings(base: NotificationSettings, update: NotificationSettingsInput): NotificationSettings {
  return {
    sources: update.sources !== undefined ? sanitizeSources(update.sources) : base.sources,
    feishuWebhookUrl:
      update.feishuWebhookUrl !== undefined ? update.feishuWebhookUrl.trim() : base.feishuWebhookUrl,
  };
}

function parseSourcesJson(raw: string): NotificationSource[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sanitizeSources(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return [];
  }
}

function parseConfigJson(raw: string): NotificationSettings {
  try {
    const parsed = JSON.parse(raw) as {
      sources?: unknown;
      feishuWebhookUrl?: unknown;
    };

    return {
      sources: parseSourcesJson(JSON.stringify(parsed?.sources ?? [])),
      feishuWebhookUrl: typeof parsed?.feishuWebhookUrl === "string" ? parsed.feishuWebhookUrl : "",
    };
  } catch {
    return defaultSettings();
  }
}

function toPublicSettings(row: {
  configJson: string;
}): NotificationSettings {
  return parseConfigJson(row.configJson);
}

const CONFIG_KEY = "notifications/default";

async function ensureSettingsRow(): Promise<{
  id: number;
  configKey: string;
  configJson: string;
  createdAt: string;
  updatedAt: string;
}> {
  const existing = await db.notificationSetting.findUnique({ where: { configKey: CONFIG_KEY } });
  if (existing) {
    return existing;
  }

  const initial = defaultSettings();
  const now = new Date().toISOString();

  return db.notificationSetting.create({
    data: {
      configKey: CONFIG_KEY,
      configJson: JSON.stringify(initial),
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const row = await ensureSettingsRow();
  return toPublicSettings(row);
}

export async function updateNotificationSettings(input: NotificationSettingsInput): Promise<NotificationSettings> {
  const row = await ensureSettingsRow();
  const current = toPublicSettings(row);
  const next = mergeSettings(current, input);
  const now = new Date().toISOString();

  const updated = await db.notificationSetting.update({
    where: { configKey: CONFIG_KEY },
    data: {
      configJson: JSON.stringify(next),
      updatedAt: now,
    },
  });

  return toPublicSettings(updated);
}
