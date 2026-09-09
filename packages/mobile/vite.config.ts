import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig(() => {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

  return {
    define: {
      __MOBILE_APP_VERSION__: JSON.stringify(version),
    },
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5182,
      strictPort: true,
    },
  };
});
