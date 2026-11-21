import { expect, test } from "@playwright/test";

test("Gas Tracker shows live fees per chain, costs of common actions, and refreshes", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/en/tools/gas-tracker");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Ethereum" })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByRole("heading", { name: "BNB Chain" })).toBeVisible();
  await expect(main.getByText("Average").first()).toBeVisible();
  await expect(main.getByRole("table")).toContainText("Approve or revoke a token");
  await expect(main.getByText(/How we measure/)).toBeVisible();
  // The page asks for fresh numbers by itself.
  const refresh = page.waitForResponse((r) => r.url().includes("/api/v1/gas"), { timeout: 20_000 });
  expect((await refresh).status()).toBe(200);
});

test("home page shows the gas widget after load", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByText("Gas now")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Gas Tracker →" })).toHaveAttribute("href", "/en/tools/gas-tracker");
});

test("Timestamp & Block Converter: date to blocks, block to date, Unix in the browser", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/tools/timestamp-block");
  const main = page.locator("#main");
  await main.getByLabel("Date and time").fill("2023-11-14T22:13:20");
  await main.getByRole("button", { name: "Find blocks" }).click();
  await expect(main.getByText("18,573,051")).toBeVisible({ timeout: 60_000 });
  await main.getByRole("button", { name: "Block → date" }).click();
  await main.getByLabel("Block number").fill("18573051");
  await main.getByRole("button", { name: "Find date" }).click();
  await expect(main.getByText(/Nov 14, 2023, 10:13:23 PM UTC/)).toBeVisible({ timeout: 30_000 });
  await main.getByRole("button", { name: "Unix timestamp ↔ date" }).click();
  await main.getByRole("textbox", { name: /Timestamp \(seconds/ }).fill("1700000000");
  await expect(main.getByText(/Nov 14, 2023, 10:13:20 PM UTC/)).toBeVisible();
});
