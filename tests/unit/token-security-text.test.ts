import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import messages from "../../messages/en.json";
import { checkText } from "@/components/entity/token-security";
import type { SecurityCheck } from "@/lib/security/types";

// A translator that fails on any formatting problem (a missing value), instead of logging it as the site does.
const t = createTranslator({
  locale: "en",
  messages,
  onError: (error) => {
    throw error;
  },
}) as unknown as Parameters<typeof checkText>[1];

const check = (over: Partial<SecurityCheck>): SecurityCheck =>
  ({
    id: "sell",
    group: "trading",
    status: "risk",
    severity: "critical",
    class: "simulated",
    values: {},
    ...over,
  }) as SecurityCheck;

describe("token security check texts", () => {
  it("explains a sale the pool rejects for the token's fee without needing a failure reason", () => {
    const text = checkText(check({ values: { dex: "PancakeSwap v2", state: "feeRejected", tax: "5%" } }), t);
    expect(text).toEqual({
      title: "Selling failed in the trade test",
      detail: "The PancakeSwap v2 pool rejects sales because the token takes 5% of every transfer into it.",
    });
  });

  it("still explains an ordinary failed sale with the contract's reason", () => {
    const text = checkText(check({ values: { dex: "PancakeSwap v2", reason: "TRANSFER_FAILED" } }), t);
    expect(text.detail).toMatch(/^Buying worked but selling failed\. .*TRANSFER_FAILED/);
  });

  it("uses the owner and burned-admin sentences without formatting the general ones", () => {
    expect(checkText(check({ id: "lp", group: "liquidity", values: { state: "owner", owner: "60%" } }), t).detail).toBe(
      "60% of the liquidity is in the owner's hands; it can be removed at any time.",
    );
    expect(checkText(check({ id: "proxy", group: "contract", values: { admin: "burned" } }), t).detail).toBe(
      "Its admin is a burn address, so it can no longer be upgraded.",
    );
  });
});
