import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogLevel } from "telegram/extensions/Logger.js";

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../../shared/logging.js", () => ({ appLogger: log }));
import { StructuredGramJsLogger } from "./gramJsLogger.js";

describe("GramJS log payload redaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["Type 1234 not found, remaining data PRIVATE_MESSAGE\nSESSION_SECRET", "Type 1234 not found; payload omitted"],
    ["Received response without parent request: PRIVATE_MESSAGE\nSESSION_SECRET", "Received response without parent request; payload omitted"],
  ])("omits raw bytes even with info logging enabled: %s", (input, expected) => {
    const logger = new StructuredGramJsLogger();
    logger.setLevel(LogLevel.INFO);
    logger.info(input);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ event: "telegram.gramjs" }), expected);
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("PRIVATE_MESSAGE");
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("SESSION_SECRET");
  });

  it("retains ordinary warnings", () => {
    const logger = new StructuredGramJsLogger();
    logger.setLevel(LogLevel.WARN);
    logger.warn("Connection closed while receiving data");
    expect(log.warn).toHaveBeenCalledWith(expect.any(Object), "Connection closed while receiving data");
  });
});
