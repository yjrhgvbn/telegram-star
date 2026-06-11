/**
 * 媒体缩略图代理路由。
 * 前端通过 /api/media/:chatId/:messageId/thumb 获取缩略图，
 * 服务端从 Telegram 按需下载并以 LRU 缓存在内存中，不写磁盘。
 */
import type { FastifyInstance } from "fastify";
import { getThumbBuffer, getCacheStats } from "../services/mediaCache.js";

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/media/:chatId/:messageId/thumb
   * 返回指定消息的最小缩略图。
   * 首次请求需 1-3s（实时从 Telegram 下载），后续命中缓存 <1ms。
   */
  app.get<{
    Params: { chatId: string; messageId: string };
  }>("/api/media/:chatId/:messageId/thumb", async (request, reply) => {
    const { chatId, messageId } = request.params;
    const msgId = parseInt(messageId, 10);

    if (!chatId || !msgId || Number.isNaN(msgId)) {
      return reply.status(400).send({ error: "Invalid chatId or messageId" });
    }

    const result = await getThumbBuffer(chatId, msgId);
    if (!result) {
      return reply.status(404).send({ error: "Thumbnail not available" });
    }

    return reply
      .header("Content-Type", result.mimeType)
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Length", result.buffer.byteLength)
      .send(result.buffer);
  });

  /** GET /api/media/cache-stats — 缓存统计（调试用） */
  app.get("/api/media/cache-stats", async () => {
    return getCacheStats();
  });
}
