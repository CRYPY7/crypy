import { expect, test } from "@playwright/test";

/** Live data: real Ethereum and BNB Chain transactions (see tests/unit/tx-live.test.ts). */
const ETH_TOKEN = "0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6";
const ETH_FAILED = "0x79c3f12d4cec02756017d973cd78dd0fdfbbdf7301571a498b8d34ebac4bf2c1";
const BSC_CREATION = "0x216453b86ec566ac33b191479256e144e2e9c8e9ad867288ed8c06050cbbc9e4";

test("a token transfer explains itself, lists the movement and decodes the call", async ({ page }) => {
  await page.goto(`/en/tx/${ETH_TOKEN}?chain=ethereum`);
  await expect(page.getByText("Success", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "What happened" })).toContainText("called transfer on USDC");
  const movements = page.getByRole("region", { name: "Asset movements" });
  await expect(movements.getByRole("link", { name: "USDC" })).toHaveAttribute(
    "href",
    "/en/token/ethereum/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  );
  await expect(page.getByRole("region", { name: "Function called" })).toContainText("transfer");
  await expect(page.getByText(/Network fee/)).toBeVisible();
});

test("a failed transaction says it failed and why when the node still knows", async ({ page }) => {
  await page.goto(`/en/tx/${ETH_FAILED}?chain=ethereum`);
  await expect(page.getByText("Failed", { exact: true })).toBeVisible({ timeout: 30_000 });
  const why = page.getByRole("region", { name: "Why it failed" });
  await expect(why).toContainText(/transfer amount exceeds balance|isn't available/);
  await expect(page.getByRole("region", { name: "Asset movements" })).toHaveCount(0);
});

test("a contract creation links the new contract", async ({ page }) => {
  await page.goto(`/en/tx/${BSC_CREATION}?chain=bsc`);
  await expect(page.getByRole("region", { name: "What happened" })).toContainText("created a new contract", {
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "0x10C838c3700632A22fa95fBDf21080b40AdeD830" })).toBeVisible();
});

test("an unknown hash explains what may have happened", async ({ page }) => {
  await page.goto(`/en/tx/0x${"ab".repeat(32)}?chain=bsc`);
  await expect(page.getByText("We couldn't find this transaction on BNB Chain.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Search all networks" })).toBeVisible();
});

test("the transaction page stays within the JavaScript budget", async ({ page }) => {
  let bytes = 0;
  page.on("response", async (response) => {
    if (response.url().endsWith(".js")) bytes += (await response.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(`/en/tx/${ETH_TOKEN}?chain=ethereum`, { waitUntil: "networkidle" });
  expect(bytes).toBeLessThan(650 * 1024);
});
