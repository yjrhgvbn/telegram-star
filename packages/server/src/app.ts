import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "fs";
import { resolve } from "path";
import { appConfig } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chats.js";
import { configRoutes } from "./modules/config/config.routes.js";
import { filterRoutes } from "./modules/filters/filters.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";
import { forwardTargetsRoutes } from "./modules/forward-targets/forward-targets.routes.js";
import { mediaRoutes } from "./modules/media/media.routes.js";

interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  serveStatic?: boolean;
}

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(configRoutes);
  await app.register(authRoutes);
  await app.register(chatRoutes);
  await app.register(filterRoutes);
  await app.register(messageRoutes);
  await app.register(forwardTargetsRoutes, { prefix: "/api/forward-targets" });
  await app.register(mediaRoutes);
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
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: appConfig.cors.origin === "*" ? true : appConfig.cors.origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await registerApiRoutes(app);

  if (options.serveStatic ?? true) {
    await registerStaticFrontend(app);
  }

  return app;
}
