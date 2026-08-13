import { describe, expect, it, vi } from "vitest";
import { appLogger, setAppLogger } from "./logging.js";

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("appLogger", () => {
  it("forwards each call to the logger that is currently injected", () => {
    const first = createLogger();
    const second = createLogger();

    setAppLogger(first as never);
    appLogger.info({ event: "first" }, "first logger");

    setAppLogger(second as never);
    appLogger.info({ event: "second" }, "second logger");

    expect(first.info).toHaveBeenCalledOnce();
    expect(first.info).toHaveBeenCalledWith({ event: "first" }, "first logger");
    expect(second.info).toHaveBeenCalledOnce();
    expect(second.info).toHaveBeenCalledWith({ event: "second" }, "second logger");
  });
});
