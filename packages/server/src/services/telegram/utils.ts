/**
 * Telegram 实体与消息的纯工具函数。
 * 本模块不依赖客户端单例，可独立测试。
 */
import type { FilterCondition } from "../filter-matching.js";

// --- 实体类型判断 ---

/** 判断是否为可收录的会话：群组、频道、私聊或机器人。 */
export function isValidChat(entity: any): boolean {
  if (!entity) return false;
  return ["Channel", "Chat", "User"].includes(entity.className);
}

/** Keep existing group/channel keys while separating Telegram's user ID namespace. */
export function getChatId(entity: any): string {
  const id = entity?.id?.toString?.() ?? "";
  if (!id) return "";
  return entity.className === "User" || entity.className === "UserEmpty" ? `user:${id}` : id;
}

/** Same source key for Raw updates as for dialog entities; sender IDs stay numeric. */
export function getPeerChatId(peer: any): string {
  if (peer?.channelId != null) return peer.channelId.toString();
  if (peer?.chatId != null) return peer.chatId.toString();
  if (peer?.userId != null) return `user:${peer.userId.toString()}`;
  return "";
}

/** 统一会话名称；私聊没有 title，必须使用用户姓名。 */
export function getChatTitle(entity: any): string {
  return entity?.title || [entity?.firstName, entity?.lastName].filter(Boolean).join(" ") ||
    entity?.username || entity?.id?.toString?.() || "Unknown";
}

// --- 链接构造 ---

/**
 * 构造消息的 Telegram 跳转链接。
 * 公开 username 的会话使用 t.me/{username}/{id}，
 * 私有会话使用 t.me/c/{channelId}/{id}。
 */
export function buildTelegramLink(chatId: string, chat: any, messageId: number): string {
  // Telegram 不提供普通私聊的公开消息链接。用户名/手机号只打开对话，
  // 没有可解析标识时返回空串，由界面隐藏入口，不能伪造频道消息地址。
  if (chat?.className === "User") {
    if (chat.username) return `https://t.me/${chat.username}`;
    if (chat.phone && /^\+?\d+$/.test(chat.phone)) return `https://t.me/+${chat.phone.replace(/^\+/, "")}`;
    return "";
  }
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
  return new Set(conditions.filter((condition) => condition.type === "chat").flatMap((condition) => condition.values));
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
 * 包含群组、频道、私聊和机器人实体。
 */
export function buildDialogEntityMap(dialogs: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const dialog of dialogs) {
    const entity = (dialog as any)?.entity;
    if (!isValidChat(entity)) continue;
    const chatId = getChatId(entity);
    if (chatId) map.set(chatId, entity);
  }
  return map;
}
