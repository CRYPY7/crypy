import "server-only";
import { z } from "zod";

/**
 * Server-only settings. Never import this file from a client component.
 * Every key is optional: without any provider keys CRYPY uses free public RPC endpoints.
 */
const urlList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [],
  )
  .pipe(z.array(z.url({ protocol: /^https$/ })));

const schema = z.object({
  ALCHEMY_API_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,64}$/, "ALCHEMY_API_KEY looks malformed")
    .optional(),
  /** Extra free providers, comma-separated https URLs (dRPC, Ankr, Chainstack, Infura…). */
  ETH_RPC_URLS: urlList,
  BSC_RPC_URLS: urlList,
  /** Daily budgets (zero-API-cost rule). Alchemy free plan: 30M CU a month ≈ 1M a day. */
  ALCHEMY_DAILY_CU: z.coerce.number().int().positive().default(1_000_000),
  /** Requests per day per extra provider. */
  RPC_DAILY_REQUESTS: z.coerce.number().int().positive().default(50_000),
});

const parsed = schema.safeParse({
  ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || undefined,
  // ETH_RPC_URL_FALLBACK / BSC_RPC_URL_FALLBACK (M2 names) still work and are added to the lists.
  ETH_RPC_URLS: [process.env.ETH_RPC_URLS, process.env.ETH_RPC_URL_FALLBACK].filter(Boolean).join(",") || undefined,
  BSC_RPC_URLS: [process.env.BSC_RPC_URLS, process.env.BSC_RPC_URL_FALLBACK].filter(Boolean).join(",") || undefined,
  ALCHEMY_DAILY_CU: process.env.ALCHEMY_DAILY_CU || undefined,
  RPC_DAILY_REQUESTS: process.env.RPC_DAILY_REQUESTS || undefined,
});

if (!parsed.success) {
  // Fail loudly at startup with the variable names only, never their values.
  throw new Error(`Invalid server environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
}

export const serverEnv = parsed.data;
