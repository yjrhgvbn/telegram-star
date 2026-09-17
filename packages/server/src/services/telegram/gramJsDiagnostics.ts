import { createRequire } from "node:module";
import type { TelegramClient } from "telegram";
import { MTProtoSender } from "telegram/network/MTProtoSender.js";
import { appLogger } from "../../shared/logging.js";

// GramJS 没有公开接收层观测接口；仅对已验证版本、已登记的 client 安装实例包装。
// 不改接收循环、请求、重试或异常传播；升级依赖时必须重新运行真实库回归测试。
const SUPPORTED_VERSION = "2.26.22";
// 该发行包的 index.version 仍写着 2.26.21，兼容性判断必须读取实际包版本。
const gramJsVersion: string = createRequire(import.meta.url)("telegram/package.json").version;
const MAX_UPDATE_REFS = 20;
const CONTAINER_ID = 0x73f1f8dc;
const registeredClients = new WeakSet<object>();
const attachedSenders = new WeakSet<object>();
let connectHookInstalled = false;
let senderSequence = 0;

// 类型边界仅限于 GramJS 的私有运行时对象，不序列化这些对象。
type InternalObject = Record<string, any>;

function observe(level: "info" | "warn", build: () => InternalObject): void {
  try {
    appLogger[level](build());
  } catch {
    // 诊断失败不能影响网络接收，也不能覆盖原始异常。
  }
}

function safeName(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.]{0,95}$/.test(value)
    ? value
    : null;
}

function numericId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const result = String(value);
  return /^-?\d{1,24}$/.test(result) ? result : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorFields(error: unknown): InternalObject {
  const value = error as InternalObject | null;
  const name = safeName(value?.name);
  return {
    errorType: name && name !== "Error" ? name : safeName(value?.constructor?.name) ?? name ?? "UnknownError",
    rpcErrorCode: finiteNumber(value?.code),
    rpcErrorName: typeof value?.errorMessage === "string" && /^[A-Z][A-Z0-9_]{0,95}$/.test(value.errorMessage)
      ? value.errorMessage
      : null,
    requestType: safeName(value?.request?.className),
    invalidConstructorId: finiteNumber(value?.invalidConstructorId),
    remainingBytes: Buffer.isBuffer(value?.remaining) ? value.remaining.length : null,
  };
}

function objectType(value: InternalObject | undefined): string | null {
  if (value?.CONSTRUCTOR_ID === CONTAINER_ID) return "MessageContainer";
  return safeName(value?.className) ?? safeName(value?.constructor?.name);
}

/** 只读取 TL 元信息；不 await 未解析子项，不读取正文、实体列表或 RPC 参数。 */
function updateSummary(value: InternalObject | undefined): InternalObject {
  const updates: InternalObject[] = [];
  let updateCount = 0;
  function visit(item: InternalObject | undefined, depth: number): void {
    if (!item || depth > 4) return;
    if (item.CONSTRUCTOR_ID === CONTAINER_ID && Array.isArray(item.messages)) {
      for (const child of item.messages) visit(child.obj, depth + 1);
    } else if (Array.isArray(item.updates)) {
      for (const child of item.updates) visit(child, depth + 1);
    } else if (item.className === "UpdateShort") {
      visit(item.update, depth + 1);
    } else if (safeName(item.className)?.startsWith("Update")) {
      updateCount += 1;
      if (updates.length >= MAX_UPDATE_REFS) return;
      const message = typeof item.message === "object" && item.message !== null ? item.message : item;
      const peer = message.peerId ?? message;
      const chatId = numericId(peer.channelId ?? peer.chatId ?? peer.userId ?? item.channelId);
      const telegramMessageId = finiteNumber(message.id);
      updates.push({
        updateType: safeName(item.className),
        chatId,
        telegramMessageId,
        messageKey: chatId && telegramMessageId !== null ? `${chatId}:${telegramMessageId}` : null,
        pts: finiteNumber(item.pts),
        ptsCount: finiteNumber(item.ptsCount),
      });
    }
  }
  visit(value, 0);
  return { updateCount, updates, updatesTruncated: updateCount > updates.length };
}

function attachSender(sender: InternalObject): void {
  if (attachedSenders.has(sender)) return;
  attachedSenders.add(sender);
  const senderId = `sender-${++senderSequence}`;
  const context = () => ({
    senderId,
    // 同 DC 的媒体 sender 也可能 _isMainSender=true，因此比较实际主连接实例。
    senderRole: sender._client?._sender === sender ? "updates" : "auxiliary",
    dcId: finiteNumber(sender._dcId),
    hasUpdateCallback: typeof sender._updateCallback === "function",
  });
  if (typeof sender._state?.decryptMessageData !== "function" ||
      typeof sender._processMessage !== "function" || typeof sender.disconnect !== "function") {
    observe("warn", () => ({ event: "telegram.transport.diagnostics_unavailable", ...context(), reason: "sender-contract" }));
    return;
  }

  const decrypt = sender._state.decryptMessageData;
  sender._state.decryptMessageData = async function (this: InternalObject, ...args: unknown[]) {
    try {
      return await decrypt.apply(this, args);
    } catch (error) {
      observe("warn", () => ({
        event: "telegram.transport.decode_failed", ...context(), ...errorFields(error),
        bodyBytes: Buffer.isBuffer(args[0]) ? args[0].length : null,
      }));
      throw error;
    }
  };

  // _handlers 在构造时已 bind；拦截递归调用的 _processMessage 才能覆盖容器中断。
  // 接收循环逐包 await，此栈仅在原调用期间存在；不提前 await message.obj。
  const frames: InternalObject[] = [];
  let failureLogged = false;
  const processMessage = sender._processMessage;
  sender._processMessage = async function (this: InternalObject, message: InternalObject) {
    frames.push(message);
    try {
      return await processMessage.call(this, message);
    } catch (error) {
      if (!failureLogged) {
        failureLogged = true;
        observe("warn", () => {
          const container = frames.slice().reverse().find((frame) => frame !== message && frame.obj?.CONSTRUCTOR_ID === CONTAINER_ID);
          const index = container?.obj.messages.indexOf(message) ?? -1;
          const remaining = index < 0 ? [] : container!.obj.messages.slice(index + 1);
          return {
            event: "telegram.transport.processing_failed", ...context(), ...errorFields(error),
            wireMessageId: numericId(message.msgId), objectType: objectType(message.obj),
            containerId: numericId(container?.msgId), containerIndex: index < 0 ? null : index,
            remainingMessageCount: remaining.length,
            remainingUpdates: updateSummary({ CONSTRUCTOR_ID: CONTAINER_ID, messages: remaining }),
          };
        });
      }
      throw error;
    } finally {
      frames.pop();
      if (frames.length === 0) failureLogged = false;
    }
  };

  const updateCallback = sender._updateCallback;
  if (typeof updateCallback === "function") {
    sender._updateCallback = function (this: InternalObject, ...args: unknown[]) {
      const update = args[1] as InternalObject | undefined;
      const wireMessageId = () => numericId(frames[frames.length - 1]?.msgId);
      // 连接状态另有日志；这里记录送入 GramJS 实体缓存/事件构建器之前的更新信封。
      if (objectType(update) !== "UpdateConnectionState") {
        observe("info", () => ({
          event: "telegram.transport.update_dispatch", ...context(),
          wireMessageId: wireMessageId(), envelopeType: objectType(update),
          seq: finiteNumber(update?.seq), seqStart: finiteNumber(update?.seqStart),
          date: finiteNumber(update?.date), ...updateSummary(update),
        }));
      }
      try {
        return updateCallback.apply(this, args);
      } catch (error) {
        observe("warn", () => ({
          event: "telegram.transport.dispatch_failed", ...context(), ...errorFields(error),
          wireMessageId: wireMessageId(), envelopeType: objectType(update), ...updateSummary(update),
        }));
        throw error;
      }
    };
  }

  const disconnect = sender.disconnect;
  sender.disconnect = function (this: InternalObject, ...args: unknown[]) {
    observe("info", () => ({ event: "telegram.transport.disconnect_requested", ...context() }));
    return disconnect.apply(this, args);
  };
  observe("info", () => ({ event: "telegram.transport.sender_attached", ...context(), gramJsVersion }));
}

export function installGramJsDiagnostics(client: TelegramClient): void {
  if (registeredClients.has(client)) return;
  registeredClients.add(client);
  if (gramJsVersion !== SUPPORTED_VERSION || typeof MTProtoSender.prototype.connect !== "function") {
    observe("warn", () => ({
      event: "telegram.transport.diagnostics_unavailable", gramJsVersion, reason: "unsupported-version",
    }));
    return;
  }

  const previousErrorHandler = client._errorHandler;
  client._errorHandler = async (error) => {
    observe("warn", () => ({ event: "telegram.transport.client_error", ...errorFields(error) }));
    await previousErrorHandler?.call(client, error);
  };

  if (!connectHookInstalled) {
    connectHookInstalled = true;
    const connect = MTProtoSender.prototype.connect;
    MTProtoSender.prototype.connect = function (...args) {
      const sender = this as unknown as InternalObject;
      if (registeredClients.has(sender._client)) attachSender(sender);
      return connect.apply(this, args);
    };
  }
}
