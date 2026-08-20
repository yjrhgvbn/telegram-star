import { describe, expect, it } from "vitest";
import { planFilterMessageReconciliation } from "./filter-message-reconciliation.js";

describe("planFilterMessageReconciliation", () => {
  it("removes messages that no longer satisfy every updated condition", () => {
    const plan = planFilterMessageReconciliation(
      [
        { id: 1, chatId: "chat-1", content: "New release", matchedKeyword: "old" },
        { id: 2, chatId: "chat-2", content: "New release", matchedKeyword: "new" },
        { id: 3, chatId: "chat-1", content: "Old release", matchedKeyword: "old" },
        { id: 4, chatId: "chat-1", content: "Another new release", matchedKeyword: "new" },
      ],
      [
        { type: "keyword", values: ["new"] },
        { type: "chat", values: ["chat-1"] },
      ],
    );

    expect(plan).toEqual({
      messageIdsToDelete: [2, 3],
      keywordUpdates: [{ messageIds: [1], matchedKeyword: "new" }],
    });
  });

  it("clears a stale keyword when the updated rule only restricts chats", () => {
    const plan = planFilterMessageReconciliation(
      [{ id: 5, chatId: "chat-1", content: "Any content", matchedKeyword: "legacy" }],
      [{ type: "chat", values: ["chat-1"] }],
    );

    expect(plan).toEqual({
      messageIdsToDelete: [],
      keywordUpdates: [{ messageIds: [5], matchedKeyword: null }],
    });
  });

  it("does not silently delete history when a custom script throws", () => {
    expect(() =>
      planFilterMessageReconciliation(
        [{ id: 6, chatId: "chat-1", content: "红包 300 元", matchedKeyword: null }],
        [{ type: "script", values: ["throw new Error('script failed');"] }],
      ),
    ).toThrow("script failed");
  });
});
