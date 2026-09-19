import { Api } from "telegram";
import type {
  ChatDiscoveryResponse,
  ChatDiscoveryResult,
} from "@telegram-star/shared/contracts/chats";
import { getClient, isClientConnected } from "./client.js";
import { createAsyncTtlCache, type AsyncTtlCache } from "./asyncTtlCache.js";
import { getDialogEntityMap } from "./dialogEntityCache.js";
import { getMessageTextContent } from "./media.js";
import {
  buildTelegramLink,
  getMessageTimestampMs,
  isValidChat,
  getChatTitle,
  getPeerChatId,
} from "./utils.js";

const DISCOVERY_CACHE_TTL_MS = 60_000;
const DISCOVERY_CACHE_MAX_ENTRIES = 24;
const DISCOVERY_MAX_MATCHES_PER_CHAT = 2;
const DISCOVERY_SNIPPET_LENGTH = 220;

type DiscoveryScope = "groups" | "broadcasts" | "users";

const discoveryCaches = new WeakMap<object, AsyncTtlCache<ChatDiscoveryResponse>>();

function getDiscoveryCache(client: object): AsyncTtlCache<ChatDiscoveryResponse> {
  const existing = discoveryCaches.get(client);
  if (existing) return existing;

  const created = createAsyncTtlCache<ChatDiscoveryResponse>({
    ttlMs: DISCOVERY_CACHE_TTL_MS,
    maxEntries: DISCOVERY_CACHE_MAX_ENTRIES,
  });
  discoveryCaches.set(client, created);
  return created;
}


function normalizeSnippet(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= DISCOVERY_SNIPPET_LENGTH) return normalized;

  // 尽量把命中词放在片段中部，避免长消息只展示开头而看不到发现依据。
  const matchIndex = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  let start = matchIndex < 0 ? 0 : Math.max(0, matchIndex - 70);
  let end = Math.min(normalized.length, start + DISCOVERY_SNIPPET_LENGTH);
  if (end === normalized.length) {
    start = Math.max(0, end - DISCOVERY_SNIPPET_LENGTH);
  }

  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${
    end < normalized.length ? "…" : ""
  }`;
}

function resolveChatType(entity: any): "group" | "channel" | "private" | "bot" {
  if (entity?.className === "User") return entity.bot ? "bot" : "private";
  return entity?.className === "Channel" && entity?.broadcast ? "channel" : "group";
}

export function buildChatDiscoveryResults(options: {
  messages: any[];
  joinedEntities: Map<string, any>;
  query: string;
  limit: number;
}): ChatDiscoveryResult[] {
  const normalizedQuery = options.query.toLocaleLowerCase();
  const sortedMessages = [...options.messages].sort(
    (a, b) => getMessageTimestampMs(b) - getMessageTimestampMs(a),
  );
  const discovered = new Map<string, ChatDiscoveryResult>();
  const seenMessages = new Set<string>();

  for (const message of sortedMessages) {
    const chatId = getPeerChatId(message?.peerId);
    if (!chatId) continue;

    const entity = options.joinedEntities.get(chatId);
    if (!entity || !isValidChat(entity)) continue;

    const messageId = Number(message?.id || 0);
    const messageKey = `${chatId}:${messageId}`;
    const content = getMessageTextContent(message);
    if (
      !messageId ||
      !content.trim() ||
      !content.toLocaleLowerCase().includes(normalizedQuery) ||
      seenMessages.has(messageKey)
    ) {
      continue;
    }
    seenMessages.add(messageKey);

    let result = discovered.get(chatId);
    if (!result) {
      // 结果按消息时间倒序处理；达到会话上限后仍会为已入选会话补齐第二条依据，
      // 但不会继续引入更老的新会话。
      if (discovered.size >= options.limit) continue;

      result = {
        chat: {
          id: chatId,
          title: getChatTitle(entity),
          type: resolveChatType(entity),
        },
        matches: [],
      };
      discovered.set(chatId, result);
    }

    if (result.matches.length >= DISCOVERY_MAX_MATCHES_PER_CHAT) continue;

    const timestampMs = getMessageTimestampMs(message);
    result.matches.push({
      messageId,
      snippet: normalizeSnippet(content, options.query),
      messageDate: new Date(timestampMs > 0 ? timestampMs : 0).toISOString(),
      telegramLink: buildTelegramLink(chatId, entity, messageId),
    });
  }

  return Array.from(discovered.values());
}

async function searchGlobalScope(options: {
  client: any;
  query: string;
  limit: number;
  scope: DiscoveryScope;
}): Promise<any[]> {
  const response = await options.client.invoke(
    new Api.messages.SearchGlobal({
      q: options.query,
      filter: new Api.InputMessagesFilterEmpty(),
      minDate: 0,
      maxDate: 0,
      offsetRate: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      offsetId: 0,
      limit: options.limit,
      ...(options.scope === "groups"
        ? { groupsOnly: true }
        : options.scope === "broadcasts" ? { broadcastsOnly: true } : { usersOnly: true }),
    }),
  );

  return Array.isArray((response as any)?.messages)
    ? (response as any).messages
    : [];
}

/**
 * 使用 Telegram 服务端索引按消息内容发现当前账号已有群组、频道、私聊与机器人会话。
 * 查询只保留一分钟内存缓存，不写数据库，也不会转成过滤器关键词。
 */
export async function discoverJoinedChats(options: {
  query: string;
  limit?: number;
}): Promise<ChatDiscoveryResponse> {
  const client = getClient();
  if (!client || !isClientConnected()) {
    throw new Error("Telegram client is not connected");
  }

  const query = options.query.trim();
  if (query.length < 2) throw new Error("请至少输入 2 个字符");

  const limit = Math.max(1, Math.min(options.limit ?? 20, 20));
  const cacheKey = `${query.toLocaleLowerCase()}:${limit}`;

  return getDiscoveryCache(client).get(cacheKey, async () => {
    const joinedEntities = await getDialogEntityMap();
    // 各类会话并行查询；使用 Telegram usersOnly 同时覆盖普通用户和机器人。
    const perScopeLimit = Math.min(100, Math.max(30, limit * 3));
    const [groupMessages, channelMessages, userMessages] = await Promise.all([
      searchGlobalScope({ client, query, limit: perScopeLimit, scope: "groups" }),
      searchGlobalScope({ client, query, limit: perScopeLimit, scope: "broadcasts" }),
      searchGlobalScope({ client, query, limit: perScopeLimit, scope: "users" }),
    ]);

    return {
      query,
      data: buildChatDiscoveryResults({
        messages: [...groupMessages, ...channelMessages, ...userMessages],
        joinedEntities,
        query,
        limit,
      }),
      partial: true,
    };
  });
}
