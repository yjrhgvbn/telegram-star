import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";

type FilterConditionType = "keyword" | "group" | "channel";

interface FilterCondition {
  type: FilterConditionType;
  values: string[];
}

function parseConditions(raw: string): FilterCondition[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        type: item.type,
        values: Array.isArray(item.values)
          ? item.values.filter((v: unknown) => typeof v === "string").map((v: string) => v.trim()).filter(Boolean)
          : [],
      }))
      .filter((item): item is FilterCondition => (
        (item.type === "keyword" || item.type === "group" || item.type === "channel") &&
        item.values.length > 0
      ));
  } catch {
    return [];
  }
}

function validateConditions(conditions: FilterCondition[]): { valid: boolean; error?: string } {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return { valid: false, error: "conditions is required" };
  }

  for (const condition of conditions) {
    if (!["keyword", "group", "channel"].includes(condition.type)) {
      return { valid: false, error: "condition.type must be keyword, group, or channel" };
    }
    if (!Array.isArray(condition.values) || condition.values.length === 0) {
      return { valid: false, error: "condition.values must be a non-empty array" };
    }
    if (condition.values.some((v) => typeof v !== "string" || !v.trim())) {
      return { valid: false, error: "condition.values must contain non-empty strings" };
    }
  }

  return { valid: true };
}

function toApiFilter(row: {
  id: number;
  name: string;
  conditions: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    ...row,
    conditions: parseConditions(row.conditions),
  };
}

export async function filterRoutes(app: FastifyInstance): Promise<void> {
  // Get all filters
  app.get("/api/filters", async () => {
    const rows = await db.filter.findMany({
      orderBy: { createdAt: "asc" },
    });

    return rows.map(toApiFilter);
  });

  // Create filter
  app.post<{
    Body: { name: string; conditions: FilterCondition[] };
  }>("/api/filters", async (request, reply) => {
    const { name, conditions } = request.body;
    if (!name?.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }

    const validation = validateConditions(conditions);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const now = new Date().toISOString();

    const row = await db.filter.create({
      data: {
        name: name.trim(),
        conditions: JSON.stringify(
          conditions.map((condition) => ({
            type: condition.type,
            values: condition.values.map((v) => v.trim()).filter(Boolean),
          }))
        ),
        createdAt: now,
        updatedAt: now,
      },
    });

    return toApiFilter(row);
  });

  // Update filter
  app.put<{
    Params: { id: string };
    Body: { name?: string; conditions?: FilterCondition[] };
  }>("/api/filters/:id", async (request, reply) => {
    const id = parseInt(request.params.id);
    const updates = request.body;

    const existing = await db.filter.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Filter not found" });
    }

    if (updates.conditions !== undefined) {
      const validation = validateConditions(updates.conditions);
      if (!validation.valid) {
        return reply.status(400).send({ error: validation.error });
      }
    }

    const row = await db.filter.update({
      where: { id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
        ...(updates.conditions !== undefined
          ? {
              conditions: JSON.stringify(
                updates.conditions.map((condition) => ({
                  type: condition.type,
                  values: condition.values.map((v) => v.trim()).filter(Boolean),
                }))
              ),
            }
          : {}),
        updatedAt: new Date().toISOString(),
      },
    });

    return toApiFilter(row);
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

    const row = await db.filter.update({
      where: { id },
      data: {
        enabled: !existing.enabled,
        updatedAt: new Date().toISOString(),
      },
    });

    return toApiFilter(row);
  });
}
