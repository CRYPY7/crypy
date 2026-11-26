import "server-only";
import { readFile, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { freemem, totalmem } from "node:os";
import { connect } from "node:tls";
import { sql } from "drizzle-orm";
import { type ChainConfig, getChain, liveChains } from "@/config/chains";
import { siteUrl } from "@/config/env";
import { backupStatusSchema, judgeBackups, restoreStatusSchema } from "@/lib/health/backup";
import { allCuratedTokens } from "@/config/seo-pages";
import { alchemyProvider, budgetExhausted } from "@/server/chains/evm/providers";
import { registry } from "@/server/chains/registry";
import { getDb } from "@/server/db/client";
import { tokenChecks } from "@/server/db/schema";
import { addressOverview } from "@/server/services/overview";
import { tokenSecurityReport } from "@/server/services/lookups";
import { resolveSearch } from "@/server/services/resolve";
import { CHECK_EVERY_MS } from "@/server/services/token-checks";
import { botHealth } from "@/server/telegram/bot";
import { jobHeartbeat } from "./jobs";

/**
 * The checks themselves. Each one does a small real piece of what a visitor would do (with fixed, public test data) or
 * reads a heartbeat, and either returns normally (passed) or throws with a short reason. `Skip` means "not set up on
 * this server" (no Telegram bot, the job is turned off), which is never shown as a problem.
 */
export class Skip extends Error {}
export type Probe = () => Promise<string | void>;

/** Public test data: a well-known wallet, transactions and tokens that will always exist. */
const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const ACTIVITY_WALLET = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const TX: Record<string, string> = {
  ethereum: "0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6",
  bsc: "0x216453b86ec566ac33b191479256e144e2e9c8e9ad867288ed8c06050cbbc9e4",
};
const TOKEN: Record<string, string> = {
  ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  bsc: "0x55d398326f99059fF775485246999027B3197955",
};
/** Tool checks alternate between these two chains (each chain's own connection is checked every round). */
const TOOL_CHAINS = ["ethereum", "bsc"] as const;
let turn = 0;
const nextToolChain = () => TOOL_CHAINS[turn++ % TOOL_CHAINS.length]!;

function withAdapter(chainKey: string) {
  const chain = getChain(chainKey);
  const adapter = chain && registry.adapters.find((a) => a.family === chain.family);
  if (!chain || !adapter) throw new Error(`no adapter for ${chainKey}`);
  return { chain, adapter };
}

/** Newest block seen per chain, and when it last moved. */
const lastBlocks = new Map<string, { block: bigint; movedAt: number }>();

function chainProbe(chain: ChainConfig): Probe {
  return async () => {
    const { adapter } = withAdapter(chain.key);
    const head = await adapter.getHead(chain);
    const block = BigInt(head.blockNumber);
    if (block <= 0n) throw new Error("no block number");
    // Providers that answer but stay on the same block for 10 minutes are stuck.
    const now = Date.now();
    const seen = lastBlocks.get(chain.key);
    if (!seen || block > seen.block) lastBlocks.set(chain.key, { block, movedAt: now });
    else if (now - seen.movedAt > 10 * 60_000) throw new Error(`newest block hasn't moved for 10 minutes (${block})`);
    return `block ${block}`;
  };
}

/** A job is passing when it finished a run without an error recently (3 of its intervals). */
function jobProbe(label: string): Probe {
  return async () => {
    const beat = jobHeartbeat(label);
    if (!beat) throw new Skip("not running on this server");
    const now = Date.now();
    const window = beat.everyMs * 3 + 60_000;
    if (beat.lastOkAt && now - beat.lastOkAt <= window) return;
    if (!beat.lastRunAt && now - beat.startedAt <= window) return; // just started
    throw new Error(beat.lastError ?? "hasn't run recently");
  };
}

const port = () => Number(process.env.PORT ?? 3000);

export const probes: Record<string, Probe> = {
  async website() {
    const response = await fetch(`http://127.0.0.1:${port()}/en`, {
      headers: { "user-agent": "CRYPY-health" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = await response.text();
    if (response.status !== 200) throw new Error(`home page answered ${response.status}`);
    if (!body.includes("CRYPY")) throw new Error("home page is missing its content");
  },

  ...Object.fromEntries(liveChains.map((chain) => [`chain:${chain.key}`, chainProbe(chain)])),

  async "tool:search"() {
    const result = await resolveSearch(TOKEN.ethereum!, registry);
    if (result.status !== "address") throw new Error(`search didn't find a known token (${result.status})`);
    if (result.unavailable.length) return `slow:not answering: ${result.unavailable.join(", ")}`;
  },

  async "tool:balances"() {
    const chainKey = nextToolChain();
    const overview = await addressOverview(WALLET, [chainKey]);
    if (overview.unavailable.includes(chainKey as never) || !overview.chains.length)
      throw new Error(`balances unavailable on ${chainKey}`);
    if (!overview.pricesAvailable) throw new Error(`prices unavailable on ${chainKey}`);
    return chainKey;
  },

  async "tool:tx"() {
    const chainKey = nextToolChain();
    const { chain, adapter } = withAdapter(chainKey);
    const details = await (adapter.getTransactionDetails
      ? adapter.getTransactionDetails(chain, TX[chainKey]!)
      : adapter.lookupTransaction(chain, TX[chainKey]!));
    if (!details) throw new Error(`known transaction not found on ${chainKey}`);
    return chainKey;
  },

  async "tool:token-security"() {
    const chainKey = nextToolChain();
    const report = await tokenSecurityReport(chainKey, TOKEN[chainKey]!, "background");
    if (!report) throw new Error(`no report for a known token on ${chainKey}`);
    if (!report.checks.length) throw new Error(`empty report on ${chainKey}`);
    return chainKey;
  },

  async "tool:approvals"() {
    const chainKey = nextToolChain();
    const { chain, adapter } = withAdapter(chainKey);
    if (!adapter.getApprovals) throw new Skip("not supported");
    await adapter.getApprovals(chain, WALLET, [], "background");
    return chainKey;
  },

  async "tool:activity"() {
    const { chain, adapter } = withAdapter("ethereum");
    if (!adapter.getActivity) throw new Skip("not supported");
    const { transfers, chain: page } = await adapter.getActivity(chain, ACTIVITY_WALLET, null, []);
    const source = page.source;
    if (source !== "history") {
      // Visitors get the last few hours only: a real limitation, but not an outage.
      const alchemy = alchemyProvider(chain);
      if (!alchemy) throw new Skip("full history needs an Alchemy key on this server");
      if (budgetExhausted(alchemy))
        return "slow:full history paused until 00:00 UTC (Alchemy daily budget used); recent activity only";
      throw new Error(`full history didn't load (${source}); recent activity only`);
    }
    if (!transfers.length) throw new Error("no transfers for a wallet that has them");
  },

  async "tool:gas"() {
    const targets = liveChains.filter((c) => c.capabilities.fees);
    const settled = await Promise.allSettled(
      targets.map((chain) => {
        const { adapter } = withAdapter(chain.key);
        if (!adapter.getGas) throw new Error("not supported");
        return adapter.getGas(chain);
      }),
    );
    const failed = targets.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key);
    if (failed.length) throw new Error(`gas unavailable on ${failed.join(", ")}`);
  },

  async "tool:block-time"() {
    const chainKey = nextToolChain();
    const { chain, adapter } = withAdapter(chainKey);
    if (!adapter.blockAtTime) throw new Skip("not supported");
    const result = await adapter.blockAtTime(chain, Math.floor(Date.now() / 1000) - 3_600);
    if (!result.block) throw new Error(`no block an hour ago on ${chainKey}`);
    return chainKey;
  },

  "job:checker": jobProbe("checker"),
  "job:delivery": jobProbe("delivery"),

  async bot() {
    const bot = botHealth();
    if (!bot) throw new Skip("no Telegram bot on this server");
    if (!jobHeartbeat("delivery")) throw new Skip("alerts are off on this server");
    if (bot.conflict) throw new Error("another server reads this bot's messages");
    if (!bot.lastOkAt || Date.now() - bot.lastOkAt > 2 * 60_000) throw new Error("Telegram hasn't answered recently");
  },

  /** Saved daily checks for the token pages are fresh: due checks are older than a day, stale ones older than 2. */
  async "job:token-checks"() {
    const beat = jobHeartbeat("token-checks");
    if (!beat) throw new Skip("not running on this server");
    const db = await getDb();
    const rows = await db.select({ checkedAt: tokenChecks.checkedAt }).from(tokenChecks);
    const expected = allCuratedTokens().length;
    const now = Date.now();
    const stale = rows.filter((r) => now - r.checkedAt.getTime() > CHECK_EVERY_MS * 2).length;
    const missing = Math.max(0, expected - rows.length);
    // B-016: right after a restart the first round is still catching up; until it has run, say so instead of failing.
    if (stale + missing > expected / 2 && beat.lastRunAt === null)
      return `slow:${stale + missing} of ${expected} token checks are old or missing; the first round after a restart is still running`;
    if (stale + missing > expected / 2)
      throw new Error(`${stale + missing} of ${expected} token checks are old or missing`);
    if (stale + missing > 0) return `slow:${stale + missing} of ${expected} token checks are old or missing`;
  },

  async database() {
    const db = await getDb();
    await db.execute(sql`select 1`);
  },

  async "server:memory"() {
    const free = freemem() / totalmem();
    const detail = `${Math.round(free * 100)}% free`;
    if (free < 0.05) throw new Error(detail);
    return free < 0.15 ? `slow:${detail}` : detail;
  },

  async "server:disk"() {
    const stats = await statfs(process.cwd());
    const free = stats.bavail / stats.blocks;
    const detail = `${Math.round(free * 100)}% free`;
    if (free < 0.05) throw new Error(detail);
    return free < 0.15 ? `slow:${detail}` : detail;
  },

  /**
   * Database backups (S4): reads what crypy-backup wrote after the last nightly backup and weekly restore test.
   * Skipped where backups aren't installed (the folder doesn't exist: the PC, browser tests).
   */
  async "server:backup"() {
    const dir = process.env.CRYPY_BACKUP_STATUS_DIR || "/var/lib/crypy-backup";
    if (!(await stat(/* turbopackIgnore: true */ dir).catch(() => null))?.isDirectory())
      throw new Skip("backups not installed on this server");
    const read = async <T>(
      name: string,
      schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
    ) => {
      const text = await readFile(join(/* turbopackIgnore: true */ dir, `${name}.json`), "utf8").catch(() => null);
      if (text === null) return null;
      let parsed: { success: true; data: T } | { success: false };
      try {
        parsed = schema.safeParse(JSON.parse(text));
      } catch {
        parsed = { success: false };
      }
      if (!parsed.success) throw new Error(`${name} status file unreadable`);
      return parsed.data;
    };
    const verdict = judgeBackups(
      await read("backup", backupStatusSchema),
      await read("restore", restoreStatusSchema),
      Date.now(),
    );
    if (verdict.state === "fail") throw new Error(verdict.detail);
    return verdict.state === "slow" ? `slow:${verdict.detail}` : verdict.detail;
  },

  /** The origin certificate behind Cloudflare (Full strict needs it valid). Skipped where no HTTPS server runs. */
  async "server:certificate"() {
    if (siteUrl.protocol !== "https:" || siteUrl.hostname === "localhost") throw new Skip("no HTTPS on this server");
    const validTo = await new Promise<number>((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: 443, servername: siteUrl.hostname, rejectUnauthorized: false });
      socket.setTimeout(10_000, () => socket.destroy(new Error("timed out")));
      socket.once("secureConnect", () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(Date.parse(cert.valid_to));
      });
      socket.once("error", (error: NodeJS.ErrnoException) =>
        reject(error.code === "ECONNREFUSED" ? new Skip("no HTTPS on this server") : error),
      );
    });
    const days = Math.floor((validTo - Date.now()) / 86_400_000);
    const detail = `expires in ${days} days`;
    if (!Number.isFinite(days) || days < 3) throw new Error(detail);
    return days < 14 ? `slow:${detail}` : detail;
  },
};
