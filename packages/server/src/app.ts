import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "fs";
import type { ServerResponse } from "http";
import { resolve } from "path";
import { appConfig } from "./config.js";
import { setAppLogger } from "./shared/logging.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chats.js";
import { clientsRoutes } from "./modules/clients/clients.routes.js";
import { configRoutes } from "./modules/config/config.routes.js";
import { filterRoutes } from "./modules/filters/filters.routes.js";
import { filterGroupRoutes } from "./modules/filter-groups/filter-groups.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";
import { forwardTargetsRoutes } from "./modules/forward-targets/forward-targets.routes.js";
import { mediaRoutes } from "./modules/media/media.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";

interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  serveStatic?: boolean;
}

type QuietRequestKind = "client-heartbeat" | "media-thumb" | "message-events";

const SLOW_QUIET_REQUEST_MS = 2_000;

export function sanitizeRequestUrl(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?<redacted>`;
}

export function getQuietRequestKind(url: string): QuietRequestKind | null {
  const path = url.split("?", 1)[0];
  if (/^\/api\/clients\/[^/]+\/heartbeat$/.test(path)) return "client-heartbeat";
  if (/^\/api\/media\/[^/]+\/[^/]+\/thumb$/.test(path)) return "media-thumb";
  if (path === "/api/messages/events") return "message-events";
  return null;
}

function defaultLoggerOptions(): Exclude<FastifyServerOptions["logger"], boolean | undefined> {
  return {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-api-key",
        "apiHash",
        "session",
        "password",
        "phone",
        "code",
        "appriseUrl",
      ],
      censor: "[REDACTED]",
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: sanitizeRequestUrl(request.url),
          host: request.host,
          remoteAddress: request.ip,
          remotePort: request.socket.remotePort,
        };
      },
    },
  };
}

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(configRoutes);
  await app.register(authRoutes);
  await app.register(chatRoutes);
  await app.register(clientsRoutes, { prefix: "/api/clients" });
  await app.register(filterRoutes);
  await app.register(filterGroupRoutes, { prefix: "/api/filter-groups" });
  await app.register(messageRoutes);
  await app.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" });
  await app.register(mediaRoutes);
}

export function getStaticCacheControl(filePath: string): string {
  const normalizedPath = filePath.replaceAll("\\", "/");
  // index.html 必须每次校验，确保后端部署新 Web 产物后客户端能发现新版本。
  if (normalizedPath.endsWith("/index.html")) {
    return "no-cache";
  }
  // Vite assets 带 hash，适合长期缓存；内容变化会生成新文件名。
  if (normalizedPath.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function setStaticCacheHeaders(response: ServerResponse, filePath: string): void {
  response.setHeader("Cache-Control", getStaticCacheControl(filePath));
}

async function registerStaticFrontend(app: FastifyInstance): Promise<void> {
  const webDistPath = resolve(
    import.meta.dirname || new URL(".", import.meta.url).pathname,
    "../../web/dist",
  );

  if (!existsSync(webDistPath)) return;

  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/",
    setHeaders: setStaticCacheHeaders,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.header("Cache-Control", "no-cache").sendFile("index.html");
  });
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? defaultLoggerOptions(),
    // 高频、低价值请求改由下方 onResponse 按异常或慢请求采样记录。
    disableRequestLogging: (request) => getQuietRequestKind(request.url) !== null,
  });
  setAppLogger(app.log);

  app.addHook("onResponse", async (request, reply) => {
    const requestKind = getQuietRequestKind(request.url);
    if (!requestKind || requestKind === "message-events") return;

    const responseTimeMs = Math.round(reply.elapsedTime);
    const payload = {
      event: "http.quiet_request.completed",
      requestKind,
      method: request.method,
      url: sanitizeRequestUrl(request.url),
      statusCode: reply.statusCode,
      responseTimeMs,
    };

    if (reply.statusCode >= 500) {
      request.log.error(payload, "Quiet request failed");
      return;
    }
    if (responseTimeMs >= SLOW_QUIET_REQUEST_MS) {
      request.log.warn(payload, "Quiet request was slow");
      return;
    }
    if (reply.statusCode >= 400 && !(requestKind === "media-thumb" && reply.statusCode === 404)) {
      request.log.warn(payload, "Quiet request was rejected");
    }
  });

  await app.register(cors, {
    origin: appConfig.cors.origin === "*" ? true : appConfig.cors.origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      // API 默认不缓存；媒体缩略图等少数接口可在路由内显式设置更具体的私有缓存策略。
      if (!reply.getHeader("Cache-Control")) {
        reply.header("Cache-Control", "no-store");
      }
    } else {
      reply.header("Cache-Control", getStaticCacheControl(request.url));
    }
    return payload;
  });

  await registerApiRoutes(app);

  if (options.serveStatic ?? true) {
    await registerStaticFrontend(app);
  }

  return app;
}
