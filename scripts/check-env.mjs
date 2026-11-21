#!/usr/bin/env node
/**
 * Checks .env.local without ever printing secret values.
 * Run: pnpm env:check
 *
 * Reports: whether the file exists (and common Windows naming mistakes), each key's status
 * (missing / empty / duplicated / wrong format), and a live test of the Alchemy key on
 * Ethereum and BNB Chain.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ok = (text) => console.log(`  OK    ${text}`);
const bad = (text) => console.log(`  FIX   ${text}`);
const info = (text) => console.log(`  INFO  ${text}`);
let problems = 0;
const problem = (text) => {
  problems += 1;
  bad(text);
};

console.log("\nCRYPY environment check (values are never shown)\n");

// 1. Is this the project folder?
if (!existsSync(join(root, "package.json"))) {
  problem("Run this inside the project folder (the one with package.json).");
  process.exit(1);
}

// 2. Find the file, and catch common naming mistakes.
const envPath = join(root, ".env.local");
const lookalikes = readdirSync(root).filter(
  (name) => /^\.?env/i.test(name) && name !== ".env.local" && name !== ".env.example",
);
if (!existsSync(envPath)) {
  problem(".env.local was not found in this folder.");
  for (const name of lookalikes) info(`Found "${name}". If this holds your keys, rename it to exactly .env.local`);
  info("Create it with:  Copy-Item .env.example .env.local   then add your keys.");
  process.exit(1);
}
ok(".env.local found");
for (const name of lookalikes) {
  info(`Also found "${name}". Next.js ignores this unless it is .env.local (or another standard .env name).`);
}

// 3. Parse lines (Next.js uses the same KEY=value format).
const raw = readFileSync(envPath, "utf8");
if (raw.charCodeAt(0) === 0xfeff) info("File starts with a hidden BOM character; usually harmless.");
const entries = new Map(); // key -> array of values (in order)
for (const [index, line] of raw.split(/\r?\n/).entries()) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed.replace(/^﻿/, ""));
  if (!match) {
    problem(`Line ${index + 1} is not in KEY=value form (the value is hidden).`);
    continue;
  }
  let value = match[2];
  if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
  else value = value.replace(/\s+#.*$/, "");
  const list = entries.get(match[1]) ?? [];
  list.push(value);
  entries.set(match[1], list);
}

function checkKey(name, pattern, hint) {
  const values = entries.get(name);
  if (!values) {
    problem(`${name} is missing.`);
    return undefined;
  }
  if (values.length > 1) {
    problem(`${name} appears ${values.length} times. Next.js uses only one of them; keep a single line.`);
  }
  const value = values.at(-1) ?? "";
  if (!value) {
    problem(`${name} is empty${values.some(Boolean) ? " on its last line (an earlier line has a value)" : ""}.`);
    return undefined;
  }
  if (value !== value.trim()) problem(`${name} has spaces around the value.`);
  if (!pattern.test(value.trim())) {
    problem(`${name} has the wrong format (${value.length} characters). ${hint}`);
    return undefined;
  }
  ok(`${name} is set (${value.length} characters)`);
  return value.trim();
}

console.log("\nKeys:");
const alchemyKey = checkKey("ALCHEMY_API_KEY", /^[A-Za-z0-9_-]{16,64}$/, "Copy the API key from your Alchemy app.");
checkKey(
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  /^[a-f0-9]{32}$/,
  "It must be the 32-character Project ID from Reown Cloud (lowercase letters a–f and digits).",
);

// Extra free providers (comma-separated https URLs). Only the host name is ever printed.
const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};
const extraLists = {};
const chainLabel = {
  ETH_RPC_URLS: "Ethereum",
  BSC_RPC_URLS: "BNB Chain",
  BASE_RPC_URLS: "Base",
  ARBITRUM_RPC_URLS: "Arbitrum",
  POLYGON_RPC_URLS: "Polygon",
};
for (const [name, legacy] of [
  ["ETH_RPC_URLS", "ETH_RPC_URL_FALLBACK"],
  ["BSC_RPC_URLS", "BSC_RPC_URL_FALLBACK"],
  ["BASE_RPC_URLS", "BASE_RPC_URLS"],
  ["ARBITRUM_RPC_URLS", "ARBITRUM_RPC_URLS"],
  ["POLYGON_RPC_URLS", "POLYGON_RPC_URLS"],
]) {
  const values = [...(entries.get(name) ?? []), ...(legacy !== name ? (entries.get(legacy) ?? []) : [])].filter(
    Boolean,
  );
  const urls = values.flatMap((value) => value.split(",").map((part) => part.trim())).filter(Boolean);
  if ((entries.get(name)?.length ?? 0) > 1)
    problem(`${name} appears more than once. Put all URLs on one line, separated by commas.`);
  const bad = urls.filter((url) => !/^https:\/\//.test(url) || !hostOf(url));
  if (bad.length) problem(`${name}: ${bad.length} entry(ies) are not https URLs.`);
  extraLists[name] = urls.filter((url) => !bad.includes(url));
  if (extraLists[name].length)
    ok(`${name}: ${extraLists[name].length} extra provider(s): ${extraLists[name].map(hostOf).join(", ")}`);
  else info(`${name} not set (optional): extra free providers for ${chainLabel[name]}.`);
}

/** Speed label for one request from this computer. Each page needs about 3 rounds, so ~3× this is added. */
function speed(ms) {
  const label = ms < 400 ? "fast" : ms < 1000 ? "ok" : "slow";
  return `${ms} ms, ${label}`;
}

// 4. Live Alchemy test (one cheap request per network). The key goes only to Alchemy over HTTPS.
if (alchemyKey) {
  console.log("\nAlchemy live test:");
  const networks = [
    ["Ethereum", "eth-mainnet"],
    ["BNB Chain", "bnb-mainnet"],
    ["Base", "base-mainnet"],
    ["Arbitrum", "arb-mainnet"],
    ["Polygon", "polygon-mainnet"],
  ];
  for (const [label, network] of networks) {
    try {
      const started = Date.now();
      const response = await fetch(`https://${network}.g.alchemy.com/v2/${alchemyKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.result === "string") {
        ok(`${label}: working (latest block ${BigInt(body.result).toString()}, ${speed(Date.now() - started)})`);
      } else if (response.status === 401 || response.status === 403) {
        problem(
          `${label}: Alchemy refused the key or this network is not enabled for your app (HTTP ${response.status}).`,
        );
      } else {
        problem(`${label}: Alchemy answered HTTP ${response.status}. Check that this network is enabled for your app.`);
      }
    } catch {
      problem(`${label}: could not reach Alchemy (internet or firewall problem).`);
    }
  }
}

// 5. Live test of each extra provider: must answer and be on the right chain.
const expectedChain = {
  ETH_RPC_URLS: 1n,
  BSC_RPC_URLS: 56n,
  BASE_RPC_URLS: 8453n,
  ARBITRUM_RPC_URLS: 42161n,
  POLYGON_RPC_URLS: 137n,
};
for (const [name, urls] of Object.entries(extraLists)) {
  if (!urls.length) continue;
  console.log(`\n${name} live test:`);
  for (const url of urls) {
    try {
      const started = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.result !== "string") {
        problem(`${hostOf(url)}: no valid answer (HTTP ${response.status}). Check the URL or key.`);
      } else if (BigInt(body.result) !== expectedChain[name]) {
        problem(
          `${hostOf(url)}: this URL is for chain ${BigInt(body.result)}, not ${expectedChain[name]}. Check it is in the right list.`,
        );
      } else {
        ok(`${hostOf(url)}: working (${speed(Date.now() - started)})`);
      }
    } catch {
      problem(`${hostOf(url)}: could not reach it (internet, firewall or wrong URL).`);
    }
  }
}

// 6. Built-in free public nodes (used last). Read from src/config/chains.ts so the list stays in one place.
{
  const config = readFileSync(new URL("../src/config/chains.ts", import.meta.url), "utf8");
  const publicUrls = [...config.matchAll(/publicRpcUrls:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"(https:[^"]+)"/g)].map((u) => u[1]),
  );
  console.log("\nBuilt-in public nodes (speed from this computer):");
  for (const url of publicUrls) {
    try {
      const started = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.result === "string")
        ok(`${hostOf(url)}: working (${speed(Date.now() - started)})`);
      else info(`${hostOf(url)}: not answering right now (HTTP ${response.status}); CRYPY skips it automatically.`);
    } catch {
      info(`${hostOf(url)}: can't be reached from this computer; CRYPY skips it automatically.`);
    }
  }
}

console.log(
  problems === 0
    ? "\nAll good. Restart the site (Ctrl + C, then pnpm dev or pnpm start) so it picks up these values.\n"
    : `\n${problems} thing(s) to fix. After fixing, run this check again, then restart pnpm dev.\n`,
);
process.exit(problems === 0 ? 0 : 1);
