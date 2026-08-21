// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { JoinedChatPicker } from "./JoinedChatPicker";

describe("JoinedChatPicker", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("discovers joined chats by message content without selecting the query itself", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const discoverSpy = vi.spyOn(api.chats, "discover").mockResolvedValue({
      query: "电影",
      partial: true,
      data: [
        {
          chat: { id: "chat-3", title: "资源分享群", type: "group" },
          matches: [
            {
              messageId: 8,
              snippet: "今天分享一部电影",
              messageDate: "2026-08-21T08:00:00.000Z",
              telegramLink: "https://t.me/c/3/8",
            },
          ],
        },
      ],
    });

    render(
      <JoinedChatPicker
        items={[
          { id: "chat-1", title: "动漫抢先看" },
          { id: "chat-2", title: "国漫精品社区" },
          { id: "chat-3", title: "资源分享群" },
        ]}
        loading={false}
        label="全部会话"
        selected={[]}
        searchPlaceholder="搜索会话名称或 ID"
        onSelectionChange={onSelectionChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "全部会话" }));
    await user.type(screen.getByRole("searchbox", { name: "搜索会话" }), "电影");

    expect(screen.getByText("没有名称匹配的会话")).not.toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "在已加入会话的消息中查找“电影”",
      }),
    );

    expect(discoverSpy).toHaveBeenCalledWith(
      { query: "电影", limit: 20 },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("根据消息内容发现")).not.toBeNull();
    expect(screen.getByText("今天分享一部")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /资源分享群/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(["chat-3"]);
    expect(onSelectionChange).not.toHaveBeenCalledWith(["电影"]);
  });

  it("clears the temporary discovery query after closing", async () => {
    const user = userEvent.setup();
    render(
      <JoinedChatPicker
        items={[{ id: "chat-1", title: "动漫抢先看" }]}
        loading={false}
        label="全部会话"
        selected={[]}
        onSelectionChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "全部会话" }));
    await user.type(screen.getByRole("searchbox", { name: "搜索会话" }), "电影");
    await user.click(screen.getByRole("button", { name: "完成" }));
    await user.click(screen.getByRole("button", { name: "全部会话" }));

    expect((screen.getByRole("searchbox", { name: "搜索会话" }) as HTMLInputElement).value).toBe("");
  });
});
