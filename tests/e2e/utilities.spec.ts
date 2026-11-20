import { expect, test } from "@playwright/test";

/** The utilities run entirely in the browser: nothing typed may leave the page. */
async function trackRequests(page: import("@playwright/test").Page) {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

test("unit converter converts exactly in every direction", async ({ page }) => {
  await page.goto("/en/tools/unit-converter", { waitUntil: "networkidle" });
  const requests = await trackRequests(page);
  await page.getByRole("textbox", { name: "Gwei" }).fill("21000");
  await expect(page.getByRole("textbox", { name: "Wei", exact: true })).toHaveValue("21000000000000");
  await expect(page.getByRole("textbox", { name: "ETH / BNB" })).toHaveValue("0.000021");
  await page.getByRole("textbox", { name: "ETH / BNB" }).fill("1.5");
  await expect(page.getByRole("textbox", { name: "Wei", exact: true })).toHaveValue("1500000000000000000");
  await page.getByRole("textbox", { name: "Wei", exact: true }).fill("0.5");
  await expect(page.getByText("Too many decimal places")).toBeVisible();
  expect(requests).toEqual([]);
});

test("hex converter shows decimal, padded and text forms", async ({ page }) => {
  await page.goto("/en/tools/hex-converter", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Hex or decimal value" }).fill("0x48656c6c6f");
  await expect(page.getByText("310939249775")).toBeVisible();
  await expect(page.getByText("Hello", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Hex or decimal value" }).fill("255");
  await expect(page.getByText("0xff", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Hex" }).check();
  await expect(page.getByText("597", { exact: true })).toBeVisible();
});

test("address formatter never offers a mistyped address", async ({ page }) => {
  await page.goto("/en/tools/address-formatter", { waitUntil: "networkidle" });
  const requests = await trackRequests(page);
  await page
    .getByRole("textbox", { name: "Addresses (one per line)" })
    .fill("0xdac17f958d2ee523a2206206994597c13d831ec7\n0xdAC17F958D2ee523a2206206994597C13D831eC7");
  const items = page.getByRole("main").getByRole("listitem");
  await expect(items.nth(0)).toContainText("No checksum");
  await expect(items.nth(0)).toContainText("0xdAC17F958D2ee523a2206206994597C13D831ec7");
  await expect(items.nth(1)).toContainText("Typing mistake");
  await expect(items.nth(1).getByRole("link")).toHaveCount(0);
  await expect(items.nth(1).getByRole("button")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("transaction decoder flags an unlimited approval", async ({ page }) => {
  await page.goto("/en/tools/tx-decoder", { waitUntil: "networkidle" });
  const requests = await trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("Allow another address (the spender) to move your tokens.")).toBeVisible();
  await expect(page.getByText(/^Unlimited approval:/)).toBeVisible();
  await expect(page.getByRole("link", { name: "0x10ED43C718714eb63d5aA57B78B54704E256024E" })).toBeVisible();
  expect(requests).toEqual([]);
});

test("tool pages publish FAQ structured data", async ({ page }) => {
  await page.goto("/en/tools/tx-decoder");
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.flatMap((block) => (JSON.parse(block) as { "@type": string }[]).map((item) => item["@type"]));
  expect(types).toEqual(expect.arrayContaining(["FAQPage", "WebApplication", "BreadcrumbList"]));
});
