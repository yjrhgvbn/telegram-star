import type { FastifyInstance } from "fastify";
import {
  filterCreateInputSchema,
  filterHistoryScopeSchema,
  filterIdParamSchema,
  filterPreviewInputSchema,
  filterUpdateInputSchema,
} from "@telegram-star/shared/contracts/filters";
import { formatValidationError } from "../../shared/validation/zod.js";
import {
  FilterNotFoundError,
  backfillFilter,
  createFilter,
  deleteFilter,
  listFilters,
  previewFilterHistory,
  toggleFilter,
  updateFilter,
} from "./filters.service.js";

function routeErrorMessage(error: unknown, fallback: string): string {
  const validationMessage = formatValidationError(error, fallback);
  if (validationMessage !== fallback) return validationMessage;

  return error instanceof Error && error.message ? error.message : fallback;
}

function sendRouteError(reply: any, error: unknown, fallback: string) {
  if (error instanceof FilterNotFoundError) {
    return reply.status(404).send({ error: error.message });
  }

  return reply.status(400).send({ error: routeErrorMessage(error, fallback) });
}

export async function filterRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/filters/preview", async (request, reply) => {
    try {
      const input = filterPreviewInputSchema.parse(request.body ?? {});
      return await previewFilterHistory(input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to preview filter history");
    }
  });

  app.get("/api/filters", async () => {
    return listFilters();
  });

  app.post("/api/filters", async (request, reply) => {
    try {
      const input = filterCreateInputSchema.parse(request.body ?? {});
      return await createFilter(input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to create filter");
    }
  });

  app.put("/api/filters/:id", async (request, reply) => {
    try {
      const { id } = filterIdParamSchema.parse(request.params);
      const input = filterUpdateInputSchema.parse(request.body ?? {});
      return await updateFilter(id, input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to update filter");
    }
  });

  app.delete("/api/filters/:id", async (request, reply) => {
    try {
      const { id } = filterIdParamSchema.parse(request.params);
      return await deleteFilter(id);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to delete filter");
    }
  });

  app.patch("/api/filters/:id/toggle", async (request, reply) => {
    try {
      const { id } = filterIdParamSchema.parse(request.params);
      return await toggleFilter(id);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to toggle filter");
    }
  });

  app.post("/api/filters/:id/backfill", async (request, reply) => {
    try {
      const { id } = filterIdParamSchema.parse(request.params);
      const scope = filterHistoryScopeSchema.parse(request.body ?? {});
      return await backfillFilter(id, scope);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to backfill filter history");
    }
  });
}
