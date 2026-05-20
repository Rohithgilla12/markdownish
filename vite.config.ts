import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const playwright = process.env.PLAYWRIGHT === "1";

// Read version straight from package.json so it stays in sync with the
// release artifact — no manual updates inside React components.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

// When running under Playwright, swap every `@tauri-apps/*` import for a
// browser-safe mock under `e2e/tauri-mocks/`. The mocks read their
// behaviour from `window.__pw`, which tests seed via `addInitScript`.
const tauriMockAliases = playwright
  ? {
      "@tauri-apps/api/core": path.resolve(__dirname, "./e2e/tauri-mocks/core.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "./e2e/tauri-mocks/event.ts"),
      "@tauri-apps/api/webview": path.resolve(__dirname, "./e2e/tauri-mocks/webview.ts"),
      "@tauri-apps/api/app": path.resolve(__dirname, "./e2e/tauri-mocks/app.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "./e2e/tauri-mocks/plugin-fs.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./e2e/tauri-mocks/plugin-dialog.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "./e2e/tauri-mocks/plugin-opener.ts"),
      "@tauri-apps/plugin-updater": path.resolve(__dirname, "./e2e/tauri-mocks/plugin-updater.ts"),
      "@tauri-apps/plugin-process": path.resolve(__dirname, "./e2e/tauri-mocks/plugin-process.ts"),
    }
  : {};

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...tauriMockAliases,
    },
  },

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
