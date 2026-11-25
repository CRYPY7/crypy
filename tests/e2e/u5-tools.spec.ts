import { expect, test } from "@playwright/test";

/** Browser-only tools batch U5: nothing typed or pasted may leave the page. */
function trackRequests(page: import("@playwright/test").Page) {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).pathname.startsWith("/_next/static/")) urls.push(request.url());
  });
  return urls;
}

test("profit calculator: average cost, profit and break-even from two buys", async ({ page }) => {
  await page.goto("/en/tools/profit-calculator", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("textbox", { name: "Amount bought (buy 1)" }).fill("1");
  await page.getByRole("textbox", { name: "Price paid per coin (buy 1)" }).fill("2000");
  await page.getByRole("button", { name: "Add another buy" }).click();
  await page.getByRole("textbox", { name: "Amount bought (buy 2)" }).fill("1");
  await expect(page.getByText("Type both the amount and the price for this buy.")).toBeVisible();
  await page.getByRole("textbox", { name: "Price paid per coin (buy 2)" }).fill("3000");
  await page.getByRole("textbox", { name: "Buy fees (optional)" }).fill("10");
  await page.getByRole("textbox", { name: "Selling price" }).fill("2000");
  await page.getByRole("textbox", { name: "Selling fee (optional)" }).fill("0.1");
  // Paid 5,010 for 2 coins; sold for 4,000 minus a 4.00 fee.
  await expect(page.getByText("$2,505.00")).toBeVisible();
  await expect(page.getByText("-$1,014.00")).toBeVisible();
  await expect(page.getByText("$2,507.51")).toBeVisible();
  expect(requests).toEqual([]);
});

test("bytecode comparer: the example is the same code with different metadata", async ({ page }) => {
  await page.goto("/en/tools/bytecode-compare", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByTestId("bytecode-verdict")).toContainText("Same code, different metadata");
  await expect(page.getByText("solc 0.8.26").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Second bytecode" }).fill("0x60806040zz");
  await expect(page.getByText("Only hex characters (0–9, a–f) are allowed.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Second bytecode" })
    .fill("0x363d3d373d3d3d363d73bebebebebebebebebebebebebebebebebebebebe5af43d82803e903d91602b57fd5bf3");
  await expect(page.getByTestId("bytecode-verdict")).toContainText("Different code");
  await expect(page.getByText(/A minimal proxy \(EIP-1167\)/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("NFT URI decoder: on-chain example shows traits and an image; a script is flagged", async ({ page }) => {
  await page.goto("/en/tools/nft-uri-decoder", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("Example #7", { exact: true })).toBeVisible();
  await expect(page.getByTestId("nft-traits")).toContainText("Circle");
  await expect(page.getByRole("img", { name: "Image of Example #7" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Token URI or metadata JSON" })
    .fill('{"name":"Bad","image":"https://example.com/1.png","external_url":"javascript:alert(1)"}');
  await expect(page.getByTestId("nft-findings")).toContainText("External link: A javascript: link");
  await expect(page.getByTestId("nft-findings")).toContainText("Image: Stored on an ordinary web server");
  await page.getByRole("textbox", { name: "Token URI or metadata JSON" }).fill("ipfs://QmHash/{id}.json");
  await page.getByRole("textbox", { name: "Token id (optional)" }).fill("1");
  await expect(page.getByText(`https://ipfs.io/ipfs/QmHash/${"0".repeat(63)}1.json`)).toBeVisible();
  expect(requests).toEqual([]);
});

test("JSON diff: the example lists the changed owner, fee and added feature", async ({ page }) => {
  await page.goto("/en/tools/json-diff", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByTestId("json-diff-summary")).toHaveText("1 added · 0 removed · 2 changed");
  await expect(page.getByText("$.fees.sell", { exact: true })).toBeVisible();
  await expect(page.getByText("$.features[2]", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "New JSON" }).fill('{\n  "a": }');
  await expect(page.getByText("Not valid JSON: line 2, column 8.")).toBeVisible();
  expect(requests).toEqual([]);
});

test("calldata gas: an ERC-20 transfer's intrinsic gas and floor", async ({ page }) => {
  await page.goto("/en/tools/calldata-gas", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  // 68 bytes: 27 non-zero, 41 zero → 21,000 + 41×4 + 27×16 = 21,596; floor 21,000 + 10 × 149 = 22,490.
  await expect(page.getByText("21,596 gas")).toBeVisible();
  await expect(page.getByText("22,490 gas")).toBeVisible();
  await expect(page.getByTestId("calldata-floor")).toContainText("less than 894 gas");
  await expect(page.getByRole("link", { name: "Decode this data" })).toHaveAttribute(
    "href",
    /\/en\/tools\/tx-decoder#data=0xa9059cbb/,
  );
  expect(requests).toEqual([]);
});
