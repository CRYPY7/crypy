import { expect, test } from "@playwright/test";

/**
 * Approvals page and the revoke flow, with live chain data (vitalik.eth on Ethereum has long-standing approvals to
 * known routers) and a fake browser wallet that records every request and rejects any transaction.
 */
const OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const OTHER = "0x1234567890AbcdEF1234567890aBcdef12345678";

const installFakeWallet = (address: string) => {
  const w = window as unknown as { __walletRequests: { method: string; params?: unknown }[] };
  w.__walletRequests = [];
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
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
        case "eth_sendTransaction":
          // The user presses "Reject" in their wallet.
          throw Object.assign(new Error("User rejected the request."), { code: 4001 });
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

const FORBIDDEN = ["personal_sign", "eth_sign", "eth_signTypedData", "eth_signTypedData_v4", "wallet_sendCalls"];
const requests = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => (window as unknown as { __walletRequests: { method: string; params?: unknown }[] }).__walletRequests,
  );

async function connect(page: import("@playwright/test").Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: /Connect wallet/ })
    .click();
  await page.getByRole("button", { name: "Test Wallet" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("banner").getByRole("button", { name: /0x/ })).toBeVisible({ timeout: 10_000 });
}

test("approvals page: real approvals, risks, how we checked; checking needs no wallet", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(installFakeWallet, OTHER);
  await page.goto(`/en/address/${OWNER}/approvals`);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Approvals on this wallet" })).toBeVisible({ timeout: 60_000 });
  await expect(main.getByRole("navigation", { name: "Address sections" })).toBeVisible();
  await expect(main.getByText("Uniswap V3 Router").first()).toBeVisible();
  await expect(main.getByText(/How we checked/)).toBeVisible();
  await expect(main.getByText(/^Safe$/)).toHaveCount(0);
  // Not connected: Revoke opens the wallet dialog, nothing else.
  await main.getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Connect a wallet");
  expect(
    (await requests(page)).filter((r) => r.method === "eth_sendTransaction" || FORBIDDEN.includes(r.method)),
  ).toEqual([]);
});

test("another wallet connected: read-only notice, revoke not offered for someone else's approvals", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(installFakeWallet, OTHER);
  await page.goto(`/en/address/${OWNER}/approvals`);
  await connect(page);
  await expect(page.getByText("Not your connected wallet (read-only)")).toBeVisible({ timeout: 60_000 });
  expect((await requests(page)).some((r) => r.method === "eth_sendTransaction")).toBe(false);
});

test("revoke flow: tested first, nothing sent until the click, exact zeroing call, rejection handled", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(installFakeWallet, OWNER);
  await page.goto(`/en/address/${OWNER}/approvals`);
  await connect(page);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Approvals on this wallet" })).toBeVisible({ timeout: 60_000 });
  // A known-router approval on Ethereum (the fake wallet's network).
  await main.locator("li", { hasText: "Uniswap V3 Router" }).first().getByRole("button", { name: "Revoke" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Revoke/ })).toBeVisible();
  await expect(dialog.getByText(/CRYPY tested this exact transaction first/)).toBeVisible({ timeout: 30_000 });
  expect((await requests(page)).some((r) => r.method === "eth_sendTransaction")).toBe(false);

  await dialog.getByRole("button", { name: "Open my wallet to revoke" }).click();
  await expect(dialog.getByText(/You rejected the request in your wallet/)).toBeVisible({ timeout: 30_000 });
  const sent = (await requests(page)).filter((r) => r.method === "eth_sendTransaction");
  expect(sent).toHaveLength(1);
  const tx = (sent[0]!.params as { to: string; data: string; value?: string }[])[0]!;
  expect(tx.data.slice(0, 10)).toBe("0x095ea7b3");
  expect(tx.data.endsWith("0".repeat(64))).toBe(true);
  expect(BigInt(tx.value ?? "0x0")).toBe(0n);
  expect((await requests(page)).filter((r) => FORBIDDEN.includes(r.method))).toEqual([]);
});

test("tool page opens the approvals page", async ({ page }) => {
  await page.goto("/en/tools/approval-checker");
  await page.locator("#main").getByRole("textbox", { name: "Wallet address", exact: true }).fill(OWNER);
  await page.locator("#main").getByRole("button", { name: "Check approvals" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/address/${OWNER}/approvals$`));
});
