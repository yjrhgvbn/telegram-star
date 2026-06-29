import { describe, expect, it } from "vitest";
import { AsyncSlotLimiter, PendingRequestRegistry, withTimeout } from "./mediaRuntimePolicy.js";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("mediaRuntimePolicy", () => {
  it("deduplicates in-flight requests by key and clears after settlement", async () => {
    const registry = new PendingRequestRegistry<string>();
    const deferred = createDeferred<string>();
    let createCount = 0;

    const first = registry.getOrCreate("thumb:1", () => {
      createCount += 1;
      return deferred.promise;
    });
    const second = registry.getOrCreate("thumb:1", () => {
      createCount += 1;
      return Promise.resolve("unexpected");
    });

    expect(first).toBe(second);
    expect(createCount).toBe(1);
    expect(registry.size).toBe(1);

    deferred.resolve("ok");
    await expect(first).resolves.toBe("ok");
    expect(registry.size).toBe(0);
  });

  it("limits concurrent async work and releases queued tasks", async () => {
    const limiter = new AsyncSlotLimiter(2);
    const gates = [createDeferred<void>(), createDeferred<void>(), createDeferred<void>()];
    let running = 0;
    let maxRunning = 0;

    const tasks = gates.map((gate, index) =>
      limiter.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await gate.promise;
        running -= 1;
        return index;
      }),
    );

    await Promise.resolve();
    expect(limiter.active).toBe(2);
    expect(limiter.queued).toBe(1);
    expect(maxRunning).toBe(2);

    gates[0].resolve();
    await tasks[0];
    await Promise.resolve();
    expect(limiter.active).toBe(2);
    expect(limiter.queued).toBe(0);

    gates[1].resolve();
    gates[2].resolve();
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2]);
    expect(limiter.active).toBe(0);
  });

  it("resolves fast promises and rejects timed-out promises", async () => {
    await expect(withTimeout(Promise.resolve("fast"), 20)).resolves.toBe("fast");
    await expect(withTimeout(new Promise<string>(() => {}), 1)).rejects.toThrow(
      "download_thumb_timeout",
    );
  });
});
