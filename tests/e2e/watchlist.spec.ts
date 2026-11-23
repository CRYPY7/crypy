import { expect, test, type Page } from "@playwright/test";
import { fakeTelegramUrl } from "./fake-telegram";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { installSigningWallet } from "./signing-wallet";

/**
 * Watchlist (M8 Part 2): wallet sign-in, saving items and alert choices, data download and account deletion.
 * The fake wallet signs with a throwaway key created for this run, held only by the test (never by the page).
 */
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const FORBIDDEN = ["eth_sign", "eth_signTypedData", "eth_signTypedData_v4", "eth_sendTransaction", "wallet_sendCalls"];

async function setUp(page: Page) {
  const account = privateKeyToAccount(generatePrivateKey());
  const signed: string[] = [];
  await page.exposeFunction("__testSign", async (raw: string) => {
    signed.push(Buffer.from(raw.slice(2), "hex").toString("utf8"));
    return account.signMessage({ message: { raw: raw as `0x${string}` } });
  });
  await page.addInitScript(installSigningWallet, account.address);
  return { address: account.address, signed };
}

const requests = (page: Page) =>
  page.evaluate(() => (window as unknown as { __walletRequests: { method: string }[] }).__walletRequests);

async function signIn(page: Page) {
  const main = page.locator("#main");
  await main.getByRole("button", { name: "Connect wallet and sign in" }).click();
  await page.getByRole("button", { name: "Test Wallet" }).click();
  await expect(main.getByTestId("watch-count")).toBeVisible({ timeout: 30_000 });
}

test("nothing is signed until the click; the message names this site and isn't a transaction", async ({ page }) => {
  test.setTimeout(90_000);
  const { address, signed } = await setUp(page);
  await page.goto("/en/tools/watchlist");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Sign in to use the watchlist" })).toBeVisible({ timeout: 30_000 });
  expect((await requests(page)).map((r) => r.method)).not.toContain("personal_sign");

  await signIn(page);
  expect(signed).toHaveLength(1);
  const host = new URL(page.url()).host;
  expect(signed[0]!.startsWith(`${host} wants you to sign in with your Ethereum account:\n${address}`)).toBe(true);
  expect(signed[0]).toContain("This is a message, not a transaction");
  expect((await requests(page)).filter((r) => FORBIDDEN.includes(r.method))).toEqual([]);
  await expect(main.getByTestId("signed-in-address")).toContainText(address.slice(0, 6));

  // Still signed in after a reload (httpOnly cookie), without asking the wallet again.
  await page.reload();
  await expect(main.getByTestId("watch-count")).toBeVisible({ timeout: 30_000 });
  expect(signed).toHaveLength(1);
});

test("declining in the wallet signs nothing and says so", async ({ page }) => {
  test.setTimeout(90_000);
  const { signed } = await setUp(page);
  await page.goto("/en/tools/watchlist");
  await page.evaluate(() => localStorage.setItem("__walletReject", "1"));
  const main = page.locator("#main");
  await main.getByRole("button", { name: "Connect wallet and sign in" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Test Wallet" }).click();
  await expect(main.getByText("You declined the message in your wallet. Nothing was signed.")).toBeVisible({
    timeout: 30_000,
  });
  expect(signed).toHaveLength(0);
  const session = await page.request.get("/api/v1/auth/session");
  expect((await session.json()).data.address).toBeNull();
});

test("watch, choose alerts, rename, remove, download and delete the account", async ({ page }) => {
  test.setTimeout(120_000);
  const { address } = await setUp(page);
  await page.goto("/en/tools/watchlist");
  await signIn(page);
  const main = page.locator("#main");
  await expect(main.getByTestId("watch-count")).toHaveText("Watching 0 of 10");

  // One click watches the signed-in wallet with the own-wallet defaults.
  await main.getByRole("button", { name: /Watch my wallet/ }).click();
  const items = main.getByTestId("watch-item");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Your wallet (signed)");

  // A seed phrase is refused and cleared before anything is sent.
  await main.getByRole("button", { name: "Watch an address or token" }).click();
  const dialog = page.getByRole("dialog");
  const target = dialog.getByRole("textbox", { name: "Address" });
  await target.fill("abandon ability able about above absent absorb abstract absurd abuse access accident");
  await dialog.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("seed phrase");
  await expect(target).toHaveValue("");

  await target.fill(VITALIK);
  await dialog.getByRole("textbox", { name: "Label (optional)" }).fill("Vitalik");
  await dialog.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(items).toHaveCount(2);
  const vitalik = items.filter({ hasText: "Vitalik" });
  await expect(vitalik).toContainText("Watch-only");

  // A token (USDT on Ethereum).
  await main.getByRole("button", { name: "Watch an address or token" }).click();
  await dialog.getByRole("radio", { name: "Token", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Network" }).selectOption("ethereum");
  await dialog.getByRole("textbox", { name: "Token contract address" }).fill(USDT);
  await dialog.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(items).toHaveCount(3);
  await expect(main.getByTestId("watch-count")).toHaveText("Watching 3 of 10");

  // Change an alert choice: saved on the server (survives a reload).
  const approvals = vitalik.getByRole("switch", { name: /New approval given/ });
  await expect(approvals).toHaveAttribute("aria-checked", "false");
  await approvals.click();
  await expect(approvals).toHaveAttribute("aria-checked", "true");
  await vitalik.getByRole("button", { name: "Rename Vitalik" }).click();
  await dialog.getByRole("textbox").fill("V");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(items.filter({ hasText: /^V/ }).first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(items).toHaveCount(3, { timeout: 30_000 });
  const renamed = items.filter({ has: page.getByRole("link", { name: "V", exact: true }) });
  await expect(renamed.getByRole("switch", { name: /New approval given/ })).toHaveAttribute("aria-checked", "true");

  // Remove.
  await renamed.getByRole("button", { name: "Stop watching V" }).click();
  await expect(items).toHaveCount(2);

  // Download: the export holds the address and the two remaining items, nothing else personal.
  const exported = await page.request.get("/api/v1/account/export");
  expect(exported.headers()["content-disposition"]).toContain("crypy-my-data.json");
  const data = (await exported.json()) as { wallets: { accountId: string }[]; watchlist: unknown[] };
  expect(data.wallets.map((w) => w.accountId)).toEqual([`eip155:1:${address.toLowerCase()}`]);
  expect(data.watchlist).toHaveLength(2);

  // Delete the account: signed out, and the data is gone.
  await main.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete everything" }).click();
  await expect(main.getByRole("heading", { name: "Sign in to use the watchlist" })).toBeVisible({ timeout: 30_000 });
  expect((await page.request.get("/api/v1/watchlist")).status()).toBe(401);
});

test("account APIs need a session and refuse other sites", async ({ request, baseURL }) => {
  expect((await request.get("/api/v1/watchlist")).status()).toBe(401);
  expect((await request.get("/api/v1/account/export")).status()).toBe(401);
  const crossSite = await request.post("/api/v1/auth/nonce", { headers: { Origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);
  const sameSite = await request.post("/api/v1/auth/nonce", { headers: { Origin: baseURL! } });
  expect(sameSite.status()).toBe(200);
});

const fakeTelegram = process.env.CRYPY_FAKE_TELEGRAM === "1";
const telegramCalls = async (page: Page) =>
  (await (await page.request.get(`${fakeTelegramUrl}/__calls`)).json()) as {
    method: string;
    body: Record<string, unknown>;
  }[];

test("Telegram: connect with the code, test message, quiet hours, mute from Telegram, disconnect", async ({
  page,
}, testInfo) => {
  test.skip(!fakeTelegram, "Needs the stand-in Telegram server (CRYPY_FAKE_TELEGRAM=1).");
  test.setTimeout(120_000);
  const chatId = 4_000 + testInfo.parallelIndex * 10 + (testInfo.project.name === "mobile" ? 1 : 0);
  await setUp(page);
  await page.goto("/en/tools/watchlist");
  await signIn(page);
  const main = page.locator("#main");
  const where = main.getByTestId("where-alerts-go");
  await expect(main.getByText("Checked about every minute", { exact: true })).toBeVisible();
  await expect(main.getByTestId("recent-alerts")).toContainText("No alerts yet");

  // Connect: the page shows a code, a QR code and the bot link; the person presses Start in Telegram.
  await where.getByRole("button", { name: "Connect Telegram" }).click();
  const command = (await where.getByTestId("telegram-command").textContent())!.trim();
  expect(command).toMatch(/^\/start [2-9A-Z]{8}$/);
  await expect(where.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(where.getByRole("link", { name: /Open Telegram/ })).toHaveAttribute(
    "href",
    `https://t.me/crypy_test_bot?start=${command.slice(7)}`,
  );
  await page.request.post(`${fakeTelegramUrl}/__push`, {
    data: {
      message: {
        message_id: 1,
        chat: { id: chatId, type: "private" },
        from: { id: chatId, is_bot: false, username: `tester${chatId}` },
        text: command,
      },
    },
  });
  // The page updates by itself.
  await expect(where.getByTestId("telegram-connected")).toContainText(`@tester${chatId}`, { timeout: 20_000 });
  const toChat = async () => (await telegramCalls(page)).filter((c) => c.body.chat_id === String(chatId));
  expect((await toChat()).some((c) => String(c.body.text).includes("Connected to CRYPY"))).toBe(true);

  await where.getByRole("button", { name: "Send test" }).click();
  await expect(where.getByText("Test sent. Check Telegram.")).toBeVisible();
  const sample = (await toChat()).find((c) => String(c.body.text).includes("Test alert from CRYPY"))!;
  expect(String(sample.body.text)).toContain("never asks you to connect a wallet or sign");
  expect(sample.body.parse_mode).toBe("HTML");

  // Quiet hours.
  await expect(where.getByTestId("quiet-hours")).toContainText("23:00–07:00");
  await where.getByRole("button", { name: "Change" }).click();
  const dialog = page.getByRole("dialog", { name: "Quiet hours" });
  await dialog.getByLabel("From").fill("22:00");
  await dialog.getByLabel("To").fill("06:30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(where.getByTestId("quiet-hours")).toContainText("22:00–06:30");

  // "Mute this wallet" pressed in Telegram mutes the item; the page can turn it back on.
  await main.getByRole("button", { name: /Watch my wallet/ }).click();
  const item = main.getByTestId("watch-item").first();
  await expect(item).toBeVisible();
  const { items } = (await (await page.request.get("/api/v1/watchlist")).json()).data as { items: { id: string }[] };
  await page.request.post(`${fakeTelegramUrl}/__push`, {
    data: {
      callback_query: {
        id: `cb${chatId}`,
        from: { id: chatId, is_bot: false },
        message: { message_id: 5, chat: { id: chatId, type: "private" } },
        data: `mute:${items[0]!.id}`,
      },
    },
  });
  await expect
    .poll(async () => (await telegramCalls(page)).some((c) => c.body.callback_query_id === `cb${chatId}`), {
      timeout: 15_000,
    })
    .toBe(true);
  await page.reload();
  await expect(item.getByTestId("muted-badge")).toBeVisible({ timeout: 30_000 });
  await item.getByRole("button", { name: /Turn alerts back on/ }).click();
  await expect(item.getByTestId("muted-badge")).toBeHidden();

  // Disconnect.
  await where.getByRole("button", { name: "Disconnect Telegram" }).click();
  await page
    .getByRole("alertdialog", { name: "Disconnect Telegram?" })
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(where.getByRole("button", { name: "Connect Telegram" })).toBeVisible();
  await expect
    .poll(async () => (await toChat()).some((c) => String(c.body.text).includes("Disconnected from CRYPY")), {
      timeout: 10_000,
    })
    .toBe(true);
});

test("Portfolio: 'Set up alerts' offers its wallets; keeping the list on the account restores it elsewhere", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { address } = await setUp(page);
  // Two quiet (empty) wallets in this browser's Portfolio.
  const a = "0x000000000000000000000000000000000000dEaD";
  const b = "0x1111111111111111111111111111111111111111";
  await page.goto("/en");
  await page.evaluate(
    ({ a, b }) =>
      localStorage.setItem(
        "crypy.portfolio",
        JSON.stringify({
          v: 1,
          wallets: [
            { address: a, label: "Cold", addedAt: 1 },
            { address: b, label: "Ones", addedAt: 2 },
          ],
        }),
      ),
    { a, b },
  );
  await page.goto("/en/tools/portfolio");
  const main = page.locator("#main");
  await expect(main.getByTestId("watch-for-changes")).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("portfolio-account")).toContainText("Saved on this device only");
  await main.getByRole("link", { name: "Set up alerts" }).click();
  await expect(page).toHaveURL(/\/en\/tools\/watchlist\?add=portfolio$/);
  await signIn(page);
  const offer = main.getByTestId("import-portfolio");
  await offer.getByRole("button", { name: "Watch 2 wallet(s)" }).click();
  await expect(main.getByTestId("watch-item")).toHaveCount(2);
  await expect(main.getByTestId("watch-item").first()).toContainText("Cold");
  await expect(page).toHaveURL(/\/en\/tools\/watchlist$/);

  // Signed in now: Portfolio offers to keep the list on the account.
  await page.goto("/en/tools/portfolio");
  const sync = main.getByTestId("portfolio-account").getByRole("switch");
  await expect(sync).not.toBeChecked({ timeout: 30_000 });
  // The switch changes once the account has saved the list.
  await sync.click();
  await expect(sync).toBeChecked();
  const saved = (await (await page.request.get("/api/v1/portfolio")).json()).data.portfolio as { wallets: unknown[] };
  expect(saved.wallets).toHaveLength(2);

  // Another browser (empty storage, same account): the list comes back from the account.
  await page.evaluate(() => localStorage.removeItem("crypy.portfolio"));
  await page.reload();
  await expect(main.getByText("Cold", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(main.getByText("Ones", { exact: true }).first()).toBeVisible();
  expect(address).toMatch(/^0x/);
});
