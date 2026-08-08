/**
 * Telegram 认证流程。
 * 包含客户端初始化、手机号验证码登录及退出登录等操作。
 */
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { existsSync, writeFileSync } from "fs";
import { appConfig } from "../../config.js";
import {
  getClient,
  setConnected,
  setClient,
  getClientConfig,
  loadSession,
  saveSession,
} from "./client.js";
import { startMessageListener } from "./listener.js";
import { activateMessageCatchUp, deactivateMessageCatchUp } from "./messageCatchUp.js";

export { getConnectionStatusWithConfig as getConnectionStatus } from "./client.js";

// --- 客户端初始化 ---

/**
 * 启动时尝试用磁盘已有 session 重连。
 * 若 session 有效则直接进入已登录状态并启动消息监听；
 * 若无效（过期或不存在）则保持未连接状态，等待前端发起登录。
 */
export async function initClient(): Promise<void> {
  const sessionStr = loadSession();
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(
    session,
    appConfig.telegram.apiId,
    appConfig.telegram.apiHash,
    getClientConfig(),
  );
  setClient(client);
  // 先注册事件处理器再连接，避免 connect 与监听器启动之间形成消息空窗。
  startMessageListener();

  if (sessionStr) {
    try {
      await client.connect();
      const me = await client.getMe();
      if (me) {
        setConnected(true);
        console.log(`[Telegram] Reconnected as ${(me as any).firstName || (me as any).username}`);
        const accountId = (me as any).id?.toString?.();
        if (accountId) activateMessageCatchUp(client, accountId);
      }
    } catch {
      console.log("[Telegram] Saved session invalid, need to re-login");
      setConnected(false);
    }
  }
}

// --- 发送验证码 ---

/**
 * 向指定手机号发送 Telegram 验证码。
 * 若客户端尚未初始化则先创建新实例（仅用于登录阶段）。
 * 15s 内未完成连接则抛出超时错误，并给出可能原因提示。
 */
export async function sendCode(phone: string): Promise<{ status: string }> {
  if (!appConfig.telegram.apiId || !appConfig.telegram.apiHash) {
    throw new Error("Telegram API credentials are not configured");
  }

  let client = getClient();
  if (!client) {
    const session = new StringSession("");
    client = new TelegramClient(
      session,
      appConfig.telegram.apiId,
      appConfig.telegram.apiHash,
      getClientConfig(),
    );
    setClient(client);
  }
  startMessageListener();

  try {
    const connectPromise = client.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("connect_timeout")), 15000),
    );
    await Promise.race([connectPromise, timeoutPromise]);

    await client.sendCode(
      { apiId: appConfig.telegram.apiId, apiHash: appConfig.telegram.apiHash },
      phone,
    );

    return { status: "code_sent" };
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes("connect_timeout") || msg.includes("ETIMEDOUT")) {
      throw new Error(
        "连接 Telegram 超时，请检查网络和梯子设置。\n" +
          "可能的原因:\n" +
          "1. 网络连接不稳定\n" +
          "2. 梯子未启动或配置错误\n" +
          "3. 需要在启动时使用: proxychains -f /path/to/proxychains.conf node dist/index.js\n" +
          "4. API ID/Hash 可能不正确",
      );
    }
    throw err;
  }
}

// --- 验证码登录 ---

/**
 * 使用验证码（可选两步验证密码）完成登录。
 * 登录成功后持久化 session 并启动消息监听器。
 */
export async function loginWithCode(
  phone: string,
  code: string,
  password?: string,
): Promise<{ status: string; error?: string }> {
  const client = getClient();
  if (!client) {
    return { status: "error", error: "Client not initialized. Send code first." };
  }

  try {
    startMessageListener();
    await client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => code,
      password: async () => password || "",
      onError: (err: Error) => {
        console.error("[Telegram] Login error:", err.message);
      },
    });

    const sessionStr = (client.session as StringSession).save();
    saveSession(sessionStr);
    setConnected(true);

    const me = await client.getMe();
    console.log(`[Telegram] Logged in as ${(me as any).firstName || (me as any).username}`);

    const accountId = (me as any).id?.toString?.();
    if (accountId) activateMessageCatchUp(client, accountId);
    return { status: "success" };
  } catch (err: any) {
    if (
      err.message?.includes("PASSWORD_REQUIRED") ||
      err.errorMessage === "SESSION_PASSWORD_NEEDED"
    ) {
      return { status: "password_required" };
    }
    return { status: "error", error: err.message || "Login failed" };
  }
}

// --- 退出登录 ---

/** 通知 Telegram 服务端使 session 失效，并清除本地 session 文件与客户端状态 */
export async function logout(): Promise<void> {
  const client = getClient();
  if (!client) return;

  deactivateMessageCatchUp(client);

  try {
    await client.invoke(new Api.auth.LogOut());
  } catch {
    // 服务端撤销失败时忽略，继续清理本地状态
  }

  setConnected(false);
  setClient(null);

  if (existsSync(appConfig.telegram.sessionPath)) {
    writeFileSync(appConfig.telegram.sessionPath, "", "utf-8");
  }
}
