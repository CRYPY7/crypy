import { describe, expect, it } from "vitest";
import { checkOtherAddress } from "@/lib/address/other-formats";

describe("Bitcoin and Solana address formats", () => {
  it("recognises every Bitcoin address type (BIP-173/350 and base58check test vectors)", () => {
    const type = (a: string) => {
      const r = checkOtherAddress(a);
      return r?.ok && r.address.family === "bitcoin" ? `${r.address.network}:${r.address.type}` : JSON.stringify(r);
    };
    expect(type("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe("mainnet:p2pkh"); // genesis block address
    expect(type("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe("mainnet:p2sh");
    expect(type("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe("mainnet:p2wpkh");
    expect(type("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4")).toBe("mainnet:p2wpkh");
    expect(type("bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3")).toBe("mainnet:p2wsh");
    expect(type("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0")).toBe("mainnet:p2tr");
    expect(type("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx")).toBe("testnet:p2wpkh");
  });
  it("catches typos and wrong checksum variants", () => {
    expect(checkOtherAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toEqual({ ok: false, reason: "checksum" });
    expect(checkOtherAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")).toEqual({ ok: false, reason: "checksum" });
    // Taproot (v1) written with the old bech32 checksum: invalid under BIP-350.
    expect(checkOtherAddress("bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx")?.ok).toBe(
      false,
    );
    expect(checkOtherAddress("bc1qW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toEqual({ ok: false, reason: "format" });
  });
  it("recognises Solana public keys (32 bytes in base58)", () => {
    expect(checkOtherAddress("11111111111111111111111111111111")).toEqual({ ok: true, address: { family: "solana" } });
    expect(checkOtherAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")).toEqual({
      ok: true,
      address: { family: "solana" },
    });
    expect(checkOtherAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toEqual({
      ok: true,
      address: { family: "solana" },
    });
  });
  it("leaves EVM addresses and junk to the other checks", () => {
    expect(checkOtherAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7")).toBeNull();
    expect(checkOtherAddress("hello")).toBeNull();
    expect(checkOtherAddress("0OIl")).toBeNull();
  });
});
