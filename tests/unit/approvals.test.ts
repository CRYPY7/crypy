import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256 } from "viem";
import { isUnlimited, rateApproval, rateApprovals, summarize } from "@/lib/approvals/evaluate";
import type { ApprovalFact } from "@/lib/approvals/types";
import { parseGoPlusApprovals } from "@/server/security/external";
import { PERMIT2_ADDRESS, REVOKE_SELECTORS, assertRevoke, buildRevoke, revokeAbi } from "@/wallets/evm/revoke";
import type { RevokeRequest } from "@/wallets/types";

const TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const SPENDER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const OWNER = "0x1234567890AbcdEF1234567890aBcdef12345678";

const fact = (
  over: Partial<Omit<ApprovalFact, "spender">> & { spender?: Partial<ApprovalFact["spender"]> } = {},
): ApprovalFact => {
  const { spender, ...rest } = over;
  return {
    kind: "token",
    token: { address: TOKEN, symbol: "USDT", name: "Tether", decimals: 18 },
    spender: { address: SPENDER, type: "contract", name: null, sourceVerified: null, goplus: null, ...spender },
    allowance: maxUint256.toString(),
    unlimited: true,
    expiresAt: null,
    balance: "1000",
    priceUsd: 1,
    atRiskUsd: 10,
    lastChange: null,
    foundBy: ["goplus"],
    ...rest,
  };
};

describe("approval risks", () => {
  it("GoPlus malicious wins over everything", () => {
    const r = rateApproval(
      fact({ spender: { name: "Router", goplus: { malicious: true, doubt: false, trusted: true } } }),
    );
    expect(r.risk).toBe("malicious");
    expect(r.attention).toBe(true);
    expect(r.reason).toBe("malicious");
  });
  it("a plain or delegated wallet as spender is high risk", () => {
    expect(rateApproval(fact({ spender: { type: "wallet" } })).risk).toBe("high");
    expect(rateApproval(fact({ spender: { type: "delegated" } })).risk).toBe("high");
  });
  it("known apps, trusted, published source and unknown contracts", () => {
    expect(rateApproval(fact({ spender: { name: "PancakeSwap v2 Router" } })).risk).toBe("known");
    expect(rateApproval(fact({ spender: { goplus: { malicious: false, doubt: false, trusted: true } } })).risk).toBe(
      "known",
    );
    expect(rateApproval(fact({ spender: { sourceVerified: true } })).risk).toBe("normal");
    const unknown = rateApproval(fact({ spender: { sourceVerified: false } }));
    expect([unknown.risk, unknown.reason, unknown.attention]).toEqual(["check", "unknownContract", false]);
    expect(rateApproval(fact({ spender: { type: null } })).reason).toBe("unreadable");
  });
  it("unused approvals: nothing held", () => {
    const r = rateApproval(fact({ balance: "0", spender: { name: "Router" } }));
    expect([r.unused, r.reason]).toEqual([true, "unused"]);
  });
  it("sorts riskiest first, then by value at risk, and sums", () => {
    const list = rateApprovals([
      fact({ spender: { name: "Router" }, atRiskUsd: 500 }),
      fact({ spender: { type: "wallet" }, atRiskUsd: 5 }),
      fact({ spender: { type: "wallet" }, atRiskUsd: 50 }),
      fact({
        kind: "nft-all",
        allowance: null,
        atRiskUsd: null,
        spender: { goplus: { malicious: true, doubt: false, trusted: false } },
      }),
    ]);
    expect(list.map((a) => a.risk)).toEqual(["malicious", "high", "high", "known"]);
    expect(list[1]!.atRiskUsd).toBe(50);
    const s = summarize(list);
    expect(s).toMatchObject({
      total: 4,
      attention: 3,
      malicious: 1,
      walletSpenders: 2,
      nfts: 1,
      atRiskUsd: 555,
      attentionUsd: 55,
    });
  });
  it("unlimited thresholds", () => {
    expect(isUnlimited(maxUint256, "token")).toBe(true);
    expect(isUnlimited(2n ** 255n, "token")).toBe(true);
    expect(isUnlimited(10n ** 30n, "token")).toBe(false);
    expect(isUnlimited(2n ** 160n - 1n, "permit2")).toBe(true);
    expect(isUnlimited(10n ** 24n, "permit2")).toBe(false);
  });
});

describe("GoPlus approval leads", () => {
  it("reads token and NFT lists, keeps flags, ignores junk and single-item NFT approvals", () => {
    const tokens = [
      {
        token_address: TOKEN,
        approved_list: [
          {
            approved_contract: SPENDER,
            approved_time: 1730000000,
            hash: `0x${"ab".repeat(32)}`,
            address_info: { malicious_behavior: ["phishing"], doubt_list: 0, trust_list: 0 },
          },
          { approved_contract: "not-an-address" },
        ],
      },
      { token_address: "junk", approved_list: [{ approved_contract: SPENDER }] },
    ];
    const nfts = [
      {
        nft_address: TOKEN,
        approved_list: [
          { approved_contract: SPENDER, approved_for_all: 1, approved_time: 1730000000000 },
          { approved_contract: OWNER, approved_for_all: 0 },
        ],
      },
    ];
    const t = parseGoPlusApprovals(tokens, "token");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      kind: "token",
      token: TOKEN.toLowerCase(),
      spender: SPENDER.toLowerCase(),
      at: 1730000000,
    });
    expect(t[0]!.flags.malicious).toBe(true);
    const n = parseGoPlusApprovals(nfts, "nft-all");
    expect(n).toHaveLength(1);
    expect(n[0]!.at).toBe(1730000000);
    expect(parseGoPlusApprovals("oops", "token")).toEqual([]);
  });
});

describe("revoke transactions (the only transactions CRYPY builds)", () => {
  const req = (kind: RevokeRequest["kind"]): RevokeRequest => ({
    chainId: 56,
    owner: OWNER,
    kind,
    token: TOKEN,
    spender: SPENDER,
  });

  it("builds the three zeroing calls with value 0", () => {
    const erc20 = buildRevoke(req("token"));
    expect([erc20.to.toLowerCase(), erc20.data.slice(0, 10), erc20.value]).toEqual([
      TOKEN.toLowerCase(),
      REVOKE_SELECTORS.approve,
      0n,
    ]);
    expect(erc20.data.endsWith("0".repeat(64))).toBe(true);
    const nft = buildRevoke(req("nft-all"));
    expect(nft.data.slice(0, 10)).toBe(REVOKE_SELECTORS.setApprovalForAll);
    const p2 = buildRevoke(req("permit2"));
    expect([p2.to, p2.data.slice(0, 10)]).toEqual([PERMIT2_ADDRESS, REVOKE_SELECTORS.permit2]);
  });

  it("refuses anything that isn't exactly a revoke", () => {
    const r = req("token");
    const good = buildRevoke(r);
    const nonzero = encodeFunctionData({ abi: revokeAbi, functionName: "approve", args: [SPENDER, 1n] });
    expect(() => assertRevoke({ ...good, data: nonzero }, r)).toThrow(/zero/);
    expect(() => assertRevoke({ ...good, value: 1n }, r)).toThrow(/value/);
    expect(() => assertRevoke({ ...good, to: SPENDER }, r)).toThrow(/contract/);
    expect(() => assertRevoke({ ...good, data: `${good.data}00` }, r)).toThrow();
    const otherSpender = encodeFunctionData({ abi: revokeAbi, functionName: "approve", args: [OWNER, 0n] });
    expect(() => assertRevoke({ ...good, data: otherSpender }, r)).toThrow(/spender/);
    // transfer(address,uint256) — same shape as approve, different function.
    expect(() => assertRevoke({ ...good, data: `0xa9059cbb${good.data.slice(10)}` }, r)).toThrow(/function/);
    const nftOn = encodeFunctionData({ abi: revokeAbi, functionName: "setApprovalForAll", args: [SPENDER, true] });
    expect(() => assertRevoke({ to: TOKEN, data: nftOn }, req("nft-all"))).toThrow(/zero/);
    expect(() => assertRevoke({ ...buildRevoke(req("permit2")), to: TOKEN }, req("permit2"))).toThrow(/Permit2/);
    expect(() => buildRevoke({ ...r, spender: "0x123" })).toThrow(/address/);
  });

  it("only the reviewed revoke runner can ask a wallet to send or sign", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk("src");
    const signing =
      /\b(sendTransaction|writeContract|signMessage|signTypedData|sendCalls|useSendTransaction|useWriteContract|useSignMessage|useSignTypedData|useSendCalls|eth_sendTransaction|eth_sign|personal_sign)\b/;
    const users = files.filter((f) => signing.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    expect(users.map((f) => f.replaceAll("\\", "/"))).toEqual(["src/wallets/evm/revoke-runner.ts"]);
  });
});

describe("spam tokens", () => {
  it("a wallet spender on a likely-spam token never needs attention, but malicious keeps its reason", () => {
    const list = rateApprovals(
      [
        fact({ spender: { type: "wallet" } }),
        fact({ spender: { goplus: { malicious: true, doubt: false, trusted: false } } }),
      ],
      new Set([TOKEN.toLowerCase()]),
    );
    expect(list.every((a) => a.spamToken && !a.attention)).toBe(true);
    expect(list.map((a) => a.reason).sort()).toEqual(["malicious", "spamToken"]);
    expect(summarize(list)).toMatchObject({ attention: 0, malicious: 0, walletSpenders: 0 });
  });
});
