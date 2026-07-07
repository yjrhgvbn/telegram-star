import { describe, expect, it } from "vitest";
import {
  SERVER_CONFIG_STORAGE_KEY,
  clearSavedServerUrl,
  getRuntimeServerUrl,
  normalizeServerUrl,
  readSavedServerUrl,
  saveServerUrl,
  type ServerConfigStorage,
} from "./serverConfig";

function createMemoryStorage(initial: Record<string, string> = {}): ServerConfigStorage {
  const store = new Map(Object.entries(initial));

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

describe("normalizeServerUrl", () => {
  it("keeps empty input as same-origin mode", () => {
    expect(normalizeServerUrl("")).toBe("");
    expect(normalizeServerUrl("   ")).toBe("");
    expect(normalizeServerUrl(null)).toBe("");
  });

  it("removes trailing slashes", () => {
    expect(normalizeServerUrl("https://example.com///")).toBe("https://example.com");
  });

  it("removes a trailing /api segment", () => {
    expect(normalizeServerUrl("https://example.com/api")).toBe("https://example.com");
    expect(normalizeServerUrl("https://example.com/app/api/")).toBe("https://example.com/app");
  });
});

describe("serverConfig storage", () => {
  it("saves and reads a normalized server root url", () => {
    const storage = createMemoryStorage();

    saveServerUrl("https://example.com/api/", storage);

    expect(readSavedServerUrl(storage)).toBe("https://example.com");
  });

  it("saves an empty string as an explicit same-origin choice", () => {
    const storage = createMemoryStorage({ [SERVER_CONFIG_STORAGE_KEY]: "https://example.com" });

    saveServerUrl("", storage);

    expect(readSavedServerUrl(storage)).toBe("");
    expect(getRuntimeServerUrl(storage)).toBe("");
  });

  it("clears the saved server url", () => {
    const storage = createMemoryStorage({ [SERVER_CONFIG_STORAGE_KEY]: "https://example.com" });

    clearSavedServerUrl(storage);

    expect(readSavedServerUrl(storage)).toBeNull();
  });

  it("ignores unavailable storage", () => {
    const brokenStorage: ServerConfigStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readSavedServerUrl(brokenStorage)).toBeNull();
    expect(() => saveServerUrl("https://example.com", brokenStorage)).not.toThrow();
    expect(() => clearSavedServerUrl(brokenStorage)).not.toThrow();
  });
});
