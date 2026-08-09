import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/db/deploy.ts"],
  outDir: "dist",
  format: "esm",
  platform: "node",
  target: "node20",
  unbundle: true,
  sourcemap: true,
  clean: true,
  // SQLite、session 等运行时文件会持续变化，不能触发服务端重新构建。
  ignoreWatch: ["data"],
});
