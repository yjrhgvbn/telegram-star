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
  let cachedClient: any = null;
  let generation = 0;
  let pending: Promise<Map<string, any>> | null = null;

  function clear(): void {
    generation += 1;
    dialogEntityMap = null;
    dialogEntityMapUpdatedAt = 0;
    pending = null;
  }

  return {
    async getDialogEntityMap() {
      const client = getTelegramClient();
      // Entity access hashes belong to the account that fetched them, even when peer IDs match.
      if (cachedClient !== client) {
        cachedClient = client;
        clear();
      }
      const currentTime = now();
      if (dialogEntityMap && currentTime - dialogEntityMapUpdatedAt < ttlMs) {
        return dialogEntityMap;
      }

      if (!client || !isTelegramClientConnected()) {
        return dialogEntityMap ?? new Map();
      }
      if (pending) return pending;
      const requestGeneration = generation;
      const request = (async () => {
        const dialogs = await client.getDialogs({ limit: dialogLimit });
        // A request from a detached account must neither refill the cache nor leak its entities
        // to callers already waiting when logout, account switching or explicit clearing occurs.
        if (getTelegramClient() !== client || generation !== requestGeneration || !isTelegramClientConnected()) {
          return new Map<string, any>();
        }
        dialogEntityMap = buildEntityMap(dialogs as any[]);
        dialogEntityMapUpdatedAt = now();
        return dialogEntityMap;
      })();
      pending = request;
      try {
        return await request;
      } finally {
        if (pending === request) pending = null;
      }
    },

    clear,
  };
}

const defaultDialogEntityMapProvider = createDialogEntityMapProvider();

export const getDialogEntityMap = defaultDialogEntityMapProvider.getDialogEntityMap;
export const clearDialogEntityMapCache = defaultDialogEntityMapProvider.clear;
