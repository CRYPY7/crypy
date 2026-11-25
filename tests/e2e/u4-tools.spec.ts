import { expect, test } from "@playwright/test";

/** Browser-only tools batch U4: nothing typed (or any file chosen) may leave the page. */
function trackRequests(page: import("@playwright/test").Page) {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).pathname.startsWith("/_next/static/")) urls.push(request.url());
  });
  return urls;
}

const SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("signature verifier: the example's signer matches, another address doesn't", async ({ page }) => {
  await page.goto("/en/tools/signature-verifier", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByTestId("signature-verdict")).toContainText("The expected address signed this");
  await expect(page.getByText(SIGNER, { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Expected signer (optional)" })
    .fill("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  await expect(page.getByTestId("signature-verdict")).toContainText("Not signed by the expected address");
  await page.getByRole("textbox", { name: "Signature" }).fill("0x1234");
  await expect(page.getByText(/This isn't a valid signature/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("raw transaction decoder: sender, hash and a link to decode the call data", async ({ page }) => {
  await page.goto("/en/tools/raw-tx-decoder", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("heading", { name: "EIP-1559 transaction" })).toBeVisible();
  await expect(page.getByText(SIGNER, { exact: true })).toBeVisible();
  await expect(page.getByText("Ethereum (1)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Decode this call data" })).toHaveAttribute(
    "href",
    /\/en\/tools\/tx-decoder#data=0xa9059cbb/,
  );
  await page.getByRole("textbox", { name: "Raw transaction or RLP" }).fill("0xc483010203");
  await expect(page.getByRole("heading", { name: "RLP data" })).toBeVisible();
  expect(requests).toEqual([]);
});

test("file hash checker: matching and different checksums; the file is never uploaded", async ({ page }) => {
  await page.goto("/en/tools/file-hash", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page
    .getByLabel("File to check")
    .setInputFiles({ name: "wallet.dmg", mimeType: "application/octet-stream", buffer: Buffer.from("abc") });
  await expect(page.getByTestId("hash-verdict")).toContainText("Hashes ready");
  await page
    .getByRole("textbox", { name: "Published checksum" })
    .fill("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  wallet.dmg");
  await expect(page.getByTestId("hash-verdict")).toContainText("Checksum matches");
  await page.getByRole("textbox", { name: "Published checksum" }).fill(`sha256:${"0".repeat(64)}`);
  await expect(page.getByTestId("hash-verdict")).toContainText("Checksum doesn't match");
  expect(requests).toEqual([]);
});

test("Bitcoin fee calculator: size and fee from inputs, outputs and a rate", async ({ page }) => {
  await page.goto("/en/tools/bitcoin-fee", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  await page.getByRole("textbox", { name: "Fee rate" }).fill("10");
  await expect(page.getByText("141 vB")).toBeVisible();
  await expect(page.getByText("1,410 sats")).toBeVisible();
  await expect(page.getByText("0.00001410 BTC")).toBeVisible();
  expect(requests).toEqual([]);
});

test("address book: save, recognise, catch a look-alike, refuse a recovery phrase, keep after reload", async ({
  page,
}) => {
  await page.goto("/en/tools/address-book", { waitUntil: "networkidle" });
  const requests = trackRequests(page);
  const saved = "0x1111aaaa2222bbbb3333cccc4444dddd5555eeee";
  await page.getByRole("textbox", { name: "Address", exact: true }).fill(saved);
  await page.getByRole("textbox", { name: "Name" }).fill("Exchange deposit");
  await page.getByRole("button", { name: "Add to address book" }).click();
  await expect(page.getByText("Saved: Exchange deposit")).toBeVisible();
  const check = page.getByRole("textbox", { name: "Address you're about to use" });
  await check.fill(saved.toUpperCase().replace("0X", "0x"));
  await expect(page.getByTestId("book-verdict")).toContainText("In your address book: Exchange deposit");
  await check.fill(`0x1111${"9".repeat(32)}eeee`);
  await expect(page.getByTestId("book-verdict")).toContainText("Look-alike address");
  await page
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("legal winner thank year wave sausage worth useful legal winner thank yellow");
  await page.getByRole("textbox", { name: "Name" }).fill("x");
  await page.getByRole("button", { name: "Add to address book" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /looks like a recovery phrase/ })).toBeVisible();
  expect(requests).toEqual([]);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Exchange deposit", { exact: true })).toBeVisible();
});
