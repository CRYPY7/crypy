import { type NextRequest } from "next/server";
import { z } from "zod";
import { getChain } from "@/config/chains";
import { MAX_BATCH_TOKENS } from "@/server/chains/evm/batch";
import { sameOrigin } from "@/server/auth/request";
import { scanManager } from "@/server/batch-scan/service";
import { readBodyJson } from "@/server/http/body";
import { fail, ok } from "@/server/http/response";
import { clientKey, scanStartLimiter } from "@/server/rate-limit";

/** Room for 10,000 addresses (premium later); the scan manager enforces the visitor's own limit. */
const MAX_ADDRESSES = 10_000;
const MAX_BODY_BYTES = 600_000;
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const body = z.object({
  chains: z.array(z.string().max(32)).min(1).max(10),
  addresses: z.array(address).min(1).max(MAX_ADDRESSES),
  tokens: z.record(z.string().max(32), z.array(address).max(MAX_BATCH_TOKENS)).default({}),
});

/**
 * POST /api/v1/batch-scans — start a batch scan on CRYPY's servers (BATCH_SCANNER_DESIGN.md). Answers with the scan's
 * id, or why it can't start now: already running one ("active", with its id), too many wallets, the visitor's daily
 * allowance, or the line is full ("busy"). The list is kept in memory only while the scan runs and for 1 hour after.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request).ok) return fail("FORBIDDEN");
  const owner = clientKey(request.headers);
  const limit = scanStartLimiter(owner);
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });
  const parsed = body.safeParse(await readBodyJson(request, MAX_BODY_BYTES));
  if (!parsed.success) return fail("INVALID_INPUT");
  const chains = [...new Set(parsed.data.chains)];
  for (const key of chains) {
    const chain = getChain(key);
    if (!chain || chain.family !== "evm" || chain.status !== "live" || !chain.capabilities.tokenBalances) {
      return fail("INVALID_INPUT");
    }
  }
  const addresses = [...new Map(parsed.data.addresses.map((a) => [a.toLowerCase(), a])).values()];
  const tokens = Object.fromEntries(
    chains.map((chain) => [chain, [...new Set((parsed.data.tokens[chain] ?? []).map((t) => t.toLowerCase()))]]),
  );
  const result = scanManager().create(owner, { chains, addresses, tokens });
  return ok(result, { sources: [] });
}
