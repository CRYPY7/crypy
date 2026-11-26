#!/usr/bin/env node
// Measures what Alchemy really charges for its wallet (Portfolio) endpoints (INFRASTRUCTURE_DESIGN.md step R0).
// Alchemy documents that these costs scale with the number of networks per request, so CRYPY's budget meter needs the
// real numbers. This sends a fixed number of requests per variant, 2 minutes apart, and prints each variant's time
// window (UTC); the owner reads the compute units used in each window on the Alchemy dashboard.
//
//   cd /opt/crypy/app && node scripts/perf/alchemy-cost.mjs
//
// The key is read from .env.local (last ALCHEMY_API_KEY line, as Next.js does) and never printed.
import { readFileSync } from "node:fs";

const CALLS = 20;
const PAUSE_MS = 120_000;
const WALLET = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const FIVE = ["eth-mainnet", "bnb-mainnet", "base-mainnet", "arb-mainnet", "polygon-mainnet"];

const key = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .filter((l) => l.startsWith("ALCHEMY_API_KEY="))
  .map((l) =>
    l
      .slice("ALCHEMY_API_KEY=".length)
      .trim()
      .replace(/^["']|["']$/g, ""),
  )
  .filter(Boolean)
  .pop();
if (!key) {
  console.log("No ALCHEMY_API_KEY in .env.local (run this from /opt/crypy/app).");
  process.exit(1);
}

const variants = [
  ["Token Balances By Wallet, 1 network", "assets/tokens/balances/by-address", ["eth-mainnet"], {}],
  ["Token Balances By Wallet, 5 networks", "assets/tokens/balances/by-address", FIVE, {}],
  [
    "Tokens By Wallet (with names), 5 networks",
    "assets/tokens/by-address",
    FIVE,
    { withMetadata: true, withPrices: false },
  ],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = () => new Date().toISOString().slice(11, 19);

console.log(`Alchemy cost test: ${CALLS} requests per variant, ${PAUSE_MS / 60_000} minutes apart.\n`);
for (const [i, [name, path, networks, extra]] of variants.entries()) {
  if (i > 0) await sleep(PAUSE_MS);
  const start = clock();
  let ok = 0;
  let failed = 0;
  let ms = 0;
  for (let n = 0; n < CALLS; n++) {
    const t0 = performance.now();
    try {
      const r = await fetch(`https://api.g.alchemy.com/data/v1/${key}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addresses: [{ address: WALLET, networks }], includeNativeTokens: true, ...extra }),
        signal: AbortSignal.timeout(20_000),
      });
      await r.arrayBuffer();
      if (r.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    ms += performance.now() - t0;
    await sleep(500);
  }
  console.log(
    `${name}: ${ok} answered, ${failed} failed, ${(ms / CALLS / 1000).toFixed(2)} s each — between ${start} and ${clock()} UTC`,
  );
}
console.log("\nNow open the Alchemy dashboard's usage for today and note the compute units used in each time window.");
