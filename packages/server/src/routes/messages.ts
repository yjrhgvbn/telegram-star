import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { messages, filters } from "../db/schema.js";
import { eq, desc, and, like, sql, count } from "drizzle-orm";

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

    const conditions = [];

    // Filter by read status
    if (request.query.isRead !== undefined && request.query.isRead !== "") {
      conditions.push(eq(messages.isRead, request.query.isRead === "true"));
    }

    // Filter by filter ID
    if (request.query.filterId) {
      conditions.push(eq(messages.matchedFilterId, parseInt(request.query.filterId)));
    }

    // Search in content
    if (request.query.search) {
      conditions.push(like(messages.content, `%${request.query.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          message: messages,
          filterName: filters.name,
        })
        .from(messages)
        .leftJoin(filters, eq(messages.matchedFilterId, filters.id))
        .where(where)
        .orderBy(desc(messages.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(messages)
        .where(where),
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      data: data.map((row) => ({
        ...row.message,
        filterName: row.filterName,
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

    const existing = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);

    if (existing.length === 0) {
      return reply.status(404).send({ error: "Message not found" });
    }

    const result = await db
      .update(messages)
      .set({ isRead: !existing[0].isRead })
      .where(eq(messages.id, id))
      .returning();

    return result[0];
  });

  // Batch mark as read
  app.patch<{ Body: { ids: number[] } }>("/api/messages/batch-read", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: "ids array is required" });
    }

    for (const id of ids) {
      await db
        .update(messages)
        .set({ isRead: true })
        .where(eq(messages.id, id));
    }

    return { success: true, count: ids.length };
  });

  // Get statistics
  app.get("/api/messages/stats", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const [totalResult, unreadResult, todayResult] = await Promise.all([
      db.select({ count: count() }).from(messages),
      db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.isRead, false)),
      db
        .select({ count: count() })
        .from(messages)
        .where(sql`${messages.createdAt} >= ${todayStr}`),
    ]);

    return {
      total: totalResult[0]?.count || 0,
      unread: unreadResult[0]?.count || 0,
      today: todayResult[0]?.count || 0,
    };
  });
}
