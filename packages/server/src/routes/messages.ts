import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import { appConfig } from "../config.js";
import { syncReadByTelegramInteractions } from "../services/telegram.js";
import { subscribeToMessageEvents, emitMessageEvent, type MessageEventPayload } from "../services/messageEvents.js";
import { listReadSyncLogs, writeReadSyncLog } from "../services/readSyncLog.js";

// 低频兜底：每 30s 最多对 Telegram 发起一次拉取式互动同步，
// 实时链路（Real-time Reaction 监听）会先捕获大多数场景。
const INTERACTION_SYNC_INTERVAL_MS = 30_000;
let lastInteractionSyncMs = 0;

/** include 子查询：关联 filter 名称 */
const MSG_INCLUDE = { matchedFilter: { select: { name: true } } } as const;

/** 将 DB row 格式化为 API 响应格式 */
function formatRow(row: Prisma.MessageGetPayload<{ include: typeof MSG_INCLUDE }>, interactedReadIds: Set<number>) {
  return {
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
    // 媒体元信息
    mediaType: row.mediaType ?? null,
    mediaFileName: row.mediaFileName ?? null,
    mediaFileSize: row.mediaFileSize ?? null,
    mediaMimeType: row.mediaMimeType ?? null,
    mediaDuration: row.mediaDuration ?? null,
    mediaThumbBase64: row.mediaThumbBase64 ?? null,
    mediaExtra: row.mediaExtra ?? null,
  };
}

/** 构建基础过滤条件（不含游标） */
function buildBaseWhere(query: { isRead?: string; filterId?: string; search?: string }): Prisma.MessageWhereInput {
  const where: Prisma.MessageWhereInput = {};
  if (query.isRead !== undefined && query.isRead !== "") {
    where.isRead = query.isRead === "true";
  }
  if (query.filterId) {
    where.matchedFilterId = parseInt(query.filterId, 10);
  }
  if (query.search) {
    where.content = { contains: query.search };
  }
  return where;
}

/** 在当前 data 上做 Telegram 互动同步（含 30s 限流） */
async function runInteractionSync(
  data: Array<{ id: number; chatId: string; telegramMessageId: number; isRead: boolean }>,
  log: FastifyInstance["log"],
): Promise<Set<number>> {
  const now = Date.now();
  if (now - lastInteractionSyncMs < INTERACTION_SYNC_INTERVAL_MS) {
    log.debug({ elapsedMs: now - lastInteractionSyncMs }, "[ReadSync][fallback] skipped due to interval");
    return new Set<number>();
  }
  lastInteractionSyncMs = now;
  const markedIds = await syncReadByTelegramInteractions(data);
  log.info({ resultCount: data.length, markedCount: markedIds.size, markedIds: Array.from(markedIds) }, "[ReadSync][fallback] sync completed");
  return markedIds;
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/messages
   * 基于游标的双向分页，数据始终以 messageDate ASC（旧→新）顺序返回。
   *
   * 参数：
   *   cursorId    - 游标消息 ID（不传则返回最新 limit 条）
   *   direction   - before（加载更旧）| after（加载更新）| around（游标两侧各 limit/2）
   *   autoLocate  - "true" 时服务端自动计算锚点并以 around 模式加载，响应附带 anchorId
   *   limit       - 每次加载条数（默认 20）
   *   isRead      - 已读过滤（"true" | "false"）
   *   filterId    - 过滤器 ID
   *   search      - 内容关键词搜索
   *
   * 响应：{ data: Message[], hasOlder: boolean, hasNewer: boolean, anchorId?: number | null }
   * data 顺序为 ASC（旧→新），与页面渲染顺序一致。
   */
  app.get<{
    Querystring: {
      cursorId?: string;
      direction?: string;
      autoLocate?: string;
      limit?: string;
      isRead?: string;
      filterId?: string;
      search?: string;
    };
  }>("/api/messages", async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit || "20"), 100);
    const baseWhere = buildBaseWhere(request.query);

    // ── autoLocate：内联计算锚点 ─────────────────────────────────────────────
    // 锚点搜索不受 isRead 过滤影响，需在全量消息中找已读/未读边界
    let resolvedAnchorId: number | null | undefined = undefined;
    let direction = (request.query.direction ?? "before") as "before" | "after" | "around";
    let cursorId = request.query.cursorId ? parseInt(request.query.cursorId, 10) : undefined;

    if (request.query.autoLocate === "true" && cursorId === undefined) {
      const anchorBaseWhere = buildBaseWhere({
        filterId: request.query.filterId,
        search: request.query.search,
      });

      // 1. 找最近一条已读消息
      const mostRecentRead = await db.message.findFirst({
        where: { ...anchorBaseWhere, isRead: true },
        orderBy: [{ messageDate: "desc" }, { telegramMessageId: "desc" }],
      });

      if (!mostRecentRead) {
        // 无已读消息，锚点为最新未读
        const firstUnread = await db.message.findFirst({
          where: { ...anchorBaseWhere, isRead: false },
          orderBy: [{ messageDate: "desc" }, { telegramMessageId: "desc" }],
        });
        resolvedAnchorId = firstUnread?.id ?? null;
      } else {
        // 2. 找比最近已读更新的最近一条未读消息
        const newerUnread = await db.message.findFirst({
          where: {
            AND: [
              { ...anchorBaseWhere, isRead: false },
              {
                OR: [{ messageDate: { gt: mostRecentRead.messageDate } }, { messageDate: mostRecentRead.messageDate, telegramMessageId: { gt: mostRecentRead.telegramMessageId } }],
              },
            ],
          },
          orderBy: [{ messageDate: "asc" }, { telegramMessageId: "asc" }],
        });

        if (newerUnread) {
          resolvedAnchorId = newerUnread.id;
        } else {
          // 3. 若不存在更新的未读，则回退到最新的消息
          const latestUnread = await db.message.findFirst({
            where: { ...anchorBaseWhere },
            orderBy: [{ messageDate: "desc" }, { telegramMessageId: "desc" }],
          });
          resolvedAnchorId = latestUnread?.id ?? null;
        }
      }

      // 有锚点则切换为 around 模式
      if (resolvedAnchorId !== null) {
        cursorId = resolvedAnchorId;
        direction = "around";
      }
    }

    let rows: Prisma.MessageGetPayload<{ include: typeof MSG_INCLUDE }>[] = [];
    let hasOlder = false;
    let hasNewer = false;

    if (cursorId === undefined) {
      // 初始加载：获取最新 limit 条，结果翻转为 ASC 顺序
      const raw = await db.message.findMany({
        where: baseWhere,
        include: MSG_INCLUDE,
        orderBy: [{ messageDate: "desc" }, { telegramMessageId: "desc" }],
        take: limit + 1, // 多取一条判断是否有更旧
      });
      hasOlder = raw.length > limit;
      hasNewer = false; // 已在最新位置
      rows = (hasOlder ? raw.slice(0, limit) : raw).reverse();
    } else {
      // 需要游标消息的 messageDate 用于复合排序
      const cursorMsg = await db.message.findUnique({ where: { id: cursorId } });
      if (!cursorMsg) {
        return reply.status(404).send({ error: "Cursor message not found" });
      }
      const cursorDate = cursorMsg.messageDate;
      const cursorTelegramMsgId = cursorMsg.telegramMessageId;

      if (direction === "before") {
        // 加载比游标更旧的消息（DESC 排序，取前 limit 条，再翻转为 ASC）
        const raw = await db.message.findMany({
          where: {
            AND: [
              baseWhere,
              {
                OR: [{ messageDate: { lt: cursorDate } }, { messageDate: cursorDate, telegramMessageId: { lt: cursorTelegramMsgId } }],
              },
            ],
          },
          include: MSG_INCLUDE,
          orderBy: [{ messageDate: "desc" }, { telegramMessageId: "desc" }],
          take: limit + 1,
        });
        hasOlder = raw.length > limit;
        hasNewer = true; // 游标存在，必有更新
        rows = (hasOlder ? raw.slice(0, limit) : raw).reverse();
      } else if (direction === "after") {
        // 加载比游标更新的消息（ASC 排序，直接 append）
        const raw = await db.message.findMany({
          where: {
            AND: [
              baseWhere,
              {
                OR: [{ messageDate: { gt: cursorDate } }, { messageDate: cursorDate, telegramMessageId: { gt: cursorTelegramMsgId } }],
              },
            ],
          },
          include: MSG_INCLUDE,
          orderBy: [{ messageDate: "asc" }, { telegramMessageId: "asc" }],
          take: limit + 1,
        });
        hasNewer = raw.length > limit;
        hasOlder = true; // 游标存在，必有更旧
        rows = hasNewer ? raw.slice(0, limit) : raw;
      } else {
        // around：游标两侧各取 halfLimit 条，包含游标消息自身
        const halfLimit = Math.floor(limit / 2);

        const [beforeRaw, afterRaw, cursorMsgFull] = await Promise.all([
          db.message.findMany({
            where: {
              AND: [
                baseWhere,
                {
                  OR: [{ messageDate: { lt: cursorDate } }, { messageDate: cursorDate, telegramMessageId: { lt: cursorTelegramMsgId } }],
                },
              ],
            },
            include: MSG_INCLUDE,
            orderBy: [{ messageDate: "desc" }, { telegramMessageId: "desc" }],
            take: halfLimit + 1,
          }),
          db.message.findMany({
            where: {
              AND: [
                baseWhere,
                {
                  OR: [{ messageDate: { gt: cursorDate } }, { messageDate: cursorDate, telegramMessageId: { gt: cursorTelegramMsgId } }],
                },
              ],
            },
            include: MSG_INCLUDE,
            orderBy: [{ messageDate: "asc" }, { telegramMessageId: "asc" }],
            take: halfLimit + 1,
          }),
          db.message.findUnique({ where: { id: cursorId }, include: MSG_INCLUDE }),
        ]);

        hasOlder = beforeRaw.length > halfLimit;
        hasNewer = afterRaw.length > halfLimit;
        const before = (hasOlder ? beforeRaw.slice(0, halfLimit) : beforeRaw).reverse();
        const after = hasNewer ? afterRaw.slice(0, halfLimit) : afterRaw;
        rows = cursorMsgFull ? [...before, cursorMsgFull, ...after] : [...before, ...after];
      }
    }

    // Telegram 互动同步（30s 兜底，去重后标记已读）
    const interactedReadIds = await runInteractionSync(
      rows.map((r) => ({ id: r.id, chatId: r.chatId, telegramMessageId: r.telegramMessageId, isRead: r.isRead })),
      request.log,
    );

    return {
      data: rows.map((row) => formatRow(row, interactedReadIds)),
      hasOlder,
      hasNewer,
      // 仅 autoLocate 请求时返回该字段
      ...(resolvedAnchorId !== undefined ? { anchorId: resolvedAnchorId } : {}),
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

    request.log.info(
      {
        id,
        previousIsRead: existing.isRead,
        nextIsRead: updated.isRead,
        source: "manual-toggle",
      },
      "[ReadSync][manual] toggled read state",
    );
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

    request.log.info(
      {
        idsCount: ids.length,
        ids,
        source: "manual-batch",
      },
      "[ReadSync][manual] batch marked as read",
    );
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

    emitMessageEvent({ type: "read", messageIds: ids });
    return { success: true, count: ids.length };
  });

  // Force sync read status from Telegram for specific messages (bypasses the 30s interval)
  app.post<{ Body: { ids: number[] } }>("/api/messages/force-sync-read", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: "ids array is required" });
    }

    const unreadMessages = await db.message.findMany({
      where: { id: { in: ids }, isRead: false },
      select: { id: true, chatId: true, telegramMessageId: true, isRead: true },
    });

    if (unreadMessages.length === 0) {
      return { markedIds: [] };
    }

    const markedIds = await syncReadByTelegramInteractions(unreadMessages);

    if (markedIds.size > 0) {
      emitMessageEvent({ type: "read", messageIds: Array.from(markedIds) });
    }

    return { markedIds: Array.from(markedIds) };
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

    const send = (payload: MessageEventPayload) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
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
    return new Promise<void>(() => { });
  });
}
