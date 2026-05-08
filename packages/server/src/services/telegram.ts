import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../config.js";
import { db } from "../db/index.js";
import { forwardMatchedMessage } from "./notifier.js";
import {
  hasConflictingChatConditions,
  matchFilterConditions,
  parseConditions,
  type FilterCondition,
} from "./filter-matching.js";

export interface JoinedChat {
  id: string;
  title: string;
}

export interface LiveChatMessage {
  id: number;
  chatId: string;
  chatTitle: string;
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
  inDatabase: boolean;
}

export interface HistoricalFilterPreviewMessage extends LiveChatMessage {
  matchedKeyword: string | null;
}

let client: TelegramClient | null = null;
let isConnected = false;
let phoneCodeResolver: ((code: string) => void) | null = null;
let passwordResolver: ((password: string) => void) | null = null;
let phoneNumber: string = "";

function getClientConfig() {
  return {
    connectionRetries: 5,
    requestTimeout: 30000,
    autoReconnect: true,
  };
}

function loadSession(): string {
  try {
    if (existsSync(appConfig.telegram.sessionPath)) {
      return readFileSync(appConfig.telegram.sessionPath, "utf-8").trim();
    }
  } catch {
    // Ignore
  }
  return "";
}

function saveSession(session: string): void {
  const dir = dirname(appConfig.telegram.sessionPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(appConfig.telegram.sessionPath, session, "utf-8");
}

export function getClient(): TelegramClient | null {
  return client;
}

function isValidChat(entity: any): boolean {
  if (!entity) return false;
  return entity.className === "Channel" || entity.className === "Chat";
}

function buildTelegramLink(chatId: string, chat: any, messageId: number): string {
  if (chat?.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }

  const linkChatId = chatId.startsWith("-100") ? chatId.slice(4) : chatId.replace("-", "");
  return `https://t.me/c/${linkChatId}/${messageId}`;
}

function getSenderSummary(sender: any): { senderName: string; senderId: string } {
  const senderName = sender?.firstName
    ? `${sender.firstName}${sender.lastName ? ` ${sender.lastName}` : ""}`
    : sender?.title || sender?.username || "Unknown";
  const senderId = sender?.id?.toString?.() || "";
  return { senderName, senderId };
}

function getScopedChatIds(conditions: FilterCondition[]) {
  const chatCondition = conditions.find((condition) => condition.type === "chat");
  return new Set(chatCondition?.values ?? []);
}

function shouldInspectChat(
  chatId: string,
  scopedChatIds: ReturnType<typeof getScopedChatIds>,
): boolean {
  return scopedChatIds.size === 0 || scopedChatIds.has(chatId);
}

function getMessageTimestampMs(message: any): number {
  // GramJS 在不同调用链里可能返回 Unix 秒、Date 或可解析字符串，这里统一转成毫秒时间戳。
  if (typeof message?.date === "number") {
    return message.date * 1000;
  }

  if (message?.date instanceof Date) {
    return message.date.getTime();
  }

  const parsed = Date.parse(String(message?.date ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function loadSegmentedHistory(options: {
  entity: any;
  scanLimit: number;
  batchSize?: number;
  sinceMs?: number;
}): Promise<any[]> {
  if (!client) {
    return [];
  }

  const batchSize = Math.max(20, Math.min(options.batchSize ?? 100, 200));
  const messages: any[] = [];
  let scanned = 0;
  let offsetId = 0;
  let guard = 0;

  // 通过 offsetId 按批次向更早的历史翻页，直到达到扫描上限或越过时间窗口下界。
  while (scanned < options.scanLimit && guard < 100) {
    guard += 1;
    const take = Math.min(batchSize, options.scanLimit - scanned);
    const history = await client.getMessages(options.entity, {
      limit: take,
      offsetId,
    });

    if (!history || history.length === 0) {
      break;
    }

    messages.push(...history);
    scanned += history.length;

    const oldest = history[history.length - 1];
    const oldestId = Number(oldest?.id || 0);
    const oldestTs = getMessageTimestampMs(oldest);

    // 没有继续翻页的锚点时停止，避免重复拉同一批消息。
    if (!oldestId || oldestId === offsetId) {
      break;
    }

    offsetId = oldestId;

    if (options.sinceMs !== undefined && oldestTs > 0 && oldestTs < options.sinceMs) {
      // 已翻到窗口下界之前，可停止继续向更早翻页。
      break;
    }
  }

  return messages;
}

export async function previewHistoricalFilterMessages(options: {
  conditions: FilterCondition[];
  perChatLimit?: number;
  totalLimit?: number;
  chatIds?: string[];
  since?: string;
  until?: string;
}): Promise<{ messages: HistoricalFilterPreviewMessage[]; scannedChats: number }> {
  if (!client || !isConnected) {
    throw new Error("Telegram client is not connected");
  }

  if (hasConflictingChatConditions(options.conditions)) {
    return { messages: [], scannedChats: 0 };
  }

  // perChatLimit 现在表示“每个会话最多向历史扫描多少条”，而不是只取最近一页。
  const perChatLimit = Math.max(1, Math.min(options.perChatLimit ?? 200, 5000));
  const totalLimit = Math.max(1, Math.min(options.totalLimit ?? 50, 200));
  const dialogs = await client.getDialogs({ limit: 300 });
  const scopedChatIds = getScopedChatIds(options.conditions);
  const selectedChatIdSet = new Set((options.chatIds ?? []).map((chatId) => chatId.trim()).filter(Boolean));
  const sinceMs = options.since ? Date.parse(options.since) : NaN;
  const untilMs = options.until ? Date.parse(options.until) : NaN;
  const hasSince = !Number.isNaN(sinceMs);
  const hasUntil = !Number.isNaN(untilMs);
  const previews: HistoricalFilterPreviewMessage[] = [];
  let scannedChats = 0;

  for (const dialog of dialogs) {
    const entity = (dialog as any).entity;
    if (!isValidChat(entity)) {
      continue;
    }

    const chatId = entity?.id?.toString?.() || "";
    if (!chatId || !shouldInspectChat(chatId, scopedChatIds)) {
      continue;
    }
    if (selectedChatIdSet.size > 0 && !selectedChatIdSet.has(chatId)) {
      continue;
    }

    scannedChats += 1;
    // 先把时间窗口附近可能命中的历史分段拉出来，再在本地做文本与时间条件过滤。
    const history = await loadSegmentedHistory({
      entity,
      scanLimit: perChatLimit,
      batchSize: 100,
      sinceMs: hasSince ? sinceMs : undefined,
    });
    const textMessages = history.filter((item: any) => typeof item?.message === "string" && item.message.trim().length > 0);
    const ids = textMessages.map((item: any) => item.id);
    const existingRows = ids.length
      ? await db.message.findMany({
          where: {
            chatId,
            telegramMessageId: { in: ids },
          },
          select: { telegramMessageId: true },
        })
      : [];
    const existingIdSet = new Set(existingRows.map((row) => row.telegramMessageId));

    for (const item of textMessages) {
      const messageTs = getMessageTimestampMs(item);
      const messageDate = new Date(messageTs).toISOString();
      const messageMs = Date.parse(messageDate);
      // 这里再次做窗口裁剪，是为了兼容最后一批翻页可能同时包含窗口内外消息。
      if (hasSince && messageMs < sinceMs) {
        continue;
      }
      if (hasUntil && messageMs > untilMs) {
        continue;
      }

      const match = matchFilterConditions(
        {
          chatId,
          content: item.message,
        },
        options.conditions,
      );

      if (!match.matched) {
        continue;
      }

      const sender = (item as any).sender;
      const { senderName, senderId } = getSenderSummary(sender);
      previews.push({
        id: item.id,
        chatId,
        chatTitle: entity?.title || entity?.username || chatId,
        senderName,
        senderId,
        content: item.message,
        messageDate,
        telegramLink: buildTelegramLink(chatId, entity, item.id),
        inDatabase: existingIdSet.has(item.id),
        matchedKeyword: match.matchedKeyword,
      });

      if (previews.length >= totalLimit) {
        return { messages: previews, scannedChats };
      }
    }
  }

  return { messages: previews, scannedChats };
}

export async function backfillFilterHistory(options: {
  filterId: number;
  conditions: FilterCondition[];
  perChatLimit?: number;
  chatIds?: string[];
  since?: string;
  until?: string;
}): Promise<{ scannedChats: number; matchedCount: number; savedCount: number; skippedExistingCount: number }> {
  const preview = await previewHistoricalFilterMessages({
    conditions: options.conditions,
    perChatLimit: options.perChatLimit,
    totalLimit: 200,
    chatIds: options.chatIds,
    since: options.since,
    until: options.until,
  });

  let savedCount = 0;
  let skippedExistingCount = 0;

  for (const message of preview.messages) {
    if (message.inDatabase) {
      skippedExistingCount += 1;
      continue;
    }

    await db.message.create({
      data: {
        telegramMessageId: message.id,
        chatId: message.chatId,
        chatTitle: message.chatTitle,
        senderName: message.senderName,
        senderId: message.senderId,
        content: message.content,
        messageDate: message.messageDate,
        telegramLink: message.telegramLink,
        isRead: false,
        matchedFilterId: options.filterId,
        matchedKeyword: message.matchedKeyword,
        createdAt: new Date().toISOString(),
      },
    });
    savedCount += 1;
  }

  return {
    scannedChats: preview.scannedChats,
    matchedCount: preview.messages.length,
    savedCount,
    skippedExistingCount,
  };
}

export async function listJoinedChats(): Promise<JoinedChat[]> {
  if (!client || !isConnected) {
    throw new Error("Telegram client is not connected");
  }

  const dialogs = await client.getDialogs({ limit: 300 });
  const seen = new Set<string>();
  const chats: JoinedChat[] = [];

  for (const dialog of dialogs) {
    const entity = (dialog as any).entity;
    if (!isValidChat(entity)) continue;

    const id = entity?.id?.toString?.() || "";
    if (!id || seen.has(id)) continue;

    const title = entity?.title || entity?.username || id;
    seen.add(id);
    chats.push({ id, title });
  }

  return chats.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

export async function listSingleChatMessages(options: {
  chatId: string;
  messageLimit?: number;
  chatSearchLimit?: number;
}): Promise<LiveChatMessage[]> {
  if (!client || !isConnected) {
    throw new Error("Telegram client is not connected");
  }

  const targetChatId = options.chatId.trim();
  if (!targetChatId) {
    throw new Error("chatId is required");
  }

  const messageLimit = Math.max(1, Math.min(options.messageLimit ?? 100, 500));
  const chatSearchLimit = Math.max(1, Math.min(options.chatSearchLimit ?? 500, 1000));
  const dialogs = await client.getDialogs({ limit: chatSearchLimit });

  const targetDialog = dialogs.find((dialog: any) => {
    const id = dialog?.entity?.id?.toString?.() || "";
    return id === targetChatId;
  });

  if (!targetDialog) {
    throw new Error("Chat not found or no access");
  }

  const entity = (targetDialog as any).entity;
  if (!isValidChat(entity)) {
    throw new Error("Unsupported chat type");
  }

  const chatId = entity?.id?.toString?.() || targetChatId;
  const chatTitle = entity?.title || entity?.username || chatId;
  const history = await client.getMessages(entity, { limit: messageLimit });

  const textMessages = history.filter((item: any) => {
    const content = typeof item?.message === "string" ? item.message.trim() : "";
    return content.length > 0;
  });

  const dbRows = await db.message.findMany({
    where: {
      chatId,
      telegramMessageId: { in: textMessages.map((item: any) => item.id) },
    },
    select: {
      telegramMessageId: true,
    },
  });

  const storedMessageIdSet = new Set<number>(dbRows.map((row) => row.telegramMessageId));

  return textMessages.map((item: any) => {
    const sender = (item as any).sender;
    const senderName = sender?.firstName
      ? `${sender.firstName}${sender.lastName ? ` ${sender.lastName}` : ""}`
      : sender?.title || sender?.username || "Unknown";
    const senderId = sender?.id?.toString?.() || "";

    let telegramLink = "";
    if (entity?.username) {
      telegramLink = `https://t.me/${entity.username}/${item.id}`;
    } else {
      const linkChatId = chatId.startsWith("-100") ? chatId.slice(4) : chatId.replace("-", "");
      telegramLink = `https://t.me/c/${linkChatId}/${item.id}`;
    }

    return {
      id: item.id,
      chatId,
      chatTitle,
      senderName,
      senderId,
      content: item.message,
      messageDate: new Date((item.date || 0) * 1000).toISOString(),
      telegramLink,
      inDatabase: storedMessageIdSet.has(item.id),
    };
  });
}

export function getConnectionStatus(): {
  connected: boolean;
  authorized: boolean;
  waitingForCode: boolean;
  waitingForPassword: boolean;
} {
  return {
    connected: isConnected,
    authorized: client?.connected ? true : false,
    waitingForCode: phoneCodeResolver !== null,
    waitingForPassword: passwordResolver !== null,
  };
}

export async function initClient(): Promise<void> {
  const sessionStr = loadSession();
  const session = new StringSession(sessionStr);

  client = new TelegramClient(session, appConfig.telegram.apiId, appConfig.telegram.apiHash, getClientConfig());

  if (sessionStr) {
    try {
      await client.connect();
      const me = await client.getMe();
      if (me) {
        isConnected = true;
        console.log(`[Telegram] Reconnected as ${(me as any).firstName || (me as any).username}`);
        startMessageListener();
      }
    } catch (err) {
      console.log("[Telegram] Saved session invalid, need to re-login");
      isConnected = false;
    }
  }
}

export async function sendCode(phone: string): Promise<{ status: string }> {
  phoneNumber = phone;

  if (!client) {
    const session = new StringSession("");
    client = new TelegramClient(session, appConfig.telegram.apiId, appConfig.telegram.apiHash, getClientConfig());
  }

  try {
    // 添加连接超时控制
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("connect_timeout")), 15000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);

    // 发送验证码
    await client.sendCode(
      {
        apiId: appConfig.telegram.apiId,
        apiHash: appConfig.telegram.apiHash,
      },
      phone
    );

    return { status: "code_sent" };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    
    // 详细的错误诊断
    if (errorMsg.includes("connect_timeout") || errorMsg.includes("ETIMEDOUT")) {
      throw new Error(
        "连接 Telegram 超时，请检查网络和梯子设置。\n" +
        "可能的原因:\n" +
        "1. 网络连接不稳定\n" +
        "2. 梯子未启动或配置错误\n" +
        "3. 需要在启动时使用: proxychains -f /path/to/proxychains.conf node dist/index.js\n" +
        "4. API ID/Hash 可能不正确"
      );
    }
    
    throw err;
  }
}

export async function loginWithCode(
  phone: string,
  code: string,
  password?: string
): Promise<{ status: string; error?: string }> {
  if (!client) {
    return { status: "error", error: "Client not initialized. Send code first." };
  }

  try {
    await client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => code,
      password: async () => password || "",
      onError: (err: Error) => {
        console.error("[Telegram] Login error:", err.message);
      },
    });

    // Save session
    const sessionStr = (client.session as StringSession).save();
    saveSession(sessionStr);
    isConnected = true;

    const me = await client.getMe();
    console.log(`[Telegram] Logged in as ${(me as any).firstName || (me as any).username}`);

    startMessageListener();

    return { status: "success" };
  } catch (err: any) {
    if (err.message?.includes("PASSWORD_REQUIRED") || err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      return { status: "password_required" };
    }
    return { status: "error", error: err.message || "Login failed" };
  }
}

export async function logout(): Promise<void> {
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      // Ignore logout errors
    }
    isConnected = false;
    client = undefined as any;
    // Remove session file
    if (existsSync(appConfig.telegram.sessionPath)) {
      writeFileSync(appConfig.telegram.sessionPath, "", "utf-8");
    }
  }
}

function startMessageListener(): void {
  if (!client) return;

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleNewMessage(event);
    } catch (err) {
      console.error("[Telegram] Error handling message:", err);
    }
  }, new NewMessage({}));

  console.log("[Telegram] Message listener started");
}

async function handleNewMessage(event: NewMessageEvent): Promise<void> {
  const message = event.message;
  if (!message || !message.text) return;

  // Get active filters
  const activeFilters = await db.filter.findMany({
    where: { enabled: true },
  });

  if (activeFilters.length === 0) return;

  // Get chat info
  const chat = await message.getChat();
  if (!chat) return;

  const chatId = chat.id.toString();
  const chatTitle = (chat as any).title || (chat as any).firstName || chatId;
  // Check each filter
  for (const filter of activeFilters) {
    const conditions = parseConditions(filter.conditions);
    if (conditions.length === 0) {
      continue;
    }

    const match = matchFilterConditions(
      {
        chatId,
        content: message.text,
      },
      conditions,
    );

    if (match.matched) {
      // Check for duplicate
      const existing = await db.message.findFirst({
        where: {
          telegramMessageId: message.id,
          chatId,
        },
      });

      if (existing) continue;

      // Build telegram link
      const telegramLink = buildTelegramLink(chatId, chat as any, message.id);

      // Get sender info
      const sender = await message.getSender();
      const { senderName, senderId } = getSenderSummary(sender as any);

      await db.message.create({
        data: {
          telegramMessageId: message.id,
          chatId,
          chatTitle,
          senderName,
          senderId,
          content: message.text || "",
          messageDate: new Date((message.date || 0) * 1000).toISOString(),
          telegramLink,
          isRead: false,
          matchedFilterId: filter.id,
          matchedKeyword: match.matchedKeyword,
          createdAt: new Date().toISOString(),
        },
      });

      await forwardMatchedMessage({
        filterName: filter.name,
        matchedKeyword: match.matchedKeyword,
        chatTitle,
        senderName,
        content: message.text || "",
        messageDate: new Date((message.date || 0) * 1000).toISOString(),
        telegramLink,
      });

      console.log(
        `[Telegram] Saved message from "${chatTitle}" matching filter "${filter.name}"`
      );

      // Only save once per message (first matching filter)
      break;
    }
  }
}
