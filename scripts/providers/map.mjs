#!/usr/bin/env node
/**
 * Provider capability map (stabilization S3). For every node provider CRYPY uses (or might add), measures what it
 * actually supports, so routing and the list of providers rest on facts:
 *   chain    right chain id
 *   speed    median of 3 eth_blockNumber calls
 *   batch    largest JSON-RPC batch it answers in full (1, 3, 10, 20)
 *   archive  a balance 100,000 blocks back (needed for past prices, failure replays, approvals' "before" values)
 *   logs     token events of one contract over 1,000 recent blocks (activity, approvals' recent events)
 *   wide     Transfer events of every contract over 50 blocks (the alerts checker's wallet-wide search)
 *
 * Read-only, public data only. URLs are never printed: host names only (keys live in the path or query).
 * Run:  node scripts/providers/map.mjs [--candidates] [--md]
 *   reads .env.local's ALCHEMY_API_KEY and <CHAIN>_RPC_URLS when present, plus CRYPY's public nodes;
 *   --candidates also tests keyless public nodes CRYPY doesn't use yet; --md prints a Markdown table.
 */
import { existsSync, readFileSync } from "node:fs";

const CHAINS = {
  ethereum: {
    id: 1,
    env: "ETH_RPC_URLS",
    alchemy: "eth-mainnet",
    token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    public: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    candidates: [
      "https://eth.llamarpc.com",
      "https://1rpc.io/eth",
      "https://rpc.mevblocker.io",
      "https://eth.merkle.io",
    ],
  },
  bsc: {
    id: 56,
    env: "BSC_RPC_URLS",
    alchemy: "bnb-mainnet",
    token: "0x55d398326f99059fF775485246999027B3197955",
    public: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
    candidates: ["https://bsc.drpc.org", "https://1rpc.io/bnb", "https://bsc-dataseed1.defibit.io"],
  },
  base: {
    id: 8453,
    env: "BASE_RPC_URLS",
    alchemy: "base-mainnet",
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    public: ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.drpc.org"],
    candidates: ["https://1rpc.io/base", "https://base.llamarpc.com"],
  },
  arbitrum: {
    id: 42161,
    env: "ARBITRUM_RPC_URLS",
    alchemy: "arb-mainnet",
    token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    public: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
    candidates: ["https://arbitrum.drpc.org", "https://1rpc.io/arb"],
  },
  polygon: {
    id: 137,
    env: "POLYGON_RPC_URLS",
    alchemy: "polygon-mainnet",
    token: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    public: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
    candidates: ["https://polygon-rpc.com", "https://1rpc.io/matic"],
  },
};
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const args = new Set(process.argv.slice(2));

function envFile() {
  const values = {};
  if (!existsSync(".env.local")) return values;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

/** Host only, never the path or query (keys live there). */
const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "invalid URL";
  }
};

async function rpc(url, body, timeout = 8_000) {
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}, not JSON`);
  }
  return { json, ms: Date.now() - started, status: res.status };
}

const call = (method, params = [], id = 1) => ({ jsonrpc: "2.0", id, method, params });
/** A short, key-free reason: the node's own error message, cut. */
const reason = (error) =>
  String(error?.message ?? error)
    .replace(/https?:\/\/\S+/g, "<url>")
    .slice(0, 60);

async function single(url, method, params, timeout) {
  const { json, ms } = await rpc(url, call(method, params), timeout);
  if (json.error) throw new Error(json.error.message ?? "error");
  if (json.result === undefined) throw new Error("no result");
  return { result: json.result, ms };
}

async function probe(chain, url) {
  const row = { host: host(url) };
  try {
    const { result } = await single(url, "eth_chainId");
    row.answers = Number(result) === chain.id ? "yes" : `wrong chain (${Number(result)})`;
  } catch (e) {
    row.answers = `no: ${reason(e)}`;
    return row;
  }
  const times = [];
  let head = 0;
  for (let i = 0; i < 3; i++) {
    try {
      const { result, ms } = await single(url, "eth_blockNumber");
      times.push(ms);
      head = Number(result);
    } catch {
      /* counted as missing */
    }
  }
  times.sort((a, b) => a - b);
  row.speed = times.length ? `${times[Math.floor(times.length / 2)]} ms` : "failed";

  row.batch = "1";
  for (const size of [3, 10, 20]) {
    try {
      const body = Array.from({ length: size }, (_, i) => call("eth_blockNumber", [], i + 1));
      const { json } = await rpc(url, body);
      const full = Array.isArray(json) && json.length === size && json.every((r) => r.result !== undefined);
      if (!full) break;
      row.batch = String(size);
    } catch {
      break;
    }
  }

  try {
    // 100,000 blocks back: far past the ~128 recent states a full node keeps, so only archive nodes answer.
    await single(url, "eth_getBalance", [chain.token, `0x${Math.max(1, head - 100_000).toString(16)}`]);
    row.archive = "yes";
  } catch (e) {
    row.archive = `no (${reason(e)})`;
  }

  const hex = (n) => `0x${Math.max(0, n).toString(16)}`;
  try {
    const { result } = await single(
      url,
      "eth_getLogs",
      [{ address: chain.token, topics: [TRANSFER], fromBlock: hex(head - 1000), toBlock: hex(head) }],
      15_000,
    );
    row.logs = `1,000 blocks (${result.length} events)`;
  } catch (e) {
    try {
      await single(url, "eth_getLogs", [
        { address: chain.token, topics: [TRANSFER], fromBlock: hex(head - 100), toBlock: hex(head) },
      ]);
      row.logs = `100 blocks only (${reason(e)})`;
    } catch (e2) {
      row.logs = `no (${reason(e2)})`;
    }
  }

  try {
    const { result } = await single(
      url,
      "eth_getLogs",
      [{ topics: [TRANSFER], fromBlock: hex(head - 50), toBlock: hex(head) }],
      15_000,
    );
    row.wide = `yes (${result.length} events)`;
  } catch (e) {
    row.wide = `no (${reason(e)})`;
  }
  return row;
}

const env = envFile();
const rows = [];
for (const [key, chain] of Object.entries(CHAINS)) {
  const urls = [];
  if (env.ALCHEMY_API_KEY)
    urls.push({ kind: "alchemy", url: `https://${chain.alchemy}.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` });
  for (const url of (env[chain.env] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean))
    urls.push({ kind: "extra", url });
  for (const url of chain.public) urls.push({ kind: "public", url });
  if (args.has("--candidates")) for (const url of chain.candidates) urls.push({ kind: "candidate", url });
  const results = await Promise.all(
    urls.map(async ({ kind, url }) => ({ chain: key, kind, ...(await probe(chain, url)) })),
  );
  rows.push(...results);
  if (!args.has("--md"))
    for (const r of results)
      console.log(
        `${key.padEnd(9)} ${r.kind.padEnd(9)} ${r.host.padEnd(36)} answers:${r.answers} speed:${r.speed ?? "-"} batch:${r.batch ?? "-"} archive:${r.archive ?? "-"} logs:${r.logs ?? "-"} wide:${r.wide ?? "-"}`,
      );
}
if (args.has("--md")) {
  console.log("| Chain | Kind | Provider | Answers | Speed | Batch | Old blocks | Token events | Wallet-wide events |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows)
    console.log(
      `| ${r.chain} | ${r.kind} | ${r.host} | ${r.answers} | ${r.speed ?? "-"} | ${r.batch ?? "-"} | ${r.archive ?? "-"} | ${r.logs ?? "-"} | ${r.wide ?? "-"} |`,
    );
}
