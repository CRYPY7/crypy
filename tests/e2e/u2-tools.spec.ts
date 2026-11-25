import { expect, test } from "@playwright/test";

/** Utilities batch U2: results are worked out in the browser, so nothing typed may leave the page. */
function trackRequests(page: import("@playwright/test").Page) {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).pathname.startsWith("/_next/static/")) urls.push(request.url());
  });
  return urls;
}

test("loan-to-value: LTV, health factor and liquidation price", async ({ page }) => {
  await page.goto("/en/tools/loan-to-value", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("40.00%").first()).toBeVisible();
  await expect(page.getByText("$1,000.00")).toBeVisible();
  await expect(page.getByText("The price can fall 50.00% before liquidation.")).toBeVisible();
  await page.getByRole("textbox", { name: "Collateral price" }).fill("900");
  await expect(page.getByText(/Health factor below 1/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("impermanent loss: a 2× move loses about 5.72%", async ({ page }) => {
  await page.goto("/en/tools/impermanent-loss", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("-5.72%")).toBeVisible();
  await expect(page.getByText("$1,414.21")).toBeVisible();
  await page.getByRole("textbox", { name: "Price change of token A" }).fill("-100");
  await expect(page.getByText("A price can fall by less than 100%.")).toBeVisible();
  expect(requests).toEqual([]);
});

test("slippage: minimum received and pool price impact", async ({ page }) => {
  await page.goto("/en/tools/slippage-calculator", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("textbox", { name: "Quoted amount" }).fill("1000");
  await page.getByRole("textbox", { name: "Slippage tolerance" }).fill("0.5");
  await expect(page.getByText("995.00")).toBeVisible();
  await page
    .getByRole("region", { name: "Price impact in a pool" })
    .getByRole("button", { name: "Try an example" })
    .click();
  await expect(page.getByText("0.99%")).toBeVisible();
  expect(requests).toEqual([]);
});

test("signature decoder flags an unlimited permit and a blind hash", async ({ page }) => {
  await page.goto("/en/tools/signature-decoder", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Token permit" }).click();
  await expect(page.getByRole("heading", { name: "Token permit (ERC-2612): spending permission" })).toBeVisible();
  await expect(page.getByText(/The amount is unlimited/)).toBeVisible();
  await expect(page.getByText(/isn't on CRYPY's list of known apps/)).toBeVisible();
  await page.getByRole("button", { name: "Permit2" }).click();
  await expect(page.getByText(/1inch Aggregation Router v5/).first()).toBeVisible();
  await page.getByRole("textbox", { name: "What the wallet asks you to sign" }).fill(`0x${"ab".repeat(32)}`);
  await expect(page.getByText(/You'd sign a raw 32-byte hash/)).toBeVisible();
  await page.getByRole("textbox", { name: "What the wallet asks you to sign" }).fill("{ broken");
  await expect(page.getByText(/valid JSON/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("address formatter recognises Bitcoin and Solana formats", async ({ page }) => {
  await page.goto("/en/tools/address-formatter", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page
    .getByRole("textbox", { name: "Addresses (one per line)" })
    .fill(
      "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4\n1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb\nEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
  await expect(page.getByText("Bitcoin · Native SegWit (P2WPKH)")).toBeVisible();
  await expect(page.getByText(/built-in checksum doesn't match/)).toBeVisible();
  await expect(page.getByText("Solana", { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test("the Calculators group folds in the sidebar and opens on a calculator page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "sidebar is desktop only");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const group = page.locator("#tools-sidebar details", { hasText: "Calculators" });
  await expect(group).not.toHaveAttribute("open");
  await group.locator("summary").click();
  await expect(group.getByRole("link", { name: "Impermanent Loss" })).toBeVisible();
  await page.goto("/en/tools/apy-calculator");
  await expect(page.locator("#tools-sidebar details", { hasText: "Calculators" })).toHaveAttribute("open", "");
});
