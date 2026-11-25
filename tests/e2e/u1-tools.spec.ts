import { expect, test } from "@playwright/test";

/** Utilities batch U1: every result is worked out in the browser, so nothing typed may leave the page. */
function trackRequests(page: import("@playwright/test").Page) {
  const urls: string[] = [];
  // Code chunks the page loads on demand (the QR library) are the site's own static files, not data.
  page.on("request", (request) => {
    if (!new URL(request.url()).pathname.startsWith("/_next/static/")) urls.push(request.url());
  });
  return urls;
}

test("token decimals: amount ↔ base units for any decimals", async ({ page }) => {
  await page.goto("/en/tools/unit-converter", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  const section = page.locator("#token-decimals");
  await section.getByRole("button", { name: /USDC \/ USDT/ }).click();
  await section.getByRole("textbox", { name: "Amount (as wallets show it)" }).fill("1234.56");
  await expect(section.getByRole("textbox", { name: "Base units (as stored on-chain)" })).toHaveValue("1234560000");
  await section.getByRole("textbox", { name: "Base units (as stored on-chain)" }).fill("1");
  await expect(section.getByRole("textbox", { name: "Amount (as wallets show it)" })).toHaveValue("0.000001");
  await section.getByRole("textbox", { name: "Token decimals" }).fill("40");
  await expect(section.getByText("Token decimals go from 0 to 36")).toBeVisible();
  expect(requests).toEqual([]);
});

test("gas tracker: work out a fee yourself", async ({ page }) => {
  await page.goto("/en/tools/gas-tracker");
  const panel = page.getByRole("region", { name: "Work out a fee yourself" });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const requests: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    // The live tracker refreshes itself every 12 s; that request carries nothing typed.
    if (!path.startsWith("/_next/static/") && !path.startsWith("/api/v1/gas")) requests.push(r.url());
  });
  await panel
    .getByRole("button", { name: /Send a token|token/i })
    .first()
    .click();
  await panel.getByRole("textbox", { name: "Gas price" }).fill("2");
  await panel.getByRole("textbox", { name: /price in USD/ }).fill("3000");
  await expect(panel.getByText("0.00013", { exact: true })).toBeVisible();
  await expect(panel.getByText("130000000000000", { exact: true })).toBeVisible();
  await expect(panel.getByText("$0.39", { exact: true })).toBeVisible();
  await expect(panel.getByText(/gas limit is the most/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("token supply & valuation keeps market cap and FDV apart", async ({ page }) => {
  await page.goto("/en/tools/token-valuation", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("$12,500,000.00")).toBeVisible();
  await expect(page.getByText("$100,000,000.00")).toBeVisible();
  await expect(page.getByText("Maximum supply × price")).toBeVisible();
  await expect(page.getByText(/FDV is 8\.0× the market cap/)).toBeVisible();
  await page.getByRole("textbox", { name: "Circulating supply (optional)" }).fill("5,000,000,000");
  await expect(page.getByText("Circulating supply can't be more than the total supply.")).toBeVisible();
  expect(requests).toEqual([]);
});

test("APR / APY calculator shows the estimate, the effective rate and the warning", async ({ page }) => {
  await page.goto("/en/tools/apy-calculator", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("textbox", { name: "Starting amount" }).fill("1000");
  await page.getByRole("textbox", { name: "Yearly rate (%)" }).fill("10");
  await page.getByRole("textbox", { name: "For" }).fill("1");
  await expect(page.getByText("1,104.71").first()).toBeVisible();
  await expect(page.getByText("10.471307%")).toBeVisible();
  await page.getByText("APY", { exact: true }).click();
  await expect(page.getByText("1,100.00").first()).toBeVisible();
  await expect(page.getByText(/not a promise of returns/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("address formatter: QR code names its network; a recovery phrase is refused", async ({ page }) => {
  await page.goto("/en/tools/address-formatter", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  const box = page.getByRole("textbox", { name: "Addresses (one per line)" });
  await box.fill("0xdac17f958d2ee523a2206206994597c13d831ec7");
  await page.getByRole("main").getByRole("button", { name: "QR code" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", { name: /Ethereum address: 0xdAC17F958D2ee523a2206206994597C13D831ec7/ }),
  ).toBeVisible();
  await dialog.getByRole("combobox", { name: "Network" }).selectOption("bsc");
  await expect(dialog.getByText("BNB Chain address", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Tell the sender to use BNB Chain/)).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  expect((await download).suggestedFilename()).toBe("bsc-0xdAC17F958D2ee523a2206206994597C13D831ec7.png");
  await dialog.getByRole("button", { name: "Close" }).click();
  await box.fill("abandon ability able about above absent absorb abstract absurd abuse access accident");
  await expect(page.getByText(/looks like a recovery phrase/)).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "QR code" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("Calculators appear in the tools list", async ({ page }) => {
  await page.goto("/en/tools");
  await expect(page.getByRole("link", { name: /Token Supply & Valuation Calculator/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /APR \/ APY & Compound Interest Calculator/ }).first()).toBeVisible();
});
