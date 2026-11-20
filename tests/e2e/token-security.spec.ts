import { expect, test } from "@playwright/test";

/** Token security (live data from BNB Chain, Ethereum, GoPlus and Sourcify). */
test("token page shows the security report with evidence labels and no safe verdict", async ({ page }) => {
  await page.goto("/en/token/bsc/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Trade test" })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByText("Worked").first()).toBeVisible();
  await expect(main.getByRole("heading", { name: "What the owner can do" })).toBeVisible();
  await expect(main.getByText("Simulated").first()).toBeVisible();
  await expect(main.getByText(/never shows a token as "safe"/)).toBeVisible();
  await expect(main.getByText(/^Safe$/)).toHaveCount(0);
});

test("tool page opens the token page for the chosen chain", async ({ page }) => {
  await page.goto("/en/tools/token-security");
  await page.getByLabel("Token contract address").fill("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82");
  await page.getByLabel("Chain").selectOption("bsc");
  await page.getByRole("button", { name: "Check token" }).click();
  await expect(page).toHaveURL(/\/en\/token\/bsc\/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82$/);
  await page.goto("/en/tools/token-security");
  await page.getByLabel("Token contract address").fill("0x123");
  await page.getByRole("button", { name: "Check token" }).click();
  await expect(page.getByText(/Enter a token contract address/)).toBeVisible();
});
