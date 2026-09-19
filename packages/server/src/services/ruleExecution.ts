import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface IsolatedRuleResult {
  matched: boolean;
  legacyMatchedText: string | null;
  matchedValues: string[];
  matchedTexts: string[];
}

const MAX_ACTIVE = 2;
const MAX_PENDING = 128;
const MAX_INPUT_BYTES = 128 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const WALL_TIMEOUT_MS = 2_000;
const activeChildren = new Set<ChildProcessWithoutNullStreams>();
let active = 0;
let stopping = false;
const pending: Array<{ resolve: () => void; reject: (reason: Error) => void }> = [];

// No host objects or callbacks are exposed to QuickJS. The child receives only JSON,
// a fresh runtime per request, and no inherited credentials. A process deadline also
// covers native regexp work and result serialization that an interpreter interrupt
// might not preempt. The runner is an explicit tsdown entry so production never depends on TypeScript execution.

export async function runIsolatedRule(
  kind: "script" | "regex",
  values: string[],
  message: { chatId: string; content: string },
): Promise<IsolatedRuleResult> {
  if (stopping) throw new Error("规则执行服务已停止");
  const payload = JSON.stringify({ kind, values, message });
  if (Buffer.byteLength(payload) > MAX_INPUT_BYTES) throw new Error("规则输入过大");
  if (active >= MAX_ACTIVE) {
    if (pending.length >= MAX_PENDING) throw new Error("规则执行队列已满，请稍后重试");
    await new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
  }
  if (stopping) throw new Error("规则执行服务已停止");
  active += 1;
  try {
    return await new Promise<IsolatedRuleResult>((resolve, reject) => {
      const child = spawn(process.execPath, ["--max-old-space-size=48", fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./rule-worker.ts" : "./rule-worker.js", import.meta.url))], {
        // Resolve QuickJS from this package for both source tests and dist/server startup.
        cwd: new URL("../../", import.meta.url),
        env: {},
        stdio: "pipe",
        windowsHide: true,
      });
      activeChildren.add(child);
      let output = "";
      let timedOut = false;
      let oversized = false;
      const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, WALL_TIMEOUT_MS);
      child.stdout.on("data", (part: Buffer) => {
        output += part.toString();
        if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) { oversized = true; child.kill("SIGKILL"); }
      });
      child.stderr.resume(); // Never log script text, message content, or child diagnostics.
      child.stdin.on("error", () => undefined);
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timeout);
        activeChildren.delete(child);
        if (timedOut) return reject(new Error("规则执行超时"));
        if (oversized || code !== 0) return reject(new Error("规则执行超出资源限制"));
        try {
          const response = JSON.parse(output);
          if (response.error) throw new Error(response.error);
          const result = response.result as IsolatedRuleResult;
          if (typeof result?.matched !== "boolean" || !Array.isArray(result.matchedTexts) ||
              !Array.isArray(result.matchedValues) || result.matchedTexts.length > 50 ||
              result.matchedValues.length > 50) throw new Error("规则返回值无效");
          resolve(result);
        } catch (error) { reject(error); }
      });
      child.stdin.end(payload);
    });
  } finally {
    active -= 1;
    if (!stopping) pending.shift()?.resolve();
  }
}

export function stopRuleExecutions(): void {
  stopping = true;
  for (const waiter of pending.splice(0)) waiter.reject(new Error("规则执行服务已停止"));
  for (const child of activeChildren) child.kill("SIGKILL");
}
