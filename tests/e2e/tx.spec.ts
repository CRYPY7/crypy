import { expect, test } from "@playwright/test";

/** Live data: real Ethereum and BNB Chain transactions (see tests/unit/tx-live.test.ts). */
const ETH_TOKEN = "0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6";
const ETH_FAILED = "0x79c3f12d4cec02756017d973cd78dd0fdfbbdf7301571a498b8d34ebac4bf2c1";
const ETH_BOT = "0x55a674521b8bc9079ff1e3468400e04227f1c12b565d89ec12c8a84105e30277";
const BSC_CREATION = "0x216453b86ec566ac33b191479256e144e2e9c8e9ad867288ed8c06050cbbc9e4";

test("a token transfer reads as a story, with the wallet's changes and cost", async ({ page }) => {
  await page.goto(`/en/tx/${ETH_TOKEN}?chain=ethereum`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Sent 84\.740357 USDC to 0xD37A…06B4$/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("region", { name: "Transaction flow" })).toBeVisible();
  await expect(page.getByRole("region", { name: /Changes for/ })).toContainText("−84.740357");
  await expect(page.getByRole("region", { name: "Cost" })).toContainText("ETH");
  // Technical sections stay out of the Simple view.
  await expect(page.getByRole("region", { name: "Function called" })).toBeHidden();
});

test("Advanced view shows the technical evidence and is remembered", async ({ page }) => {
  await page.goto(`/en/tx/${ETH_TOKEN}?chain=ethereum`);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("region", { name: "Function called" })).toContainText("transfer");
  await expect(page.getByRole("region", { name: "Fees" })).toContainText("Base fee");
  await expect(page.getByRole("region", { name: "Transaction flow" })).toBeHidden();
  await page.reload();
  await expect(page.getByRole("region", { name: "Fees" })).toBeVisible();
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  await expect(page.getByRole("region", { name: "Transaction flow" })).toBeVisible();
});

test("a failed transaction says what it tried and why it failed, or that the reason isn't available", async ({
  page,
}) => {
  await page.goto(`/en/tx/${ETH_FAILED}?chain=ethereum`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Failed: tried to move 563\.973556 USDC/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("region", { name: "Why did it fail?" }).first()).toContainText(
    /didn't have enough|reason isn't available/,
  );
  await expect(page.locator("#main").getByText("Fees are charged even when a transaction fails")).toBeVisible();
});

test("an unknown contract call is not guessed, and events are not called assets", async ({ page }) => {
  await page.goto(`/en/tx/${ETH_BOT}?chain=ethereum`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Interacted with a contract", { timeout: 30_000 });
  await expect(page.locator("#main").getByText(/8 token events were recorded/)).toBeVisible();
});

test("a contract creation links the new contract", async ({ page }) => {
  await page.goto(`/en/tx/${BSC_CREATION}?chain=bsc`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Created a new contract", { timeout: 30_000 });
  await expect(
    page
      .getByRole("region", { name: "Transaction flow" })
      .locator('a[href="/en/address/0x10C838c3700632A22fa95fBDf21080b40AdeD830"]'),
  ).toBeVisible();
});

test("an unknown hash explains what may have happened", async ({ page }) => {
  await page.goto(`/en/tx/0x${"ab".repeat(32)}?chain=bsc`);
  await expect(page.locator("#main").getByText("We couldn't find this transaction on BNB Chain.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "Search all networks" })).toBeVisible();
});

test("exports: readable report, JSON details and raw node data", async ({ request }) => {
  const base = `/api/v1/tx/${ETH_TOKEN}?chain=ethereum&locale=en`;
  const text = await request.get(`${base}&format=text`);
  expect(text.headers()["content-type"]).toContain("text/plain");
  expect(await text.text()).toContain(ETH_TOKEN);
  const json = await (await request.get(`${base}&format=json`)).json();
  expect(json.data.interpretation.kind).toBe("token-send");
  const raw = await (await request.get(`${base}&format=raw`)).json();
  expect(raw.receipt.transactionHash).toBe(ETH_TOKEN);
  expect((await request.get(`/api/v1/tx/0x12?chain=ethereum`)).status()).toBe(400);
});

test("Transaction Checker tool page checks the hash and opens the transaction", async ({ page }) => {
  await page.goto("/en/tools/tx-checker");
  const input = page.getByRole("textbox", { name: "Transaction hash", exact: true });
  await input.fill("0x1234");
  await page.getByRole("button", { name: "Check transaction" }).click();
  await expect(page.locator("#main").getByText("A transaction hash is 0x followed by 64")).toBeVisible();
  await input.fill(BSC_CREATION);
  await page.getByRole("button", { name: "Check transaction" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/tx/${BSC_CREATION}`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Created a new contract", { timeout: 30_000 });
});

test("the transaction page stays within the JavaScript budget", async ({ page }) => {
  let bytes = 0;
  page.on("response", async (response) => {
    if (response.url().endsWith(".js")) bytes += (await response.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(`/en/tx/${ETH_TOKEN}?chain=ethereum`, { waitUntil: "networkidle" });
  expect(bytes).toBeLessThan(650 * 1024);
});

test("a router swap shows its route, actions, permissions and parties, with honest evidence labels", async ({
  page,
}) => {
  await page.goto("/en/tx/0xadf65326e84d22326edceb6dd8f4a8e388a3eacc3940ff634110191576e0b58d?chain=bsc");
  const main = page.locator("#main");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Swapped 391\.06\d* TATA for 0\.003726 BNB/);
  await expect(main.getByRole("heading", { name: "How the assets moved" })).toBeVisible();
  await expect(main.getByText("PancakeSwap v2 pool").first()).toBeVisible();
  await expect(main.getByText("Possible fee (unverified)").first()).toBeVisible();
  await expect(main.getByText("11 of 13 events explained").first()).toBeVisible();
  await expect(main.getByText("Used up by this transaction").first()).toBeVisible();
  // Never assumes the visitor is the sender, and never calls a used-up permission a new one.
  await expect(main.getByText("Your wallet")).toHaveCount(0);
  await expect(main.getByText("This transaction gave spending permission")).toHaveCount(0);
});
