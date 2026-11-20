import "server-only";
import { liveChains } from "@/config/chains";
import { getEvmClient } from "../providers";
import { warmLockerIndexes } from "./locker-index";
import { lockers } from "./lockers";

/**
 * Builds the lock indexes (Team Finance, UNCX v3) in the background when the server starts, so the first token check
 * doesn't wait for them. Failures are ignored: each check builds what is missing on its own.
 */
export function warmTokenSecurity() {
  for (const chain of liveChains) {
    if (chain.family !== "evm" || !chain.capabilities.tokenSecurity) continue;
    try {
      warmLockerIndexes(getEvmClient(chain), lockers[chain.key]);
    } catch {
      // Ignored: built on demand instead.
    }
  }
}
