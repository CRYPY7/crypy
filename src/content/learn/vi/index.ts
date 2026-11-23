import type { LearnGuideText } from "../types";
import addressPoisoning from "./address-poisoning.json";
import checkTokenScam from "./check-token-scam.json";
import checksumAddresses from "./checksum-addresses.json";
import gasFees from "./gas-fees.json";
import honeypotToken from "./honeypot-token.json";
import liquidityLock from "./liquidity-lock.json";
import readATransaction from "./read-a-transaction.json";
import seedPhraseSafety from "./seed-phrase-safety.json";
import tokenApprovals from "./token-approvals.json";
import unlimitedApprovals from "./unlimited-approvals.json";
import weiGweiEther from "./wei-gwei-ether.json";
import whyTransactionFailed from "./why-transaction-failed.json";

/** Vietnamese guide texts, by slug. */
export const guides: Record<string, LearnGuideText> = {
  "address-poisoning": addressPoisoning as LearnGuideText,
  "check-token-scam": checkTokenScam as LearnGuideText,
  "checksum-addresses": checksumAddresses as LearnGuideText,
  "gas-fees": gasFees as LearnGuideText,
  "honeypot-token": honeypotToken as LearnGuideText,
  "liquidity-lock": liquidityLock as LearnGuideText,
  "read-a-transaction": readATransaction as LearnGuideText,
  "seed-phrase-safety": seedPhraseSafety as LearnGuideText,
  "token-approvals": tokenApprovals as LearnGuideText,
  "unlimited-approvals": unlimitedApprovals as LearnGuideText,
  "wei-gwei-ether": weiGweiEther as LearnGuideText,
  "why-transaction-failed": whyTransactionFailed as LearnGuideText,
};
