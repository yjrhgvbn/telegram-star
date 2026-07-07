import type { FastifyInstance } from "fastify";
import { healthStatusSchema } from "@telegram-star/shared/contracts/health";
import { getHealthStatus } from "./health.service.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    return healthStatusSchema.parse(await getHealthStatus());
  });
}
