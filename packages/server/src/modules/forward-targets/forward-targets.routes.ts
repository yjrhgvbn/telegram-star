import type { FastifyPluginAsync } from "fastify";
import {
  forwardTargetCreateInputSchema,
  forwardTargetIdParamSchema,
  forwardTargetTestInputSchema,
  forwardTargetUpdateInputSchema,
} from "@telegram-star/shared/contracts/forward-targets";
import { formatValidationError } from "../../shared/validation/zod.js";
import {
  ForwardTargetNotFoundError,
  createForwardTarget,
  deleteForwardTarget,
  listForwardTargets,
  testForwardTarget,
  updateForwardTarget,
} from "./forward-targets.service.js";

function routeErrorMessage(error: unknown, fallback: string): string {
  const validationMessage = formatValidationError(error, fallback);
  if (validationMessage !== fallback) return validationMessage;

  return error instanceof Error && error.message ? error.message : fallback;
}

function sendRouteError(reply: any, error: unknown, fallback: string) {
  if (error instanceof ForwardTargetNotFoundError) {
    return reply.status(404).send({ error: error.message });
  }

  return reply.status(400).send({ error: routeErrorMessage(error, fallback) });
}

export const forwardTargetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    return listForwardTargets();
  });

  fastify.post("/", async (request, reply) => {
    try {
      const input = forwardTargetCreateInputSchema.parse(request.body ?? {});
      return await createForwardTarget(input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to create forward target");
    }
  });

  fastify.put("/:id", async (request, reply) => {
    try {
      const { id } = forwardTargetIdParamSchema.parse(request.params);
      const input = forwardTargetUpdateInputSchema.parse(request.body ?? {});
      return await updateForwardTarget(id, input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to update forward target");
    }
  });

  fastify.delete("/:id", async (request, reply) => {
    try {
      const { id } = forwardTargetIdParamSchema.parse(request.params);
      return await deleteForwardTarget(id);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to delete forward target");
    }
  });

  fastify.post("/test", async (request, reply) => {
    try {
      const input = forwardTargetTestInputSchema.parse(request.body ?? {});
      return await testForwardTarget(input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to test forward target");
    }
  });
};
