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
  chatIds?: string[];
  since?: string;
  until?: string;
};

function normalizeHistoryScope(scope?: HistoryScope): HistoryScope {
  const chatIds = Array.isArray(scope?.chatIds)
    ? scope?.chatIds.map((chatId) => chatId.trim()).filter(Boolean)
    : undefined;
  return {
    perChatLimit: scope?.perChatLimit,
    totalLimit: scope?.totalLimit,
    chatIds,
    since: scope?.since,
    until: scope?.until,
  };
}

function validateHistoryScope(scope: HistoryScope): { valid: boolean; error?: string } {
  // 路由层只做范围参数的格式与先后关系校验，具体扫描策略留给 service 层处理。
  const sinceTs = scope.since ? Date.parse(scope.since) : NaN;
  const untilTs = scope.until ? Date.parse(scope.until) : NaN;

  if (scope.since && Number.isNaN(sinceTs)) {
    return { valid: false, error: "since must be a valid datetime string" };
  }
  if (scope.until && Number.isNaN(untilTs)) {
    return { valid: false, error: "until must be a valid datetime string" };
  }
  if (!Number.isNaN(sinceTs) && !Number.isNaN(untilTs) && sinceTs > untilTs) {
    return { valid: false, error: "since must be less than or equal to until" };
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
        chatIds: scope.chatIds,
        since: scope.since,
        until: scope.until,
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
        conditions: serializeConditions(conditions),
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
              conditions: serializeConditions(updates.conditions),
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
        chatIds: scope.chatIds,
        since: scope.since,
        until: scope.until,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to backfill filter history" });
    }
  });
}
