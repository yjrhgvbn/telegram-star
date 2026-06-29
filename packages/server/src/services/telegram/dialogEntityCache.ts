import { getClient, isClientConnected } from "./client.js";
import { buildDialogEntityMap } from "./utils.js";

const DIALOG_MAP_TTL_MS = 5 * 60 * 1000; // 5 分钟
const DIALOG_FETCH_LIMIT = 500;

interface DialogEntityMapProviderDependencies {
  now?: () => number;
  ttlMs?: number;
  dialogLimit?: number;
  getClient?: () => any;
  isClientConnected?: () => boolean;
  buildEntityMap?: (dialogs: any[]) => Map<string, any>;
}

interface DialogEntityMapProvider {
  getDialogEntityMap: () => Promise<Map<string, any>>;
  clear: () => void;
}

export function createDialogEntityMapProvider(
  dependencies: DialogEntityMapProviderDependencies = {},
): DialogEntityMapProvider {
  const now = dependencies.now ?? Date.now;
  const ttlMs = dependencies.ttlMs ?? DIALOG_MAP_TTL_MS;
  const dialogLimit = dependencies.dialogLimit ?? DIALOG_FETCH_LIMIT;
  const getTelegramClient = dependencies.getClient ?? getClient;
  const isTelegramClientConnected = dependencies.isClientConnected ?? isClientConnected;
  const buildEntityMap = dependencies.buildEntityMap ?? buildDialogEntityMap;

  let dialogEntityMap: Map<string, any> | null = null;
  let dialogEntityMapUpdatedAt = 0;

  return {
    async getDialogEntityMap() {
      const currentTime = now();
      if (dialogEntityMap && currentTime - dialogEntityMapUpdatedAt < ttlMs) {
        return dialogEntityMap;
      }

      const client = getTelegramClient();
      if (!client || !isTelegramClientConnected()) {
        return dialogEntityMap ?? new Map();
      }

      const dialogs = await client.getDialogs({ limit: dialogLimit });
      dialogEntityMap = buildEntityMap(dialogs as any[]);
      dialogEntityMapUpdatedAt = currentTime;
      return dialogEntityMap;
    },

    clear() {
      dialogEntityMap = null;
      dialogEntityMapUpdatedAt = 0;
    },
  };
}

const defaultDialogEntityMapProvider = createDialogEntityMapProvider();

export const getDialogEntityMap = defaultDialogEntityMapProvider.getDialogEntityMap;
export const clearDialogEntityMapCache = defaultDialogEntityMapProvider.clear;
