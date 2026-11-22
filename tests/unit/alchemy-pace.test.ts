import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ALCHEMY_CU_PER_SECOND,
  ALCHEMY_PAUSE_MS,
  noteAlchemyLimited,
  reserveAlchemy,
  resetAlchemyPace,
  takeAlchemyNow,
} from "@/server/chains/evm/alchemy-pace";
import {
  type Provider,
  isCoolingDown,
  rankedFallback,
  resetCoolDown,
  resetRefusals,
  resetSpeeds,
  resetUsage,
} from "@/server/chains/evm/providers";

const T = 1_000_000;

describe("Alchemy per-second budget", () => {
  beforeEach(() => resetAlchemyPace(T));

  it("ordinary reads take what is there and are turned away when the second's budget is used", () => {
    let sent = 0;
    while (takeAlchemyNow(26, T)) sent += 1;
    expect(sent).toBe(Math.floor(ALCHEMY_CU_PER_SECOND / 26));
    // The budget refills over time: 100 ms later about a tenth is back.
    expect(takeAlchemyNow(20, T + 100)).toBe(true);
  });

  it("never allows more than one second's worth at once, however long it was quiet", () => {
    let units = 0;
    while (takeAlchemyNow(10, T + 600_000)) units += 10;
    expect(units).toBeLessThanOrEqual(ALCHEMY_CU_PER_SECOND);
  });

  it("Alchemy-only calls wait their turn, go before ordinary reads, and give up when the wait is too long", () => {
    while (takeAlchemyNow(10, T));
    const wait = reserveAlchemy(120, 4_000, T)!;
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(Math.ceil((120 / ALCHEMY_CU_PER_SECOND) * 1000));
    // The reservation put the budget into debt: ordinary reads can't jump ahead.
    expect(takeAlchemyNow(10, T + 10)).toBe(false);
    // A queue longer than the caller accepts: nothing reserved, the caller reports it as unavailable.
    expect(reserveAlchemy(2_000, 1_000, T)).toBeNull();
  });

  it("after Alchemy says 'too many requests', nothing is sent to it for a moment, then it's used again", () => {
    noteAlchemyLimited(T);
    expect(takeAlchemyNow(10, T + ALCHEMY_PAUSE_MS - 100)).toBe(false);
    expect(reserveAlchemy(10, 500, T + 100)).toBeNull();
    expect(takeAlchemyNow(10, T + ALCHEMY_PAUSE_MS + 1_000)).toBe(true);
  });
});

/** Fake JSON-RPC nodes on this machine (test fixtures only). */
const servers: Server[] = [];
const hits: Record<string, number> = {};
const status: Record<string, number | undefined> = {};

async function node(name: string, kind: Provider["kind"]): Promise<Provider> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      hits[name] = (hits[name] ?? 0) + 1;
      if (status[name]) {
        res.writeHead(status[name]!).end();
        return;
      }
      const parsed = JSON.parse(body);
      const one = (r: { id: number }) => ({ jsonrpc: "2.0", id: r.id, result: name });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(one) : one(parsed)));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  servers.push(server);
  return { name, kind, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let alchemy: Provider;
let pub: Provider;
beforeAll(async () => {
  alchemy = await node("alchemy", "alchemy");
  pub = await node("public", "public");
});
afterAll(() => servers.forEach((s) => s.close()));

describe("provider rotation with the Alchemy budget", () => {
  beforeEach(() => {
    resetAlchemyPace();
    resetSpeeds();
    resetCoolDown();
    resetUsage();
    resetRefusals();
    hits.alchemy = 0;
    hits.public = 0;
    status.alchemy = undefined;
  });
  const ask = (providers: Provider[]) =>
    rankedFallback(providers)({ chain: undefined, retryCount: 0 }).request({ method: "eth_blockNumber" });

  it("when Alchemy's second is used up, reads go to the next provider at once and Alchemy isn't benched", async () => {
    while (takeAlchemyNow(10));
    expect(await ask([alchemy, pub])).toBe("public");
    expect(hits).toMatchObject({ alchemy: 0, public: 1 });
    expect(isCoolingDown(alchemy)).toBe(false);
  });

  it("with budget available, Alchemy answers", async () => {
    expect(await ask([alchemy, pub])).toBe("alchemy");
  });

  it("Alchemy's 'too many requests' pauses it for about 2 s, not the minute used for outages", async () => {
    status.alchemy = 429;
    expect(await ask([alchemy, pub])).toBe("public");
    expect(isCoolingDown(alchemy)).toBe(false);
    expect(takeAlchemyNow(10)).toBe(false);
  });

  it("Alchemy-only reads (old blocks) wait for budget instead of failing", async () => {
    while (takeAlchemyNow(10));
    const started = Date.now();
    expect(await ask([alchemy])).toBe("alchemy");
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
  });
});
