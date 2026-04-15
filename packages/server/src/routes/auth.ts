import type { FastifyInstance } from "fastify";
import {
  getConnectionStatus,
  sendCode,
  loginWithCode,
  logout,
} from "../services/telegram.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Get current auth status
  app.get("/api/auth/status", async () => {
    return getConnectionStatus();
  });

  // Send verification code
  app.post<{ Body: { phone: string } }>("/api/auth/send-code", async (request, reply) => {
    const { phone } = request.body;
    if (!phone) {
      return reply.status(400).send({ error: "Phone number is required" });
    }
    try {
      const result = await sendCode(phone);
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to send code" });
    }
  });

  // Login with code (and optional password for 2FA)
  app.post<{ Body: { phone: string; code: string; password?: string } }>(
    "/api/auth/login",
    async (request, reply) => {
      const { phone, code, password } = request.body;
      if (!phone || !code) {
        return reply.status(400).send({ error: "Phone and code are required" });
      }
      try {
        const result = await loginWithCode(phone, code, password);
        return result;
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || "Login failed" });
      }
    }
  );

  // Logout
  app.post("/api/auth/logout", async () => {
    await logout();
    return { status: "logged_out" };
  });
}
