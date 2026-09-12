import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/tests/*.spec.js", "**/src/components/**/*.spec.js"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  maxFailures: process.env.CI ? 3 : 0,
  globalTimeout: process.env.CI ? 8 * 60_000 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", grep: /@smoke/, use: { ...devices["Desktop Safari"] } },
    { name: "mobile-safari", grep: /@smoke/, use: { ...devices["iPhone 13"] } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "yarn vite --config vite.test.config.js --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
