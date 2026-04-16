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
});
