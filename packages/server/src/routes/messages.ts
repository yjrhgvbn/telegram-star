import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import type { Prisma } from "../generated/prisma/client.js";

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // Get messages with pagination and filtering
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      isRead?: string;
      filterId?: string;
      search?: string;
    };
  }>("/api/messages", async (request) => {
    const page = parseInt(request.query.page || "1");
    const limit = parseInt(request.query.limit || "20");
    const offset = (page - 1) * limit;

    const where: Prisma.MessageWhereInput = {};

    // Filter by read status
    if (request.query.isRead !== undefined && request.query.isRead !== "") {
      where.isRead = request.query.isRead === "true";
    }

    // Filter by filter ID
    if (request.query.filterId) {
      where.matchedFilterId = parseInt(request.query.filterId, 10);
    }

    // Search in content
    if (request.query.search) {
      where.content = { contains: request.query.search };
    }

    const [data, totalResult] = await Promise.all([
      db.message.findMany({
        where,
        include: {
          matchedFilter: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.message.count({ where }),
    ]);

    const total = totalResult;

    return {
      data: data.map((row) => ({
        id: row.id,
        telegramMessageId: row.telegramMessageId,
        chatId: row.chatId,
        chatTitle: row.chatTitle,
        senderName: row.senderName,
        senderId: row.senderId,
        content: row.content,
        messageDate: row.messageDate,
        telegramLink: row.telegramLink,
        isRead: row.isRead,
        matchedFilterId: row.matchedFilterId,
        matchedKeyword: row.matchedKeyword,
        createdAt: row.createdAt,
        filterName: row.matchedFilter?.name ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Toggle read status (like = mark as read)
  app.patch<{ Params: { id: string } }>("/api/messages/:id/read", async (request, reply) => {
    const id = parseInt(request.params.id);

    const existing = await db.message.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Message not found" });
    }

    return db.message.update({
      where: { id },
      data: { isRead: !existing.isRead },
    });
  });

  // Batch mark as read
  app.patch<{ Body: { ids: number[] } }>("/api/messages/batch-read", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: "ids array is required" });
    }

    await db.message.updateMany({
      where: { id: { in: ids } },
      data: { isRead: true },
    });

    return { success: true, count: ids.length };
  });

  // Get statistics
  app.get("/api/messages/stats", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const [totalResult, unreadResult, todayResult] = await Promise.all([
      db.message.count(),
      db.message.count({ where: { isRead: false } }),
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) AS count
        FROM messages
        WHERE datetime(created_at) >= datetime(${todayStr})
      `,
    ]);

    return {
      total: totalResult,
      unread: unreadResult,
      today: Number(todayResult[0]?.count || 0),
    };
  });
}
