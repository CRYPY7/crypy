import type { ChainConfig, ChainKey } from "@/config/chains";
import {
  type AddressKind,
  type AddressLookup,
  type ChainFamilyAdapter,
  type TxLookup,
  isActiveLookup,
} from "@/lib/chains/types";

export interface ResolverRegistry {
  adapters: ChainFamilyAdapter[];
  chainsFor(adapter: ChainFamilyAdapter): ChainConfig[];
}

export interface Choice {
  chain: ChainKey;
  kind: AddressKind | "tx";
  /** Locale-free path, e.g. "/token/bsc/0x…". */
  path: string;
  /** For addresses: what was found on this chain (identity, token, native balance). */
  lookup?: AddressLookup;
}

export type ResolveResult =
  | { status: "invalid" }
  /** Mixed-case address whose EIP-55 checksum doesn't match: almost always a typo. */
  | { status: "bad-checksum"; address: string }
  | {
      status: "address";
      address: string;
      checksumValid: boolean | null;
      lookups: AddressLookup[];
      unavailable: ChainKey[];
      /** Where to go; null when the user must choose. */
      target: string | null;
      /** One entry per chain where the address is in use. */
      choices: Choice[];
      /** Locale-free path of the all-chains address page. */
      overview: string;
      /** Chains that answered but where the address shows no activity. */
      inactive: ChainKey[];
    }
  | { status: "tx"; hash: string; found: TxLookup[]; unavailable: ChainKey[]; target: string | null; choices: Choice[] }
  | { status: "not-found"; kind: "tx"; unavailable: ChainKey[] }
  | { status: "unavailable"; unavailable: ChainKey[] };

const LOOKUP_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms = LOOKUP_TIMEOUT_MS): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

type Settled<T> = { chain: ChainKey; ok: true; value: T } | { chain: ChainKey; ok: false };

async function settleAcross<T>(
  pairs: { adapter: ChainFamilyAdapter; chain: ChainConfig }[],
  run: (adapter: ChainFamilyAdapter, chain: ChainConfig) => Promise<T>,
): Promise<Settled<T>[]> {
  return Promise.all(
    pairs.map(async ({ adapter, chain }) => {
      try {
        return { chain: chain.key, ok: true as const, value: await withTimeout(run(adapter, chain)) };
      } catch {
        return { chain: chain.key, ok: false as const };
      }
    }),
  );
}

/**
 * Works out what a pasted value is and where it lives.
 * 1. Every registered family checks the format (so new families plug in with no change here).
 * 2. Live lookups run on all matching chains in parallel; a failing chain is reported, never hidden.
 */
export async function resolveSearch(input: string, registry: ResolverRegistry): Promise<ResolveResult> {
  const value = input.trim().slice(0, 200);

  // Transaction hashes
  const txCandidates = registry.adapters.flatMap((adapter) => {
    const hash = adapter.parseTxId(value);
    return hash ? registry.chainsFor(adapter).map((chain) => ({ adapter, chain, hash })) : [];
  });
  if (txCandidates.length > 0) {
    const hash = txCandidates[0]!.hash;
    const settled = await settleAcross(txCandidates, (adapter, chain) => adapter.lookupTransaction(chain, hash));
    const found = settled.flatMap((s) => (s.ok && s.value ? [s.value] : []));
    const unavailable = settled.filter((s) => !s.ok).map((s) => s.chain);
    if (found.length === 0) {
      return unavailable.length === txCandidates.length
        ? { status: "unavailable", unavailable }
        : { status: "not-found", kind: "tx", unavailable };
    }
    const choices = found.map((tx) => ({
      chain: tx.chain,
      kind: "tx" as const,
      path: `/tx/${hash}?chain=${tx.chain}`,
    }));
    return { status: "tx", hash, found, unavailable, target: choices.length === 1 ? choices[0]!.path : null, choices };
  }

  // Addresses
  const addressCandidates = registry.adapters.flatMap((adapter) => {
    const parsed = adapter.parseAddress(value);
    return parsed ? registry.chainsFor(adapter).map((chain) => ({ adapter, chain, parsed })) : [];
  });
  if (addressCandidates.length > 0) {
    const { normalized: address, checksumValid } = addressCandidates[0]!.parsed;
    if (checksumValid === false) return { status: "bad-checksum", address: value };
    const settled = await settleAcross(addressCandidates, (adapter, chain) => adapter.lookupAddress(chain, address));
    const lookups = settled.flatMap((s) => (s.ok ? [s.value] : []));
    const unavailable = settled.filter((s) => !s.ok).map((s) => s.chain);
    if (lookups.length === 0) return { status: "unavailable", unavailable };

    // One address can be a different thing on every chain. Only chains where it is in use count.
    const overview = `/address/${address}`;
    const active = lookups.filter(isActiveLookup);
    const inactive = lookups.filter((lookup) => !isActiveLookup(lookup)).map((lookup) => lookup.chain);
    const choices: Choice[] = active.map((lookup) => ({
      chain: lookup.chain,
      kind: lookup.kind,
      path: lookup.kind === "token" ? `/token/${lookup.chain}/${address}` : `${overview}?chain=${lookup.chain}`,
      lookup,
    }));
    // Used on one chain: open it. On several: the user chooses (or opens the overview). On none: the overview.
    const only = choices.length === 1 ? choices[0]! : null;
    const target = only ? (only.kind === "token" ? only.path : overview) : choices.length === 0 ? overview : null;
    return { status: "address", address, checksumValid, lookups, unavailable, target, choices, overview, inactive };
  }

  return { status: "invalid" };
}
