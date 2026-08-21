import { describe, expect, it } from "vitest";
import { buildChatDiscoveryResults } from "./discovery.js";

function createMessage(options: {
  id: number;
  chatId?: string;
  userId?: string;
  content: string;
  date: number;
}) {
  return {
    id: options.id,
    peerId: options.chatId
      ? { channelId: { toString: () => options.chatId } }
      : { userId: { toString: () => options.userId } },
    message: options.content,
    date: options.date,
  };
}

describe("chat discovery", () => {
  it("keeps only joined chats, aggregates evidence, and orders by recency", () => {
    const joinedEntities = new Map<string, any>([
      ["100", { className: "Channel", id: "100", title: "影视交流群", broadcast: false }],
      ["200", { className: "Channel", id: "200", title: "4K 频道", broadcast: true }],
    ]);

    const results = buildChatDiscoveryResults({
      query: "电影",
      limit: 20,
      joinedEntities,
      messages: [
        createMessage({ id: 1, chatId: "100", content: "第一条电影消息", date: 100 }),
        createMessage({ id: 2, chatId: "100", content: "第二条电影消息", date: 200 }),
        createMessage({ id: 3, chatId: "100", content: "第三条电影消息", date: 300 }),
        createMessage({ id: 4, chatId: "200", content: "频道电影消息", date: 400 }),
        createMessage({ id: 7, chatId: "200", content: "Telegram 返回的关联结果", date: 700 }),
        createMessage({ id: 5, chatId: "999", content: "未加入电影消息", date: 500 }),
        createMessage({ id: 6, userId: "300", content: "私聊电影消息", date: 600 }),
      ],
    });

    expect(results.map((result) => result.chat)).toEqual([
      { id: "200", title: "4K 频道", type: "channel" },
      { id: "100", title: "影视交流群", type: "group" },
    ]);
    expect(results[1]?.matches.map((match) => match.messageId)).toEqual([3, 2]);
    expect(results.flatMap((result) => result.matches).every(
      (match) => match.snippet.includes("电影"),
    )).toBe(true);
  });

  it("centers long snippets around the matched query", () => {
    const results = buildChatDiscoveryResults({
      query: "电影",
      limit: 1,
      joinedEntities: new Map([
        ["100", { className: "Chat", id: "100", title: "资源群" }],
      ]),
      messages: [
        createMessage({
          id: 1,
          chatId: "100",
          content: `${"开头".repeat(100)}电影${"结尾".repeat(100)}`,
          date: 100,
        }),
      ],
    });

    expect(results[0]?.matches[0]?.snippet).toContain("电影");
    expect(results[0]?.matches[0]?.snippet.startsWith("…")).toBe(true);
    expect(results[0]?.matches[0]?.snippet.endsWith("…")).toBe(true);
  });
});
