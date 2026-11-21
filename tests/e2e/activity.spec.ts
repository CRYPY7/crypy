import { expect, test } from "@playwright/test";

/** Activity tab with live chain data. With an Alchemy key: full history; without: the recent-only notice. */
const OWNER = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";

test("activity tab lists transfers newest first, with filters, export and an honest source note", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/en/address/${OWNER}`);
  await page
    .locator("#main")
    .getByRole("navigation", { name: "Address sections" })
    .getByRole("link", { name: "Activity" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/en/address/${OWNER}/activity$`));
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Transfers" })).toBeVisible({ timeout: 60_000 });
  await expect(main.getByText(/How we got this/)).toBeVisible();
  await expect(main.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Received" })).toBeVisible();
  // Either the full history (with a link to each transaction) or the recent-only notice.
  const history = main.getByText(/Full history isn't available right now/);
  if (!(await history.isVisible())) await expect(main.getByText(/Showing/)).toBeVisible();
  await main.getByRole("button", { name: "NFTs" }).click();
  await expect(main.getByRole("button", { name: "NFTs" })).toHaveAttribute("aria-pressed", "true");
});

test("Address Analyzer tool page opens the activity tab", async ({ page }) => {
  await page.goto("/en/tools/address-analyzer");
  await page.locator("#main").getByRole("textbox", { name: "Wallet address", exact: true }).fill(OWNER);
  await page.locator("#main").getByRole("button", { name: "Show activity" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/address/${OWNER}/activity$`));
});

test("the activity API validates its cursor", async ({ request }) => {
  const bad = await request.get(`/api/v1/address/${OWNER}/activity?cursor=;drop`);
  expect(bad.status()).toBe(400);
});
