import { describe, expect, it } from "vitest";
import {
  canUseServiceWorker,
  isInstalledUpdateReady,
} from "./serviceWorker";

describe("service worker helpers", () => {
  it("only enables service workers in production-capable browsers", () => {
    expect(canUseServiceWorker(undefined, true)).toBe(false);
    expect(canUseServiceWorker({ serviceWorker: {} } as Navigator, false)).toBe(false);
    expect(canUseServiceWorker({ serviceWorker: {} } as Navigator, true)).toBe(true);
  });

  it("reports update readiness only for installed workers controlling the page", () => {
    expect(isInstalledUpdateReady({ state: "installed" } as ServiceWorker, true)).toBe(true);
    expect(isInstalledUpdateReady({ state: "installing" } as ServiceWorker, true)).toBe(false);
    expect(isInstalledUpdateReady({ state: "installed" } as ServiceWorker, false)).toBe(false);
    expect(isInstalledUpdateReady(null, true)).toBe(false);
  });
});
