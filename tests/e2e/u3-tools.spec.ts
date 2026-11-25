import { expect, test } from "@playwright/test";

/** Developer tools batch U3: everything runs in the browser, so nothing typed may leave the page. */
function trackRequests(page: import("@playwright/test").Page) {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).pathname.startsWith("/_next/static/")) urls.push(request.url());
  });
  return urls;
}

test("keccak: hash, selector and event topic", async ({ page }) => {
  await page.goto("/en/tools/keccak-hash", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("0xa9059cbb", { exact: true })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Text, hex or a signature" });
  await input.fill("event Transfer(address indexed from, address indexed to, uint256 value)");
  await expect(
    page.getByText("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", { exact: true }),
  ).toBeVisible();
  await input.fill("abc");
  await expect(
    page.getByText("0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Hex bytes" }).check();
  await expect(page.getByText(/Hex bytes are 0–9 and a–f/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("ABI encoder: encode a call, then decode it back", async ({ page }) => {
  await page.goto("/en/tools/abi-encoder", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("3 functions, 2 events, 1 errors")).toBeVisible();
  await page.getByRole("textbox", { name: "to (address)" }).fill("0xdac17f958d2ee523a2206206994597c13d831ec7");
  await page.getByRole("textbox", { name: "amount (uint256)" }).fill("1000000");
  const data =
    "0xa9059cbb000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec700000000000000000000000000000000000000000000000000000000000f4240";
  await expect(page.getByText(data, { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "amount (uint256)" }).fill("1.5");
  await expect(page.getByText(/Enter a whole number/)).toBeVisible();
  await page.getByRole("radio", { name: "Decode call data" }).check();
  await page.getByRole("textbox", { name: "Call data" }).fill(data);
  await expect(page.getByRole("heading", { name: /Decoded as transfer\(address,uint256\)/ })).toBeVisible();
  await expect(page.getByText("1000000", { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test("the transaction decoder hands unknown data to the ABI tool in the fragment", async ({ page }) => {
  await page.goto("/en/tools/tx-decoder", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("textbox", { name: "Transaction input data" }).fill(`0x12345678${"00".repeat(32)}`);
  const link = page.getByRole("link", { name: "Decode it with the contract’s own ABI" });
  await expect(link).toHaveAttribute("href", /\/en\/tools\/abi-encoder#data=0x12345678/);
  expect(requests).toEqual([]);
  await link.click();
  await page.getByRole("textbox", { name: "Contract ABI" }).fill("function foo(uint256 a)");
  await expect(page.getByRole("radio", { name: "Decode call data" })).toBeChecked();
  await expect(page.getByText(/Nothing in this ABI matches/)).toBeVisible();
});

test("encoding converter: text, Base64 and Base58", async ({ page }) => {
  await page.goto("/en/tools/encoding-converter", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  const input = page.getByRole("textbox", { name: "Value" });
  await input.fill("Hello");
  await expect(page.getByText("SGVsbG8=", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("9Ajdvzr", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Base58" }).check();
  await input.fill("0OIl");
  await expect(page.getByText("This isn't valid Base58.")).toBeVisible();
  expect(requests).toEqual([]);
});

test("JSON and CSV: convert a list and point at a JSON error", async ({ page }) => {
  await page.goto("/en/tools/json-csv", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText(/chain,symbol,decimals/)).toBeVisible();
  await page.getByRole("radio", { name: "Format JSON" }).check();
  await page.getByRole("textbox", { name: "JSON or CSV" }).fill('{\n  "a": 1,\n}');
  await expect(page.getByText(/line 3/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("the Developer group folds in the sidebar", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "sidebar is desktop only");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const group = page.locator("#tools-sidebar details", { hasText: "Developer" });
  await expect(group).not.toHaveAttribute("open");
  await group.locator("summary").click();
  await expect(group.getByRole("link", { name: "ABI Encoder" })).toBeVisible();
  await page.goto("/en/tools/keccak-hash");
  await expect(page.locator("#tools-sidebar details", { hasText: "Developer" })).toHaveAttribute("open", "");
});
