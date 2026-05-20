import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { backfillFilterHistory, previewHistoricalFilterMessages } from "../services/telegram.js";
import {
  parseConditions,
  serializeConditions,
  validateConditions,
  type FilterCondition,
} from "../services/filter-matching.js";

type HistoryScope = {
  perChatLimit?: number;
  totalLimit?: number;
};

function normalizeHistoryScope(scope?: HistoryScope): HistoryScope {
  return {
    perChatLimit: scope?.perChatLimit,
    totalLimit: scope?.totalLimit,
  };
}

function validateHistoryScope(scope: HistoryScope): { valid: boolean; error?: string } {
  return { valid: true };
}

function toApiFilter(row: {
  id: number;
  name: string;
  conditions: string;
  enabled: boolean;
  autoLocateUnreadNearRead: boolean;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    ...row,
    conditions: parseConditions(row.conditions),
  };
}

export async function filterRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { conditions: FilterCondition[] } & HistoryScope;
  }>("/api/filters/preview", async (request, reply) => {
    const validation = validateConditions(request.body.conditions);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const scope = normalizeHistoryScope(request.body);
    const scopeValidation = validateHistoryScope(scope);
    if (!scopeValidation.valid) {
      return reply.status(400).send({ error: scopeValidation.error });
    }

    try {
      // 预览接口与回拉接口共用同一套范围参数，避免两边行为不一致。
      const result = await previewHistoricalFilterMessages({
        conditions: request.body.conditions,
        perChatLimit: scope.perChatLimit,
        totalLimit: scope.totalLimit,
      });

      return {
        messages: result.messages,
        scannedChats: result.scannedChats,
        total: result.messages.length,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to preview filter history" });
    }
  });

  // Get all filters
  app.get("/api/filters", async () => {
    const rows = await db.filter.findMany({
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toApiFilter);
  });

  // Create filter
  app.post<{
    Body: { name: string; conditions: FilterCondition[]; autoLocateUnreadNearRead?: boolean };
  }>("/api/filters", async (request, reply) => {
    const { name, conditions, autoLocateUnreadNearRead } = request.body;
    if (!name?.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }

    if (autoLocateUnreadNearRead !== undefined && typeof autoLocateUnreadNearRead !== "boolean") {
      return reply.status(400).send({ error: "autoLocateUnreadNearRead must be a boolean" });
    }

    const validation = validateConditions(conditions);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const now = new Date().toISOString();

    const row = await db.filter.create({
      data: {
        name: name.trim(),
        conditions: serializeConditions(conditions),
        autoLocateUnreadNearRead: autoLocateUnreadNearRead ?? true,
        createdAt: now,
        updatedAt: now,
      },
    });

    return toApiFilter(row);
  });

  // Update filter
  app.put<{
    Params: { id: string };
    Body: { name?: string; conditions?: FilterCondition[]; autoLocateUnreadNearRead?: boolean };
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

    if (updates.autoLocateUnreadNearRead !== undefined && typeof updates.autoLocateUnreadNearRead !== "boolean") {
      return reply.status(400).send({ error: "autoLocateUnreadNearRead must be a boolean" });
    }

    const row = await db.filter.update({
      where: { id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
        ...(updates.conditions !== undefined
          ? {
              conditions: serializeConditions(updates.conditions),
            }
          : {}),
        ...(updates.autoLocateUnreadNearRead !== undefined
          ? { autoLocateUnreadNearRead: updates.autoLocateUnreadNearRead }
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

  app.post<{
    Params: { id: string };
    Body: HistoryScope;
  }>("/api/filters/:id/backfill", async (request, reply) => {
    const id = parseInt(request.params.id, 10);

    const existing = await db.filter.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Filter not found" });
    }

    const scope = normalizeHistoryScope(request.body);
    const scopeValidation = validateHistoryScope(scope);
    if (!scopeValidation.valid) {
      return reply.status(400).send({ error: scopeValidation.error });
    }

    try {
      return await backfillFilterHistory({
        filterId: existing.id,
        conditions: parseConditions(existing.conditions),
        perChatLimit: scope.perChatLimit,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to backfill filter history" });
    }
  });
}
