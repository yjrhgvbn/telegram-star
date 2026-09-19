import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitMessageEvent: vi.fn(),
  filterFindMany: vi.fn(),
  getClient: vi.fn(),
  ingestTelegramMessage: vi.fn(),
  isClientConnected: vi.fn(),
  isMessageCatchUpActive: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  messageFindFirst: vi.fn(),
  messageUpdate: vi.fn(),
  messageUpdateMany: vi.fn(),
  requestMessageCatchUp: vi.fn(),
  setConnected: vi.fn(),
  writeReadSyncLog: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    filter: { findMany: mocks.filterFindMany },
    message: {
      findFirst: mocks.messageFindFirst,
      update: mocks.messageUpdate,
      updateMany: mocks.messageUpdateMany,
    },
  },
}));

vi.mock("../messageEvents.js", () => ({
  emitMessageEvent: mocks.emitMessageEvent,
}));

vi.mock("../readSyncLog.js", () => ({
  writeReadSyncLog: mocks.writeReadSyncLog,
}));

vi.mock("../../shared/logging.js", () => ({
  appLogger: {
    debug: vi.fn(),
    error: mocks.logError,
    info: mocks.logInfo,
    warn: mocks.logWarn,
  },
}));

vi.mock("./client.js", () => ({
  getClient: mocks.getClient,
  isClientConnected: mocks.isClientConnected,
  setConnected: mocks.setConnected,
}));

vi.mock("./messageCatchUp.js", () => ({
  isMessageCatchUpActive: mocks.isMessageCatchUpActive,
  requestMessageCatchUp: mocks.requestMessageCatchUp,
}));

vi.mock("./messageIngestion.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./messageIngestion.js")>(),
  ingestTelegramMessage: mocks.ingestTelegramMessage,
}));

import { startMessageListener } from "./listener.js";

interface RegisteredHandler {
  callback: (event: any) => Promise<void> | void;
  eventBuilder: { constructor: { name: string }; types?: unknown[] };
}

describe("Telegram message listener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isClientConnected.mockReturnValue(true);
  });

  it("re-runs message ingestion when Telegram edits a message", async () => {
    const handlers: RegisteredHandler[] = [];
    const client = {
      addEventHandler: vi.fn((callback, eventBuilder) => {
        handlers.push({ callback, eventBuilder });
      }),
    };
    const activeFilters = [{
      id: 12,
      name: "尼古喵喵",
      conditions: JSON.stringify([{ type: "keyword", values: ["尼古喵喵"] }]),
    }];
    const chat = { id: "1308315775", title: "ANi" };
    const message = {
      id: 17377,
      getChat: vi.fn().mockResolvedValue(chat),
    };

    mocks.getClient.mockReturnValue(client);
    mocks.filterFindMany.mockResolvedValue(activeFilters);
    mocks.ingestTelegramMessage.mockResolvedValue("created");

    startMessageListener();

    const editedHandler = handlers.find(
      ({ eventBuilder }) => eventBuilder.constructor.name === "EditedMessage",
    );
    expect(editedHandler).toBeDefined();

    await editedHandler!.callback({ message });

    expect(mocks.filterFindMany).toHaveBeenCalledWith({
      where: { enabled: true, systemKey: null },
      orderBy: { id: "asc" },
      select: { id: true, name: true, conditions: true },
    });
    expect(message.getChat).toHaveBeenCalledTimes(1);
    expect(mocks.ingestTelegramMessage).toHaveBeenCalledWith({
      message,
      chat,
      activeFilters,
      source: "live-edit",
      notify: true,
      emitEvent: true,
      isCurrentSource: expect.any(Function),
    });
  });

  it("logs a prolonged Telegram disconnect after 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      const handlers: RegisteredHandler[] = [];
      const client = {
        addEventHandler: vi.fn((callback, eventBuilder) => {
          handlers.push({ callback, eventBuilder });
        }),
      };
      mocks.getClient.mockReturnValue(client);
      mocks.isMessageCatchUpActive.mockReturnValue(true);

      startMessageListener();

      const connectionHandler = handlers.find(
        ({ eventBuilder }) =>
          eventBuilder.constructor.name === "Raw" && Boolean(eventBuilder.types?.length),
      );
      expect(connectionHandler).toBeDefined();

      await connectionHandler!.callback({ state: -1 });
      expect(mocks.setConnected).toHaveBeenCalledWith(false);
      expect(mocks.logWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "telegram.connection.state_changed",
          state: "disconnected",
        }),
        "Telegram connection lost",
      );

      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "telegram.connection.prolonged_disconnect",
          disconnectedForMs: 30_000,
        }),
        "Telegram connection has been unavailable for 30 seconds",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops old-account messages that finish loading after switching clients", async () => {
    const handlers: RegisteredHandler[] = [];
    const client = { addEventHandler: (callback: RegisteredHandler["callback"], eventBuilder: RegisteredHandler["eventBuilder"]) => handlers.push({ callback, eventBuilder }) };
    mocks.getClient.mockReturnValue(client);
    mocks.filterFindMany.mockResolvedValue([{ id: 1, name: "all", conditions: "[]" }]);
    let resolveChat!: (chat: unknown) => void;
    const message = { id: 1, getChat: vi.fn(() => new Promise(resolve => { resolveChat = resolve; })) };
    startMessageListener();
    const handler = handlers.find(({ eventBuilder }) => eventBuilder.constructor.name === "NewMessage")!;
    const pending = handler.callback({ message });
    await vi.waitFor(() => expect(message.getChat).toHaveBeenCalledTimes(1));
    mocks.getClient.mockReturnValue({});
    resolveChat({ className: "User", id: "321", firstName: "Old account" });
    await pending;
    expect(mocks.ingestTelegramMessage).not.toHaveBeenCalled();
    const connection = handlers.find(({ eventBuilder }) => eventBuilder.constructor.name === "Raw" && eventBuilder.types?.length)!;
    await connection.callback({ state: -1 });
    expect(mocks.setConnected).not.toHaveBeenCalled();
  });

  it("drops a reaction lookup that completes after the account changes", async () => {
    const handlers: RegisteredHandler[] = [];
    const client = { addEventHandler: (callback: RegisteredHandler["callback"], eventBuilder: RegisteredHandler["eventBuilder"]) => handlers.push({ callback, eventBuilder }) };
    mocks.getClient.mockReturnValue(client);
    let complete!: (row: unknown) => void;
    mocks.messageFindFirst.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    startMessageListener();
    const raw = handlers.filter(({ eventBuilder }) => eventBuilder.constructor.name === "Raw" && !eventBuilder.types?.length)[1];
    const pending = raw.callback({ className: "UpdateMessageReactions", peer: { className: "PeerUser", userId: "321" }, msgId: 5, reactions: { results: [{ chosenOrder: 0 }] } });
    await vi.waitFor(() => expect(mocks.messageFindFirst).toHaveBeenCalledOnce());
    mocks.getClient.mockReturnValue({});
    complete({ id: 1 });
    await pending;
    expect(mocks.messageUpdate).not.toHaveBeenCalled();
    expect(mocks.emitMessageEvent).not.toHaveBeenCalled();
  });
});
