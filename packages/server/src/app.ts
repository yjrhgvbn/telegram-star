import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "fs";
import type { ServerResponse } from "http";
import { resolve } from "path";
import { appConfig } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chats.js";
import { clientsRoutes } from "./modules/clients/clients.routes.js";
import { configRoutes } from "./modules/config/config.routes.js";
import { filterRoutes } from "./modules/filters/filters.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";
import { forwardTargetsRoutes } from "./modules/forward-targets/forward-targets.routes.js";
import { mediaRoutes } from "./modules/media/media.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";

interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  serveStatic?: boolean;
}

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(configRoutes);
  await app.register(authRoutes);
  await app.register(chatRoutes);
  await app.register(clientsRoutes, { prefix: "/api/clients" });
  await app.register(filterRoutes);
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
  const app = Fastify({ logger: options.logger ?? true });

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
