#!/usr/bin/env node
// CRYPY feature audit (stabilization S1). Runs every tool's API through normal and unusual inputs on all 5 chains and
// checks what comes back: does it answer, is the answer complete or labelled partial, is it consistent (fee = gas used
// × price, gas speeds in order, balances equal to a direct read from a public node at the same block), and how long
// it took. Read-only: it only asks questions about public data, like a visitor.
//
//   node scripts/audit/run.mjs                      # against http://127.0.0.1:3000 (on the server: the live app)
//   node scripts/audit/run.mjs https://crypy.org    # through Cloudflare (slower: paced for the /api/ rate limit)
//
// Writes audit-report.md and audit-report.json in the current folder. Exit code 0 even when findings exist.
import { writeFileSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const remote = !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(BASE);
const PACE_MS = remote ? 1_200 : 150;

const PUBLIC_RPC = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
};
const CHAINS = Object.keys(PUBLIC_RPC);

// Public test data (well-known contracts and wallets).
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const TEST_WALLET = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const UNUSED = "0x7a1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4"; // made up: no activity expected
const TOKENS = {
  ethereum: [
    ["USDT", "0xdAC17F958D2ee523a2206206994597C13D831ec7"],
    ["PEPE", "0x6982508145454Ce325dDbE47a25d4ec3d2311933"],
  ],
  bsc: [
    ["USDT", "0x55d398326f99059fF775485246999027B3197955"],
    ["CAKE", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"],
  ],
  base: [["DEGEN", "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"]],
  arbitrum: [["ARB", "0x912CE59144191C1204E64559FE8253a0e49E6548"]],
  polygon: [["QUICK", "0xB5C064F955D8e7F38fE0460C556a72987494eE17"]],
};
const NOT_A_TOKEN = { ethereum: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" }; // Uniswap router
const KNOWN_TX = {
  ethereum: "0xfe8a4c5234501ec188cc70010dd39c161efb36e4441c6155a210df3874c011c6",
  bsc: "0x216453b86ec566ac33b191479256e144e2e9c8e9ad867288ed8c06050cbbc9e4",
};
const UNKNOWN_TX = "0x" + "ab".repeat(32);

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Asks like a visitor; when CRYPY says "too many requests", waits as long as it asks (up to 3 times). */
async function api(path, init) {
  for (let attempt = 0; ; attempt++) {
    const r = await apiOnce(path, init);
    if (r.status !== 429 || attempt >= 3) return r;
    const wait = Number(r.retryAfter) > 0 ? Number(r.retryAfter) * 1000 : 20_000;
    console.log(`(rate limit reached: waiting ${Math.round(wait / 1000)} s)`);
    await sleep(wait);
  }
}

async function apiOnce(path, init) {
  await sleep(PACE_MS);
  const started = Date.now();
  try {
    const response = await fetch(BASE + path, {
      ...init,
      headers: { "content-type": "application/json", origin: BASE, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
    const ms = Date.now() - started;
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, ms, body, retryAfter: response.headers.get("retry-after") };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, body: null, error: String(error?.message ?? error) };
  }
}

async function rpc(chain, method, params) {
  const response = await fetch(PUBLIC_RPC[chain], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/** One audited case. `verdict`: ok | partial | finding | error. */
function note(feature, chain, input, r, verdict, detail = "") {
  const item = { feature, chain, input, status: r?.status ?? null, ms: r?.ms ?? null, verdict, detail };
  results.push(item);
  const mark = { ok: "ok     ", partial: "partial", finding: "FINDING", error: "ERROR  " }[verdict];
  console.log(
    `${mark} ${feature.padEnd(16)} ${String(chain).padEnd(9)} ${String(r?.ms ?? "").padStart(6)} ms  ${input}${detail ? "  — " + detail : ""}`,
  );
}

const slowNote = (r, limit = 3_000) => (r.ms > limit ? `slow: ${(r.ms / 1000).toFixed(1)} s` : "");
const okBody = (r) => r.status === 200 && r.body?.ok === true;

// ---- Search ---------------------------------------------------------------------------------------------------------
async function auditSearch() {
  const cases = [
    ["wallet on several chains", VITALIK, (d) => d.status === "address" && (d.choices?.length ?? 0) >= 2],
    [
      "token (USDT Ethereum)",
      TOKENS.ethereum[0][1],
      (d) => d.status === "address" && /token\/ethereum/i.test(d.target ?? JSON.stringify(d.choices)),
    ],
    [
      "token (CAKE BNB Chain)",
      TOKENS.bsc[1][1],
      (d) => d.status === "address" && /token\/bsc/i.test(d.target ?? JSON.stringify(d.choices)),
    ],
    [
      "transaction (Ethereum)",
      KNOWN_TX.ethereum,
      (d) => d.status === "tx" && (d.target ?? "").includes("chain=ethereum"),
    ],
    ["transaction (BNB Chain)", KNOWN_TX.bsc, (d) => d.status === "tx" && (d.target ?? "").includes("chain=bsc")],
    ["unknown hash", UNKNOWN_TX, (d) => d.status === "not-found"],
    // One letter's case flipped: the checksum no longer matches.
    ["wrong checksum", "0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045", (d) => d.status === "bad-checksum"],
    ["lower-case address", VITALIK.toLowerCase(), (d) => d.status === "address"],
    ["spaces around", `  ${VITALIK}  `, (d) => d.status === "address"],
    ["text", "hello world", (d) => d.status === "invalid"],
    ["unused address", UNUSED, (d) => d.status === "address" && (d.choices?.length ?? 0) === 0],
  ];
  for (const [label, q, expect] of cases) {
    const r = await api(`/api/v1/search/resolve?q=${encodeURIComponent(q)}`);
    if (!okBody(r))
      note(
        "search",
        "all",
        label,
        r,
        r.status === 400 && label === "text" ? "ok" : "error",
        `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`,
      );
    else {
      const d = r.body.data;
      const unavailable = d.unavailable?.length ? `chains unavailable: ${d.unavailable.join(", ")}` : "";
      if (!expect(d))
        note(
          "search",
          "all",
          label,
          r,
          "finding",
          `unexpected answer: ${JSON.stringify({ status: d.status, target: d.target, choices: d.choices?.length })}`,
        );
      else
        note(
          "search",
          "all",
          label,
          r,
          unavailable ? "partial" : "ok",
          [unavailable, slowNote(r)].filter(Boolean).join("; "),
        );
    }
  }
}

// ---- Balances and portfolio (address overview + approvals summary + flags) ------------------------------------------
async function auditPortfolio() {
  for (const [label, address] of [
    ["well-known wallet", VITALIK],
    ["test wallet", TEST_WALLET],
    ["unused address", UNUSED],
  ]) {
    const r = await api(`/api/v1/address/${address}/portfolio`);
    if (!okBody(r)) {
      note("balances", "all", label, r, "error", `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`);
      continue;
    }
    const { overview, approvals, flagged } = r.body.data;
    const problems = [];
    if (overview.unavailable?.length) problems.push(`chains unavailable: ${overview.unavailable.join(", ")}`);
    for (const c of overview.chains ?? [])
      if (c.coverage !== "full") problems.push(`${c.chain} token list ${c.coverage}`);
    if (!overview.pricesAvailable) problems.push("prices unavailable");
    if (approvals === null) problems.push("approvals not checked");
    else if (approvals.partial) problems.push("approvals partial");
    if (flagged === null) problems.push("token flags not checked");
    const sum = (overview.chains ?? []).reduce((s, c) => s + (c.totalUsd ?? 0), 0);
    const consistent = Math.abs(sum - overview.totalUsd) <= Math.max(0.01, overview.totalUsd * 1e-9);
    if (!consistent) note("balances", "all", label, r, "finding", `total ${overview.totalUsd} ≠ sum of chains ${sum}`);
    else if (label === "unused address" && overview.totalUsd > 0)
      note("balances", "all", label, r, "finding", `unused address shows $${overview.totalUsd}`);
    else
      note(
        "balances",
        "all",
        label,
        r,
        problems.length ? "partial" : "ok",
        [...problems, slowNote(r)].filter(Boolean).join("; "),
      );
  }
}

// ---- Approvals ------------------------------------------------------------------------------------------------------
async function auditApprovals() {
  for (const [label, address] of [
    ["well-known wallet", VITALIK],
    ["test wallet", TEST_WALLET],
    ["unused address", UNUSED],
  ]) {
    const r = await api(`/api/v1/address/${address}/approvals`);
    if (!okBody(r)) {
      note("approvals", "all", label, r, "error", `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`);
      continue;
    }
    const d = r.body.data;
    const problems = [];
    if (d.unavailable?.length) problems.push(`chains unavailable: ${d.unavailable.join(", ")}`);
    for (const c of d.chains ?? []) {
      if (c.sources?.goplus !== "ok") problems.push(`${c.chain} GoPlus ${c.sources?.goplus}`);
      // Searched per held token: with none held on a chain there is nothing to search.
      if (c.sources && c.sources.knownSpenders && !c.sources.recentLogs)
        problems.push(`${c.chain} recent events not searched`);
    }
    const bad = (d.chains ?? [])
      .flatMap((c) => c.approvals ?? [])
      .filter((a) => a.allowance !== undefined && !/^\d+$/.test(String(a.allowance)));
    if (bad.length)
      note("approvals", "all", label, r, "finding", `${bad.length} approvals with a non-numeric allowance`);
    else if (label === "unused address" && (d.chains ?? []).some((c) => c.approvals?.length))
      note("approvals", "all", label, r, "finding", "unused address shows approvals");
    else
      note(
        "approvals",
        "all",
        label,
        r,
        problems.length ? "partial" : "ok",
        [...problems, `${(d.chains ?? []).reduce((n, c) => n + (c.approvals?.length ?? 0), 0)} approvals`, slowNote(r)]
          .filter(Boolean)
          .join("; "),
      );
  }
}

// ---- Activity -------------------------------------------------------------------------------------------------------
async function auditActivity() {
  for (const [label, address] of [
    ["test wallet", TEST_WALLET],
    ["unused address", UNUSED],
  ]) {
    const r = await api(`/api/v1/address/${address}/activity`);
    if (!okBody(r)) {
      note("activity", "all", label, r, "error", `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`);
      continue;
    }
    const d = r.body.data;
    const limited = (d.chains ?? []).filter((c) => c.source !== "history").map((c) => `${c.chain} ${c.source}`);
    const foreign = (d.transfers ?? []).filter(
      (t) => ![t.from, t.to].some((x) => x?.toLowerCase() === address.toLowerCase()),
    );
    const ordered = (d.transfers ?? []).every((t, i, all) => i === 0 || (all[i - 1].block ?? 0) >= (t.block ?? 0));
    if (foreign.length)
      note("activity", "all", label, r, "finding", `${foreign.length} transfers don't involve the wallet`);
    else if (!ordered) note("activity", "all", label, r, "finding", "transfers not newest first");
    else
      note(
        "activity",
        "all",
        label,
        r,
        limited.length ? "partial" : "ok",
        [limited.length ? `limited: ${limited.join(", ")}` : "", `${d.transfers?.length ?? 0} transfers`, slowNote(r)]
          .filter(Boolean)
          .join("; "),
      );
    // Second page, if any chain has more.
    const next = (d.chains ?? [])
      .filter((c) => c.next !== null)
      .map((c) => `${c.chain}:${c.next}`)
      .join(",");
    if (next) {
      const r2 = await api(`/api/v1/address/${address}/activity?cursor=${encodeURIComponent(next)}`);
      const firstIds = new Set((d.transfers ?? []).map((t) => `${t.chain}:${t.id}`));
      const repeats = okBody(r2)
        ? (r2.body.data.transfers ?? []).filter((t) => firstIds.has(`${t.chain}:${t.id}`)).length
        : 0;
      note(
        "activity",
        "all",
        `${label}, page 2`,
        r2,
        !okBody(r2) ? "error" : repeats ? "finding" : "ok",
        repeats ? `${repeats} transfers repeated from page 1` : slowNote(r2),
      );
    }
  }
}

// ---- Token security -------------------------------------------------------------------------------------------------
async function auditTokens() {
  for (const chain of CHAINS)
    for (const [symbol, address] of TOKENS[chain]) {
      const r = await api(`/api/v1/token/${chain}/${address}/security`);
      if (!okBody(r)) {
        note("token-security", chain, symbol, r, "error", `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`);
        continue;
      }
      const d = r.body.data;
      const problems = [];
      if (d.facts?.externalStatus === "unavailable") problems.push("GoPlus unavailable");
      if (!d.checks?.length) problems.push("no checks");
      if (d.level === "safe") problems.push('"safe" verdict');
      const unchecked = d.counts?.unchecked ?? 0;
      const trade = d.facts?.trade?.outcome;
      const verdict = d.level === "safe" || !d.checks?.length ? "finding" : problems.length ? "partial" : "ok";
      note(
        "token-security",
        chain,
        symbol,
        r,
        verdict,
        [...problems, `level ${d.level}`, `trade ${trade ?? "—"}`, `${unchecked} not checked`, slowNote(r, 8_000)]
          .filter(Boolean)
          .join("; "),
      );
    }
  for (const [chain, address] of Object.entries(NOT_A_TOKEN)) {
    const r = await api(`/api/v1/token/${chain}/${address}/security`);
    note(
      "token-security",
      chain,
      "a contract that isn't a token",
      r,
      r.status === 404 || r.body?.ok === false || r.body?.data === null ? "ok" : "finding",
      r.body?.ok ? "answered as if it were a token" : `HTTP ${r.status}`,
    );
  }
  const r = await api(`/api/v1/token/ethereum/${VITALIK}/security`);
  note(
    "token-security",
    "ethereum",
    "a wallet as token",
    r,
    r.status === 404 || r.body?.ok === false || r.body?.data === null ? "ok" : "finding",
    r.body?.ok ? "answered as if it were a token" : `HTTP ${r.status}`,
  );
}

// ---- Transactions ---------------------------------------------------------------------------------------------------
async function recentTx(chain) {
  const block = await rpc(chain, "eth_getBlockByNumber", ["latest", false]);
  return block.transactions?.[0] ?? null;
}

function checkFee(tx) {
  if (!tx || tx.gasUsed === null || tx.gasPrice === null || tx.fee === null) return "";
  const expected = BigInt(tx.gasUsed) * BigInt(tx.gasPrice) + BigInt(tx.l1Fee ?? 0);
  return expected === BigInt(tx.fee)
    ? ""
    : `fee ${tx.fee} ≠ gas used × price${tx.l1Fee ? " + L1 fee" : ""} (${expected})`;
}

async function auditTransactions() {
  const cases = [];
  for (const chain of CHAINS) {
    if (KNOWN_TX[chain]) cases.push([chain, "older transaction", KNOWN_TX[chain]]);
    try {
      const hash = await recentTx(chain);
      if (hash) cases.push([chain, "transaction from the newest block", hash]);
    } catch (error) {
      console.log(`(skipped recent transaction on ${chain}: public node didn't answer: ${error.message})`);
    }
  }
  for (const [chain, label, hash] of cases) {
    const r = await api(`/api/v1/tx/${hash}?chain=${chain}`);
    if (!okBody(r)) {
      note(
        "transaction",
        chain,
        label,
        r,
        r.status === 404 ? "finding" : "error",
        `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`,
      );
      continue;
    }
    const tx = r.body.data.details ?? r.body.data;
    let fee = "";
    try {
      fee = checkFee(tx);
    } catch (error) {
      fee = `fee check failed: ${error.message}`;
    }
    note(
      "transaction",
      chain,
      label,
      r,
      fee ? "finding" : "ok",
      [fee, `status ${tx.status}`, slowNote(r)].filter(Boolean).join("; "),
    );
  }
  const r = await api(`/api/v1/tx/${UNKNOWN_TX}?chain=ethereum`);
  note("transaction", "ethereum", "unknown hash", r, r.status === 404 ? "ok" : "finding", `HTTP ${r.status}`);
}

// ---- Gas and blocks -------------------------------------------------------------------------------------------------
async function auditGas() {
  const r = await api(`/api/v1/gas`);
  if (!okBody(r)) return note("gas", "all", "gas now", r, "error", `HTTP ${r.status}`);
  const d = r.body.data;
  for (const chain of CHAINS) {
    const g = d.chains.find((c) => c.chain === chain);
    if (!g) {
      note("gas", chain, "gas now", r, "partial", "chain unavailable");
      continue;
    }
    const s = g.speeds;
    const ordered = s.low <= s.average && s.average <= s.high && s.low >= 0;
    const fresh = Date.now() - g.checkedAt < 5 * 60_000;
    note(
      "gas",
      chain,
      "gas now",
      r,
      ordered && fresh ? "ok" : "finding",
      [
        !ordered ? `speeds out of order ${s.low}/${s.average}/${s.high}` : "",
        !fresh ? "older than 5 minutes" : "",
        g.coinUsd === null ? "no coin price" : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
}

async function auditBlocks() {
  const t = Math.floor(Date.now() / 1000) - 86_400;
  const r = await api(`/api/v1/blocks?time=${t}`);
  if (!okBody(r)) return note("timestamp-block", "all", "block for yesterday", r, "error", `HTTP ${r.status}`);
  for (const chain of CHAINS) {
    const b = r.body.data.results.find((x) => x.chain === chain);
    if (!b) note("timestamp-block", chain, "block for yesterday", r, "partial", "chain unavailable");
    else {
      const time = b.time ?? b.timestamp;
      const off = typeof time === "number" ? time - t : null;
      note(
        "timestamp-block",
        chain,
        "block for yesterday",
        r,
        off !== null && off >= 0 && off < 600 ? "ok" : "finding",
        off === null
          ? `answer: ${JSON.stringify(b).slice(0, 120)}`
          : `block ${b.block ?? b.number} is ${off} s after the time`,
      );
    }
  }
}

// ---- Batch balances against a direct read ---------------------------------------------------------------------------
async function auditBatch() {
  for (const chain of CHAINS) {
    const addresses = [VITALIK, TEST_WALLET, UNUSED];
    const r = await api(`/api/v1/batch-balances`, {
      method: "POST",
      body: JSON.stringify({ chain, addresses, tokens: [TOKENS[chain][0][1]], prices: true }),
    });
    if (!okBody(r)) {
      note(
        "batch-balance",
        chain,
        "3 addresses, 1 token",
        r,
        "error",
        `HTTP ${r.status} ${r.body?.error?.code ?? r.error ?? ""}`,
      );
      continue;
    }
    const d = r.body.data;
    const mismatches = [];
    for (const row of d.rows) {
      if (row.native === null) {
        mismatches.push(`${row.address.slice(0, 6)}… read failed`);
        continue;
      }
      try {
        const direct = BigInt(await rpc(chain, "eth_getBalance", [row.address, "0x" + BigInt(d.block).toString(16)]));
        if (direct !== BigInt(row.native))
          mismatches.push(`${row.address.slice(0, 6)}… ${row.native} ≠ node ${direct}`);
      } catch {
        // The public node may not keep that block: not a CRYPY finding.
      }
    }
    note(
      "batch-balance",
      chain,
      "3 addresses, 1 token",
      r,
      mismatches.length ? "finding" : d.prices ? "ok" : "partial",
      [mismatches.join("; "), d.prices ? "" : "no prices", slowNote(r)].filter(Boolean).join("; "),
    );
  }
}

// ---- Run ------------------------------------------------------------------------------------------------------------
console.log(`CRYPY audit against ${BASE} (${new Date().toISOString()})\n`);
for (const step of [
  auditSearch,
  auditPortfolio,
  auditApprovals,
  auditActivity,
  auditTokens,
  auditTransactions,
  auditGas,
  auditBlocks,
  auditBatch,
]) {
  try {
    await step();
  } catch (error) {
    note(step.name, "all", "audit step", null, "error", `audit script error: ${error.message}`);
  }
}

const count = (v) => results.filter((r) => r.verdict === v).length;
const times = results
  .map((r) => r.ms)
  .filter((x) => typeof x === "number")
  .sort((a, b) => a - b);
const p95 = times.length ? times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] : null;
const lines = [
  `# CRYPY audit — ${new Date().toISOString()}`,
  "",
  `Against ${BASE}. ${results.length} cases: ${count("ok")} ok, ${count("partial")} partial, ${count("finding")} findings, ${count("error")} errors. 95% of answers within ${p95 ?? "—"} ms.`,
  "",
  "| Result | Feature | Chain | Case | Time | Detail |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results
    .sort(
      (a, b) =>
        ["error", "finding", "partial", "ok"].indexOf(a.verdict) -
        ["error", "finding", "partial", "ok"].indexOf(b.verdict),
    )
    .map(
      (r) =>
        `| ${r.verdict} | ${r.feature} | ${r.chain} | ${r.input} | ${r.ms ?? "—"} ms | ${String(r.detail).replace(/\|/g, "/")} |`,
    ),
];
writeFileSync("audit-report.md", lines.join("\n") + "\n");
writeFileSync("audit-report.json", JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
console.log(
  `\n${results.length} cases: ${count("ok")} ok, ${count("partial")} partial, ${count("finding")} findings, ${count("error")} errors. Report: audit-report.md`,
);
