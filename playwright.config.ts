import { defineConfig, devices } from "@playwright/test";
import { ADMIN_TEST_ADDRESS } from "./tests/e2e/admin-wallet";
import { FAKE_TELEGRAM_TOKEN, fakeTelegramUrl } from "./tests/e2e/fake-telegram";

const port = 3200;
/** Telegram tests use a stand-in Telegram server, never the real bot (see tests/e2e/fake-telegram.ts). */
const fakeTelegram = process.env.CRYPY_FAKE_TELEGRAM === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // These tests read live blockchains through free providers. Six parallel browsers made the providers slow down
  // and rest (seen on the owner's PC), which failed unrelated pages; three keep the run honest and still quick.
  workers: 3,
  globalSetup: "./tests/e2e/fake-telegram.ts",
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
    // A fresh database for each run, separate from the one used in development.
    env: {
      PGLITE_DIR: "memory",
      // The daily token checks would add live network load to every test run; their logic has unit tests.
      CRYPY_WORKER_SKIP: "token-checks,health",
      // The admin dashboard tests sign in with this test-only wallet.
      ADMIN_WALLETS: ADMIN_TEST_ADDRESS,
      // Outage drill for one address at a time (tests/e2e/saved-results.spec.ts); other tests aren't affected.
      CRYPY_FAULT_FILE: ".data/e2e-faults",
      ...(fakeTelegram ? { TELEGRAM_API_URL: fakeTelegramUrl, TELEGRAM_BOT_TOKEN: FAKE_TELEGRAM_TOKEN } : {}),
    },
  },
});
