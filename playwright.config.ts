import { defineConfig, devices } from "@playwright/test";
const testPort = Number(process.env.PLAYWRIGHT_PORT || 3000);
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        defaultBrowserType: "chromium",
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
