import type { FastifyReply, FastifyRequest } from "fastify";
import { messageEventPayloadSchema } from "@telegram-star/shared/contracts/messages";
import { appConfig } from "../../config.js";
import {
  subscribeToMessageEvents,
  type MessageEventPayload,
} from "../../services/messageEvents.js";

/**
 * 打开消息 SSE 流。
 *
 * writeHead 会绕过常规 Fastify response 生命周期，因此 CORS 与代理缓冲头在这里集中维护。
 */
export function openMessageEventStream(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const connectedAtMs = Date.now();
  const requestedOrigin = request.headers.origin;
  const origin = requestedOrigin && (appConfig.cors.origin === "*" || requestedOrigin === appConfig.cors.origin) ? requestedOrigin : undefined;
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Referrer-Policy": "no-referrer",
  });
  reply.raw.flushHeaders();

  const send = (payload: MessageEventPayload) => {
    if (!reply.raw.writableEnded) {
      try {
        if (!reply.raw.write(`data: ${JSON.stringify(messageEventPayloadSchema.parse(payload))}\n\n`)) reply.raw.end();
      } catch { reply.raw.destroy(); }
    }
  };

  const unsubscribe = subscribeToMessageEvents(send);

  request.log.info(
    { event: "sse.message_events.connected" },
    "Message event stream connected",
  );

  const keepAlive = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(": keep-alive\n\n");
      return;
    }
    clearInterval(keepAlive);
  }, 25_000);

  reply.raw.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    request.log.info(
      {
        event: "sse.message_events.disconnected",
        durationMs: Date.now() - connectedAtMs,
      },
      "Message event stream disconnected",
    );
  });

  // Fastify 需要一个不结束的 Promise 来维持 SSE 连接。
  return new Promise<void>((resolve) => reply.raw.once("close", resolve));
}
