/**
 * Live transaction checks on real Ethereum and BNB Chain transactions (one of each kind).
 * Run with:  LIVE=1 pnpm test tests/unit/tx-live.test.ts
 * Values were cross-checked against direct node reads on 2026-11-20.
 */
import { describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { knownContractsFor } from "@/config/known-contracts";
import { evmAdapter } from "@/server/chains/evm/adapter";
import { getEvmClient } from "@/server/chains/evm/providers";
import { interpret } from "@/lib/tx/interpret";
import { buildRoute } from "@/lib/tx/route";

const live = process.env.LIVE === "1";
const details = (chain: string, hash: string) => evmAdapter.getTransactionDetails!(getChain(chain)!, hash);

describe.skipIf(!live)("live transactions", () => {
  it("Ethereum: plain ETH transfer", async () => {
    const tx = await details("ethereum", "0x7a07d962d4eba57ec4d310e3ec12394eed57a01a0d8461374096803a000bd039");
    expect(tx).toMatchObject({
      status: "success",
      blockNumber: "26456592",
      value: "5200010000000000",
      gasUsed: "21000",
      call: null,
      toIsContract: false,
    });
    expect(BigInt(tx!.fee!)).toBe(21000n * BigInt(tx!.gasPrice!));
    expect(tx!.burnt).not.toBeNull();
  }, 60_000);

  it("Ethereum: USDC transfer is decoded with its token movement", async () => {
    const tx = await details("ethereum", "0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6");
    expect(tx!.call).toMatchObject({ status: "decoded", key: "transfer" });
    expect(tx!.transfers).toHaveLength(1);
    expect(tx!.tokens["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]).toMatchObject({ symbol: "USDC", decimals: 6 });
  }, 60_000);

  it("Ethereum: failed transaction shows the contract's error message", async () => {
    const tx = await details("ethereum", "0x79c3f12d4cec02756017d973cd78dd0fdfbbdf7301571a498b8d34ebac4bf2c1");
    expect(tx!.status).toBe("reverted");
    expect(tx!.transfers).toEqual([]);
    // Older blocks may no longer be replayable on public nodes: then the reason is honestly unknown (null).
    expect([null, "ERC20: transfer amount exceeds balance"]).toContain(tx!.revertReason);
  }, 60_000);

  it("Ethereum: contract creation reports the new contract", async () => {
    const tx = await details("ethereum", "0x4af987040497696c1a5a8fbf086beb200998ad4a749c30f144281dc51371a1d3");
    expect(tx).toMatchObject({ to: null, createdContract: "0x39d4D3AD417dAAA777D400FAe3b9993aFa4e3CB3" });
  }, 60_000);

  it("BNB Chain: plain BNB transfer has no burnt fee", async () => {
    const tx = await details("bsc", "0x6673b4a00592060b71e3bc8911637259e523f64b5944f2716a66143953679238");
    expect(tx).toMatchObject({ status: "success", value: "850000000000", fee: "1050000000000", burnt: null });
  }, 60_000);

  it("BNB Chain: token transfer, failed transaction and contract creation", async () => {
    const [token, failed, creation] = await Promise.all([
      details("bsc", "0x5ddec6847a61156f573e06376d11a89f307a7aec862f4c1e8222ff6fcf88e60e"),
      details("bsc", "0x5509eafe30fff956897a63c367311a6b1b11bab83fed18487791e67c58f2398d"),
      details("bsc", "0x216453b86ec566ac33b191479256e144e2e9c8e9ad867288ed8c06050cbbc9e4"),
    ]);
    expect(token!.transfers[0]).toMatchObject({ standard: "erc20" });
    expect(token!.tokens["0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"]).toMatchObject({ symbol: "USDC", decimals: 18 });
    expect(failed!.status).toBe("reverted");
    expect(creation!.createdContract).toBe("0x10C838c3700632A22fa95fBDf21080b40AdeD830");
  }, 60_000);

  it("BNB Chain: custom events are counted but never guessed as transfers", async () => {
    const tx = await details("bsc", "0x8b5f3bafa43bcb5c622c68202609236120ef791316c79731c728c442e127f292");
    expect(tx).toMatchObject({ logCount: 24, transfers: [] });
  }, 60_000);

  it("every well-known contract name points at a real contract", async () => {
    for (const key of ["ethereum", "bsc"]) {
      const client = getEvmClient(getChain(key)!);
      for (const address of knownContractsFor(key)) {
        const code = await client.getCode({ address: address as `0x${string}` });
        expect(code && code.length > 2, `${key} ${address}`).toBe(true);
      }
    }
  }, 120_000);

  it("a made-up hash is not found", async () => {
    expect(await details("bsc", `0x${"ab".repeat(32)}`)).toBeNull();
  }, 60_000);

  // ---------- Transaction Intelligence V2 ----------

  it("BNB Chain: KyberSwap TATA → BNB swap is explained from its events (regression case)", async () => {
    const tx = (await details("bsc", "0xadf65326e84d22326edceb6dd8f4a8e388a3eacc3940ff634110191576e0b58d"))!;
    const pool = tx.pools["0x9ad7eee97891fa30c808904fa7d1ddc3313e6649"];
    expect(pool).toMatchObject({ verified: true, dex: "PancakeSwap v2" });
    // The router's permission is used up; today it is 0 (read now).
    expect(tx.allowances[0]).toMatchObject({ now: "0" });
    const it = interpret(tx, "BNB");
    expect(it.kind).toBe("swap");
    // Reported by the router, or confirmed when an archive node measured the balance change.
    expect(["reported", "confirmed"]).toContain(it.evidence);
    expect(it.values.amountIn).toMatchObject({ token: "native", raw: "3725998343504062" });
    expect(it.set.coverage).toMatchObject({ total: 13, explained: 11 });
    expect(it.set.permissions[0]!.onlyUsed).toBe(true);
    const route = buildRoute(tx, it.set, "BNB")!;
    expect(route).toMatchObject({ mode: "path", returnsToStart: true });
    expect(route.side.some((e) => e.possibleFee)).toBe(true);
  }, 60_000);

  it("Ethereum: Uniswap v2 swap goes through a verified pool", async () => {
    const tx = (await details("ethereum", "0x7ba9d5d91a4c23ce13fcb2607e1dad6e973e9b4de36d198c14bf23606d3c1627"))!;
    expect(Object.values(tx.pools)).toEqual([expect.objectContaining({ verified: true, dex: "Uniswap v2" })]);
    const it = interpret(tx, "ETH");
    expect(it.kind).toBe("swap");
    expect(it.set.actions.find((a) => a.type === "pool-swap")?.evidence).toBe("protocol");
  }, 60_000);

  it("Ethereum: aggregator trade through many Uniswap v3 pools is listed, not forced into one route", async () => {
    const tx = (await details("ethereum", "0xf7b690ea4873c0b6368b9af852e86938a02ac323b67d688406c33923b4fa8cd0"))!;
    const it = interpret(tx, "ETH");
    const swaps = it.set.actions.filter((a) => a.type === "pool-swap");
    expect(swaps.length).toBeGreaterThanOrEqual(5);
    expect(swaps.some((a) => a.evidence === "protocol")).toBe(true);
    expect(it.set.coverage.explained).toBeLessThanOrEqual(it.set.coverage.total);
  }, 60_000);
});
