import "server-only";
import { assertChainUp } from "@/server/fault";
import { cacheLife } from "next/cache";
import { liveChains } from "@/config/chains";
import { type GasAction, type GasSpeeds, speeds, trend } from "@/lib/gas/compute";
import { registry } from "@/server/chains/registry";
import { readSaved, saveResults } from "@/server/saved/store";

export interface ChainGas {
  chain: string;
  block: number;
  checkedAt: number;
  speeds: GasSpeeds;
  trend: { values: number[]; measure: "baseFee" | "tip"; spanSeconds: number | null };
  coinUsd: number | null;
  /** Rollups: estimated Ethereum data fee per action (wei). */
  l1Fees: Record<GasAction, number> | null;
  /** Shown from the last reading (at most 10 minutes old, `checkedAt`) because reading the chain failed now. */
  saved?: boolean;
}

export interface GasReport {
  chains: ChainGas[];
  unavailable: string[];
}

/** Gas on every live chain with the `fees` capability. Cached about 10 seconds and shared by every visitor. */
export async function cachedGas(): Promise<GasReport> {
  "use cache";
  cacheLife({ stale: 10, revalidate: 10, expire: 60 });
  const targets = liveChains.filter((c) => c.capabilities.fees);
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      if (!adapter?.getGas) throw new Error("Gas not supported");
      assertChainUp(chain.key);
      return adapter.getGas(chain);
    }),
  );
  const chains: ChainGas[] = settled.flatMap((r) =>
    r.status === "fulfilled"
      ? [
          {
            chain: r.value.chain,
            block: r.value.history.newestBlock,
            checkedAt: r.value.checkedAt,
            speeds: speeds(r.value.history),
            trend: { ...trend(r.value.history), spanSeconds: r.value.spanSeconds },
            coinUsd: r.value.coinUsd,
            l1Fees: r.value.l1Fees,
          },
        ]
      : [],
  );
  // Stabilization S2: each chain's reading is saved (at most once a minute); a chain that failed now shows its last
  // reading if it is at most 10 minutes old, marked as such.
  const now = Date.now();
  const toSave = chains.filter((c) => now - (lastSaved.get(c.chain) ?? 0) >= SAVE_EVERY_MS);
  for (const c of toSave) lastSaved.set(c.chain, now);
  void saveResults(
    "gas",
    "all",
    toSave.map((c) => ({ chain: c.chain, data: c, at: c.checkedAt })),
  );
  const failed = targets.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key);
  const saved = failed.length ? await readSaved<ChainGas>("gas", "all", failed) : new Map<string, never>();
  const order = (key: string) => targets.findIndex((c) => c.key === key);
  return {
    chains: [...chains, ...[...saved.values()].map((s) => ({ ...s.data, saved: true }))].sort(
      (a, b) => order(a.chain) - order(b.chain),
    ),
    unavailable: failed.filter((c) => !saved.has(c)),
  };
}

const SAVE_EVERY_MS = 60_000;
const lastSaved = new Map<string, number>();
