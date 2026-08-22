import type { FastifyPluginAsync } from "fastify";
import {
  filterGroupCreateInputSchema,
  filterGroupIdParamSchema,
  filterGroupOrderInputSchema,
  filterGroupUpdateInputSchema,
} from "@telegram-star/shared/contracts/filter-groups";
import { formatValidationError } from "../../shared/validation/zod.js";
import {
  FilterGroupNameConflictError,
  FilterGroupNotFoundError,
  createFilterGroup,
  deleteFilterGroup,
  getFilterGroupLayout,
  listFilterGroups,
  reorderFilterGroups,
  updateFilterGroup,
} from "./filter-groups.service.js";

function routeErrorMessage(error: unknown, fallback: string): string {
  const validationMessage = formatValidationError(error, fallback);
  if (validationMessage !== fallback) return validationMessage;
  return error instanceof Error && error.message ? error.message : fallback;
}

function sendRouteError(reply: any, error: unknown, fallback: string) {
  if (error instanceof FilterGroupNotFoundError) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof FilterGroupNameConflictError) {
    return reply.status(409).send({ error: error.message });
  }
  return reply.status(400).send({ error: routeErrorMessage(error, fallback) });
}

export const filterGroupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => listFilterGroups());
  app.get("/layout", async () => getFilterGroupLayout());

  app.post("/", async (request, reply) => {
    try {
      return await createFilterGroup(filterGroupCreateInputSchema.parse(request.body ?? {}));
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to create filter group");
    }
  });

  app.put("/order", async (request, reply) => {
    try {
      return await reorderFilterGroups(filterGroupOrderInputSchema.parse(request.body ?? {}));
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to reorder filter groups");
    }
  });

  app.patch("/:id", async (request, reply) => {
    try {
      const { id } = filterGroupIdParamSchema.parse(request.params);
      const input = filterGroupUpdateInputSchema.parse(request.body ?? {});
      return await updateFilterGroup(id, input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to update filter group");
    }
  });

  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = filterGroupIdParamSchema.parse(request.params);
      return await deleteFilterGroup(id);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to delete filter group");
    }
  });
};
