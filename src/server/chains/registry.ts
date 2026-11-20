import "server-only";
import { type ChainConfig, liveChains } from "@/config/chains";
import type { ChainFamilyAdapter } from "@/lib/chains/types";
import { evmAdapter } from "./evm/adapter";

/** Which adapter handles which chains. A new family = one adapter registered here. */
export interface ChainRegistry {
  adapters: ChainFamilyAdapter[];
  chainsFor(adapter: ChainFamilyAdapter): ChainConfig[];
}

export const registry: ChainRegistry = {
  adapters: [evmAdapter],
  chainsFor: (adapter) => liveChains.filter((chain) => chain.family === adapter.family),
};
