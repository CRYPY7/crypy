import "server-only";
import { randomBytes } from "node:crypto";
import { type ChainState, type Reader, type ScanRow, scanChain } from "@/lib/batch-scan/engine";

/**
 * Batch scan jobs on the server (BATCH_SCANNER_DESIGN.md §3, §7). A scan is one job:
 *   - at most `maxRunning` jobs run at once; the rest wait in line (at most `maxQueued`), each visitor one at a time;
 *   - a visitor may scan `dailyWallets` wallets per UTC day and `maxWallets` per scan;
 *   - a job keeps running when the page is closed; its results stay 1 hour after it ends, then are deleted;
 *   - a job waiting in line that nobody has asked about for 30 minutes is dropped;
 *   - the address list lives only in this memory, is never logged and never written anywhere.
 * The manager is plain code with its outside parts passed in (readers, token check, prices), so it is unit-tested.
 */

export interface ScanLimits {
  maxRunning: number;
  maxQueued: number;
  maxWallets: number;
  dailyWallets: number;
}

export interface ScanRequest {
  chains: string[];
  addresses: string[];
  /** Token contracts per chain (the page only sends tokens it found on that chain). */
  tokens: Record<string, string[]>;
}

export interface ScanDeps {
  readersFor: (chain: string) => Reader[];
  /** Splits tokens into those that answer as tokens on the chain and those that don't. Must not throw. */
  checkTokens: (chain: string, tokens: string[]) => Promise<{ tokens: string[]; notOnChain: string[] }>;
  /** USD prices by "native" and lower-case token address; null when they couldn't be read. Must not throw. */
  pricesFor: (chain: string, tokens: string[]) => Promise<Record<string, number> | null>;
  /** Called once when a job ends (not when cancelled). */
  onFinished?: (job: { ms: number; complete: boolean; stillReading: string[] }) => void;
  now?: () => number;
  engine?: Partial<Parameters<typeof scanChain>[0]>;
}

export type JobStatus = "queued" | "running" | "paused" | "done" | "cancelled";

interface ChainEntry {
  tokens: string[];
  notOnChain: string[];
  state: ChainState;
  prices: Record<string, number> | null;
}

interface Change {
  seq: number;
  chain: string;
  block: string;
  row: ScanRow;
}

interface Job {
  id: string;
  owner: string;
  wallets: number;
  request: ScanRequest;
  status: JobStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  lastSeen: number;
  paused: boolean;
  controller: AbortController;
  chains: Map<string, ChainEntry>;
  changes: Change[];
  seq: number;
}

export type CreateResult =
  | { jobId: string; refused?: undefined }
  | { refused: "active"; jobId: string }
  | { refused: "busy" }
  | { refused: "too-many"; maxWallets: number }
  | { refused: "daily-limit"; dailyWallets: number; resetsAt: string };

export interface JobView {
  status: JobStatus;
  /** Place in line (1 = next), while queued. */
  position: number | null;
  /** Rough seconds until it starts, while queued. */
  startsIn: number | null;
  wallets: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  chains: Record<
    string,
    { tokens: string[]; notOnChain: string[]; prices: Record<string, number> | null } & ChainState
  >;
  /** Rows read or corrected since `since` (in order); the page keeps the newest per chain and address. */
  rows: { chain: string; block: string; row: ScanRow }[];
  seq: number;
}

const KEEP_MS = 60 * 60_000;
const QUEUE_ABANDON_MS = 30 * 60_000;
const DEFAULT_JOB_SECONDS = 60;

const emptyState = (total: number): ChainState => ({
  phase: "reading",
  read: 0,
  total,
  blocks: null,
  reason: null,
  crossCheck: null,
});

export class ScanManager {
  private jobs = new Map<string, Job>();
  private queue: string[] = [];
  private running = 0;
  private daily = new Map<string, { day: string; wallets: number }>();
  private durations: number[] = [];

  constructor(
    private limits: ScanLimits,
    private deps: ScanDeps,
  ) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  create(owner: string, request: ScanRequest): CreateResult {
    this.sweep();
    const wallets = new Set(request.addresses.map((a) => a.toLowerCase())).size;
    if (wallets > this.limits.maxWallets) return { refused: "too-many", maxWallets: this.limits.maxWallets };
    const active = [...this.jobs.values()].find(
      (j) => j.owner === owner && (j.status === "queued" || j.status === "running" || j.status === "paused"),
    );
    if (active) return { refused: "active", jobId: active.id };
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const used = this.daily.get(owner);
    const usedToday = used?.day === day ? used.wallets : 0;
    if (usedToday + wallets > this.limits.dailyWallets) {
      const resetsAt = new Date(`${day}T00:00:00Z`);
      resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
      return { refused: "daily-limit", dailyWallets: this.limits.dailyWallets, resetsAt: resetsAt.toISOString() };
    }
    if (this.running >= this.limits.maxRunning && this.queue.length >= this.limits.maxQueued) {
      return { refused: "busy" };
    }
    this.daily.set(owner, { day, wallets: usedToday + wallets });
    const id = randomBytes(16).toString("hex");
    const t = this.now();
    this.jobs.set(id, {
      id,
      owner,
      wallets,
      request,
      status: "queued",
      createdAt: t,
      startedAt: null,
      endedAt: null,
      lastSeen: t,
      paused: false,
      controller: new AbortController(),
      chains: new Map(
        request.chains.map((chain) => [
          chain,
          { tokens: request.tokens[chain] ?? [], notOnChain: [], state: emptyState(wallets), prices: null },
        ]),
      ),
      changes: [],
      seq: 0,
    });
    this.queue.push(id);
    this.pump();
    return { jobId: id };
  }

  view(id: string, since = 0): JobView | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    job.lastSeen = this.now();
    const position = job.status === "queued" ? this.queue.indexOf(id) + 1 : null;
    const average = this.durations.length
      ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length / 1000
      : DEFAULT_JOB_SECONDS;
    const startsIn =
      position === null ? null : Math.ceil((Math.ceil(position / this.limits.maxRunning) * average) / 5) * 5;
    const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
    return {
      status: job.status,
      position,
      startsIn,
      wallets: job.wallets,
      createdAt: new Date(job.createdAt).toISOString(),
      startedAt: iso(job.startedAt),
      endedAt: iso(job.endedAt),
      chains: Object.fromEntries(
        [...job.chains].map(([chain, entry]) => [
          chain,
          { tokens: entry.tokens, notOnChain: entry.notOnChain, prices: entry.prices, ...entry.state },
        ]),
      ),
      rows: job.changes.filter((c) => c.seq > since).map(({ chain, block, row }) => ({ chain, block, row })),
      seq: job.seq,
    };
  }

  control(id: string, action: "pause" | "resume" | "cancel"): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status === "done" || job.status === "cancelled") return false;
    job.lastSeen = this.now();
    if (action === "cancel") {
      job.controller.abort();
      if (job.status === "queued") {
        this.queue = this.queue.filter((q) => q !== id);
        this.end(job, "cancelled");
      }
      return true;
    }
    job.paused = action === "pause";
    if (job.status === "running" || job.status === "paused") job.status = job.paused ? "paused" : "running";
    return true;
  }

  /** Stats for tests and /admin. */
  stats() {
    return { running: this.running, queued: this.queue.length, jobs: this.jobs.size };
  }

  /** Drops old results and abandoned places in line. Called on every create and by a timer. */
  sweep() {
    const t = this.now();
    for (const job of this.jobs.values()) {
      if (job.endedAt !== null && t - job.endedAt > KEEP_MS) this.jobs.delete(job.id);
      else if (job.status === "queued" && t - job.lastSeen > QUEUE_ABANDON_MS) {
        this.queue = this.queue.filter((q) => q !== job.id);
        this.jobs.delete(job.id);
      }
    }
  }

  private pump() {
    while (this.running < this.limits.maxRunning && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.status !== "queued") continue;
      this.running += 1;
      void this.run(job).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private end(job: Job, status: "done" | "cancelled") {
    job.status = status;
    job.endedAt = this.now();
  }

  private async run(job: Job) {
    job.status = job.paused ? "paused" : "running";
    job.startedAt = this.now();
    const { signal } = job.controller;
    await Promise.all(
      [...job.chains].map(async ([chain, entry]) => {
        const checked = await this.deps.checkTokens(chain, entry.tokens);
        entry.tokens = checked.tokens;
        entry.notOnChain = checked.notOnChain;
        const prices = this.deps.pricesFor(chain, entry.tokens).then((p) => (entry.prices = p));
        entry.state = await scanChain({
          ...this.deps.engine,
          readers: this.deps.readersFor(chain),
          addresses: job.request.addresses,
          tokens: entry.tokens,
          signal,
          isPaused: () => job.paused,
          onRows: (rows, block) => {
            for (const row of rows) job.changes.push({ seq: ++job.seq, chain, block, row });
          },
          onState: (state) => (entry.state = state),
        });
        await prices;
      }),
    );
    if (signal.aborted) {
      this.end(job, "cancelled");
      return;
    }
    this.end(job, "done");
    const ms = job.endedAt! - job.startedAt;
    this.durations = [...this.durations.slice(-19), ms];
    const stillReading = [...job.chains].filter(([, e]) => e.state.read < e.state.total).map(([c]) => c);
    const nullCells = job.changes.some((c) => c.row.native === null || c.row.tokens.some((t) => t === null));
    this.deps.onFinished?.({ ms, complete: stillReading.length === 0 && !nullCells, stillReading });
  }
}
