import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // 同时读取仓库根目录和 Web 包目录的环境变量，兼容本地开发与部署配置。
  const rootEnv = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const webEnv = loadEnv(mode, __dirname, "");
  const env = { ...rootEnv, ...webEnv };

  let target = env.API_PROXY_TARGET || env.VITE_API_URL || "http://localhost:3000";
  
  // Vite 代理路径本身已经是 /api，避免配置里重复拼出 /api/api。
  if (target.endsWith("/api")) {
    target = target.slice(0, -4);
  }

  return {
    define: {
      // 每次生产构建生成新的缓存版本号，用于 Service Worker 清理旧 app shell。
      __APP_BUILD_ID__: JSON.stringify(new Date().toISOString()),
      // 客户端注册上报的应用版本；默认跟随当前 package 版本。
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "1.0.0"),
    },
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
    build: {
      rollupOptions: {
        // 将 Service Worker 作为独立入口输出到 dist/sw.js，满足浏览器注册路径要求。
        input: {
          app: path.resolve(__dirname, "index.html"),
          sw: path.resolve(__dirname, "src/service-worker.ts"),
        },
        output: {
          entryFileNames: (chunkInfo) =>
            chunkInfo.name === "sw" ? "sw.js" : "assets/[name]-[hash].js",
        },
      },
    },
  };
});
