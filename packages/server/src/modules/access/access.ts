import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

const SESSION_MS = 12 * 60 * 60 * 1000;
const ASSET_MS = 5 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ASSET_PATH = /^\/api\/(?:messages\/events|messages\/\d+\/avatar|media\/[^/]+\/\d+\/thumb)$/;
interface Claims { scope: "session" | "assets"; exp: number; nonce: string }

export function assertAccessConfiguration(password: string): void {
  // Leaving the password unset explicitly disables application access protection.
  if (password && password.length < 16) throw new Error("APP_ACCESS_PASSWORD must contain at least 16 characters");
}

/** Independent application access; Telegram authorization never grants API access. */
export function registerAccessProtection(app: FastifyInstance, password: string): void {
  const required = password.length > 0;
  const expected = createHash("sha256").update(password).digest();
  const signingKey = scryptSync(password || randomBytes(32).toString("hex"), "telegram-star:access:v1", 32);
  const attempts = new Map<string, { count: number; until: number }>();
  let globalWindow = { count: 0, until: 0 };
  const signature = (text: string) => createHmac("sha256", signingKey).update(text).digest();
  const issue = (scope: Claims["scope"], lifetime: number) => {
    const expiresAt = Date.now() + lifetime;
    const payload = Buffer.from(JSON.stringify({ scope, exp: expiresAt, nonce: randomBytes(16).toString("hex") })).toString("base64url");
    return { token: `${payload}.${signature(payload).toString("base64url")}`, expiresAt };
  };
  const verify = (token: string | undefined, scope: Claims["scope"]): Claims | null => {
    if (!token || token.length > 1024) return null;
    const [payload, signed, extra] = token.split(".");
    if (!payload || !signed || extra) return null;
    const actual = Buffer.from(signed, "base64url");
    const wanted = signature(payload);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
      return claims.scope === scope && Number.isSafeInteger(claims.exp) && claims.exp > Date.now() ? claims : null;
    } catch { return null; }
  };
  const session = (request: FastifyRequest) => {
    const authorization = request.headers.authorization;
    return verify(authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined, "session");
  };
  const tokens = () => {
    const main = issue("session", SESSION_MS);
    const assets = issue("assets", ASSET_MS);
    return { token: main.token, expiresAt: main.expiresAt, assetToken: assets.token, assetExpiresAt: assets.expiresAt };
  };

  app.addHook("onRequest", async (request, reply) => {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    if (!path.startsWith("/api/") || path === "/api/health" || path === "/api/access/status" ||
        path === "/api/access/login" || request.method === "OPTIONS" || !required) return;
    const claims = session(request) ?? (request.method === "GET" && ASSET_PATH.test(path)
      ? verify(url.searchParams.get("asset_token") ?? undefined, "assets") : null);
    if (!claims) return reply.code(401).send({ error: "请先输入后台访问密码", code: "APP_ACCESS_REQUIRED" });
    if (path === "/api/messages/events") {
      // A stream cannot outlive the credential used to open it.
      const timer = setTimeout(() => reply.raw.end(), Math.max(1, claims.exp - Date.now()));
      timer.unref();
      reply.raw.once("close", () => clearTimeout(timer));
    }
  });
  app.get("/api/access/status", async (request) => ({ required, authorized: !required || Boolean(session(request)) }));
  app.post<{ Body: { password?: unknown } }>("/api/access/login", { bodyLimit: 2048 }, async (request, reply) => {
    const now = Date.now();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    if (globalWindow.until <= now) globalWindow = { count: 0, until: now + 60_000 };
    const entry = attempts.get(request.ip) ?? { count: 0, until: now + ATTEMPT_WINDOW_MS };
    if (entry.count >= 10 || globalWindow.count >= 100 || attempts.size >= 10_000) {
      return reply.header("Retry-After", "60").code(429).send({ error: "尝试次数过多，请稍后再试" });
    }
    const candidate = typeof request.body?.password === "string" ? request.body.password : "";
    globalWindow.count += 1;
    const actual = createHash("sha256").update(candidate).digest();
    if (required && !timingSafeEqual(actual, expected)) {
      attempts.set(request.ip, { count: entry.count + 1, until: entry.until });
      return reply.code(401).send({ error: "后台访问密码不正确" });
    }
    attempts.delete(request.ip);
    return tokens();
  });
  // Asset-only tickets are short lived and cannot authorize management requests.
  app.post("/api/access/assets", async () => {
    const assets = issue("assets", ASSET_MS);
    return { assetToken: assets.token, assetExpiresAt: assets.expiresAt };
  });
}
