import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility (M9): WCAG 2.2 AA rules checked by axe on the main page types, in both themes. Any violation fails the
 * test and names the rule and the elements, so a regression shows up in the normal test run.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {}
      }, theme);
    });

    for (const path of [
      "/en",
      "/en/tools",
      "/en/tools/token-security",
      "/en/tools/gas-tracker",
      "/en/settings",
      "/ur",
      "/en/learn",
      "/en/learn/token-approvals",
      "/en/gas/ethereum",
      "/en/tokens",
      "/en/status",
      "/en/admin",
    ]) {
      test(`no accessibility violations: ${path}`, async ({ page }) => {
        await page.goto(path, { waitUntil: "load" });
        await expectNoViolations(page);
      });
    }

    test("no accessibility violations: the tools dialog", async ({ page }) => {
      await page.goto("/en", { waitUntil: "load" });
      // The shortcut works once the page's code has loaded; press again until it opens.
      await expect(async () => {
        await page.keyboard.press("Control+k");
        await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      await expectNoViolations(page);
    });
  });
}

test("no accessibility violations: a transaction and an address's approvals (live data)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/tx/0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6?chain=ethereum");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(page);
  await page.goto("/en/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045/approvals");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expectNoViolations(page);
});

test("the search box shows a visible focus ring for keyboard users", async ({ page }) => {
  await page.goto("/en", { waitUntil: "load" });
  const form = page.locator("main form[role=search]");
  await form.locator("input").focus();
  const ring = await form.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring).not.toBe("none");
});
