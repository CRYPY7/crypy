#!/usr/bin/env node
// CRYPY speed measurement (INFRASTRUCTURE_DESIGN.md §2 and §10, step R0). Runs a fixed set of public wallets, tokens
// and transactions through each tool's API and the address page, twice each (first, then again right away), and
// prints the times against the design's targets. Read-only: it asks questions about public data like a visitor.
//
//   pnpm perf:server                                  # on the server: the live app on its current port
//   pnpm perf:server -- --wallet 0xYourWallet          # add your own wallet(s) to the set
//   pnpm perf:server -- --base http://127.0.0.1:3001   # another address
//
// Also prints how many Alchemy compute units CRYPY counted during the run, by method (from /api/v1/health), so they
// can be compared with the Alchemy dashboard. Writes perf-report.md and perf-report.json in the current folder.
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const argValues = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const port = (() => {
  try {
    return readFileSync("/opt/crypy/app/.crypy-port", "utf8").trim();
  } catch {
    return "3000";
  }
})();
const BASE = (argValues("--base")[0] ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
// A browser's user agent: crawlers get no blockchain lookups on result pages (lib/crawler.ts).
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Public test data. Spam-heavy wallets hold thousands of airdropped tokens (measured 2026-11-26).
const TEST_WALLET = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const BINANCE = "0x28C6c06298d514Db089934071355E5743bf21d60";
const USDT_ETH = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const CAKE_BSC = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const TX_ETH = "0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6";
const own = argValues("--wallet").filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w));
/** A new random address every run: nothing stored or cached about it anywhere (the pure "first visit" cost). */
const fresh = () => `0x${randomBytes(20).toString("hex")}`;

// Targets from INFRASTRUCTURE_DESIGN.md §2 (seconds). `null` = measured, no target yet.
const T = { frame: 0.2, stored: 0.3, firstView: 2, complete: 3 };

const cases = [
  // [group, label, kind, path, targets {first, again}]
  ["Search", "test wallet", "api", `/api/v1/search/resolve?q=${TEST_WALLET}`, { first: T.firstView, again: T.stored }],
  ["Search", "new address", "api", () => `/api/v1/search/resolve?q=${fresh()}`, { first: T.firstView }],
  ["Search", "token (USDT)", "api", `/api/v1/search/resolve?q=${USDT_ETH}`, { first: T.firstView, again: T.stored }],
  ["Search", "transaction", "api", `/api/v1/search/resolve?q=${TX_ETH}`, { first: T.firstView, again: T.stored }],
  ["Address page", "test wallet", "page", `/en/address/${TEST_WALLET}`, { frame: T.frame }],
  ["Address page", "vitalik.eth", "page", `/en/address/${VITALIK}`, { frame: T.frame }],
  ["Address page", "new address", "page", () => `/en/address/${fresh()}`, { frame: T.frame }],
  [
    "Balances",
    "test wallet",
    "api",
    `/api/v1/address/${TEST_WALLET}/portfolio`,
    { first: T.firstView, again: T.stored },
  ],
  ["Balances", "vitalik.eth", "api", `/api/v1/address/${VITALIK}/portfolio`, { first: T.firstView, again: T.stored }],
  [
    "Balances",
    "exchange wallet",
    "api",
    `/api/v1/address/${BINANCE}/portfolio`,
    { first: T.firstView, again: T.stored },
  ],
  ["Balances", "new address", "api", () => `/api/v1/address/${fresh()}/portfolio`, { first: T.firstView }],
  ...own.map((w, i) => [
    "Balances",
    `your wallet ${i + 1}`,
    "api",
    `/api/v1/address/${w}/portfolio`,
    { first: T.complete, again: T.stored },
  ]),
  [
    "Approvals",
    "test wallet",
    "api",
    `/api/v1/address/${TEST_WALLET}/approvals`,
    { first: T.complete, again: T.stored },
  ],
  ["Approvals", "vitalik.eth", "api", `/api/v1/address/${VITALIK}/approvals`, { first: T.complete, again: T.stored }],
  ["Activity", "test wallet", "api", `/api/v1/address/${TEST_WALLET}/activity`, { first: T.complete, again: T.stored }],
  ["Activity", "vitalik.eth", "api", `/api/v1/address/${VITALIK}/activity`, { first: T.complete, again: T.stored }],
  ["Portfolio safety", "test wallet", "api", `/api/v1/address/${TEST_WALLET}/portfolio?part=safety`, {}],
  ["Token security", "USDT (Ethereum)", "api", `/api/v1/token/ethereum/${USDT_ETH}/security`, { again: T.stored }],
  ["Token security", "CAKE (BNB Chain)", "api", `/api/v1/token/bsc/${CAKE_BSC}/security`, { again: T.stored }],
  [
    "Transaction",
    "Ethereum transfer",
    "api",
    `/api/v1/tx/${TX_ETH}?chain=ethereum`,
    { first: T.firstView, again: T.stored },
  ],
  ["Gas", "all chains", "api", "/api/v1/gas", { first: T.firstView, again: T.stored }],
];

/** One request; for pages also the time to the first bytes (the frame) and to the end of the stream. */
async function measure(kind, path) {
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    let response;
    try {
      response = await fetch(BASE + path, {
        headers: { "user-agent": UA, accept: kind === "page" ? "text/html" : "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      return { status: 0, error: error?.name ?? "error", total: (performance.now() - started) / 1000 };
    }
    if (response.status === 429 && attempt < 3) {
      const wait = Number(response.headers.get("retry-after")) || 20;
      console.log(`  (rate limit reached: waiting ${wait} s)`);
      await response.body?.cancel();
      await sleep(wait * 1000);
      continue;
    }
    const reader = response.body.getReader();
    let first = null;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (first === null) first = (performance.now() - started) / 1000;
      if (done) break;
      if (kind === "api") chunks.push(value);
    }
    const total = (performance.now() - started) / 1000;
    const result = {
      status: response.status,
      total,
      ...(kind === "page" ? { frame: first } : {}),
    };
    if (kind === "api") {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        result.ok = body.ok;
        const d = body.data ?? {};
        result.steps = slowSteps(d);
        const overview = d.overview ?? d;
        if (Array.isArray(overview.chains)) {
          result.notes = [
            overview.completing?.length ? `still reading: ${overview.completing.join(",")}` : "",
            overview.refreshing ? `from earlier: ${Object.keys(overview.refreshing).join(",")}` : "",
            overview.saved ? `saved: ${Object.keys(overview.saved).join(",")}` : "",
            overview.unavailable?.length ? `unavailable: ${overview.unavailable.join(",")}` : "",
            overview.chains.some((c) => c.coverage && c.coverage !== "full")
              ? `cut off: ${overview.chains
                  .filter((c) => c.coverage !== "full")
                  .map((c) => c.chain)
                  .join(",")}`
              : "",
          ]
            .filter(Boolean)
            .join("; ");
        }
      } catch {
        result.ok = false;
      }
    }
    return result;
  }
}

/**
 * The answer's slowest steps, from the per-chain read times tools include (R1 part 2): balances and prices per chain
 * (`readMs: {balances, prices}`), approvals and activity per chain (`readMs`). Only steps of 0.3 s or more.
 */
function slowSteps(data) {
  const steps = [];
  for (const c of data?.overview?.chains ?? data?.chains ?? []) {
    const chain = c.chain?.chain ?? c.chain;
    const ms = c.readMs ?? c.chain?.readMs;
    if (typeof ms === "number") steps.push({ name: String(chain), dur: ms });
    else if (ms && typeof ms === "object")
      for (const [step, dur] of Object.entries(ms)) steps.push({ name: `${step}-${chain}`, dur });
  }
  return steps
    .filter((s) => Number.isFinite(s.dur) && s.dur >= 300)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 4)
    .map((s) => `${s.name} ${(s.dur / 1000).toFixed(1)} s`)
    .join(", ");
}

async function alchemyUsage() {
  try {
    const r = await fetch(`${BASE}/api/v1/health`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await r.json();
    const alchemy = body.data?.usageToday?.find((u) => u.provider === "alchemy");
    return alchemy ? { units: alchemy.units ?? 0, methods: alchemy.alchemy?.methods ?? [] } : null;
  } catch {
    return null;
  }
}

const fmt = (s) => (s === undefined || s === null ? "—" : `${s.toFixed(2)} s`);
const verdict = (value, target) => (target === undefined || value === undefined ? "" : value <= target ? "✓" : "✗");

console.log(`CRYPY speed measurement against ${BASE}\n`);
const before = await alchemyUsage();
const rows = [];
for (const [group, label, kind, pathOrFn, targets] of cases) {
  const path = typeof pathOrFn === "function" ? pathOrFn() : pathOrFn;
  const first = await measure(kind, path);
  await sleep(300);
  // "Again" asks the same address (a new random one stays new, so it is asked once only).
  const again = typeof pathOrFn === "function" ? null : await measure(kind, path);
  const row = { group, label, kind, first, again, targets };
  rows.push(row);
  const value = kind === "page" ? first.frame : first.total;
  console.log(
    `${group.padEnd(17)} ${label.padEnd(18)} first ${fmt(first.total).padStart(8)}${
      kind === "page" ? ` (frame ${fmt(first.frame)})` : ""
    } ${verdict(value, kind === "page" ? targets.frame : targets.first)}  again ${fmt(again?.total).padStart(8)} ${verdict(
      again?.total,
      targets.again,
    )}  ${first.status !== 200 ? `HTTP ${first.status}` : ""} ${first.notes ?? ""}${
      first.steps ? `\n${" ".repeat(18)}slowest steps: ${first.steps}` : ""
    }`,
  );
  await sleep(300);
}
await sleep(1_500);
const after = await alchemyUsage();

const used =
  before && after
    ? {
        units: after.units - before.units,
        methods: after.methods
          .map((m) => ({
            method: m.method,
            units: m.units - (before.methods.find((b) => b.method === m.method)?.units ?? 0),
          }))
          .filter((m) => m.units > 0),
      }
    : null;
console.log(
  used
    ? `\nAlchemy units CRYPY counted during this run: ${used.units} (${used.methods.map((m) => `${m.method} ${m.units}`).join(", ")})`
    : "\nAlchemy usage: not available (health check didn't answer, or no Alchemy key).",
);
const checked = rows.flatMap((r) => {
  const out = [];
  const firstValue = r.kind === "page" ? r.first.frame : r.first.total;
  const firstTarget = r.kind === "page" ? r.targets.frame : r.targets.first;
  if (firstTarget !== undefined) out.push(firstValue <= firstTarget);
  if (r.targets.again !== undefined && r.again) out.push(r.again.total <= r.targets.again);
  return out;
});
console.log(`Targets met: ${checked.filter(Boolean).length} of ${checked.length}`);

const lines = [
  `# CRYPY speed report`,
  "",
  `Measured ${new Date().toISOString()} against ${BASE}. Targets: INFRASTRUCTURE_DESIGN.md §2.`,
  "",
  "| Tool | Case | First | Target | Again | Target | Notes | Slowest steps (first) |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => {
    const firstValue = r.kind === "page" ? r.first.frame : r.first.total;
    const firstTarget = r.kind === "page" ? r.targets.frame : r.targets.first;
    return `| ${r.group} | ${r.label} | ${fmt(r.first.total)}${r.kind === "page" ? ` (frame ${fmt(r.first.frame)})` : ""} | ${
      firstTarget !== undefined ? `≤ ${firstTarget} s ${verdict(firstValue, firstTarget)}` : "—"
    } | ${fmt(r.again?.total)} | ${r.targets.again !== undefined && r.again ? `≤ ${r.targets.again} s ${verdict(r.again.total, r.targets.again)}` : "—"} | ${
      r.first.status !== 200 ? `HTTP ${r.first.status} ` : ""
    }${r.first.notes ?? ""} | ${r.first.steps ?? ""} |`;
  }),
  "",
  `Targets met: ${checked.filter(Boolean).length} of ${checked.length}.`,
  "",
  used
    ? `Alchemy units CRYPY counted during the run: ${used.units} (${used.methods.map((m) => `${m.method} ${m.units}`).join(", ")}).`
    : "Alchemy usage: not available.",
];
writeFileSync("perf-report.md", `${lines.join("\n")}\n`);
writeFileSync(
  "perf-report.json",
  JSON.stringify({ base: BASE, at: new Date().toISOString(), rows, alchemy: used }, null, 2),
);
console.log("\nWritten: perf-report.md, perf-report.json");
