import { describe, expect, it, vi } from "vitest";
import {
  MESSAGE_CATCH_UP_INITIAL_LOOKBACK_MS,
  MESSAGE_CATCH_UP_OVERLAP_MS,
  loadMessagesForCatchUp,
  resolveCatchUpChatScope,
  resolveCatchUpWindow,
  runMessageCatchUpOnce,
  type MessageCatchUpRunDependencies,
} from "./messageCatchUp.js";

describe("Telegram message catch-up", () => {
  it("uses a bounded initial window and overlaps persisted checkpoints", () => {
    expect(resolveCatchUpWindow(null, 2 * MESSAGE_CATCH_UP_INITIAL_LOOKBACK_MS)).toEqual({
      sinceMs: MESSAGE_CATCH_UP_INITIAL_LOOKBACK_MS,
      untilMs: 2 * MESSAGE_CATCH_UP_INITIAL_LOOKBACK_MS,
      hadCheckpoint: false,
    });

    expect(resolveCatchUpWindow(1_000_000, 1_500_000)).toEqual({
      sinceMs: 1_000_000 - MESSAGE_CATCH_UP_OVERLAP_MS,
      untilMs: 1_500_000,
      hadCheckpoint: true,
    });
  });

  it("limits scans when every active filter has a chat condition", () => {
    expect(
      resolveCatchUpChatScope([
        {
          id: 1,
          name: "one",
          conditions: JSON.stringify([
            { type: "keyword", values: ["release"] },
            { type: "chat", values: ["chat-1"] },
          ]),
        },
        {
          id: 2,
          name: "two",
          conditions: JSON.stringify([{ type: "chat", values: ["chat-2", "chat-3"] }]),
        },
      ]),
    ).toEqual(new Set(["chat-1", "chat-2", "chat-3"]));

    expect(
      resolveCatchUpChatScope([
        {
          id: 3,
          name: "global",
          conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]),
        },
      ]),
    ).toBeNull();
  });

  it("loads segmented history inside the requested window in chronological order", async () => {
    const offsets: number[] = [];
    const pages = new Map<number, Array<{ id: number; date: Date }>>([
      [0, [
        { id: 5, date: new Date(500_000) },
        { id: 4, date: new Date(400_000) },
      ]],
      [4, [
        { id: 3, date: new Date(300_000) },
        { id: 2, date: new Date(200_000) },
      ]],
    ]);
    const client = {
      async getMessages(_entity: unknown, options: { offsetId?: number }) {
        const offset = options.offsetId ?? 0;
        offsets.push(offset);
        return pages.get(offset) ?? [];
      },
    };

    const messages = await loadMessagesForCatchUp({
      client: client as never,
      entity: { id: "chat-1" },
      sinceMs: 250_000,
      untilMs: 450_000,
      batchSize: 2,
      maxMessages: 10,
    });

    expect(offsets).toEqual([0, 4]);
    expect(messages.map((message) => message.id)).toEqual([3, 4]);
  });

  it("does not advance the checkpoint when one dialog scan fails", async () => {
    const saveCheckpoint = vi.fn();
    const dependencies: MessageCatchUpRunDependencies = {
      now: () => 1_500_000,
      isActive: () => true,
      loadCheckpoint: async () => 1_000_000,
      saveCheckpoint,
      loadActiveFilters: async () => [{
        id: 1,
        name: "release",
        conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]),
      }],
      loadDialogs: async () => [{
        entity: { className: "Channel", id: "chat-1" },
        message: { date: new Date(1_400_000) },
      }],
      loadMessages: async () => {
        throw new Error("Telegram unavailable");
      },
      ingestMessage: async () => "created",
      emitRefresh: vi.fn(),
    };

    await expect(
      runMessageCatchUpOnce(
        { client: {} as never, accountId: "account-1", reason: "reconnect-catchup" },
        dependencies,
      ),
    ).rejects.toThrow("Telegram unavailable");
    expect(saveCheckpoint).not.toHaveBeenCalled();
  });

  it("saves the completed window and emits one refresh after recovered messages", async () => {
    const saveCheckpoint = vi.fn();
    const emitRefresh = vi.fn();
    const ingestMessage = vi.fn(async () => "created" as const);
    const dependencies: MessageCatchUpRunDependencies = {
      now: () => 1_500_000,
      isActive: () => true,
      loadCheckpoint: async () => 1_000_000,
      saveCheckpoint,
      loadActiveFilters: async () => [{
        id: 1,
        name: "release",
        conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]),
      }],
      loadDialogs: async () => [{
        entity: { className: "Channel", id: "chat-1", title: "Releases" },
        message: { date: new Date(1_400_000) },
      }],
      loadMessages: async () => [{ id: 7, date: new Date(1_300_000), message: "release" }],
      ingestMessage,
      emitRefresh,
    };

    const result = await runMessageCatchUpOnce(
      { client: {} as never, accountId: "account-1", reason: "reconnect-catchup" },
      dependencies,
    );

    expect(result.savedCount).toBe(1);
    expect(saveCheckpoint).toHaveBeenCalledWith("account-1", 1_500_000);
    expect(emitRefresh).toHaveBeenCalledTimes(1);
    expect(ingestMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: "reconnect-catchup",
      notify: true,
      emitEvent: false,
    }));
  });
});
