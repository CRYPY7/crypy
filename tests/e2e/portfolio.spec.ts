import { expect, test } from "@playwright/test";

/** Portfolio (M8): saved only in this browser, live balances for each wallet. */
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const BINANCE = "0x28C6c06298d514Db089934071355E5743bf21d60";

test("empty portfolio explains itself; the add dialog refuses seed phrases, bad checksums and duplicates", async ({
  page,
}) => {
  await page.goto("/en/tools/portfolio");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Track all your wallets in one place" })).toBeVisible();
  await main.getByRole("button", { name: "Add wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a wallet" });
  const address = dialog.getByLabel("Wallet address");

  await address.fill("abandon ability able about above absent absorb abstract absurd abuse access accident");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText(/looks like a seed phrase or private key/)).toBeVisible();
  await expect(address).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("crypy.portfolio"))).toBeNull();

  await address.fill(VITALIK.replace("d8dA", "d8Da"));
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText(/don't match its checksum/)).toBeVisible();

  await address.fill(VITALIK);
  await dialog.getByLabel("Label (optional)").fill("Main");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  await main.getByRole("button", { name: "Add wallet" }).click();
  await dialog.getByLabel("Wallet address").fill(VITALIK.toLowerCase());
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("This wallet is already in your portfolio.")).toBeVisible();
});

test("two wallets: combined total, wallet rows, holdings, kept after reload, removable", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/en/tools/portfolio");
  await page.evaluate(
    ([a, b]) =>
      localStorage.setItem(
        "crypy.portfolio",
        JSON.stringify({
          v: 1,
          wallets: [
            { address: a, label: "Main", addedAt: 1 },
            { address: b, label: "Exchange", addedAt: 2 },
          ],
          snapshot: null,
        }),
      ),
    [VITALIK, BINANCE],
  );
  await page.reload();
  const main = page.locator("#main");
  const rows = main.getByTestId("portfolio-wallet");
  await expect(rows).toHaveCount(2);
  await expect(main.getByText("Total value · 2 wallets")).toBeVisible();
  // Both wallets loaded: no "…" left and a dollar total.
  await expect(main.getByRole("status")).toHaveCount(0, { timeout: 120_000 });
  await expect(main.getByTestId("portfolio-total")).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await expect(main.getByRole("heading", { name: "Top holdings" })).toBeVisible();
  await expect(main.getByRole("cell", { name: /^ETH/ }).first()).toBeVisible();
  await expect(main.getByText(/^Safe$/)).toHaveCount(0);
  // The last total is kept for "since you last looked".
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("crypy.portfolio") ?? "{}"));
  expect(typeof saved.snapshot?.totalUsd).toBe("number");

  await main.getByRole("button", { name: "Remove Exchange from the portfolio" }).click();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(main.getByTestId("portfolio-wallet")).toHaveCount(1);
  await expect(main.getByText("Main", { exact: true })).toBeVisible();
});
