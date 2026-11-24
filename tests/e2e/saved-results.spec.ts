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

test.afterEach(() => setFaults([]));
// One drill file for the whole server: the desktop run only, so two runs never change it at the same time.
test.skip(({ isMobile }) => isMobile, "desktop only (shared drill file)");

test("a chain that fails now shows its last reading with its age, and one never read says 'not checked'", async ({
  page,
}) => {
  test.setTimeout(120_000);
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
  await saved.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator('[data-freshness="saved"]').filter({ visible: true })).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(page.locator('[data-freshness="not-checked"]').filter({ visible: true })).toHaveCount(0);
});
