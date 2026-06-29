import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "packages/web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/server/src/generated/**"],
  },
});
