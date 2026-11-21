import { defineConfig, devices } from "@playwright/test";

const port = 3200;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    // Each test worker counts as its own visitor, as several people would in real use. Without this, the whole
    // suite (6 workers, live pages) runs into CRYPY's per-visitor limits and fails with "too many requests".
    extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${Number(process.env.TEST_WORKER_INDEX ?? 0) + 1}` },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/en`,
    reuseExistingServer: !process.env.CI,
  },
});
