// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types";
import { MessageCard } from "./MessageCard";

afterEach(cleanup);

function createMessage(patch: Partial<Message> = {}): Message {
  return {
    id: 1,
    telegramMessageId: 101,
    chatId: "chat-1",
    chatTitle: "日漫更新-日产动漫/每日更新🎎【唐人街-日漫小巷】",
    senderName: "尼古喵喵",
    senderId: "sender-1",
    content: "第 04 集",
    contentLinks: [],
    messageDate: "2026-07-31T10:00:00.000Z",
    telegramLink: "",
    isRead: true,
    matchedFilterId: 12,
    matchedKeyword: "尼古喵喵",
    filterName: "日漫",
    createdAt: "2026-07-31T10:00:00.000Z",
    mediaType: null,
    mediaFileName: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaThumbBase64: null,
    mediaExtra: null,
    ...patch,
  };
}

describe("MessageCard", () => {
  it("keeps a long chat title inside the shrinkable header column", () => {
    const message = createMessage();
    const { container } = render(<MessageCard message={message} onToggleRead={vi.fn()} />);

    const title = screen.getByTitle(message.chatTitle);
    expect(title.className).toContain("flex-1");
    expect(title.className).toContain("truncate");
    expect(container.querySelector("[data-slot='card']")?.className).toContain("overflow-hidden");
  });

  it("renders Telegram TextUrl entities at their original text positions", () => {
    const content = "【下載連結】: 按我\n【種子】: 按我";
    const firstOffset = content.indexOf("按我");
    const secondOffset = content.indexOf("按我", firstOffset + 1);
    const message = createMessage({
      content,
      contentLinks: [
        { offset: firstOffset, length: 2, url: "https://download.example/video" },
        { offset: secondOffset, length: 2, url: "https://download.example/file.torrent" },
      ],
    });

    render(<MessageCard message={message} onToggleRead={vi.fn()} searchQuery="按我" />);

    const links = screen.getAllByRole("link", { name: "按我" });
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("https://download.example/video");
    expect(links[1]?.getAttribute("href")).toBe("https://download.example/file.torrent");
    expect(links[0]?.querySelector("mark")?.textContent).toBe("按我");
  });

  it("automatically links visible URLs from legacy content", () => {
    const message = createMessage({ content: "访问 https://example.com/path。" });

    render(<MessageCard message={message} onToggleRead={vi.fn()} />);

    expect(screen.getByRole("link", { name: "https://example.com/path" }).getAttribute("href"))
      .toBe("https://example.com/path");
  });

  it("records an explicit follow-up when the Telegram original is opened", () => {
    const onOpenTelegram = vi.fn();
    const message = createMessage({ telegramLink: "https://t.me/c/1/101" });

    render(
      <MessageCard
        message={message}
        onToggleRead={vi.fn()}
        onOpenTelegram={onOpenTelegram}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: /查看原文/ }));
    expect(onOpenTelegram).toHaveBeenCalledWith(message.id);
  });
});
