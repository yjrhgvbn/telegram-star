import { describe, expect, it } from "vitest";
import type { Message } from "@/types";
import {
  appendUniqueMessages,
  markMessagesAsRead,
  prependUniqueMessages,
  updateMessageReadState,
} from "./messageMerge";

function createMessage(id: number, isRead = false): Message {
  return {
    id,
    telegramMessageId: id,
    chatId: "chat",
    chatTitle: "Chat",
    senderName: "Sender",
    senderId: "sender",
    content: "",
    messageDate: "2026-06-26T00:00:00.000Z",
    telegramLink: "",
    isRead,
    matchedFilterId: null,
    matchedKeyword: null,
    filterName: null,
    createdAt: "2026-06-26T00:00:00.000Z",
    mediaType: null,
    mediaFileName: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaThumbBase64: null,
    mediaExtra: null,
  };
}

describe("messageMerge", () => {
  it("appends only messages that are not already present", () => {
    const merged = appendUniqueMessages(
      [createMessage(1), createMessage(2)],
      [createMessage(2), createMessage(3)],
    );

    expect(merged.map((message) => message.id)).toEqual([1, 2, 3]);
  });

  it("prepends only messages that are not already present", () => {
    const merged = prependUniqueMessages(
      [createMessage(2), createMessage(3)],
      [createMessage(1), createMessage(2)],
    );

    expect(merged.map((message) => message.id)).toEqual([1, 2, 3]);
  });

  it("marks selected messages as read", () => {
    const updated = markMessagesAsRead([createMessage(1), createMessage(2)], [2]);

    expect(updated.map((message) => message.isRead)).toEqual([false, true]);
  });

  it("updates one message read state", () => {
    const updated = updateMessageReadState([createMessage(1, true), createMessage(2)], 1, false);

    expect(updated.map((message) => message.isRead)).toEqual([false, false]);
  });
});
