import { expect, test } from "@playwright/test";

test("redirects to the visitor's language and shows the home page", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(failed, "every script, style and font loads").toEqual([]);
  // Styles applied: the dark theme background is not the browser default white.
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  expect(background).not.toBe("rgb(255, 255, 255)");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Check any wallet");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("looks up a pasted address only through CRYPY's own server and opens its page", async ({ page, baseURL }) => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";
  const requests: string[] = [];
  await page.goto("/en", { waitUntil: "networkidle" });
  page.on("request", (request) => requests.push(request.url()));
  const search = page.locator("main form[role=search]");
  await search.locator("input").fill(address);
  await search.getByRole("button").click();
  // Used on one chain or none → straight to the address page; on several → a chain list with an overview link.
  const overview = page.getByRole("link", { name: /Open overview on all chains/ });
  await expect(overview.or(page.getByRole("heading", { name: "Address" }))).toBeVisible({ timeout: 20_000 });
  if (await overview.isVisible()) await overview.click();
  await expect(page).toHaveURL(/\/en\/address\/0x1234567890AbcdEF1234567890aBcdef12345678$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  const leaked = requests.filter((url) => url.toLowerCase().includes(address) && !url.startsWith(baseURL!));
  expect(leaked).toEqual([]);
});

test("opens the All tools menu and finds a tool", async ({ page, isMobile }) => {
  await page.goto("/en", { waitUntil: "networkidle" });
  if (isMobile) {
    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Tools" }).click();
  } else {
    await page.keyboard.press("Control+k");
  }
  const input = page.getByLabel("Find a tool");
  await expect(input).toBeVisible();
  await input.fill("honeypot");
  await expect(page.getByRole("link", { name: /Token Security Scanner/ })).toBeVisible();
  await page.getByRole("link", { name: /Token Security Scanner/ }).click();
  await expect(page).toHaveURL(/\/en\/tools\/token-security$/);
  await expect(page.getByLabel("Token contract address")).toBeVisible();
});

test("uses a right-to-left layout for Urdu", async ({ page }) => {
  await page.goto("/ur");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ur");
});

test("switches theme", async ({ page }) => {
  await page.goto("/en/settings", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("sends security headers", async ({ request }) => {
  const response = await request.get("/en");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("language menu keeps the current page", async ({ page }) => {
  await page.goto("/en/tools/portfolio", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Language" }).first().click();
  const english = page.getByRole("link", { name: "English" }).first();
  await expect(english).toBeVisible();
  await expect(english).toHaveAttribute("href", "/en/tools/portfolio");
});

test("loads the tools dialog code only when it is opened", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".js")) scripts.push(response.url());
  });
  await page.goto("/en", { waitUntil: "networkidle" });
  const before = scripts.length;
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Find a tool")).toBeVisible();
  expect(scripts.length).toBeGreaterThan(before);
});

/**
 * Performance budget: keeps every page light so it loads fast on slow mobile connections.
 * Measured uncompressed (what the browser must parse). Raise only with a written reason in PROGRESS.md.
 */
const JS_BUDGET_KB = 650;
const CSS_BUDGET_KB = 80; // One shared, cached file: 62 KB raw ≈ 11 KB gzipped at M4.

for (const path of [
  "/en",
  "/en/tools",
  "/en/tools/token-security",
  "/en/tools/tx-decoder",
  "/en/tools/address-formatter",
  "/en/settings",
]) {
  test(`stays within the performance budget: ${path}`, async ({ page }) => {
    let js = 0;
    let css = 0;
    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/_next/static/")) return;
      const size = (await response.body().catch(() => Buffer.alloc(0))).length;
      if (url.endsWith(".js")) js += size;
      if (url.endsWith(".css")) css += size;
    });
    await page.goto(path, { waitUntil: "networkidle" });
    expect(Math.round(js / 1024), "JavaScript KB").toBeLessThanOrEqual(JS_BUDGET_KB);
    expect(Math.round(css / 1024), "CSS KB").toBeLessThanOrEqual(CSS_BUDGET_KB);
  });
}

test("the watchlist asks to sign in and explains alerts", async ({ page }) => {
  await page.goto("/en/tools/watchlist");
  await expect(page.getByRole("heading", { name: "Sign in to use the watchlist" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#main")).toContainText("Alerts in Telegram with quiet hours");
});

test("an unknown tool address shows the not-found page", async ({ page }) => {
  const response = await page.goto("/en/tools/upcoming");
  expect(response?.status()).toBe(404);
});
