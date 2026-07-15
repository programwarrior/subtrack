import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"] } }],
  webServer: { command: "pnpm dev --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: true },
});
