import Fastify, { type FastifyInstance } from "fastify";

export async function createRouteTestApp(
  registerRoutes: (app: FastifyInstance) => void | Promise<void>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerRoutes(app);
  await app.ready();
  return app;
}

export function parseJson<T>(payload: string): T {
  return JSON.parse(payload) as T;
}
