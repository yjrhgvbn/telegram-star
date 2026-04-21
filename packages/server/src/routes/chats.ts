import type { FastifyInstance } from "fastify";
import { listJoinedChats, listSingleChatMessages } from "../services/telegram.js";

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/chats", async (request, reply) => {
    try {
      const chats = await listJoinedChats();
      return chats;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to load chats" });
    }
  });

  app.get<{
    Querystring: {
      chatId?: string;
      limit?: string;
    };
  }>("/api/chats/messages", async (request, reply) => {
    const chatId = request.query.chatId?.trim() || "";
    if (!chatId) {
      return reply.status(400).send({ error: "chatId is required" });
    }

    try {
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;
      const messages = await listSingleChatMessages({
        chatId,
        messageLimit: limit,
      });
      return {
        chatId,
        messages,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to load chat messages" });
    }
  });
}
