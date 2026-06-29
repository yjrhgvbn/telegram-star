import type { FastifyInstance } from "fastify";
import {
  InvalidMediaThumbParamsError,
  ThumbnailNotAvailableError,
  getMediaCacheStats,
  getMediaThumbPayload,
  parseMediaThumbParams,
} from "./media.service.js";

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { chatId: string; messageId: string };
  }>("/api/media/:chatId/:messageId/thumb", async (request, reply) => {
    try {
      const thumb = await getMediaThumbPayload(parseMediaThumbParams(request.params));
      return reply
        .header("Content-Type", thumb.mimeType)
        .header("Cache-Control", thumb.cacheControl)
        .header("Content-Length", thumb.contentLength)
        .send(thumb.buffer);
    } catch (error) {
      if (error instanceof InvalidMediaThumbParamsError) {
        return reply.status(400).send({ error: error.message });
      }
      if (error instanceof ThumbnailNotAvailableError) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/api/media/cache-stats", async () => {
    return getMediaCacheStats();
  });
}
