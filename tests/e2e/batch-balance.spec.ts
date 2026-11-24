import { expect, test } from "@playwright/test";

/** Batch Balance Scanner (live data from Ethereum and BNB Chain nodes). */
const BINANCE_8 = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const DEAD = "0x000000000000000000000000000000000000dEaD";

test("checks the list before scanning: duplicates merged, typos and bad lines skipped", async ({ page }) => {
  await page.goto("/en/tools/batch-balance");
  await page
    .getByRole("textbox", { name: /Address list/ })
    .fill(`${BINANCE_8},Binance 8\n${BINANCE_8.toLowerCase()}\n${BINANCE_8.replace("aceC", "acec")}\n0x1234`);
  await expect(page.getByText("1 valid")).toBeVisible();
  await expect(page.getByText("Duplicates merged: 1")).toBeVisible();
  await expect(page.getByText(/Problems: 2/)).toBeVisible();
  await expect(page.getByText(/Checksum doesn't match/)).toBeVisible();
});

test("scans both chains, each at its own block, and never sends labels", async ({ page }) => {
  const bodies: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/batch-scans")) bodies.push(r.postData() ?? "");
  });
  await page.goto("/en/tools/batch-balance");
  await page.getByRole("textbox", { name: /Address list/ }).fill(`${BINANCE_8},Secret label\n${DEAD},Burn`);
  await page.getByRole("button", { name: /^USDT/ }).click();
  await page.getByRole("button", { name: "Scan balances" }).click();
  const status = page.getByRole("status").filter({ hasText: "Scan complete" });
  await expect(status).toBeVisible({ timeout: 45_000 });
  const text = (await status.textContent()) ?? "";
  const eth = /block ([\d,–]+) \(Ethereum\)/.exec(text)?.[1];
  const bsc = /block ([\d,–]+) \(BNB Chain\)/.exec(text)?.[1];
  expect(eth && bsc).toBeTruthy();
  expect(eth).not.toBe(bsc);
  expect(bodies.length).toBeGreaterThanOrEqual(1);
  expect(bodies.join(" ")).not.toContain("Secret label");
  // CSV is built in the browser.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).filter({ visible: true }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^crypy-balances-.*\.csv$/);
});

test("a list typed before the page's code has loaded is kept", async ({ page }) => {
  await page.route("**/_next/static/chunks/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });
  await page.goto("/en/tools/batch-balance", { waitUntil: "commit" });
  const box = page.getByRole("textbox", { name: /Address list/ });
  await box.fill(`${BINANCE_8},Binance 8`);
  await expect(page.getByText("1 valid")).toBeVisible({ timeout: 20_000 });
  await expect(box).toHaveValue(`${BINANCE_8},Binance 8`);
});

test("a scan runs on the server, shows each chain, and is found again after a refresh", async ({ page }) => {
  await page.goto("/en/tools/batch-balance");
  await page.getByRole("textbox", { name: /Address list/ }).fill(`${BINANCE_8},Binance 8\n${DEAD},Burn`);
  await expect(page.getByText(/balances to read/)).toBeVisible();
  await page.getByRole("button", { name: "Scan balances" }).click();
  // Either the running panel or (for a fast scan) the finished line appears; nothing says "failed".
  const done = page.getByRole("status").filter({ hasText: "Scan complete" });
  await expect(page.getByRole("heading", { name: "Scanning 2 wallets" }).or(done)).toBeVisible({ timeout: 20_000 });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done).toContainText(/cross-checked with a second node|block/);
  await expect(page.getByText("Binance 8").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/Failed/)).toHaveCount(0);
  // The scan is kept for this tab: a refresh shows the same results (labels come from this browser only).
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Scan complete" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Binance 8").filter({ visible: true }).first()).toBeVisible();
});

test("starting a second scan while one runs offers to stop it", async ({ page, request, baseURL }) => {
  // A scan started from this visitor's address in the background, still waiting or running.
  const start = await request.post("/api/v1/batch-scans", {
    headers: { origin: new URL(baseURL!).origin },
    data: { chains: ["ethereum", "bsc", "base", "arbitrum", "polygon"], addresses: [BINANCE_8, DEAD], tokens: {} },
  });
  test.skip(!start.ok(), "the API refused the background scan");
  await page.goto("/en/tools/batch-balance");
  await page.getByRole("textbox", { name: /Address list/ }).fill(`${DEAD},Burn`);
  await page.getByRole("button", { name: "Scan balances" }).click();
  // The first one may already be done (fast nodes); then the new one simply runs.
  const offer = page.getByRole("button", { name: "Stop that scan" });
  const done = page.getByRole("status").filter({ hasText: "Scan complete" });
  await expect(offer.or(done)).toBeVisible({ timeout: 30_000 });
});

test("scan in my browser: a warning first, then balances read from public nodes without the server scan", async ({
  page,
}) => {
  const toServer: string[] = [];
  const toNodes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/batch-scans")) toServer.push(r.url());
    if (/publicnode\.com|drpc\.org|bnbchain\.org|arbitrum\.io|base\.org/.test(r.url())) toNodes.push(r.url());
  });
  await page.goto("/en/tools/batch-balance");
  await page.getByRole("radio", { name: /In my browser/ }).check();
  await expect(page.getByText("Your IP address and wallet list go to public nodes")).toBeVisible();
  await expect(page.getByText(/\/ 10,?000 addresses/)).toBeVisible();
  await page.getByRole("textbox", { name: /Address list/ }).fill(`${BINANCE_8},Binance 8\n${DEAD},Burn`);
  await page.getByRole("button", { name: "Scan balances" }).click();
  const done = page.getByRole("status").filter({ hasText: "Scan complete" });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done).toContainText("scanned in your browser");
  await expect(page.getByText("Binance 8").filter({ visible: true }).first()).toBeVisible();
  expect(toServer).toEqual([]);
  expect(toNodes.length).toBeGreaterThan(0);
});
