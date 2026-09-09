import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

export default defineConfig(({ mode, command }) => {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  const isDemo = mode === "demo";
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
    base: isDemo ? "./" : "/",
    define: {
      // 每次生产构建生成新的缓存版本号，用于 Service Worker 清理旧 app shell。
      __APP_BUILD_ID__: JSON.stringify(new Date().toISOString()),
      // 直接读取包版本，pnpm run 和直接调用 Vite 都上报同一版本。
      __APP_VERSION__: JSON.stringify(version),
    },
    plugins: [react(), tailwindcss(), ...(isDemo ? [{
      name: "standalone-demo",
      transformIndexHtml(html: string) {
        // The demo uses bundled fonts and no service worker. On static hosts,
        // CSP also prevents an accidental future API call from leaving the page.
        const cleaned = html.replace(/<link[^>]+(?:manifest|fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/g, "")
          .replace("<title>Telegram Star</title>", "<title>Telegram Star · 交互 Demo</title>");
        return command === "build"
          ? cleaned.replace("</head>", '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'; object-src \'none\'; base-uri \'self\'" /></head>')
          : cleaned;
      },
    }] : [])],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: isDemo ? undefined : {
        "/api": {
          target: target,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: isDemo ? "dist-demo" : "dist",
      rollupOptions: {
        // 将 Service Worker 作为独立入口输出到 dist/sw.js，满足浏览器注册路径要求。
        input: isDemo ? { app: path.resolve(__dirname, "index.html") } : {
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
