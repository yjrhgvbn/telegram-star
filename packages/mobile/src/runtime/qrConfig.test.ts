import { describe, expect, it } from "vitest";
import {
  buildMobileConfigPayload,
  parseMobileQrConfig,
} from "./qrConfig";

describe("mobile qr config", () => {
  it("accepts direct server urls", () => {
    expect(parseMobileQrConfig("https://star.example.com/api/")).toEqual({
      serverUrl: "https://star.example.com",
    });
  });

  it("accepts Telegram Star configure deeplinks", () => {
    expect(
      parseMobileQrConfig(
        "telegram-star://configure?serverUrl=https%3A%2F%2Fstar.example.com%2Fapi",
      ),
    ).toEqual({
      serverUrl: "https://star.example.com",
    });
  });

  it("accepts json config payloads", () => {
    const payload = buildMobileConfigPayload("http://192.168.1.20:3000/api/");

    expect(parseMobileQrConfig(payload)).toEqual({
      serverUrl: "http://192.168.1.20:3000",
    });
  });

  it("rejects unsupported protocols and malformed payloads", () => {
    expect(parseMobileQrConfig("file:///etc/passwd")).toBeNull();
    expect(parseMobileQrConfig("{bad json")).toBeNull();
  });
});
