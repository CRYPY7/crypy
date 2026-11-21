import { expect, test } from "@playwright/test";

/** Chain picker on address tools (boards 34–35), with live chain data. */
const OWNER = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";

test("default scans the chains where the address is used and says so", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  await page.goto(`/en/address/${OWNER}`);
  const main = page.locator("#main");
  await expect(main.getByRole("button", { name: /Chains: Used \(\d\)/ })).toBeVisible({ timeout: 60_000 });
  await expect(main.getByTestId("scanned")).toContainText("Scanned on");
});

test("picking one chain narrows the scan, keeps it in the link and remembers it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().clearCookies();
  await page.goto(`/en/address/${OWNER}/approvals`);
  const main = page.locator("#main");
  await main.getByRole("button", { name: /Chains:/ }).click({ timeout: 60_000 });
  const dialog = page.getByRole("dialog", { name: "Which chains?" });
  await dialog.getByRole("radio", { name: /Pick chains/ }).check();
  await dialog.getByRole("checkbox", { name: /BNB Chain/ }).check();
  await dialog.getByRole("button", { name: "Scan 1 chain" }).click();
  await expect(page).toHaveURL(/\?chains=bsc$/);
  await expect(main.getByTestId("scanned")).toContainText("Scanned on BNB Chain only", { timeout: 60_000 });
  // This wallet is used on Ethereum too: a safety page never lets a narrowed scan look complete.
  await expect(main.getByText("Ethereum: not checked")).toBeVisible();
  // Tabs carry the choice, and the device remembers it without the link.
  await expect(main.getByRole("link", { name: "Activity" })).toHaveAttribute("href", /\?chains=bsc$/);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "crypy_chains")?.value).toBe("bsc");
  await page.goto(`/en/address/${OWNER}`);
  await expect(main.getByRole("button", { name: /Chains: BNB Chain/ })).toBeVisible({ timeout: 60_000 });
});

test("Escape closes the picker without changing anything", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  await page.goto(`/en/address/${OWNER}`);
  const button = page.locator("#main").getByRole("button", { name: /Chains:/ });
  await button.click({ timeout: 60_000 });
  await page
    .getByRole("dialog", { name: "Which chains?" })
    .getByRole("radio", { name: /All chains/ })
    .check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Which chains?" })).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page).not.toHaveURL(/chains=/);
});

test("the APIs validate the chains parameter", async ({ request }) => {
  expect((await request.get(`/api/v1/address/${OWNER}/approvals?chains=solana`)).status()).toBe(400);
  expect((await request.get(`/api/v1/address/${OWNER}/activity?chains=%3Cx%3E`)).status()).toBe(400);
});
