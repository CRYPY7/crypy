import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/security/evaluate";
import type { PowerFact, TokenSecurityFacts } from "@/lib/security/types";
import {
  accessOf,
  functionTexts,
  limitsIn,
  powersFromSource,
  stripSolidity,
} from "@/server/chains/evm/security/source";

const SOURCE = `
// function mint(address to, uint256 a) public { } — a comment must not count
contract T is Ownable, AccessControl {
  string private constant NOTE = "function setFees(uint256 a) public { }";
  function mint(address to, uint256 amount) external onlyOwner { _mint(to, amount); }
  function setFees(uint256 buy, uint256 sell) external onlyOwner {
    require(buy + sell <= 25, "too high");
    require(buy > 0, "zero");
    buyFee = buy; sellFee = sell;
  }
  function setBots(address[] calldata bots) external { for (uint i; i < bots.length; i++) bot[bots[i]] = true; }
  function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
  function setMaxWallet(uint256 v) external { require(msg.sender == marketing, "no"); maxWallet = v; }
  function setCooldown(uint256 s) external { require(_msgSender() == owner(), "no"); cooldown = s; }
  function updateBlacklister(address b) external onlyOwner { blacklister = b; }
}`;
const ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }] },
  {
    type: "function",
    name: "setFees",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "uint256" }],
  },
  { type: "function", name: "setBots", stateMutability: "nonpayable", inputs: [{ type: "address[]" }] },
  { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [] },
  { type: "function", name: "setMaxWallet", stateMutability: "nonpayable", inputs: [{ type: "uint256" }] },
  { type: "function", name: "setCooldown", stateMutability: "nonpayable", inputs: [{ type: "uint256" }] },
  { type: "function", name: "updateBlacklister", stateMutability: "nonpayable", inputs: [{ type: "address" }] },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
  },
  { type: "function", name: "taxRate", stateMutability: "view", inputs: [] },
  { type: "function", name: "evil<script>", stateMutability: "nonpayable", inputs: [] },
];

describe("owner powers from verified source", () => {
  const powers = powersFromSource(ABI, { "T.sol": SOURCE });
  const detail = (power: string) => powers.find((p) => p.power === power)?.details?.[0];

  it("finds power functions by their real names, never standard or view functions or unsafe names", () => {
    expect(powers.map((p) => p.power).sort()).toEqual(["blacklist", "cooldown", "fees", "limits", "mint", "pause"]);
    expect(powers.flatMap((p) => p.functions)).not.toContain("updateBlacklister(address)");
    expect(powers.every((p) => p.basis === "source")).toBe(true);
  });

  it("reads who may call each function", () => {
    expect(detail("mint")?.access).toBe("owner");
    expect(detail("pause")?.access).toBe("role");
    expect(detail("limits")?.access).toBe("restricted");
    expect(detail("cooldown")?.access).toBe("owner");
    expect(detail("blacklist")?.access).toBe("open");
  });

  it("shows upper limits as written, ignores '> 0' checks, comments and strings", () => {
    expect(detail("fees")?.limits).toEqual(["buy + sell <= 25"]);
    expect(stripSolidity('a // x\nb "q" /* y */ c')).toBe('a \nb ""  c');
    expect(functionTexts(stripSolidity(SOURCE), "setFees")).toHaveLength(1);
    expect(limitsIn("require(x <= 10 && msg.sender == owner);")).toEqual([]);
    expect(accessOf({ header: "function f() external", body: "if (msg.sender != admin) revert();" })).toBe(
      "restricted",
    );
  });
});

function facts(powers: PowerFact[], renounced: boolean): TokenSecurityFacts {
  return {
    chain: "bsc",
    address: "0x2222222222222222222222222222222222222222",
    block: "1",
    checkedAt: 0,
    token: { name: "T", symbol: "T", decimals: 18, totalSupply: "1" },
    priceUsd: 1,
    trade: {
      outcome: "sell-failed",
      venue: { dex: "PancakeSwap v3", protocol: "uniswap-v3", pool: "0x1", router: null, via: "USDT" },
      amountIn: "1",
      nativeSymbol: "BNB",
      buyTax: 0.01,
      sellTax: 0.01,
      transferTax: 0.01,
      reason: null,
      feeRejected: 0.01,
    },
    owner: {
      owner: renounced ? "0x000000000000000000000000000000000000dEaD" : "0x1111111111111111111111111111111111111111",
      renounced,
      ownerIsContract: false,
      roleBased: false,
    },
    powers,
    proxy: { kind: null, implementation: null, admin: null },
    pools: [],
    source: { status: "verified", provider: "Sourcify" },
    external: null,
    externalStatus: "unavailable",
  };
}

describe("rules for source-read powers and v3 fee rejection", () => {
  const p = (access: "owner" | "role" | "open"): PowerFact => ({
    power: "mint",
    functions: ["mint(address,uint256)"],
    basis: "source",
    details: [{ signature: "mint(address,uint256)", access, limits: [] }],
  });
  const mint = (access: "owner" | "role" | "open", renounced: boolean) =>
    evaluate(facts([p(access)], renounced)).checks.find((c) => c.id === "power.mint");

  it("renouncing ownership lowers owner-only powers, but not role-held or open ones", () => {
    expect(mint("owner", true)).toMatchObject({ severity: "low", values: { usable: "no" } });
    expect(mint("role", true)).toMatchObject({ severity: "high", values: { usable: "yes", access: "role" } });
    expect(mint("open", true)).toMatchObject({ severity: "high", values: { access: "open", basis: "source" } });
  });

  it("a v3 pool rejecting a fee-taking token's sale is a failed sale, with the fee measured", () => {
    const sell = evaluate(facts([], true)).checks.find((c) => c.id === "sell");
    expect(sell).toMatchObject({ severity: "critical", values: { state: "feeRejected", tax: "1%" } });
  });
});
