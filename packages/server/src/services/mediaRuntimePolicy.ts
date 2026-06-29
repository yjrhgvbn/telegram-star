/**
 * 媒体下载运行时策略。
 * 这里不关心 Telegram 业务对象，只封装“同 key 请求合并”和“异步并发上限”这类易误改的控制流。
 */
export class PendingRequestRegistry<T> {
  private readonly pending = new Map<string, Promise<T>>();

  getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    let sourcePromise: Promise<T>;
    try {
      sourcePromise = create();
    } catch (error) {
      return Promise.reject(error);
    }

    const trackedPromise = sourcePromise.finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, trackedPromise);
    return trackedPromise;
  }

  clear(): void {
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }
}

export class AsyncSlotLimiter {
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("maxConcurrency must be a positive integer");
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  get active(): number {
    return this.activeCount;
  }

  get queued(): number {
    return this.waitQueue.length;
  }

  private async acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.activeCount -= 1;
    const next = this.waitQueue.shift();
    if (next) next();
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("download_thumb_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
