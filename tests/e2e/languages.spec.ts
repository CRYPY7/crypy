import { expect, test } from "@playwright/test";
import { localeConfigs, locales } from "../../src/i18n/locales";

/**
 * Beta languages (owner decision 2026-11-23): translated in full, offered in the language menu with a notice, and kept
 * out of search engines until a native speaker reviews them.
 */
const beta = locales.filter((code) => localeConfigs[code].status === "beta");

test("there is at least one beta language", () => {
  expect(beta.length).toBeGreaterThan(0);
});

for (const locale of beta) {
  test(`${locale}: translated pages, beta notice, hidden from search engines`, async ({ page, request }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("note")).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    // The home page heading is translated, not the English fallback.
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      "Check any wallet, token or transaction before you trust it.",
    );

    await page.goto(`/${locale}/learn/token-approvals`);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      "Token approvals explained, and how to revoke them",
    );
    await expect(page.getByText("This guide isn't translated yet")).toHaveCount(0);

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain(`/${locale}/`);
  });

  test(`${locale}: listed with the other languages`, async ({ page }) => {
    await page.goto("/en");
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: localeConfigs[locale].nativeName, exact: true }),
    ).toHaveAttribute("href", `/${locale}`);
  });
}
