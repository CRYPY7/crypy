/**
 * Approvals → risk per approval and a summary. Pure, deterministic, unit-tested; the same for every chain family.
 *
 *   malicious: GoPlus lists the spender as malicious (outside source, labelled)
 *   high:      the spender is a person's wallet (no app needs that) — a common way scams drain wallets
 *   check:     an unknown contract whose source isn't published
 *   known:     a contract from CRYPY's list or one GoPlus trusts
 *   normal:    any other contract with published source
 * "Needs attention" = malicious or high. Nothing is ever called "safe".
 */
import type { ApprovalFact } from "./types";

export type ApprovalRisk = "malicious" | "high" | "check" | "known" | "normal";
export type ApprovalReason =
  "malicious" | "wallet" | "disputed" | "newContract" | "unknownContract" | "unused" | "unreadable" | "spamToken";

/** An unknown contract created this soon before the approval is a common drainer pattern. */
export const NEW_CONTRACT_DAYS = 30;

export interface RatedApproval extends ApprovalFact {
  risk: ApprovalRisk;
  attention: boolean;
  /** The wallet holds none of it: nothing at risk today, cheap to clean up. */
  unused: boolean;
  /** The token looks like spam (hidden in balances): nothing of value at risk, so it never needs attention. */
  spamToken: boolean;
  reason: ApprovalReason | null;
}

export interface ApprovalsSummary {
  total: number;
  attention: number;
  malicious: number;
  walletSpenders: number;
  unlimited: number;
  tokens: number;
  nfts: number;
  permit2: number;
  /** Sum of "at risk now" over approvals with a price. */
  atRiskUsd: number;
  /** Same, only over approvals that need attention. */
  attentionUsd: number;
}

const ORDER: Record<ApprovalRisk, number> = { malicious: 0, high: 1, check: 2, normal: 3, known: 4 };

export function rateApproval(a: ApprovalFact, spamToken = false): RatedApproval {
  const s = a.spender;
  const unused = a.balance !== null && BigInt(a.balance) === 0n;
  // GoPlus flags it, but CRYPY's own list names it as an official contract (phishing sites also route approvals
  // through official contracts): "check", with both views shown; never known-good, never hidden.
  const disputed = Boolean(s.goplus?.malicious && s.name && s.type === "contract");
  let risk: ApprovalRisk;
  if (disputed) risk = "check";
  else if (s.goplus?.malicious) risk = "malicious";
  else if (s.type === "wallet" || s.type === "delegated") risk = "high";
  else if (s.name || s.goplus?.trusted) risk = "known";
  else if (s.sourceVerified === true) risk = "normal";
  else risk = "check";
  const reason: ApprovalReason | null =
    risk === "malicious"
      ? "malicious"
      : risk === "high"
        ? "wallet"
        : disputed
          ? "disputed"
          : risk === "check"
            ? s.type === null
              ? "unreadable"
              : isNewContract(a)
                ? "newContract"
                : "unknownContract"
            : unused
              ? "unused"
              : null;
  const attention = (risk === "malicious" || risk === "high") && !spamToken;
  return { ...a, risk, attention, unused, spamToken, reason: spamToken && risk !== "malicious" ? "spamToken" : reason };
}

/** Created less than NEW_CONTRACT_DAYS before the approval (both times known). */
export function isNewContract(a: ApprovalFact): boolean {
  const created = a.spender.createdAt;
  const at = a.lastChange?.at;
  return created !== null && at != null && at >= created && at - created < NEW_CONTRACT_DAYS * 86_400;
}

/** Riskiest first, then the most value at risk. */
export function rateApprovals(list: ApprovalFact[], spamTokens: ReadonlySet<string> = new Set()): RatedApproval[] {
  return list
    .map((a) => rateApproval(a, spamTokens.has(a.token.address.toLowerCase())))
    .sort(
      (x, y) =>
        Number(x.spamToken) - Number(y.spamToken) ||
        ORDER[x.risk] - ORDER[y.risk] ||
        (y.atRiskUsd ?? -1) - (x.atRiskUsd ?? -1),
    );
}

export function summarize(list: RatedApproval[]): ApprovalsSummary {
  const sum = (xs: RatedApproval[]) => xs.reduce((t, a) => t + (a.atRiskUsd ?? 0), 0);
  return {
    total: list.length,
    attention: list.filter((a) => a.attention).length,
    malicious: list.filter((a) => a.risk === "malicious" && !a.spamToken).length,
    walletSpenders: list.filter((a) => a.risk === "high" && !a.spamToken).length,
    unlimited: list.filter((a) => a.unlimited).length,
    tokens: list.filter((a) => a.kind === "token").length,
    nfts: list.filter((a) => a.kind === "nft-all").length,
    permit2: list.filter((a) => a.kind === "permit2").length,
    atRiskUsd: sum(list),
    attentionUsd: sum(list.filter((a) => a.attention)),
  };
}

/** ERC-20 "unlimited": the usual max value, or anything at least half of it. Permit2 uses uint160. */
export function isUnlimited(raw: bigint, kind: "token" | "permit2"): boolean {
  return raw >= (kind === "permit2" ? 2n ** 159n : 2n ** 255n);
}
