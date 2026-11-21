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

test("Token Security works on the newer chains: a Base token's trade test and liquidity", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/token/base/0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Trade test" })).toBeVisible({ timeout: 60_000 });
  await expect(main.getByText("Worked").first()).toBeVisible();
  await expect(main.getByRole("heading", { name: "Who holds the liquidity" })).toBeVisible();
  await expect(main.getByText(/aren't available on Base yet/)).toHaveCount(0);
  await expect(main.getByText(/^Safe$/)).toHaveCount(0);
  // The scanner offers every chain where the checks run.
  await page.goto("/en/tools/token-security");
  for (const chain of ["Base", "Arbitrum", "Polygon"])
    await expect(page.getByLabel("Chain").locator("option", { hasText: chain })).toHaveCount(1);
});

test("tool page opens the token page for the chosen chain", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/tools/token-security");
  await page.getByLabel("Token contract address").fill("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82");
  await page.getByLabel("Chain").selectOption("bsc");
  await page.getByRole("button", { name: "Check token" }).click();
  // The link changes when the token page starts to arrive; under a full parallel test run that can take a while.
  await expect(page).toHaveURL(/\/en\/token\/bsc\/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82$/, { timeout: 60_000 });
  await page.goto("/en/tools/token-security");
  await page.getByLabel("Token contract address").fill("0x123");
  await page.getByRole("button", { name: "Check token" }).click();
  await expect(page.getByText(/Enter a token contract address/)).toBeVisible();
});

test("liquidity card: every holder with its lock or control, read on-chain (FLOKI)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/token/bsc/0xfb5B838b6cfEEdC2873aB27866079AC55363D37E");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Who holds the liquidity" }) });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText("UNCX (PancakeSwap locker)", { exact: true })).toBeVisible();
  await expect(card.getByText(/^Locked until /).first()).toBeVisible();
  await expect(card.getByText(/signers must agree to remove it/)).toBeVisible();
  await expect(card.getByText("OnlyMoons vault", { exact: true })).toBeVisible();
  await expect(card.getByText(/Protected: burned, or locked for more than 30 days/)).toBeVisible();
  await expect(card.getByText(/How we checked\./)).toBeVisible();
  // Closed pools open on click.
  await card.getByText(/^ApeSwap · FLOKI/).click();
  await expect(card.getByText("Holders not found").first()).toBeVisible();
});
