export type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface BrowserStorageHost {
  readonly localStorage: BrowserStorage;
  readonly sessionStorage: BrowserStorage;
}

export type BrowserStorageKind = "local" | "session";

function getDefaultStorageHost(): BrowserStorageHost | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/**
 * Accessing a Web Storage property can itself throw in restricted WebViews or
 * third-party frames, before any getItem/setItem call is made.
 */
export function getBrowserStorage(
  kind: BrowserStorageKind,
  host: BrowserStorageHost | undefined = getDefaultStorageHost(),
): BrowserStorage | undefined {
  if (!host) return undefined;

  try {
    return kind === "local" ? host.localStorage : host.sessionStorage;
  } catch {
    return undefined;
  }
}

export function setBrowserStorageItem(
  storage: BrowserStorage | undefined,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Reads and removes a one-shot value without allowing storage failures to escape. */
export function consumeBrowserStorageItem(
  storage: BrowserStorage | undefined,
  key: string,
): string | null {
  if (!storage) return null;

  try {
    const value = storage.getItem(key);
    if (value !== null) storage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
