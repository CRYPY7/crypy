import { expect, test } from "@playwright/test";

/** Uses live blockchain data (free providers or public nodes; prices read on-chain from DEX pools). */
test("address page shows real balances and values on both chains", async ({ page }) => {
  // The page streams its live data; wait for the content below, not for the whole stream to finish loading.
  await page.goto("/en/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Total value" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^\$[\d,]+\.\d{2}$/).first()).toBeVisible();
  for (const chain of ["Ethereum", "BNB Chain"]) {
    await expect(page.getByRole("heading", { name: new RegExp(`^${chain}`) })).toBeVisible();
  }
  await expect(page.getByRole("cell", { name: /^ETH/ }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /^BNB/ }).first()).toBeVisible();
  // Token rows link to their token pages.
  await expect(page.getByRole("link", { name: "USDT" }).first()).toHaveAttribute(
    "href",
    /\/en\/token\/(ethereum|bsc)\/0x/,
  );
  await expect(page.getByText(/Prices: read on-chain/)).toBeVisible();
});

test("address page stays within the JavaScript budget", async ({ page }) => {
  let bytes = 0;
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script")
      bytes += (await response.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto("/en/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /Total value/ })).toBeVisible({ timeout: 30_000 });
  // Same budget as every other page (foundation.spec.ts); balances are rendered on the server.
  expect(bytes).toBeLessThanOrEqual(650 * 1024);
});

test("Balance Scanner tool page opens the address page", async ({ page }) => {
  await page.goto("/en/tools/balance-scanner", { waitUntil: "networkidle" });
  await expect(page.getByText("Runs in your browser")).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "Wallet address", exact: true });
  await input.fill("0x123");
  await page.getByRole("button", { name: "See balances" }).click();
  await expect(page.getByText("Enter a wallet address")).toBeVisible();
  await input.fill("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  await page.getByRole("button", { name: "See balances" }).click();
  await expect(page).toHaveURL(/\/en\/address\/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045$/);
  await expect(page.getByRole("heading", { name: "Total value" })).toBeVisible({ timeout: 30_000 });
});

test("header search shows a mistyped address as a floating message with a way forward", async ({ page, isMobile }) => {
  test.skip(isMobile, "The header search is shown on wide screens only.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/tools", { waitUntil: "networkidle" });
  const header = page.getByRole("banner");
  const before = await header.evaluate((element) => element.getBoundingClientRect().height);
  const search = header.getByRole("search");
  await search.getByRole("textbox").fill("0xdAC17F958D2ee523a2206206994597C13D831eC7");
  await search.getByRole("textbox").press("Enter");
  const message = header.getByText(/doesn't match its checksum/);
  await expect(message).toBeVisible();
  // The message floats: the header keeps its height.
  expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(message).toHaveCount(0);

  await search.getByRole("textbox").press("Enter");
  await header.getByRole("link", { name: "Look it up anyway" }).click();
  await expect(page).toHaveURL(/\/en\/address\/0xdac17f958d2ee523a2206206994597c13d831ec7$/);
  await expect(page.getByRole("heading", { name: "Total value" })).toBeVisible({ timeout: 30_000 });
  await expect(header.getByText(/doesn't match its checksum/)).toHaveCount(0);
});

/** USDT's contract address on Ethereum is an ordinary wallet on BNB Chain (people sent BNB to it by mistake). */
const USDT_ETH = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

test("search lists every chain where an address is used, with what it is there", async ({ page }) => {
  await page.goto("/en", { waitUntil: "networkidle" });
  const search = page.locator("main form[role=search]");
  await search.locator("input").fill(USDT_ETH);
  await search.getByRole("button").click();
  // Used on several chains (a token on Ethereum, an ordinary wallet holding coins elsewhere).
  await expect(page.getByText(/Found on \d of \d chains/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Tether USD (USDT)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Token page" })).toHaveAttribute(
    "href",
    `/en/token/ethereum/${USDT_ETH}`,
  );
  await expect(page.getByRole("link", { name: "Balances", exact: true }).first()).toHaveAttribute(
    "href",
    `/en/address/${USDT_ETH}?chain=bsc`,
  );
  await page.getByRole("link", { name: /Open overview on all chains/ }).click();
  await expect(page).toHaveURL(new RegExp(`/en/address/${USDT_ETH}$`));
  await expect(page.getByRole("heading", { name: /Found on \d of \d chains/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Filter by chain" })).toBeVisible();
});

test("the chain filter focuses one chain and the token page shows the other chains", async ({ page }) => {
  await page.goto(`/en/address/${USDT_ETH}?chain=bsc`);
  await expect(page.getByRole("heading", { name: /Total value · BNB Chain/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /^Ethereum/ })).toHaveCount(0);

  await page.goto(`/en/token/ethereum/${USDT_ETH}`);
  const strip = page.getByRole("navigation", { name: "Same address on other chains:" });
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip.getByRole("link", { name: /BNB Chain · Wallet/ })).toHaveAttribute(
    "href",
    `/en/address/${USDT_ETH}?chain=bsc`,
  );
});
