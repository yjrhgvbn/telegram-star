import type { FastifyInstance } from "fastify";
import { listJoinedChats } from "../services/telegram.js";

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/chats", async (request, reply) => {
    try {
      const chats = await listJoinedChats();
      return chats;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to load chats" });
    }
  });
}
