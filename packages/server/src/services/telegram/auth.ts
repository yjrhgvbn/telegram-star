/** Telegram authentication uses one RPC step per HTTP request, never GramJS' interactive retry loop. */
import { TelegramClient, Api } from "telegram";
import { computeCheck } from "telegram/Password.js";
import { StringSession } from "telegram/sessions/index.js";
import { existsSync, writeFileSync } from "fs";
import { appConfig } from "../../config.js";
import {
  getClient, setConnected, setAuthorized, setLoginStep, setClient,
  getClientConfig, loadSession, saveSession,
} from "./client.js";
import { startMessageListener } from "./listener.js";
import { activateMessageCatchUp, deactivateMessageCatchUp } from "./messageCatchUp.js";
import { appLogger } from "../../shared/logging.js";

export { getConnectionStatusWithConfig as getConnectionStatus } from "./client.js";

interface LoginChallenge {
  client: TelegramClient;
  phone: string;
  phoneCodeHash: string;
  passwordRequired: boolean;
}
let challenge: LoginChallenge | null = null;
let activeAuthRequest: AbortController | null = null;
const RPC_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const LOGOUT_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 3_000;
const cleanupRequests = new WeakMap<TelegramClient, Promise<void>>();

class AuthenticationTimeoutError extends Error {}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AuthenticationTimeoutError(`${label} timed out; please retry`)), timeoutMs);
        onAbort = () => reject(new Error("Login was cancelled; send a new code"));
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

function assertCurrent(client: TelegramClient): void {
  if (getClient() !== client) throw new Error("Login was cancelled; send a new code");
}

function cancelAuthRequest(): void {
  const controller = activeAuthRequest;
  activeAuthRequest = null;
  controller?.abort();
}

async function authRequest<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (activeAuthRequest) throw new Error("An authentication request is already in progress");
  const controller = new AbortController();
  activeAuthRequest = controller;
  try {
    return await operation(controller.signal);
  } finally {
    if (activeAuthRequest === controller) activeAuthRequest = null;
  }
}

async function destroyClient(client: TelegramClient): Promise<void> {
  const pending = cleanupRequests.get(client);
  if (pending) return pending;
  const cleanup = withDeadline(Promise.resolve().then(() => client.destroy()), CLEANUP_TIMEOUT_MS, "Telegram cleanup")
    .catch(() => {
      appLogger.warn({ event: "telegram.client.cleanup_failed" }, "Failed to destroy Telegram client within the cleanup deadline");
    });
  cleanupRequests.set(client, cleanup);
  try {
    await cleanup;
  } finally {
    if (cleanupRequests.get(client) === cleanup) cleanupRequests.delete(client);
  }
}

function detachClient(client: TelegramClient): void {
  if (challenge?.client === client) challenge = null;
  if (getClient() === client) setClient(null);
  deactivateMessageCatchUp(client);
}

/** GramJS does not support requestTimeout. Bound every auth await and discard late results. */
async function clientStep<T>(
  client: TelegramClient,
  operation: () => Promise<T>,
  label: string,
  signal?: AbortSignal,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<T> {
  try {
    assertCurrent(client);
    if (signal?.aborted) throw new Error("Login was cancelled; send a new code");
    const pending = operation().then((value) => {
      if (signal?.aborted || getClient() !== client) {
        // A connect that finishes after timeout may create a sender after the first destroy.
        void destroyClient(client);
        throw new Error("Login was cancelled; send a new code");
      }
      return value;
    });
    const result = await withDeadline(pending, timeoutMs, label, signal);
    assertCurrent(client);
    return result;
  } catch (error) {
    if (error instanceof AuthenticationTimeoutError || signal?.aborted || getClient() !== client) {
      detachClient(client);
      await destroyClient(client);
    }
    throw error;
  }
}

/** Detach before awaiting cleanup so stale RPCs and event handlers cannot mutate the new session. */
export async function resetTelegramClient(): Promise<void> {
  const client = getClient();
  challenge = null;
  setClient(null);
  cancelAuthRequest();
  if (!client) return;
  deactivateMessageCatchUp(client);
  await destroyClient(client);
}

export async function initClient(): Promise<void> {
  await resetTelegramClient();
  if (getClient()) return; // A new login may have started while the previous client was destroyed.
  const sessionStr = loadSession();
  const client = new TelegramClient(new StringSession(sessionStr), appConfig.telegram.apiId,
    appConfig.telegram.apiHash, getClientConfig());
  setClient(client);
  startMessageListener();
  if (!sessionStr) return;

  try {
    await clientStep(client, () => client.connect(), "Connecting to Telegram", undefined, CONNECT_TIMEOUT_MS);
    const me = await clientStep(client, () => client.getMe(), "Checking saved Telegram session");
    assertCurrent(client);
    if (!me) throw new Error("Saved session is not authorized");
    setConnected(true);
    setAuthorized(true);
    const accountId = me.id.toString();
    appLogger.info({ event: "telegram.client.reconnected", accountId }, "Telegram client reconnected");
    activateMessageCatchUp(client, accountId);
  } catch {
    appLogger.warn({ event: "telegram.session.invalid" }, "Saved Telegram session is invalid; login is required");
    if (getClient() === client) await resetTelegramClient();
  }
}

export async function sendCode(phone: string): Promise<{ status: string }> {
  return authRequest(async (signal) => {
    if (!appConfig.telegram.apiId || !appConfig.telegram.apiHash) {
      throw new Error("Telegram API credentials are not configured");
    }
    let client = getClient();
    if (!client) {
      client = new TelegramClient(new StringSession(""), appConfig.telegram.apiId,
        appConfig.telegram.apiHash, getClientConfig());
      setClient(client);
    }
    const loginClient = client;
    startMessageListener();
    try {
      await clientStep(loginClient, () => loginClient.connect(), "Connecting to Telegram", signal, CONNECT_TIMEOUT_MS);
      // Keep the exact hash returned for this phone; login must not send a second code.
      const result = await clientStep(loginClient, () => loginClient.sendCode(
        { apiId: appConfig.telegram.apiId, apiHash: appConfig.telegram.apiHash }, phone,
      ), "Sending Telegram code", signal);
      assertCurrent(loginClient);
      challenge = { client: loginClient, phone, phoneCodeHash: result.phoneCodeHash, passwordRequired: false };
      setConnected(true);
      setLoginStep("code");
      return { status: "code_sent" };
    } catch (error) {
      if (getClient() === loginClient) await resetTelegramClient();
      throw error;
    }
  });
}

export async function loginWithCode(phone: string, code: string, password?: string): Promise<{
  status: string; error?: string;
}> {
  try {
    return await authRequest(async (signal) => {
      const current = challenge;
      const client = getClient();
      if (!client || !current || current.client !== client || current.phone !== phone) {
        return { status: "error", error: "Send a verification code for this phone first." };
      }
      if (!current.passwordRequired) {
        try {
          const result = await clientStep(client, () => client.invoke(new Api.auth.SignIn({
            phoneNumber: phone, phoneCodeHash: current.phoneCodeHash, phoneCode: code,
          })), "Signing in to Telegram", signal);
          assertCurrent(client);
          if (result instanceof Api.auth.AuthorizationSignUpRequired) {
            return { status: "error", error: "Create a Telegram account in an official client first." };
          }
        } catch (error: any) {
          if (error?.errorMessage !== "SESSION_PASSWORD_NEEDED") throw error;
          assertCurrent(client);
          current.passwordRequired = true;
          setLoginStep("password");
        }
      }
      if (current.passwordRequired) {
        if (!password) return { status: "password_required" };
        const parameters = await clientStep(client, () => client.invoke(new Api.account.GetPassword()), "Getting Telegram password parameters", signal);
        assertCurrent(client);
        const check = await clientStep(client, () => computeCheck(parameters, password), "Preparing Telegram password check", signal);
        assertCurrent(client);
        await clientStep(client, () => client.invoke(new Api.auth.CheckPassword({ password: check })), "Checking Telegram password", signal);
      }
      assertCurrent(client);
      const me = await clientStep(client, () => client.getMe(), "Loading Telegram account", signal);
      assertCurrent(client);
      if (!me) throw new Error("Telegram did not authorize this session");
      saveSession((client.session as StringSession).save());
      challenge = null;
      setConnected(true);
      setAuthorized(true);
      const accountId = me.id.toString();
      activateMessageCatchUp(client, accountId);
      appLogger.info({ event: "telegram.login.succeeded", accountId }, "Telegram login succeeded");
      return { status: "success" };
    });
  } catch (error: any) {
    return { status: "error", error: error?.message || "Login failed" };
  }
}

export async function logout(): Promise<void> {
  const client = getClient();
  challenge = null;
  // Invalidate local state immediately, even if revoking the remote session fails.
  setClient(null);
  cancelAuthRequest();
  if (client) deactivateMessageCatchUp(client);
  try {
    if (existsSync(appConfig.telegram.sessionPath)) {
      writeFileSync(appConfig.telegram.sessionPath, "", "utf-8");
    }
    if (client) await withDeadline(client.invoke(new Api.auth.LogOut()), LOGOUT_TIMEOUT_MS, "Telegram logout");
  } catch {
    // Cleanup is mandatory even when offline; remote revocation remains best effort.
  } finally {
    if (client) await destroyClient(client);
  }
}
