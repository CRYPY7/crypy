import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "@/server/env";

/**
 * Outage drill (stabilization S2): makes reading a chain fail as if every provider were down, to check that pages
 * still show a result. Two operator-only switches, both off unless set in the server's own settings:
 * - CRYPY_FAULT_CHAINS (staging): these chains are down for everyone;
 * - CRYPY_FAULT_FILE (browser tests): lines "chain" or "chain:address" in that file, so one test can take a chain
 *   down for one address without touching the others running at the same time.
 */
export class ChainFaultError extends Error {
  constructor(chain: string) {
    super(`Outage drill: ${chain} is set as down`);
    this.name = "ChainFaultError";
  }
}

let fileCache: { at: number; lines: Set<string> } | null = null;

function fileFaults(): Set<string> {
  const path = serverEnv.CRYPY_FAULT_FILE;
  if (!path) return new Set();
  if (fileCache && Date.now() - fileCache.at < 500) return fileCache.lines;
  let lines = new Set<string>();
  try {
    lines = new Set(
      readFileSync(join(/* turbopackIgnore: true */ process.cwd(), path), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean),
    );
  } catch {
    // No file: nothing is down.
  }
  fileCache = { at: Date.now(), lines };
  return lines;
}

/** Throws when this chain (or this chain for this address or token) is set as down by an outage drill. */
export function assertChainUp(chain: string, subject?: string): void {
  if (serverEnv.CRYPY_FAULT_CHAINS.includes(chain)) throw new ChainFaultError(chain);
  const faults = fileFaults();
  if (faults.size === 0) return;
  if (faults.has(chain) || (subject && faults.has(`${chain}:${subject.toLowerCase()}`)))
    throw new ChainFaultError(chain);
}

if (serverEnv.CRYPY_FAULT_CHAINS.length > 0)
  console.warn(
    `[crypy] outage drill on: ${serverEnv.CRYPY_FAULT_CHAINS.join(", ")} treated as down (CRYPY_FAULT_CHAINS)`,
  );
