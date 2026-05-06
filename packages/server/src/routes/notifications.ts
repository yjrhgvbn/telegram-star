import type { FastifyInstance } from "fastify";
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "../services/notification-settings.js";

interface UpdateNotificationSettingsBody {
  sources?: string[];
  feishuWebhookUrl?: string;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/notifications/settings", async () => {
    return getNotificationSettings();
  });

  app.put<{ Body: UpdateNotificationSettingsBody }>(
    "/api/notifications/settings",
    async (request, reply) => {
      const body = request.body || {};

      if (body.sources !== undefined && !Array.isArray(body.sources)) {
        return reply.status(400).send({ error: "sources must be an array" });
      }

      if (
        body.sources !== undefined &&
        body.sources.some((item) => typeof item !== "string")
      ) {
        return reply
          .status(400)
          .send({ error: "sources must contain only strings" });
      }

      if (
        body.feishuWebhookUrl !== undefined &&
        typeof body.feishuWebhookUrl !== "string"
      ) {
        return reply
          .status(400)
          .send({ error: "feishuWebhookUrl must be a string" });
      }

      return updateNotificationSettings({
        sources: body.sources,
        feishuWebhookUrl: body.feishuWebhookUrl,
      });
    }
  );
}
