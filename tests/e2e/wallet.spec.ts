import { expect, test } from "@playwright/test";

/**
 * A fake browser wallet (EIP-6963) that records every request CRYPY makes.
 * Proves: connecting works, the session survives a language switch, and CRYPY
 * never asks for a signature or a transaction.
 */
const TEST_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";

const installFakeWallet = (address: string) => {
  const w = window as unknown as { __walletRequests: string[] };
  w.__walletRequests = JSON.parse(sessionStorage.getItem("__walletRequests") ?? "[]");
  const provider = {
    request: async ({ method }: { method: string }) => {
      w.__walletRequests.push(method);
      sessionStorage.setItem("__walletRequests", JSON.stringify(w.__walletRequests));
      // Like a real wallet: accounts are shared only after the user approves the site once.
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
        default:
          throw Object.assign(new Error("Unsupported"), { code: 4200 });
      }
    },
    on: () => {},
    removeListener: () => {},
  };
  const detail = Object.freeze({
    info: {
      uuid: "8f7c1e1e-0000-4000-8000-000000000001",
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

const FORBIDDEN = [
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
  "wallet_sendCalls",
];

test("visitors who never connect don't download wallet code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.url().endsWith(".js")) scripts.push(await response.text().catch(() => ""));
  });
  await page.goto("/en", { waitUntil: "networkidle" });
  expect(
    scripts.some((source) => source.includes("walletconnect") || source.includes("multiInjectedProviderDiscovery")),
  ).toBe(false);
});

test("connects a browser wallet without any signature or transaction, and stays connected across languages", async ({
  page,
}) => {
  await page.addInitScript(installFakeWallet, TEST_ADDRESS);
  await page.goto("/en", { waitUntil: "networkidle" });

  const connectButton = page.getByRole("banner").getByRole("button", { name: /Connect wallet/ });
  await expect(connectButton).toBeEnabled();
  await connectButton.click();
  await page.getByRole("button", { name: "Test Wallet" }).click();
  await expect(page.getByRole("dialog")).toContainText("0x1234567890AbcdEF1234567890aBcdef12345678");
  await page.keyboard.press("Escape");

  const connected = page.getByRole("banner").getByRole("button", { name: /0x1234…5678/ });
  await expect(connected).toBeVisible();

  // Switch language: the session is restored silently on the new page.
  await page.goto("/ur", { waitUntil: "networkidle" });
  await expect(page.getByRole("banner").getByRole("button", { name: /0x1234…5678/ })).toBeVisible({ timeout: 10_000 });

  const requests = await page.evaluate(() => (window as unknown as { __walletRequests: string[] }).__walletRequests);
  expect(requests).toContain("eth_requestAccounts");
  expect(requests.filter((method) => FORBIDDEN.includes(method))).toEqual([]);
});
