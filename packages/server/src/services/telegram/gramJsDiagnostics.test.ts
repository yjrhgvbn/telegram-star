import { beforeEach, describe, expect, it, vi } from "vitest";
import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { _handleUpdate } from "telegram/client/updates.js";
import { TypeNotFoundError } from "telegram/errors/index.js";
import { Raw } from "telegram/events/index.js";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { MTProtoSender } from "telegram/network/MTProtoSender.js";
import { StringSession } from "telegram/sessions/index.js";
import { MessageContainer, RPCResult, TLMessage } from "telegram/tl/core/index.js";

const logs = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../shared/logging.js", () => ({ appLogger: logs }));

import { installGramJsDiagnostics } from "./gramJsDiagnostics.js";

const PRIVATE_TEXT = "private-telegram-caption-do-not-log";
const PRIVATE_ERROR = "private-error-detail-do-not-log";
const PRIVATE_PACKET = "private-encrypted-packet-do-not-log";
const PRIVATE_API_HASH = "private-api-hash-do-not-log";
const CHANNEL_ID = "1308315775";
const TELEGRAM_MESSAGE_ID = 17635;
const MESSAGE_KEY = `${CHANNEL_ID}:${TELEGRAM_MESSAGE_ID}`;

function createHarness(updateCallback: CallableFunction = _handleUpdate) {
  const logger = new Logger(LogLevel.NONE);
  const client = new TelegramClient(new StringSession(""), 12345, PRIVATE_API_HASH, {
    baseLogger: logger,
  });
  // Use the real dispatcher without letting its getMe initialization make an RPC.
  (client as any)._selfInputPeer = new Api.InputPeerUser({
    userId: bigInt(1),
    accessHash: bigInt("1234567890123456789"),
  });
  const harness = createSender(client, updateCallback);
  (client as any)._sender = harness.sender;
  return { client, ...harness };
}

function createSender(client: TelegramClient, updateCallback: CallableFunction = _handleUpdate) {
  const sender: any = new MTProtoSender(undefined, {
    ...MTProtoSender.DEFAULT_OPTIONS,
    logger: new Logger(LogLevel.NONE),
    retries: 1,
    isMainSender: true,
    dcId: 2,
    client,
    updateCallback,
    _exportedSenderPromises: new Map(),
  });
  // Only the socket/authentication boundary is stubbed. The sender's connect,
  // container/RPC processing, update dispatcher and Raw event builder stay real.
  sender._connect = vi.fn().mockResolvedValue(undefined);
  const decrypt = vi.fn();
  sender._state.decryptMessageData = decrypt;
  const connection = {
    disconnect: vi.fn().mockResolvedValue(undefined),
    toString: () => "in-memory-diagnostic-test",
  };
  const connect = () => sender.connect(connection, false);
  return { sender, decrypt, connect, connection };
}

function createChannelUpdate() {
  return new Api.UpdateNewChannelMessage({
    message: new Api.Message({
      id: TELEGRAM_MESSAGE_ID,
      peerId: new Api.PeerChannel({ channelId: bigInt(CHANNEL_ID) }),
      message: PRIVATE_TEXT,
      date: 1_789_056_654,
    }),
    pts: 200,
    ptsCount: 1,
  });
}

function updatesPacket(update = createChannelUpdate(), msgId = 2001) {
  return new TLMessage(bigInt(msgId), 1, new Api.Updates({
    updates: [update],
    chats: [],
    users: [],
    date: 1_789_056_654,
    seq: 10,
  }));
}

function eventPayloads(event: string, level?: keyof typeof logs): any[] {
  const methods = level ? [logs[level]] : Object.values(logs);
  return methods.flatMap((method) => method.mock.calls)
    .map(([payload]) => payload)
    .filter((payload) => payload?.event === event);
}

function expectSafeLogs() {
  const payloads = Object.values(logs).flatMap((method) => method.mock.calls)
    .map(([payload]) => payload);
  const serialized = JSON.stringify(payloads);
  for (const secret of [PRIVATE_TEXT, PRIVATE_ERROR, PRIVATE_PACKET, PRIVATE_API_HASH]) {
    expect(serialized).not.toContain(secret);
  }
  const forbiddenKeys = new Set([
    "message", "stack", "body", "remaining", "payload", "authKey", "apiHash",
    "accessHash", "session", "request", "data", "obj", "_client",
  ]);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    expect(Buffer.isBuffer(value)).toBe(false);
    for (const [key, child] of Object.entries(value)) {
      expect(forbiddenKeys.has(key), `Unexpected diagnostic field ${key}`).toBe(false);
      visit(child);
    }
  };
  payloads.forEach(visit);
}

describe("GramJS transport diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports TypeNotFound at warn and preserves the exact decoding error", async () => {
    const { client, sender, decrypt, connect } = createHarness();
    const error = new TypeNotFoundError(0xdeadbeef, Buffer.from(PRIVATE_PACKET));
    error.message = PRIVATE_ERROR;
    error.stack = PRIVATE_ERROR;
    decrypt.mockRejectedValue(error);
    installGramJsDiagnostics(client);
    await connect();

    await expect(sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET))).rejects.toBe(error);

    expect(eventPayloads("telegram.transport.decode_failed", "warn")).toEqual([
      expect.objectContaining({
        errorType: "TypeNotFoundError",
        invalidConstructorId: 0xdeadbeef,
        remainingBytes: Buffer.byteLength(PRIVATE_PACKET),
        bodyBytes: Buffer.byteLength(PRIVATE_PACKET),
      }),
    ]);
    expect(eventPayloads("telegram.transport.decode_failed", "debug")).toHaveLength(0);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expectSafeLogs();
  });

  it("reports the remaining channel update when an earlier RPC error aborts a container", async () => {
    const { client, sender, decrypt, connect } = createHarness();
    const raw = vi.fn();
    client.addEventHandler(raw, new Raw({ types: [Api.UpdateNewChannelMessage] }));
    const requestId = bigInt(1001);
    const reject = vi.fn();
    sender._pendingState.set(requestId, {
      msgId: requestId,
      request: new Api.messages.GetHistory({
        peer: new Api.InputPeerChannel({
          channelId: bigInt(CHANNEL_ID),
          accessHash: bigInt("1234567890123456789"),
        }),
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit: 1,
        maxId: 0,
        minId: 0,
        hash: bigInt.zero,
      }),
      resolve: vi.fn(),
      reject,
    });
    const failedRpc = new TLMessage(bigInt(2000), 1, new RPCResult(
      requestId,
      undefined,
      new Api.RpcError({ errorCode: 400, errorMessage: PRIVATE_ERROR }),
    ));
    const packet = new TLMessage(bigInt(3000), 1, new MessageContainer([
      failedRpc,
      updatesPacket(),
    ]));
    decrypt.mockResolvedValue(packet);
    installGramJsDiagnostics(client);
    await connect();
    const decoded = await sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET));

    const thrown = await sender._processMessage(decoded).catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(reject).toHaveBeenCalledTimes(1);
    expect(thrown).toBe(reject.mock.calls[0][0]);
    expect(raw).not.toHaveBeenCalled();
    expect(eventPayloads("telegram.transport.processing_failed", "warn")).toEqual([
      expect.objectContaining({
        objectType: "RPCResult",
        wireMessageId: "2000",
        containerId: "3000",
        containerIndex: 0,
        remainingMessageCount: 1,
        remainingUpdates: {
          updateCount: 1,
          updates: [expect.objectContaining({
            updateType: "UpdateNewChannelMessage",
            messageKey: MESSAGE_KEY,
            pts: 200,
            ptsCount: 1,
          })],
          updatesTruncated: false,
        },
      }),
    ]);
    expect(eventPayloads("telegram.transport.update_dispatch")).toHaveLength(0);
    expectSafeLogs();
  });

  it("still delivers a decoded channel update to the real Raw dispatcher", async () => {
    const { client, sender, decrypt, connect } = createHarness();
    const update = createChannelUpdate();
    const packet = updatesPacket(update);
    const raw = vi.fn();
    client.addEventHandler(raw, new Raw({ types: [Api.UpdateNewChannelMessage] }));
    decrypt.mockResolvedValue(packet);
    installGramJsDiagnostics(client);
    await connect();

    const decoded = await sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET));
    expect(decoded).toBe(packet);
    await sender._processMessage(decoded);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(raw).toHaveBeenCalledExactlyOnceWith(update);
    expect(JSON.stringify(eventPayloads("telegram.transport.update_dispatch"))).toContain(MESSAGE_KEY);
    expect(eventPayloads("telegram.transport.processing_failed")).toHaveLength(0);
    expectSafeLogs();
  });

  it("does not add wrapper layers when installation or connection is repeated", async () => {
    const { client, sender, decrypt, connect } = createHarness();
    const error = new TypeNotFoundError(0xdeadbeef, Buffer.from(PRIVATE_PACKET));
    decrypt.mockRejectedValue(error);
    installGramJsDiagnostics(client);
    installGramJsDiagnostics(client);
    expect(await connect()).toBe(true);
    const wrappers = {
      decrypt: sender._state.decryptMessageData,
      process: sender._processMessage,
      dispatch: sender._updateCallback,
      disconnect: sender.disconnect,
    };

    installGramJsDiagnostics(client);
    sender._userConnected = true;
    expect(await connect()).toBe(false);

    expect(sender._state.decryptMessageData).toBe(wrappers.decrypt);
    expect(sender._processMessage).toBe(wrappers.process);
    expect(sender._updateCallback).toBe(wrappers.dispatch);
    expect(sender.disconnect).toBe(wrappers.disconnect);
    await expect(sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET))).rejects.toBe(error);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(eventPayloads("telegram.transport.decode_failed")).toHaveLength(1);
    expect(eventPayloads("telegram.transport.sender_attached")).toHaveLength(1);
  });

  it("preserves a synchronous dispatcher failure and logs it before any Raw callback", async () => {
    const { client, sender, connect } = createHarness();
    const raw = vi.fn();
    client.addEventHandler(raw, new Raw({ types: [Api.UpdateNewChannelMessage] }));
    installGramJsDiagnostics(client);
    await connect();
    const error = new Error(PRIVATE_ERROR);
    (client as any)._entityCache.add = vi.fn(() => { throw error; });

    await expect(sender._processMessage(updatesPacket())).rejects.toBe(error);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(raw).not.toHaveBeenCalled();
    expect(eventPayloads("telegram.transport.dispatch_failed", "warn")).toEqual([
      expect.objectContaining({
        wireMessageId: "2001",
        envelopeType: "Updates",
        updates: [expect.objectContaining({ messageKey: MESSAGE_KEY })],
      }),
    ]);
    expectSafeLogs();
  });

  it("keeps successful heartbeat packets out of update diagnostic logs", async () => {
    const { client, sender, decrypt, connect } = createHarness();
    const packet = new TLMessage(bigInt(5000), 1, new Api.Pong({
      msgId: bigInt(5001),
      pingId: bigInt(5002),
    }));
    decrypt.mockResolvedValue(packet);
    installGramJsDiagnostics(client);
    await connect();
    vi.clearAllMocks();

    expect(await sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET))).toBe(packet);
    await sender._processMessage(packet);

    for (const logger of Object.values(logs)) expect(logger).not.toHaveBeenCalled();
  });

  it("keeps the existing client error handler and original error without exposing its text", async () => {
    const { client } = createHarness();
    const handler = vi.fn().mockResolvedValue(undefined);
    client._errorHandler = handler;
    installGramJsDiagnostics(client);
    const error = new Error(PRIVATE_ERROR);

    await client._errorHandler!(error);

    expect(handler).toHaveBeenCalledExactlyOnceWith(error);
    expect(handler.mock.contexts[0]).toBe(client);
    expect(eventPayloads("telegram.transport.client_error", "warn")).toHaveLength(1);
    expectSafeLogs();
  });

  it("does not let a throwing logger replace an error or stop a successful update", async () => {
    const { client, sender, decrypt, connect } = createHarness();
    const error = new TypeNotFoundError(0xdeadbeef, Buffer.from(PRIVATE_PACKET));
    const raw = vi.fn();
    client.addEventHandler(raw, new Raw({ types: [Api.UpdateNewChannelMessage] }));
    decrypt.mockRejectedValue(error);
    installGramJsDiagnostics(client);
    await connect();
    logs.warn.mockImplementationOnce(() => { throw new Error("logger unavailable"); });

    await expect(sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET))).rejects.toBe(error);

    const update = createChannelUpdate();
    decrypt.mockResolvedValue(updatesPacket(update));
    logs.info.mockImplementationOnce(() => { throw new Error("logger unavailable"); });
    const decoded = await sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET));
    await sender._processMessage(decoded);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(raw).toHaveBeenCalledExactlyOnceWith(update);
    expect(eventPayloads("telegram.transport.processing_failed")).toHaveLength(0);
    expectSafeLogs();
  });

  it("separates same-DC auxiliary disconnects from the client's update sender", async () => {
    const main = createHarness();
    const auxiliary = createSender(main.client);
    expect(main.sender._isMainSender).toBe(true);
    expect(auxiliary.sender._isMainSender).toBe(true);
    const raw = vi.fn();
    main.client.addEventHandler(raw, new Raw({ types: [Api.UpdateNewChannelMessage] }));
    const update = createChannelUpdate();
    main.decrypt.mockResolvedValue(updatesPacket(update));
    installGramJsDiagnostics(main.client);
    await main.connect();
    await auxiliary.connect();
    const attached = eventPayloads("telegram.transport.sender_attached");
    expect(attached).toEqual([
      expect.objectContaining({ senderRole: "updates", dcId: 2 }),
      expect.objectContaining({ senderRole: "auxiliary", dcId: 2 }),
    ]);
    expect(attached[0].senderId).not.toBe(attached[1].senderId);

    await auxiliary.sender.disconnect();
    const decoded = await main.sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET));
    await main.sender._processMessage(decoded);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(auxiliary.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(main.connection.disconnect).not.toHaveBeenCalled();
    expect(eventPayloads("telegram.transport.disconnect_requested")).toEqual([
      expect.objectContaining({ senderRole: "auxiliary", senderId: attached[1].senderId }),
    ]);
    expect(eventPayloads("telegram.transport.update_dispatch")).toEqual([
      expect.objectContaining({
        senderRole: "updates",
        senderId: attached[0].senderId,
        updates: [expect.objectContaining({ messageKey: MESSAGE_KEY })],
      }),
    ]);
    expect(raw).toHaveBeenCalledExactlyOnceWith(update);
    expectSafeLogs();
  });

  it("leaves senders belonging to unregistered clients untouched", async () => {
    const registered = createHarness();
    installGramJsDiagnostics(registered.client);
    const { sender, decrypt, connect } = createHarness();
    const originalProcess = sender._processMessage;
    const originalDispatch = sender._updateCallback;
    const originalDisconnect = sender.disconnect;
    const error = new TypeNotFoundError(0xdeadbeef, Buffer.from(PRIVATE_PACKET));
    decrypt.mockRejectedValue(error);

    expect(await connect()).toBe(true);

    expect(sender._state.decryptMessageData).toBe(decrypt);
    expect(sender._processMessage).toBe(originalProcess);
    expect(sender._updateCallback).toBe(originalDispatch);
    expect(sender.disconnect).toBe(originalDisconnect);
    await expect(sender._state.decryptMessageData(Buffer.from(PRIVATE_PACKET))).rejects.toBe(error);
    expect(eventPayloads("telegram.transport.sender_attached")).toHaveLength(0);
    expect(eventPayloads("telegram.transport.decode_failed")).toHaveLength(0);
  });
});
