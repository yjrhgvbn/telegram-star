// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types";
import { MessageCard } from "./MessageCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function createMessage(patch: Partial<Message> = {}): Message {
  return {
    id: 1, telegramMessageId: 101, chatId: "chat-1",
    chatTitle: "日漫更新-日产动漫/每日更新🎎【唐人街-日漫小巷】", senderName: "尼古喵喵", senderId: "sender-1",
    senderUserId: null,
    content: "第 04 集", contentLinks: [], messageDate: "2026-07-31T10:00:00.000Z", telegramLink: "", isRead: true,
    matchedFilterId: 12, matchedKeyword: "尼古喵喵", filterName: "日漫", createdAt: "2026-07-31T10:00:00.000Z",
    mediaType: null, mediaFileName: null, mediaFileSize: null, mediaMimeType: null, mediaDuration: null,
    mediaThumbBase64: null, mediaExtra: null, ...patch,
  };
}

describe("MessageCard", () => {
  it("copies the verified user ID independently of legacy senderId", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<MessageCard message={createMessage({ senderUserId: "123456789", senderId: "different-legacy-id" })} onToggleRead={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "更多消息操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "复制发送者用户 ID" }));
    expect(copy).toHaveBeenCalledWith("123456789");
    expect((await screen.findByRole("status")).textContent).toContain("发送者用户 ID 已复制");
  });

  it.each([null, "-100123", "00123"])("does not offer a user-ID copy action for unknown or invalid identity %s", async (senderUserId) => {
    const user = userEvent.setup();
    render(<MessageCard message={createMessage({ senderUserId, senderId: "123456789" })} onToggleRead={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "更多消息操作" }));
    await screen.findByRole("menuitem", { name: "复制消息" });
    expect(screen.queryByRole("menuitem", { name: "复制发送者用户 ID" })).toBeNull();
  });
  it("offers rule removal in the menu and disables it during completion writes", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    const view = render(<MessageCard message={createMessage()} onToggleRead={vi.fn()} onRemove={remove} />);
    await user.click(screen.getByRole("button", { name: "更多消息操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "从当前规则移除" }));
    expect(remove).toHaveBeenCalledWith(1);
    view.unmount();
    render(<MessageCard message={createMessage()} onToggleRead={vi.fn()} onRemove={remove} completionDisabled />);
    await user.click(screen.getByRole("button", { name: "更多消息操作" }));
    expect((await screen.findByRole("menuitem", { name: "从当前规则移除" })).getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps original source, sender and text visible after completion", () => {
    const message = createMessage();
    const { container } = render(<MessageCard message={message} onToggleRead={vi.fn()} />);
    expect(screen.getByTitle(message.chatTitle).textContent).toBe(message.chatTitle);
    expect(screen.getByText(message.senderName)).toBeTruthy();
    expect(screen.getByText(message.content)).toBeTruthy();
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(message.messageDate);
    expect(screen.getByRole("button", { name: "已完成" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders repeated Telegram TextUrl entities at their original offsets", () => {
    const content = "【下載連結】: 按我\n【種子】: 按我";
    const firstOffset = content.indexOf("按我");
    const secondOffset = content.indexOf("按我", firstOffset + 1);
    render(<MessageCard message={createMessage({content, contentLinks: [
      { offset: firstOffset, length: 2, url: "https://download.example/video" },
      { offset: secondOffset, length: 2, url: "https://download.example/file.torrent" },
    ]})} onToggleRead={vi.fn()} searchQuery="按我" />);
    const links = screen.getAllByRole("link", { name: "按我" });
    expect(links.map(link => link.getAttribute("href"))).toEqual(["https://download.example/video", "https://download.example/file.torrent"]);
    expect(links[0]?.querySelector("mark")?.textContent).toBe("按我");
  });

  it("expands full original text without changing entity offsets or exposing hidden links before expansion", () => {
    const content = "消息🙂\n".repeat(12) + "【下载】: 按我";
    const message = createMessage({content, contentLinks: [{offset: content.indexOf("按我"), length: 2, url: "https://download.example/full"}]});
    render(<MessageCard message={message} onToggleRead={vi.fn()} searchQuery="按我" />);
    expect(screen.queryByRole("link", {name: "按我"})).toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "展开原文"}));
    const link = screen.getByRole("link", {name: "按我"});
    expect(link.getAttribute("href")).toBe("https://download.example/full");
    expect(link.closest("p")?.textContent).toBe(content);
    expect(link.querySelector("mark")?.textContent).toBe("按我");
    fireEvent.click(screen.getByRole("button", {name: "收起原文"}));
    expect(screen.queryByRole("link", {name: "按我"})).toBeNull();
  });

  it("automatically links visible URLs from legacy content", () => {
    render(<MessageCard message={createMessage({content: "访问 https://example.com/path。"})} onToggleRead={vi.fn()} />);
    expect(screen.getByRole("link", {name: "https://example.com/path"}).getAttribute("href")).toBe("https://example.com/path");
  });

  it("emphasizes a labelled original filename while preserving links across its boundary", () => {
    const content = "#更新🙂\n【番名】: [ANi] 原剧名 - 09 [1080P][CHT].mp4\n【下载】: 按我";
    const offset = content.indexOf("【番名】");
    const length = content.indexOf("\n【下载】") - offset;
    render(<MessageCard message={createMessage({content, contentLinks: [{offset, length, url: "https://example.com/episode"}]})} onToggleRead={vi.fn()} searchQuery="09" />);
    const link = screen.getByRole("link");
    expect(link.textContent).toBe(content.slice(offset, offset + length));
    expect(link.querySelector("strong")?.textContent).toBe("[ANi] 原剧名 - 09 [1080P][CHT].mp4");
    expect(link.querySelector("strong mark")?.textContent).toBe("09");
    expect(link.closest("p")?.textContent).toBe(content);
  });

  it("emphasizes the actual file field without inventing a heading for generic messages", () => {
    const content = "群里说第 9 集更新了\n文件：episode-09.mkv";
    const {container} = render(<MessageCard message={createMessage({content, mediaFileName: "episode-09.mkv"})} onToggleRead={vi.fn()} />);
    expect(Array.from(container.querySelectorAll("strong"), node => node.textContent)).toEqual(["episode-09.mkv"]);
    expect(container.querySelector(".message-card__body")?.textContent).toBe(content);
  });

  it.each(["video", "videoNote"])("keeps opening %s attachments independent from marking them watched", mediaType => {
    const onOpenTelegram = vi.fn();
    const onToggleRead = vi.fn();
    const message = createMessage({telegramLink: "https://t.me/c/1/101", mediaType, isRead: false, mediaExtra: "null"});
    render(<MessageCard message={message} onToggleRead={onToggleRead} onOpenTelegram={onOpenTelegram} />);
    fireEvent.click(screen.getByRole("link", {name: "在 Telegram 打开附件"}));
    fireEvent.click(screen.getByRole("link", {name: "在 Telegram 打开"}));
    expect(onOpenTelegram).toHaveBeenCalledTimes(2);
    expect(onToggleRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "标记看完"}));
    expect(onToggleRead).toHaveBeenCalledWith(message.id);
  });

  it("disables the completion action while saving and keeps selection controlled by the list", () => {
    const onToggleRead = vi.fn();
    const onSelect = vi.fn();
    render(<MessageCard message={createMessage()} onToggleRead={onToggleRead} isReadPending isSelecting isSelected onSelect={onSelect} />);
    const button = screen.getByRole("button", {name: "保存中"}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onToggleRead).not.toHaveBeenCalled();
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("disables another completion action without presenting it as currently saving", () => {
    const onToggleRead = vi.fn();
    render(<MessageCard message={createMessage({isRead: false})} onToggleRead={onToggleRead} completionDisabled />);
    const button = screen.getByRole("button", {name: "标记完成"}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole("button", {name: "保存中"})).toBeNull();
    fireEvent.click(button);
    expect(onToggleRead).not.toHaveBeenCalled();
  });

  it("copies the complete original even while collapsed, and disables unavailable links", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const content = "完整的消息原文\n".repeat(20);
    render(<MessageCard message={createMessage({content})} onToggleRead={vi.fn()} />);
    await user.click(screen.getByRole("button", {name: "更多消息操作"}));
    expect((await screen.findByRole("menuitem", {name: "无原文链接"})).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("menuitem", {name: "复制消息"}));
    expect(copy).toHaveBeenCalledWith(content);
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "消息文字已复制");
  });

  it("reports clipboard failure without a false copied state", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Permission denied"));
    render(<MessageCard message={createMessage({telegramLink: "https://t.me/c/1/101"})} onToggleRead={vi.fn()} />);
    await user.click(screen.getByRole("button", {name: "更多消息操作"}));
    await user.click(await screen.findByRole("menuitem", {name: "复制原文链接"}));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "复制未成功，请选中文字后手动复制。");
  });
});
