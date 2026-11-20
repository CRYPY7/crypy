import { describe, expect, it } from "vitest";
import type { ChainConfig } from "@/config/chains";
import type { AddressLookup, ChainFamilyAdapter, TxLookup } from "@/lib/chains/types";
import { resolveSearch, type ResolverRegistry } from "@/server/services/resolve";

const ADDR = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const HASH = `0x${"ab".repeat(32)}`;

function chain(key: string, family = "evm"): ChainConfig {
  return { key, family, name: key, explorer: { name: "x", url: "https://x" } } as unknown as ChainConfig;
}

type Behaviour<T> = Record<string, T | Error>;

/** A fake EVM-style family: same parsing rules, scripted lookups, no network. */
function fakeEvm(addresses: Behaviour<Omit<AddressLookup, "chain">>, txs: Behaviour<boolean> = {}): ChainFamilyAdapter {
  return {
    family: "evm",
    parseAddress: (input) =>
      /^0x[0-9a-fA-F]{40}$/.test(input)
        ? {
            normalized: ADDR,
            checksumValid: input === ADDR || input === input.toLowerCase() ? (input === ADDR ? true : null) : false,
          }
        : null,
    parseTxId: (input) => (/^0x[0-9a-fA-F]{64}$/.test(input) ? input.toLowerCase() : null),
    explorerUrl: () => "",
    getHead: async () => ({ chain: "ethereum", blockNumber: "1", latencyMs: 1 }),
    lookupAddress: async (c) => {
      const result = addresses[c.key];
      if (!result || result instanceof Error) throw result ?? new Error("down");
      return { chain: c.key, ...result };
    },
    lookupTransaction: async (c, hash): Promise<TxLookup | null> => {
      const result = txs[c.key];
      if (result instanceof Error) throw result;
      return result ? { chain: c.key, hash, status: "success", blockNumber: "1", from: ADDR, to: null } : null;
    },
  };
}

function registryOf(...entries: [ChainFamilyAdapter, ChainConfig[]][]): ResolverRegistry {
  return { adapters: entries.map(([a]) => a), chainsFor: (a) => entries.find(([x]) => x === a)?.[1] ?? [] };
}

const eth = chain("ethereum");
const bsc = chain("bsc");
const token = { name: "Tether", symbol: "USDT", decimals: 6, totalSupply: { raw: "1", decimals: 6 } };

describe("resolveSearch", () => {
  it("rejects input no family recognizes", async () => {
    const reg = registryOf([fakeEvm({}), [eth, bsc]]);
    expect(await resolveSearch("hello", reg)).toEqual({ status: "invalid" });
    expect(await resolveSearch("", reg)).toEqual({ status: "invalid" });
  });

  it("stops at a bad checksum without calling any provider", async () => {
    const reg = registryOf([fakeEvm({}), [eth, bsc]]);
    const result = await resolveSearch(ADDR.replace("dAC", "DAC"), reg);
    expect(result.status).toBe("bad-checksum");
  });

  it("sends a token found on one chain straight to its token page", async () => {
    const reg = registryOf([
      fakeEvm({ ethereum: { kind: "token", hasActivity: true, token }, bsc: { kind: "account", hasActivity: false } }),
      [eth, bsc],
    ]);
    const result = await resolveSearch(ADDR, reg);
    expect(result).toMatchObject({ status: "address", target: `/token/ethereum/${ADDR}`, inactive: ["bsc"] });
  });

  it("lets the user choose when the address is in use on several chains with different identities", async () => {
    const reg = registryOf([
      fakeEvm({
        ethereum: { kind: "token", hasActivity: true, token },
        bsc: { kind: "account", hasActivity: true },
      }),
      [eth, bsc],
    ]);
    const result = await resolveSearch(ADDR, reg);
    expect(result).toMatchObject({ status: "address", target: null, overview: `/address/${ADDR}`, inactive: [] });
    if (result.status === "address") {
      expect(result.choices.map((c) => [c.chain, c.kind, c.path])).toEqual([
        ["ethereum", "token", `/token/ethereum/${ADDR}`],
        ["bsc", "account", `/address/${ADDR}?chain=bsc`],
      ]);
    }
  });

  it("counts a wallet that only holds the native coin as in use", async () => {
    const reg = registryOf([
      fakeEvm({
        ethereum: { kind: "token", hasActivity: true, token },
        bsc: { kind: "account", hasActivity: false, nativeBalance: { raw: "5", decimals: 18 } },
      }),
      [eth, bsc],
    ]);
    const result = await resolveSearch(ADDR, reg);
    expect(result).toMatchObject({ target: null });
  });

  it("opens the overview when the address is unused everywhere", async () => {
    const reg = registryOf([
      fakeEvm({ ethereum: { kind: "account", hasActivity: false }, bsc: { kind: "account", hasActivity: false } }),
      [eth, bsc],
    ]);
    expect(await resolveSearch(ADDR, reg)).toMatchObject({
      target: `/address/${ADDR}`,
      choices: [],
      inactive: ["ethereum", "bsc"],
    });
  });

  it("asks the user to choose when the same contract is a token on several chains", async () => {
    const reg = registryOf([
      fakeEvm({
        ethereum: { kind: "token", hasActivity: true, token },
        bsc: { kind: "token", hasActivity: true, token },
      }),
      [eth, bsc],
    ]);
    const result = await resolveSearch(ADDR, reg);
    expect(result).toMatchObject({ status: "address", target: null });
    if (result.status === "address") expect(result.choices.map((c) => c.chain)).toEqual(["ethereum", "bsc"]);
  });

  it("sends accounts to the address page and reports a failing chain instead of hiding it", async () => {
    const reg = registryOf([
      fakeEvm({ ethereum: { kind: "account", hasActivity: true }, bsc: new Error("down") }),
      [eth, bsc],
    ]);
    const result = await resolveSearch(ADDR, reg);
    expect(result).toMatchObject({ status: "address", target: `/address/${ADDR}`, unavailable: ["bsc"] });
  });

  it("reports unavailable when every chain fails", async () => {
    const reg = registryOf([fakeEvm({ ethereum: new Error("x"), bsc: new Error("y") }), [eth, bsc]]);
    expect(await resolveSearch(ADDR, reg)).toEqual({ status: "unavailable", unavailable: ["ethereum", "bsc"] });
  });

  it("finds a transaction on the chain that has it", async () => {
    const reg = registryOf([fakeEvm({}, { ethereum: false, bsc: true }), [eth, bsc]]);
    const result = await resolveSearch(HASH.toUpperCase().replace("0X", "0x"), reg);
    expect(result).toMatchObject({ status: "tx", hash: HASH, target: `/tx/${HASH}?chain=bsc` });
  });

  it("says not-found for an unknown hash, and unavailable when nobody answered", async () => {
    expect(await resolveSearch(HASH, registryOf([fakeEvm({}, { ethereum: false, bsc: false }), [eth, bsc]]))).toEqual({
      status: "not-found",
      kind: "tx",
      unavailable: [],
    });
    expect(
      await resolveSearch(HASH, registryOf([fakeEvm({}, { ethereum: new Error(), bsc: new Error() }), [eth, bsc]])),
    ).toMatchObject({ status: "unavailable" });
  });

  it("accepts a new blockchain family with no change to the resolver", async () => {
    const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    const fakeSolana: ChainFamilyAdapter = {
      family: "solana",
      parseAddress: (input) => (base58.test(input) ? { normalized: input, checksumValid: null } : null),
      parseTxId: () => null,
      explorerUrl: () => "",
      getHead: async () => ({ chain: "ethereum", blockNumber: "1", latencyMs: 1 }),
      lookupAddress: async (c) => ({ chain: c.key, kind: "account", hasActivity: true }),
      lookupTransaction: async () => null,
    };
    const sol = chain("solana", "solana");
    const reg = registryOf([fakeEvm({}), [eth]], [fakeSolana, [sol]]);
    const address = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    expect(await resolveSearch(address, reg)).toMatchObject({ status: "address", target: `/address/${address}` });
  });
});
