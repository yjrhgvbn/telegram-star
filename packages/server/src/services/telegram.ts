import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../config.js";
import { db } from "../db/index.js";

type FilterConditionType = "keyword" | "group" | "channel";

interface FilterCondition {
  type: FilterConditionType;
  values: string[];
}

export interface JoinedChat {
  id: string;
  title: string;
  type: "group" | "channel";
}

export interface LiveChatMessage {
  id: number;
  chatId: string;
  chatTitle: string;
  chatType: "group" | "channel";
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
  inDatabase: boolean;
}

let client: TelegramClient | null = null;
let isConnected = false;
let phoneCodeResolver: ((code: string) => void) | null = null;
let passwordResolver: ((password: string) => void) | null = null;
let phoneNumber: string = "";

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

function parseConditions(raw: string): FilterCondition[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        type: item.type,
        values: Array.isArray(item.values)
          ? item.values.filter((v: unknown) => typeof v === "string").map((v: string) => v.trim()).filter(Boolean)
          : [],
      }))
      .filter((item): item is FilterCondition =>
        (item.type === "keyword" || item.type === "group" || item.type === "channel") && item.values.length > 0
      );
  } catch {
    return [];
  }
}

function getEntityType(entity: any): "group" | "channel" | "other" {
  if (!entity) return "other";

  if (entity.className === "Channel") {
    return entity.broadcast ? "channel" : "group";
  }

  if (entity.className === "Chat") {
    return "group";
  }

  return "other";
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
    const entityType = getEntityType(entity);
    if (entityType === "other") continue;

    const id = entity?.id?.toString?.() || "";
    if (!id || seen.has(id)) continue;

    const title = entity?.title || entity?.username || id;
    seen.add(id);
    chats.push({ id, title, type: entityType });
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
  const entityType = getEntityType(entity);
  if (entityType === "other") {
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
      chatType: entityType,
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

  client = new TelegramClient(session, appConfig.telegram.apiId, appConfig.telegram.apiHash, {
    connectionRetries: 5,
  });

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
    client = new TelegramClient(session, appConfig.telegram.apiId, appConfig.telegram.apiHash, {
      connectionRetries: 5,
    });
  }

  await client.connect();

  await client.sendCode(
    {
      apiId: appConfig.telegram.apiId,
      apiHash: appConfig.telegram.apiHash,
    },
    phone
  );

  return { status: "code_sent" };
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
  const chatType = getEntityType(chat as any);

  // Check each filter
  for (const filter of activeFilters) {
    const conditions = parseConditions(filter.conditions);
    if (conditions.length === 0) {
      continue;
    }

    let matched = true;
    let matchedKeyword = "";

    for (const condition of conditions) {
      let conditionMatched = false;

      if (condition.type === "keyword") {
        for (const keyword of condition.values) {
          if (message.text.toLowerCase().includes(keyword.toLowerCase())) {
            conditionMatched = true;
            if (!matchedKeyword) {
              matchedKeyword = keyword;
            }
            break;
          }
        }
      } else if (condition.type === "group") {
        if (chatType === "group") {
          conditionMatched = condition.values.includes(chatId);
        }
      } else if (condition.type === "channel") {
        if (chatType === "channel") {
          conditionMatched = condition.values.includes(chatId);
        }
      }

      if (!conditionMatched) {
        matched = false;
        break;
      }
    }

    if (matched) {
      // Check for duplicate
      const existing = await db.message.findFirst({
        where: {
          telegramMessageId: message.id,
          chatId,
        },
      });

      if (existing) continue;

      // Build telegram link
      let telegramLink = "";
      if ((chat as any).username) {
        telegramLink = `https://t.me/${(chat as any).username}/${message.id}`;
      } else {
        // For private groups, use c/ format
        // Remove the -100 prefix for the link
        const linkChatId = chatId.startsWith("-100")
          ? chatId.slice(4)
          : chatId.replace("-", "");
        telegramLink = `https://t.me/c/${linkChatId}/${message.id}`;
      }

      // Get sender info
      const sender = await message.getSender();
      const senderName =
        (sender as any)?.firstName
          ? `${(sender as any).firstName}${(sender as any).lastName ? " " + (sender as any).lastName : ""}`
          : (sender as any)?.title || "Unknown";
      const senderId = sender ? sender.id.toString() : "";

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
          matchedKeyword: matchedKeyword || null,
          createdAt: new Date().toISOString(),
        },
      });

      console.log(
        `[Telegram] Saved message from "${chatTitle}" matching filter "${filter.name}"`
      );

      // Only save once per message (first matching filter)
      break;
    }
  }
}
