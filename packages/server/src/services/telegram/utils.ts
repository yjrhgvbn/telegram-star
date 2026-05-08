/**
 * Telegram 实体与消息的纯工具函数。
 * 本模块不依赖客户端单例，可独立测试。
 */
import type { FilterCondition } from "../filter-matching.js";

// --- 实体类型判断 ---

/** 判断 GramJS entity 是否为合法的群组或频道（排除私聊与机器人） */
export function isValidChat(entity: any): boolean {
  if (!entity) return false;
  return entity.className === "Channel" || entity.className === "Chat";
}

// --- 链接构造 ---

/**
 * 构造消息的 Telegram 跳转链接。
 * 公开 username 的会话使用 t.me/{username}/{id}，
 * 私有会话使用 t.me/c/{channelId}/{id}。
 */
export function buildTelegramLink(chatId: string, chat: any, messageId: number): string {
  if (chat?.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }
  // 去掉前缀 "-100" 得到纯数字 channelId
  const linkChatId = chatId.startsWith("-100") ? chatId.slice(4) : chatId.replace("-", "");
  return `https://t.me/c/${linkChatId}/${messageId}`;
}

// --- 发送者信息 ---

/** 从 GramJS sender 对象中提取展示名与 ID */
export function getSenderSummary(sender: any): { senderName: string; senderId: string } {
  const senderName = sender?.firstName
    ? `${sender.firstName}${sender.lastName ? ` ${sender.lastName}` : ""}`
    : sender?.title || sender?.username || "Unknown";
  const senderId = sender?.id?.toString?.() || "";
  return { senderName, senderId };
}

// --- 过滤器作用域 ---

/** 从条件列表中提取 chat 类型条件的 chatId 集合；空集合表示不限制范围 */
export function getScopedChatIds(conditions: FilterCondition[]): Set<string> {
  const chatCondition = conditions.find((c) => c.type === "chat");
  return new Set(chatCondition?.values ?? []);
}

/** 根据过滤器作用域判断某个 chatId 是否需要检查 */
export function shouldInspectChat(chatId: string, scopedChatIds: Set<string>): boolean {
  return scopedChatIds.size === 0 || scopedChatIds.has(chatId);
}

// --- 时间戳归一化 ---

/**
 * 将 GramJS message.date 统一转换为毫秒时间戳。
 * GramJS 在不同场景下可能返回 Unix 秒整数、Date 对象或可解析字符串。
 */
export function getMessageTimestampMs(message: any): number {
  if (typeof message?.date === "number") {
    return message.date * 1000;
  }
  if (message?.date instanceof Date) {
    return message.date.getTime();
  }
  const parsed = Date.parse(String(message?.date ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

// --- Dialog 工具 ---

/**
 * 将 getDialogs() 返回的列表转换为 chatId → entity 的查找表，
 * 仅包含合法的群组/频道实体。
 */
export function buildDialogEntityMap(dialogs: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const dialog of dialogs) {
    const entity = (dialog as any)?.entity;
    if (!isValidChat(entity)) continue;
    const chatId = entity?.id?.toString?.() || "";
    if (chatId) map.set(chatId, entity);
  }
  return map;
}
