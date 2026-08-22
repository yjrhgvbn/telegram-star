import { describe, expect, it } from "vitest";
import {
  consumeBrowserStorageItem,
  getBrowserStorage,
  setBrowserStorageItem,
  type BrowserStorage,
  type BrowserStorageHost,
} from "./browser-storage";

function createMemoryStorage(initial: Record<string, string> = {}): BrowserStorage {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("browser storage compatibility", () => {
  it("returns the selected storage when the host allows access", () => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    const host = { localStorage, sessionStorage };

    expect(getBrowserStorage("local", host)).toBe(localStorage);
    expect(getBrowserStorage("session", host)).toBe(sessionStorage);
  });

  it("falls back when a restricted WebView throws while reading the property", () => {
    const blockedHost = Object.defineProperties({}, {
      localStorage: {
        get: () => {
          throw new DOMException("Blocked", "SecurityError");
        },
      },
      sessionStorage: {
        get: () => {
          throw new DOMException("Blocked", "SecurityError");
        },
      },
    }) as BrowserStorageHost;

    expect(getBrowserStorage("local", blockedHost)).toBeUndefined();
    expect(getBrowserStorage("session", blockedHost)).toBeUndefined();
  });

  it("safely writes and consumes one-shot values", () => {
    const storage = createMemoryStorage();

    expect(setBrowserStorageItem(storage, "jump", "42")).toBe(true);
    expect(consumeBrowserStorageItem(storage, "jump")).toBe("42");
    expect(consumeBrowserStorageItem(storage, "jump")).toBeNull();
  });

  it("absorbs failures from storage methods", () => {
    const brokenStorage: BrowserStorage = {
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

    expect(setBrowserStorageItem(brokenStorage, "jump", "42")).toBe(false);
    expect(consumeBrowserStorageItem(brokenStorage, "jump")).toBeNull();
  });
});
