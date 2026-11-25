import { describe, expect, it } from "vitest";
import { getAddress, keccak256, toRlp } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifySignature } from "@/modules/tools/signature-verifier/verify";
import { decodeRaw } from "@/modules/tools/raw-tx-decoder/raw-tx";
import { bitcoinFee } from "@/modules/tools/bitcoin-fee/fee";
import { hashBytes, readExpected } from "@/modules/tools/file-hash/checksum";
import {
  addEntry,
  checkAddress,
  emptyBook,
  matchAddress,
  mergeBooks,
  parseBook,
  serializeBook,
} from "@/modules/tools/address-book/book";

// Anvil's first public test key (well known, holds nothing): used only to make signatures to check.
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const typed = {
  domain: { name: "Test", version: "1", chainId: 1, verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  types: { Mail: [{ name: "contents", type: "string" }] },
  primaryType: "Mail",
  message: { contents: "Hello" },
} as const;

describe("signature verifier", () => {
  it("finds who signed a text message and compares with the expected address", async () => {
    const signature = await account.signMessage({ message: "I own this wallet" });
    const ok = await verifySignature({
      message: "I own this wallet",
      mode: "text",
      signature,
      expected: account.address.toLowerCase(),
    });
    expect(ok.ok && ok.value).toMatchObject({ kind: "message", signer: account.address, matches: true });
    const other = await verifySignature({ message: "I own this wallet", mode: "text", signature, expected: OTHER });
    expect(other.ok && other.value.matches).toBe(false);
    // A changed message recovers a different (random) signer, never the real one.
    const changed = await verifySignature({ message: "I own this wallet!", mode: "text", signature, expected: "" });
    expect(changed.ok && changed.value.signer).not.toBe(account.address);
  });
  it("reads hex messages as bytes", async () => {
    const signature = await account.signMessage({ message: { raw: "0x48656c6c6f" } });
    const r = await verifySignature({ message: "0x48656c6c6f", mode: "hex", signature, expected: "" });
    expect(r.ok && r.value.signer).toBe(account.address);
  });
  it("verifies EIP-712 typed data, also as a wallet's [address, json] params", async () => {
    const signature = await account.signTypedData(typed);
    const r = await verifySignature({ message: JSON.stringify(typed), mode: "text", signature, expected: "" });
    expect(r.ok && r.value).toMatchObject({ kind: "typed-data", signer: account.address, primaryType: "Mail" });
    const params = JSON.stringify([account.address, JSON.stringify(typed)]);
    const r2 = await verifySignature({ message: params, mode: "text", signature, expected: account.address });
    expect(r2.ok && r2.value.matches).toBe(true);
  });
  it("refuses bad input", async () => {
    expect(await verifySignature({ message: "", mode: "text", signature: "0x12", expected: "" })).toEqual({
      ok: false,
      error: "empty-message",
    });
    expect(await verifySignature({ message: "x", mode: "text", signature: "0x12", expected: "" })).toEqual({
      ok: false,
      error: "signature",
    });
    const sig = await account.signMessage({ message: "x" });
    expect(await verifySignature({ message: "x", mode: "text", signature: sig, expected: "0x123" })).toEqual({
      ok: false,
      error: "expected",
    });
    expect(await verifySignature({ message: "{bad", mode: "text", signature: sig, expected: "" })).toEqual({
      ok: false,
      error: "json",
    });
  });
});

describe("raw transaction decoder", () => {
  it("decodes a signed EIP-1559 transaction: fields, sender and hash", async () => {
    const raw = await account.signTransaction({
      chainId: 56,
      type: "eip1559",
      nonce: 7,
      to: OTHER,
      value: 10n ** 18n,
      gas: 21000n,
      maxFeePerGas: 3_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    });
    const r = await decodeRaw(raw);
    if (!r.ok || r.value.kind !== "transaction") throw new Error("expected a transaction");
    expect(r.value).toMatchObject({
      type: "eip1559",
      chainId: 56,
      signed: true,
      from: account.address,
      to: OTHER,
      hash: keccak256(raw),
    });
    expect(r.value.fields.find((f) => f.key === "value")).toMatchObject({ value: "1000000000000000000" });
    expect(r.value.fields.find((f) => f.key === "maxFeePerGas")?.note).toBe("3 gwei");
  });
  it("decodes a legacy transaction with call data, without 0x", async () => {
    const raw = await account.signTransaction({
      chainId: 1,
      type: "legacy",
      nonce: 0,
      to: OTHER,
      gas: 50000n,
      gasPrice: 1n,
      data: "0xa9059cbb",
    });
    const r = await decodeRaw(raw.slice(2));
    expect(r.ok && r.value.kind === "transaction" && r.value.data).toBe("0xa9059cbb");
  });
  it("shows other RLP as a tree, and refuses junk", async () => {
    const r = await decodeRaw(toRlp(["0x01", ["0x0203", "0x"]]));
    expect(r.ok && r.value).toEqual({
      kind: "rlp",
      tree: { list: [{ bytes: "0x01" }, { list: [{ bytes: "0x0203" }, { bytes: "0x" }] }] },
    });
    expect(await decodeRaw("0xzz")).toEqual({ ok: false, error: "hex" });
    expect(await decodeRaw("0xc5")).toEqual({ ok: false, error: "rlp" });
  });
});

describe("Bitcoin fee", () => {
  it("adds up virtual bytes and rounds the fee up", () => {
    const r = bitcoinFee({ inputs: { p2wpkh: "1" }, outputs: { p2wpkh: "2" }, rate: "10", price: "" });
    // 10.5 + 68 + 2 × 31 = 140.5 → 141 vB
    expect(r).toEqual({
      ok: true,
      value: { vbytes: 141, feeSats: 1410n, feeBtc: "0.00001410", feeUsd: null, segwit: true },
    });
    const legacy = bitcoinFee({
      inputs: { p2pkh: "2" },
      outputs: { p2pkh: "1", p2tr: "1" },
      rate: "2.5",
      price: "60000",
    });
    // 10 + 296 + 34 + 43 = 383 vB; 383 × 2.5 = 957.5 → 958 sats; × $60,000 / 1e8 = $0.5748 → $0.57
    expect(legacy).toEqual({
      ok: true,
      value: { vbytes: 383, feeSats: 958n, feeBtc: "0.00000958", feeUsd: "0.57", segwit: false },
    });
  });
  it("refuses incomplete input", () => {
    expect(bitcoinFee({ inputs: {}, outputs: { p2tr: "1" }, rate: "1", price: "" })).toEqual({
      ok: false,
      error: "no-inputs",
    });
    expect(bitcoinFee({ inputs: { p2tr: "1" }, outputs: {}, rate: "1", price: "" })).toEqual({
      ok: false,
      error: "no-outputs",
    });
    expect(bitcoinFee({ inputs: { p2tr: "1.5" }, outputs: { p2tr: "1" }, rate: "1", price: "" })).toEqual({
      ok: false,
      error: "count",
    });
    expect(bitcoinFee({ inputs: { p2tr: "1" }, outputs: { p2tr: "1" }, rate: "0", price: "" })).toEqual({
      ok: false,
      error: "rate",
    });
  });
});

describe("file hash checker", () => {
  const abc256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  it("hashes bytes with the browser's crypto", async () => {
    const h = await hashBytes(new TextEncoder().encode("abc").buffer as ArrayBuffer);
    expect(h["SHA-256"]).toBe(abc256);
    expect(h["SHA-1"]).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
  it("reads published checksums in their usual shapes", () => {
    expect(readExpected(`${abc256.toUpperCase()}  wallet.dmg`)).toEqual({
      ok: true,
      algorithm: "SHA-256",
      hex: abc256,
    });
    expect(readExpected(`SHA256 (wallet.dmg) = ${abc256}`)).toEqual({ ok: true, algorithm: "SHA-256", hex: abc256 });
    expect(readExpected(`sha256:${abc256}`)).toEqual({ ok: true, algorithm: "SHA-256", hex: abc256 });
    expect(readExpected("sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=")).toEqual({
      ok: true,
      algorithm: "SHA-256",
      hex: abc256,
    });
    expect(readExpected("1234")).toEqual({ ok: false, error: "format" });
    expect(readExpected("  ")).toBeNull();
  });
});

describe("address book", () => {
  const A = "0x1111aaaa2222bbbb3333cccc4444dddd5555eeee";
  it("adds checksummed addresses, refuses secrets, duplicates and empty labels", () => {
    const r = addEntry(emptyBook, A, "Exchange deposit", 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.book.entries[0]).toMatchObject({ family: "evm", label: "Exchange deposit", address: getAddress(A) });
    expect(addEntry(r.book, A.toUpperCase().replace("0X", "0x"), "Again")).toEqual({ ok: false, error: "duplicate" });
    expect(addEntry(emptyBook, "ab".repeat(32), "key")).toEqual({ ok: false, error: "secret" });
    expect(addEntry(emptyBook, A, "  ")).toEqual({ ok: false, error: "label" });
  });
  it("tells saved, look-alike and unknown addresses apart", () => {
    const r = addEntry(emptyBook, A, "Exchange deposit");
    if (!r.ok) throw new Error(r.error);
    expect(matchAddress(r.book, checkAddressOk(A), "evm").kind).toBe("saved");
    const poison = "0x1111" + "9".repeat(32) + "eeee";
    const m = matchAddress(r.book, checkAddressOk(poison), "evm");
    expect(m.kind === "lookalike" && m.entries[0]!.label).toBe("Exchange deposit");
    expect(matchAddress(r.book, checkAddressOk("0x" + "2".repeat(40)), "evm").kind).toBe("unknown");
  });
  it("keeps Bitcoin and Solana addresses; bech32 compares without case", () => {
    expect(checkAddress("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4")).toEqual({
      kind: "ok",
      family: "bitcoin",
      address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    });
    expect(checkAddress("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T").kind).toBe("ok");
  });
  it("survives a round trip and drops junk when reading", () => {
    const r = addEntry(emptyBook, A, "Exchange deposit");
    if (!r.ok) throw new Error(r.error);
    expect(parseBook(serializeBook(r.book))).toEqual(r.book);
    expect(
      parseBook('{"v":1,"entries":[{"address":"nope","label":"x"},{"address":"' + A + '","label":"ok"}]}').entries,
    ).toHaveLength(1);
    expect(parseBook("not json")).toEqual(emptyBook);
    expect(mergeBooks(r.book, r.book).entries).toHaveLength(1);
  });
});

function checkAddressOk(raw: string): string {
  const c = checkAddress(raw);
  if (c.kind !== "ok") throw new Error(c.kind);
  return c.address;
}
