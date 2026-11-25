import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Stabilization S2 (boards 60–61): when a chain fails now, the page shows its last reading with its age; with nothing
 * saved it says "not checked", never an error or "empty". The outage is simulated for this one address only
 * (CRYPY_FAULT_FILE), so other tests running at the same time aren't affected. Live data.
 */
const ADDRESS = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";
const FAULTS = ".data/e2e-faults";

function setFaults(lines: string[]) {
  mkdirSync(".data", { recursive: true });
  writeFileSync(FAULTS, lines.join("\n"));
}

test.describe.configure({ mode: "serial" });
test.afterEach(() => setFaults([]));
// One drill file for the whole server: the desktop run only, so two runs never change it at the same time.
test.skip(({ isMobile }) => isMobile, "desktop only (shared drill file)");

test("a chain that fails now shows its last reading with its age, and one never read says 'not checked'", async ({
  page,
}) => {
  test.setTimeout(180_000);
  setFaults([]);
  // 1. A normal visit reads Ethereum and saves it.
  await page.goto(`/en/address/${ADDRESS}?chains=ethereum`);
  await expect(page.getByRole("heading", { name: /Total value/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^Read /).first()).toBeVisible();

  // 2. Ethereum and BNB Chain go down for this address (a different chain choice, so the page reads again).
  setFaults([`ethereum:${ADDRESS.toLowerCase()}`, `bsc:${ADDRESS.toLowerCase()}`]);
  await page.waitForTimeout(700);
  await page.goto(`/en/address/${ADDRESS}?chains=ethereum,bsc`);
  const saved = page.locator('[data-freshness="saved"]').filter({ visible: true });
  await expect(saved).toHaveCount(1, { timeout: 60_000 });
  await expect(saved).toContainText(/Ethereum: shown from \d+ minutes? ago/);
  await expect(saved).toContainText("Balances may have changed since.");
  await expect(saved.getByRole("button", { name: "Try again" })).toBeVisible();
  const notChecked = page.locator('[data-freshness="not-checked"]').filter({ visible: true });
  await expect(notChecked).toContainText("BNB Chain: not checked");
  await expect(notChecked).toContainText('this isn\'t "empty"');
  // The chain's card never says it holds nothing.
  await expect(page.getByText("No coins or tokens on BNB Chain.").filter({ visible: true })).toHaveCount(0);
  // Visible copies only: while a page streams, Next.js briefly keeps a hidden copy of the incoming part.
  await expect(page.getByText("Includes Ethereum from an earlier reading.").filter({ visible: true })).toHaveCount(1);
  await expect(
    page
      .getByText(/From \d+ minutes? ago/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // No red error box on the page.
  await expect(page.getByText(/couldn't check .* right now/i)).toHaveCount(0);

  // 3. The chains are back: "Try again" reads them fresh.
  setFaults([]);
  await page.waitForTimeout(700);
  // Free public nodes can also fail for real under the full test run: press "Try again" as a visitor would until
  // the fresh reading arrives (a real failure correctly keeps showing the saved one).
  await expect(async () => {
    const notices = page.locator('[data-freshness="saved"], [data-freshness="not-checked"]').filter({ visible: true });
    const button = notices.getByRole("button", { name: "Try again" });
    if (await button.count()) await button.first().click();
    await expect(notices).toHaveCount(0, { timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
});

test("a slow chain shows its last reading at once, marked 'checking for changes', and the page updates itself", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const address = "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0";
  setFaults([]);
  await page.goto(`/en/address/${address}?chains=ethereum`);
  await expect(page.getByRole("heading", { name: /Total value/ })).toBeVisible({ timeout: 60_000 });

  // Ethereum now answers 4 s late for this address: the saved reading is shown at once instead of waiting.
  setFaults([`slow:ethereum:${address.toLowerCase()}`]);
  await page.waitForTimeout(700);
  await page.goto(`/en/address/${address}?chains=ethereum,bsc`);
  const checking = page.locator('[data-freshness="checking"]').filter({ visible: true });
  await expect(checking).toHaveCount(1, { timeout: 30_000 });
  await expect(checking).toContainText(/Ethereum: shown from \d+ minutes? ago · checking for changes…/);
  await expect(checking).toContainText("This page updates by itself.");
  await expect(page.locator('[data-freshness="saved"]').filter({ visible: true })).toHaveCount(0);

  // The page reloads itself and shows the fresh reading.
  await expect(checking).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("Includes Ethereum from an earlier reading.").filter({ visible: true })).toHaveCount(0);
});

test.describe("crawlers on result pages (S3, B-021 follow-up)", () => {
  test("a known crawler gets the light page with no blockchain lookups", async ({ request }, info) => {
    test.skip(info.project.name !== "desktop", "one run is enough");
    const res = await request.get("/en/address/0x000000000000000000000000000000000000dEaD", {
      headers: {
        "user-agent": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
      },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Automated clients and crawlers get no live data here.");
  });
});
