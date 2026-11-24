# Batch Balance Scanner — "never a failed result" design (S2 Part A and A.2)

Status: proposal for the owner (2026-11-24). Nothing is built until it is approved; the screens get their own visual
design for approval.

## 1. The promise

A visitor never sees a "failed" row while any way to read it remains. Every row ends as **read**, **not on this
chain** (the token doesn't exist there) or, only in a real multi-provider outage, **still being read** with the scan
continuing by itself. Wrong input never reaches the scan: it is caught while typing.

## 2. Why scans fail today (from the code, 2026-11-24)

1. A "please wait" (429) longer than 10 s is treated as failure; the limit is 40 requests a minute per visitor and a
   big scan sends 25+ requests at once.
2. One retry, 1.5 s later.
3. One request reads 100 wallets × up to 7 assets; if it times out, all 100 rows fail.
4. All chains and the token checks start in the same second: a burst that hits CRYPY's and Cloudflare's limits.
5. Every batch of a chain is read at the block of its first batch. Ordinary (non-archive) nodes keep only about
   128 recent blocks: on BNB Chain that is under 2 minutes, so later batches of a long scan can ask for a block the
   node no longer has. (To confirm in the reproduction test; this explains failures that disappear on a rescan.)

## 3. Where a scan runs

| Mode                                    | Who reads                                        | Privacy                                         | Limit (to set after load tests) | Cost to CRYPY       |
| --------------------------------------- | ------------------------------------------------ | ----------------------------------------------- | ------------------------------- | ------------------- |
| **CRYPY server** (default)              | the background worker, through CRYPY's providers | visitors' IP and list never reach node services | free tier, e.g. ~1,000 wallets  | provider capacity   |
| **In my browser** (opt-in, always free) | the visitor's browser, keyless public nodes      | IP and list go to public nodes (stated first)   | ~10,000 (keeps the tab smooth)  | none                |
| **Premium (later)**                     | server, priority lane; later CRYPY's own nodes   | private                                         | much larger                     | covered by the plan |

Both modes use **one shared scan engine** (same code), so behaviour and results match.

## 4. The scan engine: how a row is always read

For each chain, work is split into small tasks. Each task goes down this ladder until it succeeds:

1. **Next provider.** Providers ranked by recent health for this method; a failing one rests briefly (existing
   rotation, plus a health score per provider in S3). Empty or broken answers count as failures (B-001, B-010).
2. **Smaller batch.** A batch that times out is split in half, down to single wallets. A batch size that works is
   remembered per provider.
3. **Simpler method.** If a multicall keeps failing, plain `eth_getBalance` / `balanceOf` per wallet.
4. **Respect "slow down".** A 429 or Retry-After pauses that provider only, for as long as it asks; other providers
   continue. Never counted as a failure.
5. **Server fallback (browser mode).** Rows the public nodes can't read after a few minutes can be finished on
   CRYPY's server with one click (or automatically if the visitor allowed it).
6. **Keep going.** If every provider of a chain is down, that chain pauses and retries with growing waits (5 s →
   60 s) while the other chains finish. The row says "still being read" with the reason, never "failed". Only after
   a long outage (about 10 minutes) does the scan say which rows couldn't be read yet, with **Retry** and, for
   server scans, "we'll keep trying for the next hour: come back or keep this tab open".

## 5. Consistent and correct results

- **Block per chain:** each batch records the block it was read at. If a node no longer has the pinned block, the
  batch is read at the newest block instead of failing, and the results say "read between blocks X and Y (about
  N seconds)". Archive reads (exact one-block snapshots) are a premium feature later.
- **Cross-check:** a sample (about 2%, at least 5 wallets per chain) is read again from a different provider at the
  same block. A mismatch re-reads that batch elsewhere; persistent disagreement is shown, never hidden.
- **Prices are separate:** a missing price never blocks balances; prices are retried on their own and the total says
  which tokens have no price.
- **Wallet or contract:** read in the same task; if that part alone fails, the row shows the balance and "type not
  read" instead of failing.

## 6. Input checks before the scan (no failures by design)

- Invalid, duplicate and mistyped-checksum lines are caught while typing (already built).
- Each token is checked once per chain before the scan (one request per token and chain, cached). A token that
  doesn't exist on a chain shows "not on this chain", never a failure.
- The visitor sees the size of the job and the expected time before starting.

## 7. Server safety (thousands of visitors)

- Scans run in the background worker, never in the website process; moved to the separate worker service in S4.
- Hard caps: scans running at once; the share of each provider's capacity scans may use (pages keep theirs); queue
  length. When the queue is full: "Very busy right now — your scan starts in about N minutes" or "scan in your
  browser instead", never an error page.
- One active scan per visitor; a daily wallet allowance per IP (anonymous) or per signed-in wallet.
- A scan is one job: one request to start, then progress polling that doesn't count against limits; the Cloudflare
  `/api/` rule never sees a burst.
- The same address + chain + block read by several scans is read once (short cache).
- Lists live in memory only while the scan runs, deleted at the end or after 1 hour, never logged. The privacy page
  wording is updated with it.

## 8. What the visitor sees (visual design to approve)

- Before: job size, chains, tokens, expected time, mode (server / my browser).
- During: progress per chain, rows filling in, status per chain ("reading", "waiting for BNB Chain nodes, retrying",
  "queued: starts in about 2 min"), Pause / Cancel, results usable and exportable at any time.
- After a refresh or closing the tab (server mode): the scan continues; reopening the page shows it.
- Finished: totals, block range per chain, the cross-check result, and only if needed the short list of rows still
  being read, with what CRYPY is doing about them.

## 9. How it's proven before release

- **Reproduce first:** the owner's case (500 wallets × 5 chains × 6 tokens) on the current code, to confirm the
  causes above. That test must then pass on the new code.
- **Fault tests (automatic, stand-in nodes):** a node that times out, answers 429 with long waits, answers empty or
  wrong data, loses old blocks, or goes down mid-scan; all nodes of a chain down for 2 minutes. Every row must end
  read and correct.
- **Live load tests (staging):** the owner's case 10 times in a row; 10,000 wallets on BNB Chain; about 100 scans at
  once, with the website staying fast (pages measured during the test).
- Browser mode: the same fault tests in a real browser.
- Limits are set from these measurements, then written into the tool page.
