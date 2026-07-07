import { describe, expect, it } from "vitest";
import {
  clearDesktopShellStorage,
  getInitialServerUrl,
  isSupportedServerUrl,
  normalizeServerUrl,
  readSavedServerUrl,
  saveLastConnectedAt,
  saveServerUrl,
} from "./serverConfig";
import { buildRemoteAppUrl } from "./navigation";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("desktop server config", () => {
  it("normalizes root server urls", () => {
    expect(normalizeServerUrl(" https://star.example.com/api/ ")).toBe("https://star.example.com");
    expect(normalizeServerUrl("http://192.168.1.20:3000///")).toBe("http://192.168.1.20:3000");
    expect(normalizeServerUrl("")).toBe("");
  });

  it("accepts only http and https roots", () => {
    expect(isSupportedServerUrl("https://star.example.com")).toBe(true);
    expect(isSupportedServerUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isSupportedServerUrl("ftp://star.example.com")).toBe(false);
    expect(isSupportedServerUrl("star.example.com")).toBe(false);
  });

  it("stores only minimal local shell fields", () => {
    const storage = new MemoryStorage();

    saveServerUrl("https://star.example.com/api", storage);
    saveLastConnectedAt("2026-07-01T00:00:00.000Z", storage);

    expect(readSavedServerUrl(storage)).toBe("https://star.example.com");
    expect(getInitialServerUrl(storage)).toBe("https://star.example.com");

    clearDesktopShellStorage(storage);
    expect(readSavedServerUrl(storage)).toBeNull();
  });

  it("builds remote app urls without changing the saved root", () => {
    expect(buildRemoteAppUrl("https://star.example.com/api", 123)).toBe(
      "https://star.example.com/?desktopReload=123",
    );
  });
});
