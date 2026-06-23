import type { FastifyInstance } from "fastify";
import {
  getAppConfigStatus,
  saveAppConfig,
} from "../services/appConfig.js";
import { clearMediaCache } from "../services/mediaCache.js";
import { getClient, setClient, setConnected } from "../services/telegram.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async () => {
    return getAppConfigStatus();
  });

  app.put<{
    Body: {
      telegram?: { apiId?: number | string; apiHash?: string };
      media?: { thumbIndex?: number | string };
    };
  }>(
    "/api/config",
    async (request, reply) => {
      try {
        const result = await saveAppConfig(request.body ?? {});

        if (result.changed.telegram) {
          const client = getClient();
          if (!client?.connected) {
            setClient(null);
            setConnected(false);
          }
        }
        if (result.changed.media) {
          clearMediaCache();
        }

        return result.status;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message || "Invalid config" });
      }
    },
  );
}
