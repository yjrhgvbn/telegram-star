import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import { appConfig } from "../config.js";
import { syncReadByTelegramInteractions } from "../services/telegram.js";
import { subscribeToMessageEvents, emitMessageEvent } from "../services/messageEvents.js";
import { listReadSyncLogs, writeReadSyncLog } from "../services/readSyncLog.js";

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
        request.log.debug({
          intervalMs: INTERACTION_SYNC_INTERVAL_MS,
          elapsedMs: now - lastInteractionSyncMs,
          page,
          limit,
          resultCount: data.length,
        }, "[ReadSync][fallback] skipped due to interval");
        return new Set<number>();
      }
      lastInteractionSyncMs = now;
      const markedIds = await syncReadByTelegramInteractions(
        data.map((row) => ({
          id: row.id,
          chatId: row.chatId,
          telegramMessageId: row.telegramMessageId,
          isRead: row.isRead,
        })),
      );
      request.log.info({
        page,
        limit,
        resultCount: data.length,
        markedCount: markedIds.size,
        markedIds: Array.from(markedIds),
      }, "[ReadSync][fallback] sync completed");
      return markedIds;
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

    const updated = await db.message.update({
      where: { id },
      data: { isRead: !existing.isRead },
    });

    request.log.info({
      id,
      previousIsRead: existing.isRead,
      nextIsRead: updated.isRead,
      source: "manual-toggle",
    }, "[ReadSync][manual] toggled read state");
    if (updated.isRead) {
      await writeReadSyncLog({
        level: "info",
        source: "手动操作",
        action: "标记已读",
        message: "通过手动切换将消息标记为已读",
        rowId: id,
        details: {
          之前状态: existing.isRead,
          当前状态: updated.isRead,
        },
      });
    }

    return updated;
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

    request.log.info({
      idsCount: ids.length,
      ids,
      source: "manual-batch",
    }, "[ReadSync][manual] batch marked as read");
    await writeReadSyncLog({
      level: "info",
      source: "手动操作",
      action: "批量标记已读",
      message: "通过手动批量操作将消息标记为已读",
      details: {
        标记数量: ids.length,
        标记ID列表: ids,
      },
    });

    emitMessageEvent("read");
    return { success: true, count: ids.length };
  });

  app.get<{ Querystring: { limit?: string } }>("/api/messages/read-sync-logs", async (request) => {
    const limit = parseInt(request.query.limit || "100", 10);
    const logs = await listReadSyncLogs(limit);
    return { data: logs };
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

  /**
   * SSE 端点：客户端订阅后，服务端在新消息入库或已读状态变更时立即推送事件，
   * 客户端收到后触发 SWR revalidate，替代固定间隔轮询。
   */
  app.get("/api/messages/events", (request, reply) => {
    const origin = request.headers.origin || appConfig.cors.origin;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // 禁止 Nginx/CDN 缓冲，确保事件实时送达
      "X-Accel-Buffering": "no",
      // 为 SSE 流显式设置 CORS 头（绕过 writeHead 后 CORS 中间件失效的问题）
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });
    reply.raw.flushHeaders();

    const send = (type: string) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${type}\n\n`);
      }
    };

    const unsubscribe = subscribeToMessageEvents(send);

    // 每 25s 发送一次注释保活，防止代理/浏览器因超时关闭连接
    const keepAlive = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(": keep-alive\n\n");
      } else {
        clearInterval(keepAlive);
      }
    }, 25_000);

    reply.raw.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });

    // 返回永不 resolve 的 Promise，让 Fastify 保持连接
    return new Promise<void>(() => {});
  });
}
