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
  BASE_RPC_URLS: urlList,
  ARBITRUM_RPC_URLS: urlList,
  POLYGON_RPC_URLS: urlList,
  /** Daily budgets (zero-API-cost rule). Alchemy free plan: 30M CU a month ≈ 1M a day. */
  ALCHEMY_DAILY_CU: z.coerce.number().int().positive().default(1_000_000),
  /** Requests per day per extra provider. */
  RPC_DAILY_REQUESTS: z.coerce.number().int().positive().default(50_000),
  /** M8: PostgreSQL for accounts and the watchlist (production). Without it, PGlite keeps a local database. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must start with postgres:// or postgresql://")
    .optional(),
  /** PGlite folder (relative to the project) when DATABASE_URL isn't set; "memory" keeps nothing on disk. */
  PGLITE_DIR: z
    .string()
    .regex(/^(memory|[A-Za-z0-9._\/-]+)$/, "PGLITE_DIR must be a simple relative folder or 'memory'")
    .refine((v) => !v.includes(".."), "PGLITE_DIR must stay inside the project")
    .default(".data/pglite"),
  /** M8 Part 3: the Telegram bot's token from @BotFather. Without it, alerts are kept in the history but not sent. */
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/, "TELEGRAM_BOT_TOKEN looks malformed")
    .optional(),
  /** Tests only: a stand-in Telegram server on this machine. Production always uses Telegram's own address. */
  TELEGRAM_API_URL: z
    .url({ protocol: /^https?$/ })
    .refine(
      (v) => v.startsWith("https://api.telegram.org") || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v),
      "TELEGRAM_API_URL may only point to Telegram or to this machine (tests)",
    )
    .default("https://api.telegram.org"),
  /** The background checker and the Telegram bot run in the server process unless this is "off". */
  CRYPY_WORKER: z.enum(["on", "off"]).default("on"),
  /**
   * M9 Part 5: wallet addresses allowed to open /admin (comma-separated). Public addresses only, never keys. Empty: no
   * one can open the admin dashboard.
   */
  ADMIN_WALLETS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((part) => part.trim().toLowerCase())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(z.string().regex(/^0x[0-9a-f]{40}$/, "ADMIN_WALLETS must list 0x addresses"))),
});

const parsed = schema.safeParse({
  ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || undefined,
  // ETH_RPC_URL_FALLBACK / BSC_RPC_URL_FALLBACK (M2 names) still work and are added to the lists.
  ETH_RPC_URLS: [process.env.ETH_RPC_URLS, process.env.ETH_RPC_URL_FALLBACK].filter(Boolean).join(",") || undefined,
  BSC_RPC_URLS: [process.env.BSC_RPC_URLS, process.env.BSC_RPC_URL_FALLBACK].filter(Boolean).join(",") || undefined,
  BASE_RPC_URLS: process.env.BASE_RPC_URLS || undefined,
  ARBITRUM_RPC_URLS: process.env.ARBITRUM_RPC_URLS || undefined,
  POLYGON_RPC_URLS: process.env.POLYGON_RPC_URLS || undefined,
  ALCHEMY_DAILY_CU: process.env.ALCHEMY_DAILY_CU || undefined,
  RPC_DAILY_REQUESTS: process.env.RPC_DAILY_REQUESTS || undefined,
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  PGLITE_DIR: process.env.PGLITE_DIR || undefined,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || undefined,
  TELEGRAM_API_URL: process.env.TELEGRAM_API_URL || undefined,
  CRYPY_WORKER: process.env.CRYPY_WORKER || undefined,
  ADMIN_WALLETS: process.env.ADMIN_WALLETS || undefined,
});

if (!parsed.success) {
  // Fail loudly at startup with the variable names only, never their values.
  throw new Error(`Invalid server environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
}

export const serverEnv = parsed.data;
