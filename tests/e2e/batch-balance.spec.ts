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
    if (r.url().includes("/api/v1/batch-balances")) bodies.push(r.postData() ?? "");
  });
  await page.goto("/en/tools/batch-balance");
  await page.getByRole("textbox", { name: /Address list/ }).fill(`${BINANCE_8},Secret label\n${DEAD},Burn`);
  await page.getByRole("button", { name: /^USDT/ }).click();
  await page.getByRole("button", { name: "Scan balances" }).click();
  const status = page.getByRole("status").filter({ hasText: "Scan complete" });
  await expect(status).toBeVisible({ timeout: 45_000 });
  const text = (await status.textContent()) ?? "";
  const eth = /block ([\d,]+) \(Ethereum\)/.exec(text)?.[1];
  const bsc = /block ([\d,]+) \(BNB Chain\)/.exec(text)?.[1];
  expect(eth && bsc).toBeTruthy();
  expect(eth).not.toBe(bsc);
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies.join(" ")).not.toContain("Secret label");
  // CSV is built in the browser.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).filter({ visible: true }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^crypy-balances-.*\.csv$/);
});
