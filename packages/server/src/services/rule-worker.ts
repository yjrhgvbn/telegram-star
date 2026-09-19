// Dedicated process entry. No Node handles are exposed inside the WebAssembly runtime.
import { getQuickJS } from "quickjs-emscripten";
let text = "";
for await (const part of process.stdin) {
  text += part;
  if (text.length > 131072) process.exit(1);
}
const input = JSON.parse(text);
try {
  let result;
  if (input.kind === "regex") {
    const values = [], texts = new Set();
    for (const pattern of input.values) {
      const first = new RegExp(pattern, "i").exec(input.message.content);
      if (!first) continue;
      values.push(pattern);
      let count = 0;
      for (const match of input.message.content.matchAll(new RegExp(pattern, "gi"))) {
        if (match[0]) texts.add(match[0].trim().slice(0, 500));
        if (++count >= 50 || texts.size >= 50) break;
      }
    }
    result = {matched:values.length > 0,legacyMatchedText:values[0] ?? null,matchedValues:values.slice(0,50),matchedTexts:[...texts].filter(Boolean).slice(0,50)};
  } else {
    const engine = await getQuickJS();
    const runtime = engine.newRuntime();
    runtime.setMemoryLimit(8 * 1024 * 1024);
    runtime.setMaxStackSize(256 * 1024);
    // CPU time avoids rejecting a cheap rule merely because the OS descheduled
    // this process under load. The parent still enforces a separate wall deadline.
    const startedCpu = process.cpuUsage();
    let interrupted = false;
    runtime.setInterruptHandler(() => {
      const elapsed = process.cpuUsage(startedCpu);
      interrupted = elapsed.user + elapsed.system > 25_000;
      return interrupted;
    });
    const context = runtime.newContext();
    try {
      const source = `(() => {
        const message = Object.freeze(${JSON.stringify(input.message)});
        const result = ((message) => { "use strict";\n${input.values[0]}\n})(message);
        if (typeof result === 'boolean') return JSON.stringify({matched:result,legacyMatchedText:null,matchedValues:[],matchedTexts:[]});
        if (result && typeof result === 'object' && 'then' in result) throw new Error('自定义脚本必须同步返回，不能返回 Promise');
        if (!result || typeof result !== 'object' || typeof result.matched !== 'boolean') throw new Error('自定义脚本必须返回 boolean 或 { matched, matchedText?, matchedTexts? }');
        const texts = new Set();
        const add = value => {if (typeof value === 'string') {const text = value.trim().slice(0,500); if(text) texts.add(text);}};
        add(result.matchedText);
        if (Array.isArray(result.matchedTexts)) {for (const text of result.matchedTexts) {add(text); if(texts.size >= 50) break;}}
        const values = [...texts];
        return JSON.stringify({matched:result.matched,legacyMatchedText:values[0] ?? null,matchedValues:[],matchedTexts:values});
      })()`;
      const evaluated = context.evalCode(source);
      if (evaluated.error) {
        // Inspection also runs in this killable process, never on the API thread.
        let detail = "自定义脚本执行失败或返回值无效";
        try { const dumped = context.dump(evaluated.error); if (typeof dumped?.message === "string") detail = dumped.message.slice(0, 500); }
        finally { evaluated.error.dispose(); }
        throw new Error(interrupted ? 'Script execution timed out after 25ms' : detail);
      }
      try { result = JSON.parse(context.getString(evaluated.value)); }
      finally { evaluated.value.dispose(); }
    } finally { context.dispose(); runtime.dispose(); }
  }
  process.stdout.write(JSON.stringify({result}));
} catch (error) {
  process.stdout.write(JSON.stringify({error:error instanceof Error ? error.message.slice(0,500) : 'Rule execution failed'}));
}
