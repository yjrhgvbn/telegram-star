import type { FastifyInstance } from "fastify";
import {
  appConfigStatusSchema,
  appConfigUpdateSchema,
} from "@telegram-star/shared/contracts/config";
import { formatValidationError } from "../../shared/validation/zod.js";
import { getConfigStatus, updateConfig } from "./config.service.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async () => {
    return appConfigStatusSchema.parse(await getConfigStatus());
  });

  app.put<{
    Body: unknown;
  }>(
    "/api/config",
    async (request, reply) => {
      try {
        const input = appConfigUpdateSchema.parse(request.body ?? {});
        return appConfigStatusSchema.parse(await updateConfig(input));
      } catch (err: any) {
        return reply.status(400).send({
          error: formatValidationError(err, err.message || "Invalid config"),
        });
      }
    },
  );
}
