import { LogLevel, Logger } from "telegram/extensions/Logger.js";
import { appLogger } from "../../shared/logging.js";

const GRAMJS_LEVEL = process.env.GRAMJS_LOG_LEVEL === "debug"
  ? LogLevel.DEBUG
  : process.env.GRAMJS_LOG_LEVEL === "info"
    ? LogLevel.INFO
    : process.env.GRAMJS_LOG_LEVEL === "none"
      ? LogLevel.NONE
      : LogLevel.WARN;

/** 将 GramJS 的彩色控制台文本归一化为应用单行 JSON。 */
export class StructuredGramJsLogger extends Logger {
  constructor() {
    super(GRAMJS_LEVEL);
  }

  override log(level: LogLevel, message: string): void {
    const payload = { event: "telegram.gramjs", component: "gramjs", gramjsLevel: level };
    if (level === LogLevel.ERROR) {
      appLogger.error(payload, message);
    } else if (level === LogLevel.WARN) {
      appLogger.warn(payload, message);
    } else if (level === LogLevel.DEBUG) {
      appLogger.debug(payload, message);
    } else {
      appLogger.info(payload, message);
    }
  }
}
