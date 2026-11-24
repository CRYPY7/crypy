/**
 * Batch scan engine (S2 Part A, BATCH_SCANNER_DESIGN.md §4–5). Reads balances for many addresses on one chain through
 * a set of readers (one per node provider) and keeps going until every address is read:
 *   - each chunk goes to the healthiest reader that isn't resting;
 *   - "slow down" answers rest that reader only, for as long as it asks; the chunk goes back in line;
 *   - a timeout splits the chunk in half (down to one address) and remembers a smaller size for that reader;
 *   - other failures rest the reader with a growing pause; nothing is ever marked failed while a reader may answer;
 *   - when every reader rests, the chain waits ("waiting"), and after `stallAfterMs` without progress it says so
 *     ("stalled") but keeps trying until `giveUpAfterMs`;
 *   - cells a node couldn't read (null) are read again elsewhere, up to `maxCellRetries` times;
 *   - at the end a sample is read again by a different reader at the same block (cross-check).
 * Pure: no network or server code, so the same engine runs on the server and (Part A.2) in the browser.
 */

export type AccountType = "wallet" | "contract" | "delegated";

export interface ScanRow {
  address: string;
  /** null: the type couldn't be read (the balances can still be complete). */
  type: AccountType | null;
  /** Raw integers as strings; null when that cell couldn't be read. */
  native: string | null;
  tokens: (string | null)[];
}

export interface ChunkResult {
  block: string;
  rows: ScanRow[];
}

export type ReadErrorKind = "rate-limited" | "timeout" | "bad-answer" | "failed";

export class ReadError extends Error {
  constructor(
    readonly kind: ReadErrorKind,
    /** For "rate-limited": how long the node asked us to wait. */
    readonly retryAfterMs = 0,
  ) {
    super(kind);
  }
}

export interface Reader {
  /** Stable id (provider host); never shown with keys. */
  id: string;
  /** Read at `block` when given; a reader may answer from a newer block if the node no longer has it. */
  read(addresses: string[], tokens: string[], block: string | undefined, signal: AbortSignal): Promise<ChunkResult>;
}

export type ChainPhase = "reading" | "waiting" | "stalled" | "cross-checking" | "done" | "cancelled" | "gave-up";

export interface CrossCheck {
  compared: number;
  matched: number;
  /** Mismatches that a third reading settled (the rows were corrected). */
  corrected: number;
}

export interface ChainState {
  phase: ChainPhase;
  read: number;
  total: number;
  /** Lowest and highest block the rows were read at. */
  blocks: [string, string] | null;
  /** Short reason code while waiting or stalled ("nodes-busy", "nodes-down"). */
  reason: string | null;
  crossCheck: CrossCheck | null;
}

export interface ChainScanOptions {
  readers: Reader[];
  addresses: string[];
  tokens: string[];
  signal: AbortSignal;
  /** New or corrected rows, with the block they were read at. */
  onRows: (rows: ScanRow[], block: string) => void;
  onState?: (state: ChainState) => void;
  /** While true, no new chunk is started (pause). */
  isPaused?: () => boolean;
  chunkSize?: number;
  concurrency?: number;
  requestTimeoutMs?: number;
  stallAfterMs?: number;
  giveUpAfterMs?: number;
  maxCellRetries?: number;
  crossCheck?: { fraction: number; min: number } | false;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export const DEFAULTS = {
  chunkSize: 100,
  concurrency: 3,
  requestTimeoutMs: 10_000,
  stallAfterMs: 10 * 60_000,
  giveUpAfterMs: 60 * 60_000,
  maxCellRetries: 3,
  crossCheck: { fraction: 0.02, min: 5 },
};

const MAX_REST_MS = 120_000;
const WAIT_CAP_MS = 60_000;

interface Health {
  reader: Reader;
  restUntil: number;
  failures: number;
  successes: number;
  /** Largest chunk this reader answered in time lately. */
  chunk: number;
  busy: boolean;
}

interface Chunk {
  addresses: string[];
  /** Readers that already answered this chunk badly (tried last). */
  avoid: Set<string>;
}

export function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, outer: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  outer.addEventListener("abort", stop);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ReadError("timeout"));
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => {
    clearTimeout(timer);
    outer.removeEventListener("abort", stop);
  });
}

function asReadError(error: unknown): ReadError {
  return error instanceof ReadError ? error : new ReadError("failed");
}

/** A reader's answer must hold exactly the asked addresses, in any order. */
function checkAnswer(asked: string[], result: ChunkResult): Map<string, ScanRow> {
  if (!result || typeof result.block !== "string" || !/^\d+$/.test(result.block) || !Array.isArray(result.rows)) {
    throw new ReadError("bad-answer");
  }
  const byAddress = new Map(result.rows.map((row) => [row.address.toLowerCase(), row]));
  if (byAddress.size !== asked.length || asked.some((a) => !byAddress.has(a.toLowerCase()))) {
    throw new ReadError("bad-answer");
  }
  return byAddress;
}

function complete(row: ScanRow): boolean {
  return row.native !== null && row.tokens.every((t) => t !== null);
}

function sameBalances(a: ScanRow, b: ScanRow): boolean {
  return a.native === b.native && a.tokens.length === b.tokens.length && a.tokens.every((t, i) => t === b.tokens[i]);
}

/** Every k-th address, so the sample spreads over the whole list (no randomness: repeatable in tests). */
export function crossCheckSample(addresses: string[], fraction: number, min: number): string[] {
  const want = Math.min(addresses.length, Math.max(min, Math.ceil(addresses.length * fraction)));
  if (want === 0) return [];
  const step = addresses.length / want;
  return Array.from({ length: want }, (_, i) => addresses[Math.floor(i * step)]!);
}

/** Scans one chain. Resolves when every address is read, the scan is cancelled, or it gives up. */
export async function scanChain(options: ChainScanOptions): Promise<ChainState> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const chunkSize = options.chunkSize ?? DEFAULTS.chunkSize;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
  const stallAfter = options.stallAfterMs ?? DEFAULTS.stallAfterMs;
  const giveUpAfter = options.giveUpAfterMs ?? DEFAULTS.giveUpAfterMs;
  const maxCellRetries = options.maxCellRetries ?? DEFAULTS.maxCellRetries;
  const crossCheckRule = options.crossCheck === undefined ? DEFAULTS.crossCheck : options.crossCheck;
  const { signal } = options;

  const unique = [...new Map(options.addresses.map((a) => [a.toLowerCase(), a])).values()];
  const health: Health[] = options.readers.map((reader) => ({
    reader,
    restUntil: 0,
    failures: 0,
    successes: 0,
    chunk: chunkSize,
    busy: false,
  }));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULTS.concurrency, health.length));

  const queue: Chunk[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    queue.push({ addresses: unique.slice(i, i + chunkSize), avoid: new Set() });
  }
  const rows = new Map<string, { row: ScanRow; block: string; reader: string }>();
  const cellRetries = new Map<string, number>();
  let pinned: string | undefined;
  let lowest: bigint | null = null;
  let highest: bigint | null = null;
  let lastProgress = now();
  const started = now();
  let inFlight = 0;

  const state: ChainState = {
    phase: "reading",
    read: 0,
    total: unique.length,
    blocks: null,
    reason: null,
    crossCheck: null,
  };
  const emit = () => options.onState?.({ ...state, blocks: state.blocks ? [...state.blocks] : null });

  function noteBlock(block: string) {
    const b = BigInt(block);
    if (lowest === null || b < lowest) lowest = b;
    if (highest === null || b > highest) highest = b;
    state.blocks = [String(lowest), String(highest)];
  }

  function pickReader(avoid: Set<string>): Health | null {
    const t = now();
    const free = health.filter((h) => !h.busy && h.restUntil <= t);
    if (free.length === 0) return null;
    const score = (h: Health) => (avoid.has(h.reader.id) ? 1_000 : 0) + h.failures * 2 - h.successes * 0.1;
    return free.reduce((best, h) => (score(h) < score(best) ? h : best));
  }

  function rest(h: Health, error: ReadError) {
    const t = now();
    if (error.kind === "rate-limited") {
      h.restUntil = t + Math.min(MAX_REST_MS, Math.max(1_000, error.retryAfterMs || 5_000));
      return;
    }
    h.failures += 1;
    h.restUntil = t + Math.min(30_000, 1_000 * 2 ** Math.min(h.failures - 1, 5));
  }

  async function readChunk(h: Health, chunk: Chunk) {
    h.busy = true;
    inFlight += 1;
    // Take only as much as this reader handled in time lately; the rest goes back first in line.
    const take = chunk.addresses.slice(0, h.chunk);
    const restOfChunk = chunk.addresses.slice(h.chunk);
    if (restOfChunk.length) queue.unshift({ addresses: restOfChunk, avoid: new Set(chunk.avoid) });
    try {
      const result = await withTimeout((s) => h.reader.read(take, options.tokens, pinned, s), timeoutMs, signal);
      const byAddress = checkAnswer(take, result);
      h.successes += 1;
      h.failures = Math.max(0, h.failures - 1);
      pinned ??= result.block;
      const done: ScanRow[] = [];
      const again: string[] = [];
      for (const address of take) {
        const row = byAddress.get(address.toLowerCase())!;
        const tries = cellRetries.get(address.toLowerCase()) ?? 0;
        if (!complete(row) && tries < maxCellRetries) {
          cellRetries.set(address.toLowerCase(), tries + 1);
          again.push(address);
          continue;
        }
        done.push({ ...row, address });
      }
      if (again.length) queue.push({ addresses: again, avoid: new Set([...chunk.avoid, h.reader.id]) });
      if (done.length) {
        for (const row of done) {
          if (!rows.has(row.address.toLowerCase())) state.read += 1;
          rows.set(row.address.toLowerCase(), { row, block: result.block, reader: h.reader.id });
        }
        noteBlock(result.block);
        lastProgress = now();
        options.onRows(done, result.block);
      }
    } catch (error) {
      if (signal.aborted) {
        queue.unshift({ addresses: take, avoid: chunk.avoid });
        return;
      }
      const e = asReadError(error);
      rest(h, e);
      if (e.kind === "timeout" && take.length > 1) {
        h.chunk = Math.max(1, Math.floor(take.length / 2));
        const half = Math.ceil(take.length / 2);
        queue.unshift(
          { addresses: take.slice(0, half), avoid: new Set(chunk.avoid) },
          { addresses: take.slice(half), avoid: new Set(chunk.avoid) },
        );
      } else {
        const avoid = new Set(chunk.avoid);
        if (e.kind !== "rate-limited") avoid.add(h.reader.id);
        queue.unshift({ addresses: take, avoid });
      }
    } finally {
      h.busy = false;
      inFlight -= 1;
    }
  }

  // The pool: up to `concurrency` chunks in flight, each on its own reader.
  const running = new Set<Promise<void>>();
  emit();
  while (!signal.aborted) {
    if (queue.length === 0 && inFlight === 0) break;
    if (now() - started > giveUpAfter) {
      state.phase = "gave-up";
      break;
    }
    const paused = options.isPaused?.() ?? false;
    const h = !paused && queue.length > 0 && inFlight < concurrency ? pickReader(queue[0]!.avoid) : null;
    if (h) {
      const chunk = queue.shift()!;
      if (state.phase !== "reading") {
        state.phase = "reading";
        state.reason = null;
        emit();
      }
      const job = readChunk(h, chunk).finally(() => {
        running.delete(job);
        emit();
      });
      running.add(job);
      continue;
    }
    // Nothing can start now: wait for a chunk to finish or a reader to wake up.
    if (!paused && queue.length > 0 && inFlight === 0) {
      const t = now();
      const stalled = t - lastProgress > stallAfter;
      const phase: ChainPhase = stalled ? "stalled" : "waiting";
      const reason = health.every((x) => x.failures > 0) ? "nodes-down" : "nodes-busy";
      if (state.phase !== phase || state.reason !== reason) {
        state.phase = phase;
        state.reason = reason;
        emit();
      }
      const wake = Math.min(...health.map((x) => x.restUntil)) - t;
      await sleep(Math.min(WAIT_CAP_MS, Math.max(250, wake)), signal);
      continue;
    }
    if (running.size > 0) await Promise.race([...running, sleep(1_000, signal)]);
    else await sleep(250, signal);
  }
  await Promise.allSettled([...running]);

  if (signal.aborted) {
    state.phase = "cancelled";
    emit();
    return { ...state };
  }
  if (state.phase === "gave-up") {
    emit();
    return { ...state };
  }

  // Cross-check: a sample read again by a different reader at the same block.
  if (crossCheckRule && health.length > 1 && rows.size > 0) {
    state.phase = "cross-checking";
    emit();
    state.crossCheck = await crossCheck(crossCheckRule);
  }
  state.phase = "done";
  state.reason = null;
  emit();
  return { ...state };

  async function crossCheck(rule: { fraction: number; min: number }): Promise<CrossCheck> {
    const result: CrossCheck = { compared: 0, matched: 0, corrected: 0 };
    const byBlock = new Map<string, string[]>();
    for (const [key, entry] of rows) byBlock.set(entry.block, [...(byBlock.get(entry.block) ?? []), key]);
    // The block holding the most rows.
    const [block, keys] = [...byBlock.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    const sample = crossCheckSample(keys, rule.fraction, rule.min).filter((k) => complete(rows.get(k)!.row));
    // Each sampled row is read again by a reader that didn't read it (resting readers are left alone).
    const awake = () => health.filter((h) => h.restUntil <= now());
    const checkerOf = (exclude: Set<string>) => awake().find((h) => !exclude.has(h.reader.id)) ?? null;
    const second = new Map<string, { row: ScanRow; reader: string }>();
    for (const [checker, group] of groupBy(sample, (k) => checkerOf(new Set([rows.get(k)!.reader])))) {
      const answer = await readAt(checker, group, block);
      for (const [k, row] of answer ?? []) second.set(k, { row, reader: checker.reader.id });
    }
    const mismatched: string[] = [];
    for (const key of sample) {
      const theirs = second.get(key);
      if (!theirs || !complete(theirs.row)) continue;
      result.compared += 1;
      if (sameBalances(rows.get(key)!.row, theirs.row)) result.matched += 1;
      else mismatched.push(key);
    }
    if (mismatched.length === 0) return result;
    // A third reader settles each disagreement: the value two readers agree on wins.
    const fixed: ScanRow[] = [];
    const third = groupBy(mismatched, (k) => checkerOf(new Set([rows.get(k)!.reader, second.get(k)!.reader])));
    for (const [checker, group] of third) {
      const settled = await readAt(checker, group, block);
      for (const key of group) {
        const mine = rows.get(key)!;
        const theirs = second.get(key)!.row;
        const tie = settled?.get(key);
        if (tie && sameBalances(tie, theirs) && !sameBalances(tie, mine.row)) {
          const row = { ...theirs, address: mine.row.address, type: theirs.type ?? mine.row.type };
          rows.set(key, { row, block, reader: second.get(key)!.reader });
          fixed.push(row);
          result.corrected += 1;
        }
      }
    }
    if (fixed.length) options.onRows(fixed, block);
    return result;
  }

  function groupBy(keys: string[], pick: (key: string) => Health | null): Map<Health, string[]> {
    const groups = new Map<Health, string[]>();
    for (const key of keys) {
      const h = pick(key);
      if (h) groups.set(h, [...(groups.get(h) ?? []), key]);
    }
    return groups;
  }

  async function readAt(h: Health, keys: string[], block: string): Promise<Map<string, ScanRow> | null> {
    try {
      const addresses = keys.map((k) => rows.get(k)!.row.address);
      const answer = await withTimeout((s) => h.reader.read(addresses, options.tokens, block, s), timeoutMs, signal);
      // A node that no longer has the block answers from a newer one: not comparable.
      if (answer.block !== block) return null;
      const map = checkAnswer(addresses, answer);
      return new Map([...map].map(([k, v]) => [k.toLowerCase(), v]));
    } catch {
      return null;
    }
  }
}
