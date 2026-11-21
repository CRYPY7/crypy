import { expect, test } from "@playwright/test";

test.describe("desktop tools sidebar", () => {
  test.skip(({ isMobile }) => isMobile, "The sidebar is a desktop (1024px and wider) layout.");

  test("lists every tool, marks the current page and opens tools", async ({ page }) => {
    await page.goto("/en/tools/unit-converter");
    const sidebar = page.getByRole("complementary", { name: "Tools" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Unit Converter" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: /Watchlist.*Soon/ })).toBeVisible();
    await sidebar.getByRole("link", { name: "Hex Converter" }).click();
    await expect(page).toHaveURL(/\/en\/tools\/hex-converter$/);
    await expect(sidebar.getByRole("link", { name: "Hex Converter" })).toHaveAttribute("aria-current", "page");
  });

  test("collapses to icons and remembers it on the next page load", async ({ page }) => {
    await page.goto("/en");
    const sidebar = page.getByRole("complementary", { name: "Tools" });
    const open = (await sidebar.boundingBox())!.width;
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    expect((await sidebar.boundingBox())!.width).toBeLessThan(open / 2);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "collapsed");
  });

  test("collapse button is on screen without scrolling, and stays there", async ({ page }) => {
    for (const path of ["/en", "/ar/tools/hex-converter"]) {
      await page.goto(path);
      const button = page.getByRole("button", { name: "Collapse sidebar" });
      await expect(button).toBeInViewport({ ratio: 1 });
      await page.mouse.wheel(0, 1500);
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("banner")).toBeInViewport();
    }
  });

  test("shows full tool names and fits every tool on a 1440x900 window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    const cut = await page
      .locator("#tools-sidebar .sidebar-label")
      .evaluateAll((labels) =>
        labels
          .filter((label) => label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight + 1)
          .map((l) => l.textContent),
      );
    expect(cut).toEqual([]);
    const list = page.locator("#tools-sidebar nav");
    const overflow = await list.evaluate((nav) => nav.scrollHeight - nav.clientHeight);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("hides the header search on the home page only", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("banner").getByRole("search")).toBeHidden();
    await page.goto("/en/tools/unit-converter");
    await expect(page.getByRole("banner").getByRole("search")).toBeVisible();
  });

  test("is hidden on tablets, where the header keeps its menu", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/en");
    await expect(page.getByRole("complementary", { name: "Tools" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Portfolio" })).toBeVisible();
  });
});

test("home shows the supported chains with their icons", async ({ page }) => {
  await page.goto("/en");
  const row = page.getByText("Works on").locator("..");
  await expect(row.getByText("Ethereum")).toBeVisible();
  await expect(row.getByText("BNB Chain")).toBeVisible();
  await expect(row.locator('img[src="/chains/ethereum.svg"]')).toHaveCount(1);
});

/** Live data: looks up a real address, then checks breadcrumbs and the device-only recent list. */
test("entity pages show breadcrumbs and appear under recently viewed", async ({ page }) => {
  const address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  await page.goto("/en");
  await expect(page.getByTestId("recent")).toHaveCount(0);
  await page.goto(`/en/address/${address}`);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs).toBeVisible({ timeout: 30_000 });
  await expect(crumbs.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/en");
  // The visit is saved by the page's browser code once it has loaded; leave only after that.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("crypy.recent") ?? ""), { timeout: 30_000 })
    .toContain(address);
  await page.goto("/en");
  const recent = page.getByTestId("recent");
  await expect(recent.getByRole("link", { name: /0xd8dA…6045/ })).toHaveAttribute("href", `/en/address/${address}`);
  await recent.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("recent")).toHaveCount(0);
});
