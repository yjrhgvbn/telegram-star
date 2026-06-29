import type { FastifyInstance } from "fastify";
import {
  messageBatchReadResponseSchema,
  messageForceSyncReadResponseSchema,
  messageIdParamSchema,
  messageIdsInputSchema,
  messageListQuerySchema,
  messageListResponseSchema,
  messageReadStateResponseSchema,
  messageStatsSchema,
  readSyncLogsQuerySchema,
  readSyncLogsResponseSchema,
} from "@telegram-star/shared/contracts/messages";
import { formatValidationError } from "../../shared/validation/zod.js";
import { openMessageEventStream } from "./messageEventStream.js";
import {
  CursorMessageNotFoundError,
  MessageNotFoundError,
  forceSyncMessageRead,
  getMessageStats,
  listMessageReadSyncLogs,
  listMessages,
  markMessagesAsRead,
  toggleMessageRead,
} from "./messages.service.js";

function validationErrorMessage(error: unknown, fallback: string): string {
  return formatValidationError(error, fallback);
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/messages", async (request, reply) => {
    const queryResult = messageListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply
        .status(400)
        .send({ error: validationErrorMessage(queryResult.error, "Invalid message query") });
    }

    try {
      return messageListResponseSchema.parse(await listMessages(queryResult.data, request.log));
    } catch (error) {
      if (error instanceof CursorMessageNotFoundError) {
        return reply.status(404).send({ error: "Cursor message not found" });
      }
      throw error;
    }
  });

  app.patch("/api/messages/:id/read", async (request, reply) => {
    const paramsResult = messageIdParamSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply
        .status(400)
        .send({ error: validationErrorMessage(paramsResult.error, "Invalid message id") });
    }

    try {
      return messageReadStateResponseSchema.parse(
        await toggleMessageRead(paramsResult.data.id, request.log),
      );
    } catch (error) {
      if (error instanceof MessageNotFoundError) {
        return reply.status(404).send({ error: "Message not found" });
      }
      throw error;
    }
  });

  app.patch("/api/messages/batch-read", async (request, reply) => {
    const bodyResult = messageIdsInputSchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply
        .status(400)
        .send({ error: validationErrorMessage(bodyResult.error, "Invalid message ids") });
    }

    return messageBatchReadResponseSchema.parse(
      await markMessagesAsRead(bodyResult.data.ids, request.log),
    );
  });

  app.post("/api/messages/force-sync-read", async (request, reply) => {
    const bodyResult = messageIdsInputSchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply
        .status(400)
        .send({ error: validationErrorMessage(bodyResult.error, "Invalid message ids") });
    }

    return messageForceSyncReadResponseSchema.parse(
      await forceSyncMessageRead(bodyResult.data.ids),
    );
  });

  app.get("/api/messages/read-sync-logs", async (request, reply) => {
    const queryResult = readSyncLogsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        error: validationErrorMessage(queryResult.error, "Invalid read sync log query"),
      });
    }

    return readSyncLogsResponseSchema.parse(
      await listMessageReadSyncLogs(queryResult.data.limit ?? 100),
    );
  });

  app.get("/api/messages/stats", async () => {
    return messageStatsSchema.parse(await getMessageStats());
  });

  app.get("/api/messages/events", (request, reply) => {
    return openMessageEventStream(request, reply);
  });
}
