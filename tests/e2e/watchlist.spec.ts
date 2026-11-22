import { expect, test, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Watchlist (M8 Part 2): wallet sign-in, saving items and alert choices, data download and account deletion.
 * The fake wallet signs with a throwaway key created for this run, held only by the test (never by the page).
 */
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const FORBIDDEN = ["eth_sign", "eth_signTypedData", "eth_signTypedData_v4", "eth_sendTransaction", "wallet_sendCalls"];

const installSigningWallet = (address: string) => {
  const w = window as unknown as {
    __walletRequests: { method: string; params?: unknown }[];
    __testSign: (raw: string) => Promise<string>;
  };
  w.__walletRequests = [];
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      w.__walletRequests.push({ method, params });
      const approved = localStorage.getItem("__walletApproved") === "1";
      switch (method) {
        case "eth_requestAccounts":
          localStorage.setItem("__walletApproved", "1");
          return [address];
        case "eth_accounts":
          return approved ? [address] : [];
        case "eth_chainId":
          return "0x1";
        case "net_version":
          return "1";
        case "wallet_requestPermissions":
        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "personal_sign": {
          if (localStorage.getItem("__walletReject") === "1")
            throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          return w.__testSign(String(params?.[0]));
        }
        default:
          throw Object.assign(new Error("Unsupported"), { code: 4200 });
      }
    },
    on: () => {},
    removeListener: () => {},
  };
  const detail = Object.freeze({
    info: {
      uuid: "8f7c1e1e-0000-4000-8000-000000000002",
      name: "Test Wallet",
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E",
      rdns: "org.crypy.testwallet",
    },
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
};

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
  await expect(main.getByTestId("alerts-not-live")).toBeVisible({ timeout: 30_000 });
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
  await expect(main.getByTestId("alerts-not-live")).toBeVisible({ timeout: 30_000 });
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
