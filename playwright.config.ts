import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4198",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "VITE_PICKLE_FIXTURE=1 pnpm dev",
    url: "http://127.0.0.1:4198",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
