import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { appConfig } from "../config.js";

export type NotificationSource = "feishu";

export interface NotificationSettings {
  sources: NotificationSource[];
  feishuWebhookUrl: string;
}

interface NotificationSettingsInput {
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

function fromEnvironment(): NotificationSettings {
  return {
    sources: [],
    feishuWebhookUrl: "",
  };
}

function parseStoredSettings(raw: string): NotificationSettingsInput {
  try {
    const parsed = JSON.parse(raw) as NotificationSettingsInput;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return {
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.filter((item): item is string => typeof item === "string")
        : undefined,
      feishuWebhookUrl: typeof parsed.feishuWebhookUrl === "string" ? parsed.feishuWebhookUrl : undefined,
    };
  } catch {
    return {};
  }
}

function mergeSettings(base: NotificationSettings, update: NotificationSettingsInput): NotificationSettings {
  return {
    sources: update.sources !== undefined ? sanitizeSources(update.sources) : base.sources,
    feishuWebhookUrl:
      update.feishuWebhookUrl !== undefined ? update.feishuWebhookUrl.trim() : base.feishuWebhookUrl,
  };
}

function loadFromFile(): NotificationSettingsInput {
  const settingsPath = appConfig.notifications.settingsPath;
  if (!existsSync(settingsPath)) {
    return {};
  }

  const raw = readFileSync(settingsPath, "utf-8");
  return parseStoredSettings(raw);
}

function saveToFile(settings: NotificationSettings): void {
  const settingsPath = appConfig.notifications.settingsPath;
  const dir = dirname(settingsPath);
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        sources: settings.sources,
        feishuWebhookUrl: settings.feishuWebhookUrl,
      },
      null,
      2
    ),
    "utf-8"
  );
}

let cachedSettings: NotificationSettings | null = null;

export function getNotificationSettings(): NotificationSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const defaults = fromEnvironment();
  cachedSettings = mergeSettings(defaults, loadFromFile());
  return cachedSettings;
}

export function updateNotificationSettings(input: NotificationSettingsInput): NotificationSettings {
  const current = getNotificationSettings();
  const next = mergeSettings(current, input);
  saveToFile(next);
  cachedSettings = next;
  return next;
}
