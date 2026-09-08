// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types";
import { TELEGRAM_JUMP_MESSAGE_ID_KEY } from "../utils/messageNavigation";
import { MediaPreview } from "./MediaPreview";

vi.mock("@/shared/runtime/ClientShellBridgeProvider", () => ({
  useClientExternalLink: () => (
    event: { preventDefault: () => void },
    _url: string,
    onOpen?: () => void,
  ) => {
    event.preventDefault();
    onOpen?.();
  },
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function createMessage(patch: Partial<Message> = {}): Message {
  return {
    id: 21, telegramMessageId: 101, chatId: "chat-1",
    chatTitle: "动画更新", senderName: "ANi", senderId: "sender-1",
    content: "第 04 集", contentLinks: [], messageDate: "2026-07-31T10:00:00.000Z",
    telegramLink: "https://t.me/c/1/101", isRead: false,
    matchedFilterId: 12, matchedKeyword: "动画", filterName: "动画",
    createdAt: "2026-07-31T10:00:00.000Z", mediaType: "video",
    mediaFileName: "episode-04.mp4", mediaFileSize: 104857600,
    mediaMimeType: "video/mp4", mediaDuration: 1959,
    mediaThumbBase64: null, mediaExtra: JSON.stringify({ w: 1920, h: 1080 }),
    ...patch,
  };
}

describe("MediaPreview", () => {
  it.each(["video", "videoNote", "gif"])(
    "keeps one Telegram entry when a %s thumbnail fails, including navigation tracking",
    mediaType => {
      const message = createMessage({ mediaType });
      const onOpenTelegram = vi.fn();
      render(<MediaPreview message={message} onOpenTelegram={onOpenTelegram} />);
      const image = screen.getByRole("img", { name: "视频消息" });
      const reservedRatio = image.parentElement?.style.aspectRatio;
      expect(image.getAttribute("loading")).toBe("lazy");
      fireEvent.error(image);

      const link = screen.getByRole("link", { name: "在 Telegram 打开附件" });
      expect(screen.getAllByText("在 Telegram 查看")).toHaveLength(1);
      // The previous failure state stacked a Video icon beneath a Play icon.
      expect(link.querySelectorAll("svg")).toHaveLength(1);
      expect(link.querySelector(".lucide-play")).toBeNull();
      expect(link.querySelector(".media-preview--video")?.getAttribute("data-has-thumbnail")).toBe("false");
      expect(link.querySelector(".media-preview--video")?.getAttribute("style"))
        .toContain(`aspect-ratio: ${reservedRatio}`);
      expect(screen.getByText("32:39")).toBeTruthy();
      expect(screen.getByText("episode-04.mp4")).toBeTruthy();
      expect(link.getAttribute("href")).toBe(message.telegramLink);
      fireEvent.click(link);
      expect(onOpenTelegram).toHaveBeenCalledExactlyOnceWith(message.id);
      expect(sessionStorage.getItem(TELEGRAM_JUMP_MESSAGE_ID_KEY)).toBe(String(message.id));
    },
  );

  it.each(["", "   "])("shows an inert attachment without a usable link (%j)", telegramLink => {
    const onOpenTelegram = vi.fn();
    const { container } = render(
      <MediaPreview message={createMessage({ telegramLink, mediaExtra: null })} onOpenTelegram={onOpenTelegram} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("在 Telegram 查看")).toBeNull();

    const image = screen.getByRole("img", { name: "视频消息" });
    const preview = image.parentElement;
    expect(preview?.style.height).toBe("240px");
    fireEvent.error(image);
    fireEvent.click(screen.getByText("视频附件"));
    expect(preview?.style.height).toBe("240px");
    expect(container.querySelector(".lucide-play")).toBeNull();
    expect(container.querySelector(".lucide-external-link")).toBeNull();
    expect(onOpenTelegram).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(TELEGRAM_JUMP_MESSAGE_ID_KEY)).toBeNull();
  });

  it("keeps the stripped thumbnail on proxy failure without adding another icon", () => {
    const { container } = render(
      <MediaPreview message={createMessage({ mediaThumbBase64: "placeholder" })} />,
    );
    fireEvent.error(screen.getByRole("img", { name: "视频消息" }));
    const thumbnail = container.querySelector("img");
    expect(thumbnail?.getAttribute("src")).toBe("data:image/jpeg;base64,placeholder");
    expect(thumbnail?.getAttribute("aria-hidden")).toBe("true");
    expect(thumbnail?.parentElement?.getAttribute("data-has-thumbnail")).toBe("true");
    expect(screen.getByRole("link").querySelectorAll("svg")).toHaveLength(1);
    expect(screen.queryByText("视频附件")).toBeNull();
  });

  it("reveals a loaded thumbnail without changing its reserved dimensions", () => {
    render(<MediaPreview message={createMessage({ telegramLink: "" })} />);
    const image = screen.getByRole("img", { name: "视频消息" });
    const before = image.parentElement?.getAttribute("style");
    expect(image.parentElement?.getAttribute("data-has-thumbnail")).toBe("false");
    expect(screen.getByText("视频附件")).toBeTruthy();
    fireEvent.load(image);
    expect(image.classList.contains("media-preview__thumb--loaded")).toBe(true);
    expect(image.parentElement?.getAttribute("data-has-thumbnail")).toBe("true");
    expect(image.parentElement?.getAttribute("style")).toBe(before);
    expect(screen.queryByText("视频附件")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
