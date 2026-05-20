import { defineConfig, devices } from "@playwright/test";

// @ts-expect-error process is a nodejs global
const isCi = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: isCi ? "github" : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "PLAYWRIGHT=1 pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !isCi,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
