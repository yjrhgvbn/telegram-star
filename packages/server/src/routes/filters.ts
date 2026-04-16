import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";

export async function filterRoutes(app: FastifyInstance): Promise<void> {
  // Get all filters
  app.get("/api/filters", async () => {
    return db.filter.findMany({
      orderBy: { createdAt: "asc" },
    });
  });

  // Create filter
  app.post<{
    Body: { name: string; type: "keyword" | "group" | "channel"; value: string };
  }>("/api/filters", async (request, reply) => {
    const { name, type, value } = request.body;
    if (!name || !type || !value) {
      return reply.status(400).send({ error: "name, type, and value are required" });
    }

    const now = new Date().toISOString();

    return db.filter.create({
      data: {
        name,
        type,
        value,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  // Update filter
  app.put<{
    Params: { id: string };
    Body: { name?: string; type?: "keyword" | "group" | "channel"; value?: string };
  }>("/api/filters/:id", async (request, reply) => {
    const id = parseInt(request.params.id);
    const updates = request.body;

    const existing = await db.filter.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Filter not found" });
    }

    return db.filter.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    });
  });

  // Delete filter
  app.delete<{ Params: { id: string } }>("/api/filters/:id", async (request, reply) => {
    const id = parseInt(request.params.id);

    const existing = await db.filter.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Filter not found" });
    }

    await db.filter.delete({ where: { id } });
    return { success: true };
  });

  // Toggle filter enabled/disabled
  app.patch<{ Params: { id: string } }>("/api/filters/:id/toggle", async (request, reply) => {
    const id = parseInt(request.params.id);

    const existing = await db.filter.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Filter not found" });
    }

    return db.filter.update({
      where: { id },
      data: {
        enabled: !existing.enabled,
        updatedAt: new Date().toISOString(),
      },
    });
  });
}
