import { describe, expect, it } from "vitest";
import {
  SAFETY_TTL_MS,
  type SafetyReport,
  forgetSafety,
  freshEntry,
  parseSafetyCache,
  rememberSafety,
  serializeSafetyCache,
} from "@/lib/portfolio/safety-cache";

const A = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const B = "0x28C6c06298d514Db089934071355E5743bf21d60";
const T = 1_800_000_000_000;
const complete: SafetyReport = {
  approvals: { attention: 2, chains: ["bsc"], partial: false },
  flagged: {
    tokens: [
      {
        chain: "bsc",
        address: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
        symbol: "MGRT",
        reason: "honeypot",
        sellTax: null,
      },
    ],
    checked: 3,
    skipped: 0,
  },
};

describe("Portfolio safety results kept in the browser (B-034)", () => {
  it("remembers a complete result for 6 hours, then checks again", () => {
    const cache = parseSafetyCache(serializeSafetyCache(rememberSafety({}, A, complete, T)));
    expect(freshEntry(cache, A, T + 1000)?.report).toEqual(complete);
    expect(freshEntry(cache, A.toLowerCase(), T + SAFETY_TTL_MS - 1)).not.toBeNull();
    expect(freshEntry(cache, A, T + SAFETY_TTL_MS)).toBeNull();
    expect(freshEntry(cache, B, T)).toBeNull();
  });

  it("never remembers an incomplete result, and an incomplete re-check replaces a complete one", () => {
    const partial = { ...complete, approvals: { ...complete.approvals!, partial: true } };
    const skipped = { ...complete, flagged: { ...complete.flagged!, skipped: 1 } };
    expect(rememberSafety({}, A, partial, T)).toEqual({});
    expect(rememberSafety({}, A, skipped, T)).toEqual({});
    expect(rememberSafety({}, A, { approvals: null, flagged: complete.flagged }, T)).toEqual({});
    const kept = rememberSafety({}, A, complete, T);
    expect(rememberSafety(kept, A, partial, T + 1)).toEqual({});
  });

  it("forgets one wallet (Check again, remove) and drops expired entries", () => {
    let cache = rememberSafety({}, A, complete, T);
    cache = rememberSafety(cache, B, complete, T + SAFETY_TTL_MS + 1);
    expect(Object.keys(cache)).toEqual([B.toLowerCase()]);
    expect(forgetSafety(cache, B)).toEqual({});
  });

  it("reads defensively: junk, wrong versions, bad addresses and edited entries are dropped", () => {
    expect(parseSafetyCache(null)).toEqual({});
    expect(parseSafetyCache("{not json")).toEqual({});
    expect(parseSafetyCache(JSON.stringify({ v: 2, entries: {} }))).toEqual({});
    const good = { at: T, report: complete };
    const entries = {
      [A.toLowerCase()]: good,
      "not-an-address": good,
      [B.toLowerCase()]: {
        at: T,
        report: { ...complete, flagged: { ...complete.flagged, tokens: [{ symbol: "X" }] } },
      },
      "0x0000000000000000000000000000000000000001": { at: "yesterday", report: complete },
    };
    expect(Object.keys(parseSafetyCache(JSON.stringify({ v: 1, entries })))).toEqual([A.toLowerCase()]);
  });
});
