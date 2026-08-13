import type { FastifyBaseLogger } from "fastify";

/**
 * 后台任务共享的最小日志接口。
 *
 * 生产运行时由 createApp 注入 Fastify/Pino logger；直接运行单元测试或独立导入服务时，
 * fallback 仍能保留启动前的关键信息，避免日志初始化反过来阻断业务。
 */
export interface AppLogger {
  debug: (payload: unknown, message?: string) => void;
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
}

function writeFallback(
  method: "debug" | "info" | "warn" | "error",
  payload: unknown,
  message?: string,
): void {
  const normalizedPayload = payload instanceof Error
    ? { err: { name: payload.name, message: payload.message, stack: payload.stack } }
    : payload && typeof payload === "object"
      ? payload
      : { value: payload };
  // 独立脚本（例如 db:deploy）没有 Fastify 实例，也必须保持一行一个 JSON 事件。
  console[method](JSON.stringify(
    {
      level: method,
      time: new Date().toISOString(),
      ...(normalizedPayload as Record<string, unknown>),
      ...(message ? { msg: message } : {}),
    },
    (_key, value) => value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  ));
}

const fallbackLogger: AppLogger = {
  debug: (payload, message) => writeFallback("debug", payload, message),
  info: (payload, message) => writeFallback("info", payload, message),
  warn: (payload, message) => writeFallback("warn", payload, message),
  error: (payload, message) => writeFallback("error", payload, message),
};

let activeLogger: AppLogger = fallbackLogger;

/**
 * 稳定的日志代理。模块可在初始化前安全导入；每次调用都会转发给当前已注入的 logger，
 * 不会因为模块顶层缓存了具体 logger 实例而永久捕获 fallback。
 */
export const appLogger: AppLogger = {
  debug: (payload, message) => activeLogger.debug(payload, message),
  info: (payload, message) => activeLogger.info(payload, message),
  warn: (payload, message) => activeLogger.warn(payload, message),
  error: (payload, message) => activeLogger.error(payload, message),
};

export function setAppLogger(logger: FastifyBaseLogger): void {
  activeLogger = logger;
}
