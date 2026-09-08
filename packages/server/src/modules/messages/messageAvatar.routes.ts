import type { FastifyInstance } from "fastify";
import { messageIdParamSchema } from "@telegram-star/shared/contracts/messages";
import { getMessageAvatarPayload } from "./messageAvatar.service.js";

export async function messageAvatarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/messages/:id/avatar", async (request, reply) => {
    // Revalidate in this private browser cache after login changes; Telegram downloads are
    // instead shared by the bounded, account-scoped cache on the server.
    reply.header("Cache-Control", "private, no-cache");
    const params = messageIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid message id" });

    try {
      const avatar = await getMessageAvatarPayload(params.data.id);
      if (!avatar) return reply.status(404).send({ error: "Avatar not available" });
      return reply
        .header("Content-Type", avatar.mimeType)
        .header("Content-Length", avatar.buffer.length)
        .header("X-Content-Type-Options", "nosniff")
        .send(avatar.buffer);
    } catch {
      // No entity IDs, access hashes or Telegram error details belong in the HTTP response.
      return reply.status(404).send({ error: "Avatar not available" });
    }
  });
}
