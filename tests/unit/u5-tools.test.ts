import { describe, expect, it } from "vitest";
import { getAddress, keccak256 } from "viem";
import { toPlain } from "@/lib/math/decimal";
import { profitCalc } from "@/modules/tools/profit-calculator/profit";
import { codeInfo, compareCode, findMetadata, readCode } from "@/modules/tools/bytecode-compare/bytecode";
import { decodeNft, fillId, readUri } from "@/modules/tools/nft-uri-decoder/nft-uri";
import { diffJson, parseJson, report } from "@/modules/tools/json-diff/diff";
import { calldataGas, gasCost, readCalldata } from "@/modules/tools/calldata-gas/calldata";

describe("profit calculator", () => {
  it("averages several buys with fees and finds profit and break-even exactly", () => {
    const r = profitCalc({
      buys: [
        { amount: "1", price: "2000" },
        { amount: "1", price: "3000" },
      ],
      buyFees: "10",
      sellPrice: "3500",
      sellFee: "0.1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(toPlain(r.value.cost)).toBe("5010");
    expect(toPlain(r.value.averageCost)).toBe("2505");
    expect(toPlain(r.value.saleValue)).toBe("7000");
    expect(toPlain(r.value.sellFeeUsd)).toBe("7");
    expect(toPlain(r.value.profit)).toBe("1983");
    // 5010 / (2 × 0.999) = 2507.507507…
    expect(toPlain(r.value.breakEven!).startsWith("2507.5075075075")).toBe(true);
  });

  it("shows a loss as a negative profit", () => {
    const r = profitCalc({ buys: [{ amount: "10", price: "1.5" }], buyFees: "", sellPrice: "1", sellFee: "" });
    expect(r.ok && toPlain(r.value.profit)).toBe("-5");
    expect(r.ok && toPlain(r.value.profitPercent!)).toBe("-33.333333");
  });

  it("asks for both numbers in a buy row and refuses a 100% fee", () => {
    const r = profitCalc({ buys: [{ amount: "1", price: "" }], buyFees: "", sellPrice: "2", sellFee: "100" });
    expect(r).toEqual({ ok: false, errors: { "price-0": "half-row", sellFee: "over-100" } });
    const none = profitCalc({ buys: [{ amount: "", price: "" }], buyFees: "", sellPrice: "2", sellFee: "" });
    expect(none).toEqual({ ok: false, errors: { "amount-0": "no-buys" } });
  });
});

// A real Solidity metadata tail: a2 64 "ipfs" 58 22 <34 bytes> 64 "solc" 43 00 08 18, then the length 0x0033.
const IPFS_HASH = `1220${"ab".repeat(32)}`;
const META = `a264697066735822${IPFS_HASH}64736f6c63430008180033`;
const PROGRAM = "6080604052348015600e575f80fd5b50";

describe("bytecode comparer", () => {
  it("reads the Solidity metadata block", () => {
    const code = readCode(`0x${PROGRAM}${META}`);
    expect(code.ok).toBe(true);
    if (!code.ok) return;
    const meta = findMetadata(code.bytes)!;
    expect(meta.solc).toBe("0.8.24");
    expect(meta.ipfs!.startsWith("Qm")).toBe(true);
    expect(meta.start).toBe(PROGRAM.length / 2);
    expect(codeInfo(code.bytes).hash).toBe(keccak256(`0x${PROGRAM}${META}`));
  });

  it("tells identical, same code with other metadata, and different code apart", () => {
    const a = readCode(PROGRAM + META);
    const b = readCode(PROGRAM + META.replace("abab", "cdcd"));
    const c = readCode(PROGRAM.replace("0e", "0f") + META);
    if (!a.ok || !b.ok || !c.ok) throw new Error("parse");
    expect(compareCode(a.bytes, a.bytes).verdict).toBe("identical");
    expect(compareCode(a.bytes, b.bytes).verdict).toBe("same-code");
    const diff = compareCode(a.bytes, c.bytes);
    expect(diff.verdict).toBe("same-length");
    expect(diff.firstDifference).toBe(PROGRAM.indexOf("0e") / 2);
    expect(diff.regions).toBe(1);
    expect(diff.allWordSized).toBe(true);
  });

  it("recognises a minimal proxy and an EIP-7702 delegation", () => {
    const impl = "bebebebebebebebebebebebebebebebebebebebe";
    const proxy = readCode(`363d3d373d3d3d363d73${impl}5af43d82803e903d91602b57fd5bf3`);
    const delegation = readCode(`ef0100${impl}`);
    if (!proxy.ok || !delegation.ok) throw new Error("parse");
    expect(codeInfo(proxy.bytes).kind).toEqual({
      kind: "minimal-proxy",
      implementation: getAddress(`0x${impl}`),
    });
    expect(codeInfo(delegation.bytes).kind.kind).toBe("delegation");
  });

  it("refuses text that isn't hex", () => {
    expect(readCode("0x12g4")).toEqual({ ok: false, error: "format" });
    expect(readCode("0x123")).toEqual({ ok: false, error: "odd" });
  });
});

describe("NFT token URI decoder", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
  const meta = {
    name: "Token #1",
    description: "On-chain test",
    image: `data:image/svg+xml;base64,${btoa(svg)}`,
    attributes: [
      { trait_type: "Colour", value: "Black" },
      { trait_type: "Level", value: 3, display_type: "number" },
    ],
  };

  it("decodes on-chain base64 JSON with an SVG image", () => {
    const r = decodeNft(`data:application/json;base64,${btoa(JSON.stringify(meta))}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.metadata?.name).toBe("Token #1");
    expect(r.value.metadata?.attributes).toEqual([
      { trait: "Colour", value: "Black", displayType: null },
      { trait: "Level", value: "3", displayType: "number" },
    ]);
    expect(r.value.image?.preview?.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(r.value.findings.map((f) => f.code)).toEqual(["on-chain", "on-chain"]);
  });

  it("decodes plain (not base64) data: JSON", () => {
    const r = decodeNft(`data:application/json;utf8,${JSON.stringify({ name: "Plain", image: "ipfs://Qm1/1.png" })}`);
    expect(r.ok && r.value.metadata?.name).toBe("Plain");
    expect(r.ok && r.value.image?.gateways[0]).toBe("https://ipfs.io/ipfs/Qm1/1.png");
  });

  it("flags scripts in an SVG, javascript: links and web hosting", () => {
    const bad = {
      image: `data:image/svg+xml;base64,${btoa('<svg onload="alert(1)"></svg>')}`,
      animation_url: "https://example.com/a.html",
      external_url: "javascript:alert(1)",
    };
    const r = decodeNft(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const codes = r.value.findings.map((f) => `${f.code}:${f.field}`);
    expect(codes).toContain("svg-script:image");
    expect(codes).toContain("script-scheme:external");
    expect(codes).toContain("web-hosted:animation");
    expect(r.value.findings[0]!.tone).toBe("critical");
  });

  it("fills the ERC-1155 {id} and maps IPFS and Arweave to gateways", () => {
    expect(fillId("ipfs://Qm/{id}.json", "10")).toEqual({ ok: true, uri: `ipfs://Qm/${"0".repeat(62)}0a.json` });
    expect(fillId("x", "abc")).toEqual({ ok: false });
    expect(readUri("ar://abc")?.gateways).toEqual(["https://arweave.net/abc"]);
    expect(readUri("ipfs://ipfs/QmX")?.gateways[0]).toBe("https://ipfs.io/ipfs/QmX");
    expect(readUri("java\tscript:alert(1)")?.scheme).toBe("script");
  });

  it("reports broken input", () => {
    expect(decodeNft("{ bad")).toEqual({ ok: false, error: "bad-json" });
    expect(decodeNft("data:application/json;base64,@@@")).toEqual({ ok: false, error: "bad-data" });
  });
});

describe("JSON diff", () => {
  it("keeps big numbers exact and treats 1.0 and 1 as equal", () => {
    const a = parseJson('{"amount": 123456789012345678901234567890, "x": 1.0}');
    const b = parseJson('{"amount": 123456789012345678901234567891, "x": 1}');
    if (!a.ok || !b.ok) throw new Error("parse");
    const d = diffJson(a.value, b.value);
    expect(d.changes).toEqual([
      {
        path: "$.amount",
        kind: "changed",
        before: "123456789012345678901234567890",
        after: "123456789012345678901234567891",
      },
    ]);
  });

  it("lists added, removed, changed and type changes with paths", () => {
    const a = parseJson('{"a":1,"list":[1,2,3],"o":{"k":"v"},"t":"1","my key":true}');
    const b = parseJson('{"a":2,"list":[1,2],"o":{"k":"v","n":null},"t":1,"my key":true}');
    if (!a.ok || !b.ok) throw new Error("parse");
    const d = diffJson(a.value, b.value);
    expect(d.counts).toEqual({ added: 1, removed: 1, changed: 1, type: 1 });
    expect(report(d).split("\n")).toEqual(["~ $.a: 1 → 2", "- $.list[2]: 3", "+ $.o.n: null", '~ $.t: "1" → 1']);
  });

  it("finds repeated keys and says where a syntax error is", () => {
    const dup = parseJson('{"to":"0x1","to":"0x2"}');
    expect(dup.ok && dup.duplicates).toEqual(["$.to"]);
    const bad = parseJson('{\n  "a": 1,\n  "b": }');
    expect(bad).toEqual({ ok: false, error: "syntax", line: 3, column: 8 });
  });
});

describe("calldata gas", () => {
  it("counts an ERC-20 transfer's data like the EVM does", () => {
    const data = readCalldata(
      "0xa9059cbb000000000000000000000000bebebebebebebebebebebebebebebebebebebebe00000000000000000000000000000000000000000000000000000000000f4240",
    );
    if (!data.ok) throw new Error("parse");
    const g = calldataGas(data.bytes);
    expect(g.bytes).toBe(68);
    expect(g.nonZeroBytes).toBe(4 + 20 + 3);
    expect(g.zeroBytes).toBe(41);
    expect(g.dataGas).toBe(41n * 4n + 27n * 16n);
    expect(g.intrinsic).toBe(21_000n + 596n);
    expect(g.floor).toBe(21_000n + 10n * (41n + 27n * 4n));
    expect(g.floorAppliesBelow).toBe(g.floor - g.intrinsic);
    expect(g.selector).toBe("0xa9059cbb");
  });

  it("adds contract-creation costs per 32-byte word", () => {
    const g = calldataGas(new Uint8Array(33).fill(1), { create: true });
    expect(g.createGas).toBe(32_000n + 2n * 2n);
    expect(g.selector).toBeNull();
  });

  it("prices gas exactly", () => {
    const c = gasCost(21_000n, "2.5", "3000");
    expect(c.ok && toPlain(c.value.native)).toBe("0.0000525");
    expect(c.ok && toPlain(c.value.usd!)).toBe("0.1575");
  });
});
