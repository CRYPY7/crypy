import { describe, expect, it } from "vitest";
import { hashes, signatureInfo } from "@/modules/tools/keccak-hash/hash";

describe("hashes", () => {
  it("Keccak-256 and SHA-256 of text and bytes (known vectors)", () => {
    const empty = hashes("", "hex");
    expect(empty).toEqual({ ok: false, error: "empty" });
    const abc = hashes("abc", "text");
    if (!abc.ok) throw new Error("expected ok");
    expect(abc.keccak).toBe("0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    expect(abc.sha).toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const hex = hashes("0x616263", "hex");
    expect(hex.ok && hex.keccak).toBe(abc.keccak);
    expect(hashes("0x123", "hex")).toEqual({ ok: false, error: "hex" });
    expect(hashes("zz", "hex")).toEqual({ ok: false, error: "hex" });
  });
});

describe("signatures", () => {
  it("function selectors from any common way of writing them", () => {
    for (const s of [
      "transfer(address,uint256)",
      "function transfer(address to, uint256 amount)",
      "transfer(address to,uint256 amount);",
    ]) {
      const r = signatureInfo(s);
      expect(r.ok && r.value.selector, s).toBe("0xa9059cbb");
      expect(r.ok && r.value.canonical).toBe("transfer(address,uint256)");
    }
    const approve = signatureInfo("approve(address,uint256)");
    expect(approve.ok && approve.value.selector).toBe("0x095ea7b3");
  });
  it("event topics and custom errors", () => {
    const t = signatureInfo("event Transfer(address indexed from, address indexed to, uint256 value)");
    expect(t.ok && t.value.topic).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    expect(t.ok && t.value.canonical).toBe("Transfer(address,address,uint256)");
    const e = signatureInfo("error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)");
    expect(e.ok && e.value.selector).toBe("0xe450d38c");
  });
  it("refuses nonsense", () => {
    expect(signatureInfo("")).toEqual({ ok: false, error: "empty" });
    expect(signatureInfo("transfer(adress,uint256)")).toEqual({ ok: false, error: "invalid" });
    expect(signatureInfo("hello world")).toEqual({ ok: false, error: "invalid" });
  });
});

import { decodeCall, decodeLog, encodeCall, readAbi } from "@/modules/tools/abi-encoder/abi";
import { convert } from "@/modules/tools/encoding-converter/encoding";
import { csvToJson, formatJson, jsonToCsv } from "@/modules/tools/json-csv/json-csv";

const ERC20 = JSON.stringify([
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
]);

describe("ABI tools", () => {
  it("reads JSON, build artifacts and human-readable ABIs, with selectors and topics", () => {
    const r = readAbi(ERC20);
    if (!r.ok) throw new Error(r.error);
    expect(r.entries.map((e) => `${e.kind}:${e.signature}:${e.id}`)).toEqual([
      "function:transfer(address,uint256):0xa9059cbb",
      "function:balanceOf(address):0x70a08231",
      "event:Transfer(address,address,uint256):0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "error:ERC20InsufficientBalance(address,uint256,uint256):0xe450d38c",
    ]);
    const artifact = readAbi(JSON.stringify({ contractName: "T", abi: JSON.parse(ERC20) }));
    expect(artifact.ok && artifact.entries.length).toBe(4);
    const human = readAbi(
      "function transfer(address to, uint256 amount) returns (bool)\nevent Transfer(address indexed from, address indexed to, uint256 value)",
    );
    expect(human.ok && human.entries.length).toBe(2);
    expect(readAbi("{bad")).toEqual({ ok: false, error: "json" });
    expect(readAbi('[{"name":"x"}]')).toEqual({ ok: false, error: "not-abi" });
    expect(
      readAbi(
        '[{"type":"function","name":"f","inputs":[{"name":"a","type":"uint257"}],"outputs":[],"stateMutability":"view"}]',
      ).ok,
    ).toBe(false);
  });
  it("encodes a call and decodes it back, exactly", () => {
    const r = readAbi(ERC20);
    if (!r.ok) throw new Error("abi");
    const enc = encodeCall(r.abi, "transfer(address,uint256)", [
      "0xdac17f958d2ee523a2206206994597c13d831ec7",
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    ]);
    if (!enc.ok) throw new Error(JSON.stringify(enc.error));
    expect(enc.data.slice(0, 10)).toBe("0xa9059cbb");
    const dec = decodeCall(r.abi, enc.data);
    if (!dec.ok) throw new Error(dec.error);
    expect(dec.signature).toBe("transfer(address,uint256)");
    expect(dec.args.map((a) => a.value)).toEqual([
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    ]);
    expect(encodeCall(r.abi, "transfer(address,uint256)", ["0x123", "1"])).toEqual({
      ok: false,
      error: { index: 0, reason: "address" },
    });
    expect(
      encodeCall(r.abi, "transfer(address,uint256)", ["0xdac17f958d2ee523a2206206994597c13d831ec7", "1.5"]),
    ).toEqual({ ok: false, error: { index: 1, reason: "number" } });
    expect(decodeCall(r.abi, "0x12345678").ok).toBe(false);
  });
  it("decodes an event log", () => {
    const r = readAbi(ERC20);
    if (!r.ok) throw new Error("abi");
    const topics = [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x0000000000000000000000001111111111111111111111111111111111111111",
      "0x0000000000000000000000002222222222222222222222222222222222222222",
    ].join("\n");
    const res = decodeLog(r.abi, topics, "0x00000000000000000000000000000000000000000000000000000000000f4240");
    if (!res.ok) throw new Error(res.error);
    expect(res.signature).toBe("Transfer(address,address,uint256)");
    expect(res.args.map((a) => a.value)).toEqual([
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "1000000",
    ]);
  });
});

describe("encoding converter", () => {
  it("converts text, hex, Base64 and Base58 both ways", () => {
    const r = convert("Hello", "text");
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.values).toEqual({
      text: "Hello",
      hex: "0x48656c6c6f",
      base64: "SGVsbG8=",
      base64url: "SGVsbG8=",
      base58: "9Ajdvzr",
    });
    const back = convert("9Ajdvzr", "base58");
    expect(back.ok && back.value.values.text).toBe("Hello");
    const unpadded = convert("SGVsbG8", "base64");
    expect(unpadded.ok && unpadded.value.values.text).toBe("Hello");
    const bin = convert("0x00ff10", "hex");
    expect(bin.ok && bin.value.values.text).toBeNull();
    expect(bin.ok && bin.value.values.base58).toBe("1LQo");
    expect(convert("0OIl", "base58")).toEqual({ ok: false, error: "invalid" });
    expect(convert("0x123", "hex")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("JSON and CSV", () => {
  it("formats JSON and points at errors", () => {
    expect(formatJson('{"a":[1,2]}', 2)).toEqual({ ok: true, value: '{\n  "a": [\n    1,\n    2\n  ]\n}' });
    expect(formatJson('{ "a": 1 }', 0)).toEqual({ ok: true, value: '{"a":1}' });
    const bad = formatJson('{\n  "a": 1,\n}', 2);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.line).toBe(3);
  });
  it("converts between JSON lists and CSV safely", () => {
    const csv = jsonToCsv('[{"name":"A, B","n":1},{"name":"=HYPERLINK()","x":"q\\"t"}]');
    expect(csv).toEqual({ ok: true, rows: 2, value: 'name,n,x\n"A, B",1,\n\'=HYPERLINK(),,"q""t"' });
    const json = csvToJson('name,n\n"A, B",1\n"say ""hi""",2\n');
    expect(json.ok && JSON.parse(json.value)).toEqual([
      { name: "A, B", n: "1" },
      { name: 'say "hi"', n: "2" },
    ]);
    const semi = csvToJson("a;b\n1;2");
    expect(semi.ok && JSON.parse(semi.value)).toEqual([{ a: "1", b: "2" }]);
    expect(jsonToCsv('{"a":1}')).toEqual({ ok: false, error: "not-list" });
    expect(csvToJson('a\n"open')).toEqual({ ok: false, error: "csv" });
  });
});
