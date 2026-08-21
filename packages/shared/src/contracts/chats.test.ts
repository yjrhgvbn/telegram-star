import { describe, expect, it } from "vitest";
import {
  chatDiscoveryQuerySchema,
  chatDiscoveryResponseSchema,
  joinedChatListSchema,
} from "./chats.js";

describe("chat contracts", () => {
  it("parses joined chats and coerces discovery query limits", () => {
    expect(joinedChatListSchema.parse([{ id: "100", title: "影视交流群" }])).toEqual([
      { id: "100", title: "影视交流群" },
    ]);
    expect(chatDiscoveryQuerySchema.parse({ q: " 电影 ", limit: "5" })).toEqual({
      q: "电影",
      limit: 5,
    });
  });

  it("rejects discovery queries that are too short", () => {
    expect(chatDiscoveryQuerySchema.safeParse({ q: "影" }).success).toBe(false);
  });

  it("accepts a bounded discovery response", () => {
    expect(
      chatDiscoveryResponseSchema.parse({
        query: "电影",
        partial: true,
        data: [
          {
            chat: { id: "100", title: "资源分享群", type: "group" },
            matches: [
              {
                messageId: 8,
                snippet: "今天分享一部电影",
                messageDate: "2026-08-21T08:00:00.000Z",
                telegramLink: "https://t.me/c/100/8",
              },
            ],
          },
        ],
      }).data[0]?.chat.type,
    ).toBe("group");
  });
});
