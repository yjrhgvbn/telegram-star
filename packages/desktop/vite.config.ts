import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: {
      __DESKTOP_APP_VERSION__: JSON.stringify(env.npm_package_version ?? "0.1.0"),
    },
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5180,
      strictPort: true,
    },
  };
});
