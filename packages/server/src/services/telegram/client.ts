/**
 * Telegram 客户端单例与会话管理。
 * 本模块持有唯一的 TelegramClient 实例，并通过显式 getter/setter
 * 将状态暴露给 auth、listener、history 等子模块，避免循环依赖。
 */
import { TelegramClient } from "telegram";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { appConfig } from "../../config.js";
import { getTelegramConfigStatus } from "../appConfig.js";
import { StructuredGramJsLogger } from "./gramJsLogger.js";
import { installGramJsDiagnostics } from "./gramJsDiagnostics.js";

// --- 单例状态（模块内私有）---

let _client: TelegramClient | null = null;
let _isConnected = false;
let _isAuthorized = false;
let _loginStep: "code" | "password" | null = null;

// --- Client 访问器 ---

export function getClient(): TelegramClient | null {
  return _client;
}

export function setClient(c: TelegramClient | null): void {
  if (_client === c) return;
  if (c) installGramJsDiagnostics(c);
  _client = c;
  _isConnected = false;
  _isAuthorized = false;
  _loginStep = null;
}

export function isClientConnected(): boolean {
  // A connected MTProto socket during login is not an authenticated account.
  return _isConnected && _isAuthorized;
}

export function setConnected(value: boolean): void {
  _isConnected = value;
}

export function setAuthorized(value: boolean): void {
  _isAuthorized = value;
  if (value) _loginStep = null;
}

export function setLoginStep(value: "code" | "password" | null): void {
  _loginStep = value;
}

// --- 客户端连接配置 ---

export function getClientConfig() {
  return {
    connectionRetries: 5,
    requestTimeout: 30000,
    autoReconnect: true,
    baseLogger: new StructuredGramJsLogger(),
  };
}

// --- Session 持久化 ---

/** 从磁盘读取已保存的 session 字符串，文件不存在时返回空字符串 */
export function loadSession(): string {
  try {
    if (existsSync(appConfig.telegram.sessionPath)) {
      return readFileSync(appConfig.telegram.sessionPath, "utf-8").trim();
    }
  } catch {
    // 读取失败时忽略，当作无 session 处理
  }
  return "";
}

/** 将 session 字符串持久化到磁盘，目录不存在时自动创建 */
export function saveSession(session: string): void {
  const dir = dirname(appConfig.telegram.sessionPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(appConfig.telegram.sessionPath, session, { encoding: "utf-8", mode: 0o600 });
}

// --- 公开状态 API ---

/** 返回当前客户端连接与认证状态，供前端轮询 */
export function getConnectionStatus(): {
  connected: boolean;
  authorized: boolean;
  waitingForCode: boolean;
  waitingForPassword: boolean;
  telegramConfigured: boolean;
  telegramConfigSource: "env" | "database" | "missing";
} {
  const configured = appConfig.telegram.apiId > 0 && appConfig.telegram.apiHash.trim().length > 0;
  return {
    connected: _isConnected,
    authorized: _isAuthorized,
    waitingForCode: _loginStep === "code",
    waitingForPassword: _loginStep === "password",
    telegramConfigured: configured,
    telegramConfigSource: configured ? "database" : "missing",
  };
}

export async function getConnectionStatusWithConfig(): Promise<{
  connected: boolean;
  authorized: boolean;
  waitingForCode: boolean;
  waitingForPassword: boolean;
  telegramConfigured: boolean;
  telegramConfigSource: "env" | "database" | "missing";
}> {
  const configStatus = await getTelegramConfigStatus();
  return {
    ...getConnectionStatus(),
    ...configStatus,
  };
}
