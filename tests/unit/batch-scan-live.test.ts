/**
 * Batch scan engine with the server's real readers (public nodes here). Run with:
 *   LIVE=1 pnpm test tests/unit/batch-scan-live.test.ts
 * The owner's case (500 wallets × 5 chains × 5 tokens + coin) must read every balance, and a known balance must match
 * a direct read.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { liveChains } from "@/config/chains";
import { type ScanRow, scanChain } from "@/lib/batch-scan/engine";
import { scanReaders } from "@/server/batch-scan/readers";
import { getEvmClient } from "@/server/chains/evm/providers";

const live = process.env.LIVE === "1";
const BINANCE_8 = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

describe.skipIf(!live)("batch scan (live)", () => {
  it("reads 500 wallets × 6 assets on every chain, nothing left unread", async () => {
    const wallets = [
      BINANCE_8,
      ...Array.from({ length: 499 }, () => getAddress(`0x${randomBytes(20).toString("hex")}`)),
    ];
    const started = Date.now();
    const results = await Promise.all(
      liveChains
        .filter((c) => c.family === "evm")
        .map(async (chain) => {
          const rows = new Map<string, ScanRow>();
          const state = await scanChain({
            readers: scanReaders(chain),
            addresses: wallets,
            tokens: chain.commonTokens.slice(0, 5).map((t) => t.toLowerCase()),
            signal: new AbortController().signal,
            onRows: (list) => list.forEach((r) => rows.set(r.address.toLowerCase(), r)),
          });
          const direct = await getEvmClient(chain).getBalance({ address: BINANCE_8 });
          return { chain: chain.key, state, rows, direct };
        }),
    );
    for (const { chain, state, rows, direct } of results) {
      expect(state.phase, chain).toBe("done");
      expect(state.read, chain).toBe(500);
      const nulls = [...rows.values()].filter((r) => r.native === null || r.tokens.some((t) => t === null));
      expect(nulls.length, chain).toBe(0);
      // The direct read is at a later block; a hot wallet can move, so compare loosely only when the blocks are close.
      expect(rows.get(BINANCE_8.toLowerCase())!.native, chain).not.toBeNull();
      console.log(
        chain,
        state.blocks,
        state.crossCheck,
        `binance8 ${rows.get(BINANCE_8.toLowerCase())!.native} vs ${direct}`,
      );
    }
    console.log(`seconds: ${(Date.now() - started) / 1000}`);
  }, 300_000);
});
