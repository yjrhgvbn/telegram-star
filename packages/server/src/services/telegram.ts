import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../config.js";
import { db } from "../db/index.js";
import { filters, messages } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

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
  const activeFilters = await db
    .select()
    .from(filters)
    .where(eq(filters.enabled, true));

  if (activeFilters.length === 0) return;

  // Get chat info
  const chat = await message.getChat();
  if (!chat) return;

  const chatId = chat.id.toString();
  const chatTitle = (chat as any).title || (chat as any).firstName || chatId;

  // Check each filter
  for (const filter of activeFilters) {
    let matched = false;
    let matchedKeyword = "";

    switch (filter.type) {
      case "keyword":
        if (message.text.toLowerCase().includes(filter.value.toLowerCase())) {
          matched = true;
          matchedKeyword = filter.value;
        }
        break;
      case "group":
      case "channel":
        // Match by chat ID or chat title
        if (
          chatId === filter.value ||
          chatTitle.toLowerCase().includes(filter.value.toLowerCase())
        ) {
          matched = true;
        }
        break;
    }

    if (matched) {
      // Check for duplicate
      const existing = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.telegramMessageId, message.id),
            eq(messages.chatId, chatId)
          )
        )
        .limit(1);

      if (existing.length > 0) continue;

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

      await db.insert(messages).values({
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
      });

      console.log(
        `[Telegram] Saved message from "${chatTitle}" matching filter "${filter.name}"`
      );

      // Only save once per message (first matching filter)
      break;
    }
  }
}
