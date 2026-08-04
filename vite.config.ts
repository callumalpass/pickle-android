import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const developmentHttps =
  process.env.PICKLE_HTTPS_KEY && process.env.PICKLE_HTTPS_CERT
    ? {
        key: readFileSync(process.env.PICKLE_HTTPS_KEY),
        cert: readFileSync(process.env.PICKLE_HTTPS_CERT),
      }
    : undefined;

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    host: process.env.PICKLE_DEV_HOST ?? "127.0.0.1",
    port: Number(process.env.PICKLE_DEV_PORT ?? 4198),
    strictPort: true,
    https: developmentHttps,
  },
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "node_modules/**"],
    globals: true,
    setupFiles: "./src/test/setup.ts",
    restoreMocks: true,
  },
});
