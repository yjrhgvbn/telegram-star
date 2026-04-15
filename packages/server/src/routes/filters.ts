import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { filters } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function filterRoutes(app: FastifyInstance): Promise<void> {
  // Get all filters
  app.get("/api/filters", async () => {
    const result = await db.select().from(filters).orderBy(filters.createdAt);
    return result;
  });

  // Create filter
  app.post<{
    Body: { name: string; type: "keyword" | "group" | "channel"; value: string };
  }>("/api/filters", async (request, reply) => {
    const { name, type, value } = request.body;
    if (!name || !type || !value) {
      return reply.status(400).send({ error: "name, type, and value are required" });
    }
    const result = await db
      .insert(filters)
      .values({ name, type, value })
      .returning();
    return result[0];
  });

  // Update filter
  app.put<{
    Params: { id: string };
    Body: { name?: string; type?: "keyword" | "group" | "channel"; value?: string };
  }>("/api/filters/:id", async (request, reply) => {
    const id = parseInt(request.params.id);
    const updates = request.body;

    const result = await db
      .update(filters)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(filters.id, id))
      .returning();

    if (result.length === 0) {
      return reply.status(404).send({ error: "Filter not found" });
    }
    return result[0];
  });

  // Delete filter
  app.delete<{ Params: { id: string } }>("/api/filters/:id", async (request, reply) => {
    const id = parseInt(request.params.id);
    const result = await db
      .delete(filters)
      .where(eq(filters.id, id))
      .returning();

    if (result.length === 0) {
      return reply.status(404).send({ error: "Filter not found" });
    }
    return { success: true };
  });

  // Toggle filter enabled/disabled
  app.patch<{ Params: { id: string } }>("/api/filters/:id/toggle", async (request, reply) => {
    const id = parseInt(request.params.id);

    const existing = await db
      .select()
      .from(filters)
      .where(eq(filters.id, id))
      .limit(1);

    if (existing.length === 0) {
      return reply.status(404).send({ error: "Filter not found" });
    }

    const result = await db
      .update(filters)
      .set({
        enabled: !existing[0].enabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(filters.id, id))
      .returning();

    return result[0];
  });
}
