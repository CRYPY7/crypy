import { describe, expect, it } from "vitest";
import { decodeSignatureRequest } from "@/modules/tools/signature-decoder/decode";
import { exampleMessage, examplePermit, examplePermit2 } from "@/modules/tools/signature-decoder/examples";

const NOW = Date.UTC(2026, 10, 24);
const keys = (r: ReturnType<typeof decodeSignatureRequest>) => (r.ok ? r.value.findings.map((f) => f.key) : r.error);

describe("signature decoder", () => {
  it("explains an unlimited ERC-2612 permit to an unknown spender", () => {
    const r = decodeSignatureRequest(examplePermit, NOW);
    if (!r.ok || r.value.kind !== "typed-data") throw new Error("expected typed data");
    expect(r.value.pattern).toBe("permit");
    expect(r.value.chain).toEqual({ id: 1, name: "Ethereum" });
    expect(r.value.allowances[0]?.unlimited).toBe(true);
    expect(r.value.spender?.address).toBe("0x5A0b54D5dc17e0AadC383d2db43B0a0D3E029c4c");
    expect(keys(r)).toEqual(["unlimited", "permitAllowance", "unknownSpender", "longDeadline"]);
    expect(r.value.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("explains a Permit2 approval to a known router, with its amount and expiry", () => {
    const r = decodeSignatureRequest(examplePermit2, NOW);
    if (!r.ok || r.value.kind !== "typed-data") throw new Error("expected typed data");
    expect(r.value.pattern).toBe("permit2-single");
    expect(r.value.chain.name).toBe("BNB Chain");
    expect(r.value.allowances).toEqual([
      {
        token: expect.objectContaining({ address: "0x55d398326f99059fF775485246999027B3197955" }),
        amount: "250000000000000000000",
        unlimited: false,
      },
    ]);
    expect(r.value.spender?.name).toBe("1inch Aggregation Router v5");
    expect(keys(r)).toEqual(["permitAllowance", "knownSpender"]);
  });
  it("accepts the wallet's [address, json-string] request form", () => {
    const r = decodeSignatureRequest(
      JSON.stringify(["0x1111111111111111111111111111111111111111", examplePermit]),
      NOW,
    );
    expect(r.ok && r.value.kind === "typed-data" && r.value.pattern).toBe("permit");
  });
  it("flags a marketplace order that pays someone else", () => {
    const order = {
      types: { OrderComponents: [{ name: "offerer", type: "address" }] },
      primaryType: "OrderComponents",
      domain: {
        name: "Seaport",
        version: "1.6",
        chainId: 1,
        verifyingContract: "0x0000000000000068F116a894984e2DB1123eB395",
      },
      message: {
        offerer: "0x1111111111111111111111111111111111111111",
        offer: [
          {
            itemType: "2",
            token: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
            identifierOrCriteria: "1",
            startAmount: "1",
            endAmount: "1",
          },
        ],
        consideration: [
          {
            itemType: "0",
            token: "0x0000000000000000000000000000000000000000",
            identifierOrCriteria: "0",
            startAmount: "1",
            endAmount: "1",
            recipient: "0x2222222222222222222222222222222222222222",
          },
        ],
        endTime: "1798761600",
      },
    };
    const r = decodeSignatureRequest(JSON.stringify(order), NOW);
    if (!r.ok || r.value.kind !== "typed-data") throw new Error("expected typed data");
    expect(r.value.pattern).toBe("seaport");
    expect(keys(r).slice(0, 2)).toEqual(["seaportNoPayment", "seaportListing"]);
  });
  it("reads messages, warns about blind hashes and unrecognised data", () => {
    expect(keys(decodeSignatureRequest(exampleMessage))).toEqual(["plainMessage", "signInMessage"]);
    const hex = `0x${Buffer.from("Claim your airdrop").toString("hex")}`;
    const msg = decodeSignatureRequest(hex);
    expect(msg.ok && msg.value.kind === "message" && msg.value.text).toBe("Claim your airdrop");
    expect(keys(msg)).toContain("messageMentionsFunds");
    expect(keys(decodeSignatureRequest(`0x${"ab".repeat(32)}`))).toEqual(["blindHash"]);
    const other = decodeSignatureRequest(
      JSON.stringify({
        types: { Mail: [{ name: "to", type: "string" }] },
        primaryType: "Mail",
        domain: { chainId: 1 },
        message: { to: "Bob" },
      }),
    );
    expect(keys(other)).toContain("unrecognised");
  });
  it("refuses what it can't read", () => {
    expect(decodeSignatureRequest("")).toEqual({ ok: false, error: "empty" });
    expect(decodeSignatureRequest("{ not json")).toEqual({ ok: false, error: "json" });
    expect(decodeSignatureRequest('{"a":1}')).toEqual({ ok: false, error: "not-typed-data" });
  });
});
