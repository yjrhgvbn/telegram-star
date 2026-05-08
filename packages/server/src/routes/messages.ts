import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import { syncReadByTelegramInteractions } from "../services/telegram.js";

// 低频兜底：每 30s 最多对 Telegram 发起一次拉取式互动同步，
// 实时链路（Real-time Reaction 监听）会先捕获大多数场景。
const INTERACTION_SYNC_INTERVAL_MS = 30_000;
let lastInteractionSyncMs = 0;

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
        orderBy: { messageDate: "desc" },
        take: limit,
        skip: offset,
      }),
      db.message.count({ where }),
    ]);

    const interactedReadIds = await (async () => {
      const now = Date.now();
      if (now - lastInteractionSyncMs < INTERACTION_SYNC_INTERVAL_MS) {
        // 距上次同步不足 30s，跳过（实时 Reaction 监听已覆盖大多数场景）
        return new Set<number>();
      }
      lastInteractionSyncMs = now;
      return syncReadByTelegramInteractions(
        data.map((row) => ({
          id: row.id,
          chatId: row.chatId,
          telegramMessageId: row.telegramMessageId,
          isRead: row.isRead,
        })),
      );
    })();

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
        isRead: interactedReadIds.has(row.id) ? true : row.isRead,
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
