import { expect, test } from "@playwright/test";

/** SEO Phase 3 (boards 46–50): gas price per chain, and daily checks of curated tokens. */

test.setTimeout(60_000);

test("a chain's gas page shows that chain only, with its explanation and links to the others", async ({ page }) => {
  await page.goto("/en/gas/bnb-chain", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BNB Chain gas price now");
  // One chain's live card, even after the page's 12-second refresh brings every chain.
  await expect(page.locator('section[aria-labelledby="gas-bsc"]')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(13_000);
  for (const other of ["ethereum", "base", "arbitrum", "polygon"]) {
    await expect(page.locator(`section[aria-labelledby="gas-${other}"]`)).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "How gas works on BNB Chain" })).toBeVisible();
  await expect(page.getByText("BNB Chain has no base fee")).toBeVisible();
  const others = page.locator("section[aria-labelledby=other-chains] li a");
  await expect(others).toHaveCount(4);
  await expect(others.first()).toHaveAttribute("href", "/en/gas/ethereum");
});

test("the Gas Tracker links to each chain's page", async ({ page }) => {
  await page.goto("/en/tools/gas-tracker", { waitUntil: "load" });
  const nav = page.getByRole("navigation", { name: "Gas by chain:" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.getByRole("link", { name: "Polygon" })).toHaveAttribute("href", "/en/gas/polygon");
});

test("the token checks list shows every curated token, waiting for its first check here", async ({ page }) => {
  await page.goto("/en/tokens", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Token security checks");
  // 5 chains × 10 tokens. The test server runs without the daily checks, so each one is waiting.
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await expect(page.getByText("Being checked").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "CAKE" })).toHaveAttribute("href", "/en/tokens/bnb-chain/cake");
  await expect(page.getByText("Nobody can pay to be listed")).toBeVisible();
});

test("a token without a saved check says so, links to a live check and stays out of search", async ({ page }) => {
  await page.goto("/en/tokens/ethereum/usdc", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("USDC on Ethereum: token security check");
  await expect(page.getByText("This check is being prepared")).toBeVisible();
  await expect(page.getByRole("link", { name: "Run a fresh check" })).toHaveAttribute(
    "href",
    "/en/token/ethereum/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  );
  await expect(page.locator('meta[name="robots"][content="noindex, follow"]')).toHaveCount(1);
});

test("unknown chains and tokens answer 404; the sitemap lists gas pages and the checks list", async ({ request }) => {
  for (const path of [
    "/en/gas/solana",
    "/en/tokens/ethereum/not-listed",
    "/en/tokens/bsc/cake",
    "/en/tokens/ethereum",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of [
    "/en/gas/ethereum",
    "/en/gas/bnb-chain",
    "/en/gas/base",
    "/en/gas/arbitrum",
    "/en/gas/polygon",
    "/en/tokens<",
  ]) {
    expect(sitemap, path).toContain(path.replace("<", ""));
  }
  // Token pages are listed only once their first daily check is saved (none on the test server).
  expect(sitemap).not.toContain("/en/tokens/ethereum/");
});
