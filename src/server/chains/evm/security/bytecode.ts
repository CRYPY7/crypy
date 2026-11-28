import "server-only";
import { toFunctionSelector } from "viem";
import type { OwnerPower, PowerFact } from "@/lib/security/types";

/**
 * Reads a contract's runtime code without its source: the 4-byte function selectors it dispatches on, and whether
 * it contains SELFDESTRUCT. A function being present doesn't mean it is used — results are labelled "heuristic".
 */
export function selectorsIn(code: string): Set<string> {
  const bytes = code.startsWith("0x") ? code.slice(2) : code;
  const found = new Set<string>();
  for (let i = 0; i < bytes.length; i += 2) {
    const op = parseInt(bytes.slice(i, i + 2), 16);
    if (op === 0x63) found.add(`0x${bytes.slice(i + 2, i + 10)}`); // PUSH4 <selector>
    if (op >= 0x60 && op <= 0x7f) i += (op - 0x5f) * 2; // skip PUSH data
  }
  return found;
}

export function hasSelfdestruct(code: string): boolean {
  const bytes = code.startsWith("0x") ? code.slice(2) : code;
  for (let i = 0; i < bytes.length; i += 2) {
    const op = parseInt(bytes.slice(i, i + 2), 16);
    if (op === 0xff) return true;
    if (op >= 0x60 && op <= 0x7f) i += (op - 0x5f) * 2;
  }
  return false;
}

/** Common owner-only function names by power (from widely used token templates). Extend freely. */
const POWER_SIGNATURES: Record<Exclude<OwnerPower, "selfdestruct">, string[]> = {
  mint: [
    "mint(address,uint256)",
    "mint(uint256)",
    "mintTo(address,uint256)",
    "issue(uint256)",
    "mintTokens(address,uint256)",
  ],
  fees: [
    "setFee(uint256)",
    "setFees(uint256,uint256)",
    "setFees(uint256,uint256,uint256)",
    "setTaxFeePercent(uint256)",
    "setTax(uint256)",
    "setTaxes(uint256,uint256)",
    "setBuyFee(uint256)",
    "setSellFee(uint256)",
    "setBuyTax(uint256)",
    "setSellTax(uint256)",
    "updateFees(uint256,uint256)",
    "updateFees(uint256,uint256,uint256)",
    "updateBuyFees(uint256,uint256,uint256)",
    "updateSellFees(uint256,uint256,uint256)",
    "setFeePercent(uint256)",
    "setLiquidityFeePercent(uint256)",
    "setBuyFees(uint256,uint256,uint256)",
    "setSellFees(uint256,uint256,uint256)",
  ],
  blacklist: [
    "blacklist(address)",
    "addBlackList(address)",
    "setBlacklist(address,bool)",
    "addToBlacklist(address)",
    "blacklistAddress(address,bool)",
    "setBlacklisted(address,bool)",
    "setBot(address,bool)",
    "setBots(address[])",
    "addBot(address)",
    "updateBlacklist(address,bool)",
    "setBlackList(address,bool)",
    "blockAddress(address)",
  ],
  pause: [
    "pause()",
    "setPaused(bool)",
    "setTradingEnabled(bool)",
    "enableTrading()",
    "openTrading()",
    "setTradingOpen(bool)",
    "startTrading()",
    "setTrading(bool)",
    "tradingStatus(bool)",
    "pauseTrading()",
  ],
  limits: [
    "setMaxTxAmount(uint256)",
    "setMaxWalletSize(uint256)",
    "setMaxTxPercent(uint256)",
    "updateMaxTxnAmount(uint256)",
    "updateMaxWalletAmount(uint256)",
    "setMaxWallet(uint256)",
    "setMaxTx(uint256)",
    "setMaxWalletPercent(uint256)",
  ],
  cooldown: ["setCooldownEnabled(bool)", "setCooldown(uint256)", "cooldownEnabled(bool)"],
  upgrade: ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"],
};

const LOOKUP = new Map<string, { power: OwnerPower; signature: string }>();
for (const [power, signatures] of Object.entries(POWER_SIGNATURES)) {
  for (const signature of signatures)
    LOOKUP.set(toFunctionSelector(`function ${signature}`), { power: power as OwnerPower, signature });
}
export const HAS_ROLE_SELECTOR = toFunctionSelector("function hasRole(bytes32,address)");

export function powersIn(codes: string[]): PowerFact[] {
  const found = new Map<OwnerPower, Set<string>>();
  for (const code of codes) {
    for (const selector of selectorsIn(code)) {
      const hit = LOOKUP.get(selector);
      if (!hit) continue;
      found.set(hit.power, (found.get(hit.power) ?? new Set()).add(hit.signature));
    }
    if (hasSelfdestruct(code)) found.set("selfdestruct", new Set(["SELFDESTRUCT"]));
  }
  return [...found].map(([power, functions]) => ({ power, functions: [...functions] }));
}

/** Storage slots used by standard proxies. */
export const PROXY_SLOTS = {
  eip1967: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
  eip1822: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5779cf9b5a1a5",
  /** Older OpenZeppelin (ZeppelinOS) proxies, e.g. USDC: keccak256("org.zeppelinos.proxy.implementation"). */
  zeppelinos: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
  zeppelinosAdmin: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b",
} as const;

/** EIP-1167 minimal proxy: 363d3d373d3d3d363d73<address>5af43d82803e903d91602b57fd5bf3 */
export function minimalProxyTarget(code: string): string | null {
  const m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code);
  return m ? `0x${m[1]}` : null;
}
