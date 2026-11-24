import { expect, test, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ADMIN_TEST_KEY } from "./admin-wallet";
import { installSigningWallet } from "./signing-wallet";

/**
 * Public status page and private admin dashboard (M9 Part 5, boards 51–54). Health checks are off on the test server
 * (CRYPY_WORKER_SKIP=health), so the status page shows "Not checked yet" everywhere: nothing is claimed without a
 * saved result.
 */
async function wallet(page: Page, key: `0x${string}`) {
  const account = privateKeyToAccount(key);
  await page.exposeFunction("__testSign", (raw: string) =>
    account.signMessage({ message: { raw: raw as `0x${string}` } }),
  );
  await page.addInitScript(installSigningWallet, account.address);
  return account.address;
}

async function signIn(page: Page) {
  await page.getByRole("button", { name: "Connect wallet and sign in" }).click();
  await page.getByRole("button", { name: "Test Wallet" }).click();
}

test("status page: every tool and chain listed, nothing claimed before a check, in the sitemap", async ({
  page,
  request,
}) => {
  await page.goto("/en/status");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CRYPY status");
  const banner = page.getByRole("status").filter({ hasText: "Not checked yet" });
  await expect(banner).toBeVisible();
  for (const group of ["Website", "Tools", "Chains", "Alerts and daily checks", "Features: live and coming"])
    await expect(page.getByRole("heading", { level: 2, name: group })).toBeVisible();
  await expect(
    page.getByTestId("status-tool:token-security").getByRole("link", { name: "Token Security Scanner" }),
  ).toHaveAttribute("href", "/en/tools/token-security");
  await expect(page.getByTestId("status-chain:arbitrum")).toContainText("Not checked yet");
  // Browser-only tools work whenever the website does; the website isn't checked here, so they aren't claimed either.
  await expect(page.getByTestId("status-tool:unit-converter")).toContainText("Not checked yet");
  // (Updates themselves are tested below; other test runs may have published one already.)
  await expect(page.getByRole("heading", { level: 2, name: "Updates" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Status" })).toHaveAttribute(
    "href",
    "/en/status",
  );
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/en/status</loc>");
  expect(sitemap).not.toContain("/admin");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /*/admin");
});

test("admin page: signed out it shows only the sign-in, and is hidden from search engines", async ({ page }) => {
  await page.goto("/en/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin sign-in" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  await expect(page.getByText("All checks")).toHaveCount(0);
  await expect(page.getByText("Free plans used today")).toHaveCount(0);
});

test("admin APIs refuse visitors without an admin session and requests from other sites", async ({ request }) => {
  const body = { title: "Test title", body: "Test body", state: "ongoing", component: null };
  const signedOut = await request.post("/api/v1/admin/status-updates", {
    data: body,
    headers: { origin: "http://localhost:3200" },
  });
  expect(signedOut.status()).toBe(401);
  const crossSite = await request.post("/api/v1/admin/status-updates", {
    data: body,
    headers: { origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);
  const patch = await request.patch("/api/v1/admin/status-updates/00000000-0000-4000-8000-000000000000", {
    data: { state: "fixed" },
    headers: { origin: "http://localhost:3200" },
  });
  expect(patch.status()).toBe(401);
});

test("a wallet that isn't an admin sees nothing about the site's health", async ({ page }) => {
  test.setTimeout(90_000);
  await wallet(page, generatePrivateKey());
  await page.goto("/en/admin");
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "This wallet isn't an admin" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("All checks")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Admin sign-in" })).toBeVisible({ timeout: 30_000 });
});

test("admin: dashboard after sign-in; a published update shows on the status page and can be marked fixed", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await wallet(page, ADMIN_TEST_KEY);
  await page.goto("/en/admin");
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Site health" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("admin-signed-in")).toContainText("(admin)");
  for (const section of [
    "All checks",
    "What visitors got (last 24 hours)",
    "Free plans used today",
    "Server",
    "Failed checks (last 24 hours)",
    "Status updates on the public page",
  ])
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  // Health checks are off on the test server: nothing has run, so nothing is shown as working.
  await expect(page.getByTestId("check-website")).toContainText("Not checked yet");
  await page.getByRole("link", { name: "Chains", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/admin\?show=chain$/);
  await expect(page.getByTestId("check-chain:ethereum")).toBeVisible();
  await expect(page.getByTestId("check-website")).toHaveCount(0);

  const title = `Activity is slow ${info.project.name} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Affects").selectOption({ label: "Address Analyzer" });
  await page.getByLabel("What visitors should know").fill("Activity still loads, but can take up to 20 seconds.");
  await page.getByRole("button", { name: "Publish update" }).click();
  await expect(page.getByText("Published. It's on the status page now.")).toBeVisible({ timeout: 15_000 });

  const status = await page.context().newPage();
  await status.goto("/en/status");
  const update = status.locator("#main article").filter({ hasText: title });
  await expect(update).toContainText("Ongoing");
  await expect(update).toContainText("Affects: Address Analyzer");
  await expect(update).toContainText("Activity still loads, but can take up to 20 seconds.");

  await page.locator("li").filter({ hasText: title }).getByRole("button", { name: "Mark fixed" }).click();
  await expect(page.locator("li").filter({ hasText: title }).getByRole("button", { name: "Mark ongoing" })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await status.reload();
  await expect(status.locator("#main article").filter({ hasText: title })).toContainText("Fixed");
});
