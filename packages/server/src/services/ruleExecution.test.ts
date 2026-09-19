import { expect, it } from "vitest";
import { runIsolatedRule, stopRuleExecutions } from "./ruleExecution.js";

it("cancels pending rules on shutdown and never starts another child", async () => {
  const message = { chatId: "1", content: `${"a".repeat(100)}!` };
  const results = Promise.allSettled([
    runIsolatedRule("regex", ["(a+)+$"], message),
    runIsolatedRule("regex", ["(a+)+$"], message),
    runIsolatedRule("script", ["return true;"], message),
  ]);
  stopRuleExecutions();
  expect((await results).map(result => result.status)).toEqual(["rejected", "rejected", "rejected"]);
  await expect(runIsolatedRule("script", ["return true;"], message)).rejects.toThrow("已停止");
});
