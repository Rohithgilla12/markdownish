import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// vite.config exports an async config function — resolve it to a
// plain object so mergeConfig can consume it.
export default defineConfig(async (env) => {
  const resolved =
    typeof viteConfig === "function" ? await viteConfig(env) : viteConfig;
  return mergeConfig(
    resolved,
    defineConfig({
      test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        // Mocks live in test files, but also in this shared dir so the
        // Playwright suite can later import the same shapes.
        include: ["src/**/*.test.{ts,tsx}"],
        css: false,
      },
    }),
  );
});
