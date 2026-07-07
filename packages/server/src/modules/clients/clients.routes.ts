import type { FastifyPluginAsync } from "fastify";
import {
  clientDeviceIdParamSchema,
  clientDeviceRegisterInputSchema,
} from "@telegram-star/shared/contracts/clients";
import { formatValidationError } from "../../shared/validation/zod.js";
import {
  ClientDeviceNotFoundError,
  deleteClientDevice,
  heartbeatClientDevice,
  listClientDevices,
  registerClientDevice,
} from "./clients.service.js";

function routeErrorMessage(error: unknown, fallback: string): string {
  const validationMessage = formatValidationError(error, fallback);
  if (validationMessage !== fallback) return validationMessage;

  return error instanceof Error && error.message ? error.message : fallback;
}

function sendRouteError(reply: any, error: unknown, fallback: string) {
  if (error instanceof ClientDeviceNotFoundError) {
    return reply.status(404).send({ error: error.message });
  }

  return reply.status(400).send({ error: routeErrorMessage(error, fallback) });
}

export const clientsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    return listClientDevices();
  });

  fastify.post("/register", async (request, reply) => {
    try {
      const input = clientDeviceRegisterInputSchema.parse(request.body ?? {});
      return await registerClientDevice(input);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to register client device");
    }
  });

  fastify.patch("/:id/heartbeat", async (request, reply) => {
    try {
      const { id } = clientDeviceIdParamSchema.parse(request.params);
      return await heartbeatClientDevice(id);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to update client heartbeat");
    }
  });

  fastify.delete("/:id", async (request, reply) => {
    try {
      const { id } = clientDeviceIdParamSchema.parse(request.params);
      return await deleteClientDevice(id);
    } catch (error: unknown) {
      return sendRouteError(reply, error, "Failed to delete client device");
    }
  });
};
