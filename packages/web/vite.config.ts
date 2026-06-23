import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Load environment variables from the project root and web package
  const rootEnv = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const webEnv = loadEnv(mode, __dirname, "");
  const env = { ...rootEnv, ...webEnv };

  let target = env.API_PROXY_TARGET || env.VITE_API_URL || "http://localhost:3000";
  
  // If target ends with /api, strip it since Vite's proxy path is /api
  if (target.endsWith("/api")) {
    target = target.slice(0, -4);
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: target,
          changeOrigin: true,
        },
      },
    },
  };
});
