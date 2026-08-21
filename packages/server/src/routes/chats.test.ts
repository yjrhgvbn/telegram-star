import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../test/routeTestUtils.js";
import { chatRoutes } from "./chats.js";
import * as telegramService from "../services/telegram.js";

vi.mock("../services/telegram.js", () => ({
  discoverJoinedChats: vi.fn(),
  listJoinedChats: vi.fn(),
  listSingleChatMessages: vi.fn(),
}));

describe("chat routes", () => {
  beforeEach(() => {
    vi.mocked(telegramService.discoverJoinedChats).mockReset();
    vi.mocked(telegramService.listJoinedChats).mockReset();
    vi.mocked(telegramService.listSingleChatMessages).mockReset();
  });

  it("validates and forwards a chat discovery query", async () => {
    const body = {
      query: "电影",
      partial: true,
      data: [
        {
          chat: { id: "100", title: "资源分享群", type: "group" as const },
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
    };
    vi.mocked(telegramService.discoverJoinedChats).mockResolvedValue(body);
    const app = await createRouteTestApp(chatRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/api/chats/discover?q=%E7%94%B5%E5%BD%B1&limit=5",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(body);
    expect(telegramService.discoverJoinedChats).toHaveBeenCalledWith({
      query: "电影",
      limit: 5,
    });
  });

  it("rejects a discovery query shorter than two characters", async () => {
    const app = await createRouteTestApp(chatRoutes);
    const response = await app.inject({
      method: "GET",
      url: "/api/chats/discover?q=%E5%BD%B1",
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(parseJson<{ error: string }>(response.payload).error).toContain("至少输入 2 个字符");
    expect(telegramService.discoverJoinedChats).not.toHaveBeenCalled();
  });
});
