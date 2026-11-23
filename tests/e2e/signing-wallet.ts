/**
 * A fake browser wallet for tests (EIP-6963, "Test Wallet"). It signs plain messages through `__testSign`, which the
 * test exposes with a throwaway key held only by the test (never by the page). Every request is recorded in
 * `window.__walletRequests`. `localStorage.__walletReject = "1"` makes it decline.
 */
export const installSigningWallet = (address: string) => {
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
