import "server-only";
import { cacheLife } from "next/cache";
import { liveChains } from "@/config/chains";
import { type GasSpeeds, speeds, trend } from "@/lib/gas/compute";
import { registry } from "@/server/chains/registry";

export interface ChainGas {
  chain: string;
  block: number;
  checkedAt: number;
  speeds: GasSpeeds;
  trend: { values: number[]; measure: "baseFee" | "tip"; spanSeconds: number | null };
  coinUsd: number | null;
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
          },
        ]
      : [],
  );
  return { chains, unavailable: targets.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key) };
}
